const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Giveaway = require('../schemas/Giveaway');

function hasModPerms(member) {
    const ownerRoleId = process.env.OWNER_ROLE_ID;
    const managerRoleId = process.env.MANAGER_ROLE_ID;
    const moderatorRoleId = process.env.MODERATOR_ROLE_ID;
    return (
        (ownerRoleId && member.roles.cache.has(ownerRoleId)) ||
        (managerRoleId && member.roles.cache.has(managerRoleId)) ||
        (moderatorRoleId && member.roles.cache.has(moderatorRoleId)) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway-reroll')
        .setDescription('Reroll a giveaway winner')
        .addStringOption(opt =>
            opt.setName('message')
                .setDescription('Message ID or link (giveaway or result message, optional)')
                .setRequired(false)
        )
        .addUserOption(opt =>
            opt.setName('winner')
                .setDescription('Winner to reroll (will not be selected again)')
                .setRequired(false)
        ),
    async execute(interaction) {
        if (!hasModPerms(interaction.member)) {
            return interaction.reply({ content: '❌ You lack permission.', ephemeral: true });
        }

        let msgIdOrLink = interaction.options.getString('message');
        const winnerToReroll = interaction.options.getUser('winner');
        let giveaway;
        let rerollMessageId = null;

        if (msgIdOrLink) {
            const msgId = msgIdOrLink.match(/\d{17,}/)?.[0];
            if (!msgId) return interaction.reply({ content: '❌ Invalid message ID or link.', ephemeral: true });
            // Try to find by giveaway messageId first
            giveaway = await Giveaway.findOne({ messageId: msgId, ended: true });
            if (!giveaway) {
                // Try to find by result message: find the giveaway with the closest endTime before this message
                rerollMessageId = msgId;
                giveaway = await Giveaway.findOne({ guildId: interaction.guild.id, ended: true }).sort({ endTime: -1 });
                if (!giveaway) return interaction.reply({ content: '❌ Giveaway not found or not ended.', ephemeral: true });
            }
        } else {
            // Find latest ended giveaway in this guild
            giveaway = await Giveaway.findOne({ guildId: interaction.guild.id, ended: true }).sort({ endTime: -1 });
            if (!giveaway) return interaction.reply({ content: '❌ No ended giveaways found in this server.', ephemeral: true });
        }

        let entries = giveaway.entries || [];
        if (entries.length === 0) {
            // fallback: try fetch reaction entries if entries missing
            const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
            if (channel) {
                const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                const reaction = message ? message.reactions.cache.get('🎉') : null;
                const users = reaction ? await reaction.users.fetch() : [];
                entries = users.filter(u => !u.bot).map(u => u.id);
            }
        }

        // Remove the previous winner if provided, but only for selection (not from entries)
        let previousWinnerId = winnerToReroll ? winnerToReroll.id : null;
        if (entries.length === 0) return interaction.reply({ content: '❌ No valid entries to reroll.', ephemeral: true });

        // Pick a new winner that is different from previousWinnerId if possible
        let newWinnerId = null;
        if (previousWinnerId && entries.length > 1) {
            // Try all possible entries except previousWinnerId
            const possible = entries.filter(id => id !== previousWinnerId);
            newWinnerId = possible[Math.floor(Math.random() * possible.length)];
        } else {
            // If only one entry or no previous winner, pick any
            newWinnerId = entries[Math.floor(Math.random() * entries.length)];
        }

        const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) return interaction.reply({ content: '❌ Could not fetch giveaway channel.', ephemeral: true });

        // Use the original giveaway message or the result message if provided
        let message;
        if (rerollMessageId) {
            message = await channel.messages.fetch(rerollMessageId).catch(() => null);
        } else {
            message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        }
        if (!message) return interaction.reply({ content: '❌ Could not fetch giveaway/result message.', ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle(`🎉 Giveaway Reroll: ${giveaway.name}`)
            .setDescription(`New Winner: <@${newWinnerId}>`)
            .setColor(0xffd700)
            .setFooter({ text: `Rerolled by ${interaction.user.tag}` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        return interaction.reply({ content: `Rerolled! New winner: <@${newWinnerId}>`, ephemeral: true });
    }
};
