const { SlashCommandBuilder } = require('discord.js');
const UserProfile = require('../../schemas/UserProfile');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Shows your current balance.'),
    async execute(interaction) {
        const userId = interaction.user.id;
        let userProfile = await UserProfile.findOne({ userId });

        if (!userProfile) {
            userProfile = new UserProfile({ userId, balance: 0 });
            await userProfile.save();
        }

        await interaction.reply({
            content: `💰 Your balance is: **${userProfile.balance}**`,
            ephemeral: true
        });
    }
};