module.exports = (message) => {
    if (message.author.bot) return; // Ignore bot messages

    const content = message.content.toLowerCase();
    if (content === "hello" || content === "hi" || content === "hii") {
        message.reply("hii! :)");
    }
}