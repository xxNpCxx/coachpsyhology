require('dotenv').config();
const { pool } = require('../config/database');

async function testDatabaseConnection() {
  console.log('🔍 Тестирование подключения к базе данных...');
  console.log('📡 URL:', process.env.DATABASE_URL ? 'Настроен' : 'НЕ НАСТРОЕН');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL не настроен в .env файле');
    process.exit(1);
  }

  try {
    // Тестируем подключение
    const client = await pool.connect();
    console.log('✅ Подключение к базе данных успешно!');
    
    // Проверяем версию PostgreSQL
    const versionResult = await client.query('SELECT version()');
    console.log('📊 Версия PostgreSQL:', versionResult.rows[0].version.split(' ')[1]);
    
    // Проверяем существующие таблицы
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('📋 Существующие таблицы:');
    if (tablesResult.rows.length === 0) {
      console.log('   (таблиц нет)');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }
    
    client.release();
    
    console.log('\n🎉 База данных готова к работе!');
    console.log('💡 Для создания таблиц выполните: npm run migrate');
    
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:');
    console.error('   ', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Возможные решения:');
      console.log('   1. Проверьте правильность DATABASE_URL в .env');
      console.log('   2. Убедитесь, что база данных запущена');
      console.log('   3. Проверьте настройки сети и firewall');
    } else if (error.code === '28P01') {
      console.log('\n💡 Ошибка аутентификации:');
      console.log('   1. Проверьте username и password в DATABASE_URL');
      console.log('   2. Убедитесь, что пользователь имеет права доступа');
    } else if (error.code === '3D000') {
      console.log('\n💡 База данных не существует:');
      console.log('   1. Создайте базу данных');
      console.log('   2. Проверьте правильность имени базы в DATABASE_URL');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Запуск теста
if (require.main === module) {
  testDatabaseConnection();
}

module.exports = { testDatabaseConnection }; 