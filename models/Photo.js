const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
    userId: { type: String },
    chatId: { type: String },
    photoName: {
        type: String,
        required: true
    },
    url: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

// Đảm bảo photoName là duy nhất trong chat hoặc duy nhất với user (nếu là ảnh cá nhân)
PhotoSchema.index(
    { chatId: 1, photoName: 1 },
    { unique: true, partialFilterExpression: { chatId: { $exists: true, $ne: null } } }
);
PhotoSchema.index(
    { userId: 1, photoName: 1 },
    { unique: true, partialFilterExpression: { userId: { $exists: true, $ne: null } } }
);

module.exports = mongoose.model('Photo', PhotoSchema);