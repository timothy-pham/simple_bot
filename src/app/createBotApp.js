require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createContainer } = require('../bootstrap/container');
const { registerHandlers } = require('../presentation/telegram/registerHandlers');

const createBotApp = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  const container = await createContainer();
  const bot = new TelegramBot(token, { polling: true });

  registerHandlers(bot, container);

  return { bot, container };
};

module.exports = {
  createBotApp,
};
