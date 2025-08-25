const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const Afk = require('../../schemas/Afk');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set your AFK status.')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for going AFK')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            // Defer the reply immediately
            await interaction.deferReply({ ephemeral: true });

            const userId = interaction.user.id;
            const guildId = interaction.guild.id;
            const reason = interaction.options.getString('reason') || 'AFK';
            const member = interaction.member;

            // Store original display name
            const originalName = member.displayName;

            // Update or create AFK entry
            await Afk.findOneAndUpdate(
                { userId, guildId },
                {
                    reason,
                    since: new Date(),
                    originalName
                },
                { upsert: true, new: true }
            );

            // Set AFK nickname
            try {
                const newNick = `[AFK] ${originalName}`.slice(0, 32);
                await member.setNickname(newNick);
                console.log(`Set AFK nickname for ${member.displayName}: ${newNick}`);
            } catch (nickError) {
                console.error(`Failed to set nickname for ${member.displayName}:`, nickError);
            }

            // Use editReply instead of reply
            await interaction.editReply({
                content: `You are now AFK: ${reason}`
            });

        } catch (error) {
            console.error('AFK command error:', error);
            // Use followUp if the initial reply fails
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Failed to set AFK status.',
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    content: 'Failed to set AFK status.',
                    ephemeral: true
                });
            }
        }
    },
};