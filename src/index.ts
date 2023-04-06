import {Cloudflare} from "./cloudflare"
import { InteractionResponseFlags, InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import { Discord } from "./discord";
import { DISCORD_COMMANDS } from "./commands";
import { BingAI } from './bingai';

export interface Env {
	BINGAI_SYDNEY_DISCORD_BOT_KV: KVNamespace
	DISCORD_PUBLIC_KEY: string
	DISCORD_APPLICATION_ID: string
	DISCORD_TOKEN: string
	DISCORD_USERID_WHITELIST: string
	BING_COOKIE: string
	BING_CONVERSATION_STYLE: string
	BING_BEHAVIOR: string
}

enum CIRCLES {
	"RED" = "🔴",
	"AMBER" = "🟡",
	"GREEN" = "🟢"
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		// verify request came from Discord
		const signature = request.headers.get('x-signature-ed25519');
		const timestamp = request.headers.get('x-signature-timestamp');
		if (!signature || !timestamp) {
			return Discord.generateResponse({
				error: "Unauthorized"
			}, {
				status: 401,
			})
		}
		const body = await request.clone().arrayBuffer();
		const isValidRequest = verifyKey(
			body,
			signature,
			timestamp,
			env.DISCORD_PUBLIC_KEY
		);
		if (!isValidRequest) {
			return Discord.generateResponse({
				error: "Unauthorized"
			}, {
				status: 401,
			})
		}

		const message: Discord.Interaction = await request.json()

		const chatID: string = message.channel_id || message.user?.id || "-1"

		// user is not in whitelist
		const userID: string = message.member?.user?.id || message.user?.id || "-1"
		if (env.DISCORD_USERID_WHITELIST && !env.DISCORD_USERID_WHITELIST.split(" ").includes(userID)) {
			return Discord.generateResponse({
				error: "Unauthorized"
			}, {
				status: 401,
			})
		}

		if (message.type === InteractionType.PING) {
			return Discord.generateResponse({
				type: InteractionResponseType.PONG,
			})
		}

		if (message.type === InteractionType.APPLICATION_COMMAND) {
			switch (message.data.name.toLowerCase()) {
				case DISCORD_COMMANDS.BINGAI_COMMAND.name.toLowerCase():
				case DISCORD_COMMANDS.SYDNEY_COMMAND.name.toLowerCase(): {
					// join all arguments
					const query = message.data.options?.map((option) => option.value).join(" ") || ""
					if (query.trim() == "") {
						return Discord.generateResponse({
							type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: "Please provide a query",
								flags: InteractionResponseFlags.EPHEMERAL,
							}
						})
					}

					// send response to Discord once ready
					ctx.waitUntil(new Promise(async _ => {
						let content: string
						const session = await Cloudflare.getKV(env.BINGAI_SYDNEY_DISCORD_BOT_KV, chatID) || await BingAI.createConversation(env.BING_COOKIE)
						if (typeof session !== "string") {
							let response = await BingAI.complete(session, env.BING_CONVERSATION_STYLE, env.BING_BEHAVIOR, query)
							if (typeof response !== "string") {
								content = BingAI.extractBody(response)
								content += "\n\n"
								if (response.item.throttling.numUserMessagesInConversation < response.item.throttling.maxNumUserMessagesInConversation) {
									if (!session.expiry)
										session.expiry = Math.round(Date.now() / 1000) + 18000 // conversations expire after 6h (or 21600 seconds, delete at 5 hours or 18000 seconds to be safer)
									session.currentIndex = response.item.throttling.numUserMessagesInConversation
									await Cloudflare.putKV(env.BINGAI_SYDNEY_DISCORD_BOT_KV, chatID, session, session.expiry)
									const percent = response.item.throttling.numUserMessagesInConversation / response.item.throttling.maxNumUserMessagesInConversation
									content += `${percent < 0.9 ? CIRCLES.GREEN : CIRCLES.AMBER} ${response.item.throttling.numUserMessagesInConversation} of ${response.item.throttling.maxNumUserMessagesInConversation} messages left before my head needs clearing.`
									content += `\n⌛ I will forget about this conversation in ${Math.round((session.expiry - Math.round(Date.now() / 1000)) / 60)} minutes as well.`
								} else {
									await Cloudflare.deleteKV(env.BINGAI_SYDNEY_DISCORD_BOT_KV, chatID)
									content += `️${CIRCLES.RED} I have reached my memory limit of ${response.item.throttling.maxNumUserMessagesInConversation} messages. Going ahead to clear my head now!`
								}
							} else {
								content = response
							}
						} else {
							content = session
						}

						await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${message.token}/messages/@original`, {
							method: "PATCH",
							headers: {
								"Content-Type": "application/json;charset=UTF-8",
							},
							body: JSON.stringify({
								content: `> ${query}`,
								embeds: [{description: content}]
							})
						})
					}))

					// immediately respond an acknowledgement first
					return Discord.generateResponse({
						type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
					})
				}
				case DISCORD_COMMANDS.CLEAR_COMMAND.name.toLowerCase(): {
					await Cloudflare.deleteKV(env.BINGAI_SYDNEY_DISCORD_BOT_KV, chatID)
					return Discord.generateResponse({
						type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							content: "Thanks for wiping my memory, I'm ready to start a new conversation!"
						}
					})
				}
				case DISCORD_COMMANDS.INVITE_COMMAND.name.toLowerCase(): {
					const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_APPLICATION_ID}&permissions=2147485696&scope=bot`;
					return Discord.generateResponse({
						type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							content: INVITE_URL,
							flags: InteractionResponseFlags.EPHEMERAL
						}
					})
				}
				default: {
					return Discord.generateResponse({
						error: "Unknown command"
					}, {
						status: 400,
					})
				}
			}
		}

		return Discord.generateResponse({
			error: "Unexpected error"
		}, {
			status: 500,
		})
	}
}
