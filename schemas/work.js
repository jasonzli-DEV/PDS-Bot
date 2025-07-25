const { Schema, model } = require('mongoose');

const workSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    nextClaim: { type: Date, required: true },
    reward: { type: Number, required: true, default: 10000 }
});

module.exports = model('Work', workSchema);