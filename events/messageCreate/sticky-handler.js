const Sticky = require('../../schemas/Sticky');

module.exports = async (message) => {
  if (message.author.bot) return;
  const channelId = message.channel.id;
  // Get all stickies for this channel, sorted oldest to newest
  const stickies = await Sticky.find({ channelId }).sort({ createdAt: 1 });
  if (!stickies.length) return;

  // For each sticky, delete the old sticky message if it exists, then resend
  for (const sticky of stickies) {
    try {
      const oldMsg = await message.channel.messages.fetch(sticky.messageId);
      await oldMsg.delete();
    } catch (e) {}
    // Send the sticky again
    const sent = await message.channel.send(sticky.content);
    // Update the sticky's messageId in DB
    sticky.messageId = sent.id;
    await sticky.save();
  }
};
