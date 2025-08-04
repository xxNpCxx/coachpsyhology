import { Telegraf, session, Scenes } from "telegraf";
import express from "express";

// 1. Импорты конфигурации
import { BOT_TOKEN, WEBHOOK_URL, pool } from "./config.js";

// 2. Импорты команд
import { registerStartCommand } from "./commands/start.js";

// 3. Импорты сцен
import { testScene } from "./scenes/test.scene.js";

// 4. Импорты обработчиков
import { registerGlobalHandlers } from "./handlers/globalHandlers.js";

// 5. Импорты утилит
import { cache } from "./utils/cache.js";

// 6. Импорт админ-панели  
import { AdminPanelHandler } from "./handlers/admin/adminPanel.js";

// 7. Инициализация бота
const bot = new Telegraf(BOT_TOKEN);

// 8. КРИТИЧЕСКИЙ ПОРЯДОК MIDDLEWARE:

// Session middleware ПЕРВЫМ
bot.use(session({ defaultSession: () => ({}) }));

// Глобальный middleware для логирования и инициализации пользователей
bot.use(async (ctx, next) => {
  // Логирование всех обновлений
  if (ctx.message) {
    console.log(`📩 Сообщение от ${ctx.from.first_name} (${ctx.from.id}): ${ctx.message.text || '[медиа]'}`);
  } else if (ctx.callbackQuery) {
    console.log(`🔘 Callback от ${ctx.from.first_name} (${ctx.from.id}): ${ctx.callbackQuery.data}`);
  }
  
  // Если пользователь в сцене, передаем управление сценам
  if (ctx.scene && ctx.scene.current) {
    return await next();
  }
  
  await next();
});

// FSM Stage middleware для сцен
const stage = new Scenes.Stage([testScene]);
bot.use(stage.middleware());

// 9. Регистрация компонентов

// Функция для получения состояния пользователя (для админ-панели)
function getUserState(userId) {
  return cache.getUserState(userId);
}

// Инициализация админ-панели
const adminPanel = new AdminPanelHandler(bot, getUserState);

// Регистрация команд
registerStartCommand(bot);

// Регистрация глобальных обработчиков
registerGlobalHandlers(bot);

// 10. Универсальный обработчик неизвестных callback queries (ПОСЛЕДНИМ!)
bot.action(/.*/, async (ctx) => {
  console.log('⚠️ Неизвестный callback query:', ctx.callbackQuery?.data);
  await ctx.answerCbQuery('Неизвестная команда');
});

// 11. Express сервер для webhook + health check
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для парсинга JSON
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    cache_stats: cache.getStats()
  });
});

// Webhook endpoint
app.post(`/webhook`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// 12. Запуск бота
async function startBot() {
  try {
    // Проверяем подключение к БД
    await pool.query('SELECT 1');
    console.log('✅ База данных доступна');
    
    if (process.env.NODE_ENV === 'production') {
      // Production: webhook mode
      if (WEBHOOK_URL) {
        await bot.telegram.setWebhook(`${WEBHOOK_URL}`);
        console.log('🌐 Webhook установлен:', `${WEBHOOK_URL}`);
      }
      
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`📊 Статистика кеша:`, cache.getStats());
      });
    } else {
      // Development: polling mode
      await bot.telegram.deleteWebhook();
      console.log('🔄 Webhook удален, переключаемся на polling');
      
      bot.launch();
      console.log('🤖 Бот запущен в режиме polling');
      console.log(`📊 Статистика кеша:`, cache.getStats());
    }
    
  } catch (error) {
    console.error('❌ Ошибка запуска бота:', error);
    process.exit(1);
  }
}

// 13. Обработка ошибок
bot.catch((err, ctx) => {
  console.error('❌ Ошибка бота:', err);
  if (ctx && ctx.reply) {
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('👋 Получен SIGINT, останавливаем бота...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('👋 Получен SIGTERM, останавливаем бота...');
  bot.stop('SIGTERM');
});

// Запускаем бота
startBot();

export default bot;