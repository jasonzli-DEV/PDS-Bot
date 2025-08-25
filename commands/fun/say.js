const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot send a message in this channel.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

    async execute(interaction) {
        const message = interaction.options.getString('message');
        await interaction.channel.send({ content: message });
        console.log(`[SAY] ${interaction.user.tag} sent: "${message}" in #${interaction.channel.name} (${interaction.channel.id})`);
        await interaction.reply({ content: 'Message sent!', ephemeral: true });
    }
};