const { SlashCommandBuilder } = require('discord.js');
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
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const reason = interaction.options.getString('reason') || 'AFK';

        let afk = await Afk.findOne({ userId, guildId });
        if (!afk) {
            afk = new Afk({ userId, guildId, reason });
        } else {
            afk.reason = reason;
            afk.since = new Date();
        }
        await afk.save();

        await interaction.reply({ content: `You are now AFK: ${reason}`, ephemeral: true });
    }
};