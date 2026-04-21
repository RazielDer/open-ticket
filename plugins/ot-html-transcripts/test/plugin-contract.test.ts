import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import {
    TRANSCRIPT_COMMAND_ACTIONS,
    TRANSCRIPT_OPERATIONAL_SORTS,
    TRANSCRIPT_PLUGIN_CONFIG_ID,
    TRANSCRIPT_PLUGIN_ID,
    TRANSCRIPT_PLUGIN_OPTIONS_CHECKER_ID,
    TRANSCRIPT_PLUGIN_SERVICE_ID
} from "../contracts/constants.js"
import { createEmptyTranscriptSummary, createNotReadyActionResult } from "../contracts/factories.js"
import { DEFAULT_PLUGIN_CONFIG } from "../config/defaults.js"
import {
    buildTranscriptWorkbenchSection,
    buildTranscriptWorkbenchSections,
    createDashboardTranscriptPluginEntry,
    registerDashboardTranscriptWorkbench,
    resetDashboardTranscriptWorkbenchRegistrationForTests
} from "../dashboard-workbench.js"
import {
    emitTranscriptDeploymentWarnings,
    getTranscriptDeploymentWarnings,
    isLoopbackHost
} from "../config/deployment-warnings.js"
import {
    normalizeTicketOptionTranscriptRouting,
    normalizeTranscriptChannelIds,
    readTicketOptionTranscriptRoutingFromOptionsConfig,
    resolveEffectiveTranscriptChannelTargetsFromConfigs,
    validateTicketOptionTranscriptRoutingConfig
} from "../routing/option-routing.js"

function listImplementationFiles(root: string, relativeRoot = ""): string[] {
    const absoluteRoot = path.join(root, relativeRoot)
    const entries = fs.readdirSync(absoluteRoot, { withFileTypes: true })
    const files: string[] = []

    for (const entry of entries) {
        if (entry.name === "test" || entry.name === "test-support" || entry.name === ".test-runtime") {
            continue
        }

        const relativePath = relativeRoot ? path.join(relativeRoot, entry.name) : entry.name
        const absolutePath = path.join(root, relativePath)

        if (entry.isDirectory()) {
            try {
                files.push(...listImplementationFiles(root, relativePath))
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                    continue
                }
                throw error
            }
            continue
        }

        if (entry.isFile() && (relativePath.endsWith(".ts") || relativePath.endsWith(".json"))) {
            files.push(relativePath)
        }
    }

    return files
}

test("plugin manifest matches the slice 1 contract", () => {
    const pluginPath = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "plugin.json")
    const manifest = JSON.parse(fs.readFileSync(pluginPath, "utf8")) as Record<string, unknown>
    const npmDependencies = Array.isArray(manifest.npmDependencies) ? manifest.npmDependencies : []
    const vendoredYazlPath = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "vendor", "yazl.js")

    assert.equal(manifest.id, TRANSCRIPT_PLUGIN_ID)
    assert.deepEqual(manifest.supportedVersions, ["OTv4.1.x"])
    assert.deepEqual(npmDependencies, ["sqlite3"])
    assert.equal(fs.existsSync(vendoredYazlPath), true)
    assert.deepEqual(manifest.requiredPlugins, [])
    assert.deepEqual(manifest.incompatiblePlugins, [])
})

