const { Schema, model } = require('mongoose');

const userProfileSchema = new Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    balance: { type: Number, default: 100 },
    lastDailyCollected: { type: Date },
    timezoneOffset: { type: Number, default: 0 },
    timezoneString: { type: String, default: '' }
}, { timestamps: true });

module.exports = model('UserProfile', userProfileSchema);