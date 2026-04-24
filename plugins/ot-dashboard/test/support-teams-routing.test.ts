import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import {
  DashboardConfigOperationError,
  createConfigService
} from "../server/config-service"
import { getManagedConfig } from "../server/config-registry"
import {
  applyTicketRoutingMetadataValues,
  clearTicketClaimStateValues,
  normalizeAssignmentStrategy,
  resolveRoundRobinAssignee,
  resolveRoundRobinCursorAssignment,
  setTicketAssignedStaffValue
} from "../../../src/actions/ticketRoutingCore.js"
import {
  buildTicketPermissionId,
  diffTicketPermissionRoleIds,
  getTicketOptionPermissionRoleIds
} from "../../../src/data/framework/permissionCore.js"

const pluginRoot = path.resolve(process.cwd(), "plugins", "ot-dashboard")
const bridgeRoot = path.resolve(process.cwd(), "plugins", "ot-eotfs-bridge")

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function buildTicketOption(id: string, overrides: Record<string, any> = {}) {
  const base = {
    id,
    name: id,
    description: `Ticket option ${id}`,
    type: "ticket",
    button: {
      emoji: "",
      label: id,
      color: "gray"
    },
    ticketAdmins: [],
    readonlyAdmins: [],
    allowCreationByBlacklistedUsers: false,
    questions: [],
    channel: {
      transportMode: "channel_text",
      threadParentChannel: "",
      prefix: `${id}-`,
      suffix: "user-name",
      category: "",
      backupCategory: "",
      closedCategory: "",
      claimedCategory: [],
      topic: ""
    },
    routing: {
      supportTeamId: "",
      escalationTargetOptionIds: []
    },
    dmMessage: {
      enabled: false,
      text: "",
      embed: {
        enabled: false,
        title: "",
        description: "",
        customColor: "",
        image: "",
        thumbnail: "",
        fields: [],
        timestamp: false
      }
    },
    ticketMessage: {
      enabled: true,
      text: "",
      embed: {
        enabled: true,
        title: id,
        description: `Ticket option ${id}`,
        customColor: "",
        image: "",
        thumbnail: "",
        fields: [],
        timestamp: true
      },
      ping: {
        "@here": false,
        "@everyone": false,
        custom: []
      }
    },
    autoclose: {
      enableInactiveHours: false,
      inactiveHours: 24,
      enableUserLeave: false,
      disableOnClaim: false
    },
    autodelete: {
      enableInactiveDays: false,
      inactiveDays: 7,
      enableUserLeave: false,
      disableOnClaim: false
    },
    cooldown: {
      enabled: false,
      cooldownMinutes: 10
    },
    limits: {
      enabled: false,
      globalMaximum: 20,
      userMaximum: 3
    },
    slowMode: {
      enabled: false,
      slowModeSeconds: 20
    }
  }

  return {
    ...base,
    ...overrides,
    button: {
      ...base.button,
      ...(overrides.button || {})
    },
    channel: {
      ...base.channel,
      ...(overrides.channel || {})
    },
    routing: {
      ...base.routing,
      ...(overrides.routing || {})
    }
  }
}

function buildRoleOption(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    name: id,
    description: `Role option ${id}`,
    type: "role",
    button: {
      emoji: "",
      label: id,
      color: "gray"
    },
    roles: ["123456789012345678"],
    mode: "add&remove",
    removeRolesOnAdd: [],
    addOnMemberJoin: false,
    ...overrides
  }
}

