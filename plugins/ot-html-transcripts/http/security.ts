import type { ServerResponse } from "http"

export function buildTranscriptHtmlCsp() {
    return [
        "default-src 'none'",
        "base-uri 'none'",
        "connect-src 'none'",
        "font-src 'self' data:",
        "form-action 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data:",
        "media-src 'self'",
        "object-src 'none'",
        "script-src 'none'",
        "style-src 'unsafe-inline'"
    ].join("; ")
}

export function buildTranscriptPreviewHtmlCsp() {
    return [
        "default-src 'none'",
        "base-uri 'none'",
        "connect-src 'none'",
        "font-src 'self' data:",
        "form-action 'none'",
        "frame-ancestors 'self'",
        "img-src 'self' data: http: https:",
        "media-src 'self' data:",
        "object-src 'none'",
        "script-src 'none'",
        "style-src 'unsafe-inline'"
    ].join("; ")
}

export function setNoSniffHeaders(response: ServerResponse) {
    response.setHeader("X-Content-Type-Options", "nosniff")
}

export function normalizeBasePath(basePath: string) {
    const trimmed = (basePath || "/").trim()
    if (trimmed == "" || trimmed == "/") return ""

    const leading = trimmed.startsWith("/") ? trimmed : "/" + trimmed
    return leading.endsWith("/") ? leading.slice(0, -1) : leading
}

export function stripBasePath(pathname: string, basePath: string) {
    const normalizedBasePath = normalizeBasePath(basePath)
    if (normalizedBasePath == "") return pathname
    if (pathname == normalizedBasePath) return "/"
    if (pathname.startsWith(normalizedBasePath + "/")) {
        return pathname.slice(normalizedBasePath.length)
    }

    return null
}

export function validatePathSegment(segment: string) {
    if (segment.length == 0) return false
    if (segment.includes("/") || segment.includes("\\")) return false
    if (segment == "." || segment == ".." || segment.includes("..")) return false
    return true
}
