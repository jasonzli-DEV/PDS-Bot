const { SlashCommandBuilder } = require('discord.js');
const UserProfile = require('../../schemas/UserProfile');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Shows your current balance.'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        let userProfile = await UserProfile.findOne({ userId, guildId });

        if (!userProfile) {
            userProfile = new UserProfile({ userId, guildId, balance: 0 });
            await userProfile.save();
        }

        console.log(`[BALANCE] ${interaction.user.tag} checked balance: ${userProfile.balance} in ${interaction.guild.name}`);
        await interaction.reply({
            content: `💰 Your balance is: **${userProfile.balance}**`,
            ephemeral: true
        });
    }
};