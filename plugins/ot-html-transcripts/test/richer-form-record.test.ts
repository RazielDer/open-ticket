import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { mirrorDocumentAssets } from "../assets/asset-mirror.js"
import {
    buildLocalTranscriptFormRecord,
    normalizeLocalTranscriptFormAnswerData
} from "../build/form-record-builder.js"
import type {
    LocalAssetRef,
    LocalTranscriptDocument,
    LocalTranscriptFormRecord,
    LocalTranscriptMessage
} from "../contracts/document.js"
import { renderTranscriptHtml } from "../render/html-renderer.js"
import { createTestConfig } from "../test-support/helpers.js"

function createAssetRef(sourceUrl: string, purpose = "form-answer.proof.png"): LocalAssetRef {
    return {
        sourceUrl,
        purpose,
        inlinePreferred: true,
        assetName: null,
        archivePath: null,
        mimeType: null,
        byteSize: 0,
        status: "skipped"
    }
}

function createMirroredAssetRef(assetName: string, mimeType: string, purpose = "form-answer.proof"): LocalAssetRef {
    return {
        sourceUrl: "https://example.invalid/" + assetName,
        purpose,
        inlinePreferred: true,
        assetName,
        archivePath: "assets/" + assetName,
        mimeType,
        byteSize: 128,
        status: "mirrored"
    }
}

function createMessage(overrides: Partial<LocalTranscriptMessage> = {}): LocalTranscriptMessage {
    return {
        id: "message-1",
        timestamp: Date.parse("2026-04-21T12:00:00.000Z"),
        edited: false,
        important: false,
        author: {
            id: "bot-1",
            name: "Ticket Bot",
            color: "#ffffff",
            avatar: null,
            bot: true,
            verifiedBot: false,
            system: false
        },
        content: "Submitted answers",
        reply: { type: false },
        embeds: [],
        attachments: [],
        components: [],
        formRecord: null,
        ...overrides
    }
}

function createDocument(messages: LocalTranscriptMessage[], version: "1.0" | "2.0" = "2.0"): LocalTranscriptDocument {
    return {
        version,
        transcriptId: "tr-form-record",
        generatedAt: "2026-04-21T12:00:00.000Z",
        status: "active",
        warningCount: 0,
        warnings: [],
        searchText: "ticket answers",
        totals: {
            messages: messages.length,
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
            name: "ticket-forms",
            id: "channel-forms",
            createdOn: false,
            closedOn: false,
            claimedOn: false,
            pinnedOn: false,
            deletedOn: false,
            createdBy: null,
            closedBy: null,
            claimedBy: null,
            pinnedBy: null,
            deletedBy: null,
            metadata: {
                transportMode: "private_thread",
                transportParentChannelId: "parent-1",
                transportParentMessageId: null,
                assignedTeamId: null,
                assignedStaffUserId: null,
                assignmentStrategy: null,
                firstStaffResponseAt: null,
                resolvedAt: null,
                awaitingUserState: null,
                awaitingUserSince: null,
                closeRequestState: null,
                closeRequestBy: null,
                closeRequestAt: null,
                integrationProfileId: null,
                aiAssistProfileId: null
            }
        },
        participants: [],
        messages
    }
}

