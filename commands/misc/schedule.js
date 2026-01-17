const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const PDSAccount = require('../../schemas/PDSAccount');
const { verifySession, renewSession, defaultHost } = require('./pdsUtils');

async function fetchWithRenew(account, path) {
  const host = account.schoolHost || defaultHost;
  const url = `https://${host}${path}`;

  let res = await fetch(url, { headers: { Cookie: account.cookies, Accept: 'application/json' } });

  if (res.status === 401 || res.status === 403 || !res.ok) {
    // Try renewing session
    const renewal = await renewSession(account.cookies);
    if (renewal.ok && renewal.cookies) {
      account.cookies = renewal.cookies;
      account.lastVerified = new Date();
      await account.save();
      res = await fetch(url, { headers: { Cookie: account.cookies, Accept: 'application/json' } });
    }
  }

  return res;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Show your current schedule from MySchoolApp (PDS).'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const account = await PDSAccount.findOne({ discordId: interaction.user.id });
    if (!account) {
      return interaction.editReply({ content: 'You are not registered. Use `/register` and paste the token from the bookmarklet.' });
    }

    // Verify current session quickly
    const v = await verifySession(account.schoolHost, account.cookies);
    if (!v.ok) {
      const renewed = await renewSession(account.cookies);
      if (renewed.ok && renewed.cookies) {
        account.cookies = renewed.cookies;
        account.lastVerified = new Date();
        await account.save();
      } else {
        return interaction.editReply({ content: 'Session appears invalid and could not be renewed. Please run `/register` again.' });
      }
    }

    // Fetch classes / schedule
    try {
      const userId = account.userId;
      const ts = Date.now();
      const path = `/api/datadirect/ParentStudentUserClassesGet?userId=${userId}&personaId=2&ts=${ts}`;

      const res = await fetchWithRenew(account, path);
      if (!res || !res.ok) {
        return interaction.editReply({ content: 'Failed to fetch schedule. Try re-registering or try again later.' });
      }

      const json = await res.json();

      // Try to build a readable schedule
      let description = '';
      if (Array.isArray(json) && json.length) {
        const items = json.slice(0, 25).map((c, i) => {
          const title = c.CourseName || c.ClassName || c.Name || c.Title || JSON.stringify(c).slice(0, 40);
          const teacher = c.PrimaryTeacherName || c.TeacherName || c.Teacher || '';
          return `**${i+1}.** ${title}${teacher ? ` — ${teacher}` : ''}`;
        });
        description = items.join('\n');
      } else if (json && typeof json === 'object') {
        // If wrapped
        const arr = json.Items || json.classes || json.ClassList || [];
        if (Array.isArray(arr) && arr.length) {
          description = arr.slice(0, 25).map((c, i) => `**${i+1}.** ${c.CourseName || c.Name || JSON.stringify(c).slice(0,40)}`).join('\n');
        } else {
          description = 'No schedule data found.';
        }
      } else {
        description = 'No schedule data found.';
      }

      const embed = new EmbedBuilder()
        .setTitle('📅 Your Schedule')
        .setDescription(description || 'No schedule items available.')
        .setColor(0x5865F2)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Schedule error:', err);
      return interaction.editReply({ content: 'An error occurred while fetching your schedule.' });
    }
  }
};
