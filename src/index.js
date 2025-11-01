/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npx wrangler dev src/index.js` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npx wrangler publish src/index.js --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import OpenAI from "openai";

import {
    save_actual_transaction,
    message_category_budget,
    process_transaction,
} from "./actual";
import { sendMessage } from "./telegram";

async function convert_transaction(env, message) {
    const openai = new OpenAI({
        organization: env.OPENAI_ORG,
        apiKey: env.OPENAI_KEY,
    });
    const completion = await openai.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `把用户提供的信息，转换为一个 JSON 对象。
				{
"transaction": {
	"account_name": "", // 从数组中选择，无法匹配为空 ["xixi lady card", "xixi ocbc card", "xixi simplygo account", "yang simplygo account", "yang lady card", "yang uob one account", "xixi uob one account", "yang ocbc card", "yang trust card", "xixi trust card", "xixi yuu card", "alipay"]
	"category_name": "", // 消费类别，从数组中选择 [Entertainment, Education, Sports, Housing payment, Travel, Insurance, Tax Payment, Transport, SG shopping, CN shopping, Food, General, Family Bills, Savings, Income, Starting Balances]
	"amount": 0,  // 金额，消费为负数，收入为正数
	"payee_name": "", // 商家名称
	"notes":"" // 消费信息
}
}
				`,
            },
            { role: "user", content: message },
        ],
        model: "gpt-3.5-turbo",
        response_format: { type: "json_object" },
    });
    console.log(completion.choices[0].message.content);

    return completion.choices[0].message.content;
}

export default {
    async fetch(request, env, ctx) {
        let chatId = env.TG_CHAT_ID;
        try {
            // 验证 token，提高 worker 后端安全性
            try {
                let headers = parseHeaders(request);
                const secret_token = headers["x-telegram-bot-api-secret-token"];

                if (env.TG_SECRET_TOKEN === secret_token) {
                    console.log(`Authentication successful...`);
                } else {
                    console.log(
                        `Authentication failed with ${secret_token} recieved...`,
                    );
                    return new Response("Authentication failed, dropped.", {
                        status: 200,
                    });
                }
            } catch (e) {
                return new Response("dropped.", { status: 200 });
            }

            // 读取 request 内容
            const body = await request.json();
            console.log(body);
            if (body?.message?.chat?.id) {
                chatId = body.message.chat.id;
            }
            const text = body.message.text;
            console.log(`Message text: ${text}`);

            // 引用消息并回复关键字，则触发实际的记账操作
            if (
                text.toLowerCase().startsWith("save") ||
                text.toLowerCase().startsWith("确认")
            ) {
                // 记账，提交 API
                console.log(
                    `Found Reply Message: \n${body.message.reply_to_message.text}`,
                );
                const originalTransaction = JSON.parse(
                    body.message.reply_to_message.text,
                );
                const response = await save_actual_transaction(
                    env,
                    originalTransaction,
                );

                // 如果保存成功，则返回记账成功的提示，并查询相关的预算使用情况
                // 如果保存失败，则返回记账失败和错误信息
                const response_body = await readResponseBody(response);
                if (response.ok) {
                    await sendMessage(env, `记账成功！`, chatId);
                    const post_message = await message_category_budget(
                        env,
                        originalTransaction,
                    );
                    await sendMessage(env, post_message, chatId);
                } else {
                    await sendMessage(
                        env,
                        formatFailureMessage(response.status, response_body),
                        chatId,
                    );
                }

                return new Response("Transaction Saved.", { status: 200 });
            }

            // 对于其他提交的消息，分析可能的账务记录，转换为 Json
            await sendMessage(env, `报文识别转换中，请稍后……`, chatId);
            const transaction_base = await convert_transaction(env, text);
            //await sendMessage(env, message);
            console.log(`transaction_base: ${transaction_base}`);

            const transaction_json = process_transaction(
                JSON.parse(transaction_base),
            );
            console.log(
                `transaction_full: ${JSON.stringify(transaction_json)}`,
            );
            await sendMessage(
                env,
                JSON.stringify(transaction_json, null, 2),
                chatId,
            ); //, null, 2)

            return new Response("Completed.", { status: 200 });
        } catch (e) {
            const detailedError = errorToString(e);
            console.log(detailedError);
            await sendMessage(env, `出现未知错误：${detailedError}`, chatId);
            return new Response(detailedError, { status: 200 });
        }
    },
};

function parseHeaders(request) {
    let headers = {};
    let keys = new Map(request.headers).keys();
    let key;
    while ((key = keys.next().value)) {
        headers[key] = request.headers.get(key);
        //console.log(`key=[${key}],value=[${headers[key]}]`)
    }
    return headers;
}

function errorToString(e) {
    return JSON.stringify({
        message: e.message,
        stack: e.stack,
        from: "error worker",
    });
}

async function readResponseBody(response) {
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    if (!raw) {
        return raw;
    }
    if (contentType.includes("application/json")) {
        try {
            return JSON.parse(raw);
        } catch (parseError) {
            console.log(
                `Failed to parse JSON response: ${
                    parseError instanceof Error
                        ? parseError.message
                        : parseError
                }`,
            );
        }
    }
    return raw;
}

function formatFailureMessage(status, body) {
    const detail =
        typeof body === "string" && body.trim().length > 0
            ? body
            : JSON.stringify(body ?? {});
    return `记账失败（${status}）: ${detail}`;
}
