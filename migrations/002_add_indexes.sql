-- Добавление дополнительных индексов для оптимизации
-- Эта миграция будет применена автоматически при следующем запуске бота

-- Индекс для поиска по дате создания
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Индекс для поиска по дате обновления
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);

-- Составной индекс для статистики
CREATE INDEX IF NOT EXISTS idx_test_results_user_date ON test_results(user_id, created_at);

-- Индекс для поиска по архетипу
CREATE INDEX IF NOT EXISTS idx_test_results_archetype ON test_results(archetype_name);

-- Индекс для вопросов по пользователю и индексу
CREATE INDEX IF NOT EXISTS idx_question_answers_user_question ON question_answers(user_id, question_index);

-- Добавление комментариев к индексам
COMMENT ON INDEX idx_users_created_at IS 'Индекс для быстрого поиска по дате регистрации';
COMMENT ON INDEX idx_users_updated_at IS 'Индекс для быстрого поиска по дате обновления';
COMMENT ON INDEX idx_test_results_user_date IS 'Составной индекс для статистики тестов пользователя';
COMMENT ON INDEX idx_test_results_archetype IS 'Индекс для поиска результатов по архетипу';
COMMENT ON INDEX idx_question_answers_user_question IS 'Индекс для быстрого поиска ответов пользователя'; 