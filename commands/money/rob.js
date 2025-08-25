const { SlashCommandBuilder } = require('discord.js');
const UserProfile = require('../../schemas/UserProfile');
const RobCooldown = require('../../schemas/RobCooldown');
const Cooldown = require('../../schemas/Cooldown');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Attempt to rob another user!')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user you want to rob')
                .setRequired(true)
        ),
    async execute(interaction) {
        const robberId = interaction.user.id;
        const guildId = interaction.guild.id;
        const targetUser = interaction.options.getUser('target');
        const targetId = targetUser.id;

        if (robberId === targetId) {
            return interaction.reply({ content: "You can't rob yourself!", ephemeral: true });
        }

        let robCooldown = await RobCooldown.findOne({ robberId, targetId, guildId });
        const now = new Date();
        if (robCooldown && now < robCooldown.endsAt) {
            const remaining = Math.ceil((robCooldown.endsAt - now) / 1000);
            return interaction.reply({ content: `You must wait ${Math.ceil(remaining/60)} more minutes before robbing this user again.`, ephemeral: true });
        }

        let cooldown = await Cooldown.findOne({ userID: robberId, commandName: 'rob' });
        if (cooldown && now < cooldown.endsAt) {
            const remaining = Math.ceil((cooldown.endsAt - now) / 1000);
            return interaction.reply({ content: `You must wait ${Math.ceil(remaining/60)} more minutes before trying to rob again.`, ephemeral: true });
        }

        let robberProfile = await UserProfile.findOne({ userId: robberId, guildId });
        let targetProfile = await UserProfile.findOne({ userId: targetId, guildId });

        if (!targetProfile || targetProfile.balance < 10000) {
            return interaction.reply({ content: "That user must have at least 10,000 to be robbed!", ephemeral: true });
        }

        if (!robberProfile) {
            robberProfile = new UserProfile({ userId: robberId, guildId, balance: 0 });
            await robberProfile.save();
        }

        if (Math.random() < 0.4) {
            const stolen = Math.floor(targetProfile.balance / 2);
            targetProfile.balance -= stolen;
            robberProfile.balance += stolen;

            if (!robCooldown) {
                robCooldown = new RobCooldown({ robberId, targetId, guildId });
            }
            robCooldown.endsAt = new Date(Date.now() + 10 * 60 * 1000);

            await Promise.all([robberProfile.save(), targetProfile.save(), robCooldown.save()]);

            console.log(`[ROB] ${interaction.user.tag} robbed ${targetUser.tag} and stole ${stolen} in ${interaction.guild.name}`);
            return interaction.reply({
                content: `💸 Success! You stole **${stolen}** from <@${targetId}>!`,
                allowedMentions: { users: [] }
            });
        } else {
            const penalty = Math.floor(robberProfile.balance * 0.2);
            robberProfile.balance -= penalty;
            targetProfile.balance += penalty;

            if (!cooldown) {
                cooldown = new Cooldown({ userID: robberId, commandName: 'rob' });
            }
            cooldown.endsAt = new Date(Date.now() + 5 * 60 * 1000);

            await Promise.all([robberProfile.save(), targetProfile.save(), cooldown.save()]);

            console.log(`[ROB] ${interaction.user.tag} failed to rob ${targetUser.tag} and paid ${penalty} in ${interaction.guild.name}`);
            return interaction.reply({
                content: `❌ You failed to rob <@${targetId}>! You paid them **${penalty}** as a penalty.`,
                allowedMentions: { users: [] }
            });
        }
    }
};