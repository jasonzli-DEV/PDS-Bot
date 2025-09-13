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
        .setName('kick')
        .setDescription('Kick a user from the server.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to kick')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for kick')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async execute(interaction) {
            // Only allow this command in servers
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    flags: 64
                });
            }
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const executor = interaction.member;
        const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        const executorLevel = getRoleLevel(executor);
        const targetLevel = getRoleLevel(target);

        if (executorLevel === 0) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
        }
        if (executorLevel <= targetLevel) {
            return interaction.reply({ content: 'You can only kick users with a lower role than yourself.', flags: 64 });
        }
        if (!target) {
            return interaction.reply({ content: 'User not found in this server.', flags: 64 });
        }

        try {
            await target.kick(reason);
            await targetUser.send(
                `You have been kicked from **${interaction.guild.name}**.\nReason: ${reason}`
            ).catch(() => {});
            console.log(`[KICK] ${interaction.user.tag} kicked ${targetUser.tag} for: ${reason}`);
            await interaction.reply({ content: `✅ <@${targetUser.id}> has been kicked.\nReason: ${reason}` });
        } catch (error) {
            console.error(`[KICK] Error kicking ${targetUser.tag}:`, error);
            await interaction.reply({ content: 'Failed to kick the user.', flags: 64 });
        }
    }
};