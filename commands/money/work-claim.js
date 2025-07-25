const { SlashCommandBuilder } = require('discord.js');
const Work = require('../../schemas/Work');
const UserProfile = require('../../schemas/UserProfile');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work-claim')
        .setDescription('Claim your work reward after 5 minutes!'),
    async execute(interaction) {
        const userId = interaction.user.id;
        let work = await Work.findOne({ userId });

        if (!work) {
            return interaction.reply({ content: 'You have not started working yet. Use `/work-start` first!', ephemeral: true });
        }

        const now = new Date();
        if (now < work.nextClaim) {
            const remaining = Math.ceil((work.nextClaim - now) / 1000);
            return interaction.reply({ content: `You need to wait ${Math.ceil(remaining/60)} more minutes to claim your reward.`, ephemeral: true });
        }

        // Add reward to user profile
        let userProfile = await UserProfile.findOne({ userId });
        if (!userProfile) {
            userProfile = new UserProfile({ userId, balance: 0 });
        }
        userProfile.balance += work.reward;

        // Prepare next work: increase reward by 500, set nextClaim 5 minutes from now
        work.reward += 500;
        work.nextClaim = new Date(Date.now() + 5 * 60 * 1000);

        await Promise.all([userProfile.save(), work.save()]);

        await interaction.reply({ content: `You claimed ${work.reward - 500}! Your new balance is ${userProfile.balance}. Next time you work, you'll earn ${work.reward}.`, ephemeral: true });
    }
};