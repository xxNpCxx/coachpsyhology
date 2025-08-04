import { pool } from '../config.js';
import { cache } from '../utils/cache.js';

/**
 * Изолированный слой работы с пользователями в БД
 * Включает кеширование для оптимизации производительности
 */

export class UsersPG {
  // Создание или обновление пользователя
  async upsertUser(ctx) {
    const u = ctx.from;
    try {
      const result = await pool.query(`
        INSERT INTO users (telegram_id, username, first_name, last_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (telegram_id) DO UPDATE
        SET username = EXCLUDED.username,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [u.id, u.username, u.first_name, u.last_name]);
      
      const user = result.rows[0];
      
      // Кешируем пользователя
      cache.setUser(u.id, user);
      
      return user;
    } catch (err) {
      console.error('[users][pg] Ошибка upsertUser:', err);
      throw err;
    }
  }

  // Получение пользователя по Telegram ID
  async getUserByTelegramId(telegramId) {
    try {
      // Проверяем кеш
      const cached = cache.getUser(telegramId);
      if (cached) {
        return cached;
      }

      const result = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1::bigint',
        [telegramId]
      );
      
      const user = result.rows[0] || null;
      
      // Кешируем результат
      if (user) {
        cache.setUser(telegramId, user);
      }
      
      return user;
    } catch (error) {
      console.error('❌ Ошибка getUserByTelegramId:', error);
      throw error;
    }
  }

  // Получение всех пользователей с пагинацией
  async getAllUsers(limit = 50, offset = 0) {
    try {
      const result = await pool.query(`
        SELECT * FROM users 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка getAllUsers:', error);
      throw error;
    }
  }

  // Проверка является ли пользователь администратором
  async isAdmin(telegramId) {
    console.log('🔐 Проверка админских прав:', telegramId);
    
    try {
      const user = await this.getUserByTelegramId(telegramId);
      
      if (!user) {
        console.log('❌ Пользователь не найден в БД, проверяем только ADMIN_USER_ID');
        // Если пользователя нет в БД, проверяем только переменную окружения
        const adminUserId = process.env.ADMIN_USER_ID;
        const isOwner = adminUserId && telegramId.toString() === adminUserId;
        return isOwner;
      }
      
      // Проверяем флаг is_admin в БД
      if (user.is_admin) {
        console.log('✅ Доступ к админ-панели разрешён:', telegramId);
        return true;
      }
      
      // Проверяем переменную окружения ADMIN_USER_ID
      const adminUserId = process.env.ADMIN_USER_ID;
      const isOwner = adminUserId && telegramId.toString() === adminUserId;
      
      if (isOwner) {
        console.log('✅ Доступ к админ-панели разрешён (env):', telegramId);
        return true;
      }
      
      console.log('❌ Доступ к админ-панели отклонён:', telegramId);
      return false;
    } catch (error) {
      console.error('❌ Ошибка isAdmin:', error);
      console.log('🔍 Fallback проверка ADMIN_USER_ID при ошибке БД');
      // Fallback: если БД недоступна, проверяем только переменную окружения
      const adminUserId = process.env.ADMIN_USER_ID;
      return adminUserId && telegramId.toString() === adminUserId;
    }
  }

  // Получение статистики пользователей
  async getUsersStats() {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_users,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_users,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as month_users
        FROM users
      `);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Ошибка getUsersStats:', error);
      throw error;
    }
  }
}

// Экспорт singleton instance
export const usersPG = new UsersPG();