import { Scenes } from 'telegraf';
import { commentsPG } from '../pg/comments.pg.js';
import { COMMENT_GROUP_ID } from '../config.js';

export const commentScene = new Scenes.BaseScene('comment');

// Вход в сцену
commentScene.enter(async (ctx) => {
  const userId = ctx.from.id;
  
  try {
    // Проверяем текущий статус пользователя
    const accessCheck = await commentsPG.canUserTakeTest(userId, COMMENT_GROUP_ID);
    
    let message = '📝 *Система комментариев*\n\n';
    
    if (accessCheck.canTake) {
      message += '✅ *Вы можете пройти тест!*\n\n';
      message += `📊 Ваша статистика:\n`;
      message += `• Пройдено тестов: ${accessCheck.testCount}\n`;
      message += `• Оставлено комментариев: ${accessCheck.commentCount}\n\n`;
      message += '💡 Комментарии в группе помогают создать активное сообщество и улучшить тест для всех участников.';
    } else {
      message += '❌ *Недостаточно комментариев*\n\n';
      message += `📊 Ваша статистика:\n`;
      message += `• Пройдено тестов: ${accessCheck.testCount}\n`;
      message += `• Оставлено комментариев: ${accessCheck.commentCount}\n`;
      message += `• Требуется комментариев: ${accessCheck.requiredComments}\n\n`;
      message += `💬 Для прохождения теста необходимо оставить еще ${accessCheck.requiredComments - accessCheck.commentCount} комментариев в группе.\n\n`;
      message += '🔗 Присоединяйтесь к нашей группе и активно участвуйте в обсуждениях!';
    }
    
    const keyboard = [];
    if (accessCheck.canTake) {
      keyboard.push(['🎯 Начать тест']);
    }
    keyboard.push(['📊 Проверить статус комментариев']);
    keyboard.push(['🏠 Главное меню']);
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: keyboard,
        resize_keyboard: true
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка проверки статуса комментариев:', error);
    await ctx.reply('❌ Ошибка получения статуса. Попробуйте позже.', {
      reply_markup: {
        keyboard: [
          ['🎯 Начать тест'],
          ['🏠 Главное меню']
        ],
        resize_keyboard: true
      }
    });
  }
  
  await ctx.scene.leave();
});

// Выход из сцены
commentScene.leave((_ctx) => {
  // Очистка состояния при выходе
}); 