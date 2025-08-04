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

// Функция для получения состояния пользователя (для админ-панели)
function getUserState(userId) {
  return userStates.get(userId) || null;
}

// Инициализация админ-панели
const adminPanel = new AdminPanelHandler(bot, getUserState);

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

// Проверка является ли пользователь владельцем бота
function isOwner(userId) {
  const ownerId = process.env.ADMIN_USER_ID;
  return ownerId && userId.toString() === ownerId.toString();
}

// Проверка подписки пользователя на канал
async function checkSubscription(userId) {
  // Владелец бота освобождается от проверки подписки
  if (isOwner(userId)) {
    console.log('🔑 Владелец бота освобождён от проверки подписки:', userId);
    return true;
  }
  
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
    // Владелец бота освобождается от проверки комментариев
    if (isOwner(userId)) {
      console.log('🔑 Владелец бота освобождён от проверки комментариев:', userId);
    } else if (!allowedToContinue.has(userId)) {
      waitingForComment.add(userId);
      console.log('Пользователь должен оставить комментарий, добавлен в waitingForComment:', Array.from(waitingForComment));
      await ctx.reply(
        'Чтобы продолжить тест, оставьте комментарий с текстом "тест" в нашей группе, затем вернитесь сюда и продолжите тест',
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

  resultMessage += `\n\nВ современной психологии выделяют 12 ключевых архетипов:
 1. 🐣 Дитя — Доверие, Мечтательность
 2. 🧑‍🤝‍🧑 Славный малый — Дружба, Равенство
 3. 🛡 Опекун — Забота, Семья
 4. 🧭 Искатель — Новизна, Авантюризм
 5. 🔥 Бунтарь — Провокация, Борьба за справедливость
 6. ⚔️ Воин — Достижения, Лидерство
 7. 💘 Любовник — Любовь, Эстетика
 8. 🎨 Творец — Творчество, Уникальность
 9. 🎭 Шут — Юмор, Харизма
 10. 📚 Мудрец — Наука, Опыт
 11. 🧙‍♂️ Маг — Тайна, Трансформация
 12. 👑 Правитель — Власть, Порядок

В каждом из нас эти архетипы заложены как потенциал, но мы не используем все одновременно. Исходя из жизненного опыта, чаще опираемся на те стратегии, что эффективнее ведут к результату. 

Одного архетипа тоже недостаточно. Мы не действуем одинаково во всех сферах: работа, семья, хобби, дружба и тд. Контекст меняется, и вместе с ним включаются разные внутренние роли.

Это не значит, что человек, у которого в карте архетипов нет любовника, не понимает, что такое любить. Он принимает решения, ставя на первое место другие ценности. Например, карьеру, если он Воин. Или заботу, если Опекун.

Как правило, именно 4 архетипа формируют поведенческое ядро. Они не конкурируют друг с другом, а закрывают разные аспекты жизни, позволяя действовать гибко и последовательно.

Это и создает уникальную структуру личности. Ты можешь быть собой в любых обстоятельствах.`

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

// УДАЛЕН: Этот обработчик блокировал админ-панель!
// Обработка неизвестных callback queries перенесена в конец файла

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
      // Добавляем альтернативный способ - ручное подтверждение
      await ctx.reply(
        'Чтобы продолжить тест, выполните одно из действий:\n\n' +
        '1️⃣ Оставьте комментарий с текстом "тест" в нашей группе\n' +
        '2️⃣ Или нажмите кнопку "Я оставил комментарий"',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Группа для комментария', url: process.env.COMMENT_GROUP_LINK }],
              [{ text: 'Я оставил комментарий', callback_data: 'confirm_comment' }]
            ]
          }
        }
      );
    }
  } else {
    await ctx.reply('Вам не нужно использовать эту команду сейчас.');
  }
});

