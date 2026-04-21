import test from "node:test"
import assert from "node:assert/strict"

import {
    ODTICKET_PLATFORM_METADATA_IDS,
    createDefaultTicketPlatformMetadata,
    readTicketPlatformMetadataFromTicket
} from "../../../src/core/api/openticket/ticket-platform.js"
import type { LocalTranscriptDocument } from "../contracts/document.js"
import { renderTranscriptHtml } from "../render/html-renderer.js"

function createLegacyDocument(): LocalTranscriptDocument {
    return {
        version: "1.0",
        transcriptId: "legacy-document",
        generatedAt: new Date("2026-03-27T15:45:00.000Z").toISOString(),
        status: "active",
        warningCount: 0,
        warnings: [],
        searchText: "legacy document",
        totals: {
            messages: 1,
            embeds: 0,
            attachments: 0,
            reactions: 0,
            interactions: 0
        },
        style: {
            background: { enabled: false, backgroundColor: "#101010", backgroundAsset: null },
            header: { enabled: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
            stats: { enabled: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
            favicon: { enabled: false, faviconAsset: null }
        },
        bot: { name: "Bot", id: "bot-1", avatar: null },
        guild: { name: "Guild", id: "guild-1", icon: null },
        ticket: {
            name: "legacy-ticket",
            id: "channel-legacy",
            createdOn: false,
            closedOn: false,
            claimedOn: false,
            pinnedOn: false,
            deletedOn: false,
            createdBy: null,
            closedBy: null,
            claimedBy: null,
            pinnedBy: null,
            deletedBy: null
        },
        participants: [],
        messages: [
            {
                id: "1",
                timestamp: 1,
                edited: false,
                important: false,
                author: { id: "user-1", name: "User 1", color: "#ffffff", avatar: null, bot: false, verifiedBot: false, system: false },
                content: "hello",
                reply: { type: false },
                embeds: [],
                attachments: [],
                components: []
            }
        ]
    }
}

test("ticket metadata helper returns the exact transcript metadata keys in the locked order", () => {
    const defaults = createDefaultTicketPlatformMetadata()
    const metadata = readTicketPlatformMetadataFromTicket({
        get(id: string) {
            const values: Record<string, unknown> = {
                [ODTICKET_PLATFORM_METADATA_IDS.transportMode]: "private_thread",
                [ODTICKET_PLATFORM_METADATA_IDS.transportParentChannelId]: "parent-channel-1",
                [ODTICKET_PLATFORM_METADATA_IDS.transportParentMessageId]: "parent-message-1",
                [ODTICKET_PLATFORM_METADATA_IDS.assignedTeamId]: "team-1",
                [ODTICKET_PLATFORM_METADATA_IDS.assignedStaffUserId]: "staff-1",
                [ODTICKET_PLATFORM_METADATA_IDS.assignmentStrategy]: "round_robin",
                [ODTICKET_PLATFORM_METADATA_IDS.firstStaffResponseAt]: 123,
                [ODTICKET_PLATFORM_METADATA_IDS.resolvedAt]: 456,
                [ODTICKET_PLATFORM_METADATA_IDS.awaitingUserState]: "awaiting_user",
                [ODTICKET_PLATFORM_METADATA_IDS.awaitingUserSince]: 789,
                [ODTICKET_PLATFORM_METADATA_IDS.closeRequestState]: "pending",
                [ODTICKET_PLATFORM_METADATA_IDS.closeRequestBy]: "staff-1",
                [ODTICKET_PLATFORM_METADATA_IDS.closeRequestAt]: 999,
                [ODTICKET_PLATFORM_METADATA_IDS.integrationProfileId]: "integration-1",
                [ODTICKET_PLATFORM_METADATA_IDS.aiAssistProfileId]: "assist-1"
            }

            return { value: values[id] }
        }
    })

    assert.deepEqual(Object.keys(metadata), Object.keys(defaults))
    assert.deepEqual(metadata, {
        transportMode: "private_thread",
        transportParentChannelId: "parent-channel-1",
        transportParentMessageId: "parent-message-1",
        assignedTeamId: "team-1",
        assignedStaffUserId: "staff-1",
        assignmentStrategy: "round_robin",
        firstStaffResponseAt: 123,
        resolvedAt: 456,
        awaitingUserState: "awaiting_user",
        awaitingUserSince: 789,
        closeRequestState: "pending",
        closeRequestBy: "staff-1",
        closeRequestAt: 999,
        integrationProfileId: "integration-1",
        aiAssistProfileId: "assist-1"
    })
})

test("html transcript rendering remains backward-compatible when ticket.metadata is absent", () => {
    const html = renderTranscriptHtml(createLegacyDocument())
    assert.match(html, /legacy-ticket/)
    assert.match(html, /hello/)
})

test("html transcript rendering accepts additive ticket.metadata without changing the legacy contract", () => {
    const document = createLegacyDocument()
    document.ticket.metadata = readTicketPlatformMetadataFromTicket({
        get(id: string) {
            return { value: id == ODTICKET_PLATFORM_METADATA_IDS.transportMode ? "channel_text" : null }
        }
    })

    const html = renderTranscriptHtml(document)
    assert.match(html, /legacy-ticket/)
    assert.match(html, /hello/)
})
