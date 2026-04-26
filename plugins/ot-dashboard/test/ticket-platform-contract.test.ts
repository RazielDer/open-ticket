import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"

import {
  ODTICKET_PLATFORM_METADATA_DEFAULTS,
  ODTICKET_PLATFORM_METADATA_IDS,
  TICKET_PLATFORM_STOCK_ACTION_IDS,
  appendMissingTicketPlatformMetadataFields,
  clearTicketPlatformRuntimeApiForTests,
  createDefaultTicketPlatformMetadata,
  createTicketPlatformMetadataEntries,
  installTicketPlatformRuntimeApi,
  resolveTicketAiAssistProfileState,
  resolveTicketIntegrationProfileState,
  sealTicketPlatformRuntimeApi
} from "../../../src/core/api/openticket/ticket-platform.js"
import {
  clearDashboardRuntimeRegistry,
  getDashboardRuntimeSnapshot,
  listDashboardTickets,
  registerDashboardRuntime
} from "../server/dashboard-runtime-registry.js"

test("ticket platform metadata helper keeps the locked ids and defaults", () => {
  assert.deepEqual(ODTICKET_PLATFORM_METADATA_IDS, {
    transportMode: "opendiscord:transport-mode",
    transportParentChannelId: "opendiscord:transport-parent-channel",
    transportParentMessageId: "opendiscord:transport-parent-message",
    assignedTeamId: "opendiscord:assigned-team",
    assignedStaffUserId: "opendiscord:assigned-staff",
    assignmentStrategy: "opendiscord:assignment-strategy",
    firstStaffResponseAt: "opendiscord:first-staff-response-on",
    resolvedAt: "opendiscord:resolved-on",
    awaitingUserState: "opendiscord:awaiting-user-state",
    awaitingUserSince: "opendiscord:awaiting-user-since",
    closeRequestState: "opendiscord:close-request-state",
    closeRequestBy: "opendiscord:close-request-by",
    closeRequestAt: "opendiscord:close-request-on",
    integrationProfileId: "opendiscord:integration-profile",
    aiAssistProfileId: "opendiscord:ai-assist-profile"
  })

  assert.deepEqual(createDefaultTicketPlatformMetadata(), ODTICKET_PLATFORM_METADATA_DEFAULTS)
})

test("ticket platform stock action ids stay fixed for provider locks", () => {
  assert.deepEqual(TICKET_PLATFORM_STOCK_ACTION_IDS, [
    "claim",
    "unclaim",
    "assign",
    "escalate",
    "move",
    "transfer",
    "add-participant",
    "remove-participant",
    "set-priority",
    "set-topic",
    "close",
    "reopen",
    "delete",
    "pin",
    "unpin",
    "rename",
    "request-close",
    "cancel-close-request",
    "approve-close-request",
    "dismiss-close-request",
    "set-awaiting-user",
    "clear-awaiting-user"
  ])
})

test("ticket platform metadata backfill appends only missing fields and preserves existing values", () => {
  const rawTicketData = [
    { id: "opendiscord:opened-by", value: "user-1" },
    { id: ODTICKET_PLATFORM_METADATA_IDS.transportMode, value: "private_thread" },
    { id: ODTICKET_PLATFORM_METADATA_IDS.assignedTeamId, value: "team-1" },
    { id: ODTICKET_PLATFORM_METADATA_IDS.resolvedAt, value: 1234567890 }
  ]

  const changed = appendMissingTicketPlatformMetadataFields(rawTicketData as never)
  const changedAgain = appendMissingTicketPlatformMetadataFields(rawTicketData as never)
  const metadataEntries = Object.fromEntries(
    rawTicketData
      .filter((entry) => Object.values(ODTICKET_PLATFORM_METADATA_IDS).includes(entry.id))
      .map((entry) => [entry.id, entry.value])
  )

  assert.equal(changed, true)
  assert.equal(changedAgain, false)
  assert.deepEqual(metadataEntries, {
    "opendiscord:transport-mode": "private_thread",
    "opendiscord:transport-parent-channel": null,
    "opendiscord:transport-parent-message": null,
    "opendiscord:assigned-team": "team-1",
    "opendiscord:assigned-staff": null,
    "opendiscord:assignment-strategy": null,
    "opendiscord:first-staff-response-on": null,
    "opendiscord:resolved-on": 1234567890,
    "opendiscord:awaiting-user-state": null,
    "opendiscord:awaiting-user-since": null,
    "opendiscord:close-request-state": null,
    "opendiscord:close-request-by": null,
    "opendiscord:close-request-on": null,
    "opendiscord:integration-profile": null,
    "opendiscord:ai-assist-profile": null
  })
})

