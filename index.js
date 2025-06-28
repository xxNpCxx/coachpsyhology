require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

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

// Проверка существования изображения
function getImagePath(imageName) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  
  for (const ext of imageExtensions) {
    const imagePath = path.join(__dirname, 'questions', imageName + ext);
    if (fs.existsSync(imagePath)) {
      return imagePath;
    }
  }
  
  return null; // Изображение не найдено
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
async function sendQuestion(ctx, userId) {
  const userState = userStates.get(userId);
  
  if (userState.currentQuestionIndex >= questions.length) {
    // Тест завершен, показываем результаты
    showResults(ctx, userId);
    return;
  }
  
  const question = questions[userState.currentQuestionIndex];
  const questionNumber = userState.currentQuestionIndex + 1;
  const totalQuestions = questions.length;
  
  // Ищем изображение по названию вопроса
  const imagePath = getImagePath(question.text);
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Полностью согласен(на)', callback_data: 'answer_0' }
      ],
      [
        { text: 'Скорее да, чем нет', callback_data: 'answer_1' }
      ],
      [
        { text: 'Не знаю', callback_data: 'answer_2' }
      ],
      [
        { text: 'Это совсем не про меня', callback_data: 'answer_3' }
      ]
    ]
  };
  
  try {
    if (imagePath) {
      // Отправляем изображение с подписью и кнопками
      const caption = `Вопрос ${questionNumber} из ${totalQuestions}`;
      await ctx.replyWithPhoto(
        { source: imagePath },
        { 
          caption: caption,
          reply_markup: keyboard 
        }
      );
    } else {
      // Если изображение не найдено, отправляем текстовое сообщение
      const message = `Вопрос ${questionNumber} из ${totalQuestions}:\n\nИзображение "${question.text}" не найдено в папке questions/`;
      await ctx.reply(message, { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('Ошибка отправки изображения:', error);
    // Fallback на текстовое сообщение
    const message = `Вопрос ${questionNumber} из ${totalQuestions}:\n\n${question.text}`;
    await ctx.reply(message, { reply_markup: keyboard });
  }
}

// Обработка ответов пользователя
bot.action(/answer_(\d)/, async (ctx) => {
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
  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.log('Не удалось удалить сообщение:', error.message);
  }
  
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
    console.log('📝 Добавьте изображения в папку questions/');
    console.log('🔑 Установите BOT_TOKEN в .env файле');
    console.log(`📊 Загружено ${Object.keys(archetypesData).length} архетипов с ${questions.length} вопросами`);
    
    // Проверяем наличие изображений
    const questionsFolder = path.join(__dirname, 'questions');
    if (fs.existsSync(questionsFolder)) {
      const files = fs.readdirSync(questionsFolder);
      console.log(`🖼️ Найдено ${files.length} файлов в папке questions/`);
    } else {
      console.log('⚠️ Папка questions/ не найдена');
    }
  })
  .catch((err) => {
    console.error('Ошибка запуска бота:', err);
  });

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 