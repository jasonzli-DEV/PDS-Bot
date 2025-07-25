const { Schema, model } = require('mongoose');

const robCooldownSchema = new Schema({
    robberId: { type: String, required: true },
    targetId: { type: String, required: true },
    guildId: { type: String, required: true },
    endsAt: { type: Date, required: true }
});

module.exports = model('RobCooldown', robCooldownSchema);