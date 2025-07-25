const { Schema, model } = require('mongoose');

const workSchema = new Schema({
    userId: { 
        type: String, 
        required: true, 
    },
    guildId: {
        type: String,
        required: true
    },
    nextClaim: { 
        type: Date, 
        required: true 
    },
    reward: { 
        type: Number, 
        required: true, 
        default: 10000 
    },
    expiresAt: {
        type: Date,
        required: true
    }
});

workSchema.index({ userId: 1, guildId: 1 }, { unique: true }); // Ensure unique work per user per guild

module.exports = model('Work', workSchema);