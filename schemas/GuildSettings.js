const mongoose = require('mongoose');

const GuildSettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    leaderboardChannelId: { type: String, default: null },
    richMessageId: { type: String, default: null },
    xpMessageId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

GuildSettingsSchema.index({ guildId: 1 }, { unique: true });

module.exports = mongoose.model('GuildSettings', GuildSettingsSchema);
