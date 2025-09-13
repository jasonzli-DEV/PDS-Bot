const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock a channel to allow users to send messages again')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to unlock (defaults to current channel)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for unlocking the channel')
                .setRequired(false)
        ),
    
    async execute(interaction) {
            // Only allow this command in servers
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    flags: 64
                });
            }
        // Check if user has moderator role
        const moderatorRoles = process.env.MODERATOR_ROLES?.split(',').map(role => role.trim()) || [];
        const hasModeratorRole = interaction.member.roles.cache.some(role => moderatorRoles.includes(role.id));
        
        if (!hasModeratorRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: '❌ You need a moderator role or "Manage Channels" permission to use this command.',
                flags: 64
            });
        }

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Check if channel is text-based
        if (!targetChannel.isTextBased()) {
            return interaction.reply({
                content: '❌ You can only unlock text channels.',
                flags: 64
            });
        }

        try {
            // Get the @everyone role
            const everyoneRole = interaction.guild.roles.everyone;
            
            // Check if channel is already unlocked
            const currentPermissions = targetChannel.permissionOverwrites.cache.get(everyoneRole.id);
            if (!currentPermissions || !currentPermissions.deny.has(PermissionFlagsBits.SendMessages)) {
                return interaction.reply({
                    content: '❌ This channel is not locked.',
                    flags: 64
                });
            }

            // Unlock the channel
            await targetChannel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: null // Remove the deny permission
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🔓 Channel Unlocked')
                .setColor('#00ff00')
                .addFields(
                    { name: 'Channel', value: targetChannel.toString(), inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Moderator', value: interaction.user.toString(), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Send unlock message to the channel
            const unlockEmbed = new EmbedBuilder()
                .setTitle('🔓 Channel Unlocked')
                .setDescription(`This channel has been unlocked by ${interaction.user}\n**Reason:** ${reason}`)
                .setColor('#00ff00')
                .setTimestamp();

            await targetChannel.send({ embeds: [unlockEmbed] });

            // Log the action
            console.log(`[UNLOCK] ${interaction.user.tag} (${interaction.user.id}) unlocked ${targetChannel.name} in ${interaction.guild.name}. Reason: ${reason}`);

        } catch (error) {
            console.error('Error unlocking channel:', error);
            await interaction.reply({
                content: '❌ An error occurred while unlocking the channel. Please check my permissions.',
                flags: 64
            });
        }
    },
};
