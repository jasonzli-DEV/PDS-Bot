const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uptime')
        .setDescription('Shows how long the bot has been running.'),
    async execute(interaction) {
        const totalSeconds = Math.floor(process.uptime());
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        let uptimeString = '';
        if (days > 0) uptimeString += `${days}d `;
        if (hours > 0 || days > 0) uptimeString += `${hours}h `;
        if (minutes > 0 || hours > 0 || days > 0) uptimeString += `${minutes}m `;
        uptimeString += `${seconds}s`;

        await interaction.reply(`⏱️ Uptime: **${uptimeString.trim()}**`);
    },
};
