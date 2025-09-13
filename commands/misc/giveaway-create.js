const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const Giveaway = require('../../schemas/Giveaway');

function hasModPerms(member) {
    const ownerRoleId = process.env.OWNER_ROLE_ID;
    const managerRoleId = process.env.MANAGER_ROLE_ID;
    const moderatorRoleId = process.env.MODERATOR_ROLE_ID;
    return (
        (ownerRoleId && member.roles.cache.has(ownerRoleId)) ||
        (managerRoleId && member.roles.cache.has(managerRoleId)) ||
        (moderatorRoleId && member.roles.cache.has(moderatorRoleId)) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway-create')
        .setDescription('Create a giveaway')
        .addChannelOption(opt =>
            opt.setName('channel')
                .setDescription('Channel for the giveaway')
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('winners')
                .setDescription('Number of winners')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(opt =>
            opt.setName('duration')
                .setDescription('Duration (e.g. 1h, 30m)')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('name')
                .setDescription('Giveaway name/prize')
                .setRequired(true)
        ),
    async execute(interaction) {
            // Only allow this command in servers
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    flags: 64
                });
            }
        if (!hasModPerms(interaction.member)) {
            return interaction.reply({ content: '❌ You lack permission.', flags: 64 });
        }

        const channel = interaction.options.getChannel('channel');
        if (!channel.isTextBased()) {
            return interaction.reply({ content: '❌ Please select a text channel for the giveaway.', flags: 64 });
        }
        const winners = interaction.options.getInteger('winners');
        const durationStr = interaction.options.getString('duration');
        const name = interaction.options.getString('name');
        const duration = ms(durationStr);

        if (!duration || duration < 10000) {
            return interaction.reply({ content: '❌ Invalid duration. Use formats like `10m`, `1h`.', flags: 64 });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎉 Giveaway: ${name}`)
            .setDescription(`React with 🎉 to enter!\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor((Date.now() + duration) / 1000)}:R>`)
            .setColor(0x00bfff)
            .setFooter({ text: `Hosted by ${interaction.user.tag}` })
            .setTimestamp();

        const msg = await channel.send({ embeds: [embed] });
        await msg.react('🎉');

        await Giveaway.create({
            messageId: msg.id,
            channelId: channel.id,
            guildId: interaction.guild.id,
            name,
            winners,
            endTime: new Date(Date.now() + duration),
            host: interaction.user.id,
            ended: false,
            entries: []
        });

    await interaction.reply({ content: `Giveaway created in ${channel} — [jump to message](${msg.url})`, flags: 64 });

    // For reliability, use a persistent scheduler in production
    const timeoutDelay = Math.max(0, duration);
    setTimeout(async () => {
            try {
                const giveaway = await Giveaway.findOne({ messageId: msg.id });
                if (!giveaway || giveaway.ended) return;

                const ch = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
                if (!ch || !ch.isTextBased()) return;

                const message = await ch.messages.fetch(giveaway.messageId).catch(() => null);
                if (!message) return;

                const reaction = message.reactions.cache.get('🎉');
                const users = reaction ? await reaction.users.fetch() : [];
                const entries = users.filter(u => !u.bot).map(u => u.id);

                if (entries.length === 0) {
                    await message.reply('No valid entries, no winners.');
                } else {
                    const shuffled = entries.sort(() => Math.random() - 0.5);
                    const winnerIds = shuffled.slice(0, giveaway.winners);
                    const winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');

                    const endEmbed = new EmbedBuilder()
                        .setTitle(`🎉 Giveaway Ended: ${giveaway.name}`)
                        .setDescription(`Winners: ${winnerMentions}\nThanks for participating!`)
                        .setColor(0x43b581)
                        .setFooter({ text: `Hosted by <@${giveaway.host}>` })
                        .setTimestamp();

                    await message.reply({ embeds: [endEmbed] });
                }

                giveaway.ended = true;
                giveaway.entries = entries;
                await giveaway.save();
            } catch (err) {
                // silent fail
            }
    }, timeoutDelay);
    }
};
