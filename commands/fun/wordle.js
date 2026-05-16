const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wordle')
        .setDescription("Show today's Wordle answer!"),
    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const UserProfile = require('../../schemas/UserProfile');
        const guildId = interaction.guildId;
        const profile = await UserProfile.findOne(guildId
            ? { userId: interaction.user.id, guildId }
            : { userId: interaction.user.id }
        );

        if (!profile || !profile.timezoneString) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Timezone Not Set')
                .setDescription('You haven\'t set your timezone yet! Set it to see the Wordle answer for your local date.')
                .setColor(0xFFAA00)
                .addFields(
                    { name: 'Note', value: 'Wordle answers are based on your local date, so setting your timezone ensures you get the correct puzzle!', inline: false }
                );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('setup_timezone')
                        .setLabel('🌍 Set My Timezone')
                        .setStyle(ButtonStyle.Primary)
                );

            return await interaction.editReply({ embeds: [embed], components: [row] });
        }
        let timezone = profile.timezoneString;
        let offset = 0;
        try {
            const now = new Date();
            const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
            const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
            offset = Math.round((local.getTime() - utc.getTime()) / (60 * 60 * 1000));
        } catch (err) {
            timezone = 'UTC';
        }
        
        // Calculate local date using timezone string
        const now = new Date();
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const yyyy = localTime.getFullYear();
        const mm = String(localTime.getMonth() + 1).padStart(2, '0');
        const dd = String(localTime.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        try {
            const url = `https://www.nytimes.com/svc/wordle/v2/${dateStr}.json`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data || !data.solution) {
                return interaction.editReply('Could not fetch today\'s Wordle answer. Try again later!');
            }
            const embed = new EmbedBuilder()
                .setTitle('🟩 Today\'s Wordle Answer')
                .setDescription(`||${data.solution.toUpperCase()}||`)
                .setColor('#6aaa64')
                .setFooter({ text: `Spoiler: Tap to reveal! | Date: ${dateStr} | ${timezone} (UTC${offset >= 0 ? '+' : ''}${offset})` });
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('Error fetching Wordle answer.');
        }
    }
};
