const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const UserProfile = require('../../schemas/UserProfile');
const RPSMatch = require('../../schemas/RPSMatch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock, Paper, Scissors - Best of 3 with betting!'),

    async execute(interaction) {
        try {
            // Check if command is used in a server
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in servers!',
                    flags: 64
                });
            }

            // Create main RPS interface
            const embed = new EmbedBuilder()
                .setTitle('🎮 Rock, Paper, Scissors')
                .setDescription(
                    'Welcome to Rock, Paper, Scissors!\n\n' +
                    '**How to play:**\n' +
                    '• Best of 3 rounds\n' +
                    '• Betting is required\n' +
                    '• 1-minute timeout for each move\n' +
                    '• Winner takes all coins\n\n' +
                    '**Choose an option below:**'
                )
                .setColor('#00ff00')
                .setFooter({ text: 'Select an option to continue' });

            // Create buttons for main options
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('rps_challenge')
                        .setLabel('⚔️ Challenge Someone')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('rps_view_challenges')
                        .setLabel('📋 View Challenges')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('rps_ai')
                        .setLabel('🤖 Play vs AI')
                        .setStyle(ButtonStyle.Success)
                );

            await interaction.reply({
                embeds: [embed],
                components: [row],
                flags: 64
            });

        } catch (error) {
            console.error('RPS command error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing the command.',
                    flags: 64
                });
            } else if (interaction.deferred) {
                await interaction.editReply('An error occurred while processing the command.');
            } else {
                await interaction.followUp({
                    content: 'An error occurred while processing the command.',
                    flags: 64
                });
            }
        }
    },
};

// Helper functions for RPS command
async function handleChallenge(interaction) {
    // Show user selection menu
    const embed = new EmbedBuilder()
        .setTitle('👥 Select Opponent')
        .setDescription('Choose a user to challenge to Rock, Paper, Scissors!')
        .setColor('#00ff00');
    
    // Get all members in the guild
    const members = await interaction.guild.members.fetch();
    const userOptions = members
        .filter(member => !member.user.bot && member.user.id !== interaction.user.id)
        .map(member => ({
            label: member.user.username,
            value: member.user.id,
            description: `Challenge ${member.user.username}`
        }))
        .slice(0, 25); // Discord limit
    
    if (userOptions.length === 0) {
        return interaction.reply({
            content: 'No other users found to challenge!',
            flags: 64
        });
    }
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('rps_user_select')
        .setPlaceholder('Choose an opponent...')
        .addOptions(userOptions);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.update({
        embeds: [embed],
        components: [row],
        flags: 64
    });
}

