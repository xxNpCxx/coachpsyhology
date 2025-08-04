const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Проверка подключения (только при первом запуске)
let connectionLogged = false;
pool.on('connect', () => {
  if (!connectionLogged) {
    console.log('✅ Подключение к PostgreSQL установлено');
    connectionLogged = true;
  }
});

pool.on('error', (err) => {
  console.error('❌ Ошибка подключения к PostgreSQL:', err);
});

module.exports = { pool }; 