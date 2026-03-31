import type { LocalAssetRef, LocalTranscriptDocument } from "../contracts/document"
import type { TranscriptHtmlStyleDraft } from "../contracts/types"

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

export function mapTranscriptHtmlStyleDraft(styleDraft: TranscriptHtmlStyleDraft): LocalTranscriptDocument["style"] {
    const background = styleDraft?.background ?? {
        enableCustomBackground: false,
        backgroundColor: "",
        backgroundImage: ""
    }
    const header = styleDraft?.header ?? {
        enableCustomHeader: false,
        backgroundColor: "",
        decoColor: "",
        textColor: ""
    }
    const stats = styleDraft?.stats ?? {
        enableCustomStats: false,
        backgroundColor: "",
        keyTextColor: "",
        valueTextColor: "",
        hideBackgroundColor: "",
        hideTextColor: ""
    }
    const favicon = styleDraft?.favicon ?? {
        enableCustomFavicon: false,
        imageUrl: ""
    }

    return {
        background: {
            enabled: Boolean(background.enableCustomBackground),
            backgroundColor: background.backgroundColor || "#f8ba00",
            backgroundAsset: background.enableCustomBackground && background.backgroundImage
                ? createStyleAssetRef(background.backgroundImage, "style.background")
                : null
        },
        header: {
            enabled: Boolean(header.enableCustomHeader),
            backgroundColor: header.backgroundColor || "#202225",
            decoColor: header.decoColor || "#f8ba00",
            textColor: header.textColor || "#ffffff"
        },
        stats: {
            enabled: Boolean(stats.enableCustomStats),
            backgroundColor: stats.backgroundColor || "#202225",
            keyTextColor: stats.keyTextColor || "#737373",
            valueTextColor: stats.valueTextColor || "#ffffff",
            hideBackgroundColor: stats.hideBackgroundColor || "#40444a",
            hideTextColor: stats.hideTextColor || "#ffffff"
        },
        favicon: {
            enabled: Boolean(favicon.enableCustomFavicon),
            faviconAsset: favicon.enableCustomFavicon && favicon.imageUrl
                ? createStyleAssetRef(favicon.imageUrl, "style.favicon")
                : null
        }
    }
}
