const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
    userId: { type: String, },
    chatId: { type: String, },
    photoName: {
        type: String,
        required: true
    },
    url: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Photo', PhotoSchema);