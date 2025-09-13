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
        .setName('ban')
        .setDescription('Ban a user from the server.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for ban')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
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
            return interaction.reply({ content: 'You can only ban users with a lower role than yourself.', flags: 64 });
        }
        if (!target) {
            return interaction.reply({ content: 'User not found in this server.', flags: 64 });
        }

        try {
            await target.ban({ reason });
            await targetUser.send(
                `You have been banned from **${interaction.guild.name}**.\nReason: ${reason}`
            ).catch(() => {});
            console.log(`[BAN] ${interaction.user.tag} banned ${targetUser.tag} for: ${reason}`);
            await interaction.reply({ content: `✅ <@${targetUser.id}> has been banned.\nReason: ${reason}` });
        } catch (error) {
            console.error(`[BAN] Error banning ${targetUser.tag}:`, error);
            await interaction.reply({ content: 'Failed to ban the user.', flags: 64 });
        }
    }
};