import { api, opendiscord } from "#opendiscord"

import { TRANSCRIPT_PLUGIN_CONFIG_ID, TRANSCRIPT_PLUGIN_OPTIONS_CHECKER_ID } from "../contracts/constants"
import { validateTicketOptionTranscriptRoutingConfig } from "../routing/option-routing"

export function registerTranscriptPluginChecker() {
    opendiscord.events.get("onCheckerLoad").listen((checkers) => {
        const config = opendiscord.configs.get(TRANSCRIPT_PLUGIN_CONFIG_ID)
        const optionsConfig = opendiscord.configs.get("opendiscord:options")

        const structure = new api.ODCheckerObjectStructure("ot-html-transcripts:config", {
            children: [
                {
                    key: "server",
                    optional: false,
                    priority: 0,
                    checker: new api.ODCheckerObjectStructure("ot-html-transcripts:config:server", {
                        children: [
                            { key: "host", optional: false, priority: 0, checker: new api.ODCheckerStringStructure("ot-html-transcripts:config:server:host", { minLength: 1 }) },
                            { key: "port", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:server:port", { floatAllowed: false, min: 1 }) },
                            { key: "basePath", optional: false, priority: 0, checker: new api.ODCheckerStringStructure("ot-html-transcripts:config:server:basePath", { minLength: 1 }) },
                            {
                                key: "publicBaseUrl",
                                optional: false,
                                priority: 0,
                                checker: new api.ODCheckerStringStructure("ot-html-transcripts:config:server:publicBaseUrl", { minLength: 0 })
                            }
                        ]
                    })
                },
                {
                    key: "storage",
                    optional: false,
                    priority: 0,
                    checker: new api.ODCheckerObjectStructure("ot-html-transcripts:config:storage", {
                        children: [
                            { key: "archiveRoot", optional: false, priority: 0, checker: new api.ODCheckerStringStructure("ot-html-transcripts:config:storage:archiveRoot", { minLength: 1 }) },
                            { key: "sqlitePath", optional: false, priority: 0, checker: new api.ODCheckerStringStructure("ot-html-transcripts:config:storage:sqlitePath", { minLength: 1 }) }
                        ]
                    })
                },
                {
                    key: "links",
                    optional: false,
                    priority: 0,
                    checker: new api.ODCheckerObjectStructure("ot-html-transcripts:config:links", {
                        children: [
                            { key: "slugBytes", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:links:slugBytes", { floatAllowed: false, min: 16 }) },
                            {
                                key: "expiry",
                                optional: false,
                                priority: 0,
                                checker: new api.ODCheckerObjectStructure("ot-html-transcripts:config:links:expiry", {
                                    children: [
                                        { key: "enabled", optional: false, priority: 0, checker: new api.ODCheckerBooleanStructure("ot-html-transcripts:config:links:expiry:enabled", {}) },
                                        { key: "ttlDays", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:links:expiry:ttl-days", { floatAllowed: false, min: 1 }) }
                                    ]
                                })
                            },
                            {
                                key: "access",
                                optional: false,
                                priority: 0,
                                checker: new api.ODCheckerObjectStructure("ot-html-transcripts:config:links:access", {
                                    children: [
                                        {
                                            key: "mode",
                                            optional: false,
                                            priority: 0,
                                            checker: new api.ODCheckerStringStructure("ot-html-transcripts:config:links:access:mode", {
                                                minLength: 1,
                                                custom: (checker, value, locationTrace, locationId, locationDocs) => {
                                                    if (value == "public" || value == "private-discord") {
                                                        return true
                                                    }

                                                    checker.createMessage(
                                                        "ot-html-transcripts:config:links:access:mode-invalid",
                                                        "error",
                                                        "Transcript link access mode must be either public or the dashboard-protected private viewer mode (private-discord).",
                                                        checker.locationTraceDeref(locationTrace),
                                                        null,
                                                        [],
                                                        locationId,
                                                        locationDocs
                                                    )
                                                    return false
                                                }
                                            })
                                        }
                                    ]
                                })
                            }
                        ]
                    })
                },
                {
                    key: "queue",
                    optional: false,
                    priority: 0,
                    checker: new api.ODCheckerObjectStructure("ot-html-transcripts:config:queue", {
                        children: [
                            { key: "maxActiveTranscripts", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:queue:maxActiveTranscripts", { floatAllowed: false, min: 1 }) },
                            { key: "maxAssetFetches", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:queue:maxAssetFetches", { floatAllowed: false, min: 1 }) }
                        ]
                    })
                },
                {
                    key: "assets",
                    optional: false,
                    priority: 0,
                    checker: new api.ODCheckerObjectStructure("ot-html-transcripts:config:assets", {
                        children: [
                            { key: "maxBytesPerFile", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:assets:maxBytesPerFile", { floatAllowed: false, min: 1 }) },
                            { key: "maxBytesPerTranscript", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:assets:maxBytesPerTranscript", { floatAllowed: false, min: 1 }) },
                            { key: "maxCountPerTranscript", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:assets:maxCountPerTranscript", { floatAllowed: false, min: 1 }) }
                        ]
                    })
                },
                {
                    key: "retention",
                    optional: false,
                    priority: 0,
                    checker: new api.ODCheckerObjectStructure("ot-html-transcripts:config:retention", {
                        children: [
                            { key: "enabled", optional: false, priority: 0, checker: new api.ODCheckerBooleanStructure("ot-html-transcripts:config:retention:enabled", {}) },
                            { key: "runOnStartup", optional: false, priority: 0, checker: new api.ODCheckerBooleanStructure("ot-html-transcripts:config:retention:run-on-startup", {}) },
                            { key: "maxTranscriptsPerRun", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:retention:max-per-run", { floatAllowed: false, min: 1 }) },
                            {
                                key: "statuses",
                                optional: false,
                                priority: 0,
                                checker: new api.ODCheckerObjectStructure("ot-html-transcripts:config:retention:statuses", {
                                    children: [
                                        { key: "failedDays", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:retention:failed-days", { floatAllowed: false, min: 0 }) },
                                        { key: "revokedDays", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:retention:revoked-days", { floatAllowed: false, min: 0 }) },
                                        { key: "deletedDays", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-html-transcripts:config:retention:deleted-days", { floatAllowed: false, min: 0 }) }
                                    ]
                                })
                            }
                        ]
                    })
                }
            ],
            custom: (checker, value, locationTrace, locationId, locationDocs) => {
                if (!value || typeof value != "object" || Array.isArray(value)) {
                    return false
                }

                const candidate = value as {
                    server?: { publicBaseUrl?: string }
                    links?: { access?: { mode?: string } }
                }

                const accessMode = candidate.links?.access?.mode
                const publicBaseUrl = typeof candidate.server?.publicBaseUrl == "string"
                    ? candidate.server.publicBaseUrl.trim()
                    : ""
                const trace = checker.locationTraceDeref(locationTrace)
                trace.push("server")
                trace.push("publicBaseUrl")

                const invalidUrl = (() => {
                    if (publicBaseUrl.length == 0) {
                        return false
                    }

                    try {
                        const parsed = new URL(publicBaseUrl)
                        return parsed.protocol != "http:" && parsed.protocol != "https:"
                    } catch {
                        return true
                    }
                })()

                if (accessMode == "public" && publicBaseUrl.length == 0) {
                    const trace = checker.locationTraceDeref(locationTrace)
                    trace.push("server")
                    trace.push("publicBaseUrl")
                    checker.createMessage(
                        "ot-html-transcripts:config:server:publicBaseUrl-required",
                        "error",
                        "server.publicBaseUrl is required when transcript link access mode is public.",
                        trace,
                        null,
                        [],
                        locationId,
                        locationDocs
                    )
                    return false
                }

                if ((accessMode == "public" || publicBaseUrl.length > 0) && invalidUrl) {
                    checker.createMessage(
                        "ot-html-transcripts:config:server:publicBaseUrl-invalid",
                        "error",
                        "server.publicBaseUrl must be an absolute http or https URL when transcript link access mode is public.",
                        trace,
                        null,
                        [],
                        locationId,
                        locationDocs
                    )
                    return false
                }

                return true
            }
        })

        checkers.add(new api.ODChecker(TRANSCRIPT_PLUGIN_CONFIG_ID, checkers.storage, 0, config, structure))
        checkers.add(new api.ODChecker(
            TRANSCRIPT_PLUGIN_OPTIONS_CHECKER_ID,
            checkers.storage,
            0,
            optionsConfig,
            new api.ODCheckerStructure(TRANSCRIPT_PLUGIN_OPTIONS_CHECKER_ID, {
                custom: (checker, value, _locationTrace, locationId, locationDocs) => {
                    if (!Array.isArray(value)) {
                        return true
                    }

                    const issues = validateTicketOptionTranscriptRoutingConfig(value)
                    issues.forEach((issue) => {
                        checker.createMessage(
                            issue.id,
                            "error",
                            issue.message,
                            checker.locationTraceDeref(issue.path),
                            null,
                            [],
                            locationId,
                            locationDocs
                        )
                    })

                    return issues.length == 0
                }
            })
        ))
    })
}