test("config defaults match the source spec", () => {
    const configPath = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "config.json")
    const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
    const shippedPublicBaseUrl = String(rawConfig?.server?.publicBaseUrl || "")

    assert.deepEqual(rawConfig, {
        ...DEFAULT_PLUGIN_CONFIG,
        server: {
            ...DEFAULT_PLUGIN_CONFIG.server,
            publicBaseUrl: shippedPublicBaseUrl
        },
        links: {
            ...DEFAULT_PLUGIN_CONFIG.links,
            access: {
                ...DEFAULT_PLUGIN_CONFIG.links.access,
                mode: String(rawConfig?.links?.access?.mode || "")
            }
        }
    })
    assert.equal(DEFAULT_PLUGIN_CONFIG.server.host, "127.0.0.1")
    assert.equal(DEFAULT_PLUGIN_CONFIG.server.port, 8456)
    assert.equal(DEFAULT_PLUGIN_CONFIG.links.slugBytes, 24)
    assert.equal(DEFAULT_PLUGIN_CONFIG.links.expiry.enabled, false)
    assert.equal(DEFAULT_PLUGIN_CONFIG.links.expiry.ttlDays, 30)
    assert.equal(DEFAULT_PLUGIN_CONFIG.links.access.mode, "public")
    assert.equal(DEFAULT_PLUGIN_CONFIG.assets.maxCountPerTranscript, 200)
    assert.equal(DEFAULT_PLUGIN_CONFIG.retention.enabled, false)
    assert.equal(DEFAULT_PLUGIN_CONFIG.retention.runOnStartup, true)
    assert.equal(DEFAULT_PLUGIN_CONFIG.retention.maxTranscriptsPerRun, 100)
    assert.equal(DEFAULT_PLUGIN_CONFIG.retention.statuses.failedDays, 30)
    assert.equal(DEFAULT_PLUGIN_CONFIG.retention.statuses.revokedDays, 365)
    assert.equal(DEFAULT_PLUGIN_CONFIG.retention.statuses.deletedDays, 7)
    assert.equal(String(rawConfig?.links?.access?.mode || ""), "private-discord")
    assert.equal(shippedPublicBaseUrl.trim(), "")
})

test("checker source enforces the slice 12 access-mode and expiry rules", () => {
    const checkerPath = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "config", "register-checker.ts")
    const checker = fs.readFileSync(checkerPath, "utf8")

    assert.equal(checker.includes("links:access"), true)
    assert.equal(checker.includes("private-discord"), true)
    assert.equal(checker.includes("dashboard-protected private viewer mode"), true)
    assert.equal(checker.includes("publicBaseUrl"), true)
    assert.equal(checker.includes("required when transcript link access mode is public"), true)
    assert.equal(checker.includes("ot-html-transcripts:config:links:expiry"), true)
    assert.equal(checker.includes("ot-html-transcripts:config:links:expiry:ttl-days"), true)
    assert.equal(checker.includes("slugBytes"), true)
    assert.equal(checker.includes("min: 16"), true)
    assert.equal(checker.includes("ttlDays"), true)
    assert.equal(checker.includes("min: 1"), true)
})

test("checker source adds plugin-owned ticket option transcript routing coverage", () => {
    const checkerPath = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "config", "register-checker.ts")
    const checker = fs.readFileSync(checkerPath, "utf8")

    assert.equal(checker.includes('"opendiscord:options"'), true)
    assert.equal(checker.includes("validateTicketOptionTranscriptRoutingConfig"), true)
    assert.equal(checker.includes("TRANSCRIPT_PLUGIN_OPTIONS_CHECKER_ID"), true)
})

test("contract constants remain aligned with slice 1 ids", () => {
    assert.equal(TRANSCRIPT_PLUGIN_CONFIG_ID, "ot-html-transcripts:config")
    assert.equal(TRANSCRIPT_PLUGIN_OPTIONS_CHECKER_ID, "ot-html-transcripts:options")
    assert.equal(TRANSCRIPT_PLUGIN_SERVICE_ID, "ot-html-transcripts:service")
    assert.deepEqual(TRANSCRIPT_COMMAND_ACTIONS, ["get", "revoke", "reissue", "delete"])
    assert.deepEqual(TRANSCRIPT_OPERATIONAL_SORTS, ["created-desc", "created-asc", "updated-desc", "updated-asc"])
})

test("ticket option transcript routing defaults to inheriting the global transcript channel", () => {
    const optionsConfig = [
        {
            id: "billing",
            type: "ticket"
        }
    ]
    const transcriptsConfig = {
        general: {
            enableChannel: true,
            channel: "123456789012345678"
        }
    }

    assert.deepEqual(normalizeTicketOptionTranscriptRouting(undefined), {
        useGlobalDefault: true,
        channels: []
    })
    assert.deepEqual(readTicketOptionTranscriptRoutingFromOptionsConfig(optionsConfig, "billing"), {
        useGlobalDefault: true,
        channels: []
    })
    assert.deepEqual(resolveEffectiveTranscriptChannelTargetsFromConfigs(optionsConfig, transcriptsConfig, "billing"), {
        optionId: "billing",
        useGlobalDefault: true,
        channels: [],
        source: "global-default",
        targets: ["123456789012345678"]
    })
})

