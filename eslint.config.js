import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';

export default [
  js.configs.recommended,
  {
    ignores: ['node_modules/', 'old/', '*.backup', '.env*', 'migrations/', 'scripts/', 'test.js', 'questions/', 'answers/']
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly'
      }
    },
    plugins: {
      import: importPlugin
    },
    rules: {
      // Импорты
      'import/no-unresolved': 'error',
      'import/no-absolute-path': 'error',
      'import/no-useless-path-segments': 'error',
      'import/extensions': ['error', 'always', { js: 'always' }],
      
      // ES Modules
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      
      // Качество кода
      'no-console': 'off', // Разрешаем console.log
      'prefer-const': 'error',
      'no-var': 'error',
      'no-duplicate-imports': 'error',
      
      // Telegram Bot специфичные
      'no-async-promise-executor': 'error',
      'require-await': 'error',
      'no-return-await': 'error',
      
      // Безопасность
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error'
    }
  },
  {
    // Настройки для старых CommonJS файлов
    files: ['scripts/**/*.js', 'migrations/**/*.js', 'test.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    },
    rules: {
      'import/no-unresolved': 'off' // Отключаем для старых файлов
    }
  }
];