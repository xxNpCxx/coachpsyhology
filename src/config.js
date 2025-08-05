import dotenv from 'dotenv';
import { Pool } from 'pg';

// Загрузка переменных окружения
dotenv.config();

// Конфигурация бота
export const BOT_TOKEN = process.env.BOT_TOKEN;
export const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
export const WEBHOOK_URL = process.env.WEBHOOK_URL;
export const COMMENT_GROUP_ID = process.env.COMMENT_GROUP_ID;
export const COMMENT_GROUP_LINK = process.env.COMMENT_GROUP_LINK;
export const REQUIRED_CHANNEL_ID = process.env.REQUIRED_CHANNEL_ID;
export const REQUIRED_CHANNEL_LINK = process.env.REQUIRED_CHANNEL_LINK;

// Конфигурация базы данных
export const pool = new Pool({
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

export default {
  BOT_TOKEN,
  ADMIN_USER_ID,
  WEBHOOK_URL,
  COMMENT_GROUP_ID,
  COMMENT_GROUP_LINK,
  REQUIRED_CHANNEL_ID,
  REQUIRED_CHANNEL_LINK,
  pool
};