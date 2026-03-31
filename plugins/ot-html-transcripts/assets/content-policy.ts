import path from "path"

const RISKY_EXTENSIONS = new Set([".html", ".htm", ".svg", ".xml", ".js", ".mjs", ".cjs", ".pdf"])

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".txt": "text/plain",
    ".json": "application/json",
    ".zip": "application/zip",
    ".bin": "application/octet-stream"
}

export function getUrlExtension(rawUrl: string) {
    try {
        const parsed = new URL(rawUrl)
        return path.extname(parsed.pathname).toLowerCase()
    } catch {
        return ""
    }
}

export function isRiskyAssetExtension(extension: string) {
    return RISKY_EXTENSIONS.has(extension.toLowerCase())
}

export function sanitizeAssetExtension(extension: string) {
    const normalized = extension.toLowerCase()
    if (normalized.length == 0) return ".bin"
    if (!/^\.[a-z0-9]+$/i.test(normalized)) return ".bin"
    return normalized
}

export function inferSafeContentType(extension: string, upstreamContentType?: string | null) {
    const normalized = sanitizeAssetExtension(extension)
    if (isRiskyAssetExtension(normalized)) return null

    if (CONTENT_TYPE_BY_EXTENSION[normalized]) return CONTENT_TYPE_BY_EXTENSION[normalized]

    if (upstreamContentType) {
        const cleaned = upstreamContentType.split(";")[0].trim().toLowerCase()
        if (cleaned.startsWith("image/") || cleaned.startsWith("video/") || cleaned.startsWith("audio/")) {
            return cleaned
        }
    }

    return "application/octet-stream"
}

export function isInlineSafeContentType(contentType: string | null) {
    if (!contentType) return false
    return contentType.startsWith("image/") || contentType.startsWith("video/") || contentType.startsWith("audio/")
}
