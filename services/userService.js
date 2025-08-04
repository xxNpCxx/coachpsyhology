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
        'SELECT * FROM users WHERE telegram_id = $1::bigint',
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
    console.log('🔍 Проверка админских прав для пользователя:', telegramId);
    console.log('🔍 ADMIN_USER_ID из env:', process.env.ADMIN_USER_ID);
    
    try {
      const user = await this.getUserByTelegramId(telegramId);
      console.log('🔍 Пользователь из БД:', user ? `ID: ${user.telegram_id}, is_admin: ${user.is_admin}` : 'НЕ НАЙДЕН');
      
      if (!user) {
        console.log('❌ Пользователь не найден в БД, проверяем только ADMIN_USER_ID');
        // Если пользователя нет в БД, проверяем только переменную окружения
        const adminUserId = process.env.ADMIN_USER_ID;
        const isOwner = adminUserId && telegramId.toString() === adminUserId;
        console.log('🔍 Проверка владельца:', telegramId.toString(), '===', adminUserId, '=', isOwner);
        return isOwner;
      }
      
      // Проверяем флаг is_admin в БД
      if (user.is_admin) {
        console.log('✅ Пользователь админ по флагу в БД');
        return true;
      }
      
      // Проверяем переменную окружения ADMIN_USER_ID
      const adminUserId = process.env.ADMIN_USER_ID;
      const isOwner = adminUserId && telegramId.toString() === adminUserId;
      console.log('🔍 Проверка владельца:', telegramId.toString(), '===', adminUserId, '=', isOwner);
      
      if (isOwner) {
        console.log('✅ Пользователь админ по ADMIN_USER_ID');
        return true;
      }
      
      console.log('❌ Пользователь НЕ админ');
      return false;
    } catch (error) {
      console.error('❌ Ошибка isAdmin:', error);
      console.log('🔍 Fallback проверка ADMIN_USER_ID при ошибке БД');
      // Fallback: если БД недоступна, проверяем только переменную окружения
      const adminUserId = process.env.ADMIN_USER_ID;
      const isOwner = adminUserId && telegramId.toString() === adminUserId;
      console.log('🔍 Fallback проверка владельца:', telegramId.toString(), '===', adminUserId, '=', isOwner);
      return isOwner;
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

  // Получение расширенной информации о пользователях для админ-панели
  async getUsersWithDetails(limit = 50, offset = 0) {
    try {
      const users = await this.getAllUsers(limit, offset);
      const testResultService = require('./testResultService');
      
      // Получаем дополнительную информацию для каждого пользователя
      const usersWithDetails = await Promise.all(
        users.map(async (user) => {
          const userId = user.telegram_id;
          
          // Получаем последние результаты теста
          const latestResults = await testResultService.getLatestTestResults(userId);
          
          return {
            ...user,
            latestResults: latestResults || []
          };
        })
      );
      
      return usersWithDetails;
    } catch (error) {
      console.error('❌ Ошибка getUsersWithDetails:', error);
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
        WHERE telegram_id = $1::bigint
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