test("inherited global routing only uses the configured channel when the legacy toggle is enabled and the value is non-empty", () => {
    const optionsConfig = [
        {
            id: "billing",
            type: "ticket"
        }
    ]

    assert.deepEqual(resolveEffectiveTranscriptChannelTargetsFromConfigs(optionsConfig, {
        general: {
            enableChannel: false,
            channel: "123456789012345678"
        }
    }, "billing")?.targets, [])

    assert.deepEqual(resolveEffectiveTranscriptChannelTargetsFromConfigs(optionsConfig, {
        general: {
            enableChannel: true,
            channel: "   "
        }
    }, "billing")?.targets, [])
})

test("explicit override channels are normalized by trim and dedupe rules", () => {
    const optionsConfig = [
        {
            id: "billing",
            type: "ticket",
            transcripts: {
                useGlobalDefault: false,
                channels: [" 123456789012345678 ", "", "234567890123456789", "123456789012345678"]
            }
        }
    ]

    assert.deepEqual(normalizeTranscriptChannelIds([" 123456789012345678 ", "", "234567890123456789", "123456789012345678", 1]), [
        "123456789012345678",
        "234567890123456789"
    ])
    assert.deepEqual(readTicketOptionTranscriptRoutingFromOptionsConfig(optionsConfig, "billing"), {
        useGlobalDefault: false,
        channels: ["123456789012345678", "234567890123456789"]
    })
})

test("explicit override routing is resolved even when the global toggle is off", () => {
    const optionsConfig = [
        {
            id: "billing",
            type: "ticket",
            transcripts: {
                useGlobalDefault: false,
                channels: ["123456789012345678", "234567890123456789"]
            }
        }
    ]

    assert.deepEqual(resolveEffectiveTranscriptChannelTargetsFromConfigs(optionsConfig, {
        general: {
            enableChannel: false,
            channel: "999999999999999999"
        }
    }, "billing"), {
        optionId: "billing",
        useGlobalDefault: false,
        channels: ["123456789012345678", "234567890123456789"],
        source: "option-override",
        targets: ["123456789012345678", "234567890123456789"]
    })
})

test("explicit empty override disables transcript channel posting for that option", () => {
    const optionsConfig = [
        {
            id: "billing",
            type: "ticket",
            transcripts: {
                useGlobalDefault: false,
                channels: []
            }
        }
    ]

    assert.deepEqual(resolveEffectiveTranscriptChannelTargetsFromConfigs(optionsConfig, {
        general: {
            enableChannel: true,
            channel: "123456789012345678"
        }
    }, "billing"), {
        optionId: "billing",
        useGlobalDefault: false,
        channels: [],
        source: "disabled",
        targets: []
    })
})

test("non-ticket options ignore the plugin-owned transcript routing helper", () => {
    const optionsConfig = [
        {
            id: "billing",
            type: "role",
            transcripts: {
                useGlobalDefault: false,
                channels: ["123456789012345678"]
            }
        }
    ]

    assert.equal(readTicketOptionTranscriptRoutingFromOptionsConfig(optionsConfig, "billing"), null)
    assert.equal(resolveEffectiveTranscriptChannelTargetsFromConfigs(optionsConfig, {
        general: {
            enableChannel: true,
            channel: "123456789012345678"
        }
    }, "billing"), null)
})

