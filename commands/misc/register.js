const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const PDSAccount = require('../../schemas/PDSAccount');
const { decodeToken, verifySession, defaultHost } = require('./pdsUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register your PDS/MySchoolApp account by pasting the bookmarklet token (or open modal)')
    .addStringOption(opt =>
      opt.setName('token')
        .setDescription('Paste the base64 token from the bookmarklet')
        .setRequired(false)
    ),

  async execute(interaction) {
    // If token option not provided, open a modal to let user paste it
    const provided = interaction.options.getString('token', false);
    if (!provided) {
      const modal = new ModalBuilder()
        .setCustomId('pds_register_modal')
        .setTitle('Register PDS Account');

      const tokenInput = new TextInputBuilder()
        .setCustomId('pds_token_input')
        .setLabel('Paste bookmarklet token')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Paste the full base64 token here')
        .setRequired(true);

      modal.addComponents({ type: 1, components: [tokenInput] });

      try {
        await interaction.showModal(modal);
        return;
      } catch (err) {
        console.error('Failed to show modal:', err);
        await interaction.reply({ content: 'Failed to open modal. Please provide token as `/register token:<token>`', ephemeral: true });
        return;
      }
    }

    await interaction.deferReply({ ephemeral: true });
    const token = provided.trim();
    const decoded = decodeToken(token);
    if (!decoded || (!decoded.cookies && !decoded.cookies.length)) {
      return interaction.editReply({ content: 'Invalid token. Make sure you copied the full token from the bookmarklet.' });
    }

    const cookies = decoded.cookies;
    const userIdFromToken = decoded.userId || decoded.UserId || decoded.userId;
    const host = process.env.PDS_HOST || defaultHost;

    const verify = await verifySession(host, cookies, userIdFromToken);
    if (!verify.ok) {
      const reason = verify.status ? `status ${verify.status}` : (verify.error ? 'network error' : 'unknown');
      return interaction.editReply({ content: `Failed to verify token (${reason}). Make sure you are logged into MySchoolApp and the token is from the correct site.` });
    }

    const userId = userIdFromToken || verify.json?.UserInfo?.UserId;

    // Upsert account
    try {
      const filter = { discordId: interaction.user.id };
      const update = {
        discordId: interaction.user.id,
        schoolHost: host,
        userId: Number(userId),
        cookies,
        lastVerified: new Date(),
        updatedAt: new Date()
      };
      await PDSAccount.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });

      const embed = new EmbedBuilder()
        .setTitle('✅ Registered Successfully')
        .setDescription('Your PDS account has been saved. You can now use `/schedule`, `/assignments`, and other PDS commands.')
        .setColor(0x00FF00);

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Register error:', err);
      return interaction.editReply({ content: 'Failed to save your account. Please try again later.' });
    }
  }
};

// Handle modal submissions
module.exports.handleRegisterModalSubmit = async function(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const token = interaction.fields.getTextInputValue('pds_token_input').trim();
    const decoded = decodeToken(token);
    if (!decoded || (!decoded.cookies && !decoded.cookies.length)) {
      return interaction.editReply({ content: 'Invalid token. Make sure you copied the full token from the bookmarklet.' });
    }

    const cookies = decoded.cookies;
    const userIdFromToken = decoded.userId || decoded.UserId || decoded.userId;
    const host = process.env.PDS_HOST || defaultHost;

    const verify = await verifySession(host, cookies, userIdFromToken);
    if (!verify.ok) {
      const reason = verify.status ? `status ${verify.status}` : (verify.error ? 'network error' : 'unknown');
      return interaction.editReply({ content: `Failed to verify token (${reason}). Make sure you are logged into MySchoolApp and the token is from the correct site.` });
    }

    const userId = userIdFromToken || verify.json?.UserInfo?.UserId;

    const PDSAccount = require('../../schemas/PDSAccount');
    const filter = { discordId: interaction.user.id };
    const update = {
      discordId: interaction.user.id,
      schoolHost: host,
      userId: Number(userId),
      cookies,
      lastVerified: new Date(),
      updatedAt: new Date()
    };
    await PDSAccount.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });

    const embed = new EmbedBuilder()
      .setTitle('✅ Registered Successfully')
      .setDescription('Your PDS account has been saved. You can now use `/schedule`, `/assignments`, and other PDS commands.')
      .setColor(0x00FF00);

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Modal register error:', err);
    try { await interaction.editReply({ content: 'Failed to register from modal.' }); } catch {}
  }
};
