const Order = require('../../../models/Order');

class OrderRepository {
  constructor({ useMongo, fileStore }) {
    this.useMongo = useMongo;
    this.fileStore = fileStore;
    this.collection = 'orders';
  }

  toDate(value) {
    return value instanceof Date ? value : new Date(value);
  }

  isWithinRange(order, start, end) {
    const orderDate = this.toDate(order.date);
    return orderDate >= start && orderDate <= end;
  }

  async findForRange(chatId, start, end) {
    if (this.useMongo) {
      return Order.find({ chatId, date: { $gte: start, $lte: end } });
    }

    return this.fileStore
      .read(this.collection)
      .filter((order) => order.chatId === chatId && this.isWithinRange(order, start, end));
  }

  async findUserOrderForRange(userId, chatId, start, end) {
    if (this.useMongo) {
      return Order.findOne({ userId, chatId, date: { $gte: start, $lte: end } });
    }

    return (
      this.fileStore
        .read(this.collection)
        .find(
          (order) =>
            order.userId === userId &&
            order.chatId === chatId &&
            this.isWithinRange(order, start, end)
        ) || null
    );
  }

  async upsertDailyOrder({ userId, userName, chatId, dish, date }) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    if (this.useMongo) {
      const existingOrder = await this.findUserOrderForRange(userId, chatId, start, end);
      if (existingOrder) {
        existingOrder.dish = dish;
        existingOrder.createdAt = new Date();
        await existingOrder.save();
        return { order: existingOrder, isUpdate: true };
      }

      const order = new Order({ userId, userName, chatId, dish, date: new Date(), createdAt: new Date() });
      await order.save();
      return { order, isUpdate: false };
    }

    const records = this.fileStore.read(this.collection);
    const index = records.findIndex(
      (order) =>
        order.userId === userId &&
        order.chatId === chatId &&
        this.isWithinRange(order, start, end)
    );

    if (index >= 0) {
      records[index] = {
        ...records[index],
        dish,
        userName,
        createdAt: new Date().toISOString(),
      };
      this.fileStore.write(this.collection, records);
      return { order: records[index], isUpdate: true };
    }

    const order = {
      id: `${chatId}_${userId}_${Date.now()}`,
      userId,
      userName,
      chatId,
      dish,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    records.push(order);
    this.fileStore.write(this.collection, records);
    return { order, isUpdate: false };
  }

  async deleteForRange(chatId, start, end) {
    if (this.useMongo) {
      return Order.deleteMany({ chatId, date: { $gte: start, $lte: end } });
    }

    const records = this.fileStore.read(this.collection);
    const kept = records.filter(
      (order) => !(order.chatId === chatId && this.isWithinRange(order, start, end))
    );
    const deletedCount = records.length - kept.length;
    this.fileStore.write(this.collection, kept);
    return { deletedCount };
  }

  async deleteUserOrderForRange(userId, chatId, start, end) {
    if (this.useMongo) {
      return Order.deleteOne({ userId, chatId, date: { $gte: start, $lte: end } });
    }

    const records = this.fileStore.read(this.collection);
    const index = records.findIndex(
      (order) =>
        order.userId === userId &&
        order.chatId === chatId &&
        this.isWithinRange(order, start, end)
    );

    if (index < 0) {
      return { deletedCount: 0 };
    }

    records.splice(index, 1);
    this.fileStore.write(this.collection, records);
    return { deletedCount: 1 };
  }
}

module.exports = {
  OrderRepository,
};