test("plugin-owned routing validation reports malformed ticket-option transcript values", () => {
    const issues = validateTicketOptionTranscriptRoutingConfig([
        {
            id: "billing",
            type: "ticket",
            transcripts: {
                useGlobalDefault: "nope",
                channels: "123456789012345678"
            }
        },
        {
            id: "support",
            type: "ticket",
            transcripts: {
                useGlobalDefault: false,
                channels: ["123456789012345678", 123, "bad-id", "   ", "123456789012345678"]
            }
        },
        {
            id: "role-option",
            type: "role",
            transcripts: {
                useGlobalDefault: "ignored",
                channels: [123]
            }
        }
    ])

    assert.deepEqual(issues.map((issue) => issue.id), [
        "ot-html-transcripts:options:use-global-default-invalid-type",
        "ot-html-transcripts:options:channels-invalid-type",
        "ot-html-transcripts:options:channel-invalid-type",
        "ot-html-transcripts:options:channel-invalid-id"
    ])
    assert.deepEqual(issues.map((issue) => issue.path), [
        [0, "transcripts", "useGlobalDefault"],
        [0, "transcripts", "channels"],
        [1, "transcripts", "channels", 1],
        [1, "transcripts", "channels", 2]
    ])
})

test("summary and action factories return the expected default results", () => {
    assert.deepEqual(createEmptyTranscriptSummary(), {
        total: 0,
        active: 0,
        partial: 0,
        revoked: 0,
        deleted: 0,
        failed: 0,
        building: 0,
        totalArchiveBytes: 0,
        queueDepth: 0,
        recoveredBuilds: 0
    })

    assert.deepEqual(createNotReadyActionResult("get", "ticket-123"), {
        ok: false,
        action: "get",
        target: "ticket-123",
        status: "not-ready",
        message: "The local transcript service is not healthy.",
        reason: undefined
    })
})

test("plugin implementation does not reference the external HTML transcript service domain", () => {
    const pluginRoot = path.resolve(process.cwd(), "plugins", "ot-html-transcripts")
    const sourceFiles = listImplementationFiles(pluginRoot)

    for (const relativePath of sourceFiles) {
        const absolutePath = path.join(pluginRoot, relativePath)
        const contents = fs.readFileSync(absolutePath, "utf8")
        assert.equal(contents.includes("t.dj-dj.be"), false, "unexpected external transcript domain reference in " + relativePath)
    }
})

test("README service docs stay aligned with the production operator surface", () => {
    const readmePath = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "README.md")
    const readme = fs.readFileSync(readmePath, "utf8")

    assert.equal(readme.includes("## Requirements"), true)
    assert.equal(readme.includes("Public transcript links work with `ot-html-transcripts` alone"), true)
    assert.equal(readme.includes("dashboard-protected private viewer mode"), true)
    assert.equal(readme.includes("ot-sqlite-database` is not required"), true)
    assert.equal(readme.includes("links.expiry.enabled"), true)
    assert.equal(readme.includes("links.expiry.ttlDays"), true)
    assert.equal(readme.includes("links.access.mode"), true)
    assert.equal(readme.includes("private-discord"), true)
    assert.equal(readme.includes("global/default transcript channel"), true)
    assert.equal(readme.includes("Per-option transcript routing is plugin-owned and additive"), true)
    assert.equal(readme.includes("dashboard ticket option editor"), true)
    assert.equal(readme.includes("transcripts.useGlobalDefault"), true)
    assert.equal(readme.includes("transcripts.channels"), true)
    assert.equal(readme.includes("Use global transcript default"), false)
    assert.equal(readme.includes("plugin public transcript routes intentionally return `404` in private mode"), true)
    assert.equal(readme.includes("expired links return `410 Gone`"), true)
    assert.equal(readme.includes("listOperationalTranscripts(query)"), true)
    assert.equal(readme.includes("creatorId"), true)
    assert.equal(readme.includes("channelId"), true)
    assert.equal(readme.includes("createdFrom"), true)
    assert.equal(readme.includes("createdTo"), true)
    assert.equal(readme.includes("created-desc"), true)
    assert.equal(readme.includes("updated-asc"), true)
    assert.equal(readme.includes("matchingSummary"), true)
    assert.equal(readme.includes("getAccessPolicy()"), true)
    assert.equal(readme.includes("listTranscriptStylePresets()"), true)
    assert.equal(readme.includes("renderTranscriptStylePreview(styleDraft)"), true)
    assert.equal(readme.includes("listTranscriptEvents(target, query)"), true)
    assert.equal(readme.includes("previewRetentionSweep()"), true)
    assert.equal(readme.includes("getIntegritySummary()"), true)
    assert.equal(readme.includes("prepareTranscriptExport(target, format?)"), true)
    assert.equal(readme.includes("prepareBulkTranscriptExport(ids)"), true)
    assert.equal(readme.includes("releasePreparedTranscriptExport(exportId)"), true)
    assert.equal(readme.includes("bulkRevokeTranscripts(ids, reason?)"), true)
    assert.equal(readme.includes("bulkDeleteTranscripts(ids, reason?)"), true)
    assert.equal(readme.includes("renderViewerTranscript(slug, viewerUserId, assetBasePath, viewerAccess)"), true)
    assert.equal(readme.includes("resolveViewerTranscriptAsset(slug, assetName, viewerUserId, viewerAccess)"), true)
    assert.equal(readme.includes("successful private viewer document opens"), true)
    assert.equal(readme.includes("dashboard-side draft helpers only"), true)
    assert.equal(readme.includes("local/dev public URL (`http://127.0.0.1:8456`)"), true)
    assert.equal(readme.includes("plugin logs additive deployment warnings"), true)
    assert.equal(readme.includes("maintained operator contract"), true)
    assert.equal(readme.includes("Before treating a deployment as ready"), true)
    assert.equal(readme.includes("enhancement kernel"), false)
    assert.equal(readme.includes("## Workflow docs"), false)
    assert.equal(readme.includes("workflow.yaml"), false)
})

