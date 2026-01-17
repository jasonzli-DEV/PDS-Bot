const mongoose = require('mongoose');

const PDSAccountSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  schoolHost: { type: String, required: true, default: 'providenceday.myschoolapp.com' },
  userId: { type: Number },
  cookies: { type: String },
  lastVerified: { type: Date },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PDSAccount', PDSAccountSchema);
