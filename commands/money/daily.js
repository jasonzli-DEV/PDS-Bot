const { SlashCommandBuilder } = require('discord.js');
const UserProfile = require('../../schemas/UserProfile');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward!'),
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
        }

        const now = new Date();
        const lastCollected = userProfile.lastDailyCollected || new Date(0);

        if (now - lastCollected < 24 * 60 * 60 * 1000) {
            console.log(`[DAILY] ${interaction.user.tag} tried to claim daily but is on cooldown.`);
            return interaction.reply({ content: 'You have already claimed your daily reward. Try again later!', ephemeral: true });
        }

        userProfile.balance += 500;
        userProfile.lastDailyCollected = now;
        await userProfile.save();

        console.log(`[DAILY] ${interaction.user.tag} claimed daily reward in ${interaction.guild.name}. New balance: ${userProfile.balance}`);
        await interaction.reply({ content: `You claimed your daily reward! New balance: ${userProfile.balance}` });
    }
};