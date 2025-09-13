const mongoose = require('mongoose');

const GiveawaySchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    guildId: { type: String, required: true },
    name: { type: String, required: true },
    winners: { type: Number, required: true },
    endTime: { type: Date, required: true },
    host: { type: String, required: true },
    ended: { type: Boolean, default: false },
    entries: [{ type: String }]
});

module.exports = mongoose.model('Giveaway', GiveawaySchema);