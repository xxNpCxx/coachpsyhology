import { pool } from '../config.js';
import { cache } from '../utils/cache.js';

/**
 * Изолированный слой работы с результатами тестов в БД
 * Включает кеширование для оптимизации производительности
 */

export class TestsPG {
  // Сохранение результатов теста
  async saveTestResults(userId, archetypeScores) {
    try {
      console.log('💾 Сохраняем результаты теста для пользователя:', userId);
      
      // Сортируем архетипы по баллам
      const sortedArchetypes = Array.from(archetypeScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4); // Берем топ-4

      // Сумма баллов топ-4 архетипов
      const topSum = sortedArchetypes.reduce((acc, [_, score]) => acc + score, 0) || 1;

      // Сохраняем каждый результат с позицией
      for (let i = 0; i < sortedArchetypes.length; i++) {
        const [archetypeName, score] = sortedArchetypes[i];
        const percentage = Math.round((score / topSum) * 100);
        
        await pool.query(`
          INSERT INTO test_results (user_id, archetype_name, score, percentage, position)
          VALUES ($1::bigint, $2, $3, $4, $5)
        `, [userId, archetypeName, score, percentage, i + 1]);
      }

      // Инвалидируем кеш результатов для этого пользователя
      cache.invalidateUser(userId);
      
      console.log('✅ Результаты теста сохранены');
    } catch (error) {
      console.error('❌ Ошибка saveTestResults:', error);
      throw error;
    }
  }

  // Сохранение ответов на вопросы
  async saveQuestionAnswers(userId, answers) {
    try {
      console.log('💾 Сохраняем ответы на вопросы для пользователя:', userId);
      
      // Удаляем старые ответы пользователя
      await pool.query('DELETE FROM question_answers WHERE user_id = $1::bigint', [userId]);

      // Сохраняем новые ответы
      for (const answer of answers) {
        await pool.query(`
          INSERT INTO question_answers (user_id, question_index, answer_value, archetype)
          VALUES ($1::bigint, $2, $3, $4)
        `, [userId, answer.questionIndex, answer.answer, answer.archetype]);
      }
      
      console.log('✅ Ответы на вопросы сохранены');
    } catch (error) {
      console.error('❌ Ошибка saveQuestionAnswers:', error);
      throw error;
    }
  }

  // Получение последних результатов теста пользователя
  async getLatestTestResults(userId) {
    try {
      console.log(`🔍 [ТЕСТ] getLatestTestResults для user_id: ${userId} (тип: ${typeof userId})`);
      
      // Проверяем кеш
      const cached = cache.getTestResults(userId);
      if (cached) {
        console.log(`📋 [КЕША] Результаты из кеша: ${cached.length}`);
        return cached;
      }

      // Получаем дату последнего теста
      const latestTest = await pool.query(`
        SELECT created_at FROM test_results 
        WHERE user_id = $1::bigint 
        ORDER BY created_at DESC 
        LIMIT 1
      `, [userId]);

      console.log(`📊 [ТЕСТ] Найдено записей: ${latestTest.rows.length}`);

      if (latestTest.rows.length === 0) {
        console.log(`⚠️ [ТЕСТ] Нет результатов для user_id: ${userId}`);
        return [];
      }

      const latestDate = latestTest.rows[0].created_at;
      console.log(`📅 [ТЕСТ] Последняя дата: ${latestDate}`);

      // Получаем результаты последнего теста
      console.log(`🔍 [ТЕСТ] SQL запрос: user_id=${userId}, date=${latestDate}`);
      const result = await pool.query(`
        SELECT * FROM test_results 
        WHERE user_id = $1::bigint AND DATE(created_at) = DATE($2)
        ORDER BY position ASC
      `, [userId, latestDate]);
      
      console.log(`✅ [ТЕСТ] Получено результатов: ${result.rows.length}`);
      
      // Дополнительная диагностика
      if (result.rows.length === 0) {
        console.log(`🔍 [ТЕСТ] Проверяем все записи для user_id=${userId}:`);
        const allResults = await pool.query(`
          SELECT user_id, archetype_name, created_at, DATE(created_at) as date_only
          FROM test_results 
          WHERE user_id = $1::bigint
          ORDER BY created_at DESC
        `, [userId]);
        console.log(`📊 [ТЕСТ] Все записи:`, allResults.rows);
      }
      if (result.rows.length > 0) {
        console.log(`🎯 [ТЕСТ] Результаты:`, result.rows.map(r => `${r.archetype_name}: ${r.percentage}%`).join(', '));
      }

      // Кешируем результаты
      cache.setTestResults(userId, result.rows);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка getLatestTestResults:', error);
      throw error;
    }
  }

  // Получение результатов теста пользователя
  async getUserTestResults(userId) {
    try {
      const result = await pool.query(`
        SELECT * FROM test_results 
        WHERE user_id = $1::bigint 
        ORDER BY created_at DESC, position ASC
        LIMIT 20
      `, [userId]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка getUserTestResults:', error);
      throw error;
    }
  }

  // Получение ответов на вопросы пользователя
  async getUserAnswers(userId) {
    try {
      const result = await pool.query(`
        SELECT * FROM question_answers 
        WHERE user_id = $1::bigint 
        ORDER BY question_index ASC
      `, [userId]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка getUserAnswers:', error);
      throw error;
    }
  }

  // Получение полной информации о пользователе с результатами
  async getUserWithDetails(userId) {
    try {
      // Получаем базовую информацию о пользователе
      const userResult = await pool.query(`
        SELECT * FROM users WHERE telegram_id = $1::bigint
      `, [userId]);

      if (userResult.rows.length === 0) {
        return null;
      }

      const user = userResult.rows[0];
      const testResults = await this.getLatestTestResults(userId);

      // Количество пройденных тестов
      const testCountResult = await pool.query(`
        SELECT COUNT(DISTINCT DATE(created_at)) as test_count
        FROM test_results 
        WHERE user_id = $1::bigint
      `, [userId]);

      // Статистика ответов
      const answersStats = await pool.query(`
        SELECT 
          COUNT(*) as total_answers,
          AVG(answer_value) as avg_answer,
          COUNT(DISTINCT question_index) as questions_answered
        FROM question_answers 
        WHERE user_id = $1::bigint
      `, [userId]);

      return {
        user,
        testResults,
        testCount: testCountResult.rows[0]?.test_count || 0,
        answersStats: answersStats.rows[0] || {}
      };
    } catch (error) {
      console.error('❌ Ошибка getUserWithDetails:', error);
      throw error;
    }
  }
}

// Экспорт singleton instance
export const testsPG = new TestsPG();