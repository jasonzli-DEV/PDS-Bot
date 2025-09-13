const { SlashCommandBuilder } = require('discord.js');
const mongoose = require('mongoose');
const UserProfile = require('../../schemas/UserProfile');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Pay another user some coins.')
    .addUserOption(option =>
      option.setName('target').setDescription('User to pay').setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('amount').setDescription('Amount to pay').setRequired(true)
    ),
  async execute(interaction) {
    const payerId = interaction.user.id;
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (targetUser.bot) {
      return interaction.reply({ content: "You can't pay bots.", ephemeral: true });
    }
    if (targetUser.id === payerId) {
      return interaction.reply({ content: "You can't pay yourself.", ephemeral: true });
    }
    if (amount <= 0) {
      return interaction.reply({ content: "Amount must be positive.", ephemeral: true });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const payer = await UserProfile.findOne({ userId: payerId }).session(session);
      const payee = await UserProfile.findOne({ userId: targetUser.id }).session(session);

      if (!payer || payer.coins < amount) {
        await session.abortTransaction();
        return interaction.reply({ content: "You don't have enough coins.", ephemeral: true });
      }
      if (!payee) {
        await session.abortTransaction();
        return interaction.reply({ content: "Target user does not have a profile.", ephemeral: true });
      }

      payer.coins -= amount;
      payee.coins += amount;
      await payer.save({ session });
      await payee.save({ session });
      await session.commitTransaction();

      // Notify receiver via DM
      try {
        await targetUser.send({ content: `You received ${amount} coins from ${interaction.user.username}.` });
      } catch (dmErr) {
        console.info('[PAY] Could not DM recipient (privacy settings).');
      }
      return interaction.reply({ content: `You paid ${targetUser.username} ${amount} coins!`, ephemeral: false });
    } catch (err) {
      await session.abortTransaction();
      console.error('Pay command error:', err);
      return interaction.reply({ content: "An error occurred while processing your payment.", ephemeral: true });
    } finally {
      session.endSession();
    }
  }
// removed extra closing brace
};