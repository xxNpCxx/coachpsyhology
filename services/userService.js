const { pool } = require('../config/database');

class UserService {
  // Создание или обновление пользователя
  async upsertUser(userData) {
    try {
      const { telegram_id, username, first_name, last_name, language_code } = userData;
      
      const result = await pool.query(`
        INSERT INTO users (telegram_id, username, first_name, last_name, language_code)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (telegram_id) DO UPDATE SET
          username = EXCLUDED.username,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          language_code = EXCLUDED.language_code,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [telegram_id, username, first_name, last_name, language_code]);
      
      return result.rows[0];
    } catch (error) {
      console.error('❌ Ошибка upsertUser:', error);
      throw error;
    }
  }

  // Получение пользователя по Telegram ID
  async getUserByTelegramId(telegramId) {
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Ошибка getUserByTelegramId:', error);
      throw error;
    }
  }

  // Проверка является ли пользователь администратором
  async isAdmin(telegramId) {
    try {
      const user = await this.getUserByTelegramId(telegramId);
      if (!user) return false;
      
      // Проверяем флаг is_admin в БД
      if (user.is_admin) return true;
      
      // Проверяем переменную окружения ADMIN_USER_ID
      const adminUserId = process.env.ADMIN_USER_ID;
      if (adminUserId && telegramId.toString() === adminUserId) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Ошибка isAdmin:', error);
      return false;
    }
  }

  // Получение списка всех пользователей
  async getAllUsers(limit = 50, offset = 0) {
    try {
      const result = await pool.query(`
        SELECT 
          u.*,
          COUNT(tr.id) as tests_count,
          MAX(tr.created_at) as last_test_date
        FROM users u
        LEFT JOIN test_results tr ON u.telegram_id = tr.user_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка getAllUsers:', error);
      throw error;
    }
  }

  // Получение статистики пользователей
  async getUsersStats() {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN is_admin = true THEN 1 END) as admin_users,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as new_users_week,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_users_month
        FROM users
      `);
      
      return result.rows[0];
    } catch (error) {
      console.error('❌ Ошибка getUsersStats:', error);
      throw error;
    }
  }

  // Поиск пользователей
  async searchUsers(query, limit = 20) {
    try {
      const searchQuery = `%${query}%`;
      const result = await pool.query(`
        SELECT * FROM users 
        WHERE 
          username ILIKE $1 OR 
          first_name ILIKE $1 OR 
          last_name ILIKE $1 OR
          telegram_id::text ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [searchQuery, limit]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка searchUsers:', error);
      throw error;
    }
  }

  // Назначение/снятие администратора
  async setAdminStatus(telegramId, isAdmin) {
    try {
      const result = await pool.query(`
        UPDATE users 
        SET is_admin = $2, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = $1
        RETURNING *
      `, [telegramId, isAdmin]);
      
      return result.rows[0];
    } catch (error) {
      console.error('❌ Ошибка setAdminStatus:', error);
      throw error;
    }
  }
}

module.exports = new UserService(); 