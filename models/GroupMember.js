const mongoose = require('mongoose');

const groupMemberSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  username: String,
  firstName: String,
  lastName: String,
  lastSeen: {
    type: Date,
    default: Date.now
  }
});

// Composite index to ensure unique user per chat
groupMemberSchema.index({ userId: 1, chatId: 1 }, { unique: true });

module.exports = mongoose.model('GroupMember', groupMemberSchema);
