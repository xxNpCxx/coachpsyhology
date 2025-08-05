import { Scenes } from "telegraf";
import { cache } from '../utils/cache.js';
import { testsPG } from '../pg/tests.pg.js';
import { commentsPG } from '../pg/comments.pg.js';
import { COMMENT_GROUP_ID } from '../config.js';
import fs from 'fs';

/**
 * FSM Сцена для прохождения теста
 * Управляет всем процессом тестирования пользователя
 */

export const testScene = new Scenes.BaseScene("test");

// Загрузка вопросов
let questionsData;
try {
  const archetypesMapping = JSON.parse(fs.readFileSync('questions.json', 'utf8'));
  
  // Создаем массив вопросов из маппинга архетипов
  const questions = [];
  
  // Проходим по всем архетипам и их вопросам
  Object.entries(archetypesMapping).forEach(([archetype, questionNumbers]) => {
    questionNumbers.forEach(questionNum => {
      questions.push({
        questionNumber: parseInt(questionNum),
        answer1: "Полностью согласен(на)",
        answer2: "Скорее да, чем нет", 
        answer3: "Не знаю",
        answer4: "Это совсем не про меня",
        archetype: archetype
      });
    });
  });
  
  // Сортируем по номеру вопроса
  questions.sort((a, b) => a.questionNumber - b.questionNumber);
  
  questionsData = { questions };
  console.log(`✅ Загружено ${questionsData.questions.length} вопросов`);
} catch (error) {
  console.error('❌ Ошибка загрузки questions.json:', error);
  // Fallback - создаем пустые вопросы
  questionsData = { questions: [] };
}

// Вход в сцену
testScene.enter(async (ctx) => {
  console.log('🎯 [СЦЕНА] Вход в сцену теста');
  const userId = ctx.from.id;
  console.log(`🎯 [СЦЕНА] Пользователь ID: ${userId}`);
  
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
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      return ctx.scene.leave();
    }
  } catch (error) {
    console.error('❌ Ошибка проверки доступа к тесту:', error);
    // В случае ошибки разрешаем прохождение теста
  }
  
  // Инициализируем состояние пользователя
  const userState = {
    currentQuestionIndex: 0,
    archetypeScores: new Map([
      ['Дитя', 0], ['Славный малый', 0], ['Опекун', 0], ['Искатель', 0],
      ['Бунтарь', 0], ['Воин', 0], ['Любовник', 0], ['Творец', 0],
      ['Шут', 0], ['Мудрец', 0], ['Маг', 0], ['Правитель', 0]
    ]),
    answers: []
  };
  
  cache.setUserState(userId, userState);
  
  await ctx.reply('🎯 *Начинаем тест!*\n\nОтвечайте честно на каждый вопрос. Всего вопросов: 84', {
    parse_mode: 'Markdown'
  });
  
  // Показываем первый вопрос
  await showQuestion(ctx, userId);
});

// Обработка ответов на вопросы
testScene.action(/answer_(\d+)/, async (ctx) => {
  const userId = ctx.from.id;
  const answer = parseInt(ctx.match[1]);
  
  const userState = cache.getUserState(userId);
  if (!userState) {
    await ctx.reply('❌ Ошибка состояния. Начните тест заново: /start');
    return ctx.scene.leave();
  }
  
  // Сохраняем ответ
  const currentQuestion = questionsData.questions[userState.currentQuestionIndex];
  const archetype = currentQuestion.archetype;
  
  // Увеличиваем счет архетипа (4-балльная шкала: 1=4 балла, 2=3 балла, 3=2 балла, 4=1 балл)
  const scoreForAnswer = 5 - answer; // 1->4, 2->3, 3->2, 4->1
  const currentScore = userState.archetypeScores.get(archetype) || 0;
  userState.archetypeScores.set(archetype, currentScore + scoreForAnswer);
  
  // Сохраняем ответ в историю
  userState.answers.push({
    questionIndex: userState.currentQuestionIndex,
    answer: answer,
    archetype: archetype
  });
  
  userState.currentQuestionIndex++;
  cache.setUserState(userId, userState);
  
  await ctx.answerCbQuery();
  
  // Проверяем, закончились ли вопросы
  if (userState.currentQuestionIndex >= questionsData.questions.length) {
    await showResults(ctx, userId);
  } else {
    await showQuestion(ctx, userId);
  }
});

