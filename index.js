require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, ActivityType, PresenceUpdateStatus, Events, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, getVoiceConnections } = require('@discordjs/voice');
const sodium = require('libsodium-wrappers');
const mongoose = require('mongoose');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');

// Track active connections and resources
const activeConnections = new Map();

// Bot status mode (true = use .env, false = use dynamic rotation)
let useEnvStatus = process.env.USE_ENV_STATUS !== 'false'; // Default to true unless explicitly disabled

// Bot status mapping system
const botStatuses = {
    online: {
        status: PresenceUpdateStatus.Online,
        activities: [
            { name: 'Discord', type: ActivityType.Playing },
            { name: 'with users', type: ActivityType.Playing },
            { name: 'music', type: ActivityType.Listening },
            { name: 'commands', type: ActivityType.Watching },
            { name: 'the server', type: ActivityType.Watching }
        ]
    },
    idle: {
        status: PresenceUpdateStatus.Idle,
        activities: [
            { name: 'AFK', type: ActivityType.Playing },
            { name: 'away', type: ActivityType.Playing },
            { name: 'music quietly', type: ActivityType.Listening }
        ]
    },
    dnd: {
        status: PresenceUpdateStatus.DoNotDisturb,
        activities: [
            { name: 'maintenance', type: ActivityType.Playing },
            { name: 'updates', type: ActivityType.Playing },
            { name: 'system tasks', type: ActivityType.Watching }
        ]
    },
    competing: {
        status: PresenceUpdateStatus.Online,
        activities: [
            { name: 'Rock Paper Scissors', type: ActivityType.Competing },
            { name: 'RPS tournaments', type: ActivityType.Competing },
            { name: 'gaming competitions', type: ActivityType.Competing }
        ]
    },
    streaming: {
        status: PresenceUpdateStatus.Online,
        activities: [
            { name: 'live music', type: ActivityType.Streaming, url: 'https://discord.gg/your-server' },
            { name: 'bot activities', type: ActivityType.Streaming, url: 'https://discord.gg/your-server' }
        ]
    }
};

// Function to set bot status
function setBotStatus(statusKey = 'online', useEnv = false) {
    let statusConfig, activity;
    
    if (useEnv) {
        // Use environment variables for custom status
        const envStatus = process.env.BOT_STATUS || 'online';
        const envActivityType = process.env.ACTIVITY_TYPE || 'COMPETING';
        const envActivityName = process.env.ACTIVITY_NAME || 'Discord';
        
        // Map environment status to PresenceUpdateStatus
        const statusMap = {
            'online': PresenceUpdateStatus.Online,
            'idle': PresenceUpdateStatus.Idle,
            'dnd': PresenceUpdateStatus.DoNotDisturb,
            'invisible': PresenceUpdateStatus.Invisible
        };
        
        // Map environment activity type to ActivityType
        const activityTypeMap = {
            'PLAYING': ActivityType.Playing,
            'STREAMING': ActivityType.Streaming,
            'LISTENING': ActivityType.Listening,
            'WATCHING': ActivityType.Watching,
            'COMPETING': ActivityType.Competing
        };
        
        statusConfig = {
            status: statusMap[envStatus] || PresenceUpdateStatus.Online,
            activities: [{
                name: envActivityName,
                type: activityTypeMap[envActivityType] || ActivityType.Playing,
                url: envActivityType === 'STREAMING' ? (process.env.STREAMING_URL || 'https://discord.gg/your-server') : undefined
            }]
        };
        activity = statusConfig.activities[0];
    } else {
        // Use predefined status configurations
        statusConfig = botStatuses[statusKey] || botStatuses.online;
        activity = statusConfig.activities[Math.floor(Math.random() * statusConfig.activities.length)];
    }
    
    try {
        client.user.setPresence({ 
            status: statusConfig.status, 
            activities: [activity] 
        });
        console.log(`🤖 Bot status updated: ${useEnv ? 'ENV' : statusKey} - ${activity.name} (${activity.type})`);
    } catch (error) {
        console.error('Error setting bot status:', error);
    }
}