test("deployment warning helper matches the locked slice 18 cases", () => {
    assert.equal(isLoopbackHost("127.0.0.1"), true)
    assert.equal(isLoopbackHost("localhost"), true)
    assert.equal(isLoopbackHost("::1"), true)
    assert.equal(isLoopbackHost("[::1]"), true)
    assert.equal(isLoopbackHost("::ffff:127.0.0.1"), true)
    assert.equal(isLoopbackHost("0.0.0.0"), false)

    assert.deepEqual(getTranscriptDeploymentWarnings({
        server: {
            host: "0.0.0.0",
            publicBaseUrl: "https://transcripts.example"
        },
        links: {
            access: {
                mode: "public"
            }
        }
    } as any).map((warning) => warning.code), ["server-bind-public"])

    assert.deepEqual(getTranscriptDeploymentWarnings({
        server: {
            host: "127.0.0.1",
            publicBaseUrl: "http://127.0.0.1:8456"
        },
        links: {
            access: {
                mode: "public"
            }
        }
    } as any).map((warning) => warning.code), ["public-url-loopback"])

    assert.deepEqual(getTranscriptDeploymentWarnings({
        server: {
            host: "127.0.0.1",
            publicBaseUrl: "http://transcripts.example"
        },
        links: {
            access: {
                mode: "public"
            }
        }
    } as any).map((warning) => warning.code), ["public-url-http"])

    assert.deepEqual(getTranscriptDeploymentWarnings({
        server: {
            host: "127.0.0.1",
            publicBaseUrl: "https://transcripts.example"
        },
        links: {
            access: {
                mode: "public"
            }
        }
    } as any), [])

    assert.deepEqual(getTranscriptDeploymentWarnings({
        server: {
            host: "127.0.0.1",
            publicBaseUrl: ""
        },
        links: {
            access: {
                mode: "private-discord"
            }
        }
    } as any), [])
})

test("deployment warning emission reports one startup warning per detected warning code", () => {
    const emitted: Array<{ code: string; message: string }> = []

    const warnings = emitTranscriptDeploymentWarnings({
        server: {
            host: "0.0.0.0",
            publicBaseUrl: "http://127.0.0.1:8456"
        },
        links: {
            access: {
                mode: "public"
            }
        }
    } as any, (warning) => {
        emitted.push(warning)
    })

    assert.deepEqual(warnings.map((warning) => warning.code), ["server-bind-public", "public-url-loopback"])
    assert.deepEqual(emitted, warnings)
})

