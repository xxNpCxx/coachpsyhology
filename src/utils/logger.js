/**
 * Система логирования для бота
 * Поддерживает разные уровни логирования через env переменные
 */

const isLogEnabled = (logType) => process.env[logType] === "true";

export const logger = {
  debug: (...args) => {
    if (isLogEnabled('DEBUG_LOGS')) {
      console.log('🔍 [DEBUG]', ...args);
    }
  },
  
  info: (...args) => {
    console.log('ℹ️ [INFO]', ...args);
  },
  
  warn: (...args) => {
    console.warn('⚠️ [WARN]', ...args);
  },
  
  error: (...args) => {
    console.error('❌ [ERROR]', ...args);
  },
  
  user: (userId, action, ...args) => {
    if (isLogEnabled('USER_LOGS')) {
      console.log(`👤 [USER:${userId}] ${action}:`, ...args);
    }
  },
  
  admin: (...args) => {
    if (isLogEnabled('ADMIN_LOGS')) {
      console.log('🔐 [ADMIN]', ...args);
    }
  },
  
  test: (...args) => {
    if (isLogEnabled('TEST_LOGS')) {
      console.log('🧪 [TEST]', ...args);
    }
  },
  
  db: (...args) => {
    if (isLogEnabled('DB_LOGS')) {
      console.log('🗄️ [DB]', ...args);
    }
  },
  
  cache: (...args) => {
    if (isLogEnabled('CACHE_LOGS')) {
      console.log('💾 [CACHE]', ...args);
    }
  }
};

export default logger;