/**
 * Система кеширования пользователей и их данных на время сессии
 * Оптимизирует взаимодействие с БД и уменьшает количество запросов
 */

class Cache {
  constructor() {
    // Кеш пользователей: userId -> userData
    this.users = new Map();
    
    // Кеш результатов тестов: userId -> testResults
    this.testResults = new Map();
    
    // Кеш состояний пользователей: userId -> userState
    this.userStates = new Map();
    
    // TTL для кеша (30 минут)
    this.TTL = 30 * 60 * 1000;
    
    // Очистка кеша каждые 5 минут
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Пользователи
  setUser(userId, userData) {
    this.users.set(userId, {
      data: userData,
      timestamp: Date.now()
    });
  }

  getUser(userId) {
    const cached = this.users.get(userId);
    if (cached && (Date.now() - cached.timestamp < this.TTL)) {
      return cached.data;
    }
    return null;
  }

  // Результаты тестов
  setTestResults(userId, results) {
    this.testResults.set(userId, {
      data: results,
      timestamp: Date.now()
    });
  }

  getTestResults(userId) {
    const cached = this.testResults.get(userId);
    if (cached && (Date.now() - cached.timestamp < this.TTL)) {
      return cached.data;
    }
    return null;
  }

  // Состояния пользователей
  setUserState(userId, state) {
    this.userStates.set(userId, state);
  }

  getUserState(userId) {
    return this.userStates.get(userId) || null;
  }

  deleteUserState(userId) {
    this.userStates.delete(userId);
  }

  // Очистка просроченного кеша
  cleanup() {
    const now = Date.now();
    
    // Очистка пользователей
    for (const [userId, cached] of this.users.entries()) {
      if (now - cached.timestamp > this.TTL) {
        this.users.delete(userId);
      }
    }
    
    // Очистка результатов тестов
    for (const [userId, cached] of this.testResults.entries()) {
      if (now - cached.timestamp > this.TTL) {
        this.testResults.delete(userId);
      }
    }
    
    console.log(`🧹 Очистка кеша: пользователи: ${this.users.size}, результаты: ${this.testResults.size}, состояния: ${this.userStates.size}`);
  }

  // Инвалидация конкретного пользователя
  invalidateUser(userId) {
    this.users.delete(userId);
    this.testResults.delete(userId);
  }

  // Статистика кеша
  getStats() {
    return {
      users: this.users.size,
      testResults: this.testResults.size,
      userStates: this.userStates.size
    };
  }
}

// Экспорт singleton instance
export const cache = new Cache();
export default cache;