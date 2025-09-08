const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('flip')
        .setDescription('Flip a coin.'),
    async execute(interaction) {
        const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
        console.log(`[FLIP] ${interaction.user.tag} flipped: ${result}`);
        await interaction.reply(`🪙 The coin landed on **${result}**!`);
    },
};
