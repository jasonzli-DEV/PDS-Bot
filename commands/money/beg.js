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
            const userId = interaction.user.id;

            let cooldown = await Cooldown.findOne({ userId, command: commandName });

            if (cooldown && Date.now() < cooldown.endsAt) {
                const prettyMs = (await import('pretty-ms')).default;
                await interaction.editReply(
                    `You are on cooldown, come back after ${prettyMs(cooldown.endsAt - Date.now())}`
                );
                return;
            }

            if (!cooldown) {
                cooldown = new Cooldown({ userId, command: commandName });
            }

            const chance = getRandomNumber(0, 100);

            if (chance < 40) {
                await interaction.editReply("You didn't get anything this time. Try again later.");
                cooldown.endsAt = Date.now() + 300_000;
                await cooldown.save();
                return;
            }

            const amount = getRandomNumber(30, 150);

            let userProfile = await UserProfile.findOne({ userId });
            if (!userProfile) {
                userProfile = new UserProfile({ userId, balance: 0 });
            }

            userProfile.balance += amount;
            cooldown.endsAt = Date.now() + 300_000;

            await Promise.all([cooldown.save(), userProfile.save()]);

            await interaction.editReply(`You got ${amount}! \nNew balance: ${userProfile.balance}`);
        } catch (error) {
            console.error(`Error handling /beg: ${error}`);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },
};