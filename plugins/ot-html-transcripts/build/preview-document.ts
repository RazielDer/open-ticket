import type {
    LocalTranscriptActor,
    LocalTranscriptAttachment,
    LocalTranscriptButtonComponent,
    LocalTranscriptDocument,
    LocalTranscriptDropdownOption,
    LocalTranscriptEmbed,
    LocalTranscriptMessage,
    LocalTranscriptReaction,
    LocalTranscriptReply
} from "../contracts/document"
import type { TranscriptHtmlStyleDraft } from "../contracts/types"
import { mapTranscriptHtmlStyleDraft } from "./style-mapper"
import { createDefaultTicketPlatformMetadata } from "../../../src/core/api/openticket/ticket-platform"

const PREVIEW_TIMESTAMPS = {
    generatedAt: "2026-03-27T15:45:00.000Z",
    createdOn: Date.parse("2026-03-27T14:12:00.000Z"),
    claimedOn: Date.parse("2026-03-27T14:24:00.000Z"),
    closedOn: Date.parse("2026-03-27T15:40:00.000Z"),
    pinnedOn: Date.parse("2026-03-27T14:31:00.000Z"),
    deletedOn: Date.parse("2026-03-27T15:45:00.000Z"),
    messageOne: Date.parse("2026-03-27T14:16:00.000Z"),
    messageTwo: Date.parse("2026-03-27T14:28:00.000Z"),
    messageThree: Date.parse("2026-03-27T15:03:00.000Z")
} as const

function createActor(id: string, name: string, color: string): LocalTranscriptActor {
    return {
        id,
        name,
        color,
        avatar: null,
        bot: false,
        verifiedBot: false,
        system: false
    }
}

function createButtons(): LocalTranscriptButtonComponent[] {
    return [
        {
            type: "url",
            label: "Open incident",
            icon: "🔗",
            iconAsset: null,
            color: "blue",
            id: false,
            url: "https://status.example.com/incidents/preview",
            disabled: false
        },
        {
            type: "interaction",
            label: "Acknowledge",
            icon: "✅",
            iconAsset: null,
            color: "green",
            id: "acknowledge-preview",
            url: false,
            disabled: true
        }
    ]
}

function createDropdownOptions(): LocalTranscriptDropdownOption[] {
    return [
        {
            label: "Escalate to platform",
            description: "Route the next update to the platform engineer on duty.",
            id: "platform-escalation",
            icon: "🛠",
            iconAsset: null
        },
        {
            label: "Keep with support",
            description: "Continue with the current ticket owner for another check.",
            id: "support-follow-up",
            icon: "🎫",
            iconAsset: null
        }
    ]
}

function createReactions(): LocalTranscriptReaction[] {
    return [
        {
            amount: 3,
            emoji: "👍",
            custom: false,
            animated: false,
            asset: null
        },
        {
            amount: 1,
            emoji: "🔎",
            custom: false,
            animated: false,
            asset: null
        }
    ]
}

function createEmbed(): LocalTranscriptEmbed {
    return {
        title: "Maintenance summary",
        description: "Collected the ticket notes and queued a follow-up check for the next handoff.",
        color: "#5865f2",
        url: false,
        authorText: "Operations timeline",
        authorAsset: null,
        footerText: "Preview content is deterministic and never uses live ticket data.",
        footerAsset: null,
        image: null,
        thumbnail: null,
        fields: [
            {
                name: "Environment",
                value: "Production shard 03",
                inline: true
            },
            {
                name: "Next action",
                value: "Re-run the export after the archive lock clears.",
                inline: false
            }
        ]
    }
}

function createImageAttachment(): LocalTranscriptAttachment {
    return {
        name: "error-screenshot.png",
        fileType: "image/png",
        size: "348 KB",
        spoiler: false,
        alt: "Transcript preview screenshot",
        displayKind: "image",
        asset: null
    }
}

function createFileAttachment(): LocalTranscriptAttachment {
    return {
        name: "transcript-notes.txt",
        fileType: "text/plain",
        size: "12 KB",
        spoiler: false,
        alt: null,
        displayKind: "file",
        asset: null
    }
}

