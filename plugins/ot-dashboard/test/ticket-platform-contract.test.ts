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
  resolveTicketIntegrationProfileState,
  sealTicketPlatformRuntimeApi
} from "../../../src/core/api/openticket/ticket-platform.js"
import {
  clearDashboardRuntimeRegistry,
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
    "opendiscord:category-mode": "normal",
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
    categoryMode: "normal",
    channelSuffix: "creator-1"
  })

  clearDashboardRuntimeRegistry()
})

test("slice 013 profile source contracts preserve stored ticket and canonical whitelist ownership", () => {
  const root = process.cwd()
  const read = (relativePath: string) => fs.readFileSync(path.resolve(root, relativePath), "utf8")
  const configLoaderSource = read("src/data/framework/configLoader.ts")
  const ticketIntegrationSource = read("src/actions/ticketIntegration.ts")
  const createTicketSource = read("src/actions/createTicket.ts")
  const bridgeSource = read("plugins/ot-eotfs-bridge/index.ts")
  const localRuntimeSource = read("plugins/ot-local-runtime-config/index.ts")

  assert.match(configLoaderSource, /fileName == "integration-profiles\.json" && !fs\.existsSync/)
  assert.match(configLoaderSource, /return "\.\/config\/"/)

  assert.match(ticketIntegrationSource, /resolveTicketIntegrationProfileState\(ticket\)/)
  assert.equal(ticketIntegrationSource.includes("return stored || getTicketOptionIntegrationProfileId(ticket.option)"), false)
  assert.match(ticketIntegrationSource, /ticket\.get\("opendiscord:integration-profile"\)\.value = profileId/)
  assert.equal(createTicketSource.includes("integrationProfileId:getTicketOptionIntegrationProfileId(option) || null"), false)

  assert.match(bridgeSource, /function resolveBridgeConfigForTicket/)
  assert.match(bridgeSource, /hasOwnProperty\.call\(settings,"eligibleOptionIds"\)/)
  assert.equal(bridgeSource.includes("parseStringArraySetting(settings.eligibleOptionIds).length > 0"), false)
  assert.match(bridgeSource, /return Boolean\(resolveBridgeConfigForTicket\(entry\)\)/)

  assert.equal(localRuntimeSource.includes("eligibleOptionIds:[WHITELIST_OPTION_ID]"), false)
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
      return null
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
