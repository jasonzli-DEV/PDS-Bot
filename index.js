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
const sodium = require('libsodium-wrappers');
const mongoose = require('mongoose');

// Log voice dependency report
console.log('Voice Dependency Report:', generateDependencyReport());

// Handle graceful shutdown
async function handleShutdown() {
    console.log('Shutting down...');

    try {
        // Disconnect from all voice channels
        const connections = getVoiceConnections();
        connections.forEach(connection => {
            console.log(`Disconnecting from voice channel in guild ${connection.joinConfig.guildId}`);
            connection.destroy();
        });

        // Set AFK status in all guilds
        const guilds = client.guilds.cache;
        for (const [_, guild] of guilds) {
            try {
                const member = guild.members.cache.get(client.user.id);
                if (member && member.manageable) {
                    await member.setNickname(`[AFK] ${client.user.username}`);
                    console.log(`Set AFK status in ${guild.name}`);
                }
            } catch (error) {
                console.error(`Failed to set AFK status in guild ${guild.name}:`, error);
            }
        }

        // Close MongoDB connection
        await mongoose.connection.close();
        console.log('Closed MongoDB connection');

        // Destroy the client
        await client.destroy();
        console.log('Successfully shutdown Discord client');
        
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Recursively get all .js command files
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
        console.log(`Started refreshing application slash commands globally.`);
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded all commands!');
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
client.on('messageCreate', replyToHello);
const afkListener = require('./events/messageCreate/afk-listener.js');
client.on('messageCreate', afkListener);

// Function to play looping audio
async function playAudio(connection) {
    try {
        const player = createAudioPlayer();

        const createResource = () => createAudioResource(
            fs.createReadStream(path.join(__dirname, 'music.opus')),
            {
                inputType: StreamType.Opus,
                inlineVolume: true
            }
        );

        const resource = createResource();
        resource.volume?.setVolume(1);
        player.play(resource);
        connection.subscribe(player);

        // Loop when finished
        player.on('stateChange', (oldState, newState) => {
            if (oldState.status !== 'idle' && newState.status === 'idle') {
                console.log('Restarting music loop...');
                const newResource = createResource();
                newResource.volume?.setVolume(1);
                player.play(newResource);
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

// On ready
client.once(Events.ClientReady, async () => {
    console.log('Ready!');
    console.log(`Logged in as ${client.user.tag}`);

    await deployCommands();

    // Join voice channel and play music
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
        });

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
        activities: [{
            name: activityName,
            type: activityTypeMap[activityType]
        }]
    });

    console.log(`Bot status set to: ${statusType}`);
    console.log(`Activity set to: ${activityType} ${activityName}`);

    clearCooldowns();
});

// Handle interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        
        try {
            const errorMessage = {
                content: 'There was an error while executing this command!',
                ephemeral: true
            };

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

// Connect to MongoDB and login
(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        await client.login(process.env.BOT_TOKEN);
    } catch (err) {
        console.error('Failed to start bot:', err);
    }
})();
