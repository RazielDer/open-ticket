import type { OTHtmlTranscriptsConfigData } from "../contracts/types"

export const DEFAULT_PLUGIN_CONFIG: OTHtmlTranscriptsConfigData = {
    server: {
        host: "127.0.0.1",
        port: 8456,
        basePath: "/",
        publicBaseUrl: ""
    },
    storage: {
        archiveRoot: "./runtime/ot-html-transcripts/transcripts",
        sqlitePath: "./database/ot-html-transcripts.sqlite"
    },
    links: {
        slugBytes: 24,
        expiry: {
            enabled: false,
            ttlDays: 30
        },
        access: {
            mode: "public"
        }
    },
    queue: {
        maxActiveTranscripts: 1,
        maxAssetFetches: 4
    },
    assets: {
        maxBytesPerFile: 26214400,
        maxBytesPerTranscript: 262144000,
        maxCountPerTranscript: 200
    },
    retention: {
        enabled: false,
        runOnStartup: true,
        maxTranscriptsPerRun: 100,
        statuses: {
            failedDays: 30,
            revokedDays: 365,
            deletedDays: 7
        }
    }
}
