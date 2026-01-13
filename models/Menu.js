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

// Note: `chatId` is already declared `unique: true` in the schema above,
// which creates an index. Avoid declaring a duplicate index here.

module.exports = mongoose.model('Menu', menuSchema);
