import { api, opendiscord } from "#opendiscord"
import * as discord from "discord.js"

import { TRANSCRIPT_COMMAND_ACTIONS, TRANSCRIPT_COMMAND_ID, TRANSCRIPT_PLUGIN_SERVICE_ID, TRANSCRIPT_STATUS_MESSAGE_ID } from "../contracts/constants"
import type { TranscriptAdminAction } from "../contracts/types"
import { resolveCommandRenderData } from "./resolve-command-render-data"

export function registerTranscriptCommands() {
    opendiscord.events.get("onSlashCommandLoad").listen((slash) => {
        slash.add(new api.ODSlashCommand(TRANSCRIPT_COMMAND_ID, {
            name: "transcript",
            description: "Manage local HTML transcripts.",
            type: discord.ApplicationCommandType.ChatInput,
            contexts: [discord.InteractionContextType.Guild],
            integrationTypes: [discord.ApplicationIntegrationType.GuildInstall],
            options: [
                {
                    type: discord.ApplicationCommandOptionType.String,
                    name: "action",
                    description: "The transcript action to run.",
                    required: true,
                    choices: TRANSCRIPT_COMMAND_ACTIONS.map((action) => ({ name: action, value: action }))
                },
                {
                    type: discord.ApplicationCommandOptionType.String,
                    name: "target",
                    description: "Transcript id, slug, ticket id, or channel id.",
                    required: true
                },
                {
                    type: discord.ApplicationCommandOptionType.String,
                    name: "reason",
                    description: "Optional reason for mutating actions.",
                    required: false
                }
            ]
        }))
    })

    opendiscord.events.get("onTextCommandLoad").listen((text) => {
        const generalConfig = opendiscord.configs.get("opendiscord:general")

        text.add(new api.ODTextCommand(TRANSCRIPT_COMMAND_ID, {
            name: "transcript",
            prefix: generalConfig.data.prefix,
            dmPermission: false,
            guildPermission: true,
            allowBots: false,
            options: [
                {
                    name: "action",
                    type: "string",
                    required: true,
                    allowSpaces: false,
                    choices: [...TRANSCRIPT_COMMAND_ACTIONS]
                },
                {
                    name: "target",
                    type: "string",
                    required: true,
                    allowSpaces: false
                },
                {
                    name: "reason",
                    type: "string",
                    required: false,
                    allowSpaces: true
                }
            ]
        }))
    })
}

export function registerTranscriptCommandResponder() {
    opendiscord.events.get("onCommandResponderLoad").listen((commands) => {
        const generalConfig = opendiscord.configs.get("opendiscord:general")

        commands.add(new api.ODCommandResponder(TRANSCRIPT_COMMAND_ID, generalConfig.data.prefix, "transcript"))
        commands.get(TRANSCRIPT_COMMAND_ID).workers.add([
            new api.ODWorker("ot-html-transcripts:transcript", 0, async (instance, _params, source, cancel) => {
                const { guild, channel, user, member } = instance

                if (!guild || channel.isDMBased()) {
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build(source, { channel, user }))
                    return cancel()
                }

                const permissionResult = await opendiscord.permissions.checkCommandPerms(
                    generalConfig.data.system.permissions.delete,
                    "support",
                    user,
                    member,
                    channel,
                    guild
                )

                if (!permissionResult.hasPerms) {
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build(source, { guild, channel, user, permissions: ["support"] }))
                    return cancel()
                }

                const action = instance.options.getString("action", true) as TranscriptAdminAction
                const target = instance.options.getString("target", true)
                const reason = instance.options.getString("reason", false)
                const service = opendiscord.plugins.classes.get(TRANSCRIPT_PLUGIN_SERVICE_ID)
                const renderData = await resolveCommandRenderData(service, action, target, reason)

                await instance.reply(await opendiscord.builders.messages.getSafe(TRANSCRIPT_STATUS_MESSAGE_ID).build(source, renderData))
            }),
            new api.ODWorker("ot-html-transcripts:logs", -1, async (instance, _params, source) => {
                const action = instance.options.getString("action", true)
                const target = instance.options.getString("target", true)
                const reason = instance.options.getString("reason", false)

                opendiscord.log(instance.user.displayName + " used the 'transcript' command.", "plugin", [
                    { key: "user", value: instance.user.username },
                    { key: "userid", value: instance.user.id, hidden: true },
                    { key: "channelid", value: instance.channel.id, hidden: true },
                    { key: "method", value: source },
                    { key: "action", value: action },
                    { key: "target", value: target },
                    { key: "reason", value: reason ?? "/" }
                ])
            })
        ])
    })
}
