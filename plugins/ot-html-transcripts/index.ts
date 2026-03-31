import { api, opendiscord, utilities } from "#opendiscord"

import { registerTranscriptCommands, registerTranscriptCommandResponder } from "./commands/transcript-command"
import { registerLocalHtmlTranscriptCompiler } from "./compiler/html-compiler"
import { registerWrappedTextTranscriptCompiler } from "./compiler/text-compiler"
import { TRANSCRIPT_COMMAND_ID, TRANSCRIPT_PLUGIN_CONFIG_ID, TRANSCRIPT_PLUGIN_ID, TRANSCRIPT_PLUGIN_SERVICE_ID, TRANSCRIPT_STATUS_EMBED_ID, TRANSCRIPT_STATUS_MESSAGE_ID } from "./contracts/constants"
import type { TranscriptCommandRenderData } from "./contracts/types"
import { createTranscriptPluginConfig, OTHtmlTranscriptsConfig } from "./config/load-config"
import { registerTranscriptPluginChecker } from "./config/register-checker"
import { emitTranscriptDeploymentWarnings } from "./config/deployment-warnings"
import { registerDashboardTranscriptWorkbench } from "./dashboard-workbench"
import { registerTranscriptCommandEmbeds } from "./responses/embeds"
import { registerTranscriptCommandMessages } from "./responses/messages"
import { OTHtmlTranscriptService } from "./service/transcript-service"

if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

declare module "#opendiscord-types" {
    export interface ODPluginManagerIds_Default {
        "ot-html-transcripts": api.ODPlugin
    }
    export interface ODConfigManagerIds_Default {
        "ot-html-transcripts:config": OTHtmlTranscriptsConfig
    }
    export interface ODCheckerManagerIds_Default {
        "ot-html-transcripts:config": api.ODChecker
    }
    export interface ODPluginClassManagerIds_Default {
        "ot-html-transcripts:service": OTHtmlTranscriptService
    }
    export interface ODSlashCommandManagerIds_Default {
        "ot-html-transcripts:transcript": api.ODSlashCommand
    }
    export interface ODTextCommandManagerIds_Default {
        "ot-html-transcripts:transcript": api.ODTextCommand
    }
    export interface ODCommandResponderManagerIds_Default {
        "ot-html-transcripts:transcript": { source: "slash" | "text"; params: {}; workers: "ot-html-transcripts:transcript" | "ot-html-transcripts:logs" }
    }
    export interface ODEmbedManagerIds_Default {
        "ot-html-transcripts:command-status": { source: "slash" | "text" | "other"; params: TranscriptCommandRenderData; workers: "ot-html-transcripts:command-status" }
    }
    export interface ODMessageManagerIds_Default {
        "ot-html-transcripts:command-status": { source: "slash" | "text" | "other"; params: TranscriptCommandRenderData; workers: "ot-html-transcripts:command-status" }
    }
}

opendiscord.events.get("onPluginClassLoad").listen((classes) => {
    classes.add(new OTHtmlTranscriptService(TRANSCRIPT_PLUGIN_SERVICE_ID))
})

opendiscord.events.get("onConfigLoad").listen((configs) => {
    configs.add(createTranscriptPluginConfig())
})

registerTranscriptPluginChecker()
registerTranscriptCommandEmbeds()
registerTranscriptCommandMessages()
registerTranscriptCommands()
registerTranscriptCommandResponder()
registerWrappedTextTranscriptCompiler()
registerLocalHtmlTranscriptCompiler()
registerDashboardTranscriptWorkbench(opendiscord as any)

opendiscord.events.get("onReadyForUsage").listen(async () => {
    registerDashboardTranscriptWorkbench(opendiscord as any)
    const config = opendiscord.configs.get(TRANSCRIPT_PLUGIN_CONFIG_ID)
    const service = opendiscord.plugins.classes.get(TRANSCRIPT_PLUGIN_SERVICE_ID)
    await service.initialize(config.data)
    emitTranscriptDeploymentWarnings(config.data, (warning) => {
        opendiscord.log(`OT HTML Transcripts deployment warning: ${warning.message}`, "plugin", [
            { key: "plugin", value: TRANSCRIPT_PLUGIN_ID },
            { key: "warning", value: warning.code }
        ])
    })

    opendiscord.log("Loaded ot-html-transcripts local transcript service.", "plugin", [
        { key: "plugin", value: TRANSCRIPT_PLUGIN_ID },
        { key: "config", value: TRANSCRIPT_PLUGIN_CONFIG_ID },
        { key: "command", value: TRANSCRIPT_COMMAND_ID },
        { key: "message", value: TRANSCRIPT_STATUS_MESSAGE_ID },
        { key: "embed", value: TRANSCRIPT_STATUS_EMBED_ID }
    ])
})
