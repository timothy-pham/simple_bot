const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  dish: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
orderSchema.index({ chatId: 1, date: -1 });
orderSchema.index({ userId: 1, chatId: 1, date: -1 });

module.exports = mongoose.model('Order', orderSchema);
