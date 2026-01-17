const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const PDSAccount = require('../../schemas/PDSAccount');
const { verifySession, renewSession, defaultHost } = require('./pdsUtils');

function extractRequestTokenFromCookies(cookies) {
  if (!cookies) return null;
  const m = cookies.match(/__RequestVerificationToken[^=]*=([^;\s]+)/);
  if (m && m[1]) return decodeURIComponent(m[1]);
  return null;
}

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
      // Try schedule endpoints that work in browser (use cookies + request token if available)
      const host = account.schoolHost || defaultHost;
      // preferred: announcements for current day
      const viewerId = account.userId;
      const viewerPersonaId = 2;
      // try to get a request token from context or cookies
      let requestToken = null;
      try { requestToken = (v && v.json && (v.json.RequestVerificationToken || v.json.RequestToken)) || null; } catch (e) { requestToken = null; }
      if (!requestToken) requestToken = extractRequestTokenFromCookies(account.cookies);

      // endpoints to try (in order)
      const endpoints = [
        `/api/schedule/ScheduleCurrentDayAnnouncmentParentStudent/?mydayDate=&viewerId=${viewerId}&viewerPersonaId=${viewerPersonaId}`,
        `/api/schedule/MyDayCalendarStudentList/?scheduleDate=&personaId=${viewerPersonaId}`
      ];

      let json = null;
      let res = null;
      for (const ep of endpoints) {
        const path = ep + (requestToken ? (ep.includes('?') ? `&t=${encodeURIComponent(requestToken)}` : `?t=${encodeURIComponent(requestToken)}`) : '');
        res = await fetchWithRenew(account, path);
        if (res && res.ok) {
          try { json = await res.json(); } catch (e) { json = null; }
          if (json) break; // got data
        }
      }

      if (!res || !res.ok || !json) {
        return interaction.editReply({ content: 'Failed to fetch schedule. Try re-registering or try again later.' });
      }

      // Try to build a readable schedule
      let description = '';
      // Parse schedule JSON: support multiple shapes
      if (Array.isArray(json) && json.length) {
        const items = json.slice(0, 25).map((c, i) => {
          const title = c.Title || c.Text || c.CourseName || c.Name || JSON.stringify(c).slice(0, 40);
          const when = c.Date || c.ScheduleDate || '';
          return `**${i+1}.** ${title}${when ? ` — ${when}` : ''}`;
        });
        description = items.join('\n');
      } else if (json && typeof json === 'object') {
        // Check common properties
        // announcements list
        let arr = json.Announcements || json.items || json.Items || json.Events || json.Calendar || json.CalendarItems || json;
        if (arr && !Array.isArray(arr)) {
          // try some nested patterns
          if (Array.isArray(arr.Announcements)) arr = arr.Announcements;
          else if (Array.isArray(arr.Items)) arr = arr.Items;
          else if (Array.isArray(arr.events)) arr = arr.events;
        }
        if (Array.isArray(arr) && arr.length) {
          description = arr.slice(0, 25).map((c, i) => {
            const title = c.Title || c.Text || c.CourseName || c.Name || JSON.stringify(c).slice(0, 40);
            const when = c.Date || c.ScheduleDate || c.StartDate || '';
            return `**${i+1}.** ${title}${when ? ` — ${when}` : ''}`;
          }).join('\n');
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
