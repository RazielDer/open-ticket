import { api, opendiscord } from "#opendiscord"

import { TRANSCRIPT_STATUS_EMBED_ID, TRANSCRIPT_STATUS_MESSAGE_ID } from "../contracts/constants"

export function registerTranscriptCommandMessages() {
    opendiscord.events.get("onMessageBuilderLoad").listen((messages) => {
        messages.add(new api.ODMessage(TRANSCRIPT_STATUS_MESSAGE_ID))
        messages.get(TRANSCRIPT_STATUS_MESSAGE_ID).workers.add(
            new api.ODWorker("ot-html-transcripts:command-status", 0, async (instance, params, source) => {
                instance.addEmbed(await opendiscord.builders.embeds.getSafe(TRANSCRIPT_STATUS_EMBED_ID).build(source, params))
                if (source == "slash") instance.setEphemeral(true)
            })
        )
    })
}