test("new ticket metadata entries seed every additive field with the locked defaults", () => {
  const entries = createTicketPlatformMetadataEntries()
  const seededValues = Object.fromEntries(entries.map((entry) => [entry.id.value, entry.value]))

  assert.deepEqual(seededValues, {
    "opendiscord:transport-mode": "channel_text",
    "opendiscord:transport-parent-channel": null,
    "opendiscord:transport-parent-message": null,
    "opendiscord:assigned-team": null,
    "opendiscord:assigned-staff": null,
    "opendiscord:assignment-strategy": null,
    "opendiscord:first-staff-response-on": null,
    "opendiscord:resolved-on": null,
    "opendiscord:awaiting-user-state": null,
    "opendiscord:awaiting-user-since": null,
    "opendiscord:close-request-state": null,
    "opendiscord:close-request-by": null,
    "opendiscord:close-request-on": null,
    "opendiscord:integration-profile": null,
    "opendiscord:ai-assist-profile": null
  })
})

test("ticket integration profile state treats explicit blanks as stored values", () => {
  const source = (value: unknown, present = true) => ({
    get(id: string) {
      assert.equal(id, ODTICKET_PLATFORM_METADATA_IDS.integrationProfileId)
      return present ? { value } : null
    }
  })

  assert.deepEqual(resolveTicketIntegrationProfileState(source(" profile-1 ")), {
    hasStoredValue: true,
    profileId: "profile-1"
  })
  assert.deepEqual(resolveTicketIntegrationProfileState(source("   ")), {
    hasStoredValue: true,
    profileId: ""
  })
  assert.deepEqual(resolveTicketIntegrationProfileState(source(null)), {
    hasStoredValue: false,
    profileId: ""
  })
  assert.deepEqual(resolveTicketIntegrationProfileState(source(undefined)), {
    hasStoredValue: false,
    profileId: ""
  })
  assert.deepEqual(resolveTicketIntegrationProfileState(source("", false)), {
    hasStoredValue: false,
    profileId: ""
  })
})

test("ticket AI assist profile state treats explicit blanks as stored values", () => {
  const source = (value: unknown, present = true) => ({
    get(id: string) {
      assert.equal(id, ODTICKET_PLATFORM_METADATA_IDS.aiAssistProfileId)
      return present ? { value } : null
    }
  })

  assert.deepEqual(resolveTicketAiAssistProfileState(source(" assist-1 ")), {
    hasStoredValue: true,
    profileId: "assist-1"
  })
  assert.deepEqual(resolveTicketAiAssistProfileState(source("   ")), {
    hasStoredValue: true,
    profileId: ""
  })
  assert.deepEqual(resolveTicketAiAssistProfileState(source(null)), {
    hasStoredValue: false,
    profileId: ""
  })
  assert.deepEqual(resolveTicketAiAssistProfileState(source(undefined)), {
    hasStoredValue: false,
    profileId: ""
  })
  assert.deepEqual(resolveTicketAiAssistProfileState(source("", false)), {
    hasStoredValue: false,
    profileId: ""
  })
})

