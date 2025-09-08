const mongoose = require('mongoose');

const RPSMatchSchema = new mongoose.Schema({
    matchId: {
        type: String,
        required: true,
        unique: true
    },
    guildId: {
        type: String,
        required: true
    },
    player1: {
        userId: {
            type: String,
            required: true
        },
        username: {
            type: String,
            required: true
        },
        wins: {
            type: Number,
            default: 0
        }
    },
    player2: {
        userId: {
            type: String,
            required: true
        },
        username: {
            type: String,
            required: true
        },
        wins: {
            type: Number,
            default: 0
        }
    },
    betAmount: {
        type: Number,
        required: true
    },
    matchType: {
        type: String,
        enum: ['ai', 'pvp'],
        required: true
    },
    status: {
        type: String,
        enum: ['ongoing', 'completed', 'forfeit'],
        default: 'ongoing'
    },
    winner: {
        type: String,
        enum: ['player1', 'player2', 'tie', 'forfeit'],
        default: null
    },
    rounds: [{
        roundNumber: {
            type: Number,
            required: true
        },
        player1Choice: {
            type: String,
            enum: ['rock', 'paper', 'scissors'],
            required: true
        },
        player2Choice: {
            type: String,
            enum: ['rock', 'paper', 'scissors'],
            required: true
        },
        result: {
            type: String,
            enum: ['player1', 'player2', 'tie'],
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    totalRounds: {
        type: Number,
        default: 0
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: {
        type: Date,
        default: null
    },
    duration: {
        type: Number, // in milliseconds
        default: null
    },
    coinsExchanged: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for efficient queries
RPSMatchSchema.index({ guildId: 1, 'player1.userId': 1 });
RPSMatchSchema.index({ guildId: 1, 'player2.userId': 1 });
RPSMatchSchema.index({ status: 1 });

module.exports = mongoose.model('RPSMatch', RPSMatchSchema);