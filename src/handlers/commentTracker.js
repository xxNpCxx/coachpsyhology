import { commentsPG } from '../pg/comments.pg.js';
import { COMMENT_GROUP_ID } from '../config.js';

/**
 * Обработчик для отслеживания комментариев пользователей в группе
 * Автоматически сохраняет новые комментарии для проверки доступа к тесту
 */

export class CommentTracker {
  constructor(bot) {
    this.bot = bot;
    this.setupHandlers();
  }

  setupHandlers() {
    // Обработчик новых сообщений в группе
    this.bot.on('message', async (ctx) => {
      console.log(`🔍 [КОММЕНТЫ] Получено сообщение от ${ctx.message?.from?.first_name} (${ctx.message?.from?.id}) в чате ${ctx.message?.chat?.id}`);
      try {
        // Проверяем, что сообщение из нужной группы
        if (ctx.message.chat.id.toString() !== COMMENT_GROUP_ID) {
          console.log(`🔍 [КОММЕНТЫ] Сообщение не из группы ${COMMENT_GROUP_ID}, пропускаем`);
          return;
        }

        console.log(`🔍 [КОММЕНТЫ] Обрабатываем сообщение из группы ${COMMENT_GROUP_ID}`);

        // Проверяем, что это комментарий (не команда бота)
        if (ctx.message.text && !ctx.message.text.startsWith('/')) {
          await this.handleNewComment(ctx);
        }
      } catch (error) {
        console.error('❌ Ошибка обработки сообщения в группе:', error);
      }
    });

    // Обработчик редактирования сообщений
    this.bot.on('edited_message', async (ctx) => {
      try {
        if (ctx.editedMessage.chat.id.toString() !== COMMENT_GROUP_ID) {
          return;
        }

        if (ctx.editedMessage.text && !ctx.editedMessage.text.startsWith('/')) {
          await this.handleEditedComment(ctx);
        }
      } catch (error) {
        console.error('❌ Ошибка обработки редактирования сообщения:', error);
      }
    });
  }

  async handleNewComment(ctx) {
    try {
      const message = ctx.message;
      const userId = message.from.id;
      const messageId = message.message_id;
      const chatId = message.chat.id;
      const text = message.text;
      const timestamp = new Date(message.date * 1000); // Конвертируем Unix timestamp

      console.log(`💬 Новый комментарий от ${message.from.first_name} (${userId}) в группе ${chatId}`);

      // Сохраняем комментарий в базу данных
      await commentsPG.saveComment(userId, messageId, chatId, text, timestamp);

      console.log(`✅ Комментарий сохранен: ${text.substring(0, 50)}...`);

    } catch (error) {
      console.error('❌ Ошибка сохранения комментария:', error);
    }
  }

  async handleEditedComment(ctx) {
    try {
      const message = ctx.editedMessage;
      const userId = message.from.id;
      const messageId = message.message_id;
      const chatId = message.chat.id;
      const text = message.text;
      const timestamp = new Date(message.edit_date * 1000);

      console.log(`✏️ Отредактированный комментарий от ${message.from.first_name} (${userId})`);

      // Обновляем комментарий в базе данных
      await commentsPG.saveComment(userId, messageId, chatId, text, timestamp);

      console.log(`✅ Отредактированный комментарий обновлен: ${text.substring(0, 50)}...`);

    } catch (error) {
      console.error('❌ Ошибка обновления комментария:', error);
    }
  }

  // Метод для проверки доступа пользователя к тесту
  async checkUserAccess(userId) {
    try {
      if (!COMMENT_GROUP_ID) {
        console.warn('⚠️ COMMENT_GROUP_ID не настроен, пропускаем проверку комментариев');
        return { canTake: true, commentCount: 0, testCount: 0, requiredComments: 0 };
      }

      const result = await commentsPG.canUserTakeTest(userId, COMMENT_GROUP_ID);
      
      console.log(`🔍 Проверка доступа для ${userId}:`, result);
      
      return result;
    } catch (error) {
      console.error('❌ Ошибка проверки доступа:', error);
      // В случае ошибки разрешаем прохождение теста
      return { canTake: true, commentCount: 0, testCount: 0, requiredComments: 0 };
    }
  }

  // Метод для получения информации о комментариях пользователя
  async getUserCommentInfo(userId) {
    try {
      if (!COMMENT_GROUP_ID) {
        return { commentCount: 0, recentComments: [] };
      }

      const [commentCount, recentComments] = await Promise.all([
        commentsPG.getUserCommentCount(userId, COMMENT_GROUP_ID),
        commentsPG.getUserRecentComments(userId, COMMENT_GROUP_ID, 3)
      ]);

      return { commentCount, recentComments };
    } catch (error) {
      console.error('❌ Ошибка получения информации о комментариях:', error);
      return { commentCount: 0, recentComments: [] };
    }
  }
} 