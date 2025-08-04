// Временная заглушка админ-панели
// Старая админ-панель использовала удаленные сервисы

import { usersPG } from '../../pg/users.pg.js';
import { testsPG } from '../../pg/tests.pg.js';

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
            [{ text: '👥 Список пользователей', callback_data: 'admin_users_list' }]
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
      const users = await usersPG.getAllUsers();
      
      let message = `👥 *Список пользователей*\n\n`;
      
      if (users.length === 0) {
        message += 'Пользователи не найдены.';
      } else {
        for (let i = 0; i < Math.min(users.length, 10); i++) {
          const user = users[i];
          const name = user.first_name || user.username || `User${user.telegram_id}`;
          
          // Получаем результаты тестов для пользователя
          const testResults = await testsPG.getLatestTestResults(user.telegram_id);
          
          message += `${i + 1}. ${name}\n`;
          message += `   ID: \`${user.telegram_id}\`\n`;
          
          if (testResults && testResults.length > 0) {
            message += `   📊 *Последние результаты:*\n`;
            testResults.slice(0, 4).forEach((result, idx) => {
              const position = ['🥇', '🥈', '🥉', '🏅'][idx] || `${idx + 1}.`;
              message += `      ${position} ${result.archetype_name}: ${result.percentage}%\n`;
            });
          } else {
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
}

export { AdminPanelHandler };