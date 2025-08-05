// Временная заглушка админ-панели
// Старая админ-панель использовала удаленные сервисы

import { usersPG } from '../../pg/users.pg.js';
import { testsPG } from '../../pg/tests.pg.js';
import { commentsPG } from '../../pg/comments.pg.js';
import { COMMENT_GROUP_ID } from '../../config.js';

class AdminPanelHandler {
  constructor(bot, getUserState) {
    this.bot = bot;
    this.getUserState = getUserState;
    this.setupHandlers();
  }

  setupHandlers() {
    // Команда для входа в админ-панель
    this.bot.command('admin', this.handleAdminCommand.bind(this));
    
    // Обработчик кнопки "Список пользователей"
    this.bot.action('admin_users_list', this.handleUsersList.bind(this));
    
    // Обработчики комментариев
    this.bot.action('admin_comments', this.handleCommentsList.bind(this));
    this.bot.action('admin_back', this.handleAdminCommand.bind(this));
  }

  async handleAdminCommand(ctx) {
    const isAdmin = await usersPG.isAdmin(ctx.from.id);
    
    if (!isAdmin) {
      await ctx.reply('❌ У вас нет прав администратора.');
      return;
    }

    await ctx.reply(
      '🔐 *Панель администратора*\n\nВыберите действие:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👥 Список пользователей', callback_data: 'admin_users_list' }],
            [{ text: '📝 Модерация комментариев', callback_data: 'admin_comments' }]
          ]
        }
      }
    );
  }

  async handleUsersList(ctx) {
    const isAdmin = await usersPG.isAdmin(ctx.from.id);
    
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав доступа');
      return;
    }

    try {
      console.log('🔍 [АДМИН] Загружаем список пользователей...');
      const users = await usersPG.getAllUsers();
      console.log(`📊 [АДМИН] Найдено пользователей: ${users.length}`);
      
      let message = `👥 *Список пользователей*\n\n`;
      
      if (users.length === 0) {
        message += 'Пользователи не найдены.';
      } else {
        for (let i = 0; i < Math.min(users.length, 10); i++) {
          const user = users[i];
          const name = user.first_name || user.username || `User${user.telegram_id}`;
          
          console.log(`🔍 [АДМИН] Обрабатываем пользователя ${i + 1}: ${name} (ID: ${user.telegram_id})`);
          
          // Получаем результаты тестов для пользователя
          const testResults = await testsPG.getLatestTestResults(user.telegram_id);
          console.log(`📊 [АДМИН] Результаты для ${name}: ${testResults ? testResults.length : 0} записей`);
          
          message += `${i + 1}. ${name}\n`;
          message += `   ID: \`${user.telegram_id}\`\n`;
          
          if (testResults && testResults.length > 0) {
            console.log(`🎯 [АДМИН] Показываем результаты для ${name}:`, testResults.map(r => `${r.archetype_name}: ${r.percentage}%`).join(', '));
            message += `   📊 *Последние результаты:*\n`;
            testResults.slice(0, 4).forEach((result, idx) => {
              const position = ['🥇', '🥈', '🥉', '🏅'][idx] || `${idx + 1}.`;
              message += `      ${position} ${result.archetype_name}: ${result.percentage}%\n`;
            });
          } else {
            console.log(`⚠️ [АДМИН] Нет результатов для ${name}`);
              message += `   📝 *Статус:* Тест не начат\n`;
          }
        message += '\n';
        }
      }
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'admin_back' }]
          ]
        }
      });
      
    } catch (error) {
      console.error('❌ Ошибка загрузки пользователей:', error);
      await ctx.answerCbQuery('❌ Ошибка загрузки данных');
    }
  }

  async handleCommentsList(ctx) {
    const isAdmin = await usersPG.isAdmin(ctx.from.id);
    
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав доступа');
      return;
    }

    try {
      console.log('🔍 [АДМИН] Загружаем статистику комментариев...');
      const stats = await commentsPG.getCommentStats(COMMENT_GROUP_ID);
      console.log(`📊 [АДМИН] Статистика комментариев:`, stats);
      
      let message = `📝 *Статистика комментариев*\n\n`;
      
      if (!stats.total_comments) {
        message += 'Комментарии не найдены.';
      } else {
        message += `📊 *Общая статистика:*\n`;
        message += `• Всего комментариев: ${stats.total_comments}\n`;
        message += `• Уникальных пользователей: ${stats.unique_users}\n`;
        message += `• Первый комментарий: ${stats.first_comment ? new Date(stats.first_comment).toLocaleDateString('ru-RU') : 'Н/Д'}\n`;
        message += `• Последний комментарий: ${stats.last_comment ? new Date(stats.last_comment).toLocaleDateString('ru-RU') : 'Н/Д'}\n\n`;
        
        // Получаем топ активных пользователей
        const topUsers = await commentsPG.getTopActiveUsers(COMMENT_GROUP_ID, 5);
        if (topUsers.length > 0) {
          message += `🏆 *Топ активных пользователей:*\n`;
          topUsers.forEach((user, index) => {
            const emoji = ['🥇', '🥈', '🥉', '🏅', '🎖️'][index] || `${index + 1}.`;
            message += `${emoji} ID: \`${user.user_id}\` - ${user.comment_count} комментариев\n`;
          });
        }
      }
      
      const keyboard = [
        [{ text: '🔙 Назад', callback_data: 'admin_back' }]
      ];
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      
    } catch (error) {
      console.error('❌ Ошибка загрузки статистики комментариев:', error);
      await ctx.answerCbQuery('❌ Ошибка загрузки данных');
    }
  }


}

export { AdminPanelHandler };