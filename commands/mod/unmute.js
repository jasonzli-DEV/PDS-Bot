const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a user in the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to unmute')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),
    async execute(interaction) {
        // Role IDs from .env
        const ownerRoleId = process.env.OWNER_ROLE_ID;
        const managerRoleId = process.env.MANAGER_ROLE_ID;
        const moderatorRoleId = process.env.MODERATOR_ROLE_ID;
        const memberRoles = interaction.member.roles.cache;
        const hasOwnerRole = ownerRoleId && memberRoles.has(ownerRoleId);
        const hasManagerRole = managerRoleId && memberRoles.has(managerRoleId);
        const hasModeratorRole = moderatorRoleId && memberRoles.has(moderatorRoleId);

        if (!hasOwnerRole && !hasManagerRole && !hasModeratorRole && !interaction.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
            return interaction.reply({
                content: '❌ You need a moderator, manager, or owner role or "Mute Members" permission to use this command.',
                flags: 64
            });
        }

        const targetUser = interaction.options.getUser('user');
        if (!targetUser) {
            return interaction.reply({ content: 'User not found.', flags: 64 });
        }
        // Prevent unmuting bots
        if (targetUser.bot) {
            return interaction.reply({ content: '❌ You cannot unmute bots.', flags: 64 });
        }
        // Prevent unmuting yourself
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot unmute yourself.', flags: 64 });
        }
        // Prevent unmuting the server owner
        if (targetUser.id === interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ You cannot unmute the server owner.', ephemeral: true });
        }

        try {
            const member = await interaction.guild.members.fetch(targetUser.id);
            // --- Role-based unmute restrictions ---
            const targetHasOwnerRole = ownerRoleId && member.roles.cache.has(ownerRoleId);
            const targetHasManagerRole = managerRoleId && member.roles.cache.has(managerRoleId);
            const targetHasModeratorRole = moderatorRoleId && member.roles.cache.has(moderatorRoleId);
            // Prevent unmuting the owner
            if (targetHasOwnerRole) {
                return interaction.reply({ content: '❌ You cannot unmute the server owner.', ephemeral: true });
            }
            // Moderator cannot unmute manager or moderator
            if (hasModeratorRole && !hasManagerRole && !hasOwnerRole && (targetHasManagerRole || targetHasModeratorRole)) {
                return interaction.reply({ content: '❌ Moderators can only unmute regular users.', ephemeral: true });
            }
            // Manager cannot unmute owner or manager
            if (hasManagerRole && !hasOwnerRole && (targetHasOwnerRole || targetHasManagerRole)) {
                return interaction.reply({ content: '❌ Managers can only unmute moderators and regular users.', ephemeral: true });
            }
            // Check if target has higher roles
            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                return interaction.reply({ content: '❌ You cannot unmute someone with equal or higher roles.', ephemeral: true });
            }
            // Check if target is not muted
            if (!member.isCommunicationDisabled()) {
                return interaction.reply({ content: '❌ This user is not muted.', ephemeral: true });
            }
            // Remove timeout (unmute)
            await member.timeout(null, 'Unmuted by command');
            // Create embed for unmute
            const embed = new EmbedBuilder()
                .setTitle('🔈 User Unmuted')
                .setColor('#00ff00')
                .addFields(
                    { name: 'User', value: `${targetUser} (${targetUser.tag})`, inline: true },
                    { name: 'Moderator', value: interaction.user.toString(), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            // Log the action
            console.log(`[UNMUTE] ${interaction.user.tag} (${interaction.user.id}) unmuted ${targetUser.tag} (${targetUser.id}) in ${interaction.guild.name}.`);
        } catch (error) {
            console.error('Error unmuting user:', error);
            await interaction.reply({ content: '❌ An error occurred while unmuting the user. Please check my permissions.', ephemeral: true });
        }
    },
};