async function handleViewChallenges(interaction) {

    // Get all challenges for this user
    const userChallenges = [];
    for (const [challengerId, challengerChallenges] of interaction.client.rpsChallenges.entries()) {
        if (challengerChallenges instanceof Map) {
            for (const [challengeId, challengeData] of challengerChallenges.entries()) {
                if (challengeData.opponent === interaction.user.id) {
                    const challenger = await interaction.client.users.fetch(challengerId);
                    userChallenges.push({
                        ...challengeData,
                        challengerName: challenger.username,
                        challengerId: challengerId,
                        challengeId: challengeId
                    });
                }
            }
        }
    }

    if (userChallenges.length === 0) {
        return interaction.reply({
            content: 'You have no pending challenges.',
            flags: 64
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('📋 Your Pending Challenges')
        .setDescription('Select a challenge to accept:')
        .setColor('#00ff00');

    const challengeOptions = userChallenges.map((challenge, index) => ({
        label: `${challenge.challengerName} - ${challenge.betAmount} coins`,
        value: challenge.challengeId,
        description: `Bet: ${challenge.betAmount} coins`
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('rps_accept_challenge')
        .setPlaceholder('Choose a challenge to accept...')
        .addOptions(challengeOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: 64
    });
}

async function createChallenge(interaction, opponentId, betAmount) {
    
    const challengeId = generateGameId(interaction.client);
    const challengeData = {
        challenger: interaction.user.id,
        opponent: opponentId,
        betAmount: betAmount,
        guildId: interaction.guildId,
        timestamp: Date.now(),
        challengeId: challengeId
    };
    
    // Store challenge by challenger ID for easy lookup
    if (!interaction.client.rpsChallenges.has(interaction.user.id)) {
        interaction.client.rpsChallenges.set(interaction.user.id, new Map());
    }
    interaction.client.rpsChallenges.get(interaction.user.id).set(challengeId, challengeData);
    
    const opponent = await interaction.client.users.fetch(opponentId);
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Challenge Sent!')
        .setDescription(
            `Challenge sent to ${opponent.username}!\n\n` +
            `💰 Bet: ${betAmount} coins each\n` +
            `⏰ Expires in 3 minutes\n\n` +
            `They have been pinged in this channel.`
        )
        .setColor('#00ff00');
    
    await interaction.reply({
        embeds: [embed],
        flags: 64
    });
    
    // Ping the opponent in the channel
    const challengeEmbed = new EmbedBuilder()
        .setTitle('🎮 Rock, Paper, Scissors Challenge!')
        .setDescription(
            `${interaction.user.username} has challenged you to Rock, Paper, Scissors!\n\n` +
            `💰 Bet: ${betAmount} coins each\n` +
            `🏆 Best of 3 rounds\n\n` +
            `Use \`/rps\` and click "View Challenges" to accept or decline!`
        )
        .setColor('#ffff00')
        .setFooter({ text: 'Challenge expires in 3 minutes' });
    
    await interaction.followUp({
        content: `${opponent}`,
        embeds: [challengeEmbed]
    });
    
    // Auto-expire challenge after 3 minutes
    setTimeout(() => {
        if (interaction.client.rpsChallenges.has(interaction.user.id)) {
            const userChallenges = interaction.client.rpsChallenges.get(interaction.user.id);
            if (userChallenges && userChallenges.has(challengeId)) {
                userChallenges.delete(challengeId);
                if (userChallenges.size === 0) {
                    interaction.client.rpsChallenges.delete(interaction.user.id);
                }
            }
        }
    }, 180000); // 3 minutes
}

async function acceptChallenge(interaction, challengeId) {

    // Find the challenge by challengeId
    let challengeData = null;
    let challengerId = null;
    
    for (const [challenger, challengerChallenges] of interaction.client.rpsChallenges.entries()) {
        if (challengerChallenges instanceof Map && challengerChallenges.has(challengeId)) {
            challengeData = challengerChallenges.get(challengeId);
            challengerId = challenger;
            break;
        }
    }
    
    if (!challengeData || challengeData.opponent !== interaction.user.id) {
        return interaction.reply({
            content: 'This challenge is no longer available.',
            flags: 64
        });
    }

    // Remove the challenge
    const challengerChallenges = interaction.client.rpsChallenges.get(challengerId);
    if (challengerChallenges) {
        challengerChallenges.delete(challengeId);
        if (challengerChallenges.size === 0) {
            interaction.client.rpsChallenges.delete(challengerId);
        }
    }

    // Start the game

    const gameId = generateGameId(interaction.client);
    const challenger = await interaction.client.users.fetch(challengeData.challenger);
    const opponent = await interaction.client.users.fetch(challengeData.opponent);

    // Determine who goes first (alternating pattern)
    const firstPlayerId = await determineFirstPlayer(challengeData.challenger, challengeData.opponent, challengeData.guildId);
    const secondPlayerId = firstPlayerId === challengeData.challenger ? challengeData.opponent : challengeData.challenger;
    const firstPlayer = firstPlayerId === challengeData.challenger ? challenger : opponent;
    const secondPlayer = firstPlayerId === challengeData.challenger ? opponent : challenger;

    // Create database record for the match
    const matchRecord = new RPSMatch({
        matchId: gameId,
        guildId: challengeData.guildId,
        player1: {
            userId: firstPlayerId,
            username: firstPlayer.username,
            wins: 0
        },
        player2: {
            userId: secondPlayerId,
            username: secondPlayer.username,
            wins: 0
        },
        betAmount: challengeData.betAmount,
        matchType: 'pvp',
        status: 'ongoing',
        rounds: [],
        totalRounds: 0,
        startTime: new Date()
    });

    await matchRecord.save();

    const gameData = {
        type: 'pvp',
        player1: firstPlayerId,
        player2: secondPlayerId,
        betAmount: challengeData.betAmount,
        guildId: challengeData.guildId,
        round: 1,
        player1Wins: 0,
        player2Wins: 0,
        player1Choice: null,
        player2Choice: null,
        currentPlayer: firstPlayerId,
        timestamp: Date.now(),
        matchId: gameId,
        matchRecord: matchRecord
    };

    interaction.client.rpsGames.set(gameId, gameData);

    const embed = new EmbedBuilder()
        .setTitle('🎮 Rock, Paper, Scissors')
        .setDescription(
            `${firstPlayer.username} vs ${secondPlayer.username}\n` +
            `Round 1/3\n` +
            `💰 Bet: ${challengeData.betAmount} coins each\n\n` +
            `⏳ ${firstPlayer.username}, choose your move!\n\n` +
            `📊 **Current Score:**\n` +
            `${firstPlayer.username}: 0 wins\n` +
            `${secondPlayer.username}: 0 wins`
        )
        .setColor('#00ff00');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`rps_choice_${gameId}_rock`)
                .setLabel('🪨 Rock')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`rps_choice_${gameId}_paper`)
                .setLabel('📄 Paper')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`rps_choice_${gameId}_scissors`)
                .setLabel('✂️ Scissors')
                .setStyle(ButtonStyle.Primary)
        );

    // Send ephemeral confirmation to the person who accepted
    await interaction.reply({
        content: `✅ Challenge accepted! The game has started.`,
        flags: 64
    });

    // Add forfeit button to the row
    const forfeitRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`rps_choice_${gameId}_rock`)
                .setLabel('🪨 Rock')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`rps_choice_${gameId}_paper`)
                .setLabel('📄 Paper')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`rps_choice_${gameId}_scissors`)
                .setLabel('✂️ Scissors')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`rps_forfeit_${gameId}`)
                .setLabel('🏳️ Forfeit')
                .setStyle(ButtonStyle.Danger)
        );

    // Send game start in the server with buttons
    const gameMessage = await interaction.followUp({
        content: `${firstPlayer} - Game started! It's your turn!`,
        embeds: [embed],
        components: [forfeitRow]
    });

    startCountdown(interaction, gameId, 60);

    // Try to edit the original challenge message if possible
    try {
        // Find the original challenge message by looking for a message with the challenge embed
        const messages = await interaction.channel.messages.fetch({ limit: 50 });
        const challengeMessage = messages.find(msg => 
            msg.embeds.length > 0 && 
            msg.embeds[0].title === '✅ Challenge Sent!' &&
            msg.embeds[0].description.includes(opponent.username)
        );
        
        if (challengeMessage) {
            // Edit the original challenge message to show game status (no buttons)
            const updatedEmbed = new EmbedBuilder()
                .setTitle('🎮 Challenge Accepted!')
                .setDescription(
                    `✅ ${opponent.username} has accepted ${challenger.username}'s challenge!\n\n` +
                    `💰 Bet: ${challengeData.betAmount} coins each\n` +
                    `🏆 Best of 3 rounds\n\n` +
                    `⏳ ${challenger.username} is choosing their move...`
                )
                .setColor('#00ff00');
            
            await challengeMessage.edit({
                content: `${challenger}`,
                embeds: [updatedEmbed],
                components: [] // No buttons in the channel message
            });
        }
    } catch (error) {
        console.error('Error editing challenge message:', error);
    }
}

