import { Scenes } from 'telegraf';
import { saveUserComment } from '../pg/comments.pg.js';
import { logger } from '../utils/logger.js';

export const commentScene = new Scenes.BaseScene('comment');

// Вход в сцену
commentScene.enter(async (ctx) => {
  await ctx.reply(
    '📝 *Оставьте комментарий о тесте*\n\n' +
    'Поделитесь своими впечатлениями о тесте:\n' +
    '• Что понравилось?\n' +
    '• Что можно улучшить?\n' +
    '• Какой результат получили?\n' +
    '• Рекомендуете ли друзьям?\n\n' +
    'Ваш комментарий поможет нам сделать тест лучше!',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [['❌ Отменить']],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  );
});

// Обработка текстовых сообщений
commentScene.on('text', async (ctx) => {
  const commentText = ctx.message.text;
  const userId = ctx.from.id;

  // Проверяем, не является ли это командой отмены
  if (commentText === '❌ Отменить') {
    await ctx.reply('❌ Отправка комментария отменена.', {
      reply_markup: {
        keyboard: [
          ['🎯 Начать тест'],
          ['ℹ️ О тесте', '📊 Мои результаты']
        ],
        resize_keyboard: true
      }
    });
    return ctx.scene.leave();
  }

  // Проверяем минимальную длину комментария
  if (commentText.length < 10) {
    await ctx.reply(
      '⚠️ Комментарий слишком короткий. Пожалуйста, напишите более подробный отзыв (минимум 10 символов).',
      {
        reply_markup: {
          keyboard: [['❌ Отменить']],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  try {
    // Сохраняем комментарий в базу данных
    await saveUserComment(userId, commentText);

    await ctx.reply(
      '✅ *Спасибо за ваш комментарий!*\n\n' +
      'Ваш отзыв отправлен на модерацию. После одобрения вы сможете пройти тест повторно.\n\n' +
      'Мы уведомим вас, когда комментарий будет одобрен.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            ['🎯 Начать тест'],
            ['ℹ️ О тесте', '📊 Мои результаты']
          ],
          resize_keyboard: true
        }
      }
    );

    logger.info(`📝 Комментарий от пользователя ${userId}: ${commentText.substring(0, 50)}...`);

  } catch (error) {
    console.error('❌ Ошибка сохранения комментария:', error);
    await ctx.reply(
      '❌ Произошла ошибка при сохранении комментария. Попробуйте позже.',
      {
        reply_markup: {
          keyboard: [
            ['🎯 Начать тест'],
            ['ℹ️ О тесте', '📊 Мои результаты']
          ],
          resize_keyboard: true
        }
      }
    );
  }

  await ctx.scene.leave();
});

// Обработка других типов сообщений
commentScene.on('message', async (ctx) => {
  await ctx.reply(
    '⚠️ Пожалуйста, отправьте текстовый комментарий.',
    {
      reply_markup: {
        keyboard: [['❌ Отменить']],
        resize_keyboard: true
      }
    }
  );
});

// Выход из сцены
commentScene.leave((_ctx) => {
  // Очистка состояния при выходе
}); 