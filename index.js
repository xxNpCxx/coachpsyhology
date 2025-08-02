require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { logEvent } = require('./logger');
const { trackEvent, setUserOnce } = require('./analytics');

// Импорты для админ-панели
const userService = require('./services/userService');
const testResultService = require('./services/testResultService');
const AdminPanelHandler = require('./handlers/adminPanel');

// Импорт системы миграций
const { runMigrations } = require('./migrations/migrate');

const allowedToContinue = new Set();
const waitingForComment = new Set();

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Инициализация админ-панели
const adminPanel = new AdminPanelHandler(bot);

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

// Проверка подписки пользователя на канал
async function checkSubscription(userId) {
  const channelId = process.env.REQUIRED_CHANNEL_ID;
  if (!channelId) return true; // если канал не задан, пропускаем проверку
  try {
    const member = await bot.telegram.getChatMember(channelId, userId);
    // Статусы, при которых пользователь считается подписанным
    const allowed = ['member', 'administrator', 'creator'];
    return allowed.includes(member.status);
  } catch (e) {
    // Если канал приватный или ошибка — считаем, что не подписан
    return false;
  }
}

function getChannelLink() {
  const link = process.env.REQUIRED_CHANNEL_LINK;
  if (!link) return undefined;
  if (link.startsWith('@')) {
    return `https://t.me/${link.slice(1)}`;
  }
  return link;
}

// Функция для генерации клавиатуры подписки
function getSubscriptionKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Подписаться', url: getChannelLink() }
      ],
      [
        { text: '▶️ Начать тест', callback_data: 'start_test' }
      ]
    ]
  };
}

