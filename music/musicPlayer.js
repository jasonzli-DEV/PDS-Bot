const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType } = require('@discordjs/voice');
const sodium = require('libsodium-wrappers');
const path = require('path');

// Map of active voice connections and their resources
const activeConnections = new Map();

// Music heartbeat monitoring
let musicHeartbeatInterval = null;

// Flag to track if bot startup is complete
let botStartupComplete = false;

/**
 * Cleanup audio resources
 */
function cleanupAudio(player, streams = []) {
    try {
        if (player) {
            player.removeAllListeners();
            player.stop();
        }
        streams.forEach(stream => {
            if (stream && typeof stream.destroy === 'function') {
                stream.destroy();
            }
            if (stream && typeof stream.kill === 'function') {
                stream.kill();
            }
        });
    } catch (error) {
        console.error('Error during audio cleanup:', error);
    }
}

/**
 * Monitor music playback and restart if stopped
 */
function startMusicHeartbeat(connection) {
    if (musicHeartbeatInterval) {
        clearInterval(musicHeartbeatInterval);
    }
    
    musicHeartbeatInterval = setInterval(() => {
        try {
            if (!connection || connection.state.status === 'destroyed') {
                console.log('🎵 Connection destroyed, stopping heartbeat');
                clearInterval(musicHeartbeatInterval);
                musicHeartbeatInterval = null;
                return;
            }
            
            const guildId = connection.joinConfig.guildId;
            const connectionData = activeConnections.get(guildId);
            
            if (!connectionData || !connectionData.player) {
                console.log('🎵 No player found, restarting music...');
                playAudio(connection).catch(console.error);
                return;
            }
            
            const player = connectionData.player;
            const playerState = player.state.status;
            
            // Check if player is in an unexpected state
            if (playerState === 'idle') {
                console.log(`🎵 Heartbeat: Player idle, restarting music...`);
                playAudio(connection).catch(console.error);
            } else if (playerState === 'autopaused') {
                console.log(`🎵 Heartbeat: Player autopaused, attempting to unpause...`);
                try {
                    player.unpause();
                    console.log('✅ Heartbeat: Player unpaused successfully');
                } catch (error) {
                    console.error('❌ Heartbeat: Failed to unpause, restarting audio...', error);
                    playAudio(connection).catch(console.error);
                }
            } else if (playerState === 'paused') {
                console.log(`🎵 Heartbeat: Player paused, attempting to unpause...`);
                try {
                    player.unpause();
                } catch (error) {
                    console.error('❌ Heartbeat: Failed to unpause from manual pause:', error);
                }
            }
            
        } catch (error) {
            console.error('🎵 Error in music heartbeat:', error);
        }
    }, 30000); // Check every 30 seconds
}

/**
 * Play audio in a RAM-efficient way, with looping support
 */
async function playAudio(connection) {
    const guildId = connection.joinConfig.guildId;
    
    try {
        await sodium.ready;
        
        // Check if connection is still valid
        if (connection.state.status === 'destroyed') {
            console.log('🎵 Connection destroyed, aborting playAudio');
            return;
        }
        
        // Use the Opus file directly since Discord supports Opus natively
        // Now music.opus is in the same directory as musicPlayer.js
        const inputPath = path.join(__dirname, 'music.opus');
        
        // Create audio resource directly from the Opus file
        const resource = createAudioResource(inputPath, {
            inputType: StreamType.OggOpus,
            inlineVolume: true
        });
        resource.volume?.setVolume(1);

        const player = createAudioPlayer();
        
        // Store player in activeConnections for cleanup (no FFmpeg process needed)
        const connectionData = activeConnections.get(guildId) || { player: null, streams: [] };
        connectionData.player = player;
        connectionData.streams = []; // No FFmpeg processes for direct Opus streaming
        activeConnections.set(guildId, connectionData);
        
        player.play(resource);
        connection.subscribe(player);

        console.log('🎵 Music playback started successfully!');

        // Show "fully ready" message after 5 seconds of music playback (only on first startup)
        if (!botStartupComplete) {
            setTimeout(() => {
                console.log('bun-app-started');
                console.log('🚀 Bot is fully ready and operational!');
                botStartupComplete = true;
            }, 5000);
        }

        // Remove any previous listeners to avoid duplicate handlers
        player.removeAllListeners('stateChange');
        player.removeAllListeners('error');
        
        // Handle player state changes
        player.on('stateChange', (oldState, newState) => {
            console.log(`🎵 Player state: ${oldState.status} -> ${newState.status}`);
            
            if (newState.status === 'idle') {
                console.log('🎵 Music track ended, restarting loop...');
                
                // Restart playback after a short delay
                setTimeout(() => {
                    if (connection.state.status !== 'destroyed') {
                        console.log('🔄 Restarting music playback...');
                        playAudio(connection).catch(err => {
                            console.error('🎵 Error restarting music:', err);
                            // Try again after a longer delay if restart fails
                            setTimeout(() => playAudio(connection).catch(console.error), 5000);
                        });
                    } else {
                        console.log('🎵 Voice connection destroyed, not restarting music.');
                        activeConnections.delete(guildId);
                    }
                }, 1000); // 1 second delay for clean looping
            } else if (newState.status === 'autopaused') {
                console.log('🎵 Player autopaused (likely no listeners or connection issues)');
                // Try to unpause after a short delay
                setTimeout(() => {
                    if (connection.state.status !== 'destroyed' && player.state.status === 'autopaused') {
                        console.log('🔄 Attempting to unpause player...');
                        try {
                            player.unpause();
                            console.log('✅ Player unpaused successfully');
                        } catch (error) {
                            console.error('❌ Failed to unpause player:', error);
                            // If unpause fails, restart the audio completely
                            console.log('🔄 Restarting audio due to unpause failure...');
                            setTimeout(() => playAudio(connection).catch(console.error), 2000);
                        }
                    }
                }, 3000);
            } else if (newState.status === 'paused') {
                console.log('🎵 Player manually paused, attempting to resume...');
                setTimeout(() => {
                    if (connection.state.status !== 'destroyed' && player.state.status === 'paused') {
                        try {
                            player.unpause();
                            console.log('✅ Player resumed from manual pause');
                        } catch (error) {
                            console.error('❌ Failed to resume from pause:', error);
                        }
                    }
                }, 1000);
            }
        });

        // Handle player errors
        player.on('error', error => {
            console.error('🎵 Player error:', error);
            
            setTimeout(() => {
                if (connection.state.status !== 'destroyed') {
                    console.log('🔄 Restarting music after player error...');
                    playAudio(connection).catch(err => {
                        console.error('🎵 Error restarting after player error:', err);
                        // Try again after a longer delay
                        setTimeout(() => playAudio(connection).catch(console.error), 5000);
                    });
                } else {
                    activeConnections.delete(guildId);
                }
            }, 2000);
        });

    } catch (error) {
        console.error('🎵 Error in playAudio:', error);
        
        // Clean up any existing connections for this guild
        const connectionData = activeConnections.get(guildId);
        if (connectionData) {
            cleanupAudio(connectionData.player, connectionData.streams);
        }
        
        // Retry after delay
        setTimeout(() => {
            if (connection.state.status !== 'destroyed') {
                console.log('🔄 Retrying playAudio after error...');
                playAudio(connection).catch(console.error);
            } else {
                activeConnections.delete(guildId);
            }
        }, 3000);
    }
}

