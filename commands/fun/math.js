const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('math')
        .setDescription('Calculate a simple math expression.')
        .addStringOption(option =>
            option.setName('expression')
                .setDescription('Math expression (e.g. 2+2)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const expr = interaction.options.getString('expression');
        let result;
        try {
            // Safe eval for basic math
            result = Function(`"use strict";return (${expr})`)();
        } catch {
            result = 'Invalid expression!';
        }
        console.log(`[MATH] ${interaction.user.tag} ran: ${expr} = ${result}`);
        await interaction.reply({ content: `Result: ${result}` });
    }
};