test("dashboard viewer readiness warnings mention whitelist submit and the dedicated transcript archive lane", () => {
    const dashboardConfigPath = path.resolve(process.cwd(), "plugins", "ot-dashboard", "server", "dashboard-config.ts")
    const dashboardConfigSource = fs.readFileSync(dashboardConfigPath, "utf8")
    const localePath = path.resolve(process.cwd(), "plugins", "ot-dashboard", "locales", "english.json")
    const locale = JSON.parse(fs.readFileSync(localePath, "utf8")) as {
        transcripts?: {
            access?: {
                privateModeBody?: string
            }
        }
    }

    assert.equal(dashboardConfigSource.includes("Whitelist review submit stays blocked"), true)
    assert.match(locale.transcripts?.access?.privateModeBody || "", /dedicated OT-guild transcript archive lane/i)
})

test("dashboard transcript workbench helper builds the locked slice 15 workbench shape", async () => {
    const summary = {
        total: 12,
        active: 10,
        partial: 1,
        revoked: 1,
        deleted: 2,
        failed: 3,
        building: 4,
        totalArchiveBytes: 5242880,
        queueDepth: 5,
        recoveredBuilds: 6
    }
    let summaryCalls = 0
    const section = await buildTranscriptWorkbenchSection({
        configs: {
            get(id: string) {
                assert.equal(id, "opendiscord:transcripts")
                return {
                    data: {
                        general: {
                            mode: "html"
                        }
                    }
                }
            }
        },
        plugins: {
            classes: {
                get(id: string) {
                    assert.equal(id, TRANSCRIPT_PLUGIN_SERVICE_ID)
                    return {
                        isHealthy() {
                            return true
                        },
                        async getSummary() {
                            summaryCalls += 1
                            return summary
                        }
                    }
                }
            }
        }
    }, {
        basePath: "/dash",
        buildPath(...segments: string[]) {
            return `/dash/${segments.join("/")}`
        }
    })

    assert.equal(summaryCalls, 1)
    assert.deepEqual(section, {
        type: "workbench",
        id: "transcript-workspace",
        title: "Transcript workspace",
        badge: {
            label: "Ready",
            tone: "success"
        },
        body: "Configured mode: HTML. Global transcript settings provide the default channel; ticket option overrides live in the ticket option editor. The transcript service is available.",
        summaryItems: [
            { label: "Integration", value: "Ready", detail: "The transcript service is available." },
            { label: "Archived transcripts", value: "12", detail: "10 active, 1 partial, 1 revoked" },
            { label: "Failures", value: "3", detail: "2 deleted, 4 building" },
            { label: "Archive size", value: "5.0 MB", detail: "5 queued, 6 recovered on startup" }
        ],
        actions: [
            { label: "Open transcript workspace", href: "/dash/admin/transcripts" },
            { label: "Open transcript settings", href: "/dash/visual/transcripts" }
        ]
    })
})

test("dashboard transcript workbench helper keeps the ready badge but degrades summary cards when summary loading fails", async () => {
    const section = await buildTranscriptWorkbenchSection({
        configs: {
            get() {
                return {
                    data: {
                        general: {
                            mode: "html"
                        }
                    }
                }
            }
        },
        plugins: {
            classes: {
                get() {
                    return {
                        isHealthy() {
                            return true
                        },
                        async getSummary() {
                            throw new Error("summary failed")
                        }
                    }
                }
            }
        }
    }, {
        basePath: "/dash",
        buildPath(...segments: string[]) {
            return `/dash/${segments.join("/")}`
        }
    })

    assert.equal(section.badge?.label, "Ready")
    assert.equal(section.summaryItems?.[0]?.value, "Ready")
    assert.equal(section.summaryItems?.[1]?.value, "Unavailable")
    assert.equal(section.summaryItems?.[2]?.value, "Unavailable")
    assert.equal(section.summaryItems?.[3]?.value, "Unavailable")
})

