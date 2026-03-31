import * as fs from "fs"
import path from "path"

import { DEFAULT_PLUGIN_CONFIG } from "../config/defaults.js"
import type { OTHtmlTranscriptService } from "../service/transcript-service.js"

export function createTestConfig(testName: string) {
    const safeName = testName.replaceAll(/[^a-z0-9-]/gi, "-").toLowerCase()
    const root = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", ".test-runtime", safeName)

    return {
        root,
        config: {
            ...DEFAULT_PLUGIN_CONFIG,
            server: {
                ...DEFAULT_PLUGIN_CONFIG.server,
                port: 0,
                publicBaseUrl: "http://127.0.0.1"
            },
            links: {
                ...DEFAULT_PLUGIN_CONFIG.links,
                expiry: {
                    ...DEFAULT_PLUGIN_CONFIG.links.expiry
                }
            },
            storage: {
                archiveRoot: path.join(root, "archives"),
                sqlitePath: path.join(root, "database", "transcripts.sqlite")
            },
            retention: {
                ...DEFAULT_PLUGIN_CONFIG.retention,
                statuses: {
                    ...DEFAULT_PLUGIN_CONFIG.retention.statuses
                }
            }
        }
    }
}

export async function withPluginService(testName: string, callback: (service: OTHtmlTranscriptService, root: string) => Promise<void>) {
    const { config, root } = createTestConfig(testName)
    await fs.promises.rm(root, { recursive: true, force: true })

    const { OTHtmlTranscriptService } = await import("../service/transcript-service.js")
    const service = new OTHtmlTranscriptService()
    await service.initialize(config)

    try {
        await callback(service, root)
    } finally {
        await service.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
}
