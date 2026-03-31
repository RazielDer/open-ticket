import http, { type IncomingMessage, type ServerResponse } from "http"
import * as fs from "fs"
import path from "path"
import type { AddressInfo } from "net"

import { type TranscriptSummary, type OTHtmlTranscriptsConfigData } from "../contracts/types"
import { ASSET_BASE_PLACEHOLDER } from "../render/html-renderer"
import type { TranscriptRepository } from "../storage/repository"
import { ensurePathWithinRoot } from "../storage/archive-paths"
import { HTML_CONTENT_TYPE, JSON_CONTENT_TYPE, TEXT_CONTENT_TYPE } from "./content-types"
import { matchTranscriptRoute } from "./routes"
import { buildTranscriptHtmlCsp, normalizeBasePath, setNoSniffHeaders } from "./security"

export interface TranscriptHttpServiceAccess {
    isHealthy(): boolean
    getSummary(): Promise<TranscriptSummary>
    core: {
        config: OTHtmlTranscriptsConfigData | null
        repository: TranscriptRepository | null
        normalizeExpiredLinks(trigger: "public-route", options?: { slug?: string; transcriptId?: string }): Promise<number>
    }
}

export class TranscriptHttpServer {
    readonly service: TranscriptHttpServiceAccess
    #server: http.Server | null = null

    constructor(service: TranscriptHttpServiceAccess) {
        this.service = service
    }

    get listening() {
        return this.#server?.listening ?? false
    }

    get address() {
        const rawAddress = this.#server?.address()
        if (!rawAddress || typeof rawAddress == "string") return null
        return rawAddress as AddressInfo
    }

    async start() {
        if (this.#server) return

        const config = this.getConfig()
        this.#server = http.createServer((request, response) => {
            void this.handleRequest(request, response)
        })
        this.#server.keepAliveTimeout = 1

