const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from the channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    async execute(interaction) {
        // Check if user has permission to manage messages
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: '❌ You need the "Manage Messages" permission to use this command.',
                ephemeral: true
            });
        }

        // Check if bot has permission to manage messages
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: '❌ I need the "Manage Messages" permission to delete messages.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Purge Messages')
            .setDescription('Select the type of messages you want to delete:')
            .setColor('#ff0000')
            .setFooter({ text: 'This action cannot be undone!' });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('purge_type_select')
            .setPlaceholder('Choose message type...')
            .addOptions([
                {
                    label: 'All Messages',
                    description: 'Delete all messages (including bots and humans)',
                    value: 'all',
                    emoji: '💬'
                },
                {
                    label: 'Human Messages Only',
                    description: 'Delete only messages from human users',
                    value: 'humans',
                    emoji: '👤'
                },
                {
                    label: 'Bot Messages Only',
                    description: 'Delete only messages from bots',
                    value: 'bots',
                    emoji: '🤖'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
    },

    async handleTypeSelect(interaction) {
        const messageType = interaction.values[0];
        
        // Create modal for amount input
        const modal = new ModalBuilder()
            .setCustomId(`purge_amount_modal_${messageType}`)
            .setTitle('Purge Messages');

        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Number of messages to delete')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter a number between 1 and 500')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(3);

        const actionRow = new ActionRowBuilder().addComponents(amountInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async handleAmountSubmit(interaction) {
        const messageType = interaction.customId.split('_')[3]; // Extract type from customId
        const amount = parseInt(interaction.fields.getTextInputValue('amount'));

        // Validate amount
        if (isNaN(amount) || amount < 1 || amount > 500) {
            return interaction.reply({
                content: '❌ Please enter a valid number between 1 and 500.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            let deletedCount = 0;
            let messagesToDelete = [];

            // Fetch messages
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            
            // Filter messages based on type
            for (const message of messages.values()) {
                if (messagesToDelete.length >= amount) break;
                
                // Skip messages older than 14 days (Discord API limitation)
                if (Date.now() - message.createdTimestamp > 14 * 24 * 60 * 60 * 1000) {
                    continue;
                }

                if (messageType === 'all') {
                    messagesToDelete.push(message);
                } else if (messageType === 'humans' && !message.author.bot) {
                    messagesToDelete.push(message);
                } else if (messageType === 'bots' && message.author.bot) {
                    messagesToDelete.push(message);
                }
            }

            // Delete messages in batches of 100 (Discord API limit)
            while (messagesToDelete.length > 0) {
                const batch = messagesToDelete.splice(0, 100);
                const deleted = await interaction.channel.bulkDelete(batch, true);
                deletedCount += deleted.size;
            }

            // Create result embed
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Purge Complete')
                .setDescription(`Successfully deleted **${deletedCount}** messages`)
                .addFields(
                    { name: 'Type', value: messageType === 'all' ? 'All Messages' : messageType === 'humans' ? 'Human Messages' : 'Bot Messages', inline: true },
                    { name: 'Channel', value: interaction.channel.toString(), inline: true },
                    { name: 'Moderator', value: interaction.user.toString(), inline: true }
                )
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.editReply({ embeds: [resultEmbed] });

            // Log purge action
            console.log(`[PURGE] ${interaction.user.tag} (${interaction.user.id}) purged ${deletedCount} ${messageType} messages in ${interaction.channel.name} (${interaction.guild.name})`);

        } catch (error) {
            console.error('Error purging messages:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Purge Failed')
                .setDescription('An error occurred while deleting messages. This could be due to:\n• Messages being older than 14 days\n• Insufficient permissions\n• Rate limiting')
                .setColor('#ff0000')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
