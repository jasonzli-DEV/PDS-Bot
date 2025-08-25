const Afk = require('../../schemas/Afk');

module.exports = async (message) => {
    if (message.author.bot || !message.guild) return;

    try {
        const afk = await Afk.findOne({
            userId: message.author.id,
            guildId: message.guild.id
        });

        if (afk) {
            // Remove AFK status
            await Afk.deleteOne({
                userId: message.author.id,
                guildId: message.guild.id
            });

            // Restore original nickname
            try {
                await message.member.setNickname(afk.originalName);
                console.log(`Restored nickname for ${message.member.displayName}: ${afk.originalName}`);
                
                await message.reply('Welcome back! Your AFK status has been removed.');
            } catch (nickError) {
                console.error(`Failed to restore nickname for ${message.member.displayName}:`, nickError);
                await message.reply('Welcome back! (Note: Could not restore your original nickname)');
            }
        }

        // Check mentioned users
        for (const [id, member] of message.mentions.members) {
            const mentionedAfk = await Afk.findOne({
                userId: id,
                guildId: message.guild.id
            });

            if (mentionedAfk) {
                const timeSince = Math.floor(mentionedAfk.since.getTime() / 1000);
                await message.channel.send(
                    `${member.displayName} is AFK: ${mentionedAfk.reason} (since <t:${timeSince}:R>)`
                );
            }
        }
    } catch (error) {
        console.error('AFK listener error:', error);
    }
};