export function buildTranscriptPreviewDocument(styleDraft: TranscriptHtmlStyleDraft): LocalTranscriptDocument {
    const creator = createActor("preview-user-1", "Jordan Carter", "#ffffff")
    const support = createActor("preview-user-2", "Avery Nguyen", "#b5bac1")
    const lead = createActor("preview-user-3", "Morgan Lee", "#5865f2")
    const deletedBy = createActor("preview-user-4", "Casey Rivera", "#ffffff")
    const ticketMetadata = {
        ...createDefaultTicketPlatformMetadata(),
        assignedStaffUserId: support.id,
        firstStaffResponseAt: PREVIEW_TIMESTAMPS.messageOne,
        resolvedAt: PREVIEW_TIMESTAMPS.closedOn
    }

    const reply: LocalTranscriptReply = {
        type: "reply",
        user: creator,
        content: "Can you confirm the last successful export before we reissue the archive?",
        messageId: "preview-msg-0",
        channelId: "preview-channel",
        guildId: "preview-guild"
    }

    const messages: LocalTranscriptMessage[] = [
        {
            id: "preview-msg-1",
            timestamp: PREVIEW_TIMESTAMPS.messageOne,
            edited: false,
            important: false,
            author: creator,
            content: "Thanks for jumping on this ticket. We isolated the archive mismatch and collected a clean reproduction path for the operator handoff.",
            reply: { type: false },
            embeds: [],
            attachments: [],
            components: [
                {
                    type: "buttons",
                    buttons: createButtons()
                },
                {
                    type: "reactions",
                    reactions: createReactions()
                }
            ]
        },
        {
            id: "preview-msg-2",
            timestamp: PREVIEW_TIMESTAMPS.messageTwo,
            edited: true,
            important: false,
            author: support,
            content: "Updated the draft notes after the second verification pass. The preview keeps this edited state visible so operators can inspect the transcript chrome.",
            reply,
            embeds: [createEmbed()],
            attachments: [],
            components: [
                {
                    type: "dropdown",
                    placeholder: "Escalation path",
                    options: createDropdownOptions()
                }
            ]
        },
        {
            id: "preview-msg-3",
            timestamp: PREVIEW_TIMESTAMPS.messageThree,
            edited: false,
            important: true,
            author: lead,
            content: "Attached the capture set and the export notes so the final transcript preview shows both image-style and file-style attachment rows.",
            reply: { type: false },
            embeds: [],
            attachments: [createImageAttachment(), createFileAttachment()],
            components: []
        }
    ]

    return {
        version: "1.0",
        transcriptId: "preview-sample",
        generatedAt: PREVIEW_TIMESTAMPS.generatedAt,
        status: "active",
        warningCount: 1,
        warnings: [
            {
                code: "preview-warning",
                message: "Preview warnings stay visible here so style changes can be reviewed against the same archive warning chrome used in production."
            }
        ],
        searchText: "preview transcript sample deterministic dashboard styling",
        totals: {
            messages: messages.length,
            embeds: 1,
            attachments: 2,
            reactions: 2,
            interactions: 3
        },
        style: mapTranscriptHtmlStyleDraft(styleDraft),
        bot: {
            name: "Open Ticket",
            id: "preview-bot",
            avatar: null
        },
        guild: {
            name: "Northwind Operations",
            id: "preview-guild",
            icon: null
        },
        ticket: {
            name: "ops-escalation-preview",
            id: "preview-channel",
            createdOn: PREVIEW_TIMESTAMPS.createdOn,
            closedOn: PREVIEW_TIMESTAMPS.closedOn,
            claimedOn: PREVIEW_TIMESTAMPS.claimedOn,
            pinnedOn: PREVIEW_TIMESTAMPS.pinnedOn,
            deletedOn: PREVIEW_TIMESTAMPS.deletedOn,
            createdBy: creator,
            closedBy: lead,
            claimedBy: support,
            pinnedBy: support,
            deletedBy,
            metadata: ticketMetadata
        },
        participants: [
            {
                userId: creator.id,
                displayName: creator.name,
                role: "creator"
            },
            {
                userId: support.id,
                displayName: support.name,
                role: "participant"
            },
            {
                userId: lead.id,
                displayName: lead.name,
                role: "admin"
            }
        ],
        messages
    }
}
