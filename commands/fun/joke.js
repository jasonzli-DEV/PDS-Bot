const { SlashCommandBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Get a random joke!'),
    async execute(interaction) {
    // ...existing code...
        await interaction.deferReply();
        try {
            const res = await fetch('https://official-joke-api.appspot.com/random_joke');
            const data = await res.json();
            if (!data || !data.setup || !data.punchline) {
                return interaction.editReply('Could not fetch a joke. Try again later!');
            }
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('🤣 Random Joke')
                .addFields(
                    { name: 'Question', value: data.setup },
                    { name: 'Answer', value: data.punchline }
                )
                .setColor('#42c5f5');
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            await interaction.editReply('Error fetching joke.');
        }
    }
};