// Helper function to generate 6-digit alphanumeric game ID
function generateGameId(client) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result;
    let attempts = 0;
    const maxAttempts = 100;
    
    do {
        result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        attempts++;
    } while (client && client.rpsGames && client.rpsGames.has(result) && attempts < maxAttempts);
    
    // If we still have a collision after max attempts, append a number
    if (client && client.rpsGames && client.rpsGames.has(result)) {
        result += Math.floor(Math.random() * 10);
    }
    
    return result;
}

// Helper function to determine who goes first (alternating pattern)
async function determineFirstPlayer(challengerId, opponentId, guildId) {
    try {
        // Get recent matches between these two players
        const recentMatches = await RPSMatch.find({
            guildId: guildId,
            $or: [
                { 'player1.userId': challengerId, 'player2.userId': opponentId },
                { 'player1.userId': opponentId, 'player2.userId': challengerId }
            ],
            status: 'completed'
        }).sort({ endTime: -1 }).limit(10);
        
        if (recentMatches.length === 0) {
            // First game between these players - challenger goes first
            return challengerId;
        }
        
        // Count how many times each player went first in recent matches
        let challengerFirstCount = 0;
        let opponentFirstCount = 0;
        
        for (const match of recentMatches) {
            if (match.player1.userId === challengerId) {
                challengerFirstCount++;
            } else if (match.player1.userId === opponentId) {
                opponentFirstCount++;
            }
        }
        
        // Alternate: if challenger went first more times, opponent goes first
        if (challengerFirstCount > opponentFirstCount) {
            return opponentId;
        } else {
            return challengerId;
        }
    } catch (error) {
        console.error('Error determining first player:', error);
        // Fallback: challenger goes first
        return challengerId;
    }
}

// Helper function to handle forfeit
async function handleForfeit(interaction, gameId) {
    const gameData = interaction.client.rpsGames.get(gameId);
    
    if (!gameData) {
        return interaction.reply({
            content: 'This game has expired or been cancelled.',
            flags: 64
        });
    }
    
    // Check if it's the current player's turn (for PvP games)
    if (gameData.type === 'pvp' && interaction.user.id !== gameData.currentPlayer) {
        return interaction.reply({
            content: 'You can only forfeit on your turn!',
            flags: 64
        });
    }
    
    // Determine who forfeited and who wins
    const forfeitResult = gameData.type === 'ai' ? 'player2' : // AI wins if player forfeits
                         interaction.user.id === gameData.player1 ? 'player2' : 'player1';
    
    if (gameData.type === 'ai') {
        await endGame(interaction, gameId, forfeitResult, gameData);
    } else {
        await endPVPGame(interaction, gameId, forfeitResult, gameData);
    }
}

// Helper function to determine winner
function determineWinner(choice1, choice2) {
    if (choice1 === choice2) return 'tie';
    if ((choice1 === 0 && choice2 === 2) || (choice1 === 1 && choice2 === 0) || (choice1 === 2 && choice2 === 1)) {
        return 'player1';
    }
    return 'player2';
}

