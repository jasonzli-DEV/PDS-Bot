const { SlashCommandBuilder } = require('discord.js');
const GuildSettings = require('../../schemas/GuildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configure')
    .setDescription('Configure server-specific channel and role IDs')
    .addStringOption(option =>
      option.setName('owner_role_id')
        .setDescription('Owner role ID')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('manager_role_id')
        .setDescription('Manager role ID')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('moderator_role_id')
        .setDescription('Moderator role ID')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('leaderboard_channel_id')
        .setDescription('Leaderboard channel ID')
        .setRequired(false)),
  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
  return interaction.reply({ content: 'You need Administrator permission to use this command.', flags: 64 });
    }
    const guildId = interaction.guild.id;
    const settings = {
      ownerRoleId: interaction.options.getString('owner_role_id'),
      managerRoleId: interaction.options.getString('manager_role_id'),
      moderatorRoleId: interaction.options.getString('moderator_role_id'),
      leaderboardChannelId: interaction.options.getString('leaderboard_channel_id'),
    };
    // Remove undefined values
    Object.keys(settings).forEach(key => settings[key] === null && delete settings[key]);
    try {
      await GuildSettings.findOneAndUpdate(
        { guildId },
        { $set: settings },
        { upsert: true, new: true }
      );
  await interaction.reply({ content: 'Server configuration updated!', flags: 64 });
    } catch (err) {
      console.error(err);
  await interaction.reply({ content: 'Failed to update configuration.', flags: 64 });
    }
  }
};
