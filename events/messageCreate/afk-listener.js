const Afk = require('../../schemas/Afk');

module.exports = async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const guildId = message.guild.id;

    // Remove AFK status if user sends a message
    const afk = await Afk.findOne({ userId, guildId });
    if (afk) {
        await Afk.deleteOne({ userId, guildId });
        message.reply('Welcome back! You are no longer AFK.');
    }

    // Notify if mentioned user is AFK
    for (const user of message.mentions.users.values()) {
        const mentionedAfk = await Afk.findOne({ userId: user.id, guildId });
        if (mentionedAfk) {
            message.channel.send(
                `<@${user.id}> is currently AFK: ${mentionedAfk.reason} (since <t:${Math.floor(mentionedAfk.since.getTime()/1000)}:R>)`
            );
        }
    }
};