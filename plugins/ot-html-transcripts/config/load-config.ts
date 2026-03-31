import { api } from "#opendiscord"

import type { OTHtmlTranscriptsConfigData } from "../contracts/types"
import { TRANSCRIPT_PLUGIN_CONFIG_ID } from "../contracts/constants"

export class OTHtmlTranscriptsConfig extends api.ODJsonConfig {
    declare data: OTHtmlTranscriptsConfigData
}

export function createTranscriptPluginConfig() {
    return new OTHtmlTranscriptsConfig(TRANSCRIPT_PLUGIN_CONFIG_ID, "config.json", "./plugins/ot-html-transcripts/")
}
