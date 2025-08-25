const { Schema, model } = require('mongoose');

const userProfileSchema = new Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true }, // <-- fix typo here!
    balance: { type: Number, default: 100 },
    lastDailyCollected: { type: Date }
}, { timestamps: true });

module.exports = model('UserProfile', userProfileSchema);