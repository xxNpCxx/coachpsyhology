require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Загрузка вопросов из JSON файла
const archetypesData = JSON.parse(fs.readFileSync('./questions.json', 'utf8'));

// Преобразование структуры в плоский массив вопросов по порядку от 1 до 84
// Сохраняем порядок архетипов из JSON файла
const allQuestions = [];
const archetypeNames = Object.keys(archetypesData);

for (const archetype of archetypeNames) {
  for (const imageName of archetypesData[archetype]) {
    allQuestions.push({
      text: imageName,
      archetype: archetype
    });
  }
}

// Сортируем по числовому значению в text для правильного порядка изображений
const questions = allQuestions.sort((a, b) => {
  const numA = parseInt(a.text);
  const numB = parseInt(b.text);
  return numA - numB;
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

// Получение пути к PDF файлу архетипа
function getArchetypePdfPath(archetypeName) {
  const pdfPath = path.join(__dirname, 'answers', archetypeName.toLowerCase() + '.pdf');
  if (fs.existsSync(pdfPath)) {
    return pdfPath;
  }
  return null; // PDF файл не найден
}

// HTTP сервер для webhook и health check
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Webhook endpoint для Telegram
  if (req.url === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        await bot.handleUpdate(update);
        res.writeHead(200);
        res.end('OK');
      } catch (error) {
        console.error('Ошибка обработки webhook:', error);
        res.writeHead(500);
        res.end('Error');
      }
    });
    return;
  }

  // Health check endpoints
  if (req.url === '/health' || req.url === '/') {
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      bot: {
        name: 'Archetype Test Bot',
        version: '1.0.0',
        uptime: process.uptime(),
        users: userStates.size,
        questions: questions.length,
        archetypes: Object.keys(archetypesData).length,
        webhook: true
      },
      system: {
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    res.writeHead(200);
    res.end(JSON.stringify(healthData, null, 2));
  } else if (req.url === '/status') {
    const statusData = {
      status: 'running',
      uptime: process.uptime(),
      activeUsers: userStates.size,
      totalQuestions: questions.length,
      archetypes: Object.keys(archetypesData),
      webhook: true
    };

    res.writeHead(200);
    res.end(JSON.stringify(statusData, null, 2));
  } else if (req.url === '/set-webhook') {
    // Endpoint для установки webhook
    try {
      const webhookUrl = process.env.WEBHOOK_URL;
      await bot.telegram.setWebhook(webhookUrl);
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        webhookUrl: webhookUrl,
        message: 'Webhook установлен успешно'
      }));
    } catch (error) {
      console.error('Ошибка установки webhook:', error);
      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

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

  // Сразу отвечаем на callback query, чтобы избежать ошибки
  try {
    await ctx.answerCbQuery();
  } catch (error) {
    console.log('Callback query уже обработан или устарел:', error.message);
    return;
  }

  if (!userStates.has(userId)) {
    ctx.reply('Начните тест заново с команды /start');
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

  // Добавляем баллы к архетипу (исправленная логика)
  // 0 = "Полностью согласен" = 3 балла
  // 1 = "Скорее да, чем нет" = 2 балла  
  // 2 = "Не знаю" = 1 балл
  // 3 = "Это совсем не про меня" = 0 баллов
  const scoreForAnswer = 3 - answer;
  const currentScore = userState.archetypeScores.get(currentQuestion.archetype) || 0;
  userState.archetypeScores.set(currentQuestion.archetype, currentScore + scoreForAnswer);

  // Переходим к следующему вопросу
  userState.currentQuestionIndex++;

  // Удаляем предыдущее сообщение с кнопками
  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.log('Не удалось удалить сообщение:', error.message);
  }

  // Отправляем следующий вопрос
  await sendQuestion(ctx, userId);
});

