const userService = require('../services/userService');
const testResultService = require('../services/testResultService');
const {
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
} = require('../keyboards/adminKeyboards');

// Состояние админ-панели для каждого пользователя
const adminStates = new Map();

class AdminPanelHandler {
  constructor(bot) {
    this.bot = bot;
    this.setupHandlers();
  }

  setupHandlers() {
    // Команды для входа в админ-панель
    this.bot.command('admin', this.handleAdminCommand.bind(this));
    this.bot.command('admin_inline', this.handleAdminInlineCommand.bind(this));
    
    // Обработчики текстовых команд админ-панели
    this.bot.hears('👥 Список пользователей', this.handleUsersList.bind(this));
    this.bot.hears('📊 Статистика', this.handleStats.bind(this));
    this.bot.hears('🔍 Поиск пользователя', this.handleSearch.bind(this));
    this.bot.hears('📨 Отправить сообщение', this.handleSendMessage.bind(this));
    this.bot.hears('⚙️ Настройки', this.handleSettings.bind(this));
    this.bot.hears('🔙 Главное меню', this.handleBackToMain.bind(this));
    this.bot.hears('🔙 Назад в админ-панель', this.handleBackToAdmin.bind(this));
    
    // Обработчики выбора интерфейса
    this.bot.action('admin_interface_inline', this.handleInlineInterface.bind(this));
    this.bot.action('admin_interface_reply', this.handleReplyInterface.bind(this));
    
    // Обработчики inline кнопок главного меню
    this.bot.action('admin_stats', this.handleStats.bind(this));
    this.bot.action('admin_search', this.handleSearch.bind(this));
    this.bot.action('admin_send_message', this.handleSendMessage.bind(this));
    this.bot.action('admin_settings', this.handleSettings.bind(this));
    this.bot.action('admin_back_to_main', this.handleBackToMain.bind(this));
    
    // Обработчики inline кнопок пользователей
    this.bot.action(/admin_user_profile_(\d+)/, this.handleUserProfile.bind(this));
    this.bot.action(/admin_user_results_(\d+)/, this.handleUserResults.bind(this));
    this.bot.action(/admin_user_message_(\d+)/, this.handleUserMessage.bind(this));
    this.bot.action(/admin_user_details_(\d+)/, this.handleUserDetails.bind(this));
    this.bot.action(/admin_make_admin_(\d+)/, this.handleMakeAdmin.bind(this));
    this.bot.action(/admin_delete_user_(\d+)/, this.handleDeleteUser.bind(this));
    this.bot.action('admin_back', this.handleAdminBack.bind(this));
    this.bot.action('admin_users_list', this.handleUsersList.bind(this));
  }

  // Проверка прав администратора
  async checkAdminRights(ctx) {
    const userId = ctx.from.id;
    console.log('🔐 Проверка админских прав для пользователя:', userId);
    
    const isAdmin = await userService.isAdmin(userId);
    console.log('🔐 Результат проверки isAdmin:', isAdmin);
    
    if (!isAdmin) {
      console.log('❌ Отказ в доступе к админ-панели для пользователя:', userId);
      await ctx.reply('❌ У вас нет прав для доступа к админ-панели.');
      return false;
    }
    
    console.log('✅ Доступ к админ-панели разрешён для пользователя:', userId);
    return true;
  }

