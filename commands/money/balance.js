const { SlashCommandBuilder } = require('discord.js');
const UserProfile = require('../../schemas/UserProfile');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Shows your current balance.'),
    async execute(interaction) {
            // Only allow this command in servers
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    flags: 64
                });
            }
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
            flags: 64
        });
    }
};