test("dashboard runtime registry mirrors the additive ticket platform fields", () => {
  clearDashboardRuntimeRegistry()

  const ticketValues = {
    "opendiscord:opened-by": "creator-1",
    "opendiscord:opened-on": 111,
    "opendiscord:closed-on": 222,
    "opendiscord:reopened-on": 333,
    "opendiscord:claimed-on": 444,
    "opendiscord:pinned-on": 555,
    "opendiscord:claimed-by": "claimer-1",
    "opendiscord:pinned-by": "pinner-1",
    "opendiscord:open": true,
    "opendiscord:closed": false,
    "opendiscord:claimed": true,
    "opendiscord:pinned": false,
    "opendiscord:participants": [{ type: "user", id: "creator-1" }],
    "opendiscord:category-mode": "backup",
    "opendiscord:channel-suffix": "creator-1",
    [ODTICKET_PLATFORM_METADATA_IDS.transportMode]: "private_thread",
    [ODTICKET_PLATFORM_METADATA_IDS.transportParentChannelId]: "parent-channel-1",
    [ODTICKET_PLATFORM_METADATA_IDS.transportParentMessageId]: "parent-message-1",
    [ODTICKET_PLATFORM_METADATA_IDS.assignedTeamId]: "team-1",
    [ODTICKET_PLATFORM_METADATA_IDS.assignedStaffUserId]: "staff-1",
    [ODTICKET_PLATFORM_METADATA_IDS.assignmentStrategy]: "round_robin",
    [ODTICKET_PLATFORM_METADATA_IDS.firstStaffResponseAt]: 666,
    [ODTICKET_PLATFORM_METADATA_IDS.resolvedAt]: 777,
    [ODTICKET_PLATFORM_METADATA_IDS.awaitingUserState]: "waiting",
    [ODTICKET_PLATFORM_METADATA_IDS.awaitingUserSince]: 888,
    [ODTICKET_PLATFORM_METADATA_IDS.closeRequestState]: "requested",
    [ODTICKET_PLATFORM_METADATA_IDS.closeRequestBy]: "staff-1",
    [ODTICKET_PLATFORM_METADATA_IDS.closeRequestAt]: 999,
    [ODTICKET_PLATFORM_METADATA_IDS.integrationProfileId]: "integration-1",
    [ODTICKET_PLATFORM_METADATA_IDS.aiAssistProfileId]: "assist-1"
  }

  registerDashboardRuntime({
    tickets: {
      getAll() {
        return [{
          id: { value: "ticket-1" },
          option: { id: { value: "support" } },
          channel: { name: "ticket-channel-name" },
          get(id: string) {
            return { value: ticketValues[id as keyof typeof ticketValues] }
          }
        }]
      }
    }
  })

  const ticket = listDashboardTickets()[0]
  assert.ok(ticket)
  assert.deepEqual(ticket, {
    id: "ticket-1",
    optionId: "support",
    creatorId: "creator-1",
    transportMode: "private_thread",
    channelName: "ticket-channel-name",
    transportParentChannelId: "parent-channel-1",
    transportParentMessageId: "parent-message-1",
    assignedTeamId: "team-1",
    assignedStaffUserId: "staff-1",
    assignmentStrategy: "round_robin",
    firstStaffResponseAt: 666,
    resolvedAt: 777,
    awaitingUserState: "waiting",
    awaitingUserSince: 888,
    closeRequestState: "requested",
    closeRequestBy: "staff-1",
    closeRequestAt: 999,
    integrationProfileId: "integration-1",
    aiAssistProfileId: "assist-1",
    openedOn: 111,
    closedOn: 222,
    reopenedOn: 333,
    claimedOn: 444,
    pinnedOn: 555,
    claimedBy: "claimer-1",
    pinnedBy: "pinner-1",
    open: true,
    closed: false,
    claimed: true,
    pinned: false,
    participantCount: 1,
    categoryMode: "overflow",
    channelSuffix: "creator-1"
  })

  clearDashboardRuntimeRegistry()
})

