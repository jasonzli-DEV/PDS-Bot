const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Displays information about this server.'),
    async execute(interaction) {
        const { guild } = interaction;
        await guild.fetch(); // Ensure up-to-date info
        const owner = await guild.fetchOwner();
        const channelCount = guild.channels.cache.filter(c => c.type !== 4).size; // Exclude categories
        const createdAt = `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`;

        const embed = new EmbedBuilder()
            .setTitle('Server Information')
            .setColor('#5865F2')
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: 'Name', value: guild.name, inline: true },
                { name: 'Server ID', value: guild.id, inline: true },
                { name: 'Owner', value: `${owner.user.tag} (${owner.id})`, inline: true },
                { name: 'Members', value: `${guild.memberCount}`, inline: true },
                { name: 'Channels', value: `${channelCount}`, inline: true },
                { name: 'Created', value: createdAt, inline: true }
            );

        await interaction.reply({ embeds: [embed] });
    },
};