// Обработка подтверждения комментария
bot.action('confirm_comment', async (ctx) => {
  const userId = ctx.from.id;
  console.log('Подтверждение комментария от пользователя:', userId);
  
  if (waitingForComment.has(userId)) {
    // Добавляем пользователя в список разрешённых
    allowedToContinue.add(userId);
    waitingForComment.delete(userId);
    
    await ctx.answerCbQuery('✅ Комментарий подтверждён!');
    console.log('Пользователь подтвердил комментарий, продолжаем тест');
    await sendQuestion(ctx, userId);
  } else {
    await ctx.answerCbQuery('❌ Вам не нужно подтверждать комментарий сейчас');
  }
});

// Команда для отладки системы комментариев
bot.command('debug_comment', async (ctx) => {
  const userId = ctx.from.id;
  console.log('🔍 Отладка системы комментариев для пользователя:', userId);
  
  const isWaiting = waitingForComment.has(userId);
  const isAllowed = allowedToContinue.has(userId);
  
  let message = `🔍 *Отладка системы комментариев*\n\n`;
  message += `*Ваш ID:* \`${userId}\`\n`;
  message += `*Ожидает комментарий:* ${isWaiting ? 'Да' : 'Нет'}\n`;
  message += `*Разрешён продолжить:* ${isAllowed ? 'Да' : 'Нет'}\n`;
  message += `*COMMENT_GROUP_ID:* \`${COMMENT_GROUP_ID || 'Не настроен'}\`\n`;
  message += `*Разрешённые пользователи:* \`[1087968824]\`\n\n`;
  
  if (isWaiting && !isAllowed) {
    message += `💡 *Рекомендации:*\n`;
    message += `1. Оставьте комментарий "тест" в группе\n`;
    message += `2. Или нажмите кнопку "Я оставил комментарий"\n`;
    message += `3. Или используйте команду /force_continue`;
  }
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// Команда для принудительного продолжения (для отладки)
bot.command('force_continue', async (ctx) => {
  const userId = ctx.from.id;
  console.log('🚀 Принудительное продолжение для пользователя:', userId);
  
  if (waitingForComment.has(userId)) {
    allowedToContinue.add(userId);
    waitingForComment.delete(userId);
    
    await ctx.reply('🚀 Принудительное продолжение активировано!');
    console.log('Пользователь принудительно продолжает тест');
    await sendQuestion(ctx, userId);
  } else {
    await ctx.reply('❌ Вам не нужно принудительное продолжение');
  }
});

// Простейший тест клавиатуры
bot.command('simple_test', async (ctx) => {
  const userId = ctx.from.id;
  
  if (!isOwner(userId)) {
    await ctx.reply('❌ Эта команда доступна только владельцу бота.');
    return;
  }
  
  console.log('🚀 SIMPLE TEST: Отправляем простую inline кнопку');
  
  await ctx.reply('🚀 ПРОСТОЙ ТЕСТ: Вот inline кнопка', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🎯 ТЕСТ', callback_data: 'simple_test_button' }
      ]]
    }
  });
  
  console.log('✅ SIMPLE TEST: inline кнопка отправлена');
  
  await ctx.reply('🚀 ПРОСТОЙ ТЕСТ: Вот reply кнопка', {
    reply_markup: {
      keyboard: [['🎯 ТЕСТ REPLY']],
      resize_keyboard: true
    }
  });
  
  console.log('✅ SIMPLE TEST: reply кнопка отправлена');
});

// Обработчик простой кнопки
bot.action('simple_test_button', async (ctx) => {
  console.log('🎯 SIMPLE TEST: Inline кнопка нажата!');
  await ctx.answerCbQuery('🎯 Inline кнопка работает!');
  await ctx.reply('✅ INLINE КНОПКА СРАБОТАЛА!');
});

bot.hears('🎯 ТЕСТ REPLY', async (ctx) => {
  console.log('🎯 SIMPLE TEST: Reply кнопка нажата!');
  await ctx.reply('✅ REPLY КНОПКА СРАБОТАЛА!');
});

