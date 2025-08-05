import { commentsPG } from '../pg/comments.pg.js';
import { COMMENT_GROUP_ID, COMMENT_GROUP_LINK } from '../config.js';
import { cache } from '../utils/cache.js';



/**
 * Глобальные обработчики для основных команд и кнопок
 */

export function registerGlobalHandlers(bot) {
  // Обработка кнопки "Начать тест"
  bot.hears(['🎯 Начать тест', 'Начать тест'], async (ctx) => {
    console.log('🔍 [ТЕСТ] Обработчик "Начать тест" вызван');
    const userId = ctx.from.id;
    console.log(`🔍 [ТЕСТ] Пользователь ID: ${userId}`);
    
    // Проверяем, не находится ли пользователь уже в тесте
    const userState = cache.getUserState(userId);
    if (userState && userState.currentQuestionIndex > 0) {
      await ctx.reply('❓ Вы уже проходите тест. Хотите начать заново?', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Да, начать заново', callback_data: 'restart_test' },
              { text: '❌ Продолжить текущий', callback_data: 'continue_test' }
            ]
          ]
        }
      });
      return;
    }
    
    // Проверяем доступ пользователя к тесту
    try {
      const accessCheck = await commentsPG.canUserTakeTest(userId, COMMENT_GROUP_ID);
      
      if (!accessCheck.canTake) {
        const message = `❌ *Доступ к тесту ограничен*\n\n` +
          `📊 Ваша статистика:\n` +
          `• Пройдено тестов: ${accessCheck.testCount}\n` +
          `• Оставлено комментариев: ${accessCheck.commentCount}\n` +
          `• Требуется комментариев: ${accessCheck.requiredComments}\n\n` +
          `💬 Для прохождения теста необходимо оставить не менее ${accessCheck.requiredComments} комментариев в группе.\n\n` +
          `🔗 Присоединяйтесь к нашей группе и активно участвуйте в обсуждениях!`;
        
        await ctx.reply(message, { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Проверить статус комментариев', callback_data: 'check_comments' }],
              [{ text: '💬 Оставить комментарий', url: COMMENT_GROUP_LINK || 'https://t.me/your_group' }]
            ]
          }
        });
        return;
      }
    } catch (error) {
      console.error('❌ Ошибка проверки доступа к тесту:', error);
      // В случае ошибки позволяем пройти тест
    }
    
    await ctx.scene.enter('test');
  });





  // Обработка callback queries
  bot.action('start_test', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('test');
  });

  bot.action('restart_test', async (ctx) => {
    await ctx.answerCbQuery();
    cache.deleteUserState(ctx.from.id);
    await ctx.scene.enter('test');
  });

  bot.action('continue_test', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('▶️ Продолжаем тест...');
    // Логика для продолжения теста реализуется в сцене
  });

  // Обработка комментариев
  bot.action('leave_comment', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('comment');
  });

  bot.action('cancel_comment', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('❌ Повторное прохождение теста отменено.', {
      reply_markup: {
        keyboard: [
          ['🎯 Начать тест']
        ],
        resize_keyboard: true
      }
    });
  });

  // Обработка проверки статуса комментариев
  bot.action('check_comments', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    
    try {
      const accessCheck = await commentsPG.canUserTakeTest(userId, COMMENT_GROUP_ID);
      const commentInfo = await commentsPG.getUserRecentComments(userId, COMMENT_GROUP_ID, 3);
      
      let message = `📊 *Статус ваших комментариев*\n\n`;
      message += `• Пройдено тестов: ${accessCheck.testCount}\n`;
      message += `• Оставлено комментариев: ${accessCheck.commentCount}\n`;
      message += `• Требуется комментариев: ${accessCheck.requiredComments}\n\n`;
      
      if (accessCheck.canTake) {
        message += `✅ *Вы можете пройти тест!*\n\n`;
      } else {
        message += `❌ *Недостаточно комментариев*\n\n`;
        message += `💬 Оставьте еще ${accessCheck.requiredComments - accessCheck.commentCount} комментариев в группе.\n\n`;
      }
      
      if (commentInfo.length > 0) {
        message += `📝 *Последние комментарии:*\n`;
        commentInfo.forEach((comment, index) => {
          const date = new Date(comment.created_at).toLocaleDateString('ru-RU');
          const preview = comment.text.length > 50 ? comment.text.substring(0, 50) + '...' : comment.text;
          message += `${index + 1}. ${date}: ${preview}\n`;
        });
      }
      
      const keyboard = [];
      if (accessCheck.canTake) {
        keyboard.push([{ text: '🎯 Начать тест', callback_data: 'start_test' }]);
      }
      keyboard.push([{ text: '💬 Оставить комментарий', url: COMMENT_GROUP_LINK || 'https://t.me/your_group' }]);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      
    } catch (error) {
      console.error('❌ Ошибка проверки статуса комментариев:', error);
      await ctx.reply('❌ Ошибка получения статуса комментариев. Попробуйте позже.');
    }
  });

  // Обработка главного меню
  bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🏠 *Главное меню*', {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          ['🎯 Начать тест']
        ],
        resize_keyboard: true
      }
    });
  });

  // Обработка кнопки "Оставить комментарий"
  bot.hears(['💬 Оставить комментарий'], async (ctx) => {
    const groupLink = COMMENT_GROUP_LINK || 'https://t.me/your_group';
    await ctx.reply(
      `💬 *Оставить комментарий*\n\n` +
      `Для оставления комментария перейдите в нашу группу:\n\n` +
      `🔗 ${groupLink}\n\n` +
      `После оставления комментария в группе, вернитесь сюда и нажмите "📊 Проверить статус комментариев"`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Перейти в группу', url: groupLink }],
            [{ text: '📊 Проверить статус комментариев', callback_data: 'check_comments' }]
          ]
        }
      }
    );
  });

  // Обработка главного меню
  bot.hears(['🏠 Главное меню', 'Главное меню', '/menu'], async (ctx) => {
    // Если пользователь в сцене, выходим из неё
    if (ctx.scene && ctx.scene.current) {
      await ctx.scene.leave();
    }
    
    await ctx.reply('🏠 *Главное меню*', {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          ['🎯 Начать тест']
        ],
        resize_keyboard: true
      }
    });
  });
}