require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, ActivityType, PresenceUpdateStatus, Events, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { connectToVoiceChannel } = require('./music/musicPlayer');

// Path to commands directory
const commandsPath = path.join(__dirname, 'commands');

// Utility to recursively get all .js command files from a directory
function getAllCommandFiles(dir) {
    const results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results.push(...getAllCommandFiles(filePath));
        } else if (file.endsWith('.js')) {
            results.push(filePath);
        }
    });
    return results;
}

// Flag controlling whether status uses environment config or rotates dynamically
let useEnvStatus = process.env.USE_ENV_STATUS !== 'false';

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

// Set the bot presence and activity
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

// Toggle status mode between environment-based and dynamic rotation
function toggleStatusMode() {
    useEnvStatus = !useEnvStatus;
    console.log(`🔄 Status mode switched to: ${useEnvStatus ? 'Environment Variables' : 'Dynamic Rotation'}`);
    // Only call setBotStatus from outside this function to avoid recursion
    return useEnvStatus;
}

// Load command files
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

// Register level-xp event
const levelXPListener = require('./events/messageCreate/level-xp.js');
client.on('messageCreate', levelXPListener);

// --- RAM Optimized Audio Playback Section WITH LOOPING ---

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
    
    // Global voice channel connection (if VOICE_CHANNEL_ID is set in .env)
    if (process.env.VOICE_CHANNEL_ID) {
        console.log('🎵 Attempting to join global voice channel...');
        await connectToVoiceChannel(client, process.env.VOICE_CHANNEL_ID);
    } else {
        console.log('ℹ️ No VOICE_CHANNEL_ID set in .env - skipping voice connection');
        // Show ready message immediately if no voice channel is configured
        setTimeout(() => {
            if (!global.botStartupComplete) {
                console.log('bun-app-started');
                console.log('🚀 Bot is fully ready and operational!');
                global.botStartupComplete = true;
            }
        }, 1000);
    }
    
    // Bot status only uses .env values, no rotation
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
    
    // Handle RPS buttons
    if (customId === 'rps_challenge' || customId === 'rps_view_challenges' || customId === 'rps_ai' || customId === 'rps_user' || customId.startsWith('rps_choice_')) {
        const { handleRPSButtonInteraction } = require('./commands/fun/rps');
        await handleRPSButtonInteraction(interaction);
    
    // Handle setup timezone button
    } else if (customId === 'setup_timezone') {
        const timezoneCommand = require('./commands/misc/timezone');
        await timezoneCommand.execute(interaction);
    
    // Handle timezone region buttons
    } else if (customId.startsWith('region_')) {
        const { handleTimezoneButtonInteraction } = require('./commands/misc/timezone');
        await handleTimezoneButtonInteraction(interaction);
    
    // Handle timezone sub-region buttons
    } else if (customId.startsWith('subregion_')) {
        const { handleTimezoneButtonInteraction } = require('./commands/misc/timezone');
        await handleTimezoneButtonInteraction(interaction);
    }
}

async function handleModalSubmit(interaction) {
    const { customId } = interaction;
    
    // Handle RPS modal submissions
    if (customId === 'rps_bet_modal_ai' || customId.startsWith('rps_bet_modal_user_')) {
        const { handleRPSModalSubmit } = require('./commands/fun/rps');
        await handleRPSModalSubmit(interaction);
    } else if (customId.startsWith('purge_amount_modal_')) {
        const { handleAmountSubmit } = require('./commands/mod/purge');
        await handleAmountSubmit(interaction);
    }
}