// Показ вопроса
async function showQuestion(ctx, userId) {
  const userState = cache.getUserState(userId);
  
  // Проверяем, что вопросы загружены
  if (!questionsData.questions || questionsData.questions.length === 0) {
    await ctx.reply('❌ Ошибка загрузки вопросов. Попробуйте позже.');
    return ctx.scene.leave();
  }
  
  // Проверяем индекс вопроса
  if (userState.currentQuestionIndex >= questionsData.questions.length) {
    await ctx.reply('❌ Ошибка: вопрос не найден.');
    return ctx.scene.leave();
  }
  
  const currentQuestion = questionsData.questions[userState.currentQuestionIndex];
  const questionNumber = currentQuestion.questionNumber;
  
  const progress = Math.round((userState.currentQuestionIndex / questionsData.questions.length) * 100);
  const progressBar = '🟩'.repeat(Math.floor(progress / 10)) + '⬜'.repeat(10 - Math.floor(progress / 10));
  
  let caption = `*Вопрос ${userState.currentQuestionIndex + 1} из ${questionsData.questions.length}*\n`;
  caption += `${progressBar} ${progress}%\n`;
  caption += `Выберите наиболее подходящий вариант:`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: currentQuestion.answer1, callback_data: 'answer_1' }],
      [{ text: currentQuestion.answer2, callback_data: 'answer_2' }],
      [{ text: currentQuestion.answer3, callback_data: 'answer_3' }],
      [{ text: currentQuestion.answer4, callback_data: 'answer_4' }]
    ]
  };
  
  // Путь к изображению вопроса
  const imagePath = `questions/${questionNumber}.jpg`;
  
  try {
    // Проверяем существование файла
    if (!fs.existsSync(imagePath)) {
      console.error(`❌ Файл изображения не найден: ${imagePath}`);
      await ctx.reply(`❌ Ошибка: изображение для вопроса ${questionNumber} не найдено.`);
      return ctx.scene.leave();
    }
    
    // Отправляем изображение с подписью и клавиатурой
    await ctx.replyWithPhoto({ source: imagePath }, {
      caption: caption,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('❌ Ошибка отправки изображения:', error);
    await ctx.reply('❌ Ошибка отправки вопроса. Попробуйте позже.');
    return ctx.scene.leave();
  }
}

// Показ результатов теста
async function showResults(ctx, userId) {
  const userState = cache.getUserState(userId);
  
  // Сортируем архетипы по баллам (по убыванию)
  const sortedArchetypes = Array.from(userState.archetypeScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4); // Берем топ-4

  let resultMessage = `✅ *РЕЗУЛЬТАТЫ ТЕСТА*\n\n🏆 *Ваши 4 доминирующих архетипа:*\n\n`;

  // Сумма баллов топ-4 архетипов
  const topSum = sortedArchetypes.reduce((acc, [_, score]) => acc + score, 0) || 1;

  sortedArchetypes.forEach((archetype, index) => {
    const [name, score] = archetype;
    const percentage = Math.round((score / topSum) * 100);
    const emoji = ['🥇', '🥈', '🥉', '🏅'][index];
    resultMessage += `${emoji} **${name}**: ${score} баллов (${percentage}%)\n`;
  });

  resultMessage += `\n📖 *В современной психологии выделяют 12 ключевых архетипов:*\n`;
  resultMessage += ` 1. 🐣 Дитя — Доверие, Мечтательность\n`;
  resultMessage += ` 2. 🧑‍🤝‍🧑 Славный малый — Дружба, Равенство\n`;
  resultMessage += ` 3. 🛡 Опекун — Забота, Семья\n`;
  resultMessage += ` 4. 🧭 Искатель — Новизна, Авантюризм\n`;
  resultMessage += ` 5. 🔥 Бунтарь — Провокация, Борьба за справедливость\n`;
  resultMessage += ` 6. ⚔️ Воин — Достижения, Лидерство\n`;
  resultMessage += ` 7. 💘 Любовник — Любовь, Эстетика\n`;
  resultMessage += ` 8. 🎨 Творец — Творчество, Уникальность\n`;
  resultMessage += ` 9. 🎭 Шут — Юмор, Харизма\n`;
  resultMessage += ` 10. 📚 Мудрец — Наука, Опыт\n`;
  resultMessage += ` 11. 🧙‍♂️ Маг — Тайна, Трансформация\n`;
  resultMessage += ` 12. 👑 Правитель — Власть, Порядок\n\n`;
  resultMessage += `В каждом из нас эти архетипы заложены как потенциал, но мы не используем все одновременно. Исходя из жизненного опыта, чаще опираемся на те стратегии, что эффективнее ведут к результату.\n\n`;
  resultMessage += `Одного архетипа тоже недостаточно. Мы не действуем одинаково во всех сферах: работа, семья, хобби, дружба и тд. Контекст меняется, и вместе с ним включаются разные внутренние роли.\n\n`;
  resultMessage += `Это не значит, что человек, у которого в карте архетипов нет любовника, не понимает, что такое любить. Он принимает решения, ставя на первое место другие ценности. Например, карьеру, если он Воин. Или заботу, если Опекун.\n\n`;
  resultMessage += `Как правило, именно 4 архетипа формируют поведенческое ядро. Они не конкурируют друг с другом, а закрывают разные аспекты жизни, позволяя действовать гибко и последовательно.\n\n`;
  resultMessage += `Это и создает уникальную структуру личности. Ты можешь быть собой в любых обстоятельствах.\n\n`;
  resultMessage += `📋 Подробное описание ваших архетипов будет отправлено отдельными файлами.`;

  // Отправляем результаты как новое сообщение вместо редактирования
  try {
    await ctx.reply(resultMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Ошибка отправки результатов:', error);
    // Fallback: отправляем простой текст без Markdown
    await ctx.reply('✅ Результаты теста готовы! Подробности будут отправлены отдельными файлами.');
  }

  // Сохраняем результаты в базу данных
  try {
    await testsPG.saveTestResults(userId, userState.archetypeScores);
    await testsPG.saveQuestionAnswers(userId, userState.answers);
  } catch (error) {
    console.error('❌ Ошибка сохранения результатов в БД:', error);
  }

  // Отправляем PDF файлы с описаниями архетипов
  for (const [archetypeName] of sortedArchetypes) {
    const fileName = `answers/${archetypeName.toLowerCase()}.pdf`;
    if (fs.existsSync(fileName)) {
      try {
        await ctx.replyWithDocument({ source: fileName }, {
          caption: `📖 ${archetypeName}`
        });
        // Небольшая задержка между отправками файлов
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ Ошибка отправки файла ${fileName}:`, error);
        // Уведомляем пользователя о проблеме с файлом
        await ctx.reply(`⚠️ Не удалось отправить описание архетипа "${archetypeName}"`);
      }
    } else {
      console.warn(`⚠️ Файл не найден: ${fileName}`);
      await ctx.reply(`⚠️ Описание архетипа "${archetypeName}" временно недоступно`);
    }
  }

  // Очищаем состояние пользователя и выходим из сцены
  cache.deleteUserState(userId);
  await ctx.scene.leave();

  // Показываем главное меню
  await ctx.reply('🏠 Вы вернулись в главное меню', {
    reply_markup: {
              keyboard: [
          ['🎯 Начать тест']
        ],
      resize_keyboard: true
    }
  });
}

// Выход из сцены
testScene.leave((ctx) => {
  const userId = ctx.from.id;
  cache.deleteUserState(userId);
});