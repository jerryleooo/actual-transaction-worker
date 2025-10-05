
export async function sendMessage(env, text, chatId) {
    const targetChatId = chatId ?? env.TG_CHAT_ID;
    console.log(`sending ${text} to ${targetChatId}`);
    return await fetch(
        `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                method: "post",
                text: text,
                chat_id: targetChatId,
                //parse_mode: "Markdown",
            }),
        }
    );
}