function createFixtureRoot(options: any[], supportTeams: any[] = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-support-teams-"))
  const configDir = path.join(root, "config")
  fs.mkdirSync(configDir, { recursive: true })

  writeJson(path.join(configDir, "general.json"), {
    token: "token",
    mainColor: "#ffffff",
    language: "english",
    prefix: "!ticket ",
    serverId: "1",
    globalAdmins: [],
    slashCommands: true,
    textCommands: false,
    tokenFromENV: false,
    status: { enabled: true, type: "watching", mode: "online", text: "ready", state: "" },
    system: { permissions: {}, messages: {}, logs: {}, limits: {}, channelTopic: {} }
  })
  writeJson(path.join(configDir, "options.json"), options)
  writeJson(path.join(configDir, "support-teams.json"), supportTeams)
  writeJson(path.join(configDir, "panels.json"), [])
  writeJson(path.join(configDir, "questions.json"), [])
  writeJson(path.join(configDir, "transcripts.json"), {
    general: {
      enabled: true,
      enableChannel: true,
      enableCreatorDM: false,
      enableParticipantDM: false,
      enableActiveAdminDM: false,
      enableEveryAdminDM: false,
      channel: "1",
      mode: "html"
    },
    embedSettings: { customColor: "", listAllParticipants: false, includeTicketStats: false },
    textTranscriptStyle: {
      layout: "normal",
      includeStats: true,
      includeIds: false,
      includeEmbeds: true,
      includeFiles: true,
      includeBotMessages: true,
      fileMode: "channel-name",
      customFileName: "transcript"
    },
    htmlTranscriptStyle: {
      background: { enableCustomBackground: false, backgroundColor: "", backgroundImage: "" },
      header: { enableCustomHeader: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
      stats: { enableCustomStats: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
      favicon: { enableCustomFavicon: false, imageUrl: "" }
    }
  })

  return root
}

function assertOperationCode(fn: () => unknown, code: string) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof DashboardConfigOperationError)
    assert.equal(error.code, code)
    return true
  })
}

function createTicketDataTarget(initial: Record<string, unknown>) {
  const store = Object.fromEntries(Object.entries(initial).map(([id, value]) => [id, { value }]))
  return {
    store,
    get(id: string) {
      store[id] = store[id] || { value: null }
      return store[id]
    }
  }
}

function createOptionDataSource(values: Record<string, unknown>) {
  return {
    exists(id: string) {
      return id in values
    },
    get(id: string) {
      return { value: values[id] }
    }
  }
}

