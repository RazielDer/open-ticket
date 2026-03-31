import * as fs from "fs"
import path from "path"

import type { LocalTranscriptDocument } from "../contracts/document"
import { renderTranscriptHtml } from "../render/html-renderer"

export interface TranscriptArchiveWriteResult {
    documentBytes: number
    htmlBytes: number
    totalBytes: number
}

export async function writeTranscriptArchive(tempArchivePath: string, document: LocalTranscriptDocument): Promise<TranscriptArchiveWriteResult> {
    const documentJson = JSON.stringify(document, null, 2)
    const html = renderTranscriptHtml(document)

    const documentPath = path.join(tempArchivePath, "document.json")
    const htmlPath = path.join(tempArchivePath, "index.html")

    await fs.promises.writeFile(documentPath, documentJson, "utf8")
    await fs.promises.writeFile(htmlPath, html, "utf8")

    const documentBytes = Buffer.byteLength(documentJson, "utf8")
    const htmlBytes = Buffer.byteLength(html, "utf8")

    return {
        documentBytes,
        htmlBytes,
        totalBytes: documentBytes + htmlBytes
    }
}
