/**
 * UI компоненты - клавиатуры для бота
 * Чистые функции для создания клавиатур
 */

// Главное меню
export function mainMenuKeyboard() {
  return {
    keyboard: [
      ['🎯 Начать тест'],
      ['ℹ️ О тесте', '📊 Мои результаты']
    ],
    resize_keyboard: true
  };
}

// Клавиатура для вопросов теста
export function questionKeyboard(answer1, answer2) {
  return {
    inline_keyboard: [
      [
        { text: answer1, callback_data: 'answer_1' },
        { text: answer2, callback_data: 'answer_2' }
      ]
    ]
  };
}

// Клавиатура подтверждения перезапуска теста
export function restartTestKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '✅ Да, начать заново', callback_data: 'restart_test' },
        { text: '❌ Продолжить текущий', callback_data: 'continue_test' }
      ]
    ]
  };
}

// Клавиатура для начала теста
export function startTestKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎯 Начать тест', callback_data: 'start_test' }]
    ]
  };
}

// Клавиатура для повторного прохождения теста
export function retakeTestKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔄 Пройти тест заново', callback_data: 'start_test' }]
    ]
  };
}

// Админская клавиатура
export function adminMainKeyboard() {
  return {
    keyboard: [
      ['👥 Список пользователей', '📊 Статистика'],
      ['🔍 Поиск пользователя', '📨 Отправить сообщение'],
      ['⚙️ Настройки', '🔙 Главное меню']
    ],
    resize_keyboard: true
  };
}

// Inline админская клавиатура
export function adminMainInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '👥 Пользователи', callback_data: 'admin_users_list' },
        { text: '📊 Статистика', callback_data: 'admin_stats' }
      ],
      [
        { text: '🔍 Поиск', callback_data: 'admin_search' },
        { text: '📨 Сообщение', callback_data: 'admin_broadcast' }
      ],
      [
        { text: '⚙️ Настройки', callback_data: 'admin_settings' }
      ]
    ]
  };
}