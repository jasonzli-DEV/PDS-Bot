const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

const CAT_API_KEY = 'live_yObVopPC6y94uHbV8VIX8Mpgz9hR0NNfelGEvxHnYTenNkAvOM3pQoUu7zWWZClI';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cat')
        .setDescription('Get a random cat image!'),
    async execute(interaction) {
        await interaction.deferReply();
        try {
            const res = await fetch('https://api.thecatapi.com/v1/images/search', {
                headers: { 'x-api-key': CAT_API_KEY }
            });
            const data = await res.json();
            if (!data || !data[0] || !data[0].url) {
                return interaction.editReply('Could not fetch a cat image. Try again later!');
            }
            const embed = new EmbedBuilder()
                .setTitle('🐱 Meow! Found one!')
                .setImage(data[0].url)
                .setColor('#f5c542');
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('Error fetching cat image.');
        }
    }
};