// Helper function to start animated loading for current player
function startAnimatedLoading(interaction, gameId, currentPlayerId) {
    const gameData = interaction.client.rpsGames.get(gameId);
    if (!gameData) return;
    
    // Clear any existing animation
    if (gameData.animationInterval) {
        clearInterval(gameData.animationInterval);
    }
    
    let dotCount = 0;
    const maxDots = 3;
    
    gameData.animationInterval = setInterval(async () => {
        const currentGameData = interaction.client.rpsGames.get(gameId);
        if (!currentGameData || currentGameData.currentPlayer !== currentPlayerId) {
            // Stop animation if game ended or turn changed
            if (currentGameData && currentGameData.animationInterval) {
                clearInterval(currentGameData.animationInterval);
                currentGameData.animationInterval = null;
            }
            return;
        }
        
        dotCount = (dotCount + 1) % (maxDots + 1);
        const dots = '.'.repeat(dotCount);
        
        try {
            const currentPlayer = await interaction.client.users.fetch(currentPlayerId);
            const player1 = await interaction.client.users.fetch(currentGameData.player1);
            const player2 = await interaction.client.users.fetch(currentGameData.player2);
            
            const embed = new EmbedBuilder()
                .setTitle('🎮 Rock, Paper, Scissors')
                .setDescription(
                    `${player1.username} vs ${player2.username}\n` +
                    `Round ${currentGameData.round}/3\n` +
                    `💰 Bet: ${currentGameData.betAmount} coins each\n\n` +
                    `⏳ ${currentPlayer.username} is making their move${dots}\n\n` +
                    `📊 **Current Score:**\n` +
                    `${player1.username}: ${currentGameData.player1Wins} wins\n` +
                    `${player2.username}: ${currentGameData.player2Wins} wins`
                )
                .setColor('#ffff00');
            
            // Try to edit the last message in the channel
            const messages = await interaction.channel.messages.fetch({ limit: 10 });
            const lastGameMessage = messages.find(msg => 
                msg.embeds.length > 0 && 
                msg.embeds[0].title === '🎮 Rock, Paper, Scissors' &&
                msg.author.id === interaction.client.user.id
            );
            
            if (lastGameMessage) {
                await lastGameMessage.edit({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error updating animated loading:', error);
        }
    }, 500); // Update every 500ms
}

// Export helper functions for use in index.js
module.exports.handleChallenge = handleChallenge;
module.exports.handleViewChallenges = handleViewChallenges;
module.exports.createChallenge = createChallenge;
module.exports.acceptChallenge = acceptChallenge;
module.exports.startAnimatedLoading = startAnimatedLoading;

// Helper function to create result embed
function createResultEmbed(player1Name, player2Name, player1Choice, player2Choice, result, betAmount, player1Id, player2Id) {
    const embed = new EmbedBuilder()
        .setTitle('🎮 Rock, Paper, Scissors - Results')
        .setColor(result === 'tie' ? '#ffff00' : '#00ff00')
        .addFields(
            { name: `${player1Name}`, value: player1Choice, inline: true },
            { name: 'VS', value: '⚔️', inline: true },
            { name: `${player2Name}`, value: player2Choice, inline: true }
        );

    let resultText = '';
    if (result === 'tie') {
        resultText = '🤝 It\'s a tie!';
        embed.setColor('#ffff00');
    } else if (result === 'player1') {
        resultText = `🎉 ${player1Name} wins!`;
        embed.setColor('#00ff00');
    } else {
        resultText = `🎉 ${player2Name} wins!`;
        embed.setColor('#ff0000');
    }

    if (betAmount > 0) {
        if (result === 'tie') {
            resultText += `\n💰 No coins exchanged (tie)`;
        } else if (result === 'player1') {
            resultText += `\n💰 ${player1Name} wins ${betAmount * 2} coins!`;
        } else {
            resultText += `\n💰 ${player2Name} wins ${betAmount * 2} coins!`;
        }
    }

    embed.setDescription(resultText);
    return embed;
}

// Helper function to handle betting results
async function handleBettingResult(result, player1Id, player2Id, betAmount, guildId) {
    try {
        if (result === 'tie') {
            return; // No coins exchanged on tie
        }

        const winnerId = result === 'player1' ? player1Id : player2Id;
        const loserId = result === 'player1' ? player2Id : player1Id;

        // Get or create profiles
        let winnerProfile = await UserProfile.findOne({ userId: winnerId, guildId });
        if (!winnerProfile) {
            winnerProfile = new UserProfile({ userId: winnerId, guildId, balance: 0 });
        }

        let loserProfile = await UserProfile.findOne({ userId: loserId, guildId });
        if (!loserProfile) {
            loserProfile = new UserProfile({ userId: loserId, guildId, balance: 0 });
        }

        // Update balances
        winnerProfile.balance += betAmount * 2; // Winner gets both bets
        loserProfile.balance -= betAmount;

        // Save profiles
        await winnerProfile.save();
        await loserProfile.save();

    } catch (error) {
        console.error('Error handling betting result:', error);
    }
}

// RPS Game Helper Functions
async function startAIGame(interaction, betAmount) {
    const gameId = generateGameId(interaction.client);
    
    // Create database record for the AI match
    const matchRecord = new RPSMatch({
        matchId: gameId,
        guildId: interaction.guildId,
        player1: {
            userId: interaction.user.id,
            username: interaction.user.username,
            wins: 0
        },
        player2: {
            userId: 'ai',
            username: 'AI',
            wins: 0
        },
        betAmount: betAmount,
        matchType: 'ai',
        status: 'ongoing',
        rounds: [],
        totalRounds: 0,
        startTime: new Date()
    });

    await matchRecord.save();
    
    const gameData = {
        type: 'ai',
        player: interaction.user.id,
        betAmount: betAmount,
        guildId: interaction.guildId,
        round: 1,
        playerWins: 0,
        aiWins: 0,
        timestamp: Date.now(),
        matchId: gameId,
        matchRecord: matchRecord
    };

    interaction.client.rpsGames.set(gameId, gameData);

    const embed = new EmbedBuilder()
        .setTitle('🎮 Rock, Paper, Scissors vs AI')
        .setDescription(`Round 1/3\n💰 Bet: ${betAmount} coins\n\nChoose your move!`)
        .setColor('#00ff00');
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`rps_choice_${gameId}_rock`)
                .setLabel('🪨 Rock')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`rps_choice_${gameId}_paper`)
                .setLabel('📄 Paper')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`rps_choice_${gameId}_scissors`)
                .setLabel('✂️ Scissors')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`rps_forfeit_${gameId}`)
                .setLabel('🏳️ Forfeit')
                .setStyle(ButtonStyle.Danger)
        );
    
    await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: 64
    });
    
    // Start countdown
    startCountdown(interaction, gameId, 30);
}

async function handleRPSChoice(interaction) {
    const parts = interaction.customId.split('_');
    const gameId = parts.slice(2, -1).join('_'); // Everything between 'rps_' and the last part
    
    // Check if it's a forfeit button
    if (parts[parts.length - 1] === 'forfeit') {
        return handleForfeit(interaction, gameId);
    }
    
    const choice = parts[parts.length - 1]; // Last part is the choice
    const gameData = interaction.client.rpsGames.get(gameId);
    
    if (!gameData) {
        return interaction.reply({
            content: 'This game has expired or been cancelled.',
            flags: 64
        });
    }
    
    // Check if it's the current player's turn (for PvP games)
    if (gameData.type === 'pvp' && interaction.user.id !== gameData.currentPlayer) {
        // Start animated loading for the current player
        startAnimatedLoading(interaction, gameId, gameData.currentPlayer);
        
        // Don't allow the wrong player to make a move
        return interaction.reply({
            content: 'Please wait for your turn!',
            flags: 64
        });
    }
    
    if (gameData.type === 'ai') {
        await handleAIChoice(interaction, gameId, choice);
    } else {
        await handlePlayerChoice(interaction, gameId, choice);
    }
}

