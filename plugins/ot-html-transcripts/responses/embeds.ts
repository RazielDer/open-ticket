import { api, opendiscord } from "#opendiscord"

import { TRANSCRIPT_STATUS_EMBED_ID } from "../contracts/constants"

export function registerTranscriptCommandEmbeds() {
    opendiscord.events.get("onEmbedBuilderLoad").listen((embeds) => {
        embeds.add(new api.ODEmbed(TRANSCRIPT_STATUS_EMBED_ID))
        embeds.get(TRANSCRIPT_STATUS_EMBED_ID).workers.add(
            new api.ODWorker("ot-html-transcripts:command-status", 0, async (instance, params) => {
                const { action, ok, status, message, reason, transcript, url, target } = params

                instance.setTitle("Transcript " + action)
                instance.setColor(status == "ok" ? "Green" : status == "not-ready" ? "Yellow" : "Red")
                instance.setDescription(message)
                instance.addFields({ name: "Target", value: "```" + target + "```", inline: false })
                instance.addFields({ name: "Result", value: "```" + status + "```", inline: true })

                if (transcript) {
                    instance.addFields({ name: "Transcript Id", value: "```" + transcript.id + "```", inline: true })
                    instance.addFields({ name: "Status", value: "```" + transcript.status + "```", inline: true })
                    if (transcript.ticketId) instance.addFields({ name: "Ticket Id", value: "```" + transcript.ticketId + "```", inline: true })
                    if (transcript.channelId) instance.addFields({ name: "Channel Id", value: "```" + transcript.channelId + "```", inline: true })
                    instance.addFields({ name: "Warnings", value: "```" + String(transcript.warningCount) + "```", inline: true })
                    if (url) instance.addFields({ name: "URL", value: url, inline: false })
                }

                if (reason) instance.addFields({ name: "Reason", value: "```" + reason + "```", inline: false })
                if (!ok && !transcript) instance.setFooter("Resolution used transcript id, slug, ticket id, then channel id.")
            })
        )
    })
}
