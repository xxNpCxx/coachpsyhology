// Временная заглушка админ-панели
// Старая админ-панель использовала удаленные сервисы

import { usersPG } from '../../pg/users.pg.js';
import { testsPG } from '../../pg/tests.pg.js';
import { getPendingComments, approveComment, rejectComment } from '../../pg/comments.pg.js';

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
    this.bot.action(/approve_comment_(\d+)/, this.handleApproveComment.bind(this));
    this.bot.action(/reject_comment_(\d+)/, this.handleRejectComment.bind(this));
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
      console.log('🔍 [АДМИН] Загружаем список комментариев...');
      const comments = await getPendingComments();
      console.log(`📊 [АДМИН] Найдено комментариев: ${comments.length}`);
      
      let message = `📝 *Модерация комментариев*\n\n`;
      
      if (comments.length === 0) {
        message += 'Нет комментариев для модерации.';
      } else {
        for (let i = 0; i < Math.min(comments.length, 5); i++) {
          const comment = comments[i];
          const userName = comment.first_name || comment.username || `User${comment.user_id}`;
          const commentPreview = comment.comment_text.length > 100 
            ? comment.comment_text.substring(0, 100) + '...' 
            : comment.comment_text;
          
          message += `${i + 1}. *${userName}*\n`;
          message += `   ID: \`${comment.user_id}\`\n`;
          message += `   📅 ${new Date(comment.created_at).toLocaleDateString('ru-RU')}\n`;
          message += `   💬 ${commentPreview}\n\n`;
        }
      }
      
      const keyboard = [];
      if (comments.length > 0) {
        comments.slice(0, 5).forEach((comment, index) => {
          keyboard.push([
            { text: `✅ Одобрить ${index + 1}`, callback_data: `approve_comment_${comment.id}` },
            { text: `❌ Отклонить ${index + 1}`, callback_data: `reject_comment_${comment.id}` }
          ]);
        });
      }
      keyboard.push([{ text: '🔙 Назад', callback_data: 'admin_back' }]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      
    } catch (error) {
      console.error('❌ Ошибка загрузки комментариев:', error);
      await ctx.answerCbQuery('❌ Ошибка загрузки данных');
    }
  }

  async handleApproveComment(ctx) {
    const isAdmin = await usersPG.isAdmin(ctx.from.id);
    
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав доступа');
      return;
    }

    const commentId = parseInt(ctx.match[1]);
    
    try {
      const comment = await approveComment(commentId, ctx.from.id);
      console.log(`✅ [АДМИН] Комментарий ${commentId} одобрен`);
      
      await ctx.answerCbQuery('✅ Комментарий одобрен');
      
      // Уведомляем пользователя об одобрении
      try {
        await this.bot.telegram.sendMessage(comment.user_id, 
          '✅ *Ваш комментарий одобрен!*\n\nТеперь вы можете пройти тест повторно.',
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('❌ Ошибка уведомления пользователя:', error);
      }
      
      // Обновляем список комментариев
      await this.handleCommentsList(ctx);
      
    } catch (error) {
      console.error('❌ Ошибка одобрения комментария:', error);
      await ctx.answerCbQuery('❌ Ошибка одобрения');
    }
  }

  async handleRejectComment(ctx) {
    const isAdmin = await usersPG.isAdmin(ctx.from.id);
    
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Нет прав доступа');
      return;
    }

    const commentId = parseInt(ctx.match[1]);
    
    try {
      const comment = await rejectComment(commentId, ctx.from.id);
      console.log(`❌ [АДМИН] Комментарий ${commentId} отклонен`);
      
      await ctx.answerCbQuery('❌ Комментарий отклонен');
      
      // Уведомляем пользователя об отклонении
      try {
        await this.bot.telegram.sendMessage(comment.user_id, 
          '❌ *Ваш комментарий отклонен.*\n\nПожалуйста, оставьте более подробный и конструктивный отзыв.',
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('❌ Ошибка уведомления пользователя:', error);
      }
      
      // Обновляем список комментариев
      await this.handleCommentsList(ctx);
      
    } catch (error) {
      console.error('❌ Ошибка отклонения комментария:', error);
      await ctx.answerCbQuery('❌ Ошибка отклонения');
    }
  }
}

export { AdminPanelHandler };