function getReplyStartKeyboard() {
  return {
    keyboard: [[{ text: '/start' }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

// Обработка команды /start
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  
  // Сохраняем пользователя в базу данных
  try {
    await userService.upsertUser({
      telegram_id: userId,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
      language_code: ctx.from.language_code
    });
  } catch (error) {
    console.error('❌ Ошибка сохранения пользователя в БД:', error);
  }
  
  // Сохраняем пользователя в Mixpanel (people.set_once)
  setUserOnce(userId, {
    username: ctx.from.username,
    first_name: ctx.from.first_name + ' ' + ctx.from.last_name,
    language_code: ctx.from.language_code,
  });
  // Отправляем событие в Mixpanel
  trackEvent(userId, 'start_command', {});
  // Проверяем, проходил ли пользователь тест ранее
  const hasState = userStates.has(userId);
  const buttonText = hasState ? '🔄 Пройти снова' : '▶️ Начать тест';
  const callbackData = hasState ? 'restart_test' : 'start_test';
  await ctx.reply(`На каждом слайде вы увидите утверждение и 4 варианта ответа.
Ваша задача - выбрать, насколько каждое из утверждений вам соответствует.
Для более точного результата рекомендуется проходить в одиночестве. Старайтесь отвечать честно и осознанно.`, {
    reply_markup: {
      inline_keyboard: [[{ text: buttonText, callback_data: callbackData }]]
    }
  });
});

// Обработка нажатия на кнопку "Начать тест" или "Пройти снова"
bot.action(['start_test', 'restart_test'], async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  // Проверяем подписку
  const isSubscribed = await checkSubscription(userId);
  if (!isSubscribed) {
    await ctx.reply('Для прохождения теста подпишитесь на канал.', {
      reply_markup: getSubscriptionKeyboard()
    });
    return;
  }
  // Отправляем событие в Mixpanel
  trackEvent(userId, 'test_started', {});
  userStates.set(userId, {
    currentQuestionIndex: 0,
    answers: [],
    archetypeScores: initializeArchetypeScores()
  });
  await sendQuestion(ctx, userId);
});

// Отправка вопроса пользователю
async function sendQuestion(ctx, userId) {
  // Проверяем подписку
  const isSubscribed = await checkSubscription(userId);
  if (!isSubscribed) {
    await ctx.reply('Чтобы продолжить прохождение теста, подпишитесь на канал, затем нажмите /start.', {
      reply_markup: getSubscriptionKeyboard()
    });
    return;
  }
  const userState = userStates.get(userId);
  console.log('sendQuestion для', userId, 'currentQuestionIndex:', userState.currentQuestionIndex, 'allowedToContinue:', Array.from(allowedToContinue), 'waitingForComment:', Array.from(waitingForComment));

  // --- Новая логика: проверка комментария после каждого 5-го вопроса ---
  if (userState.currentQuestionIndex > 0 && userState.currentQuestionIndex % 5 === 0) {
    if (!allowedToContinue.has(userId)) {
      waitingForComment.add(userId);
      console.log('Пользователь должен оставить комментарий, добавлен в waitingForComment:', Array.from(waitingForComment));
      await ctx.reply(
        'Чтобы продолжить тест, оставьте комментарий с текстом "тест" в нашей группе, затем вернитесь сюда и нажмите /continue',
        {
          reply_markup: {
            inline_keyboard: [[{ text: 'Группа для комментария', url: process.env.COMMENT_GROUP_LINK }]]
          }
        }
      );
      return; // Не продолжаем тест!
    }
  }

  if (userState.currentQuestionIndex >= questions.length) {
    // Тест завершен, показываем результаты
    showResults(ctx, userId);
    return;
  }

  const question = questions[userState.currentQuestionIndex];
  const questionNumber = userState.currentQuestionIndex + 1;
  const totalQuestions = questions.length;

  // Эмодзи шкала прогресса
  const progressBarLength = 10;
  const filled = Math.round((questionNumber) / totalQuestions * progressBarLength);
  const progressBar = '🟩'.repeat(filled) + '⬜'.repeat(progressBarLength - filled);

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
      const caption = `Вопрос ${questionNumber} из ${totalQuestions}\n${progressBar}`;
      await ctx.replyWithPhoto(
        { source: imagePath },
        {
          caption: caption,
          reply_markup: keyboard
        }
      );
    } else {
      // Если изображение не найдено, отправляем текстовое сообщение
      const message = `Вопрос ${questionNumber} из ${totalQuestions}:\n${progressBar}\n\nИзображение "${question.text}" не найдено в папке questions/`;
      await ctx.reply(message, { reply_markup: keyboard });
    }
  } catch (error) {
    console.error('Ошибка отправки изображения:', error);
    // Fallback на текстовое сообщение
    const message = `Вопрос ${questionNumber} из ${totalQuestions}:\n${progressBar}\n\n${question.text}`;
    await ctx.reply(message, { reply_markup: keyboard });
  }
}

// Обработка ответов пользователя
bot.action(/answer_(\d)/, async (ctx) => {
  const userId = ctx.from.id;
  // Проверяем подписку
  const isSubscribed = await checkSubscription(userId);
  if (!isSubscribed) {
    await ctx.reply('Чтобы продолжить прохождение теста, подпишитесь на канал, затем нажмите /start.', {
      reply_markup: getSubscriptionKeyboard()
    });
    return;
  }
  const answer = parseInt(ctx.match[1]);

  // Сразу отвечаем на callback query, чтобы избежать ошибки
  try {
    await ctx.answerCbQuery();
  } catch (error) {
    console.log('Callback query уже обработан или устарел:', error.message);
    return;
  }

  if (!userStates.has(userId)) {
    ctx.reply('Тест не был начат или устарела сессия. Начните тест заново:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Начать заново', callback_data: 'start_test' }]
        ]
      }
    });
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

  // Отправляем событие в Mixpanel
  trackEvent(userId, 'question_answered', {
    questionIndex: userState.currentQuestionIndex,
    answer: answer,
    archetype: currentQuestion.archetype
  });
});

