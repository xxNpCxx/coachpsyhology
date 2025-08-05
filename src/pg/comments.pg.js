import { pool } from '../config.js';

/**
 * Сохранение комментария пользователя
 */
export async function saveUserComment(userId, commentText) {
  try {
    const result = await pool.query(
      `INSERT INTO user_comments (user_id, comment_text)
       VALUES ($1::bigint, $2)
       RETURNING *`,
      [userId, commentText]
    );
    return result.rows[0];
  } catch (error) {
    console.error('[comments][pg] Ошибка сохранения комментария:', error);
    throw error;
  }
}

/**
 * Получение последнего комментария пользователя
 */
export async function getLatestUserComment(userId) {
  try {
    const result = await pool.query(
      `SELECT * FROM user_comments 
       WHERE user_id = $1::bigint 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('[comments][pg] Ошибка получения комментария:', error);
    throw error;
  }
}

/**
 * Проверка, есть ли у пользователя одобренный комментарий
 */
export async function hasApprovedComment(userId) {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM user_comments 
       WHERE user_id = $1::bigint AND is_approved = true`,
      [userId]
    );
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error('[comments][pg] Ошибка проверки комментария:', error);
    throw error;
  }
}

/**
 * Получение всех неодобренных комментариев (для админов)
 */
export async function getPendingComments() {
  try {
    const result = await pool.query(
      `SELECT uc.*, u.username, u.first_name, u.last_name
       FROM user_comments uc
       JOIN users u ON uc.user_id = u.telegram_id
       WHERE uc.is_approved = false
       ORDER BY uc.created_at DESC`
    );
    return result.rows;
  } catch (error) {
    console.error('[comments][pg] Ошибка получения неодобренных комментариев:', error);
    throw error;
  }
}

/**
 * Одобрение комментария (для админов)
 */
export async function approveComment(commentId, approvedBy) {
  try {
    const result = await pool.query(
      `UPDATE user_comments 
       SET is_approved = true, approved_by = $1::bigint, approved_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [approvedBy, commentId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('[comments][pg] Ошибка одобрения комментария:', error);
    throw error;
  }
}

/**
 * Отклонение комментария (для админов)
 */
export async function rejectComment(commentId, _rejectedBy) {
  try {
    const result = await pool.query(
      `DELETE FROM user_comments 
       WHERE id = $1
       RETURNING *`,
      [commentId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('[comments][pg] Ошибка отклонения комментария:', error);
    throw error;
  }
} 