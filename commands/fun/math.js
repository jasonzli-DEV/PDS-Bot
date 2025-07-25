const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('math')
        .setDescription('Performs basic math operations: add, subtract, multiply, divide')
        .addStringOption(option =>
            option.setName('operation')
                .setDescription('The operation to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Subtract', value: 'subtract' },
                    { name: 'Multiply', value: 'multiply' },
                    { name: 'Divide', value: 'divide' }
                )
        )
        .addNumberOption(option =>
            option.setName('a')
                .setDescription('First number')
                .setRequired(true)
        )
        .addNumberOption(option =>
            option.setName('b')
                .setDescription('Second number')
                .setRequired(true)
        ),
    async execute(interaction) {
        const operation = interaction.options.getString('operation');
        const a = interaction.options.getNumber('a');
        const b = interaction.options.getNumber('b');
        let result;

        switch (operation) {
            case 'add':
                result = a + b;
                break;
            case 'subtract':
                result = a - b;
                break;
            case 'multiply':
                result = a * b;
                break;
            case 'divide':
                if (b === 0) {
                    return interaction.reply({ content: 'Cannot divide by zero!', ephemeral: true });
                }
                result = a / b;
                break;
            default:
                return interaction.reply({ content: 'Invalid operation.', ephemeral: true });
        }

        await interaction.reply(`Result: **${result}**`);
    }
};