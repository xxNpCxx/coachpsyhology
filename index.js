// 🚀 Точка входа для Render.com
// Простое перенаправление на src/bot.js

import('./src/bot.js')
  .then(() => {
    console.log('✅ Бот успешно запущен из src/bot.js');
  })
  .catch((error) => {
    console.error('❌ Ошибка запуска бота:', error);
    process.exit(1);
});