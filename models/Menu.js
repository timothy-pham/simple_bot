const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  }
}, { _id: false });

const menuSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true
  },
  items: [menuItemSchema],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient chatId queries
menuSchema.index({ chatId: 1 });

module.exports = mongoose.model('Menu', menuSchema);
