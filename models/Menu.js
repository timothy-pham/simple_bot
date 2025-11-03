const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  chatId: {
    type: String,
    required: true
  }
});

// Index for efficient date-based queries
menuSchema.index({ date: -1, chatId: 1 });

module.exports = mongoose.model('Menu', menuSchema);
