const { SlashCommandBuilder } = require('discord.js');
const mongoose = require('mongoose');
const UserProfile = require('../../schemas/UserProfile');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Send money to another user')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to send money to')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to send')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const sender = interaction.user;
            const target = interaction.options.getUser('target');
            const amount = interaction.options.getInteger('amount');
            const guildId = interaction.guildId;

            // Validate target
            if (target.bot) {
                return interaction.editReply("You can't send money to bots!");
            }

            if (sender.id === target.id) {
                return interaction.editReply("You can't send money to yourself!");
            }

            // Get or create sender's profile
            let senderProfile = await UserProfile.findOne({ userId: sender.id, guildId });
            if (!senderProfile) {
                senderProfile = new UserProfile({ userId: sender.id, guildId, balance: 0 });
            }

            // Check if sender has enough money
            if (senderProfile.balance < amount) {
                return interaction.editReply(`You don't have enough money! Your balance: ${senderProfile.balance} coins`);
            }

            // Get or create target's profile
            let targetProfile = await UserProfile.findOne({ userId: target.id, guildId });
            if (!targetProfile) {
                targetProfile = new UserProfile({ userId: target.id, guildId, balance: 0 });
            }

            // Start transaction
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    // Update balances
                    senderProfile.balance -= amount;
                    targetProfile.balance += amount;

                    // Save both profiles
                    await senderProfile.save({ session });
                    await targetProfile.save({ session });
                });

                // Log the transaction
                console.log(`[PAY] ${sender.tag} sent ${amount} to ${target.tag} in ${interaction.guild.name}`);

                // Send success message
                await interaction.editReply({
                    content: `Successfully sent ${amount} coins to ${target}!\n` +
                            `Your new balance: ${senderProfile.balance} coins\n` +
                            `${target.username}'s new balance: ${targetProfile.balance} coins`
                });

                // Send DM to receiver
                try {
                    await target.send(`${sender.tag} sent you ${amount} coins! Your new balance: ${targetProfile.balance} coins`);
                } catch (dmError) {
                    console.log(`Couldn't send DM to ${target.tag}`);
                }

            } catch (transactionError) {
                console.error('[PAY] Transaction error:', transactionError);
                await interaction.editReply('There was an error processing the transaction.');
            } finally {
                await session.endSession();
            }

        } catch (error) {
            console.error('[PAY] Command error:', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'There was an error processing your payment.',
                        ephemeral: true
                    });
                } else {
                    await interaction.editReply('There was an error processing your payment.');
                }
            } catch (replyError) {
                console.error('[PAY] Reply error:', replyError);
            }
        }
    },
};