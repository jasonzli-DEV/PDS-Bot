require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { 
    Client, GatewayIntentBits, Partials, Collection, 
    ActivityType, PresenceUpdateStatus, Events, REST, Routes 
} = require('discord.js');
const { 
    joinVoiceChannel, createAudioPlayer, createAudioResource, 
    StreamType, generateDependencyReport, getVoiceConnections 
} = require('@discordjs/voice');
const prism = require('prism-media');
const mongoose = require('mongoose');

// Log voice dependencies
console.log(generateDependencyReport());

// ---------- Graceful Shutdown ----------
async function handleShutdown() {
    console.log('Shutting down...');

    try {
        // Disconnect from all voice channels
        const connections = getVoiceConnections();
        connections.forEach(connection => {
            console.log(`Disconnecting from voice channel in guild ${connection.joinConfig.guildId}`);
            connection.destroy();
        });

        // Close MongoDB
        await mongoose.connection.close();
        console.log('Closed MongoDB connection');

        // Destroy client
        await client.destroy();
        console.log('Destroyed Discord client');

        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// ---------- Load Commands ----------
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
const commandFiles = getAllCommandFiles(commandsPath);
const commands = [];
const clientCommands = new Collection();

for (const filePath of commandFiles) {
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        clientCommands.set(command.data.name, command);
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

const deployCommands = async () => {
    try {
        const rest = new REST().setToken(process.env.BOT_TOKEN);
        console.log('Refreshing application slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully deployed commands!');
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

// ---------- Event Listeners ----------
const clearCooldowns = require('./events/ready/clear-cooldown');
const replyToHello = require('./events/messageCreate/reply-to-hello');
const afkListener = require('./events/messageCreate/afk-listener');

client.on('messageCreate', replyToHello);
client.on('messageCreate', afkListener);

// ---------- Play Audio ----------
async function playAudio(connection) {
    try {
        const player = createAudioPlayer();

        const createResource = () => {
            const filePath = path.join(__dirname, 'music.mp3');
            if (!fs.existsSync(filePath)) {
                console.error('Music file not found!');
                return null;
            }

            const ffmpegStream = new prism.FFmpeg({
                args: ['-i', filePath, '-f', 'opus', '-ar', '48000', '-ac', '2', 'pipe:1']
            });

            return createAudioResource(ffmpegStream, {
                inputType: StreamType.Opus,
                inlineVolume: true
            });
        };

        let resource = createResource();
        if (!resource) return;

        resource.volume?.setVolume(1);
        player.play(resource);
        connection.subscribe(player);

        // Loop music
        player.on('stateChange', (oldState, newState) => {
            if (oldState.status !== 'idle' && newState.status === 'idle') {
                console.log('Restarting music loop...');
                const newResource = createResource();
                if (newResource) {
                    newResource.volume?.setVolume(1);
                    player.play(newResource);
                }
            }
        });

        player.on('error', error => {
            console.error('Player error:', error);
            setTimeout(() => playAudio(connection), 5000);
        });

    } catch (error) {
        console.error('Error in playAudio:', error);
        setTimeout(() => playAudio(connection), 5000);
    }
}

// ---------- On Ready ----------
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);

    // Deploy commands
    await deployCommands();

    // Join voice channel and play music
    try {
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

        connection.on('error', error => console.error('Voice connection error:', error));
        await playAudio(connection);
        console.log('Joined voice channel and started playing music');
    } catch (error) {
        console.error('Error joining voice channel:', error);
    }

    // Set bot presence
    const statusType = process.env.BOT_STATUS || 'online';
    const activityType = process.env.ACTIVITY_TYPE || 'PLAYING';
    const activityName = process.env.ACTIVITY_NAME || 'Discord';

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

    client.user.setPresence({
        status: statusMap[statusType],
        activities: [{ name: activityName, type: activityTypeMap[activityType] }]
    });

    console.log(`Presence set: ${statusType}, ${activityType} ${activityName}`);
    clearCooldowns();
});

// ---------- Handle Interactions ----------
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        try {
            const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };
            if (!interaction.deferred && !interaction.replied) await interaction.reply(errorMessage);
            else if (interaction.deferred) await interaction.editReply(errorMessage);
            else await interaction.followUp(errorMessage);
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
});

// ---------- Connect to MongoDB and Login ----------
(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        await client.login(process.env.BOT_TOKEN);
    } catch (err) {
        console.error('Failed to start bot:', err);
    }
})();