test("dashboard transcript workbench sections append deployment notices after the existing workbench when warnings exist", async () => {
    const sections = await buildTranscriptWorkbenchSections({
        configs: {
            get(id: string) {
                if (id == "opendiscord:transcripts") {
                    return {
                        data: {
                            general: {
                                mode: "html"
                            }
                        }
                    }
                }

                if (id == TRANSCRIPT_PLUGIN_CONFIG_ID) {
                    return {
                        data: {
                            server: {
                                host: "0.0.0.0",
                                publicBaseUrl: "http://transcripts.example"
                            },
                            links: {
                                access: {
                                    mode: "public"
                                }
                            }
                        }
                    }
                }

                return null
            }
        },
        plugins: {
            classes: {
                get() {
                    return null
                }
            }
        }
    }, {
        basePath: "/dash",
        buildPath(...segments: string[]) {
            return `/dash/${segments.join("/")}`
        }
    })

    assert.equal(sections.length, 3)
    assert.equal(sections[0]?.type, "workbench")
    assert.deepEqual(sections.slice(1), [
        {
            type: "notice",
            id: "transcript-deployment-warning-server-bind-public",
            title: "Deployment warning",
            tone: "warning",
            body: "Transcript HTTP server is not loopback-only. Bind it to 127.0.0.1 and publish it through Cloudflare or another trusted reverse proxy."
        },
        {
            type: "notice",
            id: "transcript-deployment-warning-public-url-http",
            title: "Deployment warning",
            tone: "warning",
            body: "Public transcript links use http. Put the transcript origin behind HTTPS at the edge before exposing it."
        }
    ])
})

test("dashboard transcript workbench registration soft-fails without the dashboard API and only registers once per process", () => {
    resetDashboardTranscriptWorkbenchRegistrationForTests()

    const runtime = {
        configs: {
            get() {
                return {
                    data: {
                        general: {
                            mode: "html"
                        }
                    }
                }
            }
        },
        plugins: {
            classes: {
                get() {
                    return null
                }
            }
        }
    }

    assert.equal(registerDashboardTranscriptWorkbench(runtime, {} as typeof globalThis), false)

    const entries: any[] = []
    const registered = registerDashboardTranscriptWorkbench(runtime, {
        [Symbol.for("open-ticket.ot-dashboard")]: {
            registerPluginEntry(entry: any) {
                entries.push(entry)
            }
        }
    } as typeof globalThis)
    assert.equal(registered, true)
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.pluginId, TRANSCRIPT_PLUGIN_ID)
    assert.equal(typeof entries[0]?.buildSections, "function")
    assert.equal(registerDashboardTranscriptWorkbench(runtime, {
        [Symbol.for("open-ticket.ot-dashboard")]: {
            registerPluginEntry(entry: any) {
                entries.push(entry)
            }
        }
    } as typeof globalThis), false)
    assert.equal(entries.length, 1)

    resetDashboardTranscriptWorkbenchRegistrationForTests()
})

test("dashboard transcript plugin entry exposes the provider-built workbench section contract", async () => {
    const entry = createDashboardTranscriptPluginEntry({
        configs: {
            get() {
                return {
                    data: {
                        general: {
                            mode: "text"
                        }
                    }
                }
            }
        },
        plugins: {
            classes: {
                get() {
                    return null
                }
            }
        }
    })

    assert.equal(entry.pluginId, TRANSCRIPT_PLUGIN_ID)
    const sections = await entry.buildSections?.({
        basePath: "/dash",
        buildPath(...segments: string[]) {
            return `/dash/${segments.join("/")}`
        }
    })
    assert.equal(sections?.length, 1)
    assert.equal(sections?.[0]?.type, "workbench")
    assert.equal(
        sections?.[0]?.body,
        "Configured mode: TEXT. Global transcript settings provide the default channel; ticket option overrides live in the ticket option editor. The transcript service is not available in the runtime registry."
    )
})

test("plugin entrypoint wires dashboard workbench registration into bootstrap", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "index.ts"), "utf8")

    assert.equal(source.includes('import { registerWrappedTextTranscriptCompiler } from "./compiler/text-compiler"'), true)
    assert.equal(source.includes('import { emitTranscriptDeploymentWarnings } from "./config/deployment-warnings"'), true)
    assert.equal(source.includes('import { registerDashboardTranscriptWorkbench } from "./dashboard-workbench"'), true)
    assert.equal(source.includes("registerWrappedTextTranscriptCompiler()"), true)
    assert.equal(source.includes("emitTranscriptDeploymentWarnings(config.data"), true)
    assert.equal(source.includes("registerDashboardTranscriptWorkbench(opendiscord as any)"), true)
})
