require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    ActivityType,
    PresenceUpdateStatus,
    Events,
    REST,
    Routes
} = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    StreamType,
    generateDependencyReport,
    getVoiceConnections
} = require('@discordjs/voice');
const sodium = require('libsodium-wrappers');
const mongoose = require('mongoose');

// Log voice dependency report
console.log('Voice Dependency Report:', generateDependencyReport());

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

client.commands = new Collection();

// Graceful shutdown
async function handleShutdown() {
    console.log('Shutting down...');
    try {
        // Disconnect from all voice channels
        getVoiceConnections().forEach(conn => {
            console.log(`Disconnecting from voice channel in guild ${conn.joinConfig.guildId}`);
            conn.destroy();
        });

        // Set AFK nickname
        for (const [, guild] of client.guilds.cache) {
            try {
                const member = guild.members.cache.get(client.user.id);
                if (member && member.manageable) {
                    await member.setNickname(`[AFK] ${client.user.username}`);
                    console.log(`Set AFK status in ${guild.name}`);
                }
            } catch (err) {
                console.error(`Failed to set AFK in ${guild.name}:`, err);
            }
        }

        // Close MongoDB
        await mongoose.connection.close();
        console.log('Closed MongoDB connection');

        await client.destroy();
        console.log('Discord client destroyed');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Load commands recursively
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

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = getAllCommandFiles(commandsPath);
    const commandsData = [];

    for (const filePath of commandFiles) {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commandsData.push(command.data.toJSON());
        } else {
            console.warn(`[WARNING] Command at ${filePath} is missing "data" or "execute"`);
        }
    }

    // Deploy commands
    (async () => {
        try {
            const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
            console.log('Refreshing application slash commands...');
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commandsData }
            );
            console.log('Successfully deployed commands!');
        } catch (err) {
            console.error('Error deploying commands:', err);
        }
    })();
}

// Audio player function
async function playAudio(connection) {
    try {
        const player = createAudioPlayer();

        const createResourceSafe = () => {
            const musicPath = path.join(__dirname, 'music.mp3');
            if (!fs.existsSync(musicPath)) {
                console.warn('Music file not found!');
                return null;
            }
            return createAudioResource(fs.createReadStream(musicPath), {
                inputType: StreamType.mp3,
                inlineVolume: true
            });
        };

        let resource = createResourceSafe();
        if (!resource) return;

        resource.volume?.setVolume(1);
        player.play(resource);
        connection.subscribe(player);

        // Loop playback
        player.on('stateChange', (oldState, newState) => {
            if (oldState.status !== 'idle' && newState.status === 'idle') {
                console.log('Restarting music loop...');
                const newRes = createResourceSafe();
                if (newRes) {
                    newRes.volume?.setVolume(1);
                    player.play(newRes);
                }
            }
        });

        player.on('error', error => {
            console.error('Player error:', error);
            setTimeout(() => playAudio(connection), 5000);
        });

    } catch (err) {
        console.error('Error in playAudio:', err);
        setTimeout(() => playAudio(connection), 5000);
    }
}

// On ready
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);

    // Set bot presence
    const statusMap = {
        online: PresenceUpdateStatus.Online,
        idle: PresenceUpdateStatus.Idle,
        dnd: PresenceUpdateStatus.DoNotDisturb,
        invisible: PresenceUpdateStatus.Invisible
    };
    const activityTypeMap = {
        PLAYING: ActivityType.Playing,
        WATCHING: ActivityType.Watching,
        LISTENING: ActivityType.Listening,
        STREAMING: ActivityType.Streaming,
        COMPETING: ActivityType.Competing
    };

    client.user.setPresence({
        status: statusMap[process.env.BOT_STATUS] || PresenceUpdateStatus.Online,
        activities: [{
            name: process.env.ACTIVITY_NAME || 'Discord',
            type: activityTypeMap[process.env.ACTIVITY_TYPE] || ActivityType.Playing
        }]
    });

    console.log(`Presence set: ${process.env.BOT_STATUS || 'online'}, ${process.env.ACTIVITY_TYPE || 'PLAYING'} ${process.env.ACTIVITY_NAME || 'Discord'}`);

    // Join voice channel
    try {
        await sodium.ready;
        const channel = await client.channels.fetch(process.env.VOICE_CHANNEL_ID);
        if (!channel || !channel.isVoiceBased()) {
            console.error('Voice channel not found or invalid!');
            return;
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        connection.on('error', err => console.error('Voice connection error:', err));

        await playAudio(connection);
        console.log('Joined voice channel and started playing music');
    } catch (err) {
        console.error('Error joining voice channel:', err);
    }

    // Clear cooldowns
    const clearCooldowns = require('./events/ready/clear-cooldown');
    if (clearCooldowns) clearCooldowns();
});

// Interaction handler
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (err) {
        console.error(`Error executing ${interaction.commandName}:`, err);
        const replyMessage = { content: 'There was an error while executing this command!', ephemeral: true };
        try {
            if (!interaction.replied && !interaction.deferred) await interaction.reply(replyMessage);
            else if (interaction.deferred) await interaction.editReply(replyMessage);
            else await interaction.followUp(replyMessage);
        } catch (replyErr) {
            console.error('Error sending error message:', replyErr);
        }
    }
});

// Connect MongoDB & login
(async () => {
    if (!process.env.MONGODB_URI) {
        console.error('Missing MONGODB_URI in environment variables!');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        if (!process.env.BOT_TOKEN) {
            console.error('Missing BOT_TOKEN in environment variables!');
            process.exit(1);
        }

        await client.login(process.env.BOT_TOKEN);
    } catch (err) {
        console.error('Failed to start bot:', err);
        process.exit(1);
    }
})();