/**
 * Connect to a voice channel and start playing music
 */
async function connectToVoiceChannel(client, channelId) {
    if (!channelId) {
        console.log('ℹ️ No VOICE_CHANNEL_ID set - skipping voice connection');
        // Show ready message immediately if no voice channel is configured
        setTimeout(() => {
            if (!botStartupComplete) {
                console.log('bun-app-started');
                console.log('🚀 Bot is fully ready and operational!');
                botStartupComplete = true;
            }
        }, 1000);
        return null;
    }

    console.log('🎵 Attempting to join global voice channel...');
    
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.warn('⚠️ Could not find voice channel! Check VOICE_CHANNEL_ID in .env');
            return null;
        } else if (channel.type !== 2) { // 2 = GUILD_VOICE
            console.warn('⚠️ Channel is not a voice channel! Check VOICE_CHANNEL_ID in .env');
            return null;
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
                    await playAudio(newConnection);
                } catch (reconnectError) {
                    console.error('❌ Failed to reconnect:', reconnectError);
                }
            }, 5000);
        });

        // Auto-reconnect on disconnect
        connection.on('stateChange', (oldState, newState) => {
            console.log(`🎵 Connection state: ${oldState.status} -> ${newState.status}`);
            
            if (newState.status === 'disconnected') {
                console.log('🎵 Voice connection disconnected, attempting to reconnect...');
                const guildId = connection.joinConfig.guildId;
                const connectionData = activeConnections.get(guildId);
                if (connectionData) {
                    cleanupAudio(connectionData.player, connectionData.streams);
                }
                
                setTimeout(async () => {
                    try {
                        const newConnection = joinVoiceChannel({
                            channelId: channel.id,
                            guildId: channel.guild.id,
                            adapterCreator: channel.guild.voiceAdapterCreator,
                            selfDeaf: false,
                            selfMute: false
                        });
                        activeConnections.set(newConnection.joinConfig.guildId, { player: createAudioPlayer(), streams: [] });
                        await playAudio(newConnection);
                        startMusicHeartbeat(newConnection);
                        console.log('✅ Successfully reconnected to voice channel');
                    } catch (reconnectError) {
                        console.error('❌ Failed to reconnect after disconnect:', reconnectError);
                        // Try again after a longer delay
                        setTimeout(() => {
                            console.log('🔄 Retrying voice reconnection...');
                            // Retry the reconnection
                        }, 10000);
                    }
                }, 3000);
            }
            
            if (newState.status === 'destroyed') {
                console.log('🎵 Voice connection destroyed');
                const guildId = connection.joinConfig.guildId;
                const connectionData = activeConnections.get(guildId);
                if (connectionData) {
                    cleanupAudio(connectionData.player, connectionData.streams);
                    activeConnections.delete(guildId);
                }
                if (musicHeartbeatInterval) {
                    clearInterval(musicHeartbeatInterval);
                    musicHeartbeatInterval = null;
                }
            }
        });
        
        activeConnections.set(connection.joinConfig.guildId, { player: createAudioPlayer(), streams: [] });
        await playAudio(connection);
        startMusicHeartbeat(connection);
        console.log(`✅ Joined voice channel: ${channel.name} in guild ${channel.guild.name}`);
        
        return connection;
    } catch (err) {
        console.error('❌ Failed to join voice channel:', err);
        return null;
    }
}

module.exports = {
    connectToVoiceChannel,
    playAudio,
    startMusicHeartbeat,
    cleanupAudio,
    activeConnections
};