  // Обработка команды /admin
  async handleAdminCommand(ctx) {
    console.log('🔐 Обработка команды /admin от пользователя:', ctx.from.id);
    
    if (!(await this.checkAdminRights(ctx))) {
      console.log('❌ Проверка прав не пройдена, выходим');
      return;
    }

    const userId = ctx.from.id;
    adminStates.set(userId, { currentSection: 'main' });
    console.log('✅ Открываем админ-панель для пользователя:', userId);

    const keyboard = getAdminMainKeyboard();
    console.log('🔧 Reply клавиатура:', JSON.stringify(keyboard, null, 2));

    await ctx.reply(
      '🔐 *Панель администратора*\n\nВыберите действие:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  // Обработка списка пользователей
  async handleUsersList(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.from.id;
    adminStates.set(userId, { currentSection: 'users_list', page: 1 });

    await this.showUsersList(ctx, 1);
  }

  // Показать список пользователей
  async showUsersList(ctx, page = 1) {
    try {
      const limit = 10;
      const offset = (page - 1) * limit;
      
      const users = await userService.getAllUsers(limit, offset);
      const stats = await userService.getUsersStats();
      
      let message = `👥 *Список пользователей* (страница ${page})\n\n`;
      
      if (users.length === 0) {
        message += 'Пользователи не найдены.';
      } else {
        users.forEach((user, index) => {
          const adminBadge = user.is_admin ? ' 👑' : '';
          const name = user.first_name || user.username || `User${user.telegram_id}`;
          const testsCount = user.tests_count || 0;
          const lastTest = user.last_test_date ? 
            new Date(user.last_test_date).toLocaleDateString('ru-RU') : 'Нет';
          
          message += `${index + 1}. ${name}${adminBadge}\n`;
          message += `   ID: \`${user.telegram_id}\`\n`;
          message += `   Тестов: ${testsCount} | Последний: ${lastTest}\n\n`;
        });
      }
      
      const totalPages = Math.ceil(stats.total_users / limit);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: getUsersListKeyboard()
      });
      
      // Сохраняем состояние
      const adminUserId = ctx.from.id;
      adminStates.set(adminUserId, { 
        currentSection: 'users_list', 
        page: page,
        totalPages: totalPages
      });
      
    } catch (error) {
      console.error('❌ Ошибка показа списка пользователей:', error);
      await ctx.reply('❌ Произошла ошибка при загрузке списка пользователей.');
    }
  }