async function handleAIChoice(interaction, gameId, choice) {
    const gameData = interaction.client.rpsGames.get(gameId);
    const aiChoice = Math.floor(Math.random() * 3);
    const choices = ['rock', 'paper', 'scissors'];
    const choiceEmojis = ['🪨', '📄', '✂️'];
    const playerChoiceIndex = choices.indexOf(choice);
    
    const result = determineWinner(playerChoiceIndex, aiChoice);
    
    if (result === 'player1') {
        gameData.playerWins++;
    } else if (result === 'player2') {
        gameData.aiWins++;
    }
    
    // Save round data to database
    const roundData = {
        roundNumber: gameData.round,
        player1Choice: choice,
        player2Choice: choices[aiChoice],
        result: result,
        timestamp: new Date()
    };
    
    gameData.matchRecord.rounds.push(roundData);
    gameData.matchRecord.totalRounds = gameData.round;
    
    // Update player wins in database
    if (result === 'player1') {
        gameData.matchRecord.player1.wins = gameData.playerWins;
    } else if (result === 'player2') {
        gameData.matchRecord.player2.wins = gameData.aiWins;
    }
    
    await gameData.matchRecord.save();
    
    const resultText = result === 'tie' ? 'Tie!' : 
                     result === 'player1' ? `You win! ${choiceEmojis[playerChoiceIndex]} beats ${choiceEmojis[aiChoice]}` :
                     `AI wins! ${choiceEmojis[aiChoice]} beats ${choiceEmojis[playerChoiceIndex]}`;
    
    const embed = new EmbedBuilder()
        .setTitle('🎮 Rock, Paper, Scissors vs AI')
        .setDescription(
            `Round ${gameData.round}/3\n` +
            `💰 Bet: ${gameData.betAmount} coins\n\n` +
            `You chose: ${choiceEmojis[playerChoiceIndex]} ${choice}\n` +
            `AI chose: ${choiceEmojis[aiChoice]} ${choices[aiChoice]}\n\n` +
            `**${resultText}**\n\n` +
            `Score: You ${gameData.playerWins} - ${gameData.aiWins} AI`
        )
        .setColor(result === 'tie' ? '#ffff00' : result === 'player1' ? '#00ff00' : '#ff0000');
    
    await interaction.update({ embeds: [embed], components: [] });
    
    // Handle tie - redo the round
    if (result === 'tie') {
        setTimeout(async () => {
            const redoRoundEmbed = new EmbedBuilder()
                .setTitle('🎮 Rock, Paper, Scissors vs AI')
                .setDescription(
                    `Round ${gameData.round}/3 (Redo)\n` +
                    `💰 Bet: ${gameData.betAmount} coins\n\n` +
                    `🤝 **It's a tie! Redoing this round...**\n\n` +
                    `📊 **Current Score:**\n` +
                    `You: ${gameData.playerWins} wins\n` +
                    `AI: ${gameData.aiWins} wins\n\n` +
                    `Choose your move!`
                )
                .setColor('#ffff00');
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`rps_choice_${gameId}_rock`)
                        .setLabel('🪨 Rock')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`rps_choice_${gameId}_paper`)
                        .setLabel('📄 Paper')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`rps_choice_${gameId}_scissors`)
                        .setLabel('✂️ Scissors')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`rps_forfeit_${gameId}`)
                        .setLabel('🏳️ Forfeit')
                        .setStyle(ButtonStyle.Danger)
                );
            
            await interaction.followUp({
                embeds: [redoRoundEmbed],
                components: [row],
                flags: 64
            });
            
            startCountdown(interaction, gameId, 60);
        }, 2000);
        return; // Don't proceed to next round logic
    }
    
    if (gameData.round >= 3 || gameData.playerWins >= 2 || gameData.aiWins >= 2) {
        const finalResult = gameData.playerWins > gameData.aiWins ? 'player1' : 'player2';
        await endGame(interaction, gameId, finalResult, gameData);
    } else {
        gameData.round++;
        setTimeout(async () => {
            const nextRoundEmbed = new EmbedBuilder()
                .setTitle('🎮 Rock, Paper, Scissors vs AI')
                .setDescription(`Round ${gameData.round}/3\n💰 Bet: ${gameData.betAmount} coins\n\nChoose your move!`)
                .setColor('#00ff00');
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`rps_choice_${gameId}_rock`)
                        .setLabel('🪨 Rock')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`rps_choice_${gameId}_paper`)
                        .setLabel('📄 Paper')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`rps_choice_${gameId}_scissors`)
                        .setLabel('✂️ Scissors')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`rps_forfeit_${gameId}`)
                        .setLabel('🏳️ Forfeit')
                        .setStyle(ButtonStyle.Danger)
                );
            
            await interaction.followUp({
                embeds: [nextRoundEmbed],
                components: [row],
                flags: 64
            });
            
            startCountdown(interaction, gameId, 60);
        }, 2000);
    }
}

