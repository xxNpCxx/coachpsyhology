import { usersPG } from '../pg/users.pg.js';

/**
 * Команда /admin - доступ к админ-панели
 */

export function registerAdminCommand(bot, adminPanelHandler) {
  bot.command('admin', async (ctx) => {
    await handleAdminCommand(ctx, adminPanelHandler);
  });
}

async function handleAdminCommand(ctx, adminPanelHandler) {
  try {
    const userId = ctx.from.id;
    
    // Проверяем права администратора
    const isAdmin = await usersPG.isAdmin(userId);
    
    if (!isAdmin) {
      console.log('❌ Отказ в доступе к админ-панели для пользователя:', userId);
      await ctx.reply('❌ У вас нет прав для доступа к админ-панели.');
      return;
    }
    
    // Передаем управление админ-панели
    await adminPanelHandler.handleAdminCommand(ctx);
    
  } catch (error) {
    console.error('❌ Ошибка в команде /admin:', error);
    await ctx.reply('❌ Произошла ошибка при доступе к админ-панели.');
  }
}