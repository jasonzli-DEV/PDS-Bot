const LevelProfile = require('../../schemas/LevelProfile');

const XP_COOLDOWN = 60 * 1000; // 60 seconds
const MIN_XP = 10;
const MAX_XP = 20;

function getXPForLevel(level) {
    let xp = 50;
    for (let i = 2; i <= level; i++) {
        xp = Math.round(xp * 1.5 / 50) * 50;
    }
    return xp;
}

module.exports = async (message) => {
    if (message.author.bot || !message.guild) return;

    try {
        const userId = message.author.id;
        const guildId = message.guild.id;
        let profile = await LevelProfile.findOne({ userId, guildId });
        if (!profile) {
            profile = new LevelProfile({ userId, guildId, xp: 0, level: 1, lastMessage: null });
        }

        // Cooldown check
        const now = Date.now();
        if (profile.lastMessage && now - profile.lastMessage.getTime() < XP_COOLDOWN) return;

        // Award random XP
        const xpGain = Math.floor(Math.random() * (MAX_XP - MIN_XP + 1)) + MIN_XP;
        profile.xp += xpGain;
        profile.lastMessage = new Date(now);

        // Level up logic
        let leveledUp = false;
        let neededXP = getXPForLevel(profile.level);
        while (profile.xp >= neededXP) {
            profile.xp -= neededXP;
            profile.level += 1;
            leveledUp = true;
            neededXP = getXPForLevel(profile.level);
        }

        await profile.save();
        if (leveledUp) {
            console.log(`${message.author.tag} leveled up to ${profile.level} in ${message.guild.name}`);
        }
    } catch (err) {
        console.error('Level XP error:', err);
    }
};
