const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UserProfile = require('../../schemas/UserProfile');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Gamble your coins for a chance to double them!')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('The amount of coins to gamble')
                .setRequired(true)
                .setMinValue(1)
        ),
    async execute(interaction) {
        const betAmount = interaction.options.getInteger('amount');
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        // Fetch or create user profile
        let userProfile = await UserProfile.findOne({ userId, guildId });
        if (!userProfile) {
            userProfile = new UserProfile({ userId, guildId, balance: 0 });
        }

        if (userProfile.balance < betAmount) {
            return interaction.reply({
                content: `❌ You don't have enough coins! Your balance: **${userProfile.balance}** coins.`,
                ephemeral: true
            });
        }

        // Gamble logic: 50% win, 50% lose
        const win = Math.random() < 0.5;
        let resultText, color;
        if (win) {
            userProfile.balance += betAmount;
            resultText = `🎉 You won **${betAmount}** coins!`;
            color = 0x00ff00;
        } else {
            userProfile.balance -= betAmount;
            resultText = `😢 You lost **${betAmount}** coins.`;
            color = 0xff0000;
        }
        await userProfile.save();

        const embed = new EmbedBuilder()
            .setTitle('🎲 Gamble Result')
            .setDescription(resultText)
            .addFields(
                { name: 'New Balance', value: `${userProfile.balance} coins`, inline: true }
            )
            .setColor(color)
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
