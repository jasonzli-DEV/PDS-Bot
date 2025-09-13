const { SlashCommandBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dadjoke')
        .setDescription('Get a random dad joke!'),
    async execute(interaction) {
        await interaction.deferReply();
        try {
            const res = await fetch('https://icanhazdadjoke.com/', {
                headers: { 'Accept': 'application/json' }
            });
            const data = await res.json();
            if (!data || !data.joke) {
                return interaction.editReply('Could not fetch a dad joke. Try again later!');
            }
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('😂 Dad Joke')
                .setDescription(data.joke)
                .setColor('#f5c542');
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('Error fetching dad joke.');
        }
    }
};
