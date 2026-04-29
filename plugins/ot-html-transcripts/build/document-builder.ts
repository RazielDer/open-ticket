import { api, opendiscord } from "#opendiscord"
import * as discord from "discord.js"

import type {
    LocalAssetRef,
    LocalTranscriptActor,
    LocalTranscriptAttachment,
    LocalTranscriptButtonComponent,
    LocalTranscriptComponent,
    LocalTranscriptDocument,
    LocalTranscriptDropdownOption,
    LocalTranscriptEmbed,
    LocalTranscriptFormRecord,
    LocalTranscriptMessage,
    LocalTranscriptParticipant,
    LocalTranscriptReaction,
    LocalTranscriptReply
} from "../contracts/document"
import type { TranscriptStatus } from "../contracts/types"
import { replaceTranscriptMentions } from "../collect/mention-replacer"
import {
    buildLocalTranscriptFormRecord,
    getFormRecordSearchParts,
    type TicketFormsCompletedSnapshotLike,
    type TicketFormsDraftSnapshotLike,
    type TicketFormsServiceLike
} from "./form-record-builder"
import { mapTranscriptHtmlStyleDraft } from "./style-mapper"

export async function buildTranscriptDocument(
    transcriptId: string,
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel,
    user: discord.User,
    messages: api.ODTranscriptMessageData[],
    participants: { user: discord.User; role: "creator" | "participant" | "admin" }[]
): Promise<LocalTranscriptDocument> {
    const transcriptConfig = opendiscord.configs.get("opendiscord:transcripts")
    const style = mapTranscriptHtmlStyleDraft(transcriptConfig.data.htmlTranscriptStyle)

    const creator = await opendiscord.tickets.getTicketUser(ticket, "creator")
    const closer = await opendiscord.tickets.getTicketUser(ticket, "closer")
    const claimer = await opendiscord.tickets.getTicketUser(ticket, "claimer")
    const pinner = await opendiscord.tickets.getTicketUser(ticket, "pinner")

    const totals = {
        messages: messages.length,
        embeds: 0,
        attachments: 0,
        reactions: 0,
        interactions: 0
    }

    const formRecordsByMessageId = await buildTicketManagedFormRecordIndex(ticket, channel)
    const renderedMessages: LocalTranscriptMessage[] = []
    for (const message of messages) {
        totals.embeds += message.embeds.length
        totals.attachments += message.files.length
        totals.reactions += message.reactions.length
        totals.interactions += message.components.reduce((count, row) => count + row.components.length, 0)
        renderedMessages.push(await buildRenderedMessage(
            message,
            formRecordsByMessageId.get(message.id) ?? null
        ))
    }

    const document: LocalTranscriptDocument = {
        version: "2.0",
        transcriptId,
        generatedAt: new Date().toISOString(),
        status: "active",
        warningCount: 0,
        warnings: [],
        searchText: buildSearchText(channel, messages, participants, formRecordsByMessageId),
        totals,
        style,
        bot: {
            name: opendiscord.client.client.user.displayName,
            id: opendiscord.client.client.user.id,
            avatar: createOptionalAssetRef(opendiscord.client.client.user.displayAvatarURL({ extension: "png" }), "bot.avatar", true)
        },
        guild: {
            name: channel.guild.name,
            id: channel.guild.id,
            icon: createOptionalAssetRef(channel.guild.iconURL({ extension: "png" }), "guild.icon", true)
        },
        ticket: {
            name: channel.name,
            id: channel.id,
            createdOn: ticket.get("opendiscord:opened-on").value ?? false,
            closedOn: ticket.get("opendiscord:closed-on").value ?? false,
            claimedOn: ticket.get("opendiscord:claimed-on").value ?? false,
            pinnedOn: ticket.get("opendiscord:pinned-on").value ?? false,
            deletedOn: Date.now(),
            createdBy: creator ? createUserActor(creator, false, false, false, "#ffffff", "ticket.createdBy") : null,
            closedBy: closer ? createUserActor(closer, false, false, false, "#ffffff", "ticket.closedBy") : null,
            claimedBy: claimer ? createUserActor(claimer, false, false, false, "#ffffff", "ticket.claimedBy") : null,
            pinnedBy: pinner ? createUserActor(pinner, false, false, false, "#ffffff", "ticket.pinnedBy") : null,
            deletedBy: createUserActor(user, user.bot, false, user.system, "#ffffff", "ticket.deletedBy"),
            metadata: api.readTicketPlatformMetadataFromTicket(ticket)
        },
        participants: participants.map((participant) => ({
            userId: participant.user.id,
            displayName: participant.user.displayName,
            role: participant.role
        })),
        messages: renderedMessages
    }

    return document
}

export function markDocumentStatus(document: LocalTranscriptDocument, status: TranscriptStatus) {
    document.status = status
    document.warningCount = document.warnings.length
}