test("dashboard runtime snapshot warns when ticket categories are near Discord capacity", () => {
  clearDashboardRuntimeRegistry()
  const logCalls: any[][] = []

  registerDashboardRuntime({
    readyStartupDate: new Date("2026-04-26T12:00:00.000Z"),
    log(...args: any[]) {
      logCalls.push(args)
    },
    configs: {
      get(id: string) {
        if (id !== "opendiscord:options") return null
        return {
          data: [{
            id: "intake",
            type: "ticket",
            channel: {
              transportMode: "channel_text",
              category: "category-primary",
              overflowCategories: ["category-overflow"]
            }
          }, {
            id: "thread-intake",
            type: "ticket",
            channel: {
              transportMode: "private_thread",
              category: "category-thread",
              overflowCategories: ["category-thread-overflow"]
            }
          }, {
            id: "explicit-empty-overflow",
            type: "ticket",
            channel: {
              transportMode: "channel_text",
              category: "category-calm",
              backupCategory: "category-backup",
              overflowCategories: []
            }
          }]
        }
      }
    } as any,
    client: {
      mainServer: {
        channels: {
          cache: new Map([
            ["category-primary", { id: "category-primary", children: { cache: { size: 44 } } }],
            ["category-overflow", { id: "category-overflow", children: { cache: { size: 45 } } }],
            ["category-thread", { id: "category-thread", children: { cache: { size: 49 } } }],
            ["category-thread-overflow", { id: "category-thread-overflow", children: { cache: { size: 49 } } }],
            ["category-calm", { id: "category-calm", children: { cache: { size: 0 } } }],
            ["category-backup", { id: "category-backup", children: { cache: { size: 49 } } }]
          ])
        }
      }
    } as any
  } as any)

  const snapshot = getDashboardRuntimeSnapshot({ projectRoot: process.cwd() })
  assert.equal(snapshot.availability, "degraded")
  assert.match(snapshot.warnings.join("\n"), /intake category category-overflow is near Discord channel capacity \(45\/50\)/)
  assert.doesNotMatch(snapshot.warnings.join("\n"), /thread-intake/)
  assert.doesNotMatch(snapshot.warnings.join("\n"), /explicit-empty-overflow/)
  assert.equal(logCalls.length, 1)
  assert.match(String(logCalls[0][0]), /intake category category-overflow is near Discord channel capacity \(45\/50\)/)
  assert.equal(logCalls[0][1], "warning")
  assert.deepEqual(logCalls[0][2], [
    { key: "option", value: "intake" },
    { key: "categoryid", value: "category-overflow", hidden: true },
    { key: "children", value: "45" }
  ])

  clearDashboardRuntimeRegistry()
})

test("slice 013 profile source contracts preserve stored ticket and canonical whitelist ownership", () => {
  const root = process.cwd()
  const read = (relativePath: string) => fs.readFileSync(path.resolve(root, relativePath), "utf8")
  const configLoaderSource = read("src/data/framework/configLoader.ts")
  const ticketRoutingSource = read("src/actions/ticketRouting.ts")
  const ticketIntegrationSource = read("src/actions/ticketIntegration.ts")
  const createTicketSource = read("src/actions/createTicket.ts")
  const moveTicketSource = read("src/actions/moveTicket.ts")
  const reopenTicketSource = read("src/actions/reopenTicket.ts")
  const unclaimTicketSource = read("src/actions/unclaimTicket.ts")
  const checkerLoaderSource = read("src/data/framework/checkerLoader.ts")
  const bridgeSource = read("plugins/ot-eotfs-bridge/index.ts")
  const localRuntimeSource = read("plugins/ot-local-runtime-config/index.ts")

  assert.match(configLoaderSource, /fileName == "integration-profiles\.json"[\s\S]*!fs\.existsSync/)
  assert.match(configLoaderSource, /fileName == "ai-assist-profiles\.json"[\s\S]*!fs\.existsSync/)
  assert.match(configLoaderSource, /fileName == "knowledge-sources\.json"[\s\S]*!fs\.existsSync/)
  assert.match(configLoaderSource, /return "\.\/config\/"/)

  assert.match(ticketIntegrationSource, /resolveTicketIntegrationProfileState\(ticket\)/)
  assert.equal(ticketIntegrationSource.includes("return stored || getTicketOptionIntegrationProfileId(ticket.option)"), false)
  assert.match(ticketIntegrationSource, /ticket\.get\("opendiscord:integration-profile"\)\.value = profileId/)
  assert.equal(createTicketSource.includes("integrationProfileId:getTicketOptionIntegrationProfileId(option) || null"), false)
  assert.equal(ticketIntegrationSource.includes("buildLegacyBridgeProfile"), false)

  assert.match(ticketRoutingSource, /TICKET_OPTION_CHANNEL_OVERFLOW_CATEGORIES_ID = "opendiscord:channel-categories-overflow"/)
  assert.match(ticketRoutingSource, /TICKET_CATEGORY_NEAR_CAPACITY_CHILD_COUNT = 45/)
  assert.match(ticketRoutingSource, /resolveTicketOpenCategoryRoute/)
  assert.match(ticketRoutingSource, /hasOverflowCategories \? rawOverflow : \(backupCategoryId \? \[backupCategoryId\] : \[\]\)/)
  assert.doesNotMatch(ticketRoutingSource, /const source = rawOverflow\.length > 0/)
  assert.doesNotMatch(ticketRoutingSource, /return \{ok:true,categoryId:null,categoryMode:null,warnings:\[\]\}/)
  assert.match(ticketRoutingSource, /Skipping primary ticket category because it is not configured/)
  assert.match(ticketRoutingSource, /if \(candidates\.length < 1\)/)
  assert.match(ticketRoutingSource, /value == "backup"\) return "overflow"/)
  assert.match(createTicketSource, /categoryMode: "normal"\|"overflow"\|null/)
  assert.match(moveTicketSource, /categoryMode: "normal"\|"overflow"\|"closed"\|"claimed"\|null/)
  assert.match(reopenTicketSource, /resolveTicketOpenCategoryRoute/)
  assert.match(unclaimTicketSource, /resolveTicketOpenCategoryRoute/)
  assert.equal(createTicketSource.includes('categoryMode = "backup"'), false)
  assert.equal(moveTicketSource.includes('categoryMode = "backup"'), false)
  assert.equal(reopenTicketSource.includes('category-mode").value = "backup"'), false)
  assert.equal(unclaimTicketSource.includes('category-mode").value = "backup"'), false)
  assert.doesNotMatch(checkerLoaderSource, /key:"overflowCategories"[\s\S]{0,280}allowDoubles:false/)
  assert.match(checkerLoaderSource, /opendiscord:ticket-channel-overflow-duplicate/)

  assert.match(bridgeSource, /function resolveBridgeConfigForTicket/)
  assert.match(bridgeSource, /hasOwnProperty\.call\(settings,"eligibleOptionIds"\)/)
  assert.equal(bridgeSource.includes("parseStringArraySetting(settings.eligibleOptionIds).length > 0"), false)
  assert.match(bridgeSource, /return Boolean\(resolveBridgeConfigForTicket\(entry\)\)/)
  assert.equal(bridgeSource.includes("ot-eotfs-bridge:legacy"), false)
  assert.equal(bridgeSource.includes("return isEligibleOptionId(getBridgeConfig().eligibleOptionIds"), false)

  assert.equal(localRuntimeSource.includes("eligibleOptionIds:[WHITELIST_OPTION_ID]"), false)
})

