import type { TranscriptAssetStatus, TranscriptStatus } from "./types"

export interface TranscriptWarning {
    code: string
    message: string
    sourceUrl?: string | null
}

export interface LocalAssetRef {
    sourceUrl: string
    purpose: string
    inlinePreferred: boolean
    assetName: string | null
    archivePath: string | null
    mimeType: string | null
    byteSize: number
    status: TranscriptAssetStatus
    unavailableReason?: string | null
}

export interface LocalTranscriptActor {
    id: string
    name: string
    color: string
    avatar: LocalAssetRef | null
    bot: boolean
    verifiedBot: boolean
    system: boolean
}

export interface LocalTranscriptEmbedField {
    name: string
    value: string
    inline: boolean
}

export interface LocalTranscriptEmbed {
    title: string | false
    description: string | false
    color: string
    url: string | false
    authorText: string | false
    authorAsset: LocalAssetRef | null
    footerText: string | false
    footerAsset: LocalAssetRef | null
    image: LocalAssetRef | null
    thumbnail: LocalAssetRef | null
    fields: LocalTranscriptEmbedField[]
}

export interface LocalTranscriptAttachment {
    name: string
    fileType: string
    size: string
    spoiler: boolean
    alt: string | null
    displayKind: "image" | "video" | "audio" | "file"
    asset: LocalAssetRef | null
}

export interface LocalTranscriptReaction {
    amount: number
    emoji: string
    custom: boolean
    animated: boolean
    asset: LocalAssetRef | null
}

export interface LocalTranscriptButtonComponent {
    type: "interaction" | "url"
    label: string | false
    icon: string | false
    iconAsset: LocalAssetRef | null
    color: "gray" | "green" | "red" | "blue"
    id: string | false
    url: string | false
    disabled: boolean
}

export interface LocalTranscriptDropdownOption {
    label: string | false
    description: string | false
    id: string | false
    icon: string | false
    iconAsset: LocalAssetRef | null
}

export type LocalTranscriptComponent =
    | { type: "buttons"; buttons: LocalTranscriptButtonComponent[] }
    | { type: "dropdown"; placeholder: string | false; options: LocalTranscriptDropdownOption[] }
    | { type: "reactions"; reactions: LocalTranscriptReaction[] }

export interface LocalTranscriptReply {
    type: "reply" | "command" | false
    user?: LocalTranscriptActor
    content?: string | false
    messageId?: string
    channelId?: string
    guildId?: string
    interactionName?: string
}

export interface LocalTranscriptMessage {
    id: string
    timestamp: number
    edited: boolean
    important: boolean
    author: LocalTranscriptActor
    content: string | false
    reply: LocalTranscriptReply
    embeds: LocalTranscriptEmbed[]
    attachments: LocalTranscriptAttachment[]
    components: LocalTranscriptComponent[]
}

export interface LocalTranscriptParticipant {
    userId: string
    displayName: string
    role: "creator" | "participant" | "admin"
}

export interface LocalTranscriptTicketMetadata {
    transportMode: string
    transportParentChannelId: string | null
    transportParentMessageId: string | null
    assignedTeamId: string | null
    assignedStaffUserId: string | null
    assignmentStrategy: string | null
    firstStaffResponseAt: number | null
    resolvedAt: number | null
    awaitingUserState: string | null
    awaitingUserSince: number | null
    closeRequestState: string | null
    closeRequestBy: string | null
    closeRequestAt: number | null
    integrationProfileId: string | null
    aiAssistProfileId: string | null
}

export interface LocalTranscriptDocument {
    version: "1.0"
    transcriptId: string
    generatedAt: string
    status: TranscriptStatus
    warningCount: number
    warnings: TranscriptWarning[]
    searchText: string
    totals: {
        messages: number
        embeds: number
        attachments: number
        reactions: number
        interactions: number
    }
    style: {
        background: {
            enabled: boolean
            backgroundColor: string
            backgroundAsset: LocalAssetRef | null
        }
        header: {
            enabled: boolean
            backgroundColor: string
            decoColor: string
            textColor: string
        }
        stats: {
            enabled: boolean
            backgroundColor: string
            keyTextColor: string
            valueTextColor: string
            hideBackgroundColor: string
            hideTextColor: string
        }
        favicon: {
            enabled: boolean
            faviconAsset: LocalAssetRef | null
        }
    }
    bot: {
        name: string
        id: string
        avatar: LocalAssetRef | null
    }
    guild: {
        name: string
        id: string
        icon: LocalAssetRef | null
    }
    ticket: {
        name: string
        id: string
        createdOn: number | false
        closedOn: number | false
        claimedOn: number | false
        pinnedOn: number | false
        deletedOn: number | false
        createdBy: LocalTranscriptActor | null
        closedBy: LocalTranscriptActor | null
        claimedBy: LocalTranscriptActor | null
        pinnedBy: LocalTranscriptActor | null
        deletedBy: LocalTranscriptActor | null
        metadata?: LocalTranscriptTicketMetadata
    }
    participants: LocalTranscriptParticipant[]
    messages: LocalTranscriptMessage[]
}
