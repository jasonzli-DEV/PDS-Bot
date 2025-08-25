const { SlashCommandBuilder } = require('discord.js');
const Cooldown = require('../../schemas/Cooldown');
const UserProfile = require('../../schemas/UserProfile');

function getRandomNumber(x, y) {
    return Math.floor(Math.random() * (y - x + 1)) + x;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg to get some extra money.'),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            await interaction.reply({
                content: "You can only run this command inside a server",
                ephemeral: true,
            });
            return;
        }

        try {
            await interaction.deferReply();

            const commandName = 'beg';
            const userID = interaction.user.id;
            const guildId = interaction.guild.id;

            let cooldown = await Cooldown.findOne({ userID, commandName });

            if (cooldown && Date.now() < cooldown.endsAt.getTime()) {
                const prettyMs = (await import('pretty-ms')).default;
                await interaction.editReply(
                    `You are on cooldown, come back after ${prettyMs(cooldown.endsAt.getTime() - Date.now())}`
                );
                return;
            }

            if (!cooldown) {
                cooldown = new Cooldown({ userID, commandName, endsAt: new Date() });
            }

            const chance = getRandomNumber(0, 100);

            if (chance < 40) {
                console.log(`[BEG] ${interaction.user.tag} failed to beg in ${interaction.guild.name}`);
                await interaction.editReply("You didn't get anything this time. Try again later.");
                cooldown.endsAt = new Date(Date.now() + 300_000); // 5 minutes
                await cooldown.save();
                return;
            }

            const amount = getRandomNumber(30, 150);

            let userProfile = await UserProfile.findOne({ userId: userID, guildId });
            if (!userProfile) {
                userProfile = new UserProfile({ userId: userID, guildId, balance: 0 });
            }

            userProfile.balance += amount;
            cooldown.endsAt = new Date(Date.now() + 300_000); // 5 minutes

            await Promise.all([cooldown.save(), userProfile.save()]);

            console.log(`[BEG] ${interaction.user.tag} begged and got ${amount} in ${interaction.guild.name}. New balance: ${userProfile.balance}`);
            await interaction.editReply(`You got ${amount}! \nNew balance: ${userProfile.balance}`);
        } catch (error) {
            console.error(`[BEG] Error handling /beg: ${error}`);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },
};