// Команда для определения вашего Telegram ID
bot.command('my_id', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;
  const isBot = ctx.from.is_bot;
  const isOwnerUser = isOwner(userId);
  
  console.log('🆔 Запрос ID от пользователя:', userId, username, firstName, 'is_bot:', isBot, 'is_owner:', isOwnerUser);
  
  // Проверяем админские права
  let isAdminUser = false;
  try {
    isAdminUser = await userService.isAdmin(userId);
  } catch (error) {
    console.log('❌ Ошибка проверки админских прав:', error.message);
  }
  
  let message = `🆔 *Ваша информация:*\n\n`;
  message += `*ID:* \`${userId}\`\n`;
  message += `*Username:* ${username ? '@' + username : 'Не указан'}\n`;
  message += `*Имя:* ${firstName || 'Не указано'}\n`;
  message += `*Тип аккаунта:* ${isBot ? 'Бот' : 'Пользователь'}\n`;
  message += `*Владелец бота:* ${isOwnerUser ? '✅ Да' : '❌ Нет'}\n`;
  message += `*Администратор:* ${isAdminUser ? '✅ Да' : '❌ Нет'}\n\n`;
  
  if (isOwnerUser) {
    message += `👑 *Привилегии владельца:*\n`;
    message += `• Проход теста без подписки на канал\n`;
    message += `• Проход теста без комментариев\n`;
    message += `• Доступ к админ-панели (/admin)\n\n`;
  }
  
  message += `*Текущий список разрешённых ID:* \`[1087968824]\`\n`;
  message += `*ADMIN_USER_ID:* \`${process.env.ADMIN_USER_ID || 'Не настроен'}\`\n`;
  message += `*DATABASE_URL:* ${process.env.DATABASE_URL ? '✅ Настроен' : '❌ Не настроен'}`;
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// Команда для тестирования клавиатур
bot.command('test_keyboard', async (ctx) => {
  const userId = ctx.from.id;
  
  if (!isOwner(userId)) {
    await ctx.reply('❌ Эта команда доступна только владельцу бота.');
    return;
  }
  
  console.log('🧪 Начинаем тестирование клавиатур...');
  
  // Тест 1: Самая простая inline кнопка
  try {
    await ctx.reply('🧪 Тест 1: Простая inline кнопка', {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Тест кнопка', callback_data: 'test_button' }
        ]]
      }
    });
    console.log('✅ Тест 1 отправлен');
  } catch (error) {
    console.error('❌ Ошибка Тест 1:', error);
  }
  
  // Тест 2: Простая reply клавиатура  
  try {
    await ctx.reply('🧪 Тест 2: Простая reply клавиатура', {
      reply_markup: {
        keyboard: [['✅ Тест кнопка']],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    console.log('✅ Тест 2 отправлен');
  } catch (error) {
    console.error('❌ Ошибка Тест 2:', error);
  }
  
  // Тест 3: Через Markup.inlineKeyboard  
  try {
    const { Markup } = require('telegraf');
    await ctx.reply('🧪 Тест 3: Markup.inlineKeyboard', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('✅ Тест Markup', 'test_markup')]
      ])
    });
    console.log('✅ Тест 3 отправлен');
  } catch (error) {
    console.error('❌ Ошибка Тест 3:', error);
  }
  
  // Тест 4: Через Markup.keyboard
  try {
    const { Markup } = require('telegraf');
    await ctx.reply('🧪 Тест 4: Markup.keyboard', {
      reply_markup: Markup.keyboard([['✅ Тест Markup Reply']]).resize()
    });
    console.log('✅ Тест 4 отправлен');
  } catch (error) {
    console.error('❌ Ошибка Тест 4:', error);
  }
});

