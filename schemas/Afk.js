const { Schema, model } = require('mongoose');

const afkSchema = new Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    reason: { type: String, default: 'AFK' },
    since: { type: Date, default: Date.now }
});

afkSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = model('Afk', afkSchema);