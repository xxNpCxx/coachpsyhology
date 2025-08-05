import { pool } from '../config.js';

/**
 * Изолированный слой работы с комментариями пользователей в группе
 * Отслеживает количество комментариев для проверки доступа к тесту
 */

export class CommentsPG {
  // Сохранение нового комментария
  async saveComment(userId, messageId, chatId, text, timestamp) {
    try {
      console.log(`💾 Сохраняем комментарий от пользователя ${userId} в чате ${chatId}`);
      
      await pool.query(`
        INSERT INTO comments (user_id, message_id, chat_id, text, created_at)
        VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5)
        ON CONFLICT (user_id, message_id, chat_id) DO NOTHING
      `, [userId, messageId, chatId, text, timestamp]);
      
      console.log('✅ Комментарий сохранен');
    } catch (error) {
      console.error('❌ Ошибка saveComment:', error);
      throw error;
    }
  }

  // Получение количества комментариев пользователя в группе
  async getUserCommentCount(userId, chatId) {
    try {
      console.log(`🔍 [БД] Подсчитываем комментарии пользователя ${userId} в чате ${chatId}`);
      
      const result = await pool.query(`
        SELECT COUNT(*) as comment_count
        FROM comments 
        WHERE user_id = $1::bigint AND chat_id = $2::bigint
      `, [userId, chatId]);
      
      const count = parseInt(result.rows[0]?.comment_count || 0);
      console.log(`📊 [БД] Количество комментариев: ${count}`);
      
      return count;
    } catch (error) {
      console.error('❌ [БД] Ошибка getUserCommentCount:', error);
      console.error('❌ [БД] Stack trace:', error.stack);
      
      // Если таблица не существует, возвращаем 0
      if (error.code === '42P01' && error.message.includes('comments')) {
        console.log('⚠️ [БД] Таблица comments не существует, возвращаем 0 комментариев');
        return 0;
      }
      
      throw error;
    }
  }

  // Получение количества пройденных тестов пользователя
  async getUserTestCount(userId) {
    try {
      console.log(`🔍 [БД] Подсчитываем тесты пользователя ${userId}`);
      
      const result = await pool.query(`
        SELECT COUNT(DISTINCT DATE(created_at)) as test_count
        FROM test_results 
        WHERE user_id = $1::bigint
      `, [userId]);
      
      const count = parseInt(result.rows[0]?.test_count || 0);
      console.log(`📊 [БД] Количество тестов: ${count}`);
      
      return count;
    } catch (error) {
      console.error('❌ [БД] Ошибка getUserTestCount:', error);
      console.error('❌ [БД] Stack trace:', error.stack);
      throw error;
    }
  }

  // Проверка возможности прохождения теста
  async canUserTakeTest(userId, chatId) {
    try {
      console.log(`🔍 [БД] Проверяем возможность прохождения теста для пользователя ${userId} в чате ${chatId}`);
      
      const [commentCount, testCount] = await Promise.all([
        this.getUserCommentCount(userId, chatId),
        this.getUserTestCount(userId)
      ]);
      
      // Пользователь может пройти тест, если количество комментариев >= (количество пройденных тестов + 1)
      // Первый тест: 0 тестов пройдено → нужно 1+ комментариев
      // Второй тест: 1 тест пройден → нужно 2+ комментариев
      // Третий тест: 2 теста пройдено → нужно 3+ комментариев
      const requiredComments = testCount + 1;
      const canTake = commentCount >= requiredComments;
      
      console.log(`📊 [БД] Результат проверки: комментарии=${commentCount}, тесты=${testCount}, нужно=${requiredComments}, можно=${canTake}`);
      
      return {
        canTake,
        commentCount,
        testCount,
        requiredComments
      };
    } catch (error) {
      console.error('❌ [БД] Ошибка canUserTakeTest:', error);
      console.error('❌ [БД] Stack trace:', error.stack);
      
      // Если таблица не существует, возвращаем fallback результат
      if (error.code === '42P01' && error.message.includes('comments')) {
        console.log('⚠️ [БД] Таблица comments не существует, возвращаем fallback');
        return {
          canTake: false, // Первый тест требует 1 комментарий
          commentCount: 0,
          testCount: 0,
          requiredComments: 1
        };
      }
      
      throw error;
    }
  }

  // Получение последних комментариев пользователя
  async getUserRecentComments(userId, chatId, limit = 5) {
    try {
      const result = await pool.query(`
        SELECT * FROM comments 
        WHERE user_id = $1::bigint AND chat_id = $2::bigint
        ORDER BY created_at DESC 
        LIMIT $3
      `, [userId, chatId, limit]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка getUserRecentComments:', error);
      throw error;
    }
  }

  // Удаление комментария (для админов)
  async deleteComment(userId, messageId, chatId) {
    try {
      const result = await pool.query(`
        DELETE FROM comments 
        WHERE user_id = $1::bigint AND message_id = $2::bigint AND chat_id = $3::bigint
      `, [userId, messageId, chatId]);
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('❌ Ошибка deleteComment:', error);
      throw error;
    }
  }

  // Получение статистики комментариев
  async getCommentStats(chatId) {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_comments,
          COUNT(DISTINCT user_id) as unique_users,
          MIN(created_at) as first_comment,
          MAX(created_at) as last_comment
        FROM comments 
        WHERE chat_id = $1::bigint
      `, [chatId]);
      
      return result.rows[0] || {};
    } catch (error) {
      console.error('❌ Ошибка getCommentStats:', error);
      throw error;
    }
  }

  // Получение топ активных пользователей
  async getTopActiveUsers(chatId, limit = 10) {
    try {
      const result = await pool.query(`
        SELECT 
          user_id,
          COUNT(*) as comment_count
        FROM comments 
        WHERE chat_id = $1::bigint
        GROUP BY user_id 
        ORDER BY comment_count DESC 
        LIMIT $2
      `, [chatId, limit]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка getTopActiveUsers:', error);
      throw error;
    }
  }
}

// Создаем экземпляр для экспорта
export const commentsPG = new CommentsPG();
