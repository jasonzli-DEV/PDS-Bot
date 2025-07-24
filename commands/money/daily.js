const { SlashCommandBuilder } = require('discord.js');
const UserProfile = require('../../schemas/UserProfile');

const dailyAmount = 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward!'),

    execute: async (interaction) => {
        if (!interaction.inGuild()) {
            await interaction.reply({
                content: "This command can only be used in a server.",
                ephemeral: true
            });
            return;
        }

        try {
            await interaction.deferReply();

            let userProfile = await UserProfile.findOne({
                userId: interaction.user.id,
            });

            if (userProfile) {
                const lastDailyDate = userProfile.lastDailyCollected?.toDateString();
                const currentDate = new Date().toDateString();

                if (lastDailyDate === currentDate) {
                    await interaction.editReply("You have already collected your daily reward today. Come back tomorrow!");
                    return;
                }
            } else {
                userProfile = new UserProfile({
                    userId: interaction.user.id,
                });
            }

            userProfile.balance += dailyAmount;
            userProfile.lastDailyCollected = new Date();

            await userProfile.save();
            await interaction.editReply(
                `You have collected your daily reward of ${dailyAmount} coins! \nYour new balance is ${userProfile.balance} coins.`
            );
        } catch (error) {
            console.error(`Error executing /daily: ${error}`);
            if (interaction.deferred) {
                await interaction.editReply('There was an error while executing this command!');
            } else {
                await interaction.reply('There was an error while executing this command!');
            }
        }
    },
};