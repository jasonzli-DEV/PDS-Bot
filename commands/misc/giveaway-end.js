const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Giveaway = require('../../schemas/Giveaway');

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
        .setName('giveaway-end')
        .setDescription('End a giveaway')
        .addStringOption(opt =>
            opt.setName('message')
                .setDescription('Message ID or link')
                .setRequired(true)
        ),
    async execute(interaction) {
            // Only allow this command in servers
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    flags: 64
                });
            }
        if (!hasModPerms(interaction.member)) {
            return interaction.reply({ content: '❌ You lack permission.', flags: 64 });
        }

        const msgIdOrLink = interaction.options.getString('message');
        const msgId = msgIdOrLink.match(/\d{17,}/)?.[0];
    if (!msgId) return interaction.reply({ content: '❌ Invalid message ID or link.', flags: 64 });

        const giveaway = await Giveaway.findOne({ messageId: msgId });
    if (!giveaway) return interaction.reply({ content: '❌ Giveaway not found.', flags: 64 });
    if (giveaway.ended) return interaction.reply({ content: '❌ Giveaway already ended.', flags: 64 });

        const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) return interaction.reply({ content: '❌ Could not fetch giveaway channel.', flags: 64 });

        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!message) return interaction.reply({ content: '❌ Could not fetch giveaway message.', flags: 64 });

        const reaction = message.reactions.cache.get('🎉');
        const users = reaction ? await reaction.users.fetch() : [];
        const entries = users.filter(u => !u.bot).map(u => u.id);

        if (entries.length === 0) {
            await message.reply('No valid entries, no winners.');
        } else {
            const shuffled = entries.sort(() => Math.random() - 0.5);
            const winnerIds = shuffled.slice(0, giveaway.winners);
            const winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');

            const endEmbed = new EmbedBuilder()
                .setTitle(`🎉 Giveaway Ended: ${giveaway.name}`)
                .setDescription(`Winners: ${winnerMentions}\nThanks for participating!`)
                .setColor(0x43b581)
                .setFooter({ text: `Ended by ${interaction.user.tag}` })
                .setTimestamp();

            await message.reply({ embeds: [endEmbed] });
        }

        giveaway.ended = true;
        giveaway.entries = entries;
        await giveaway.save();

    return interaction.reply({ content: 'Giveaway ended.', flags: 64 });
    }
};
