const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const canvacord = require('canvacord');
const LevelProfile = require('../../schemas/LevelProfile');

function getXPForLevel(level) {
    let xp = 50;
    for (let i = 2; i <= level; i++) {
        xp = Math.round(xp * 1.5 / 50) * 50;
    }
    return xp;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Show your level and XP rank card!')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to view (optional)')
                .setRequired(false)
        ),
    async execute(interaction) {
            // Only allow this command in servers
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    flags: 64
                });
            }
        const user = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;
        const userId = user.id;

        // Check if user is a bot
        if (user.bot) {
            return interaction.reply({
                content: '❌ Bots don\'t have levels!',
                flags: 64
            });
        }

        // Fetch profile
        let profile = await LevelProfile.findOne({ userId, guildId });
        if (!profile) {
            profile = new LevelProfile({ userId, guildId, xp: 0, level: 1 });
            await profile.save();
        }

        // Get rank (position in server) - exclude bots from ranking
        const allProfiles = await LevelProfile.find({ guildId }).sort({ level: -1, xp: -1 });
        const rank = allProfiles.findIndex(p => p.userId === userId) + 1;
        const neededXP = getXPForLevel(profile.level);

        // Generate rank card
        const avatar = user.displayAvatarURL({ extension: 'png', size: 256 });
        const card = new canvacord.Rank()
            .setAvatar(avatar)
            .setCurrentXP(profile.xp)
            .setRequiredXP(neededXP)
            .setLevel(profile.level)
            .setRank(rank)
            .setStatus(user.presence?.status || 'online')
            .setProgressBar('#5865F2', 'COLOR')
            .setUsername(user.username);
        
        // Only set discriminator if it's not #0 (unique username)
        if (user.discriminator !== '0') {
            card.setDiscriminator(user.discriminator);
        }

        const data = await card.build();
        const attachment = new AttachmentBuilder(data, { name: 'rank.png' });

        await interaction.reply({
            content: `${user}'s Level Card:`,
            files: [attachment]
        });
    },
};