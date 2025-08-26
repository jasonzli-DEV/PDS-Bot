require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, ActivityType, PresenceUpdateStatus, Events, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, generateDependencyReport, getVoiceConnections } = require('@discordjs/voice');
const sodium = require('libsodium-wrappers');
const mongoose = require('mongoose');
const prism = require('prism-media');
const { pipeline } = require('stream');

// Track active connections and resources
const activeConnections = new Map();

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
            }
        });

        // Force garbage collection if available
        if (global.gc) global.gc();
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Optimized audio playback function
async function playAudio(connection) {
    try {
        await sodium.ready;

        // Cleanup existing connection
        const existing = activeConnections.get(connection.joinConfig.guildId);
        if (existing) {
            cleanupAudio(existing.player, existing.streams);
        }

        const player = createAudioPlayer();
        const streams = [];

        // Create FFmpeg input stream with optimized settings
        const transcoder = new prism.FFmpeg({
            args: [
                '-analyzeduration', '0',
                '-loglevel', '0',
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '2',
                '-bufsize', '64k'
            ]
        });
        streams.push(transcoder);

        // Create input stream with smaller chunks
        const input = fs.createReadStream(path.join(__dirname, 'music.opus'), {
            highWaterMark: 1024 * 32 // 32KB chunks
        });
        streams.push(input);

        // Create audio resource with optimized settings
        const resource = createAudioResource(input.pipe(transcoder), {
            inputType: StreamType.Raw,
            inlineVolume: true,
            silencePaddingFrames: 0
        });

        resource.volume?.setVolume(1);
        player.play(resource);
        connection.subscribe(player);

        // Store active connection data
        activeConnections.set(connection.joinConfig.guildId, {
            player,
            streams,
            resource
        });

        // Memory-efficient state change handling
        player.on('stateChange', (oldState, newState) => {
            if (newState.status === 'idle') {
                cleanupAudio(player, streams);
                activeConnections.delete(connection.joinConfig.guildId);
                
                setTimeout(() => {
                    playAudio(connection).catch(console.error);
                }, 100);
            }
        });

        player.on('error', error => {
            console.error('Player error:', error);
            cleanupAudio(player, streams);
            activeConnections.delete(connection.joinConfig.guildId);
            setTimeout(() => playAudio(connection), 1000);
        });

        connection.on('stateChange', (oldState, newState) => {
            if (newState.status === 'destroyed') {
                cleanupAudio(player, streams);
                activeConnections.delete(connection.joinConfig.guildId);
            }
        });

    } catch (error) {
        console.error('Error in playAudio:', error);
        setTimeout(() => playAudio(connection), 5000);
    }
}

// Handle graceful shutdown
async function handleShutdown() {
    console.log('Shutting down...');
    try {
        // Cleanup all active connections
        for (const [guildId, { player, streams }] of activeConnections.entries()) {
            cleanupAudio(player, streams);
            activeConnections.delete(guildId);
        }

        // Disconnect from voice channels
        const connections = getVoiceConnections();
        connections.forEach(connection => {
            connection.destroy();
        });

        // Set AFK status in all guilds
        const guilds = client.guilds.cache;
        for (const [_, guild] of guilds) {
            try {
                const member = guild.members.cache.get(client.user.id);
                if (member && member.manageable) {
                    await member.setNickname(`[AFK] ${client.user.username}`);
                }
            } catch (error) {
                console.error(`Failed to set AFK status in guild ${guild.name}:`, error);
            }
        }

        await mongoose.connection.close();
        await client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

// Register shutdown handlers
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Command handling setup
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = getAllCommandFiles(commandsPath);
const commands = [];
const clientCommands = new Collection();

function getAllCommandFiles(dir, files = []) {
    for (const file of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllCommandFiles(fullPath, files);
        } else if (file.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

for (const filePath of commandFiles) {
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        clientCommands.set(command.data.name, command);
        commands.push(command.data.toJSON());
    }
}

// Deploy slash commands
const deployCommands = async () => {
    try {
        const rest = new REST().setToken(process.env.BOT_TOKEN);
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
};

// Create Discord client
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

// Load events
const clearCooldowns = require('./events/ready/clear-cooldown');
const replyToHello = require('./events/messageCreate/reply-to-hello.js');
const afkListener = require('./events/messageCreate/afk-listener.js');

client.on('messageCreate', replyToHello);
client.on('messageCreate', afkListener);

// Ready event handler
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    await deployCommands();

    try {
        await sodium.ready;
        const channel = await client.channels.fetch(process.env.VOICE_CHANNEL_ID);
        
        if (!channel) {
            console.error('Could not find voice channel!');
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
            console.error('Voice connection error:', error);
            cleanupAudio(activeConnections.get(connection.joinConfig.guildId)?.player);
            activeConnections.delete(connection.joinConfig.guildId);
        });

        await playAudio(connection);
    } catch (error) {
        console.error('Error joining voice channel:', error);
    }

    // Set bot status
    const statusType = process.env.BOT_STATUS || 'online';
    const activityType = process.env.ACTIVITY_TYPE || 'PLAYING';
    const activityName = process.env.ACTIVITY_NAME || 'Discord';

    client.user.setPresence({
        status: statusMap[statusType],
        activities: [{
            name: activityName,
            type: activityTypeMap[activityType]
        }]
    });

    clearCooldowns();
});

// Interaction handler
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        const errorMessage = {
            content: 'There was an error while executing this command!',
            ephemeral: true
        };
        
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply(errorMessage);
            } else if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.followUp(errorMessage);
            }
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
});

// Status maps
const activityTypeMap = {
    'PLAYING': ActivityType.Playing,
    'WATCHING': ActivityType.Watching,
    'LISTENING': ActivityType.Listening,
    'STREAMING': ActivityType.Streaming,
    'COMPETING': ActivityType.Competing
};

const statusMap = {
    'online': PresenceUpdateStatus.Online,
    'idle': PresenceUpdateStatus.Idle,
    'dnd': PresenceUpdateStatus.DoNotDisturb,
    'invisible': PresenceUpdateStatus.Invisible
};

// Start the bot
(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        await client.login(process.env.BOT_TOKEN);
    } catch (err) {
        console.error('Failed to start bot:', err);
    }
})();