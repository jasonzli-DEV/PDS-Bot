const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get information about a user')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('User to get info about')
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
        const member = await interaction.guild.members.fetch(user.id);
        const embed = new EmbedBuilder()
            .setTitle(`User Info: ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: 'User ID', value: user.id, inline: true },
                { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp/1000)}:F>`, inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp/1000)}:F>`, inline: true },
                { name: 'Roles', value: member.roles.cache.map(r => r.name).join(', ') || 'None', inline: false }
            )
            .setColor(0x5865F2)
            .setFooter({ text: `Requested by ${interaction.user.tag}` });
        await interaction.reply({ embeds: [embed] });
    }
};
