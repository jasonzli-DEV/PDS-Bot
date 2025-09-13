const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Get information about a role')
        .addRoleOption(opt =>
            opt.setName('role')
                .setDescription('Role to get info about')
                .setRequired(true)
        ),
    async execute(interaction) {
        const role = interaction.options.getRole('role');
        const embed = new EmbedBuilder()
            .setTitle(`Role Info: ${role.name}`)
            .setColor(role.color || 0x5865F2)
            .addFields(
                { name: 'Role ID', value: role.id, inline: true },
                { name: 'Members', value: `${role.members.size}`, inline: true },
                { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp/1000)}:F>`, inline: true },
                { name: 'Position', value: `${role.position}`, inline: true },
                { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
                { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true }
            )
            .setFooter({ text: `Requested by ${interaction.user.tag}` });
        await interaction.reply({ embeds: [embed] });
    }
};