function createFormRecord(): LocalTranscriptFormRecord {
    return {
        source: "ot-ticket-forms",
        formId: "whitelist-review",
        formName: "Whitelist Review",
        applicantDiscordUserId: "user-1",
        draftState: "completed",
        updatedAt: "2026-04-21T12:00:00.000Z",
        completedAt: "2026-04-21T12:05:00.000Z",
        answers: [
            {
                position: 1,
                question: "Upload proof",
                answer: "proof.png, clip.mp4, voice.ogg, notes.txt, missing.bin",
                answerData: {
                    kind: "file_upload",
                    files: [
                        {
                            name: "proof.png",
                            url: "https://example.invalid/proof.png",
                            contentType: "image/png",
                            size: 128,
                            displayKind: "image",
                            asset: createMirroredAssetRef("proof.png", "image/png")
                        },
                        {
                            name: "clip.mp4",
                            url: "https://example.invalid/clip.mp4",
                            contentType: "video/mp4",
                            size: 256,
                            displayKind: "video",
                            asset: createMirroredAssetRef("clip.mp4", "video/mp4")
                        },
                        {
                            name: "voice.ogg",
                            url: "https://example.invalid/voice.ogg",
                            contentType: "audio/ogg",
                            size: 512,
                            displayKind: "audio",
                            asset: createMirroredAssetRef("voice.ogg", "audio/ogg")
                        },
                        {
                            name: "notes.txt",
                            url: "https://example.invalid/notes.txt",
                            contentType: "text/plain",
                            size: 64,
                            displayKind: "file",
                            asset: createMirroredAssetRef("notes.txt", "text/plain")
                        },
                        {
                            name: "missing.bin",
                            url: "https://example.invalid/missing.bin",
                            contentType: false,
                            size: false,
                            displayKind: "file",
                            asset: {
                                ...createAssetRef("https://example.invalid/missing.bin"),
                                status: "failed",
                                unavailableReason: "HTTP 404 while downloading asset."
                            }
                        }
                    ]
                }
            }
        ]
    }
}

test("form record mapping mirrors supported answer families and fails closed for unsupported residue", () => {
    const draft = {
        ticketChannelId: "channel-forms",
        formId: "whitelist-review",
        answerTarget: "ticket_managed_record",
        draftState: "completed" as const,
        updatedAt: "2026-04-21T12:00:00.000Z",
        completedAt: "2026-04-21T12:05:00.000Z",
        managedRecordMessageId: "message-1",
        applicantDiscordUserId: "user-1",
        answers: []
    }
    const record = buildLocalTranscriptFormRecord(draft, "Whitelist Review", {
        applicantDiscordUserId: "user-1",
        completedAt: "2026-04-21T12:05:00.000Z",
        answers: [
            { position: 1, question: "Name", answer: "RazielDer", answerData: { kind: "text", value: "RazielDer" } },
            { position: 2, question: "Species", answer: "Carnivore", answerData: { kind: "string_select", selected: [{ value: "carni", label: "Carnivore" }] } },
            { position: 3, question: "User", answer: "RazielDer", answerData: { kind: "user_select", selected: [{ id: "111", label: "RazielDer", entityKind: "user" }] } },
            { position: 4, question: "Role", answer: "Staff", answerData: { kind: "role_select", selected: [{ id: "222", label: "Staff", entityKind: "role" }] } },
            { position: 5, question: "Channel", answer: "tickets", answerData: { kind: "channel_select", selected: [{ id: "333", label: "tickets", entityKind: "channel" }] } },
            { position: 6, question: "Mentionable", answer: "Staff", answerData: { kind: "mentionable_select", selected: [{ id: "222", label: "Staff", entityKind: "role" }] } },
            { position: 7, question: "Upload", answer: "proof.png", answerData: { kind: "file_upload", files: [{ attachmentId: "att-1", name: "proof.png", url: "https://example.invalid/proof.png", contentType: "image/png", size: 128 }] } },
            { position: 8, question: "Legacy residue", answer: "legacy fallback", answerData: { kind: "checkbox_group", values: ["bad"] } }
        ]
    })

    assert.ok(record)
    assert.equal(record.formName, "Whitelist Review")
    assert.equal(record.answers[0]?.answerData?.kind, "text")
    assert.equal(record.answers[1]?.answerData?.kind, "string_select")
    assert.equal(record.answers[2]?.answerData?.kind, "user_select")
    assert.equal(record.answers[3]?.answerData?.kind, "role_select")
    assert.equal(record.answers[4]?.answerData?.kind, "channel_select")
    assert.equal(record.answers[5]?.answerData?.kind, "mentionable_select")
    assert.equal(record.answers[6]?.answerData?.kind, "file_upload")
    assert.equal(record.answers[7]?.answer, "legacy fallback")
    assert.equal(record.answers[7]?.answerData, null)
    assert.equal(normalizeLocalTranscriptFormAnswerData({ kind: "radio_group", selected: [] }), null)
})