// Function to toggle between environment and dynamic status modes
function toggleStatusMode() {
    useEnvStatus = !useEnvStatus;
    console.log(`🔄 Status mode switched to: ${useEnvStatus ? 'Environment Variables' : 'Dynamic Rotation'}`);
    setBotStatus('online', useEnvStatus);
    return useEnvStatus;
}

// Function to force update status from environment
function updateStatusFromEnv() {
    setBotStatus('online', true);
}

// Memory-efficient cleanup function
function cleanupAudio(player, streams = []) {
    try {
        if (player) {
            player.stop();
            player.removeAllListeners();
        }
        streams.forEach(stream => {
            if (stream) {
                if (typeof stream.destroy === 'function') stream.destroy();
                if (typeof stream.unpipe === 'function') stream.unpipe();
                if (typeof stream.end === 'function') stream.end();
                if (typeof stream.kill === 'function') stream.kill();
            }
        });
        if (global.gc) global.gc();
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}


// Graceful shutdown
async function handleShutdown() {
    console.log('Shutting down...');
    try {
        for (const [guildId, { player, streams }] of activeConnections.entries()) {
            cleanupAudio(player, streams);
            activeConnections.delete(guildId);
        }
        const connections = getVoiceConnections();
        connections.forEach(connection => {
            connection.destroy();
        });
        try { await mongoose.connection.close(); } catch {}
        try { await client.destroy(); } catch {}
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Command handling setup
const commandsPath = path.join(__dirname, 'commands');
function getAllCommandFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    for (const file of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) getAllCommandFiles(fullPath, files);
        else if (file.endsWith('.js')) files.push(fullPath);
    }
    return files;
}
const commandFiles = getAllCommandFiles(commandsPath);
const commands = [];
const clientCommands = new Collection();
for (const filePath of commandFiles) {
    try {
        const command = require(filePath);
        if (command?.data && command?.execute) {
            clientCommands.set(command.data.name, command);
            commands.push(command.data.toJSON());
        }
    } catch (err) {
        console.error('Failed to load command', filePath, err);
    }
}

const deployCommands = async () => {
    if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) return;
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('Commands deployed');
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
};

// ---------- Create Discord Client ----------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember
    ]
});
client.commands = clientCommands;
client.rpsGames = new Map();
client.rpsChallenges = new Map();

// Load cooldown clearing event
const clearCooldowns = require('./events/ready/clear-cooldown');

// Register reply-to-hello event
const replyToHello = require('./events/messageCreate/reply-to-hello.js');
client.on('messageCreate', replyToHello);

// Register AFK listener event
const afkListener = require('./events/messageCreate/afk-listener.js');
client.on('messageCreate', afkListener);

// --- RAM Optimized Audio Playback Section WITH LOOPING ---

/**
 * Play audio in a RAM-efficient way, with looping support
 */
