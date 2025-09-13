const mongoose = require('mongoose');

const GuildSettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    ownerRoleId: { type: String, default: null },
    managerRoleId: { type: String, default: null },
    moderatorRoleId: { type: String, default: null },
    leaderboardChannelId: { type: String, default: null },
    leaderboardMessageId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});


const GuildSettings = mongoose.model('GuildSettings', GuildSettingsSchema);

/**
 * Fetches the server settings for a given guildId from MongoDB.
 * @param {string} guildId - The Discord server ID.
 * @returns {Promise<Object>} - The settings object or null if not found.
 */
async function getGuildSettings(guildId) {
    if (!guildId) return null;
    const settings = await GuildSettings.findOne({ guildId });
    return settings ? settings.toObject() : null;
}

module.exports = { GuildSettings, getGuildSettings };
