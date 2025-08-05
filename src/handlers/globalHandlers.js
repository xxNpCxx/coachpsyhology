import { testsPG } from '../pg/tests.pg.js';
import { cache } from '../utils/cache.js';
import { hasApprovedComment } from '../pg/comments.pg.js';



/**
 * Глобальные обработчики для основных команд и кнопок
 */

export function registerGlobalHandlers(bot) {
  // Обработка кнопки "Начать тест"
  bot.hears(['🎯 Начать тест', 'Начать тест'], async (ctx) => {
    const userId = ctx.from.id;
    
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
    
    // Проверяем, есть ли у пользователя результаты тестов
    try {
      const results = await testsPG.getLatestTestResults(userId);
      
      if (results.length > 0) {
        // Пользователь уже проходил тест, проверяем комментарий
        const hasComment = await hasApprovedComment(userId);
        
        if (!hasComment) {
          await ctx.reply(
            '📝 *Для повторного прохождения теста*\n\n' +
            'Вы уже проходили тест. Чтобы пройти его снова, пожалуйста, оставьте комментарий о вашем опыте.\n\n' +
            'Это поможет нам улучшить тест и сделать его более полезным для других пользователей.',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📝 Оставить комментарий', callback_data: 'leave_comment' }],
                  [{ text: '❌ Отмена', callback_data: 'cancel_comment' }]
                ]
              }
            }
          );
          return;
        }
      }
    } catch (error) {
      console.error('❌ Ошибка проверки результатов:', error);
      // В случае ошибки позволяем пройти тест
    }
    
    await ctx.scene.enter('test');
  });

  // Обработка кнопки "О тесте"
  bot.hears(['ℹ️ О тесте', 'О тесте'], async (ctx) => {
    const aboutMessage = `
📖 *О тесте архетипов*

Этот тест основан на теории архетипов Карла Юнга и современных психологических исследованиях.

🎯 *12 архетипов личности:*
1. 🐣 **Дитя** — Доверие, Мечтательность
2. 🧑‍🤝‍🧑 **Славный малый** — Дружба, Равенство  
3. 🛡 **Опекун** — Забота, Семья
4. 🧭 **Искатель** — Новизна, Авантюризм
5. 🔥 **Бунтарь** — Провокация, Борьба за справедливость
6. ⚔️ **Воин** — Достижения, Лидерство
7. 💘 **Любовник** — Любовь, Эстетика
8. 🎨 **Творец** — Творчество, Уникальность
9. 🎭 **Шут** — Юмор, Харизма
10. 📚 **Мудрец** — Наука, Опыт
11. 🧙‍♂️ **Маг** — Тайна, Трансформация
12. 👑 **Правитель** — Власть, Порядок

💡 *Как использовать результаты:*
• Понимание своих мотиваций
• Развитие сильных сторон
• Работа над слабыми местами
• Улучшение отношений с другими`;

    await ctx.reply(aboutMessage, { parse_mode: 'Markdown' });
  });

  // Обработка кнопки "Мои результаты"
  bot.hears(['📊 Мои результаты', 'Мои результаты'], async (ctx) => {
    const userId = ctx.from.id;
    
    try {
      const results = await testsPG.getLatestTestResults(userId);
      
      if (results.length === 0) {
        await ctx.reply('❌ У вас пока нет результатов тестов. Пройдите тест, чтобы узнать свои архетипы!', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Начать тест', callback_data: 'start_test' }]
            ]
          }
        });
        return;
      }

      let message = `📊 *Ваши последние результаты:*\n\n`;
      
      results.forEach((result, index) => {
        const emoji = ['🥇', '🥈', '🥉', '🏅'][index] || `${index + 1}.`;
        message += `${emoji} **${result.archetype_name}**: ${result.percentage}%\n`;
      });

      message += `\n📅 Дата прохождения: ${new Date(results[0].created_at).toLocaleDateString('ru-RU')}`;

      // Проверяем, есть ли одобренный комментарий для повторного прохождения
      let hasComment = false;
      try {
        hasComment = await hasApprovedComment(userId);
      } catch (error) {
        console.error('❌ Ошибка проверки комментария:', error);
      }

      const keyboard = [];
      if (hasComment) {
        keyboard.push([{ text: '🔄 Пройти тест заново', callback_data: 'start_test' }]);
      } else {
        keyboard.push([{ text: '📝 Оставить комментарий для повторного прохождения', callback_data: 'leave_comment' }]);
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });

    } catch (error) {
      console.error('❌ Ошибка получения результатов:', error);
      await ctx.reply('❌ Ошибка получения результатов. Попробуйте позже.');
    }
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
          ['🎯 Начать тест'],
          ['ℹ️ О тесте', '📊 Мои результаты']
        ],
        resize_keyboard: true
      }
    });
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
          ['🎯 Начать тест'],
          ['ℹ️ О тесте', '📊 Мои результаты']
        ],
        resize_keyboard: true
      }
    });
  });
}