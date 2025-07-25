const { SlashCommandBuilder } = require('discord.js');
const Work = require('../../schemas/Work');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work-start')
        .setDescription('Start working to earn money. Claim after 5 minutes!'),
    async execute(interaction) {
        const userId = interaction.user.id;
        let work = await Work.findOne({ userId });

        const now = new Date();
        if (work && work.nextClaim > now) {
            const remaining = Math.ceil((work.nextClaim - now) / 1000);
            return interaction.reply({ content: `You are already working! Claim in ${Math.ceil(remaining/60)} minutes.`, ephemeral: true });
        }

        if (!work) {
            work = new Work({
                userId,
                nextClaim: new Date(Date.now() + 5 * 60 * 1000),
                reward: 10000
            });
        } else {
            work.nextClaim = new Date(Date.now() + 5 * 60 * 1000);
            // reward stays the same until claimed
        }

        await work.save();
        await interaction.reply({ content: 'You started working! Use `/work-claim` in 5 minutes to get your reward.', ephemeral: true });
    }
};