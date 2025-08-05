import { pool } from '../src/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureMigrationsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Таблица migrations создана/проверена');
  } catch (error) {
    console.error('❌ Ошибка создания таблицы migrations:', error);
    throw error;
  }
}

async function getAppliedMigrations() {
  try {
    const result = await pool.query('SELECT filename FROM migrations');
    return new Set(result.rows.map(row => row.filename));
  } catch (error) {
    console.error('❌ Ошибка получения применённых миграций:', error);
    return new Set();
  }
}

async function applyMigration(filename, sql) {
  try {
    await pool.query('BEGIN');
    await pool.query(sql);
    await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
    await pool.query('COMMIT');
    console.log(`✅ Миграция ${filename} применена`);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error(`❌ Ошибка применения миграции ${filename}:`, error);
    throw error;
  }
}

async function runMigrations() {
  try {
    console.log('🚀 Запуск миграций...');
    
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();
    
    const migrationsDir = path.join(__dirname);
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    console.log(`📁 Найдено ${files.length} SQL файлов миграций`);
    
    let appliedCount = 0;
    for (const file of files) {
      if (!applied.has(file)) {
        console.log(`📄 Применение миграции: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await applyMigration(file, sql);
        appliedCount++;
      } else {
        console.log(`⏭️ Миграция ${file} уже применена`);
      }
    }
    
    if (appliedCount > 0) {
      console.log(`✅ Применено ${appliedCount} новых миграций`);
    } else {
      console.log('✅ Все миграции уже применены');
    }
  } catch (error) {
    console.error('❌ Ошибка выполнения миграций:', error);
    throw error; // Пробрасываем ошибку вместо завершения процесса
  }
}

// Функция для запуска миграций из командной строки
async function runMigrationsAndExit() {
  try {
    await runMigrations();
    console.log('🎉 Миграции завершены успешно');
  } catch (error) {
    console.error('❌ Миграции завершились с ошибкой');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Запуск миграций
runMigrationsAndExit();

export { runMigrations }; 