async function handlePlayerChoice(interaction, gameId, choice) {
    const gameData = interaction.client.rpsGames.get(gameId);
    
    if (!gameData) {
        return interaction.reply({
            content: 'This game has expired or been cancelled.',
            flags: 64
        });
    }

    const choices = ['rock', 'paper', 'scissors'];
    const choiceEmojis = ['🪨', '📄', '✂️'];
    const choiceIndex = choices.indexOf(choice);

    if (gameData.currentPlayer === gameData.player1) {
        gameData.player1Choice = choice;
        gameData.player1ChoiceIndex = choiceIndex;
        gameData.currentPlayer = gameData.player2;
        
        const player1 = await interaction.client.users.fetch(gameData.player1);
        const player2 = await interaction.client.users.fetch(gameData.player2);
        
        const embed = new EmbedBuilder()
            .setTitle('🎮 Rock, Paper, Scissors')
            .setDescription(
                `${player1.username} vs ${player2.username}\n` +
                `Round ${gameData.round}/3\n` +
                `💰 Bet: ${gameData.betAmount} coins each\n\n` +
                `✅ ${player1.username} has chosen their move!\n` +
                `⏳ ${player2.username}, choose your move!\n\n` +
                `📊 **Current Score:**\n` +
                `${player1.username}: ${gameData.player1Wins} wins\n` +
                `${player2.username}: ${gameData.player2Wins} wins`
            )
            .setColor('#00ff00');
        
        await interaction.update({ embeds: [embed], components: [] });
        
        // Show buttons for player 2
        setTimeout(async () => {
            const forfeitRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`rps_choice_${gameId}_rock`)
                        .setLabel('🪨 Rock')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`rps_choice_${gameId}_paper`)
                        .setLabel('📄 Paper')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`rps_choice_${gameId}_scissors`)
                        .setLabel('✂️ Scissors')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`rps_forfeit_${gameId}`)
                        .setLabel('🏳️ Forfeit')
                        .setStyle(ButtonStyle.Danger)
                );
            
            // Send player 2 turn in the server with buttons
            await interaction.followUp({
                content: `${player2} - It's your turn!`,
                embeds: [embed],
                components: [forfeitRow]
            });
            
            startCountdown(interaction, gameId, 60);
        }, 1000);
        
    } else {
        gameData.player2Choice = choice;
        gameData.player2ChoiceIndex = choiceIndex;
        
        const result = determineWinner(gameData.player1ChoiceIndex, gameData.player2ChoiceIndex);
        
        const player1 = await interaction.client.users.fetch(gameData.player1);
        const player2 = await interaction.client.users.fetch(gameData.player2);
        
        // Handle tie - redo the round
        if (result === 'tie') {
            const embed = new EmbedBuilder()
                .setTitle('🎮 Round Results - Tie!')
                .setDescription(
                    `**Round ${gameData.round}/3 - TIE!**\n\n` +
                    `${player1.username}: ${choiceEmojis[gameData.player1ChoiceIndex]} ${gameData.player1Choice}\n` +
                    `${player2.username}: ${choiceEmojis[gameData.player2ChoiceIndex]} ${gameData.player2Choice}\n\n` +
                    `🤝 **It's a tie! Redoing this round...**\n\n` +
                    `📊 **Current Score:**\n` +
                    `${player1.username}: ${gameData.player1Wins} wins\n` +
                    `${player2.username}: ${gameData.player2Wins} wins\n\n` +
                    `💰 Bet: ${gameData.betAmount} coins each`
                )
                .setColor('#ffff00');
            
            await interaction.update({ embeds: [embed], components: [] });
            
            // Reset choices and redo the round
            gameData.player1Choice = null;
            gameData.player2Choice = null;
            gameData.currentPlayer = gameData.player1;
            
            setTimeout(async () => {
                const redoRoundEmbed = new EmbedBuilder()
                    .setTitle('🎮 Rock, Paper, Scissors')
                    .setDescription(
                        `${player1.username} vs ${player2.username}\n` +
                        `Round ${gameData.round}/3 (Redo)\n` +
                        `💰 Bet: ${gameData.betAmount} coins each\n\n` +
                        `⏳ ${player1.username}, choose your move!\n\n` +
                        `📊 **Current Score:**\n` +
                        `${player1.username}: ${gameData.player1Wins} wins\n` +
                        `${player2.username}: ${gameData.player2Wins} wins`
                    )
                    .setColor('#00ff00');
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`rps_choice_${gameId}_rock`)
                            .setLabel('🪨 Rock')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`rps_choice_${gameId}_paper`)
                            .setLabel('📄 Paper')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`rps_choice_${gameId}_scissors`)
                            .setLabel('✂️ Scissors')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`rps_forfeit_${gameId}`)
                            .setLabel('🏳️ Forfeit')
                            .setStyle(ButtonStyle.Danger)
                    );
                
                // Send redo round in the server with buttons
                await interaction.followUp({
                    content: `${player1} - Tie! Redoing this round - It's your turn!`,
                    embeds: [redoRoundEmbed],
                    components: [row]
                });
                
                startCountdown(interaction, gameId, 60);
            }, 2000);
            return;
        }
        
        // Handle win/loss
        if (result === 'player1') {
            gameData.player1Wins++;
        } else if (result === 'player2') {
            gameData.player2Wins++;
        }
        
        // Save round data to database
        const roundData = {
            roundNumber: gameData.round,
            player1Choice: gameData.player1Choice,
            player2Choice: gameData.player2Choice,
            result: result,
            timestamp: new Date()
        };
        
        gameData.matchRecord.rounds.push(roundData);
        gameData.matchRecord.totalRounds = gameData.round;
        
        // Update player wins in database
        gameData.matchRecord.player1.wins = gameData.player1Wins;
        gameData.matchRecord.player2.wins = gameData.player2Wins;
        
        await gameData.matchRecord.save();
        
        const resultText = result === 'player1' ? `${player1.username} wins!` : `${player2.username} wins!`;
        
        const embed = new EmbedBuilder()
            .setTitle('🎮 Round Results')
            .setDescription(
                `**Round ${gameData.round}/3 Complete!**\n\n` +
                `${player1.username}: ${choiceEmojis[gameData.player1ChoiceIndex]} ${gameData.player1Choice}\n` +
                `${player2.username}: ${choiceEmojis[gameData.player2ChoiceIndex]} ${gameData.player2Choice}\n\n` +
                `🏆 **${resultText}**\n\n` +
                `📊 **Current Score:**\n` +
                `${player1.username}: ${gameData.player1Wins} wins\n` +
                `${player2.username}: ${gameData.player2Wins} wins\n\n` +
                `💰 Bet: ${gameData.betAmount} coins each`
            )
            .setColor(result === 'player1' ? '#00ff00' : '#ff0000');
        
        await interaction.update({ embeds: [embed], components: [] });
        
        if (gameData.round >= 3 || gameData.player1Wins >= 2 || gameData.player2Wins >= 2) {
            const finalResult = gameData.player1Wins > gameData.player2Wins ? 'player1' : 'player2';
            await endPVPGame(interaction, gameId, finalResult, gameData);
        } else {
            gameData.round++;
            gameData.currentPlayer = gameData.player1;
            gameData.player1Choice = null;
            gameData.player2Choice = null;
            
            setTimeout(async () => {
                const nextRoundEmbed = new EmbedBuilder()
                    .setTitle('🎮 Rock, Paper, Scissors')
                    .setDescription(
                        `${player1.username} vs ${player2.username}\n` +
                        `Round ${gameData.round}/3\n` +
                        `💰 Bet: ${gameData.betAmount} coins each\n\n` +
                        `⏳ ${player1.username}, choose your move!\n\n` +
                        `📊 **Current Score:**\n` +
                        `${player1.username}: ${gameData.player1Wins} wins\n` +
                        `${player2.username}: ${gameData.player2Wins} wins`
                    )
                    .setColor('#00ff00');
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`rps_choice_${gameId}_rock`)
                            .setLabel('🪨 Rock')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`rps_choice_${gameId}_paper`)
                            .setLabel('📄 Paper')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`rps_choice_${gameId}_scissors`)
                            .setLabel('✂️ Scissors')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`rps_forfeit_${gameId}`)
                            .setLabel('🏳️ Forfeit')
                            .setStyle(ButtonStyle.Danger)
                    );
                
                // Send next round in the server with buttons
                await interaction.followUp({
                    content: `${player1} - Next round! It's your turn!`,
                    embeds: [nextRoundEmbed],
                    components: [row]
                });
                
                startCountdown(interaction, gameId, 60);
            }, 2000);
        }
    }
}

