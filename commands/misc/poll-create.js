const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const POLL_EMOJIS = [
    '1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll-create')
        .setDescription('Create a poll (max 10 choices)')
        .addStringOption(opt =>
            opt.setName('title')
                .setDescription('Poll title')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('choice1')
                .setDescription('Choice 1')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('choice2')
                .setDescription('Choice 2')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('choice3')
                .setDescription('Choice 3')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('choice4')
                .setDescription('Choice 4')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('choice5')
                .setDescription('Choice 5')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('choice6')
                .setDescription('Choice 6')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('choice7')
                .setDescription('Choice 7')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('choice8')
                .setDescription('Choice 8')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('choice9')
                .setDescription('Choice 9')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('choice10')
                .setDescription('Choice 10')
                .setRequired(false)
        ),
    async execute(interaction) {
        const title = interaction.options.getString('title');
        const choices = [];
        for (let i = 1; i <= 10; i++) {
            const choice = interaction.options.getString(`choice${i}`);
            if (choice) choices.push(choice);
        }
        if (choices.length < 2) {
            return interaction.reply({ content: '❌ Poll must have at least 2 choices.', flags: 64 });
        }
        let desc = '';
        for (let i = 0; i < choices.length; i++) {
            desc += `${POLL_EMOJIS[i]} ${choices[i]}\n`;
        }
        const embed = new EmbedBuilder()
            .setTitle('📊 Poll')
            .setDescription(`**${title}**\n\n${desc}`)
            .setColor(0x5865F2)
            .setFooter({ text: `Poll by ${interaction.user.tag}` });
        const pollMsg = await interaction.channel.send({ embeds: [embed] });
        for (let i = 0; i < choices.length; i++) {
            await pollMsg.react(POLL_EMOJIS[i]);
        }
    await interaction.reply({ content: `Poll created! [Jump to poll](${pollMsg.url})`, flags: 64 });
    }
};