test("support teams are a first-class admin-only managed config without editor allowlist widening", () => {
  const definition = getManagedConfig("support-teams")
  assert.ok(definition)
  assert.deepEqual({
    fileName: definition.fileName,
    visualPath: definition.visualPath,
    rawPath: definition.rawPath,
    kind: definition.kind
  }, {
    fileName: "support-teams.json",
    visualPath: "/visual/support-teams",
    rawPath: "/config/support-teams",
    kind: "array"
  })

  const authSource = fs.readFileSync(path.join(pluginRoot, "server", "auth.ts"), "utf8")
  assert.doesNotMatch(authSource, /["']\/visual\/support-teams["']/)
  assert.doesNotMatch(authSource, /["']\/admin\/configs\/support-teams["']/)

  const pagesSource = fs.readFileSync(path.join(pluginRoot, "server", "routes", "pages.ts"), "utf8")
  assert.match(pagesSource, /visual\/support-teams"\), adminGuard\.page\("config\.write\.general"\)/)

  const apiSource = fs.readFileSync(path.join(pluginRoot, "server", "routes", "api.ts"), "utf8")
  assert.match(apiSource, /api\/support-teams\/save"\), adminGuard\.api\("config\.write\.general"\)/)
  assert.match(apiSource, /api\/support-teams\/delete\/:index"\), adminGuard\.api\("config\.write\.general"\)/)
  assert.match(apiSource, /api\/support-teams\/reorder"\), adminGuard\.api\("config\.write\.general"\)/)

  const viewSource = fs.readFileSync(path.join(pluginRoot, "public", "views", "config-support-teams.ejs"), "utf8")
  assert.match(viewSource, /editor-workspace-page/)
  assert.doesNotMatch(viewSource, /top-rail|admin-shell|ticket-workbench/i)
})

test("support-team config editor normalizes, reorders, and blocks referenced deletes", () => {
  const root = createFixtureRoot([
    buildTicketOption("intake"),
    buildTicketOption("escalation", {
      routing: { supportTeamId: "lead", escalationTargetOptionIds: [] }
    })
  ], [
    { id: "lead", name: "Lead", roleIds: ["222222222222222222"], assignmentStrategy: "manual" }
  ])
  const service = createConfigService(root, pluginRoot)

  const created = service.saveSupportTeam({
    id: "triage",
    name: "Triage",
    roleIds: ["111111111111111111", "111111111111111111", " 333333333333333333 "],
    assignmentStrategy: "round_robin"
  }, -1)
  assert.equal(created.action, "created")
  assert.deepEqual(created.item, {
    id: "triage",
    name: "Triage",
    roleIds: ["111111111111111111", "333333333333333333"],
    assignmentStrategy: "round_robin"
  })

  const reordered = service.reorderArrayItems("support-teams", ["triage", "lead"])
  assert.deepEqual(reordered.orderedIds, ["triage", "lead"])

  service.saveOption({
    id: "intake",
    routing: {
      supportTeamId: "triage",
      escalationTargetOptionIds: ["escalation"]
    }
  }, 0)

  assert.deepEqual(service.getEditorDependencyGraph().supportTeamOptions.triage, [
    { id: "intake", name: "intake", index: 0, type: "ticket" }
  ])

  assertOperationCode(
    () => service.deleteArrayItem("support-teams", 0),
    "SUPPORT_TEAM_DELETE_BLOCKED"
  )
})

test("ticket-option routing persists valid bindings and rejects invalid escalation targets", () => {
  const supportTeams = [
    { id: "triage", name: "Triage", roleIds: ["111111111111111111"], assignmentStrategy: "manual" },
    { id: "lead", name: "Lead", roleIds: ["222222222222222222"], assignmentStrategy: "round_robin" }
  ]

  const root = createFixtureRoot([
    buildTicketOption("intake"),
    buildTicketOption("escalation", {
      routing: { supportTeamId: "lead", escalationTargetOptionIds: [] }
    }),
    buildRoleOption("role-option", {
      routing: { supportTeamId: "triage", escalationTargetOptionIds: ["escalation"] }
    })
  ], supportTeams)
  const service = createConfigService(root, pluginRoot)

  service.saveOption({
    id: "intake",
    routing: {
      supportTeamId: "triage",
      escalationTargetOptionIds: ["escalation"]
    }
  }, 0)
  assert.deepEqual(service.readManagedJson<any[]>("options")[0].routing, {
    supportTeamId: "triage",
    escalationTargetOptionIds: ["escalation"]
  })

  service.saveOption({
    id: "role-option",
    type: "role",
    routing: {
      supportTeamId: "triage",
      escalationTargetOptionIds: ["escalation"]
    }
  }, 2)
  assert.equal("routing" in service.readManagedJson<any[]>("options")[2], false)

  assertOperationCode(() => service.saveOption({
    id: "intake",
    routing: { supportTeamId: "missing", escalationTargetOptionIds: [] }
  }, 0), "OPTION_ROUTING_UNKNOWN_SUPPORT_TEAM")

  assertOperationCode(() => service.saveOption({
    id: "intake",
    routing: { supportTeamId: "triage", escalationTargetOptionIds: ["missing-target"] }
  }, 0), "OPTION_ROUTING_UNKNOWN_ESCALATION_TARGET")
})

test("routing validation rejects target routes without teams, cross transport, and private parent drift", () => {
  const supportTeams = [
    { id: "triage", name: "Triage", roleIds: ["111111111111111111"], assignmentStrategy: "manual" },
    { id: "lead", name: "Lead", roleIds: ["222222222222222222"], assignmentStrategy: "manual" }
  ]

  const missingTeamRoot = createFixtureRoot([
    buildTicketOption("intake"),
    buildTicketOption("target")
  ], supportTeams)
  const missingTeamService = createConfigService(missingTeamRoot, pluginRoot)
  assertOperationCode(() => missingTeamService.saveOption({
    id: "intake",
    routing: { supportTeamId: "triage", escalationTargetOptionIds: ["target"] }
  }, 0), "OPTION_ROUTING_TARGET_WITHOUT_TEAM")

  const crossTransportRoot = createFixtureRoot([
    buildTicketOption("intake"),
    buildTicketOption("target", {
      channel: { transportMode: "private_thread", threadParentChannel: "444444444444444444" },
      routing: { supportTeamId: "lead", escalationTargetOptionIds: [] }
    })
  ], supportTeams)
  const crossTransportService = createConfigService(crossTransportRoot, pluginRoot)
  assertOperationCode(() => crossTransportService.saveOption({
    id: "intake",
    routing: { supportTeamId: "triage", escalationTargetOptionIds: ["target"] }
  }, 0), "OPTION_ROUTING_TRANSPORT_MISMATCH")

  const parentDriftRoot = createFixtureRoot([
    buildTicketOption("intake", {
      channel: { transportMode: "private_thread", threadParentChannel: "444444444444444444" }
    }),
    buildTicketOption("target", {
      channel: { transportMode: "private_thread", threadParentChannel: "555555555555555555" },
      routing: { supportTeamId: "lead", escalationTargetOptionIds: [] }
    })
  ], supportTeams)
  const parentDriftService = createConfigService(parentDriftRoot, pluginRoot)
  assertOperationCode(() => parentDriftService.saveOption({
    id: "intake",
    routing: { supportTeamId: "triage", escalationTargetOptionIds: ["target"] }
  }, 0), "OPTION_ROUTING_THREAD_PARENT_MISMATCH")
})

test("round-robin assignment filters to eligible non-bot members and persists only selected cursors", () => {
  const members = [
    { id: "300", roleIds: ["support"], bot: true },
    { id: "200", roleIds: ["other", "support"] },
    { id: "100", roleIds: ["support"] },
    { id: "050", roleIds: ["other"] },
    { id: "200", roleIds: ["support"] }
  ]

  assert.equal(normalizeAssignmentStrategy("bogus"), "manual")
  assert.equal(normalizeAssignmentStrategy("round_robin"), "round_robin")
  assert.equal(resolveRoundRobinAssignee(members, ["support"], null), "100")
  assert.equal(resolveRoundRobinAssignee(members, ["support"], "100"), "200")
  assert.equal(resolveRoundRobinAssignee(members, ["support"], "200"), "100")
  assert.equal(resolveRoundRobinAssignee(members, ["missing"], null), null)

  assert.deepEqual(resolveRoundRobinCursorAssignment(members, ["support"], { lastAssignedUserId: "100" }, 12345), {
    selectedUserId: "200",
    shouldPersist: true,
    cursor: {
      lastAssignedUserId: "200",
      updatedAt: 12345
    }
  })
  assert.deepEqual(resolveRoundRobinCursorAssignment(members, ["missing"], { lastAssignedUserId: "100" }, 67890), {
    selectedUserId: null,
    shouldPersist: false,
    cursor: null
  })
})

test("ticket routing metadata helpers mutate assignment, claim, and unclaim state directly", () => {
  const ticket = createTicketDataTarget({
    "opendiscord:assigned-team": null,
    "opendiscord:assigned-staff": null,
    "opendiscord:assignment-strategy": null,
    "opendiscord:claimed": true,
    "opendiscord:claimed-by": "staff-1",
    "opendiscord:claimed-on": 111
  })

  applyTicketRoutingMetadataValues(ticket, {
    assignedTeamId: "triage",
    assignedStaffUserId: "staff-2",
    assignmentStrategy: "round_robin"
  })
  assert.equal(ticket.store["opendiscord:assigned-team"].value, "triage")
  assert.equal(ticket.store["opendiscord:assigned-staff"].value, "staff-2")
  assert.equal(ticket.store["opendiscord:assignment-strategy"].value, "round_robin")

  setTicketAssignedStaffValue(ticket, "claimer-1")
  assert.equal(ticket.store["opendiscord:assigned-staff"].value, "claimer-1")

  clearTicketClaimStateValues(ticket)
  assert.equal(ticket.store["opendiscord:claimed"].value, false)
  assert.equal(ticket.store["opendiscord:claimed-by"].value, null)
  assert.equal(ticket.store["opendiscord:claimed-on"].value, null)
  assert.equal(ticket.store["opendiscord:assigned-staff"].value, null)
})

test("ticket permission helpers compute route permission add/remove sets for reroute refresh", () => {
  const previousOption = createOptionDataSource({
    "opendiscord:admins": ["admin-role", "shared-role"],
    "opendiscord:admins-readonly": ["readonly-role", "admin-role"]
  })
  const targetOption = createOptionDataSource({
    "opendiscord:admins": ["target-admin-role", "shared-role"],
    "opendiscord:admins-readonly": ["target-readonly-role"]
  })

  const previousRoles = getTicketOptionPermissionRoleIds(previousOption, ["old-team-role", "shared-role"])
  const targetRoles = getTicketOptionPermissionRoleIds(targetOption, ["new-team-role", "shared-role"])

  assert.deepEqual(previousRoles, ["admin-role", "shared-role", "readonly-role", "old-team-role"])
  assert.deepEqual(targetRoles, ["target-admin-role", "shared-role", "target-readonly-role", "new-team-role"])
  assert.deepEqual(diffTicketPermissionRoleIds(previousRoles, targetRoles), {
    remove: ["admin-role", "readonly-role", "old-team-role"],
    add: ["target-admin-role", "target-readonly-role", "new-team-role"]
  })
  assert.equal(buildTicketPermissionId("ticket-1", "new-team-role"), "opendiscord:ticket-admin_ticket-1_new-team-role")
})

test("runtime routing actions stay route-scoped and bridge auth ignores support-team state", () => {
  const createTicketSource = fs.readFileSync(path.resolve(process.cwd(), "src", "actions", "createTicket.ts"), "utf8")
  assert.match(createTicketSource, /buildTicketRoutingMetadata/)
  assert.match(createTicketSource, /getTicketOptionSupportTeamRoleIds/)

  const moveTicketSource = fs.readFileSync(path.resolve(process.cwd(), "src", "actions", "moveTicket.ts"), "utf8")
  assert.match(moveTicketSource, /applyTicketRoutingAssignment/)
  assert.match(moveTicketSource, /getTicketOptionSupportTeamRoleIds/)
  assert.match(moveTicketSource, /const previousOption = ticket\.option/)
  assert.match(moveTicketSource, /removeTicketPermissions\(ticket,previousOption\)/)
  assert.match(moveTicketSource, /addTicketPermissions\(ticket\)/)

  const claimTicketSource = fs.readFileSync(path.resolve(process.cwd(), "src", "actions", "claimTicket.ts"), "utf8")
  assert.match(claimTicketSource, /setTicketAssignedStaff\(ticket,user\.id\)/)

  const unclaimTicketSource = fs.readFileSync(path.resolve(process.cwd(), "src", "actions", "unclaimTicket.ts"), "utf8")
  assert.match(unclaimTicketSource, /setTicketAssignedStaff\(ticket,null\)/)

  const escalateTicketSource = fs.readFileSync(path.resolve(process.cwd(), "src", "actions", "escalateTicket.ts"), "utf8")
  assert.match(escalateTicketSource, /getTicketOptionEscalationTargetIds\(ticket\.option\)/)
  assert.match(escalateTicketSource, /clearTicketClaimState\(ticket\)/)
  assert.match(escalateTicketSource, /opendiscord\.actions\.get\("opendiscord:move-ticket"\)/)

  const bridgeSource = fs.readFileSync(path.join(bridgeRoot, "index.ts"), "utf8")
  assert.doesNotMatch(bridgeSource, /supportTeam|assignedTeam|assignedStaff|ticketRouting/)
})
