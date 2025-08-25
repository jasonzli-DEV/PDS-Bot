const { SlashCommandBuilder } = require('discord.js');
const UserProfile = require('../../schemas/UserProfile');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the top 10 richest users in this server.'),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const topUsers = await UserProfile.find({ guildId })
            .sort({ balance: -1 })
            .limit(10);

        const allUsers = await UserProfile.find({ guildId }).sort({ balance: -1 });
        const userRank = allUsers.findIndex(u => u.userId === userId) + 1;
        const userProfile = allUsers.find(u => u.userId === userId);

        const leaderboard = [];
        for (let i = 0; i < 10; i++) {
            if (topUsers[i]) {
                leaderboard.push(`**${i + 1}.** <@${topUsers[i].userId}> — 💰 **${topUsers[i].balance}**`);
            } else {
                leaderboard.push(`**${i + 1}.** —`);
            }
        }

        if (userRank > 10 && userProfile) {
            leaderboard.push(`\n**Your rank:** ${userRank}. <@${userId}> — 💰 **${userProfile.balance}**`);
        }

        console.log(`[LEADERBOARD] ${interaction.user.tag} viewed leaderboard in ${interaction.guild.name}`);
        await interaction.reply({
            content: `🏆 **Server Leaderboard** 🏆\n\n${leaderboard.join('\n')}`,
            allowedMentions: { users: [] }
        });
    }
};