const { SlashCommandBuilder } = require('discord.js');
const Work = require('../../schemas/Work');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work-start')
        .setDescription('Start working to earn money. Claim after 5 minutes!'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        let work = await Work.findOne({ userId, guildId });

        const now = new Date();
        // If work exists and not expired, check if claim is ready
        if (work && work.nextClaim > now && work.expiresAt > now) {
            const remaining = Math.ceil((work.nextClaim - now) / 1000);
            return interaction.reply({ content: `You are already working! Claim in ${Math.ceil(remaining/60)} minutes.`, ephemeral: true });
        }

        // If work exists but expired, reset it
        const nextClaim = new Date(Date.now() + 5 * 60 * 1000);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 5 min to claim after ready

        if (!work) {
            work = new Work({
                userId,
                guildId,
                nextClaim,
                reward: 10000,
                expiresAt
            });
        } else {
            work.nextClaim = nextClaim;
            work.expiresAt = expiresAt;
            // reward stays the same until claimed
        }

        await work.save();
        await interaction.reply({ content: 'You started working! Use `/work-claim` in 5 minutes to get your reward.', ephemeral: true });
    }
};