const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID;
const MANAGER_ROLE_ID = process.env.MANAGER_ROLE_ID;
const MODERATOR_ROLE_ID = process.env.MODERATOR_ROLE_ID;

function getRoleLevel(member) {
    if (member.roles.cache.has(OWNER_ROLE_ID)) return 3;
    if (member.roles.cache.has(MANAGER_ROLE_ID)) return 2;
    if (member.roles.cache.has(MODERATOR_ROLE_ID)) return 1;
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
        const targetUser = interaction.options.getUser('target');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const executor = interaction.member;
        const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        const executorLevel = getRoleLevel(executor);
        const targetLevel = getRoleLevel(target);

        if (executorLevel === 0) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }
        if (executorLevel <= targetLevel) {
            return interaction.reply({ content: 'You can only timeout users with a lower role than yourself.', ephemeral: true });
        }
        if (!target) {
            return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }
        if (!target.moderatable) {
            return interaction.reply({ content: 'I cannot timeout this user.', ephemeral: true });
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
            await interaction.reply({ content: 'Failed to timeout the user.', ephemeral: true });
        }
    }
};