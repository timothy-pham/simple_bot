const GroupMember = require('../../../models/GroupMember');

class GroupMemberRepository {
  constructor({ useMongo, fileStore }) {
    this.useMongo = useMongo;
    this.fileStore = fileStore;
    this.collection = 'group-members';
  }

  async saveMember(member) {
    if (this.useMongo) {
      return GroupMember.findOneAndUpdate(
        { userId: member.userId, chatId: member.chatId },
        member,
        { upsert: true, new: true }
      );
    }

    const records = this.fileStore.read(this.collection);
    const index = records.findIndex(
      (item) => item.userId === member.userId && item.chatId === member.chatId
    );
    const nextRecord = { ...member, lastSeen: new Date().toISOString() };

    if (index >= 0) {
      records[index] = nextRecord;
    } else {
      records.push(nextRecord);
    }

    this.fileStore.write(this.collection, records);
    return nextRecord;
  }

  async findRecentByChatId(chatId, limit = 50) {
    if (this.useMongo) {
      return GroupMember.find({ chatId }).sort({ lastSeen: -1 }).limit(limit);
    }

    return this.fileStore
      .read(this.collection)
      .filter((member) => member.chatId === chatId)
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
      .slice(0, limit);
  }
}

module.exports = {
  GroupMemberRepository,
};