// Показ результатов теста
async function showResults(ctx, userId) {
  const userState = userStates.get(userId);

  // Сортируем архетипы по баллам (по убыванию)
  const sortedArchetypes = Array.from(userState.archetypeScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4); // Берем топ-4

  let resultMessage = '🎯 Результаты вашего теста архетипов:\n\n';
  resultMessage += 'Ваши 4 наиболее выраженных архетипа:\n\n';

  // Сумма баллов топ-4 архетипов
  const topSum = sortedArchetypes.reduce((acc, [_, score]) => acc + score, 0) || 1;

  sortedArchetypes.forEach((archetype, index) => {
    const [name, score] = archetype;
    // Новый расчет процентов относительно суммы топ-4
    const percentage = Math.round((score / topSum) * 100);
    resultMessage += `${index + 1}. ${name}: ${score} баллов (${percentage}%)\n`;
  });

  resultMessage += '\n📚 Отправляю подробные описания ваших архетипов...';

  // Отправляем результаты
  await ctx.reply(resultMessage);

  // Отправляем PDF файлы для топ-4 архетипов
  for (let i = 0; i < sortedArchetypes.length; i++) {
    const [archetypeName, score] = sortedArchetypes[i];
    const pdfPath = getArchetypePdfPath(archetypeName);
    
    if (pdfPath) {
      try {
        const caption = `📖 ${archetypeName} - подробное описание архетипа`;
        await ctx.replyWithDocument(
          { source: pdfPath },
          { caption: caption }
        );
        
        // Небольшая задержка между отправками файлов
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Ошибка отправки PDF для архетипа ${archetypeName}:`, error);
        await ctx.reply(`❌ Не удалось отправить описание архетипа "${archetypeName}"`);
      }
    } else {
      console.error(`PDF файл не найден для архетипа: ${archetypeName}`);
      await ctx.reply(`⚠️ Описание архетипа "${archetypeName}" не найдено`);
    }
  }

  // Финальное сообщение
  await ctx.reply('✅ Все описания отправлены!\n\nДля прохождения теста заново используйте /start');

  // Очищаем состояние пользователя
  userStates.delete(userId);
}

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Ошибка для ${ctx.updateType}:`, err);

  // Специальная обработка для callback query ошибок
  if (err.description && err.description.includes('query is too old')) {
    console.log('Игнорируем устаревший callback query');
    return;
  }

  // Для других ошибок отправляем сообщение пользователю
  try {
    ctx.reply('Произошла ошибка. Попробуйте еще раз или начните тест заново с /start');
  } catch (replyError) {
    console.error('Не удалось отправить сообщение об ошибке:', replyError);
  }
});

// Middleware для логирования
bot.use(async (ctx, next) => {
  const start = new Date();
  await next();
  const ms = new Date() - start;
  console.log('Response time: %sms', ms);
});

// Запуск HTTP сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`🌐 HTTP сервер запущен на порту ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📈 Status: http://localhost:${PORT}/status`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/webhook`);
  console.log(`⚙️ Set webhook: http://localhost:${PORT}/set-webhook`);

  // Автоматическая установка webhook при запуске (если есть домен)
  if (process.env.WEBHOOK_URL) {
    try {
      await bot.telegram.setWebhook(process.env.WEBHOOK_URL);
      console.log(`✅ Webhook установлен: ${process.env.WEBHOOK_URL}`);
    } catch (error) {
      console.log('⚠️ Не удалось установить webhook автоматически:', error.message);
    }
  }
});

// Инициализация бота (без launch)
console.log('🤖 Бот инициализирован для работы через webhook!');
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

// Проверяем наличие PDF файлов архетипов
const answersFolder = path.join(__dirname, 'answers');
if (fs.existsSync(answersFolder)) {
  const pdfFiles = fs.readdirSync(answersFolder).filter(file => file.endsWith('.pdf'));
  console.log(`📚 Найдено ${pdfFiles.length} PDF файлов в папке answers/`);
  
  // Проверяем соответствие PDF файлов архетипам
  const archetypeNames = Object.keys(archetypesData);
  const missingPdfs = archetypeNames.filter(archetype => {
    const pdfPath = path.join(answersFolder, archetype.toLowerCase() + '.pdf');
    return !fs.existsSync(pdfPath);
  });
  
  if (missingPdfs.length > 0) {
    console.log('⚠️ Отсутствуют PDF файлы для архетипов:', missingPdfs);
  } else {
    console.log('✅ Все PDF файлы архетипов найдены');
  }
} else {
  console.log('⚠️ Папка answers/ не найдена');
}

// Graceful stop (только для HTTP сервера, не для бота)
process.once('SIGINT', () => {
  console.log('Получен сигнал SIGINT, останавливаем сервер...');
  server.close(() => {
    console.log('HTTP сервер остановлен');
    process.exit(0);
  });
});

process.once('SIGTERM', () => {
  console.log('Получен сигнал SIGTERM, останавливаем сервер...');
  server.close(() => {
    console.log('HTTP сервер остановлен');
    process.exit(0);
  });
});

// Обработка неизвестных callback queries (должен быть последним)
bot.action(/.*/, async (ctx) => {
  try {
    await ctx.answerCbQuery('Неизвестная команда');
  } catch (error) {
    console.log('Не удалось ответить на неизвестный callback query:', error.message);
  }
}); 