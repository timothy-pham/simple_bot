const mongoose = require('mongoose');

const aiContextSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    rawContext: { type: String, default: '' },
    currentContext: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('AIContext', aiContextSchema);