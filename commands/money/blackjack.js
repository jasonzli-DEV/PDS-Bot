const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function getCard() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const value = values[Math.floor(Math.random() * values.length)];
    return { suit, value };
}

function getHandValue(hand) {
    let value = 0;
    let aces = 0;
    for (const card of hand) {
        if (card.value === 'A') {
            aces++;
            value += 11;
        } else if (['K', 'Q', 'J'].includes(card.value)) {
            value += 10;
        } else {
            value += parseInt(card.value);
        }
    }
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    return value;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play blackjack against the bot dealer!')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to gamble')
                .setRequired(true)),
    async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    if (amount < 1) return interaction.reply({ content: 'Bet must be at least 1 coin.', flags: 64 });

        // Load user profile
        const UserProfile = require('../../schemas/UserProfile');
        let userProfile = await UserProfile.findOne({ userId: interaction.user.id, guildId: interaction.guildId });
        if (!userProfile) {
            userProfile = new UserProfile({ userId: interaction.user.id, guildId: interaction.guildId, balance: 0 });
            await userProfile.save();
        }
        if (userProfile.balance < amount) {
            return interaction.reply({ content: `You don't have enough coins! Your balance: ${userProfile.balance} coins`, flags: 64 });
        }

        // Initial hands
        let playerHand = [getCard(), getCard()];
        let dealerHand = [getCard(), getCard()];
        let playerValue = getHandValue(playerHand);
        let dealerValue = getHandValue([dealerHand[0]]); // Show only one dealer card

        let gameOver = false;
        let resultMsg = '';

        // Player turn: simple hit/stand via buttons
        const embed = new EmbedBuilder()
            .setTitle('🃏 Blackjack')
            .setDescription(
                `Your hand: ${playerHand.map(c => `${c.value}${c.suit}`).join(' ')} (${playerValue})\n` +
                `Dealer shows: ${dealerHand[0].value}${dealerHand[0].suit} (${getHandValue([dealerHand[0]])})\n` +
                `Bet: **${amount}** coins\n\nReact with 🟩 to Hit or 🟥 to Stand.`
            )
            .setColor('#2ecc40');

        const row = {
            type: 1,
            components: [
                { type: 2, style: 3, custom_id: 'hit', label: 'Hit', emoji: '🟩' },
                { type: 2, style: 4, custom_id: 'stand', label: 'Stand', emoji: '🟥' }
            ]
        };

        await interaction.reply({ embeds: [embed], components: [row] });

        // Collector for button interactions
        const filter = i => i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            if (gameOver) return;
            if (i.customId === 'hit') {
                playerHand.push(getCard());
                playerValue = getHandValue(playerHand);
                if (playerValue > 21) {
                    gameOver = true;
                    resultMsg = `You busted with ${playerValue}! You lose **${amount}** coins.`;
                    userProfile.balance -= amount;
                    await userProfile.save();
                }
            } else if (i.customId === 'stand') {
                // Dealer's turn
                dealerValue = getHandValue(dealerHand);
                while (dealerValue < 17) {
                    dealerHand.push(getCard());
                    dealerValue = getHandValue(dealerHand);
                }
                if (dealerValue > 21 || playerValue > dealerValue) {
                    gameOver = true;
                    resultMsg = `Dealer has ${dealerValue}. You win **${amount}** coins!`;
                    userProfile.balance += amount;
                    await userProfile.save();
                } else if (playerValue < dealerValue) {
                    gameOver = true;
                    resultMsg = `Dealer has ${dealerValue}. You lose **${amount}** coins.`;
                    userProfile.balance -= amount;
                    await userProfile.save();
                } else {
                    gameOver = true;
                    resultMsg = `Push! Both have ${playerValue}. Your bet is returned.`;
                }
            }
            // Update embed
            const newEmbed = new EmbedBuilder()
                .setTitle('🃏 Blackjack')
                .setDescription(
                    `Your hand: ${playerHand.map(c => `${c.value}${c.suit}`).join(' ')} (${playerValue})\n` +
                    `Dealer shows: ${dealerHand[0].value}${dealerHand[0].suit} (${getHandValue([dealerHand[0]])})\n` +
                    (gameOver ? `\n${resultMsg}` : `Bet: **${amount}** coins\n\nReact with 🟩 to Hit or 🟥 to Stand.`)
                )
                .setColor(gameOver ? (resultMsg.includes('win') ? '#2ecc40' : '#e74c3c') : '#2ecc40');
            await i.update({ embeds: [newEmbed], components: gameOver ? [] : [row] });
            if (gameOver) {
                // DM receipt
                try {
                    const receiptEmbed = new EmbedBuilder()
                        .setTitle('🧾 Blackjack Receipt')
                        .setDescription(
                            `Result: ${resultMsg}\n` +
                            `Your final hand: ${playerHand.map(c => `${c.value}${c.suit}`).join(' ')} (${playerValue})\n` +
                            `Dealer final hand: ${dealerHand.map(c => `${c.value}${c.suit}`).join(' ')} (${getHandValue(dealerHand)})\n` +
                            `Bet: **${amount}** coins\n` +
                            `New Balance: **${userProfile.balance}** coins`
                        )
                        .setColor(resultMsg.includes('win') ? '#2ecc40' : (resultMsg.includes('lose') ? '#e74c3c' : '#f1c40f'));
                    await i.user.send({ embeds: [receiptEmbed] });
                } catch (e) {
                    // Ignore DM errors
                }
                // Console log for bet and result
                console.log(`[BLACKJACK] ${i.user.tag} bet ${amount} coins. Result: ${resultMsg.replace(/\*\*/g, '')} | New Balance: ${userProfile.balance}`);
                collector.stop();
            }
        });

        collector.on('end', async () => {
            if (!gameOver) {
                await interaction.editReply({ content: 'Game timed out.', components: [] });
            }
        });
    }
};
