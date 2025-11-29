const { SlashCommandBuilder } = require('discord.js');
const Sticky = require('../../schemas/Sticky');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete-sticky')
    .setDescription('Delete a sticky message by its message ID.')
    .addStringOption(option =>
      option.setName('messageid')
        .setDescription('The message ID of the sticky to delete')
        .setRequired(true)),
  async execute(interaction) {
    if (!interaction.member.permissions.has('ManageMessages') && !interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }
    const messageId = interaction.options.getString('messageid');
    const channelId = interaction.channel.id;
    const sticky = await Sticky.findOneAndDelete({ channelId, messageId });
    if (!sticky) {
      return interaction.reply({ content: 'Sticky not found in this channel.', ephemeral: true });
    }
    // Try to delete the sticky message from the channel
    try {
      const msg = await interaction.channel.messages.fetch(messageId);
      await msg.delete();
    } catch (e) {}
    await interaction.reply({ content: 'Sticky deleted.', ephemeral: true });
  },
};