        await new Promise<void>((resolve, reject) => {
            this.#server!.once("error", reject)
            this.#server!.listen(config.server.port, config.server.host, () => {
                this.#server?.off("error", reject)
                resolve()
            })
        })
    }

    async stop() {
        if (!this.#server) return

        const server = this.#server
        this.#server = null

        await new Promise<void>((resolve, reject) => {
            server.closeAllConnections?.()
            server.close((error) => {
                if (error) reject(error)
                else resolve()
            })
        })
    }

    private async handleRequest(request: IncomingMessage, response: ServerResponse) {
        try {
            if (request.method != "GET") {
                this.sendText(response, 405, "Method Not Allowed")
                return
            }

            const config = this.getConfig()
            const url = new URL(request.url ?? "/", "http://127.0.0.1")
            const route = matchTranscriptRoute(url.pathname, config.server.basePath)

            if (route.type == "health") {
                const summary = await this.service.getSummary()
                this.sendJson(response, 200, {
                    healthy: this.service.isHealthy(),
                    ...summary
                })
                return
            }

            if (!this.service.core.repository) {
                this.sendText(response, 503, "Transcript service is unavailable.")
                return
            }

            if (route.type == "transcript") {
                await this.serveTranscript(response, route.slug)
                return
            }

            if (route.type == "asset") {
                await this.serveAsset(response, route.slug, route.assetName)
                return
            }

            this.sendText(response, 404, "Not Found")
        } catch (error) {
            this.sendText(response, 500, error instanceof Error ? error.message : String(error))
        }
    }

    private async serveTranscript(response: ServerResponse, slug: string) {
        if (this.getConfig().links.access.mode == "private-discord") {
            this.sendText(response, 404, "Transcript not found.")
            return
        }

        const repository = this.getRepository()
        await this.service.core.normalizeExpiredLinks("public-route", { slug })
        const link = await repository.getTranscriptLinkBySlug(slug)
        if (!link) {
            this.sendText(response, 404, "Transcript not found.")
            return
        }
        if (link.status != "active") {
            this.sendText(response, 410, "Transcript link is no longer available.")
            return
        }

        const transcript = await repository.getTranscriptById(link.transcript_id)
        if (!transcript || !transcript.archivePath) {
            this.sendText(response, 404, "Transcript archive not found.")
            return
        }
        if (transcript.status == "revoked" || transcript.status == "deleted") {
            this.sendText(response, 410, "Transcript link is no longer available.")
            return
        }
        if (transcript.status != "active" && transcript.status != "partial") {
            this.sendText(response, 404, "Transcript archive not ready.")
            return
        }

        const htmlPath = ensurePathWithinRoot(transcript.archivePath, path.join(transcript.archivePath, "index.html"))
        if (!fs.existsSync(htmlPath)) {
            this.sendText(response, 404, "Transcript archive not found.")
            return
        }

        const html = await fs.promises.readFile(htmlPath, "utf8")
        const assetBase = this.buildAssetBasePath(slug)
        const renderedHtml = html.replaceAll(ASSET_BASE_PLACEHOLDER, assetBase)

        response.statusCode = 200
        response.setHeader("Cache-Control", "no-store")
        response.setHeader("Content-Security-Policy", buildTranscriptHtmlCsp())
        response.setHeader("Content-Type", HTML_CONTENT_TYPE)
        setNoSniffHeaders(response)
        response.end(renderedHtml)
    }

    private async serveAsset(response: ServerResponse, slug: string, assetName: string) {
        if (this.getConfig().links.access.mode == "private-discord") {
            this.sendText(response, 404, "Transcript not found.")
            return
        }

        const repository = this.getRepository()
        await this.service.core.normalizeExpiredLinks("public-route", { slug })
        const link = await repository.getTranscriptLinkBySlug(slug)
        if (!link) {
            this.sendText(response, 404, "Transcript not found.")
            return
        }
        if (link.status != "active") {
            this.sendText(response, 410, "Transcript link is no longer available.")
            return
        }

        const transcript = await repository.getTranscriptById(link.transcript_id)
        if (!transcript || !transcript.archivePath) {
            this.sendText(response, 404, "Transcript archive not found.")
            return
        }
        if (transcript.status == "revoked" || transcript.status == "deleted") {
            this.sendText(response, 410, "Transcript link is no longer available.")
            return
        }

        const asset = await repository.getTranscriptAsset(transcript.id, assetName)
        if (!asset || asset.status != "mirrored") {
            this.sendText(response, 404, "Transcript asset not found.")
            return
        }

        const assetPath = ensurePathWithinRoot(transcript.archivePath, path.join(transcript.archivePath, asset.local_path))
        if (!fs.existsSync(assetPath)) {
            this.sendText(response, 404, "Transcript asset not found.")
            return
        }

        response.statusCode = 200
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable")
        response.setHeader("Content-Type", asset.mime_type)
        setNoSniffHeaders(response)

        const stream = fs.createReadStream(assetPath)
        stream.on("error", () => {
            if (!response.headersSent) {
                this.sendText(response, 500, "Failed to read transcript asset.")
            } else {
                response.destroy()
            }
        })
        stream.pipe(response)
    }

    private buildAssetBasePath(slug: string) {
        const basePath = normalizeBasePath(this.getConfig().server.basePath)
        return (basePath == "" ? "" : basePath) + "/transcripts/" + encodeURIComponent(slug) + "/assets/"
    }

    private sendJson(response: ServerResponse, statusCode: number, payload: object) {
        response.statusCode = statusCode
        response.setHeader("Cache-Control", "no-store")
        response.setHeader("Content-Type", JSON_CONTENT_TYPE)
        setNoSniffHeaders(response)
        response.end(JSON.stringify(payload))
    }

    private sendText(response: ServerResponse, statusCode: number, message: string) {
        response.statusCode = statusCode
        response.setHeader("Cache-Control", "no-store")
        response.setHeader("Content-Type", TEXT_CONTENT_TYPE)
        setNoSniffHeaders(response)
        response.end(message)
    }

    private getConfig() {
        if (!this.service.core.config) {
            throw new Error("Transcript service is not initialized.")
        }

        return this.service.core.config
    }

    private getRepository() {
        if (!this.service.core.repository) {
            throw new Error("Transcript service repository is unavailable.")
        }

        return this.service.core.repository
    }
}