async function playAudio(connection) {
    try {
        await sodium.ready;
        // Always convert to Discord-compatible PCM using ffmpeg
        const inputPath = path.join(__dirname, 'music.opus');
        const ffmpegProcess = spawn(ffmpeg, [
            '-i', inputPath,
            '-analyzeduration', '0',
            '-loglevel', '0',
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1'
        ], { stdio: ['ignore', 'pipe', 'ignore'] });

        const resource = createAudioResource(ffmpegProcess.stdout, {
            inputType: StreamType.Raw,
            inlineVolume: true
        });
        resource.volume?.setVolume(1);

        const player = createAudioPlayer();
        player.play(resource);
        connection.subscribe(player);
        
        console.log('🎵 Music playback started successfully!');
        setBotStatus('streaming'); // Set streaming status when music is playing

        // Loop playback when idle (end of track)
        player.once('stateChange', (oldState, newState) => {
            if (newState.status === 'idle') {
                console.log('🎵 Music track ended, restarting loop...');
                cleanupAudio(player, [ffmpegProcess]);
                ffmpegProcess.kill();
                setTimeout(() => {
                    if (connection.state.status !== 'destroyed') {
                        console.log('🔄 Restarting music playback...');
                        playAudio(connection).catch(console.error);
                    }
                }, 250);
            }
        });

        player.once('error', error => {
            console.error('🎵 Player error:', error);
            cleanupAudio(player, [ffmpegProcess]);
            ffmpegProcess.kill();
            setTimeout(() => {
                if (connection.state.status !== 'destroyed') {
                    console.log('🔄 Restarting music after player error...');
                    playAudio(connection).catch(console.error);
                }
            }, 1000);
        });

        ffmpegProcess.stdout.once('error', error => {
            console.error('🎵 FFmpeg stream error:', error);
            player.stop();
            cleanupAudio(player, [ffmpegProcess]);
            ffmpegProcess.kill();
            setTimeout(() => {
                if (connection.state.status !== 'destroyed') {
                    console.log('🔄 Restarting music after stream error...');
                    playAudio(connection).catch(console.error);
                }
            }, 1000);
        });

        ffmpegProcess.on('error', error => {
            console.error('🎵 FFmpeg process error:', error);
            cleanupAudio(player, [ffmpegProcess]);
            setTimeout(() => {
                if (connection.state.status !== 'destroyed') {
                    console.log('🔄 Restarting music after process error...');
                    playAudio(connection).catch(console.error);
                }
            }, 1000);
        });

        // Optional: Log RAM usage periodically for debugging
        if (!playAudio._memInterval) {
            playAudio._memInterval = setInterval(() => {
                const mem = process.memoryUsage();
                console.log(`[MEMORY] RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB, Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
            }, 60000);
        }
    } catch (error) {
        console.error('Error in playAudio:', error);
        setTimeout(() => playAudio(connection), 1000);
    }
}

// On ready
client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    console.log(`📊 Bot is in ${client.guilds.cache.size} guilds`);
    
    // Deploy commands first
    try {
        await deployCommands();
        console.log('✅ Commands deployed successfully');
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }

    // Log current status configuration
    console.log('🤖 Bot Status Configuration:');
    console.log(`   Mode: ${useEnvStatus ? 'Environment Variables' : 'Dynamic Rotation'}`);
    console.log(`   Status: ${process.env.BOT_STATUS || 'online'}`);
    console.log(`   Activity: ${process.env.ACTIVITY_NAME || 'Discord'}`);
    console.log(`   Type: ${process.env.ACTIVITY_TYPE || 'COMPETING'}`);
    console.log(`   Rotation: ${process.env.ROTATE_STATUS !== 'false' ? 'Enabled' : 'Disabled'}`);
    
    // Set initial bot status from environment variables
    setBotStatus('online', true);
    
    // Set up status rotation every 5 minutes (optional - can be disabled by setting ROTATE_STATUS=false in .env)
    if (process.env.ROTATE_STATUS !== 'false') {
        setInterval(() => {
            if (useEnvStatus) {
                // Use environment variables
                setBotStatus('online', true);
            } else {
                // Use dynamic rotation
                const statusKeys = ['online', 'idle', 'competing', 'streaming'];
                const randomStatus = statusKeys[Math.floor(Math.random() * statusKeys.length)];
                setBotStatus(randomStatus);
            }
        }, 300000); // 5 minutes
    }

    // Voice channel connection (optional - only if VOICE_CHANNEL_ID is set)
    if (process.env.VOICE_CHANNEL_ID) {
        console.log('🎵 Attempting to join voice channel...');
    try {
        const channel = await client.channels.fetch(process.env.VOICE_CHANNEL_ID);
        if (!channel) {
                console.warn('⚠️ Could not find voice channel! Check VOICE_CHANNEL_ID in .env');
                return;
            }
            
            if (channel.type !== 2) { // 2 = GUILD_VOICE
                console.warn('⚠️ Channel is not a voice channel! Check VOICE_CHANNEL_ID in .env');
            return;
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        connection.on('error', error => {
                console.error('🎵 Voice connection error:', error);
                const activeConnection = activeConnections.get(connection.joinConfig.guildId);
                if (activeConnection) {
                    cleanupAudio(activeConnection.player, activeConnection.streams);
            activeConnections.delete(connection.joinConfig.guildId);
                }
                // Attempt to reconnect after a delay
                setTimeout(async () => {
                    try {
                        console.log('🔄 Attempting to reconnect to voice channel...');
                        const newConnection = joinVoiceChannel({
                            channelId: channel.id,
                            guildId: channel.guild.id,
                            adapterCreator: channel.guild.voiceAdapterCreator,
                            selfDeaf: false,
                            selfMute: false
                        });
                        setBotStatus('streaming'); // Set streaming status when joining voice
                        await playAudio(newConnection);
                    } catch (reconnectError) {
                        console.error('❌ Failed to reconnect:', reconnectError);
                    }
                }, 5000);
            });

            setBotStatus('streaming'); // Set streaming status when joining voice
        await playAudio(connection);
            console.log('✅ Successfully joined voice channel and started music');
    } catch (error) {
            console.error('❌ Error joining voice channel:', error);
            console.log('ℹ️ Bot will continue without voice functionality');
        }
    } else {
        console.log('ℹ️ No VOICE_CHANNEL_ID set in .env - skipping voice connection');
    }
    
    console.log('bun-app-started');
    console.log('🚀 Bot is fully ready and operational!');
});

// Error handling
client.on('error', error => {
    console.error('❌ Client error:', error);
});

client.on('warn', warning => {
    console.warn('⚠️ Client warning:', warning);
});

// RPS Interaction Handlers
async function handleButtonInteraction(interaction) {
    const { customId } = interaction;
    
    if (customId === 'rps_challenge') {
        // Handle challenge button
        const { handleChallenge } = require('./commands/fun/rps');
        await handleChallenge(interaction);
        
    } else if (customId === 'rps_view_challenges') {
        // Handle view challenges button
        const { handleViewChallenges } = require('./commands/fun/rps');
        await handleViewChallenges(interaction);
        
    } else if (customId === 'rps_ai') {
        // Show bet modal for AI game
        const modal = new ModalBuilder()
            .setCustomId('rps_bet_modal_ai')
            .setTitle('🎮 RPS vs AI - Enter Bet Amount');
        
        const betInput = new TextInputBuilder()
            .setCustomId('bet_amount')
            .setLabel('Bet Amount (coins)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter amount to bet...')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(10);
        
        const actionRow = new ActionRowBuilder().addComponents(betInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
        
    } else if (customId === 'rps_user') {
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
            components: [row]
        });
        
        } else if (customId.startsWith('rps_choice_')) {
            // Handle RPS choice selection
            const { handleRPSChoice } = require('./commands/fun/rps');
            await handleRPSChoice(interaction);
        }
}

async function handleModalSubmit(interaction) {
    const { customId } = interaction;
    
    if (customId === 'rps_bet_modal_ai') {
        const betAmount = parseInt(interaction.fields.getTextInputValue('bet_amount'));
        
        if (isNaN(betAmount) || betAmount < 1) {
            return interaction.reply({
                content: 'Please enter a valid bet amount (minimum 1 coin).',
                flags: 64
            });
        }
        
        // Check user balance
        const UserProfile = require('./schemas/UserProfile');
        let userProfile = await UserProfile.findOne({ 
            userId: interaction.user.id, 
            guildId: interaction.guildId 
        });
        
        if (!userProfile) {
            userProfile = new UserProfile({ 
                userId: interaction.user.id, 
                guildId: interaction.guildId, 
                balance: 0 
            });
        }
        
        if (userProfile.balance < betAmount) {
            return interaction.reply({
                content: `You don't have enough coins! Your balance: ${userProfile.balance} coins`,
                flags: 64
            });
        }
        
        // Start AI game
        const { startAIGame } = require('./commands/fun/rps');
        await startAIGame(interaction, betAmount);
        
    } else if (customId.startsWith('rps_bet_modal_user_')) {
        const betAmount = parseInt(interaction.fields.getTextInputValue('bet_amount'));
        const opponentId = customId.replace('rps_bet_modal_user_', '');
        
        if (isNaN(betAmount) || betAmount < 1) {
            return interaction.reply({
                content: 'Please enter a valid bet amount (minimum 1 coin).',
                flags: 64
            });
        }
        
        // Check both users' balances
        const UserProfile = require('./schemas/UserProfile');
        let challengerProfile = await UserProfile.findOne({ 
            userId: interaction.user.id, 
            guildId: interaction.guildId 
        });
        let opponentProfile = await UserProfile.findOne({ 
            userId: opponentId, 
            guildId: interaction.guildId 
        });
        
        if (!challengerProfile) {
            challengerProfile = new UserProfile({ 
                userId: interaction.user.id, 
                guildId: interaction.guildId, 
                balance: 0 
            });
        }
        if (!opponentProfile) {
            opponentProfile = new UserProfile({ 
                userId: opponentId, 
                guildId: interaction.guildId, 
                balance: 0 
            });
        }
        
        if (challengerProfile.balance < betAmount) {
            return interaction.reply({
                content: `You don't have enough coins! Your balance: ${challengerProfile.balance} coins`,
                flags: 64
            });
        }
        
        if (opponentProfile.balance < betAmount) {
            const opponent = await interaction.client.users.fetch(opponentId);
            return interaction.reply({
                content: `${opponent.username} doesn't have enough coins! Their balance: ${opponentProfile.balance} coins`,
                flags: 64
            });
        }
        
        // Create challenge
        const { createChallenge } = require('./commands/fun/rps');
        await createChallenge(interaction, opponentId, betAmount);
    }
}

async function handleSelectMenu(interaction) {
    const { customId, values } = interaction;
    
    if (customId === 'rps_user_select') {
        const opponentId = values[0];
        const opponent = await interaction.client.users.fetch(opponentId);
        
        // Show bet modal for user game
        const modal = new ModalBuilder()
            .setCustomId(`rps_bet_modal_user_${opponentId}`)
            .setTitle(`🎮 RPS vs ${opponent.username} - Enter Bet Amount`);
        
        const betInput = new TextInputBuilder()
            .setCustomId('bet_amount')
            .setLabel('Bet Amount (coins)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter amount to bet...')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(10);
        
        const actionRow = new ActionRowBuilder().addComponents(betInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
        
    } else if (customId === 'rps_accept_challenge') {
        const challengeId = values[0];
        const { acceptChallenge } = require('./commands/fun/rps');
        await acceptChallenge(interaction, challengeId);
    }
}


async function createChallenge(interaction, opponentId, betAmount) {
    
    const challengeId = `${interaction.user.id}_${opponentId}_${Date.now()}`;
    const challengeData = {
        challenger: interaction.user.id,
        opponent: opponentId,
        betAmount: betAmount,
        guildId: interaction.guildId,
        timestamp: Date.now()
    };
    
    interaction.client.rpsChallenges.set(opponentId, challengeData);
    
    const opponent = await interaction.client.users.fetch(opponentId);
    
    const embed = new EmbedBuilder()
        .setTitle('🎮 Rock, Paper, Scissors Challenge!')
        .setDescription(
            `${interaction.user.username} has challenged ${opponent.username} to Rock, Paper, Scissors!\n\n` +
            `💰 Bet: ${betAmount} coins each\n` +
            `🏆 Best of 3 rounds\n\n` +
            `${opponent.username}, use \`/rps accept\` or \`/rps deny\` to respond!`
        )
        .setColor('#ffff00')
        .setFooter({ text: 'Challenge expires in 5 minutes' });
    
    await interaction.reply({
        content: `${opponent}`,
        embeds: [embed]
    });
    
    // Auto-expire challenge after 5 minutes
    setTimeout(() => {
        if (interaction.client.rpsChallenges.has(opponentId)) {
            interaction.client.rpsChallenges.delete(opponentId);
            interaction.followUp({
                content: `⏰ Challenge from ${interaction.user.username} has expired.`,
                flags: 64
            });
        }
    }, 300000);
}



// Interaction handler
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
        await command.execute(interaction);
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
        }
    } catch (error) {
        console.error(`Error handling interaction:`, error);
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({ content: 'Error executing command', flags: 64 });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: 'Error executing command' });
            } else {
                await interaction.followUp({ content: 'Error executing command', flags: 64 });
            }
        } catch {}
    }
});

// Start the bot
(async () => {
    try {
        console.log('🚀 Starting bot...');
        
        // Connect to MongoDB first
        if (process.env.MONGODB_URI) {
            console.log('📊 Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('✅ Connected to MongoDB successfully');
        } else {
            console.log('⚠️ No MONGODB_URI set - skipping database connection');
        }
        
        // Login to Discord
        console.log('🔐 Logging in to Discord...');
        await client.login(process.env.BOT_TOKEN);
        
    } catch (err) {
        console.error('❌ Failed to start bot:', err);
        process.exit(1);
    }
})();
