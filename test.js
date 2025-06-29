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
  
  console.log('\n🎯 Тесты завершены!');
}

// Запуск тестов
runTests(); 