-- Миграция 004: Создание таблицы комментариев пользователей в группе
-- Отслеживает комментарии пользователей для проверки доступа к тесту

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    message_id BIGINT NOT NULL,
    chat_id BIGINT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Уникальный индекс для предотвращения дублирования комментариев
    UNIQUE(user_id, message_id, chat_id)
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_chat_id ON comments(chat_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_chat ON comments(user_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);

-- Комментарии к таблице
COMMENT ON TABLE comments IS 'Комментарии пользователей в группе для проверки доступа к тесту';
COMMENT ON COLUMN comments.user_id IS 'Telegram ID пользователя';
COMMENT ON COLUMN comments.message_id IS 'ID сообщения в Telegram';
COMMENT ON COLUMN comments.chat_id IS 'ID чата/группы';
COMMENT ON COLUMN comments.text IS 'Текст комментария';
COMMENT ON COLUMN comments.created_at IS 'Время создания комментария'; 