// Показ результатов теста
async function showResults(ctx, userId) {
  const userState = userStates.get(userId);

  // Сортируем архетипы по баллам (по убыванию)
  const sortedArchetypes = Array.from(userState.archetypeScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4); // Берем топ-4

  let resultMessage = `✅ РЕЗУЛЬТАТЫ 

4 наиболее выраженных архетипа:`;

  // Сумма баллов топ-4 архетипов
  const topSum = sortedArchetypes.reduce((acc, [_, score]) => acc + score, 0) || 1;

  sortedArchetypes.forEach((archetype, index) => {
    const [name, score] = archetype;
    // Новый расчет процентов относительно суммы топ-4
    const percentage = Math.round((score / topSum) * 100);
    resultMessage += `${index + 1}. ${name}: ${score} баллов (${percentage}%)\n`;
  });

  // Отправляем результаты
  await ctx.reply(resultMessage);

  // Собираем массив документов для отправки группой
  const documents = [];
  for (let i = 0; i < sortedArchetypes.length; i++) {
    const [archetypeName] = sortedArchetypes[i];
    const pdfPath = getArchetypePdfPath(archetypeName);
    if (pdfPath) {
      documents.push({ type: 'document', media: { source: pdfPath } });
    }
  }
  if (documents.length > 0) {
    await ctx.replyWithMediaGroup(documents);
  }

  // Сохраняем результаты в базу данных
  try {
    await testResultService.saveTestResults(userId, userState.archetypeScores);
    await testResultService.saveQuestionAnswers(userId, userState.answers);
  } catch (error) {
    console.error('❌ Ошибка сохранения результатов в БД:', error);
  }

  // Очищаем состояние пользователя
  userStates.delete(userId);
  allowedToContinue.delete(userId); // сбрасываем разрешение
  waitingForComment.delete(userId); // сбрасываем ожидание

  // Отправляем событие в Mixpanel
  trackEvent(userId, 'test_completed', {
    topArchetypes: sortedArchetypes
  });
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
    ctx.reply(
      'Тест не был начат или устарела сессия. Начните тест заново:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Начать заново', callback_data: 'start_test' }]
          ]
        }
      }
    );
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

// Middleware для обработки текстовых сообщений в админ-панели
bot.use(async (ctx, next) => {
  if (ctx.message && ctx.message.text && !ctx.message.text.startsWith('/')) {
    const handled = await adminPanel.handleTextMessage(ctx);
    if (handled) {
      return; // Сообщение обработано админ-панелью
    }
  }
  await next();
});

// Запуск HTTP сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`🌐 HTTP сервер запущен на порту ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📈 Status: http://localhost:${PORT}/status`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/webhook`);
  console.log(`⚙️ Set webhook: http://localhost:${PORT}/set-webhook`);

  // Автоматическое применение миграций при запуске
  if (process.env.DATABASE_URL) {
    try {
      console.log('🔄 Применение миграций базы данных...');
      await runMigrations();
      console.log('✅ Миграции применены успешно');
    } catch (error) {
      console.error('❌ Ошибка применения миграций:', error.message);
      console.log('⚠️ Бот продолжит работу, но некоторые функции могут быть недоступны');
      console.log('💡 Проверьте настройки DATABASE_URL в переменных окружения');
    }
  } else {
    console.log('⚠️ DATABASE_URL не настроен, миграции пропущены');
    console.log('💡 Для работы админ-панели настройте DATABASE_URL в .env файле');
  }

  // Автоматическая установка webhook при запуске (если есть домен)
  if (process.env.WEBHOOK_URL) {
    try {
      await bot.telegram.setWebhook(process.env.WEBHOOK_URL);
      console.log(`✅ Webhook установлен: ${process.env.WEBHOOK_URL}`);
    } catch (error) {
      console.log('⚠️ Не удалось установить webhook автоматически:', error.message);
    }
  }

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
});

// Обработка неизвестных callback queries (должен быть последним)
bot.action(/.*/, async (ctx) => {
  try {
    await ctx.answerCbQuery('Неизвестная команда');
  } catch (error) {
    console.log('Не удалось ответить на неизвестный callback query:', error.message);
  }
});

