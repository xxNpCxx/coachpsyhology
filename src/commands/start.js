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

На каждом слайде вы увидите утверждение и 4 варианта ответа.
Ваша задача - выбрать, насколько каждое из утверждений вам соответствует.
Для более точного результата рекомендуется проходить в одиночестве. Старайтесь отвечать честно и осознанно.

Начинаем по твоей команде!`;

    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          ['🎯 Начать тест']
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