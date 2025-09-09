const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const GuildSettings = require('../../schemas/GuildSettings');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setleaderboard')
        .setDescription('Set the leaderboard channel for this server')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel where leaderboards will be posted')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        
        if (!channel.isTextBased()) {
            return interaction.reply({
                content: '❌ The leaderboard channel must be a text channel!',
                ephemeral: true
            });
        }

        try {
            let guildSettings = await GuildSettings.findOne({ guildId: interaction.guildId });
            
            if (!guildSettings) {
                guildSettings = new GuildSettings({ 
                    guildId: interaction.guildId,
                    leaderboardChannelId: channel.id
                });
            } else {
                guildSettings.leaderboardChannelId = channel.id;
                guildSettings.updatedAt = new Date();
            }

            await guildSettings.save();

            const embed = new EmbedBuilder()
                .setTitle('✅ Leaderboard Channel Set')
                .setDescription(`Leaderboard channel has been set to ${channel}`)
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Error setting leaderboard channel:', error);
            await interaction.reply({
                content: '❌ An error occurred while setting the leaderboard channel. Please try again later.',
                ephemeral: true
            });
        }
    },
};
