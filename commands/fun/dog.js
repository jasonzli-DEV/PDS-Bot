const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dog')
        .setDescription('Get a random dog image!'),
    async execute(interaction) {
        await interaction.deferReply();
        try {
            const res = await fetch('https://dog.ceo/api/breeds/image/random');
            const data = await res.json();
            if (!data || !data.message) {
                return interaction.editReply('Could not fetch a dog image. Try again later!');
            }
            const embed = new EmbedBuilder()
                .setTitle('🐶 Woof! Found one!')
                .setImage(data.message)
                .setColor('#f5c542');
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('Error fetching dog image.');
        }
    }
};
