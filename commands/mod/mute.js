const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user in the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to mute')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for muting')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in minutes (0 for permanent)')
                .setRequired(false)
                .setMinValue(0)
        ),
    
    async execute(interaction) {
            // Only allow this command in servers
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    flags: 64
                });
            }

    const { getGuildSettings } = require('../../schemas/GuildSettings');
    const guildId = interaction.guild.id;
    const settings = await getGuildSettings(guildId);
    const memberRoles = interaction.member.roles.cache;
    const hasOwnerRole = settings.ownerRoleId && memberRoles.has(settings.ownerRoleId);
    const hasManagerRole = settings.managerRoleId && memberRoles.has(settings.managerRoleId);
    const hasModeratorRole = settings.moderatorRoleId && memberRoles.has(settings.moderatorRoleId);
        
        if (!hasOwnerRole && !hasManagerRole && !hasModeratorRole && !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({
                content: '❌ You need a moderator, manager, or owner role or "Moderate Members" permission to use this command.',
                flags: 64
            });
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const duration = interaction.options.getInteger('duration') || 0;

        // Check if target is a bot
        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ You cannot mute bots.',
                flags: 64
            });
        }

        // Check if trying to mute yourself
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ You cannot mute yourself.',
                flags: 64
            });
        }

        // Check if trying to mute the server owner
        if (targetUser.id === interaction.guild.ownerId) {
            return interaction.reply({
                content: '❌ You cannot mute the server owner.',
                flags: 64
            });
        }

        try {
            const member = await interaction.guild.members.fetch(targetUser.id);
            // --- Role-based mute restrictions ---
            const targetHasOwnerRole = settings.ownerRoleId && member.roles.cache.has(settings.ownerRoleId);
            const targetHasManagerRole = settings.managerRoleId && member.roles.cache.has(settings.managerRoleId);
            const targetHasModeratorRole = settings.moderatorRoleId && member.roles.cache.has(settings.moderatorRoleId);
            // Prevent muting the owner
            if (targetHasOwnerRole) {
                return interaction.reply({
                    content: '❌ You cannot mute the server owner.',
                    flags: 64
                });
            }
            // Moderator cannot mute manager or moderator
            if (hasModeratorRole && !hasManagerRole && !hasOwnerRole && (targetHasManagerRole || targetHasModeratorRole)) {
                return interaction.reply({
                    content: '❌ Moderators can only mute regular users.',
                    flags: 64
                });
            }
            // Manager cannot mute owner or manager
            if (hasManagerRole && !hasOwnerRole && (targetHasOwnerRole || targetHasManagerRole)) {
                return interaction.reply({
                    content: '❌ Managers can only mute moderators and regular users.',
                    flags: 64
                });
            }
            // Only owner can mute managers or moderators
            // (already handled above, but for clarity)

            // Check if target has higher roles
            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                return interaction.reply({
                    content: '❌ You cannot mute someone with equal or higher roles.',
                    flags: 64
                });
            }

            // Check if target is already muted
            if (member.isCommunicationDisabled()) {
                return interaction.reply({
                    content: '❌ This user is already muted.',
                    flags: 64
                });
            }

            // Calculate timeout duration
            const timeoutDuration = duration > 0 ? duration * 60 * 1000 : null; // Convert minutes to milliseconds

            // Apply timeout
            await member.timeout(timeoutDuration, reason);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🔇 User Muted')
                .setColor('#ff0000')
                .addFields(
                    { name: 'User', value: `${targetUser} (${targetUser.tag})`, inline: true },
                    { name: 'Duration', value: duration > 0 ? `${duration} minutes` : 'Permanent', inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Moderator', value: interaction.user.toString(), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the action
            console.log(`[MUTE] ${interaction.user.tag} (${interaction.user.id}) muted ${targetUser.tag} (${targetUser.id}) for ${duration > 0 ? duration + ' minutes' : 'permanent'} in ${interaction.guild.name}. Reason: ${reason}`);

        } catch (error) {
            console.error('Error muting user:', error);
            await interaction.reply({
                content: '❌ An error occurred while muting the user. Please check my permissions.',
                flags: 64
            });
        }
    },
};
