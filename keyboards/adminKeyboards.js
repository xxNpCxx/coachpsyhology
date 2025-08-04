const { Markup } = require('telegraf');

// Главное меню админ-панели (reply клавиатура)
function getAdminMainKeyboard() {
  return Markup.keyboard([
    ['👥 Список пользователей', '📊 Статистика'],
    ['🔍 Поиск пользователя', '📨 Отправить сообщение'],
    ['⚙️ Настройки', '🔙 Главное меню']
  ]).resize();
}

// Главное меню админ-панели (inline клавиатура)
function getAdminMainInlineKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('👥 Список пользователей', 'admin_users_list'),
      Markup.button.callback('📊 Статистика', 'admin_stats')
    ],
    [
      Markup.button.callback('🔍 Поиск пользователя', 'admin_search'),
      Markup.button.callback('📨 Отправить сообщение', 'admin_send_message')
    ],
    [
      Markup.button.callback('⚙️ Настройки', 'admin_settings'),
      Markup.button.callback('🔙 Главное меню', 'admin_back_to_main')
    ]
  ]);
}

// Клавиатура для списка пользователей
function getUsersListKeyboard() {
  return Markup.keyboard([
    ['📄 Следующая страница', '📄 Предыдущая страница'],
    ['🔍 Поиск по имени', '🔍 Поиск по ID'],
    ['🔙 Назад в админ-панель']
  ]).resize();
}

// Клавиатура для статистики
function getStatsKeyboard() {
  return Markup.keyboard([
    ['📈 Общая статистика', '🏆 Популярные архетипы'],
    ['👤 Статистика пользователей', '📊 Статистика тестов'],
    ['🔙 Назад в админ-панель']
  ]).resize();
}

// Клавиатура для поиска
function getSearchKeyboard() {
  return Markup.keyboard([
    ['🔍 Поиск по имени', '🔍 Поиск по ID'],
    ['📄 Последние пользователи', '📄 Активные пользователи'],
    ['🔙 Назад в админ-панель']
  ]).resize();
}

// Клавиатура для отправки сообщений
function getMessageKeyboard() {
  return Markup.keyboard([
    ['📨 Всем пользователям', '📨 Администраторам'],
    ['📨 По архетипу', '📨 По дате регистрации'],
    ['🔙 Назад в админ-панель']
  ]).resize();
}

// Клавиатура для настроек
function getSettingsKeyboard() {
  return Markup.keyboard([
    ['👑 Добавить админа', '👑 Убрать админа'],
    ['🔧 Настройки бота', '📋 Логи'],
    ['🔙 Назад в админ-панель']
  ]).resize();
}

// Клавиатура для профиля пользователя
function getUserProfileKeyboard(userId) {
  return Markup.keyboard([
    [`👤 Профиль ${userId}`, `📊 Результаты ${userId}`],
    [`📨 Написать ${userId}`, `🔍 Подробная информация`],
    ['🔙 К списку пользователей']
  ]).resize();
}

// Клавиатура подтверждения
function getConfirmationKeyboard() {
  return Markup.keyboard([
    ['✅ Подтвердить', '❌ Отменить'],
    ['🔙 Назад']
  ]).resize();
}

// Клавиатура для выбора архетипов
function getArchetypesKeyboard() {
  return Markup.keyboard([
    ['🧙‍♂️ Маг', '👑 Правитель', '🛡️ Воин'],
    ['💝 Любовник', '🤡 Шут', '👶 Дитя'],
    ['🔍 Искатель', '🎭 Творец', '👨‍👩‍👧‍👦 Опекун'],
    ['🧠 Мудрец', '🏠 Славный малый', '⚡ Бунтарь'],
    ['🔙 Назад']
  ]).resize();
}

// Клавиатура для выбора периода
function getPeriodKeyboard() {
  return Markup.keyboard([
    ['📅 Сегодня', '📅 Вчера', '📅 Неделя'],
    ['📅 Месяц', '📅 Все время'],
    ['🔙 Назад']
  ]).resize();
}

// Inline клавиатура для пагинации
function getPaginationInlineKeyboard(currentPage, totalPages, action) {
  const keyboard = [];
  
  if (totalPages > 1) {
    const row = [];
    
    if (currentPage > 1) {
      row.push(Markup.button.callback('◀️', `${action}_prev_${currentPage - 1}`));
    }
    
    row.push(Markup.button.callback(`${currentPage}/${totalPages}`, 'page_info'));
    
    if (currentPage < totalPages) {
      row.push(Markup.button.callback('▶️', `${action}_next_${currentPage + 1}`));
    }
    
    keyboard.push(row);
  }
  
  keyboard.push([Markup.button.callback('🔙 Назад', 'admin_back')]);
  
  return Markup.inlineKeyboard(keyboard);
}

// Inline клавиатура для действий с пользователем
function getUserActionsInlineKeyboard(userId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('👤 Профиль', `admin_user_profile_${userId}`),
      Markup.button.callback('📊 Результаты', `admin_user_results_${userId}`)
    ],
    [
      Markup.button.callback('📨 Написать', `admin_user_message_${userId}`),
      Markup.button.callback('🔍 Подробно', `admin_user_details_${userId}`)
    ],
    [
      Markup.button.callback('👑 Сделать админом', `admin_make_admin_${userId}`),
      Markup.button.callback('❌ Удалить', `admin_delete_user_${userId}`)
    ],
    [Markup.button.callback('🔙 Назад', 'admin_users_list')]
  ]);
}

module.exports = {
  getAdminMainKeyboard,
  getAdminMainInlineKeyboard,
  getUsersListKeyboard,
  getStatsKeyboard,
  getSearchKeyboard,
  getMessageKeyboard,
  getSettingsKeyboard,
  getUserProfileKeyboard,
  getConfirmationKeyboard,
  getArchetypesKeyboard,
  getPeriodKeyboard,
  getPaginationInlineKeyboard,
  getUserActionsInlineKeyboard
}; 