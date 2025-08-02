require('dotenv').config();
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function checkMigrationStatus() {
  console.log('🔍 Проверка статуса миграций...');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL не настроен');
    process.exit(1);
  }

  try {
    // Проверяем подключение к БД
    const client = await pool.connect();
    console.log('✅ Подключение к базе данных установлено');

    // Проверяем существование таблицы миграций
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'migrations'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('⚠️ Таблица migrations не существует');
      console.log('💡 Запустите: npm run migrate');
      client.release();
      await pool.end();
      return;
    }

    // Получаем применённые миграции
    const appliedMigrations = await client.query('SELECT filename, applied_at FROM migrations ORDER BY applied_at');
    
    // Получаем все файлы миграций
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log('\n📋 Статус миграций:');
    console.log('─'.repeat(60));

    let allApplied = true;
    for (const file of migrationFiles) {
      const applied = appliedMigrations.rows.find(row => row.filename === file);
      
      if (applied) {
        const date = new Date(applied.applied_at).toLocaleString('ru-RU');
        console.log(`✅ ${file} - применена ${date}`);
      } else {
        console.log(`❌ ${file} - НЕ применена`);
        allApplied = false;
      }
    }

    console.log('─'.repeat(60));
    
    if (allApplied) {
      console.log('🎉 Все миграции применены!');
    } else {
      console.log('⚠️ Есть неприменённые миграции');
      console.log('💡 Запустите: npm run migrate');
    }

    // Показываем статистику
    console.log('\n📊 Статистика:');
    console.log(`   Всего файлов миграций: ${migrationFiles.length}`);
    console.log(`   Применено: ${appliedMigrations.rows.length}`);
    console.log(`   Ожидают применения: ${migrationFiles.length - appliedMigrations.rows.length}`);

    client.release();
    await pool.end();

  } catch (error) {
    console.error('❌ Ошибка проверки миграций:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Возможные решения:');
      console.log('   1. Проверьте правильность DATABASE_URL');
      console.log('   2. Убедитесь, что база данных запущена');
    }
    
    process.exit(1);
  }
}

// Запуск проверки
if (require.main === module) {
  checkMigrationStatus();
}

module.exports = { checkMigrationStatus }; 