const { pool } = require('../config/database');

class TestResultService {
  // Сохранение результатов теста
  async saveTestResults(userId, archetypeScores) {
    try {
      // Сортируем архетипы по баллам (по убыванию)
      const sortedArchetypes = Array.from(archetypeScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4); // Берем топ-4

      // Сумма баллов топ-4 архетипов
      const topSum = sortedArchetypes.reduce((acc, [_, score]) => acc + score, 0) || 1;

      // Сохраняем каждый результат
      for (let i = 0; i < sortedArchetypes.length; i++) {
        const [archetypeName, score] = sortedArchetypes[i];
        const percentage = Math.round((score / topSum) * 100);
        const position = i + 1;

        await pool.query(`
          INSERT INTO test_results (user_id, archetype_name, score, percentage, position)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, archetypeName, score, percentage, position]);
      }

      return sortedArchetypes;
    } catch (error) {
      console.error('❌ Ошибка saveTestResults:', error);
      throw error;
    }
  }

  // Сохранение ответов на вопросы
  async saveQuestionAnswers(userId, answers) {
    try {
      for (const answer of answers) {
        await pool.query(`
          INSERT INTO question_answers (user_id, question_index, answer_value, archetype)
          VALUES ($1, $2, $3, $4)
        `, [userId, answer.questionIndex, answer.answer, answer.archetype]);
      }
    } catch (error) {
      console.error('❌ Ошибка saveQuestionAnswers:', error);
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

  // Получение последних результатов теста пользователя
  async getLatestTestResults(userId) {
    try {
      console.log(`🔍 [ТЕСТ] getLatestTestResults для user_id: ${userId} (тип: ${typeof userId})`);
      
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
      const result = await pool.query(`
        SELECT * FROM test_results 
        WHERE user_id = $1::bigint AND created_at = $2
        ORDER BY position ASC
      `, [userId, latestDate]);
      
      console.log(`✅ [ТЕСТ] Получено результатов: ${result.rows.length}`);
      if (result.rows.length > 0) {
        console.log(`🎯 [ТЕСТ] Результаты:`, result.rows.map(r => `${r.archetype_name}: ${r.percentage}%`).join(', '));
      }
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка getLatestTestResults:', error);
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

  // Получение статистики тестов
  async getTestStats() {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(DISTINCT user_id) as unique_testers,
          COUNT(*) as total_results,
          COUNT(DISTINCT DATE(created_at)) as active_days,
          AVG(score) as avg_score,
          MAX(created_at) as last_test_date
        FROM test_results
      `);
      
      return result.rows[0];
    } catch (error) {
      console.error('❌ Ошибка getTestStats:', error);
      throw error;
    }
  }

  // Получение популярных архетипов
  async getPopularArchetypes(limit = 10) {
    try {
      const result = await pool.query(`
        SELECT 
          archetype_name,
          COUNT(*) as count,
          AVG(score) as avg_score,
          AVG(percentage) as avg_percentage
        FROM test_results 
        WHERE position = 1
        GROUP BY archetype_name
        ORDER BY count DESC
        LIMIT $1
      `, [limit]);
      
      return result.rows;
    } catch (error) {
      console.error('❌ Ошибка getPopularArchetypes:', error);
      throw error;
    }
  }

  // Получение детальной информации о пользователе
  async getUserDetailedInfo(userId) {
    try {
      // Информация о пользователе
      const userResult = await pool.query(`
        SELECT * FROM users WHERE telegram_id = $1::bigint
      `, [userId]);

      if (userResult.rows.length === 0) {
        return null;
      }

      const user = userResult.rows[0];

      // Последние результаты тестов
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
      console.error('❌ Ошибка getUserDetailedInfo:', error);
      throw error;
    }
  }
}

module.exports = new TestResultService(); 