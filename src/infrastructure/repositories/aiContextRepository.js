const AIContext = require('../../../models/AIContext');

class AIContextRepository {
  constructor({ useMongo, fileStore }) {
    this.useMongo = useMongo;
    this.fileStore = fileStore;
    this.collection = 'ai-contexts';
  }

  async findByChatId(chatId) {
    if (this.useMongo) {
      return AIContext.findOne({ chatId });
    }

    return this.fileStore.read(this.collection).find((item) => item.chatId === chatId) || null;
  }

  async save(chatId, payload) {
    if (this.useMongo) {
      return AIContext.findOneAndUpdate({ chatId }, payload, { upsert: true, new: true });
    }

    const records = this.fileStore.read(this.collection);
    const nextRecord = { chatId, ...payload, updatedAt: new Date().toISOString() };
    const index = records.findIndex((item) => item.chatId === chatId);

    if (index >= 0) {
      records[index] = { ...records[index], ...nextRecord };
    } else {
      records.push(nextRecord);
    }

    this.fileStore.write(this.collection, records);
    return index >= 0 ? records[index] : nextRecord;
  }
}

module.exports = {
  AIContextRepository,
};
