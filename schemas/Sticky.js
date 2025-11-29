const mongoose = require('mongoose');

const StickySchema = new mongoose.Schema({
  channelId: { type: String, required: true },
  messageId: { type: String, required: true }, // The ID of the sticky message sent by the bot
  content: { type: String, required: true },
  authorId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Sticky', StickySchema);