const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID;
const MANAGER_ROLE_ID = process.env.MANAGER_ROLE_ID;
const MODERATOR_ROLE_ID = process.env.MODERATOR_ROLE_ID;

function getRoleLevel(member) {
    if (member.roles.cache.has(OWNER_ROLE_ID)) return 3;
    if (member.roles.cache.has(MANAGER_ROLE_ID)) return 2;
    if (member.roles.cache.has(MODERATOR_ROLE_ID)) return 1;
    return 0;
}

function getRoleLevelById(roleId) {
    if (roleId === OWNER_ROLE_ID) return 3;
    if (roleId === MANAGER_ROLE_ID) return 2;
    if (roleId === MODERATOR_ROLE_ID) return 1;
    return 0;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Add or remove a role from a user.')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a role to a user.')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('User to add the role to')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role to add')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a role from a user.')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('User to remove the role from')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role to remove')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
            // Only allow this command in servers
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ This command can only be used in a server.',
                    flags: 64
                });
            }
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('target');
        const role = interaction.options.getRole('role');
        const executor = interaction.member;
        const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!target) {
            return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }
        if (!role.editable) {
            return interaction.reply({ content: 'I cannot manage this role.', ephemeral: true });
        }

        const executorLevel = getRoleLevel(executor);
        const targetLevel = getRoleLevel(target);
        const roleLevel = getRoleLevelById(role.id);

        if (executorLevel === 0) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }
        // Only allow adding/removing roles lower than executor's level
        if (executorLevel <= roleLevel || executorLevel <= targetLevel) {
            return interaction.reply({ content: 'You can only manage roles and users with a lower role than yourself.', ephemeral: true });
        }

        try {
            if (subcommand === 'add') {
                if (target.roles.cache.has(role.id)) {
                    return interaction.reply({ content: 'User already has this role.', ephemeral: true });
                }
                await target.roles.add(role);
                console.log(`[ROLE] ${interaction.user.tag} added role ${role.name} to ${targetUser.tag}`);
                await interaction.reply({ content: `✅ Added ${role} to <@${targetUser.id}>.` });
            } else if (subcommand === 'remove') {
                if (!target.roles.cache.has(role.id)) {
                    return interaction.reply({ content: 'User does not have this role.', ephemeral: true });
                }
                await target.roles.remove(role);
                console.log(`[ROLE] ${interaction.user.tag} removed role ${role.name} from ${targetUser.tag}`);
                await interaction.reply({ content: `✅ Removed ${role} from <@${targetUser.id}>.` });
            }
        } catch (error) {
            console.error(`[ROLE] Error managing role ${role.name} for ${targetUser.tag}:`, error);
            await interaction.reply({ content: 'Failed to manage the role.', ephemeral: true });
        }
    }
};