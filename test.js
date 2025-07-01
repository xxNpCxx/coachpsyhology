const fs = require('fs');
const path = require('path');

// Загружаем данные архетипов
const archetypesData = JSON.parse(fs.readFileSync('./questions.json', 'utf8'));

// Функция для подсчета баллов (такая же как в основном коде)
function calculateScores(answers) {
  const scores = new Map();
  
  // Инициализация счетчиков
  Object.keys(archetypesData).forEach(archetype => {
    scores.set(archetype, 0);
  });
  
  // Подсчет баллов
  answers.forEach(answer => {
    const scoreForAnswer = 3 - answer.answer; // 0->3, 1->2, 2->1, 3->0
    const currentScore = scores.get(answer.archetype) || 0;
    scores.set(answer.archetype, currentScore + scoreForAnswer);
  });
  
  return scores;
}

// Тестовые данные
function runTests() {
  console.log('Запуск тестов подсчета баллов...\n');
  
  // Тест 1: Все ответы "Полностью согласен" (0)
  console.log('Тест 1: Все ответы "Полностью согласен"');
  const testAnswers1 = [
    { archetype: 'Правитель', answer: 0 },
    { archetype: 'Правитель', answer: 0 },
    { archetype: 'Правитель', answer: 0 }
  ];
  const scores1 = calculateScores(testAnswers1);
  console.log('Правитель:', scores1.get('Правитель'), 'баллов (ожидается 9)');
  console.log('Результат:', scores1.get('Правитель') === 9 ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН');
  console.log('');
  
  // Тест 2: Все ответы "Это совсем не про меня" (3)
  console.log('Тест 2: Все ответы "Это совсем не про меня"');
  const testAnswers2 = [
    { archetype: 'Шут', answer: 3 },
    { archetype: 'Шут', answer: 3 },
    { archetype: 'Шут', answer: 3 }
  ];
  const scores2 = calculateScores(testAnswers2);
  console.log('Шут:', scores2.get('Шут'), 'баллов (ожидается 0)');
  console.log('Результат:', scores2.get('Шут') === 0 ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН');
  console.log('');
  
  // Тест 3: Смешанные ответы
  console.log('Тест 3: Смешанные ответы');
  const testAnswers3 = [
    { archetype: 'Воин', answer: 0 }, // 3 балла
    { archetype: 'Воин', answer: 1 }, // 2 балла
    { archetype: 'Воин', answer: 2 }, // 1 балл
    { archetype: 'Воин', answer: 3 }  // 0 баллов
  ];
  const scores3 = calculateScores(testAnswers3);
  console.log('Воин:', scores3.get('Воин'), 'баллов (ожидается 6)');
  console.log('Результат:', scores3.get('Воин') === 6 ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН');
  console.log('');
  
  // Тест 4: Проверка максимально возможных баллов для каждого архетипа
  console.log('Тест 4: Максимально возможные баллы для архетипов');
  Object.keys(archetypesData).forEach(archetype => {
    const questionCount = archetypesData[archetype].length;
    const maxPossibleScore = questionCount * 3;
    console.log(`${archetype}: ${questionCount} вопросов, максимум ${maxPossibleScore} баллов`);
  });
  console.log('');
  
  // Тест 5: Проверка соответствия изображений номерам
  console.log('Тест 5: Проверка соответствия изображений номерам');
  const questionsFolder = path.join(__dirname, 'questions');
  const imageFiles = fs.readdirSync(questionsFolder)
    .filter(file => file.match(/^\d+\.jpg$/))
    .map(file => parseInt(file.replace('.jpg', '')))
    .sort((a, b) => a - b);
  
  console.log('Найдены изображения с номерами:', imageFiles);
  
  // Проверяем, что все номера из questions.json соответствуют изображениям
  const allQuestionNumbers = new Set();
  Object.values(archetypesData).forEach(numbers => {
    numbers.forEach(num => allQuestionNumbers.add(parseInt(num)));
  });
  
  const missingImages = Array.from(allQuestionNumbers).filter(num => !imageFiles.includes(num));
  const extraImages = imageFiles.filter(num => !allQuestionNumbers.has(num));
  
  if (missingImages.length === 0 && extraImages.length === 0) {
    console.log('✅ Все изображения соответствуют номерам в questions.json');
  } else {
    if (missingImages.length > 0) {
      console.log('❌ Отсутствуют изображения для номеров:', missingImages);
    }
    if (extraImages.length > 0) {
      console.log('⚠️ Лишние изображения с номерами:', extraImages);
    }
  }
  
  // Тест 6: Проверка наличия PDF файлов архетипов
  console.log('\nТест 6: Проверка наличия PDF файлов архетипов');
  const answersFolder = path.join(__dirname, 'answers');
  if (fs.existsSync(answersFolder)) {
    const pdfFiles = fs.readdirSync(answersFolder).filter(file => file.endsWith('.pdf'));
    console.log('Найдены PDF файлы:', pdfFiles);
    
    // Проверяем соответствие PDF файлов архетипам
    const archetypeNames = Object.keys(archetypesData);
    const missingPdfs = archetypeNames.filter(archetype => {
      const pdfPath = path.join(answersFolder, archetype.toLowerCase() + '.pdf');
      return !fs.existsSync(pdfPath);
    });
    
    if (missingPdfs.length === 0) {
      console.log('✅ Все PDF файлы архетипов найдены');
    } else {
      console.log('❌ Отсутствуют PDF файлы для архетипов:', missingPdfs);
    }
  } else {
    console.log('❌ Папка answers/ не найдена');
  }
  
  // Тест 7: Проверка расчёта процентов топ-4 относительно их суммы
  console.log('\nТест 7: Проверка расчёта процентов топ-4 относительно их суммы');
  // Пример: 4 архетипа с баллами 10, 20, 30, 40
  const top4 = [
    ['Архетип1', 10],
    ['Архетип2', 20],
    ['Архетип3', 30],
    ['Архетип4', 40],
  ];
  const topSum = top4.reduce((acc, [_, score]) => acc + score, 0);
  const percents = top4.map(([name, score]) => Math.round((score / topSum) * 100));
  console.log('Баллы:', top4.map(([_, score]) => score));
  console.log('Сумма:', topSum);
  console.log('Проценты:', percents);
  const expected = [10, 20, 30, 40].map(v => Math.round((v/100)*100)); // [10, 20, 30, 40]
  const ok = percents.join(',') === expected.join(',');
  console.log('Ожидается:', expected);
  console.log('Результат:', ok ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН');
  
  // Тест 8: Проверка формирования media group из 4 PDF-файлов для топ-4 архетипов
  console.log('\nТест 8: Проверка формирования media group из 4 PDF-файлов для топ-4 архетипов');
  // Мокаем функцию getArchetypePdfPath
  function mockGetArchetypePdfPath(name) {
    return `/mock/path/${name.toLowerCase()}.pdf`;
  }
  const top4Archetypes = [
    ['Правитель', 15],
    ['Шут', 12],
    ['Воин', 10],
    ['Мудрец', 8]
  ];
  const expectedDocs = [
    { type: 'document', media: { source: '/mock/path/правитель.pdf' } },
    { type: 'document', media: { source: '/mock/path/шут.pdf' } },
    { type: 'document', media: { source: '/mock/path/воин.pdf' } },
    { type: 'document', media: { source: '/mock/path/мудрец.pdf' } }
  ];
  const docs = [];
  for (let i = 0; i < top4Archetypes.length; i++) {
    const [archetypeName] = top4Archetypes[i];
    const pdfPath = mockGetArchetypePdfPath(archetypeName);
    if (pdfPath) {
      docs.push({ type: 'document', media: { source: pdfPath } });
    }
  }
  const ok8 = JSON.stringify(docs) === JSON.stringify(expectedDocs);
  console.log('Сформировано:', docs);
  console.log('Ожидается:', expectedDocs);
  console.log('Результат:', ok8 ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН');
  
  console.log('\n🎯 Тесты завершены!');
}

// Запуск тестов
runTests(); 