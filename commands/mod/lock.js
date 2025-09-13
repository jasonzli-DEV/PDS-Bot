const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock a channel to prevent users from sending messages')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to lock (defaults to current channel)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for locking the channel')
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
                content: '❌ You can only lock text channels.',
                flags: 64
            });
        }

        try {
            // Get the @everyone role
            const everyoneRole = interaction.guild.roles.everyone;
            
            // Check if channel is already locked
            const currentPermissions = targetChannel.permissionOverwrites.cache.get(everyoneRole.id);
            if (currentPermissions && currentPermissions.deny.has(PermissionFlagsBits.SendMessages)) {
                return interaction.reply({
                    content: '❌ This channel is already locked.',
                    flags: 64
                });
            }

            // Lock the channel
            await targetChannel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🔒 Channel Locked')
                .setColor('#ff0000')
                .addFields(
                    { name: 'Channel', value: targetChannel.toString(), inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Moderator', value: interaction.user.toString(), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Send lock message to the channel
            const lockEmbed = new EmbedBuilder()
                .setTitle('🔒 Channel Locked')
                .setDescription(`This channel has been locked by ${interaction.user}\n**Reason:** ${reason}`)
                .setColor('#ff0000')
                .setTimestamp();

            await targetChannel.send({ embeds: [lockEmbed] });

            // Log the action
            console.log(`[LOCK] ${interaction.user.tag} (${interaction.user.id}) locked ${targetChannel.name} in ${interaction.guild.name}. Reason: ${reason}`);

        } catch (error) {
            console.error('Error locking channel:', error);
            await interaction.reply({
                content: '❌ An error occurred while locking the channel. Please check my permissions.',
                flags: 64
            });
        }
    },
};