// Команда для тестирования подключения к базе данных
bot.command('test_db', async (ctx) => {
  const userId = ctx.from.id;
  
  // Проверяем, что это владелец бота
  if (!isOwner(userId)) {
    await ctx.reply('❌ Эта команда доступна только владельцу бота.');
    return;
  }
  
  console.log('🔍 Тестирование подключения к базе данных...');
  
  let message = '🔍 *Тест базы данных:*\n\n';
  
  try {
    // Проверяем пользователя в БД
    const user = await userService.getUserByTelegramId(userId);
    message += `*Пользователь в БД:* ${user ? '✅ Найден' : '❌ Не найден'}\n`;
    
    if (user) {
      message += `*ID в БД:* ${user.id}\n`;
      message += `*is_admin:* ${user.is_admin ? '✅ true' : '❌ false'}\n`;
      message += `*Дата создания:* ${user.created_at}\n`;
    }
    
    // Проверяем админские права
    const isAdminUser = await userService.isAdmin(userId);
    message += `*Проверка isAdmin():* ${isAdminUser ? '✅ true' : '❌ false'}\n\n`;
    
    message += '✅ *Подключение к базе данных работает!*';
    
  } catch (error) {
    console.error('❌ Ошибка теста БД:', error);
    message += `❌ *Ошибка подключения к БД:*\n\`${error.message}\``;
  }
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// --- ДОБАВЛЕНО: Отслеживание комментариев в группе ---
const COMMENT_GROUP_ID = process.env.COMMENT_GROUP_ID ? Number(process.env.COMMENT_GROUP_ID) : undefined;
if (!COMMENT_GROUP_ID) {
  console.warn('Внимание: переменная окружения COMMENT_GROUP_ID не задана! Бот не сможет отслеживать комментарии в группе.');
} else {
  console.log('✅ COMMENT_GROUP_ID настроен:', COMMENT_GROUP_ID);
}

bot.on('message', async (ctx, next) => {
  // Проверяем, что сообщение из нужной группы
  if (ctx.chat && ctx.chat.id === COMMENT_GROUP_ID) {
    console.log('📨 Сообщение из целевой группы:', ctx.chat.id, 'от пользователя:', ctx.from?.id);
    const text = ctx.message.text || '';
    const userId = ctx.from?.id;
    
    // Проверяем, что это реальный пользователь, а не бот или системное сообщение
    // Исключение: разрешаем продолжение для определённых пользователей даже если они помечены как бот
    const allowedUsers = [1087968824]; // Добавьте сюда ваш ID если нужно
    
    if (userId && 
        userId !== 777000 && 
        (!ctx.from.is_bot || allowedUsers.includes(userId)) && 
        !ctx.message.is_automatic_forward && 
        text.toLowerCase().includes('тест')) {
      console.log('✅ Сообщение из группы-комментариев от пользователя:', userId, text);
      allowedToContinue.add(userId);
      console.log('✅ allowedToContinue теперь:', Array.from(allowedToContinue));
    } else {
      const reason = [];
      if (userId === 777000) reason.push('Telegram service');
      if (ctx.from?.is_bot && !allowedUsers.includes(userId)) reason.push('bot account');
      if (ctx.message.is_automatic_forward) reason.push('automatic forward');
      if (!text.toLowerCase().includes('тест')) reason.push('no "тест" keyword');
      
      console.log('❌ Сообщение из группы-комментариев (игнорируется):', userId, text, 'Причина:', reason.join(', '));
    }
  } else if (ctx.chat) {
    console.log('📨 Сообщение из другой группы:', ctx.chat.id, 'настроена группа:', COMMENT_GROUP_ID);
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

// Обработчики тестовых кнопок
bot.action('test_button', async (ctx) => {
  await ctx.answerCbQuery('✅ Простая inline кнопка работает!');
  await ctx.reply('🎉 Простая inline кнопка сработала!');
});

bot.action('test_markup', async (ctx) => {
  await ctx.answerCbQuery('✅ Markup inline кнопка работает!');
  await ctx.reply('🎉 Markup inline кнопка сработала!');
});

bot.hears('✅ Тест кнопка', async (ctx) => {
  await ctx.reply('🎉 Простая reply кнопка сработала!');
});

bot.hears('✅ Тест Markup Reply', async (ctx) => {
  await ctx.reply('🎉 Markup reply кнопка сработала!');
});

// Обработка неизвестных callback queries (ДОЛЖЕН БЫТЬ САМЫМ ПОСЛЕДНИМ!)
bot.action(/.*/, async (ctx) => {
  console.log('⚠️ Неизвестный callback query:', ctx.callbackQuery?.data);
  try {
    await ctx.answerCbQuery('Неизвестная команда');
  } catch (error) {
    console.log('Не удалось ответить на неизвестный callback query:', error.message);
  }
});