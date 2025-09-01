require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, ActivityType, PresenceUpdateStatus, Events, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, getVoiceConnections } = require('@discordjs/voice');
const sodium = require('libsodium-wrappers');
const mongoose = require('mongoose');
const ytdl = require('ytdl-core');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');

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
                if (typeof stream.kill === 'function') stream.kill();
            }
        });
        if (global.gc) global.gc();
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Reliable YouTube audio playback using ytdl-core + ffmpeg-static
async function playAudio(connection) {
    const videoUrl = process.env.YT_URL || 'https://www.youtube.com/watch?v=RIu4vp_PuXU';
    try {
        const existing = activeConnections.get(connection.joinConfig.guildId);
        if (existing) cleanupAudio(existing.player, existing.streams);

        const player = createAudioPlayer();
        const streams = [];

        // Get YouTube audio stream
        const ytStream = ytdl(videoUrl, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        });

        // Pipe through ffmpeg for Discord compatibility
        const ffmpegProcess = spawn(ffmpeg, [
            '-i', 'pipe:0',
            '-analyzeduration', '0',
            '-loglevel', '0',
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1'
        ], { stdio: ['pipe', 'pipe', 'ignore'] });

        ytStream.pipe(ffmpegProcess.stdin);
        streams.push(ytStream, ffmpegProcess);

        const resource = createAudioResource(ffmpegProcess.stdout, {
            inputType: StreamType.Raw
        });

        player.play(resource);
        connection.subscribe(player);

        activeConnections.set(connection.joinConfig.guildId, {
            player,
            streams,
            resource
        });

        player.on('stateChange', (oldState, newState) => {
            if (newState.status === 'idle') {
                cleanupAudio(player, streams);
                activeConnections.delete(connection.joinConfig.guildId);
                ffmpegProcess.kill();
                setTimeout(() => playAudio(connection).catch(console.error), 500);
            }
        });

        player.on('error', err => {
            console.error('Player error:', err);
            cleanupAudio(player, streams);
            activeConnections.delete(connection.joinConfig.guildId);
            ffmpegProcess.kill();
            setTimeout(() => playAudio(connection).catch(console.error), 2000);
        });

        connection.on('stateChange', (oldState, newState) => {
            if (newState.status === 'destroyed') {
                cleanupAudio(player, streams);
                activeConnections.delete(connection.joinConfig.guildId);
                ffmpegProcess.kill();
            }
        });

        console.log('Started playing audio stream');
    } catch (error) {
        console.error('Error in playAudio:', error);
        setTimeout(() => playAudio(connection), 5000);
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
 * Cleans up listeners and destroys streams
 */
function cleanupAudio(player, streams = []) {
    player.removeAllListeners();
    streams.forEach(stream => {
        if (stream && typeof stream.destroy === 'function') stream.destroy();
        if (stream && typeof stream.unpipe === 'function') stream.unpipe();
    });
}

/**
 * Play audio in a RAM-efficient way, with looping support
 */
async function playAudio(connection) {
    try {
        await sodium.ready;

        // Lower highWaterMark: less RAM used for buffering
        const input = fs.createReadStream(path.join(__dirname, 'music.opus'), { highWaterMark: 1 << 16 }); // 64 KB

        // If music.opus is already Opus-encoded, no need to transcode or re-encode
        const resource = createAudioResource(input, {
            inputType: StreamType.Opus,
            inlineVolume: true
        });
        resource.volume?.setVolume(1);

        const player = createAudioPlayer();
        player.play(resource);
        connection.subscribe(player);

        // Loop playback when idle (end of track)
        player.once('stateChange', (oldState, newState) => {
            if (newState.status === 'idle') {
                cleanupAudio(player, [input]);
                // Loop: replay after a brief delay
                setTimeout(() => playAudio(connection), 250);
            }
        });

        player.once('error', error => {
            console.error('Player error:', error);
            cleanupAudio(player, [input]);
            // Optional: restart playback after error
            setTimeout(() => playAudio(connection), 1000);
        });

        input.once('error', error => {
            console.error('Input stream error:', error);
            player.stop();
            cleanupAudio(player, [input]);
            // Optional: restart playback after error
            setTimeout(() => playAudio(connection), 1000);
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
        // Restart playback after error
        setTimeout(() => playAudio(connection), 1000);
    }
}

// On ready
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    deployCommands().catch(console.error);

    try {
        const channel = await client.channels.fetch(process.env.VOICE_CHANNEL_ID);
        if (!channel) {
            console.error('Could not find voice channel! Set VOICE_CHANNEL_ID in .env');
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
    const activityName = process.env.ACTIVITY_NAME || 'Discord';
    const activityType = ActivityType.Playing;
    const status = PresenceUpdateStatus.Online;
    try {
        client.user.setPresence({ status, activities: [{ name: activityName, type: activityType }] });
    } catch {}
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
        try {
            if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: 'Error executing command', ephemeral: true });
            else if (interaction.deferred) await interaction.editReply({ content: 'Error executing command' });
            else await interaction.followUp({ content: 'Error executing command' });
        } catch {}
    }
});

// Start the bot
(async () => {
    try {
        if (process.env.MONGODB_URI) await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB (if configured)');
        await client.login(process.env.BOT_TOKEN);
    } catch (err) {
        console.error('Failed to start bot:', err);
    }
})();