async function handleSelectMenu(interaction) {
    const { customId, values } = interaction;
    
    // Handle RPS select menus
    if (customId === 'rps_user_select' || customId === 'rps_accept_challenge') {
        const { handleRPSSelectMenu } = require('./commands/fun/rps');
        await handleRPSSelectMenu(interaction);
    
    // Handle timezone select menu
    } else if (customId === 'timezone_select') {
        const { handleTimezoneSelectMenu } = require('./commands/misc/timezone');
        await handleTimezoneSelectMenu(interaction);
    
    // Handle purge select menu
    } else if (customId === 'purge_type_select') {
        const { handleTypeSelect } = require('./commands/mod/purge');
        await handleTypeSelect(interaction);
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
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        const userTag = interaction.user?.tag || interaction.userId;
        const start = Date.now();

        // Wrap interaction reply methods to handle Unknown interaction (10062)
        let interactionExpired = false;
        const wrapMethod = (orig) => async (...args) => {
            if (interactionExpired) {
                // Already expired/unknown - skip attempts
                console.warn(`[${command.data?.name?.toUpperCase() || 'CMD'}] Skipping call to interaction method because interaction is expired.`);
                return null;
            }
            try {
                return await orig(...args);
            } catch (e) {
                const code = e?.code || e?.rawError?.code;
                if (code === 10062) {
                    interactionExpired = true;
                    console.warn(`[${command.data?.name?.toUpperCase() || 'CMD'}] Interaction became unknown while replying; aborting further replies.`);
                    return null;
                }
                throw e;
            }
        };

        // Monkey-patch instance methods for this interaction only
        const origDefer = interaction.deferReply.bind(interaction);
        const origReply = interaction.reply.bind(interaction);
        const origEdit = interaction.editReply.bind(interaction);
        const origFollow = interaction.followUp.bind(interaction);
        interaction.deferReply = wrapMethod(origDefer);
        interaction.reply = wrapMethod(origReply);
        interaction.editReply = wrapMethod(origEdit);
        interaction.followUp = wrapMethod(origFollow);

        try {
            await command.execute(interaction);
            const elapsed = Date.now() - start;
            const apiLatency = Math.round(client.ws.ping || 0);
            if ((command.data && command.data.name) === 'ping') {
                console.log(`[${command.data.name.toUpperCase()}] ${userTag} ran ping: Bot Latency ${elapsed}ms, API Latency ${apiLatency}ms`);
            } else {
                console.log(`[${command.data?.name?.toUpperCase() || 'CMD'}] ${userTag} ran ${command.data?.name || 'unknown'}`);
            }
        } catch (error) {
            const code = error?.code || error?.rawError?.code;
            if (code === 10062) {
                console.warn(`[${interaction.commandName?.toUpperCase() || 'CMD'}] Command error: Unknown interaction (likely expired) - skipping reply`);
                return;
            }
            console.error(`[${interaction.commandName?.toUpperCase() || 'CMD'}] Command error:`, error);
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.reply({ content: 'Error executing command', flags: 64 });
                } else if (interaction.deferred) {
                    await interaction.editReply({ content: 'Error executing command' });
                } else {
                    await interaction.followUp({ content: 'Error executing command', flags: 64 });
                }
            } catch (err) {
                console.error('Failed to notify user about command error:', err);
            }
        } finally {
            // Restore original methods to avoid leaking wrappers
            try { interaction.deferReply = origDefer; } catch {}
            try { interaction.reply = origReply; } catch {}
            try { interaction.editReply = origEdit; } catch {}
            try { interaction.followUp = origFollow; } catch {}
        }
    } else if (interaction.isButton()) {
        try { await handleButtonInteraction(interaction); } catch (e) { console.error('Button handler error:', e); }
    } else if (interaction.isModalSubmit()) {
        try { await handleModalSubmit(interaction); } catch (e) { console.error('Modal handler error:', e); }
    } else if (interaction.isStringSelectMenu()) {
        try { await handleSelectMenu(interaction); } catch (e) { console.error('Select menu handler error:', e); }
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

const UserProfile = require('./schemas/UserProfile');
const LevelProfile = require('./schemas/LevelProfile');
const GuildSettings = require('./schemas/GuildSettings');
async function updateLeaderboards(client) {
    try {
        // Get all guilds and check their leaderboard channel settings
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const { getGuildSettings } = require('./schemas/GuildSettings');
                const settings = await getGuildSettings(guildId);
                
                if (!settings || !settings.leaderboardChannelId) {
                    continue; // Skip guilds without leaderboard channel configured
                }

                const channel = await client.channels.fetch(settings.leaderboardChannelId).catch((e) => {
                    console.log(`[Leaderboard] Failed to fetch channel for guild ${guild.name}:`, e);
                    return null;
                });
                
                if (!channel || !channel.isTextBased()) {
                    console.log(`[Leaderboard] Channel not found or not text-based for guild ${guild.name}.`);
                    continue;
                }

                // Get or create guild settings for message IDs
                let guildSettings = await GuildSettings.findOne({ guildId });
                if (!guildSettings) {
                    guildSettings = new GuildSettings({ guildId });
                    await guildSettings.save();
                }

                // Get all users in the guild (excluding bots)
                const guildMembers = await channel.guild.members.fetch();
                const allUserIds = guildMembers.filter(member => !member.user.bot).map(member => member.user.id);

                // Create profiles for all users who don't have them
                for (const userId of allUserIds) {
                    // Create UserProfile if doesn't exist
                    let userProfile = await UserProfile.findOne({ userId, guildId });
                    if (!userProfile) {
                        userProfile = new UserProfile({ userId, guildId, balance: 0 });
                        await userProfile.save();
                    }

                    // Create LevelProfile if doesn't exist
                    let levelProfile = await LevelProfile.findOne({ userId, guildId });
                    if (!levelProfile) {
                        levelProfile = new LevelProfile({ userId, guildId, xp: 0, level: 1 });
                        await levelProfile.save();
                    }
                }

                // Top 10 richest for this guild (now all users have profiles)
                const richest = await UserProfile.find({ guildId, userId: { $in: allUserIds } }).sort({ balance: -1, userId: 1 }).limit(10);
                let richDesc = richest.length ? richest.map((u, i) => `**${i+1}.** <@${u.userId}> — **${u.balance}** coins`).join('\n') : 'No data.';
                const richEmbed = new EmbedBuilder()
                    .setTitle(`🏆 Top 10 Richest - ${channel.guild.name}`)
                    .setDescription(richDesc)
                    .setColor('#FFD700')
                    .setTimestamp();

                // Top 10 XP for this guild (now all users have profiles)
                const topXP = await LevelProfile.find({ guildId, userId: { $in: allUserIds } }).sort({ level: -1, xp: -1, userId: 1 }).limit(10);
                
                // Function to calculate total XP for a level
                function getTotalXPForLevel(level, currentXP) {
                    let totalXP = currentXP;
                    for (let i = 1; i < level; i++) {
                        if (i === 1) {
                            totalXP += 50; // Level 1 requires 50 XP
                        } else {
                            let levelXP = 50;
                            for (let j = 2; j <= i; j++) {
                                levelXP = Math.round(levelXP * 1.5 / 50) * 50;
                            }
                            totalXP += levelXP;
                        }
                    }
                    return totalXP;
                }
                
                let xpDesc = topXP.length ? topXP.map((u, i) => {
                    const totalXP = getTotalXPForLevel(u.level, u.xp);
                    return `**${i+1}.** <@${u.userId}> — Level **${u.level}** (${totalXP} total XP)`;
                }).join('\n') : 'No data.';
                
                const xpEmbed = new EmbedBuilder()
                    .setTitle(`📈 Top 10 Most XP - ${channel.guild.name}`)
                    .setDescription(xpDesc)
                    .setColor('#5865F2')
                    .setTimestamp();

                // Send or edit message with both embeds
                if (guildSettings.leaderboardMessageId) {
                    try {
                        const msg = await channel.messages.fetch(guildSettings.leaderboardMessageId);
                        await msg.edit({ embeds: [richEmbed, xpEmbed] });
                    } catch (e) {
                        // Clear the old message ID from database
                        guildSettings.leaderboardMessageId = null;
                        await guildSettings.save();
                        
                        // Send new message
                        const msg = await channel.send({ embeds: [richEmbed, xpEmbed] });
                        guildSettings.leaderboardMessageId = msg.id;
                        await guildSettings.save();
                    }
                } else {
                    const msg = await channel.send({ embeds: [richEmbed, xpEmbed] });
                    guildSettings.leaderboardMessageId = msg.id;
                    await guildSettings.save();
                }
                
                console.log(`[Leaderboard] Updated leaderboard for guild ${guild.name}`);
            } catch (guildError) {
                console.error(`[Leaderboard] Error updating leaderboard for guild ${guild.name}:`, guildError);
            }
        }
    } catch (error) {
        console.error('[Leaderboard] Error updating leaderboards:', error);
    }
}

// Leaderboard and final setup
client.once(Events.ClientReady, async () => {
    // Leaderboard update on startup and every minute (now uses per-server configuration)
    await updateLeaderboards(client); // Initial update
    setInterval(() => updateLeaderboards(client), 60 * 1000);
    console.log('[Leaderboard] Leaderboard system initialized and will update every minute for configured servers.');

    // RAM logging every 30 minutes
    setInterval(() => {
        const used = process.memoryUsage();
        const ramUsage = Math.round(used.heapUsed / 1024 / 1024 * 100) / 100;
        const ramTotal = 2048;
        console.log(`[RAM] Usage: ${ramUsage}MB / ${ramTotal}MB (${Math.round(ramUsage/ramTotal*100)}%)`);
    }, 30 * 60 * 1000); // 30 minutes
    
});