function buildSearchText(
    channel: discord.GuildTextBasedChannel,
    messages: api.ODTranscriptMessageData[],
    participants: { user: discord.User; role: "creator" | "participant" | "admin" }[],
    formRecordsByMessageId: Map<string, LocalTranscriptFormRecord>
) {
    const parts = [
        channel.name,
        channel.id,
        ...participants.flatMap((participant) => [participant.user.displayName, participant.user.username, participant.user.id]),
        ...messages.flatMap((message) => [
            message.author.displayname,
            message.author.username,
            message.content ?? "",
            ...message.embeds.flatMap((embed) => [embed.title ?? "", embed.description ?? "", ...embed.fields.flatMap((field) => [field.name, field.value])]),
            ...message.files.map((file) => file.name),
            ...getFormRecordSearchParts(formRecordsByMessageId.get(message.id) ?? null)
        ])
    ]

    return parts.filter((part) => part.length > 0).join(" ").toLowerCase()
}

async function buildRenderedMessage(
    message: api.ODTranscriptMessageData,
    formRecord: LocalTranscriptFormRecord | null
): Promise<LocalTranscriptMessage> {
    const components: LocalTranscriptComponent[] = []

    for (const row of message.components) {
        if (row.components.length == 0) continue
        if (row.components[0].type == "dropdown") {
            const options: LocalTranscriptDropdownOption[] = []
            for (const option of row.components) {
                const dropdown = option as api.ODTranscriptDropdownComponentData
                for (const dropdownOption of dropdown.options) {
                    options.push({
                        label: dropdownOption.label ?? false,
                        description: dropdownOption.description ?? false,
                        id: dropdownOption.id ?? false,
                        icon: dropdownOption.emoji?.custom ? false : (dropdownOption.emoji?.emoji ?? false),
                        iconAsset: dropdownOption.emoji?.custom ? createOptionalAssetRef(dropdownOption.emoji.emoji, "component.dropdown.icon", true) : null
                    })
                }
            }
            components.push({
                type: "dropdown",
                placeholder: (row.components[0] as api.ODTranscriptDropdownComponentData).placeholder ?? false,
                options
            })
        } else {
            const buttons: LocalTranscriptButtonComponent[] = []
            for (const component of row.components) {
                const button = component as api.ODTranscriptButtonComponentData
                buttons.push({
                    type: button.mode == "url" ? "url" : "interaction",
                    label: button.label ?? false,
                    icon: button.emoji && !button.emoji.custom ? button.emoji.emoji : false,
                    iconAsset: button.emoji && button.emoji.custom ? createOptionalAssetRef(button.emoji.emoji, "component.button.icon", true) : null,
                    color: button.color,
                    id: button.id ?? false,
                    url: button.url ?? false,
                    disabled: button.disabled
                })
            }
            components.push({
                type: "buttons",
                buttons
            })
        }
    }

    components.push({
        type: "reactions",
        reactions: message.reactions.map((reaction) => buildReaction(reaction))
    })

    return {
        id: message.id,
        timestamp: message.timestamp,
        edited: message.edited,
        important: message.type == "important",
        author: createTranscriptActor(message.author, "message.author"),
        content: message.content ? await replaceTranscriptMentions(message.content) : false,
        reply: await buildReply(message.reply),
        embeds: await Promise.all(message.embeds.map((embed) => buildEmbed(embed))),
        attachments: message.files.map((file) => buildAttachment(file)),
        components,
        formRecord
    }
}

async function buildTicketManagedFormRecordIndex(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel
): Promise<Map<string, LocalTranscriptFormRecord>> {
    const records = new Map<string, LocalTranscriptFormRecord>()
    const service = resolveTicketFormsService()
    if (!service) return records

    let drafts: TicketFormsDraftSnapshotLike[] = []
    try {
        drafts = await service.listTicketDrafts()
    } catch {
        return records
    }

    for (const draft of drafts) {
        if (draft.ticketChannelId != channel.id && draft.ticketChannelId != ticket.id.value) continue
        if (draft.answerTarget != "ticket_managed_record") continue

        const managedRecordMessageId = normalizeString(draft.managedRecordMessageId)
        if (!managedRecordMessageId) continue

        let completedSnapshot: TicketFormsCompletedSnapshotLike | null = null
        if (service.getCompletedTicketForm) {
            completedSnapshot = await service.getCompletedTicketForm(draft.ticketChannelId, draft.formId).catch(() => null)
        }

        const record = buildLocalTranscriptFormRecord(
            draft,
            resolveTicketFormName(draft.formId),
            completedSnapshot
        )
        if (record) records.set(managedRecordMessageId, record)
    }

    return records
}

