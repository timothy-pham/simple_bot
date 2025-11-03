const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    photoName: {
        type: String,
        unique: true,
        required: true
    },
    url: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Photo', PhotoSchema);