const { SlashCommandBuilder } = require('discord.js');
const Sticky = require('../../schemas/Sticky');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Create a sticky message in this channel.')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('The sticky message content')
        .setRequired(true)),
  async execute(interaction) {
    // Permission check
    if (!interaction.member.permissions.has('ManageMessages') && !interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }
    const content = interaction.options.getString('message');
    const channelId = interaction.channel.id;
    const authorId = interaction.user.id;

    // Send the sticky message
    const sent = await interaction.channel.send(content);
    // Save to DB
    await Sticky.create({
      channelId,
      messageId: sent.id,
      content,
      authorId,
    });
    await interaction.reply({ content: `Sticky created! (ID: ${sent.id})`, ephemeral: true });
  },
};