test("legacy 1.0 documents still render while 2.0 documents render inline form results and file evidence", () => {
    const legacyHtml = renderTranscriptHtml(createDocument([createMessage({ formRecord: undefined })], "1.0"))
    assert.match(legacyHtml, /ticket-forms/)
    assert.doesNotMatch(legacyHtml, /Archived form result/)

    const html = renderTranscriptHtml(createDocument([
        createMessage({ formRecord: createFormRecord() }),
        createMessage({ id: "message-2", content: "Unrelated ticket note", formRecord: null })
    ], "2.0"))
    assert.match(html, /Archived form result/)
    assert.match(html, /Whitelist Review/)
    assert.match(html, /proof\.png, clip\.mp4, voice\.ogg, notes\.txt, missing\.bin/)
    assert.match(html, /__OT_TRANSCRIPT_ASSET_BASE__proof\.png/)
    assert.match(html, /<video controls preload="metadata" src="__OT_TRANSCRIPT_ASSET_BASE__clip\.mp4">/)
    assert.match(html, /<audio controls preload="metadata" src="__OT_TRANSCRIPT_ASSET_BASE__voice\.ogg">/)
    assert.match(html, /Download archived file evidence/)
    assert.match(html, /File evidence unavailable in this archive/)
    assert.match(html, /HTTP 404 while downloading asset/)
    assert.equal(html.match(/Archived form result/g)?.length, 1)
})

test("asset mirroring archives file-upload answer evidence through the existing asset pipeline", async () => {
    const { config } = createTestConfig("form-answer-asset-mirror")
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-form-answer-assets-"))
    const originalFetch = globalThis.fetch
    const document = createDocument([
        createMessage({
            formRecord: {
                ...createFormRecord(),
                answers: [
                    {
                        position: 1,
                        question: "Upload proof",
                        answer: "proof.png",
                        answerData: {
                            kind: "file_upload",
                            files: [{
                                name: "proof.png",
                                url: "https://example.invalid/proof.png",
                                contentType: "image/png",
                                size: 128,
                                displayKind: "image",
                                asset: createAssetRef("https://example.invalid/proof.png")
                            }]
                        }
                    }
                ]
            }
        })
    ])
    const file = document.messages[0]?.formRecord?.answers[0]?.answerData?.kind == "file_upload"
        ? document.messages[0].formRecord.answers[0].answerData.files[0]
        : null

    globalThis.fetch = async () => new Response("image-bytes", {
        status: 200,
        headers: { "content-type": "image/png" }
    })

    try {
        const result = await mirrorDocumentAssets(document, root, config)

        assert.equal(result.mirroredCount, 1)
        assert.equal(result.assetRecords[0]?.status, "mirrored")
        assert.equal(file?.asset?.status, "mirrored")
        assert.match(file?.asset?.assetName ?? "", /\.png$/)
        assert.equal(fs.existsSync(path.join(root, "assets", file?.asset?.assetName ?? "")), true)
    } finally {
        globalThis.fetch = originalFetch
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test("document builder emits the 2.0 archive contract and attaches records only by managed message id", () => {
    const source = fs.readFileSync(
        path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "build", "document-builder.ts"),
        "utf8"
    )

    assert.equal(source.includes('version: "2.0"'), true)
    assert.equal(source.includes("metadata: api.readTicketPlatformMetadataFromTicket(ticket)"), true)
    assert.equal(source.includes("buildTicketManagedFormRecordIndex(ticket, channel)"), true)
    assert.equal(source.includes("formRecordsByMessageId.get(message.id) ?? null"), true)
    assert.match(source, /draft\.answerTarget\s*!=\s*"ticket_managed_record"/)
    assert.match(source, /normalizeString\(draft\.managedRecordMessageId\)/)
    assert.match(source, /if \(!managedRecordMessageId\) continue/)
})
