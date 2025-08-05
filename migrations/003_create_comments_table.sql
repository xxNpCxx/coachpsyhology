-- Создание таблицы комментариев пользователей
CREATE TABLE IF NOT EXISTS user_comments (
  id SERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by BIGINT REFERENCES users(telegram_id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индексов для оптимизации
CREATE INDEX IF NOT EXISTS idx_user_comments_user_id ON user_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_comments_is_approved ON user_comments(is_approved);
CREATE INDEX IF NOT EXISTS idx_user_comments_created_at ON user_comments(created_at);

-- Добавление комментария к таблице
COMMENT ON TABLE user_comments IS 'Комментарии пользователей для повторного прохождения теста'; 