  // Обработка статистики
  async handleStats(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.from.id;
    adminStates.set(userId, { currentSection: 'stats' });

    try {
      const userStats = await userService.getUsersStats();
      const testStats = await testResultService.getTestStats();
      const popularArchetypes = await testResultService.getPopularArchetypes(5);

      let message = `📊 *Статистика бота*\n\n`;
      
      // Статистика пользователей
      message += `👥 *Пользователи:*\n`;
      message += `• Всего: ${userStats.total_users}\n`;
      message += `• Администраторов: ${userStats.admin_users}\n`;
      message += `• Новых за неделю: ${userStats.new_users_week}\n`;
      message += `• Новых за месяц: ${userStats.new_users_month}\n\n`;
      
      // Статистика тестов
      message += `📈 *Тесты:*\n`;
      message += `• Уникальных тестируемых: ${testStats.unique_testers || 0}\n`;
      message += `• Всего результатов: ${testStats.total_results || 0}\n`;
      message += `• Средний балл: ${Math.round(testStats.avg_score || 0)}\n`;
      message += `• Активных дней: ${testStats.active_days || 0}\n\n`;
      
      // Популярные архетипы
      if (popularArchetypes.length > 0) {
        message += `🏆 *Топ-5 популярных архетипов:*\n`;
        popularArchetypes.forEach((archetype, index) => {
          message += `${index + 1}. ${archetype.archetype_name}: ${archetype.count} раз\n`;
        });
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: getStatsKeyboard()
      });
      
    } catch (error) {
      console.error('❌ Ошибка показа статистики:', error);
      await ctx.reply('❌ Произошла ошибка при загрузке статистики.');
    }
  }

  // Обработка поиска
  async handleSearch(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.from.id;
    adminStates.set(userId, { currentSection: 'search', waitingFor: 'query' });

    await ctx.reply(
      '🔍 *Поиск пользователей*\n\nВведите имя, username или ID пользователя:',
      {
        parse_mode: 'Markdown',
        reply_markup: getSearchKeyboard()
      }
    );
  }

  // Обработка отправки сообщений
  async handleSendMessage(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.from.id;
    adminStates.set(userId, { currentSection: 'send_message' });

    await ctx.reply(
      '📨 *Отправка сообщений*\n\nВыберите тип рассылки:',
      {
        parse_mode: 'Markdown',
        reply_markup: getMessageKeyboard()
      }
    );
  }

  // Обработка настроек
  async handleSettings(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.from.id;
    adminStates.set(userId, { currentSection: 'settings' });

    await ctx.reply(
      '⚙️ *Настройки администратора*\n\nВыберите действие:',
      {
        parse_mode: 'Markdown',
        reply_markup: getSettingsKeyboard()
      }
    );
  }

  // Возврат в главное меню
  async handleBackToMain(ctx) {
    const userId = ctx.from.id;
    adminStates.delete(userId);

    await ctx.reply(
      '🏠 Возвращаемся в главное меню...',
      {
        reply_markup: { remove_keyboard: true }
      }
    );
  }

  // Возврат в админ-панель
  async handleBackToAdmin(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.from.id;
    adminStates.set(userId, { currentSection: 'main' });

    await ctx.reply(
      '🔐 *Панель администратора*\n\nВыберите действие:',
      {
        parse_mode: 'Markdown',
        reply_markup: getAdminMainKeyboard()
      }
    );
  }

  // Обработка профиля пользователя
  async handleUserProfile(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.match[1];
    
    try {
      const userInfo = await testResultService.getUserDetailedInfo(userId);
      
      if (!userInfo) {
        await ctx.reply('❌ Пользователь не найден.');
        return;
      }

      const { user, testResults, testCount, answersStats } = userInfo;
      
      let message = `👤 *Профиль пользователя*\n\n`;
      message += `*ID:* \`${user.telegram_id}\`\n`;
      message += `*Имя:* ${user.first_name || 'Не указано'}\n`;
      message += `*Username:* ${user.username ? '@' + user.username : 'Не указан'}\n`;
      message += `*Администратор:* ${user.is_admin ? 'Да' : 'Нет'}\n`;
      message += `*Дата регистрации:* ${new Date(user.created_at).toLocaleDateString('ru-RU')}\n`;
      message += `*Пройдено тестов:* ${testCount}\n`;
      message += `*Ответов на вопросы:* ${answersStats.total_answers || 0}\n\n`;

      if (testResults.length > 0) {
        message += `*Последние результаты:*\n`;
        testResults.forEach((result, index) => {
          message += `${index + 1}. ${result.archetype_name}: ${result.score} баллов (${result.percentage}%)\n`;
        });
      } else {
        message += `*Результаты тестов:* Нет данных\n`;
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: getUserActionsInlineKeyboard(userId)
      });
      
    } catch (error) {
      console.error('❌ Ошибка показа профиля пользователя:', error);
      await ctx.reply('❌ Произошла ошибка при загрузке профиля пользователя.');
    }
  }

  // Обработка результатов пользователя
  async handleUserResults(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.match[1];
    
    try {
      const results = await testResultService.getUserTestResults(userId);
      
      if (results.length === 0) {
        await ctx.reply('❌ Результаты тестов не найдены.');
        return;
      }

      let message = `📊 *Результаты тестов пользователя ${userId}*\n\n`;
      
      // Группируем результаты по дате
      const resultsByDate = {};
      results.forEach(result => {
        const date = new Date(result.created_at).toLocaleDateString('ru-RU');
        if (!resultsByDate[date]) {
          resultsByDate[date] = [];
        }
        resultsByDate[date].push(result);
      });

      Object.entries(resultsByDate).forEach(([date, dateResults]) => {
        message += `📅 *${date}:*\n`;
        dateResults
          .filter(r => r.position === 1) // Только первые места
          .forEach(result => {
            message += `• ${result.archetype_name}: ${result.score} баллов (${result.percentage}%)\n`;
          });
        message += '\n';
      });

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: getUserActionsInlineKeyboard(userId)
      });
      
    } catch (error) {
      console.error('❌ Ошибка показа результатов пользователя:', error);
      await ctx.reply('❌ Произошла ошибка при загрузке результатов пользователя.');
    }
  }

  // Обработка отправки сообщения пользователю
  async handleUserMessage(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.match[1];
    const adminUserId = ctx.from.id;
    
    adminStates.set(adminUserId, { 
      currentSection: 'send_user_message', 
      targetUserId: userId,
      waitingFor: 'message'
    });

    await ctx.reply(
      `📨 *Отправка сообщения пользователю ${userId}*\n\nВведите текст сообщения:`,
      {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true }
      }
    );
  }

  // Обработка детальной информации о пользователе
  async handleUserDetails(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.match[1];
    
    try {
      const userInfo = await testResultService.getUserDetailedInfo(userId);
      const answers = await testResultService.getUserAnswers(userId);
      
      if (!userInfo) {
        await ctx.reply('❌ Пользователь не найден.');
        return;
      }

      const { user, answersStats } = userInfo;
      
      let message = `🔍 *Подробная информация о пользователе*\n\n`;
      message += `*ID:* \`${user.telegram_id}\`\n`;
      message += `*Имя:* ${user.first_name || 'Не указано'}\n`;
      message += `*Фамилия:* ${user.last_name || 'Не указана'}\n`;
      message += `*Username:* ${user.username ? '@' + user.username : 'Не указан'}\n`;
      message += `*Язык:* ${user.language_code || 'Не указан'}\n`;
      message += `*Администратор:* ${user.is_admin ? 'Да' : 'Нет'}\n`;
      message += `*Дата регистрации:* ${new Date(user.created_at).toLocaleString('ru-RU')}\n`;
      message += `*Последнее обновление:* ${new Date(user.updated_at).toLocaleString('ru-RU')}\n\n`;
      
      message += `*Статистика ответов:*\n`;
      message += `• Всего ответов: ${answersStats.total_answers || 0}\n`;
      message += `• Вопросов отвечено: ${answersStats.questions_answered || 0}\n`;
      message += `• Средний ответ: ${Math.round(answersStats.avg_answer || 0)}\n\n`;

      if (answers.length > 0) {
        message += `*Последние 10 ответов:*\n`;
        answers.slice(-10).forEach((answer, index) => {
          const answerText = ['Полностью согласен', 'Скорее да', 'Не знаю', 'Не согласен'][answer.answer_value];
          message += `${index + 1}. Вопрос ${answer.question_index + 1} (${answer.archetype}): ${answerText}\n`;
        });
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: getUserActionsInlineKeyboard(userId)
      });
      
    } catch (error) {
      console.error('❌ Ошибка показа детальной информации:', error);
      await ctx.reply('❌ Произошла ошибка при загрузке детальной информации.');
    }
  }

  // Обработка назначения администратора
  async handleMakeAdmin(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.match[1];
    const adminUserId = ctx.from.id;
    
    try {
      const user = await userService.getUserByTelegramId(userId);
      if (!user) {
        await ctx.reply('❌ Пользователь не найден.');
        return;
      }

      const newAdminStatus = !user.is_admin;
      await userService.setAdminStatus(userId, newAdminStatus);

      await ctx.reply(
        `✅ Пользователь ${userId} ${newAdminStatus ? 'назначен' : 'снят с поста'} администратора.`,
        {
          reply_markup: getUserActionsInlineKeyboard(userId)
        }
      );
      
    } catch (error) {
      console.error('❌ Ошибка изменения статуса администратора:', error);
      await ctx.reply('❌ Произошла ошибка при изменении статуса администратора.');
    }
  }

  // Обработка удаления пользователя
  async handleDeleteUser(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    const userId = ctx.match[1];
    
    await ctx.reply(
      `⚠️ *Внимание!*\n\nВы действительно хотите удалить пользователя ${userId}?\n\nЭто действие нельзя отменить!`,
      {
        parse_mode: 'Markdown',
        reply_markup: getConfirmationKeyboard()
      }
    );
  }

  // Обработка возврата назад
  async handleAdminBack(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    await this.handleBackToAdmin(ctx);
  }

  // Обработка возврата к списку пользователей
  async handleUsersList(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;

    await this.showUsersList(ctx, 1);
  }

  // Обработка текстовых сообщений в админ-панели
  async handleTextMessage(ctx) {
    const userId = ctx.from.id;
    const state = adminStates.get(userId);
    
    if (!state) return false; // Не в админ-панели

    const text = ctx.message.text;

    try {
      switch (state.currentSection) {
        case 'search':
          if (state.waitingFor === 'query') {
            await this.handleSearchQuery(ctx, text);
          }
          break;
          
        case 'send_user_message':
          if (state.waitingFor === 'message') {
            await this.handleSendUserMessage(ctx, text);
          }
          break;
          
        default:
          return false; // Не обрабатываем
      }
      
      return true; // Обработали
    } catch (error) {
      console.error('❌ Ошибка обработки текстового сообщения в админ-панели:', error);
      await ctx.reply('❌ Произошла ошибка при обработке сообщения.');
      return true;
    }
  }

  // Обработка поискового запроса
  async handleSearchQuery(ctx, query) {
    const userId = ctx.from.id;
    
    try {
      const users = await userService.searchUsers(query, 10);
      
      if (users.length === 0) {
        await ctx.reply('🔍 Пользователи не найдены.', {
          reply_markup: getSearchKeyboard()
        });
        return;
      }

      let message = `🔍 *Результаты поиска: "${query}"*\n\n`;
      
      users.forEach((user, index) => {
        const adminBadge = user.is_admin ? ' 👑' : '';
        const name = user.first_name || user.username || `User${user.telegram_id}`;
        
        message += `${index + 1}. ${name}${adminBadge}\n`;
        message += `   ID: \`${user.telegram_id}\`\n`;
        message += `   Дата: ${new Date(user.created_at).toLocaleDateString('ru-RU')}\n\n`;
      });

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: getSearchKeyboard()
      });
      
      // Сбрасываем состояние ожидания
      adminStates.set(userId, { currentSection: 'search' });
      
    } catch (error) {
      console.error('❌ Ошибка поиска пользователей:', error);
      await ctx.reply('❌ Произошла ошибка при поиске пользователей.');
    }
  }

  // Обработка отправки сообщения пользователю
  async handleSendUserMessage(ctx, messageText) {
    const userId = ctx.from.id;
    const state = adminStates.get(userId);
    
    try {
      const targetUserId = state.targetUserId;
      
      // Отправляем сообщение пользователю
      await this.bot.telegram.sendMessage(targetUserId, 
        `📨 *Сообщение от администратора:*\n\n${messageText}`, 
        { parse_mode: 'Markdown' }
      );

      await ctx.reply(
        `✅ Сообщение отправлено пользователю ${targetUserId}.`,
        {
          reply_markup: getAdminMainKeyboard()
        }
      );
      
      // Сбрасываем состояние
      adminStates.set(userId, { currentSection: 'main' });
      
    } catch (error) {
      console.error('❌ Ошибка отправки сообщения пользователю:', error);
      await ctx.reply(
        '❌ Не удалось отправить сообщение. Возможно, пользователь заблокировал бота.',
        {
          reply_markup: getAdminMainKeyboard()
        }
      );
      
      // Сбрасываем состояние
      adminStates.set(userId, { currentSection: 'main' });
    }
  }

  // Обработка выбора inline интерфейса
  async handleInlineInterface(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '🔐 *Панель администратора*\n\nВыберите действие:',
      {
        parse_mode: 'Markdown',
        reply_markup: getAdminMainInlineKeyboard()
      }
    );
  }

  // Обработка выбора reply интерфейса
  async handleReplyInterface(ctx) {
    if (!(await this.checkAdminRights(ctx))) return;
    
    await ctx.answerCbQuery();
    await ctx.reply(
      '🔐 *Панель администратора*\n\nВыберите действие:',
      {
        parse_mode: 'Markdown',
        reply_markup: getAdminMainKeyboard()
      }
    );
  }

  // Обработка команды /admin_inline
  async handleAdminInlineCommand(ctx) {
    console.log('🔐 Обработка команды /admin_inline от пользователя:', ctx.from.id);
    
    if (!(await this.checkAdminRights(ctx))) {
      console.log('❌ Проверка прав не пройдена, выходим');
      return;
    }

    const userId = ctx.from.id;
    adminStates.set(userId, { currentSection: 'main' });
    console.log('✅ Открываем inline админ-панель для пользователя:', userId);

    const inlineKeyboard = getAdminMainInlineKeyboard();
    console.log('🔧 Inline клавиатура:', JSON.stringify(inlineKeyboard, null, 2));

    await ctx.reply(
      '🔐 *Панель администратора (Inline)*\n\nВыберите действие:',
      {
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard
      }
    );
  }
}

module.exports = AdminPanelHandler; 