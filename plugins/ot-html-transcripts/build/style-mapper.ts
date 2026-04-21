import type { LocalAssetRef, LocalTranscriptDocument } from "../contracts/document"
import type { TranscriptHtmlStyleDraft } from "../contracts/types"

export const DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE_DRAFT: TranscriptHtmlStyleDraft = {
    background: {
        enableCustomBackground: false,
        backgroundColor: "#313338",
        backgroundImage: ""
    },
    header: {
        enableCustomHeader: false,
        backgroundColor: "#1e1f22",
        decoColor: "#5865f2",
        textColor: "#f2f3f5"
    },
    stats: {
        enableCustomStats: false,
        backgroundColor: "#2b2d31",
        keyTextColor: "#b5bac1",
        valueTextColor: "#f2f3f5",
        hideBackgroundColor: "#404249",
        hideTextColor: "#dbdee1"
    },
    favicon: {
        enableCustomFavicon: false,
        imageUrl: ""
    }
}

function createStyleAssetRef(sourceUrl: string, purpose: string): LocalAssetRef {
    return {
        sourceUrl,
        purpose,
        inlinePreferred: true,
        assetName: null,
        archivePath: null,
        mimeType: null,
        byteSize: 0,
        status: "skipped",
        unavailableReason: null
    }
}

export function cloneDiscordDefaultTranscriptHtmlStyleDraft(): TranscriptHtmlStyleDraft {
    return {
        background: {
            ...DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE_DRAFT.background
        },
        header: {
            ...DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE_DRAFT.header
        },
        stats: {
            ...DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE_DRAFT.stats
        },
        favicon: {
            ...DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE_DRAFT.favicon
        }
    }
}

export function mapTranscriptHtmlStyleDraft(styleDraft: TranscriptHtmlStyleDraft): LocalTranscriptDocument["style"] {
    void styleDraft
    const lockedStyle = cloneDiscordDefaultTranscriptHtmlStyleDraft()
    const background = lockedStyle.background
    const header = lockedStyle.header
    const stats = lockedStyle.stats
    const favicon = lockedStyle.favicon

    return {
        background: {
            enabled: Boolean(background.enableCustomBackground),
            backgroundColor: background.backgroundColor,
            backgroundAsset: background.enableCustomBackground && background.backgroundImage
                ? createStyleAssetRef(background.backgroundImage, "style.background")
                : null
        },
        header: {
            enabled: Boolean(header.enableCustomHeader),
            backgroundColor: header.backgroundColor,
            decoColor: header.decoColor,
            textColor: header.textColor
        },
        stats: {
            enabled: Boolean(stats.enableCustomStats),
            backgroundColor: stats.backgroundColor,
            keyTextColor: stats.keyTextColor,
            valueTextColor: stats.valueTextColor,
            hideBackgroundColor: stats.hideBackgroundColor,
            hideTextColor: stats.hideTextColor
        },
        favicon: {
            enabled: Boolean(favicon.enableCustomFavicon),
            faviconAsset: favicon.enableCustomFavicon && favicon.imageUrl
                ? createStyleAssetRef(favicon.imageUrl, "style.favicon")
                : null
        }
    }
}
