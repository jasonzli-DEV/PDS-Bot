const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('Get info or link for a GitHub repository')
        .addStringOption(opt =>
            opt.setName('repo')
                .setDescription('Repository name (owner/repo or just repo)')
                .setRequired(true)
        ),

    async execute(interaction) {
        console.log(`[github] execute invoked by ${interaction.user.tag} in guild ${interaction.guildId}`);
        const start = Date.now();
        await interaction.deferReply();
        const repoInput = interaction.options.getString('repo').trim();
        let owner, repo;

        // Accept multiple formats:
        // - owner/repo
        // - https://github.com/owner/repo
        // - http://github.com/owner/repo
        // - git@github.com:owner/repo.git
        // - github.com/owner/repo
        const urlPattern = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+?)\/(.+?)(?:\.git)?(?:\/.*)?$/i;
        const sshPattern = /^git@github\.com:(.+?)\/(.+?)(?:\.git)?$/i;

        let m = repoInput.match(urlPattern);
        if (m) {
            owner = m[1];
            repo = m[2];
        } else {
            m = repoInput.match(sshPattern);
            if (m) {
                owner = m[1];
                repo = m[2];
            } else if (repoInput.includes('/')) {
                [owner, repo] = repoInput.split('/');
            } else {
                // Default to the requested repo, or fallback to PDS-Bot
                owner = 'jasonzli-DEV';
                repo = 'PDS-Bot';
            }
        }

        // Trim possible .git or trailing slashes from repo
        repo = repo.replace(/\.git$/i, '').replace(/\/+$/i, '');
        owner = owner.replace(/\/+$/i, '');

        const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
        try {
            const res = await fetch(apiUrl);
            if (!res.ok) throw new Error('Repo not found');
            const data = await res.json();

            const embed = new EmbedBuilder()
                .setTitle(data.full_name || `${owner}/${repo}`)
                .setURL(data.html_url || `https://github.com/${owner}/${repo}`)
                .setDescription(data.description || 'No description')
                .setColor(0x24292e)
                .setFooter({ text: 'GitHub', iconURL: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png' })
                .addFields(
                    { name: 'Stars', value: String(data.stargazers_count || 0), inline: true },
                    { name: 'Forks', value: String(data.forks_count || 0), inline: true },
                    { name: 'Open Issues', value: String(data.open_issues_count || 0), inline: true },
                    { name: 'Language', value: data.language || 'N/A', inline: true },
                    { name: 'License', value: data.license?.name || 'None', inline: true },
                    { name: 'Last Updated', value: `<t:${Math.floor(new Date(data.updated_at).getTime()/1000)}:R>`, inline: true }
                );

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('[github] fetch error:', err);
            await interaction.editReply({ content: `❌ Could not fetch details for ${owner}/${repo}.` });
        } finally {
            console.log(`[github] finished in ${Date.now() - start}ms`);
        }
    }
};
