import { stripBasePath, validatePathSegment } from "./security"

export type TranscriptRoute =
    | { type: "health" }
    | { type: "transcript"; slug: string }
    | { type: "asset"; slug: string; assetName: string }
    | { type: "unknown" }

export function matchTranscriptRoute(pathname: string, basePath: string): TranscriptRoute {
    const relativePath = stripBasePath(pathname, basePath)
    if (relativePath == null) return { type: "unknown" }

    if (relativePath == "/health") return { type: "health" }

    const parts = relativePath.split("/").filter((part) => part.length > 0)
    if (parts.length == 2 && parts[0] == "transcripts" && validatePathSegment(parts[1])) {
        return { type: "transcript", slug: decodeURIComponent(parts[1]) }
    }

    if (parts.length == 4 && parts[0] == "transcripts" && parts[2] == "assets" && validatePathSegment(parts[1]) && validatePathSegment(parts[3])) {
        return {
            type: "asset",
            slug: decodeURIComponent(parts[1]),
            assetName: decodeURIComponent(parts[3])
        }
    }

    return { type: "unknown" }
}
