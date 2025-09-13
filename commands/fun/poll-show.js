const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const POLL_EMOJIS = [
    '1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll-show')
        .setDescription('Show poll results by message ID or link')
        .addStringOption(opt =>
            opt.setName('message')
                .setDescription('Poll message ID or link')
                .setRequired(true)
        ),
    async execute(interaction) {
        const messageOrId = interaction.options.getString('message');
        // Support both message ID and Discord message link
        let msgId = null;
        let channel = interaction.channel;
        const linkMatch = messageOrId.match(/https:\/\/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
        if (linkMatch) {
            // Extract channel and message ID from link
            const [, , channelId, messageId] = linkMatch;
            channel = await interaction.client.channels.fetch(channelId).catch(() => null);
            msgId = messageId;
        } else {
            msgId = messageOrId.match(/\d{17,}/)?.[0];
        }
        if (!msgId || !channel) return interaction.reply({ content: '❌ Invalid message ID or link.', ephemeral: true });
        const pollMsg = await channel.messages.fetch(msgId).catch(() => null);
        if (!pollMsg) return interaction.reply({ content: '❌ Poll message not found.', ephemeral: true });
        const results = [];
        for (let i = 0; i < POLL_EMOJIS.length; i++) {
            const emoji = POLL_EMOJIS[i];
            const reaction = pollMsg.reactions.cache.get(emoji);
            if (reaction) {
                // Fetch users for this reaction and exclude the bot
                const users = await reaction.users.fetch();
                const count = users.filter(u => !u.bot).size;
                results.push(`${emoji}: ${count}`);
            }
        }
        const embed = new EmbedBuilder()
            .setTitle('Poll Results')
            .setDescription(results.length ? results.join('\n') : 'No votes yet.')
            .setColor(0x5865F2)
            .setFooter({ text: `Poll by ${pollMsg.author?.tag || 'unknown'}` });
        return interaction.reply({ embeds: [embed] });
    }
};