async function endGame(interaction, gameId, result, gameData) {
    // Clear any running animation
    if (gameData.animationInterval) {
        clearInterval(gameData.animationInterval);
    }
    
    interaction.client.rpsGames.delete(gameId);
    
    const winner = result === 'player1' ? 'You' : 'AI';
    const coinsWon = gameData.betAmount * 2;
    
    // Update database record
    gameData.matchRecord.status = 'completed';
    gameData.matchRecord.winner = result;
    gameData.matchRecord.endTime = new Date();
    gameData.matchRecord.duration = gameData.matchRecord.endTime - gameData.matchRecord.startTime;
    gameData.matchRecord.coinsExchanged = result === 'player1' ? coinsWon : 0;
    
    await gameData.matchRecord.save();
    
    if (result === 'player1') {
        // Player wins - give them the coins
        await handleBettingResult(interaction, gameData.guildId, gameData.player, coinsWon, true);
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎮 Game Over!')
        .setDescription(
            `**${winner} won!**\n\n` +
            `Final Score: You ${gameData.playerWins} - ${gameData.aiWins} AI\n` +
            `💰 ${result === 'player1' ? `You won ${coinsWon} coins!` : 'You lost your bet.'}`
        )
        .setColor(result === 'player1' ? '#00ff00' : '#ff0000');
    
    await interaction.followUp({ embeds: [embed] });
    
    // Send DM receipt to player
    try {
        const player = await interaction.client.users.fetch(gameData.player);
        const receiptEmbed = new EmbedBuilder()
            .setTitle(result === 'player1' ? '🎉 Victory vs AI!' : '😔 Defeat vs AI')
            .setDescription(
                `You ${result === 'player1' ? 'won' : 'lost'} the RPS match against the AI!\n\n` +
                `**Final Score:** You ${gameData.playerWins} - ${gameData.aiWins} AI\n` +
                `💰 ${result === 'player1' ? `You won ${coinsWon} coins!` : `You lost ${gameData.betAmount} coins`}\n` +
                `⏱️ Match duration: ${Math.round((gameData.matchRecord.endTime - gameData.matchRecord.startTime) / 1000)}s`
            )
            .setColor(result === 'player1' ? '#00ff00' : '#ff0000');
        
        await player.send({ embeds: [receiptEmbed] });
    } catch (dmError) {
        console.error('Error sending AI game result DM:', dmError);
    }
}

async function endPVPGame(interaction, gameId, result, gameData) {
    // Clear any running animation
    if (gameData.animationInterval) {
        clearInterval(gameData.animationInterval);
    }
    
    interaction.client.rpsGames.delete(gameId);
    
    const player1 = await interaction.client.users.fetch(gameData.player1);
    const player2 = await interaction.client.users.fetch(gameData.player2);
    const winner = result === 'player1' ? player1 : player2;
    const loser = result === 'player1' ? player2 : player1;
    const coinsWon = gameData.betAmount * 2;
    
    // Update database record
    gameData.matchRecord.status = 'completed';
    gameData.matchRecord.winner = result;
    gameData.matchRecord.endTime = new Date();
    gameData.matchRecord.duration = gameData.matchRecord.endTime - gameData.matchRecord.startTime;
    gameData.matchRecord.coinsExchanged = coinsWon;
    
    await gameData.matchRecord.save();
    
    // Transfer coins to winner
    await handleBettingResult(interaction, gameData.guildId, winner.id, coinsWon, true);
    
    const embed = new EmbedBuilder()
        .setTitle('🎮 Game Over!')
        .setDescription(
            `**${winner.username} won!**\n\n` +
            `Final Score: ${player1.username} ${gameData.player1Wins} - ${gameData.player2Wins} ${player2.username}\n` +
            `💰 ${winner.username} won ${coinsWon} coins!`
        )
        .setColor('#00ff00');
    
    await interaction.followUp({ embeds: [embed] });
    
    // Send DM receipts to both players
    try {
        const winnerReceipt = new EmbedBuilder()
            .setTitle('🎉 Victory!')
            .setDescription(
                `Congratulations! You won the RPS match against ${loser.username}!\n\n` +
                `**Final Score:** ${player1.username} ${gameData.player1Wins} - ${gameData.player2Wins} ${player2.username}\n` +
                `💰 **You won ${coinsWon} coins!**\n` +
                `⏱️ Match duration: ${Math.round((gameData.matchRecord.endTime - gameData.matchRecord.startTime) / 1000)}s`
            )
            .setColor('#00ff00');
        
        const loserReceipt = new EmbedBuilder()
            .setTitle('😔 Defeat')
            .setDescription(
                `You lost the RPS match against ${winner.username}.\n\n` +
                `**Final Score:** ${player1.username} ${gameData.player1Wins} - ${gameData.player2Wins} ${player2.username}\n` +
                `💰 You lost ${gameData.betAmount} coins\n` +
                `⏱️ Match duration: ${Math.round((gameData.matchRecord.endTime - gameData.matchRecord.startTime) / 1000)}s`
            )
            .setColor('#ff0000');
        
        await winner.send({ embeds: [winnerReceipt] });
        await loser.send({ embeds: [loserReceipt] });
    } catch (dmError) {
        console.error('Error sending game result DMs:', dmError);
    }
}

function startCountdown(interaction, gameId, seconds) {
    const gameData = interaction.client.rpsGames.get(gameId);
    if (!gameData) return;
    
    // Clear any existing timeout for this game
    if (gameData.timeoutId) {
        clearTimeout(gameData.timeoutId);
    }
    
    // Set new timeout
    gameData.timeoutId = setTimeout(async () => {
        console.log(`⏰ Timeout triggered for game ${gameId}`);
        
        // Check if game still exists
        const currentGameData = interaction.client.rpsGames.get(gameId);
        if (!currentGameData) return;
        
        if (currentGameData.type === 'ai') {
            await endGame(interaction, gameId, 'player2', currentGameData); // AI wins by forfeit
        } else {
            // PvP timeout - current player forfeits
            const forfeitResult = currentGameData.currentPlayer === currentGameData.player1 ? 'player2' : 'player1';
            await endPVPGame(interaction, gameId, forfeitResult, currentGameData);
            
            // Notify both players about the timeout via DM
            try {
                const player1 = await interaction.client.users.fetch(currentGameData.player1);
                const player2 = await interaction.client.users.fetch(currentGameData.player2);
                const timeoutPlayer = currentGameData.currentPlayer === currentGameData.player1 ? player1 : player2;
                const otherPlayer = currentGameData.currentPlayer === currentGameData.player1 ? player2 : player1;
                
                // Send DM to both players
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Match Timeout')
                    .setDescription(
                        `**${timeoutPlayer.username}** took too long to make a move!\n\n` +
                        `**${otherPlayer.username}** wins by forfeit.\n` +
                        `💰 **${otherPlayer.username}** wins ${currentGameData.betAmount * 2} coins!`
                    )
                    .setColor('#ff0000');
                
                await timeoutPlayer.send({ embeds: [timeoutEmbed] });
                await otherPlayer.send({ embeds: [timeoutEmbed] });
            } catch (dmError) {
                console.error('Error sending timeout DM:', dmError);
            }
        }
    }, seconds * 1000);
    
    console.log(`⏰ Started ${seconds}s countdown for game ${gameId}`);
}

function determineWinner(choice1, choice2) {
    if (choice1 === choice2) return 'tie';
    if ((choice1 === 0 && choice2 === 2) || (choice1 === 1 && choice2 === 0) || (choice1 === 2 && choice2 === 1)) {
        return 'player1';
    }
    return 'player2';
}

// Export functions for use in index.js
module.exports = {
    data: module.exports.data,
    execute: module.exports.execute,
    handleChallenge,
    handleViewChallenges,
    createChallenge,
    acceptChallenge,
    startAIGame,
    handleRPSChoice,
    handleAIChoice,
    handlePlayerChoice,
    endGame,
    endPVPGame,
    startCountdown,
    determineWinner,
    startAnimatedLoading,
    generateGameId,
    determineFirstPlayer,
    handleForfeit
};