function resolveTicketFormsService(): TicketFormsServiceLike | null {
    try {
        const service = opendiscord.plugins.classes.get("ot-ticket-forms:service") as unknown as Partial<TicketFormsServiceLike>
        if (service && typeof service.listTicketDrafts == "function") {
            return service as TicketFormsServiceLike
        }
    } catch {}

    return null
}

function resolveTicketFormName(formId: string): string | false {
    try {
        const formsConfig = opendiscord.configs.get("ot-ticket-forms:config").data as Array<{ id: string; name?: unknown }>
        const formConfig = formsConfig.find((candidate) => candidate.id == formId)
        return normalizeString(formConfig?.name) ?? false
    } catch {
        return false
    }
}

function normalizeString(value: unknown): string | null {
    if (typeof value != "string") return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
}

async function buildReply(reply: api.ODTranscriptMessageData["reply"]): Promise<LocalTranscriptReply> {
    if (!reply) return { type: false }

    if (reply.type == "interaction") {
        return {
            type: "command",
            user: createTranscriptActor(reply.user, "reply.interaction.user"),
            interactionName: reply.name
        }
    }

    return {
        type: "reply",
        user: createTranscriptActor(reply.user, "reply.message.user"),
        content: reply.content ? await replaceTranscriptMentions(reply.content) : false,
        messageId: reply.id,
        channelId: reply.channel,
        guildId: reply.guild
    }
}

async function buildEmbed(embed: api.ODTranscriptEmbedData): Promise<LocalTranscriptEmbed> {
    return {
        title: embed.title ? await replaceTranscriptMentions(embed.title) : false,
        description: embed.description ? await replaceTranscriptMentions(embed.description) : false,
        color: embed.color,
        url: embed.url ?? false,
        authorText: embed.authortext ?? false,
        authorAsset: createOptionalAssetRef(embed.authorimg, "embed.author", true),
        footerText: embed.footertext ?? false,
        footerAsset: createOptionalAssetRef(embed.footerimg, "embed.footer", true),
        image: createOptionalAssetRef(embed.image, "embed.image", true),
        thumbnail: createOptionalAssetRef(embed.thumbnail, "embed.thumbnail", true),
        fields: embed.fields.map((field) => ({ name: field.name, value: field.value, inline: field.inline }))
    }
}

function buildAttachment(file: api.ODTranscriptFileData): LocalTranscriptAttachment {
    return {
        name: file.name,
        fileType: file.type,
        size: file.size + " " + file.unit,
        spoiler: file.spoiler,
        alt: file.alt,
        displayKind: detectAttachmentKind(file.type, file.name),
        asset: createOptionalAssetRef(file.url, "attachment." + file.name, isInlineAttachment(file.type, file.name))
    }
}

function buildReaction(reaction: api.ODTranscriptReactionData): LocalTranscriptReaction {
    return {
        amount: reaction.amount,
        emoji: reaction.custom ? (reaction.name ?? "") : reaction.emoji,
        custom: reaction.custom,
        animated: reaction.animated,
        asset: reaction.custom ? createOptionalAssetRef(reaction.emoji, "reaction.custom", true) : null
    }
}

function createTranscriptActor(user: api.ODTranscriptUserData, purpose: string): LocalTranscriptActor {
    return {
        id: user.id,
        name: user.displayname,
        color: user.color,
        avatar: createOptionalAssetRef(user.pfp, purpose + ".avatar", true),
        bot: user.tag == "app",
        verifiedBot: user.tag == "verified",
        system: user.tag == "system"
    }
}

function createUserActor(user: discord.User, bot: boolean, verifiedBot: boolean, system: boolean, color: string, purpose: string): LocalTranscriptActor {
    return {
        id: user.id,
        name: user.displayName,
        color,
        avatar: createOptionalAssetRef(user.displayAvatarURL({ extension: "png" }), purpose + ".avatar", true),
        bot,
        verifiedBot,
        system
    }
}

function createAssetRef(sourceUrl: string, purpose: string, inlinePreferred: boolean): LocalAssetRef {
    return {
        sourceUrl,
        purpose,
        inlinePreferred,
        assetName: null,
        archivePath: null,
        mimeType: null,
        byteSize: 0,
        status: "skipped"
    }
}

function createOptionalAssetRef(sourceUrl: string | null | undefined, purpose: string, inlinePreferred: boolean) {
    if (!sourceUrl || sourceUrl.length == 0) return null
    return createAssetRef(sourceUrl, purpose, inlinePreferred)
}

function detectAttachmentKind(fileType: string, fileName: string): LocalTranscriptAttachment["displayKind"] {
    const normalized = (fileType || fileName).toLowerCase()
    if (normalized.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(fileName)) return "image"
    if (normalized.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(fileName)) return "video"
    if (normalized.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(fileName)) return "audio"
    return "file"
}

function isInlineAttachment(fileType: string, fileName: string) {
    return detectAttachmentKind(fileType, fileName) != "file"
}
