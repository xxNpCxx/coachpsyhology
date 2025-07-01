const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, 'analytics.log');

function logEvent(userId, event, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId,
    event,
    ...data && Object.keys(data).length > 0 ? { data } : {}
  };
  fs.appendFile(logFilePath, JSON.stringify(logEntry) + '\n', err => {
    if (err) {
      console.error('Ошибка записи лога:', err);
    }
  });
}

module.exports = { logEvent }; 