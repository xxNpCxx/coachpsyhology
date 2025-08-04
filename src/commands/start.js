import { usersPG } from '../pg/users.pg.js';
import { cache } from '../utils/cache.js';

/**
 * Команда /start - начальная команда бота
 */

export function registerStartCommand(bot) {
  bot.start(async (ctx) => {
    await handleStart(ctx);
  });
  
  bot.command("start", async (ctx) => {
    await handleStart(ctx);
  });
}

async function handleStart(ctx) {
  try {
    // Создаем или обновляем пользователя
    await usersPG.upsertUser(ctx);
    
    // Очищаем состояние пользователя если было
    cache.deleteUserState(ctx.from.id);
    
    const welcomeMessage = `
🌟 *Добро пожаловать!*

Привет, ${ctx.from.first_name}! 👋

Этот бот поможет вам определить ваши доминирующие архетипы личности на основе теории Карла Юнга.

🎯 *Что вас ждет:*
• 84 вопроса о ваших предпочтениях
• Анализ по 12 архетипам
• Персональные рекомендации
• Понимание своих сильных сторон

💡 *Как это работает:*
Выберите один из двух вариантов ответа, который лучше всего описывает вас. Будьте честны с собой - это поможет получить точный результат.

Готовы узнать себя лучше? 🚀`;

    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          ['🎯 Начать тест'],
          ['ℹ️ О тесте', '📊 Мои результаты']
        ],
        resize_keyboard: true
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка в команде /start:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте еще раз.');
  }
}

export { handleStart };