test("slash AI assist records metadata-only ai-assist-request audit events through dashboard runtime API", () => {
  const root = process.cwd()
  const aiAssistSource = fs.readFileSync(path.resolve(root, "plugins/ot-ai-assist/index.ts"), "utf8")
  const dashboardRuntimeApiSource = fs.readFileSync(path.resolve(root, "plugins/ot-dashboard/server/dashboard-runtime-api.ts"), "utf8")
  const dashboardStartSource = fs.readFileSync(path.resolve(root, "plugins/ot-dashboard/start.ts"), "utf8")

  assert.match(aiAssistSource, /eventType:\s*"ai-assist-request"/)
  assert.match(aiAssistSource, /recordAiAssistAudit/)
  assert.match(aiAssistSource, /recordAuditEvent/)
  assert.match(aiAssistSource, /details\s*=\s*\{\s*action:\s*input\.action,\s*profileId:\s*input\.profileId/s)
  assert.doesNotMatch(aiAssistSource, /details[\s\S]{0,220}(prompt|summary|answer|draft)/)
  assert.match(dashboardRuntimeApiSource, /recordAuditEvent:\s*\(event/)
  assert.match(dashboardStartSource, /context\.authStore\.recordAuditEvent/)
})

test("AI assist managed-config secret predicates include bearer keys", () => {
  const root = process.cwd()
  const checkerLoaderSource = fs.readFileSync(path.resolve(root, "src/data/framework/checkerLoader.ts"), "utf8")

  assert.match(checkerLoaderSource, /secret\|token\|password\|api\[_-\]\?key\|authorization\|credential\|bearer/)
  assert.match(checkerLoaderSource, /function findSecretShapedSettingKey/)
  assert.match(checkerLoaderSource, /findSecretShapedSettingKey\(nestedValue,nextPath\)/)
})

test("AI assist catalogs keep dev-config reload fallback and FAQ content validation", () => {
  const root = process.cwd()
  const configReloadSource = fs.readFileSync(path.resolve(root, "plugins/ot-config-reload/index.ts"), "utf8")
  const checkerLoaderSource = fs.readFileSync(path.resolve(root, "src/data/framework/checkerLoader.ts"), "utf8")

  assert.match(configReloadSource, /DEVCONFIG_FALLBACK_TARGETS[\s\S]*"ai-assist-profiles"[\s\S]*"knowledge-sources"/)
  assert.match(configReloadSource, /fs\.existsSync\(`\.\/devconfig\/\$\{target\}\.json`\)/)
  assert.match(configReloadSource, /fs\.existsSync\(`\.\/config\/\$\{target\}\.json`\)/)
  assert.match(checkerLoaderSource, /function validateKnowledgeSourceFileContent/)
  assert.match(checkerLoaderSource, /JSON\.parse\(fs\.readFileSync\(absolutePath,"utf8"\)\)/)
  assert.match(checkerLoaderSource, /opendiscord:knowledge-source-content-invalid/)
})

test("AI assist request source type stays limited to dashboard and slash", () => {
  const root = process.cwd()
  const platformSource = fs.readFileSync(path.resolve(root, "src/core/api/openticket/ticket-platform.ts"), "utf8")
  const runtimeSource = fs.readFileSync(path.resolve(root, "plugins/ot-ai-assist/service/ai-assist-runtime.ts"), "utf8")

  assert.match(platformSource, /export type TicketAiAssistRequestSource = "dashboard" \| "slash"/)
  assert.match(platformSource, /source: TicketAiAssistRequestSource/)
  assert.doesNotMatch(platformSource, /source:\s*"dashboard"\s*\|\s*"slash"\s*\|\s*string/)
  assert.match(runtimeSource, /export type AiAssistRequestSource = TicketAiAssistRequestSource/)
  assert.doesNotMatch(runtimeSource, /AiAssistRequestSource = "dashboard" \| "slash" \| string/)
})

test("AI assist provider hook result shape does not expose internal run outcomes or warnings", () => {
  const root = process.cwd()
  const platformSource = fs.readFileSync(path.resolve(root, "src/core/api/openticket/ticket-platform.ts"), "utf8")
  const baseMatch = /export interface TicketAiAssistHookResultBase \{([\s\S]*?)\n\}/.exec(platformSource)

  assert.ok(baseMatch)
  assert.match(baseMatch[1], /confidence: TicketAiAssistConfidence \| null/)
  assert.match(baseMatch[1], /citations: TicketAiAssistCitation\[\]/)
  assert.match(baseMatch[1], /degradedReason: string \| null/)
  assert.doesNotMatch(baseMatch[1], /\boutcome\b/)
  assert.doesNotMatch(baseMatch[1], /\bwarnings\b/)
  assert.doesNotMatch(platformSource, /TicketAiAssistProviderUnavailableResult/)
})

test("AI assist provider hooks keep action-specific result contracts", () => {
  const root = process.cwd()
  const platformSource = fs.readFileSync(path.resolve(root, "src/core/api/openticket/ticket-platform.ts"), "utf8")

  assert.match(platformSource, /summarize\?: TicketPlatformHookHandler<TicketAiAssistHookInput, TicketAiAssistSummarizeResult>/)
  assert.match(platformSource, /answerFaq\?: TicketPlatformHookHandler<TicketAiAssistHookInput, TicketAiAssistAnswerFaqResult>/)
  assert.match(platformSource, /suggestReply\?: TicketPlatformHookHandler<TicketAiAssistHookInput, TicketAiAssistSuggestReplyResult>/)
  assert.doesNotMatch(platformSource, /summarize\?: TicketPlatformHookHandler<TicketAiAssistHookInput, TicketAiAssistHookResult>/)
  assert.doesNotMatch(platformSource, /answerFaq\?: TicketPlatformHookHandler<TicketAiAssistHookInput, TicketAiAssistHookResult>/)
  assert.doesNotMatch(platformSource, /suggestReply\?: TicketPlatformHookHandler<TicketAiAssistHookInput, TicketAiAssistHookResult>/)
})

test("ticket integration service executes provider enrichment through the generic service path", () => {
  const root = process.cwd()
  const ticketIntegrationSource = fs.readFileSync(path.resolve(root, "src/actions/ticketIntegration.ts"), "utf8")

  assert.match(ticketIntegrationSource, /async getTicketIntegrationEnrichment/)
  assert.match(ticketIntegrationSource, /provider\.capabilities\.includes\("enrichment"\)/)
  assert.match(ticketIntegrationSource, /await provider\.enrichment\(\{/)
  assert.match(ticketIntegrationSource, /profile,\s+settings: profile\.settings,\s+ticket: input\.ticket,\s+channel: input\.channel \?\? null,\s+guild: input\.guild \?\? null/s)
  assert.match(ticketIntegrationSource, /catch \(error\) \{\s+safeLogIntegrationFailure\("Ticket integration enrichment is unavailable\.", error, profile\)\s+return \{summary:null, details:\{\}, degradedReason:PROVIDER_UNAVAILABLE_REASON\}/s)
  assert.match(ticketIntegrationSource, /export async function resolveTicketIntegrationEnrichment/)
})

test("executable ticket platform providers can register before the startup window seals", () => {
  clearTicketPlatformRuntimeApiForTests()
  const runtime = installTicketPlatformRuntimeApi()

  runtime.registerIntegrationProvider({
    id: "descriptor-provider",
    pluginId: "ot-descriptor-provider",
    capabilities: ["eligibility", "status"],
    secretSettingKeys: ["sharedSecret", "apiToken", "sharedSecret"],
    eligibility() {
      return { allow: true, reason: null, degradedReason: null }
    },
    status() {
      return { state: "ready", summary: null, lockedTicketActions: [], degradedReason: null }
    }
  })
  runtime.registerAiAssistProvider({
    id: "descriptor-ai",
    capabilities: ["summarize"],
    summarize() {
      return {
        confidence: "medium",
        summary: "summary",
        citations: [],
        degradedReason: null
      }
    }
  })

  assert.equal(runtime.getIntegrationProvider("descriptor-provider")?.pluginId, "ot-descriptor-provider")
  assert.deepEqual(runtime.getIntegrationProvider("descriptor-provider")?.secretSettingKeys, ["sharedSecret", "apiToken"])
  assert.deepEqual(runtime.listIntegrationProviders().map((provider) => provider.id), ["descriptor-provider"])
  assert.deepEqual(runtime.listAiAssistProviders().map((provider) => provider.id), ["descriptor-ai"])

  clearTicketPlatformRuntimeApiForTests()
})

test("ticket platform provider registration rejects capability-hook drift and duplicate ids", () => {
  clearTicketPlatformRuntimeApiForTests()
  const runtime = installTicketPlatformRuntimeApi()

  assert.throws(() => runtime.registerIntegrationProvider({
    id: "missing-hook",
    capabilities: ["eligibility", "status"],
    eligibility() {
      return { allow: true, reason: null, degradedReason: null }
    }
  }), /declared capability "status" without a matching hook/i)

  assert.throws(() => runtime.registerIntegrationProvider({
    id: "extra-hook",
    capabilities: ["eligibility"],
    eligibility() {
      return { allow: true, reason: null, degradedReason: null }
    },
    status() {
      return { state: "ready", summary: null, lockedTicketActions: [], degradedReason: null }
    }
  }), /supplied hook "status" without declaring capability "status"/i)

  runtime.registerIntegrationProvider({
    id: "stable-provider",
    capabilities: ["eligibility"],
    eligibility() {
      return { allow: true, reason: null, degradedReason: null }
    }
  })

  assert.throws(() => runtime.registerIntegrationProvider({
    id: "stable-provider",
    capabilities: ["eligibility"],
    eligibility() {
      return { allow: true, reason: null, degradedReason: null }
    }
  }), /already registered/i)
  assert.deepEqual(runtime.listIntegrationProviders().map((provider) => provider.id), ["stable-provider"])

  clearTicketPlatformRuntimeApiForTests()
})

test("ticket platform provider registration rejects late writes after the startup window seals", () => {
  clearTicketPlatformRuntimeApiForTests()
  const runtime = installTicketPlatformRuntimeApi()
  sealTicketPlatformRuntimeApi()

  assert.throws(() => runtime.registerAiAssistProvider({
    id: "late-ai",
    capabilities: ["summarize"]
  }), /registration is sealed/i)

  clearTicketPlatformRuntimeApiForTests()
})
