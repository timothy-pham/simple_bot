const Menu = require('../../../models/Menu');

class MenuRepository {
  constructor({ useMongo, fileStore }) {
    this.useMongo = useMongo;
    this.fileStore = fileStore;
    this.collection = 'menus';
  }

  async findByChatId(chatId) {
    if (this.useMongo) {
      return Menu.findOne({ chatId });
    }

    return this.fileStore.read(this.collection).find((item) => item.chatId === chatId) || null;
  }

  async save(chatId, items) {
    if (this.useMongo) {
      return Menu.findOneAndUpdate(
        { chatId },
        { items, updatedAt: new Date() },
        { upsert: true, new: true }
      );
    }

    const records = this.fileStore.read(this.collection);
    const nextRecord = { chatId, items, updatedAt: new Date().toISOString() };
    const index = records.findIndex((item) => item.chatId === chatId);

    if (index >= 0) {
      records[index] = nextRecord;
    } else {
      records.push(nextRecord);
    }

    this.fileStore.write(this.collection, records);
    return nextRecord;
  }
}

module.exports = {
  MenuRepository,
};
