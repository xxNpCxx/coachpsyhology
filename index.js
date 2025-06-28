require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Загрузка вопросов из JSON файла
const archetypesData = JSON.parse(fs.readFileSync('./questions.json', 'utf8'));

// Преобразование структуры в плоский массив вопросов
const questions = [];
Object.entries(archetypesData).forEach(([archetype, questionsList]) => {
  questionsList.forEach(questionText => {
    questions.push({
      text: questionText,
      archetype: archetype
    });
  });
});

// Хранилище состояния пользователей в памяти
const userStates = new Map();

// Структура состояния пользователя
class UserState {
  constructor() {
    this.currentQuestionIndex = 0;
    this.answers = [];
    this.archetypeScores = new Map();
  }
}

// Инициализация счетчиков архетипов
function initializeArchetypeScores() {
  const scores = new Map();
  Object.keys(archetypesData).forEach(archetype => {
    scores.set(archetype, 0);
  });
  return scores;
}

// Обработка команды /start
bot.command('start', (ctx) => {
  const userId = ctx.from.id;
  
  // Инициализация состояния пользователя
  userStates.set(userId, new UserState());
  const userState = userStates.get(userId);
  userState.archetypeScores = initializeArchetypeScores();
  
  // Отправка первого вопроса
  sendQuestion(ctx, userId);
});

// Отправка вопроса пользователю
function sendQuestion(ctx, userId) {
  const userState = userStates.get(userId);
  
  if (userState.currentQuestionIndex >= questions.length) {
    // Тест завершен, показываем результаты
    showResults(ctx, userId);
    return;
  }
  
  const question = questions[userState.currentQuestionIndex];
  const questionNumber = userState.currentQuestionIndex + 1;
  const totalQuestions = questions.length;
  
  const message = `Вопрос ${questionNumber} из ${totalQuestions}:\n\n${question.text}`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '0', callback_data: 'answer_0' },
        { text: '1', callback_data: 'answer_1' },
        { text: '2', callback_data: 'answer_2' },
        { text: '3', callback_data: 'answer_3' }
      ]
    ]
  };
  
  ctx.reply(message, { reply_markup: keyboard });
}

// Обработка ответов пользователя
bot.action(/answer_(\d)/, (ctx) => {
  const userId = ctx.from.id;
  const answer = parseInt(ctx.match[1]);
  
  if (!userStates.has(userId)) {
    ctx.answerCbQuery('Начните тест заново с команды /start');
    return;
  }
  
  const userState = userStates.get(userId);
  const currentQuestion = questions[userState.currentQuestionIndex];
  
  // Сохраняем ответ
  userState.answers.push({
    questionIndex: userState.currentQuestionIndex,
    answer: answer,
    archetype: currentQuestion.archetype
  });
  
  // Добавляем баллы к архетипу
  const currentScore = userState.archetypeScores.get(currentQuestion.archetype) || 0;
  userState.archetypeScores.set(currentQuestion.archetype, currentScore + answer);
  
  // Переходим к следующему вопросу
  userState.currentQuestionIndex++;
  
  // Отвечаем на callback query
  ctx.answerCbQuery();
  
  // Удаляем предыдущее сообщение с кнопками
  ctx.deleteMessage();
  
  // Отправляем следующий вопрос
  sendQuestion(ctx, userId);
});

// Показ результатов теста
function showResults(ctx, userId) {
  const userState = userStates.get(userId);
  
  // Сортируем архетипы по баллам (по убыванию)
  const sortedArchetypes = Array.from(userState.archetypeScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4); // Берем топ-4
  
  let resultMessage = '🎯 Результаты вашего теста архетипов:\n\n';
  resultMessage += 'Ваши 4 наиболее выраженных архетипа:\n\n';
  
  sortedArchetypes.forEach((archetype, index) => {
    const [name, score] = archetype;
    const maxPossibleScore = archetypesData[name].length * 3;
    const percentage = Math.round((score / maxPossibleScore) * 100);
    
    resultMessage += `${index + 1}. ${name}: ${score} баллов (${percentage}%)\n`;
  });
  
  resultMessage += '\nДля прохождения теста заново используйте /start';
  
  ctx.reply(resultMessage);
  
  // Очищаем состояние пользователя
  userStates.delete(userId);
}

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Ошибка для ${ctx.updateType}:`, err);
  ctx.reply('Произошла ошибка. Попробуйте еще раз или начните тест заново с /start');
});

// Запуск бота
bot.launch()
  .then(() => {
    console.log('🤖 Бот запущен!');
    console.log('📝 Добавьте вопросы в файл questions.json');
    console.log('🔑 Установите BOT_TOKEN в .env файле');
    console.log(`📊 Загружено ${Object.keys(archetypesData).length} архетипов с ${questions.length} вопросами`);
  })
  .catch((err) => {
    console.error('Ошибка запуска бота:', err);
  });

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 