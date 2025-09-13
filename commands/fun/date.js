// /date command - shows current date and time
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('date')
        .setDescription('Shows the current date and time.'),
    async execute(interaction) {
        const UserProfile = require('../../schemas/UserProfile');
        let now = new Date();
        let timezone = 'UTC';
        let offset = 0;
        
        const profile = await UserProfile.findOne({ userId: interaction.user.id });
        if (profile && profile.timezoneString) {
            timezone = profile.timezoneString;
            // Calculate current offset for display
            try {
                const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
                const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
                offset = Math.round((local.getTime() - utc.getTime()) / (60 * 60 * 1000));
            } catch (err) {
                timezone = 'UTC';
            }
        } else {
            // No timezone set - prompt user to set it
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Timezone Not Set')
                .setDescription('You haven\'t set your timezone yet! Set it to see the date and time in your local timezone.')
                .setColor(0xFFAA00)
                .addFields(
                    { name: 'Current Time (UTC)', value: `${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US', { hour12: false })}`, inline: false }
                );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('setup_timezone')
                        .setLabel('🌍 Set My Timezone')
                        .setStyle(ButtonStyle.Primary)
                );

            return await interaction.reply({ embeds: [embed], components: [row] });
        }
        
        // Get local time using timezone string
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const dateString = localTime.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeString = localTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        
        const embed = new EmbedBuilder()
            .setTitle('Current Date & Time')
            .addFields(
                { name: 'Date', value: dateString, inline: true },
                { name: 'Time', value: timeString, inline: true },
                { name: 'Timezone', value: `${timezone} (UTC${offset >= 0 ? '+' : ''}${offset})`, inline: true }
            )
            .setColor(0x00AE86)
            .setTimestamp(localTime);
        await interaction.reply({ embeds: [embed] });
    }
};
