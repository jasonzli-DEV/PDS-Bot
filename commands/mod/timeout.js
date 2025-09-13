const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');


const { getGuildSettings } = require('../../schemas/GuildSettings');


function getRoleLevel(member, settings) {
    if (!settings) return 0;
    if (settings.ownerRoleId && member.roles.cache.has(settings.ownerRoleId)) return 3;
    if (settings.managerRoleId && member.roles.cache.has(settings.managerRoleId)) return 2;
    if (settings.moderatorRoleId && member.roles.cache.has(settings.moderatorRoleId)) return 1;
    return 0;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user for a specified duration.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to timeout')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Timeout duration in minutes')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for timeout')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
            // Only allow this command in servers
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    flags: 64
                });
            }
        const guildId = interaction.guild.id;
        const settings = await getGuildSettings(guildId);
        const targetUser = interaction.options.getUser('target');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const executor = interaction.member;
        const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        const executorLevel = getRoleLevel(executor, settings);
        const targetLevel = getRoleLevel(target, settings);

        if (executorLevel === 0) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
        }
        if (executorLevel <= targetLevel) {
            return interaction.reply({ content: 'You can only timeout users with a lower role than yourself.', flags: 64 });
        }
        if (!target) {
            return interaction.reply({ content: 'User not found in this server.', flags: 64 });
        }
        if (!target.moderatable) {
            return interaction.reply({ content: 'I cannot timeout this user.', flags: 64 });
        }

        try {
            await target.timeout(duration * 60 * 1000, reason);
            await targetUser.send(
                `You have been timed out in **${interaction.guild.name}** for ${duration} minute(s).\nReason: ${reason}`
            ).catch(() => {});
            console.log(`[TIMEOUT] ${interaction.user.tag} timed out ${targetUser.tag} for ${duration} min. Reason: ${reason}`);
            await interaction.reply({
                content: `✅ <@${targetUser.id}> has been timed out for ${duration} minute(s).\nReason: ${reason}`,
                allowedMentions: { users: [targetUser.id] }
            });
        } catch (error) {
            console.error(`[TIMEOUT] Error timing out ${targetUser.tag}:`, error);
            await interaction.reply({ content: 'Failed to timeout the user.', flags: 64 });
        }
    }
};