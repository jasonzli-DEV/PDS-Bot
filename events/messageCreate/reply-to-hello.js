module.exports = (message) => {
    if (message.author.bot) return; // Ignore bot messages

    if (message.content === 'hello') {
        message.reply('hii! :)')
    }
}