// Обработка нажатия на кнопку "Я подписался"
bot.action('check_subscription', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const isSubscribed = await checkSubscription(userId);
  if (!isSubscribed) {
    await ctx.reply('Похоже, вы ещё не подписались. Пожалуйста, подпишитесь на канал и попробуйте снова.', {
      reply_markup: getSubscriptionKeyboard()
    });
    return;
  }
  await ctx.reply('Спасибо за подписку! Теперь вы можете начать тест.', {
    reply_markup: {
      inline_keyboard: [[{ text: '▶️ Начать тест', callback_data: 'start_test' }]]
    }
  });
});

// --- ДОБАВЛЕНО: Команда /continue для повторной проверки ---
bot.command('continue', async (ctx) => {
  const userId = ctx.from.id;
  console.log('/continue от', userId, 'waitingForComment:', Array.from(waitingForComment), 'allowedToContinue:', Array.from(allowedToContinue));
  if (waitingForComment.has(userId)) {
    if (allowedToContinue.has(userId)) {
      waitingForComment.delete(userId);
      console.log('Пользователь прошёл проверку комментария, продолжаем тест');
      await sendQuestion(ctx, userId);
    } else {
      await ctx.reply(
        'Чтобы продолжить тест, сперва оставьте комментарий с текстом "тест" в нашей группе, затем вернитесь сюда и нажмите /continue',
        {
          reply_markup: {
            inline_keyboard: [[{ text: 'Группа для комментария', url: process.env.COMMENT_GROUP_LINK }]]
          }
        }
      );
    }
  } else {
    await ctx.reply('Вам не нужно использовать эту команду сейчас.');
  }
});

// --- ДОБАВЛЕНО: Отслеживание комментариев в группе ---
const COMMENT_GROUP_ID = process.env.COMMENT_GROUP_ID ? Number(process.env.COMMENT_GROUP_ID) : undefined;
if (!COMMENT_GROUP_ID) {
  console.warn('Внимание: переменная окружения COMMENT_GROUP_ID не задана! Бот не сможет отслеживать комментарии в группе.');
}
bot.on('message', async (ctx, next) => {
  console.log('Получено новое сообщение:', ctx.message);
  // Проверяем, что сообщение из нужной группы
  if (ctx.chat && ctx.chat.id === COMMENT_GROUP_ID) {
    const text = ctx.message.text || '';
    console.log('Сообщение из группы-комментариев:', ctx.from.id, text);
    if (text.toLowerCase().includes('тест')) {
      allowedToContinue.add(ctx.from.id);
      console.log('allowedToContinue теперь:', Array.from(allowedToContinue));
      // Больше не отвечаем на комментарий
    }
  }
  await next();
});

// --- ДОБАВЛЕНО: Отслеживание удаления комментариев с "тест" ---
bot.on('channel_post', async (ctx, next) => {
  // Это событие не подходит для удаления, но оставим для совместимости
  await next();
});

bot.on('raw', async (ctx, next) => {
  // Проверяем, есть ли update типа message или message_delete
  const update = ctx.update;
  // Для Telegraf 4.x и выше: удаление сообщений приходит как update.message_delete
  if (update.message && update.message.text && update.message.text.toLowerCase().includes('тест')) {
    // Это обычное сообщение, не удаление
    await next();
    return;
  }
  if (update.message && update.message.message_id && update.message.text === undefined && update.message.from) {
    // Это может быть удаление сообщения, но Telegraf не всегда поддерживает это напрямую
    // Поэтому используем update.message.from.id для удаления из allowedToContinue
    const userId = update.message.from.id;
    if (allowedToContinue.has(userId)) {
      allowedToContinue.delete(userId);
      console.log('Пользователь удалил комментарий с "тест", удалён из allowedToContinue:', userId);
    }
  }
  await next();
});