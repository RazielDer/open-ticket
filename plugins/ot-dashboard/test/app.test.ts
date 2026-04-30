import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import vm from "vm"
import { AddressInfo, Socket } from "net"

import { createConfigService } from "../server/config-service"
import { createDashboardApp } from "../server/create-app"
import type { DashboardActionProviderBridge } from "../server/action-provider-bridge"
import type { DashboardConfig } from "../server/dashboard-config"
import { defaultDashboardRuntimeBridge, type DashboardRuntimeBridge } from "../server/runtime-bridge"

const pluginRoot = path.resolve(process.cwd(), "plugins", "ot-dashboard")

function createTempProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-app-"))
  fs.mkdirSync(path.join(root, "config"), { recursive: true })
  fs.mkdirSync(path.join(root, "plugins"), { recursive: true })
  fs.writeFileSync(path.join(root, "config", "general.json"), JSON.stringify({
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
    system: {
      emojiStyle: "before",
      pinEmoji: "📌",
      logs: { enabled: true, channel: "2" },
      limits: { enabled: true, globalMaximum: 5, userMaximum: 1 },
      channelTopic: {},
      permissions: {},
      messages: {}
    }
  }, null, 2))
  fs.writeFileSync(path.join(root, "config", "options.json"), "[]\n")
  fs.writeFileSync(path.join(root, "config", "panels.json"), "[]\n")
  fs.writeFileSync(path.join(root, "config", "questions.json"), "[]\n")
  fs.writeFileSync(path.join(root, "config", "transcripts.json"), JSON.stringify({
    general: { enabled: true, enableChannel: true, enableCreatorDM: false, enableParticipantDM: false, enableActiveAdminDM: false, enableEveryAdminDM: false, channel: "1", mode: "html" },
    embedSettings: { customColor: "", listAllParticipants: false, includeTicketStats: false },
    textTranscriptStyle: { layout: "normal", includeStats: true, includeIds: false, includeEmbeds: true, includeFiles: true, includeBotMessages: true, fileMode: "channel-name", customFileName: "transcript" },
    htmlTranscriptStyle: {
      background: { enableCustomBackground: false, backgroundColor: "", backgroundImage: "" },
      header: { enableCustomHeader: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
      stats: { enableCustomStats: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
      favicon: { enableCustomFavicon: false, imageUrl: "" }
    }
  }, null, 2))
  return root
}

function writeManagedConfig(
  projectRoot: string,
  id: "options" | "panels" | "questions",
  value: unknown
) {
  fs.writeFileSync(path.join(projectRoot, "config", `${id}.json`), JSON.stringify(value, null, 2) + "\n", "utf8")
}

function buildQuestionFixture(overrides: Record<string, any> = {}) {
  const base = {
    id: "question-id",
    name: "Question name",
    type: "short",
    required: true,
    placeholder: "Answer here",
    length: {
      enabled: false,
      min: 0,
      max: 1000
    }
  }

  return {
    ...base,
    ...overrides,
    length: {
      ...base.length,
      ...(overrides.length || {})
    }
  }
}

function buildTicketOptionFixture(overrides: Record<string, any> = {}) {
  const base = {
    id: "ticket-option",
    name: "Ticket option",
    description: "Handles ticket intake.",
    type: "ticket",
    button: {
      emoji: "🎫",
      label: "Ticket option",
      color: "gray"
    },
    allowCreationByBlacklistedUsers: false,
    ticketAdmins: [],
    readonlyAdmins: [],
    questions: [],
    channel: {
      prefix: "ticket-",
      suffix: "user-name",
      category: "",
      backupCategory: "",
      closedCategory: "",
      claimedCategory: [],
      topic: ""
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
        title: "Ticket option",
        description: "Handles ticket intake.",
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
    dmMessage: {
      ...base.dmMessage,
      ...(overrides.dmMessage || {}),
      embed: {
        ...base.dmMessage.embed,
        ...(overrides.dmMessage?.embed || {})
      }
    },
    ticketMessage: {
      ...base.ticketMessage,
      ...(overrides.ticketMessage || {}),
      embed: {
        ...base.ticketMessage.embed,
        ...(overrides.ticketMessage?.embed || {})
      },
      ping: {
        ...base.ticketMessage.ping,
        ...(overrides.ticketMessage?.ping || {})
      }
    },
    autoclose: {
      ...base.autoclose,
      ...(overrides.autoclose || {})
    },
    autodelete: {
      ...base.autodelete,
      ...(overrides.autodelete || {})
    },
    cooldown: {
      ...base.cooldown,
      ...(overrides.cooldown || {})
    },
    limits: {
      ...base.limits,
      ...(overrides.limits || {})
    },
    slowMode: {
      ...base.slowMode,
      ...(overrides.slowMode || {})
    }
  }
}

function buildPanelFixture(overrides: Record<string, any> = {}) {
  const base = {
    id: "panel-id",
    name: "Panel name",
    dropdown: false,
    options: [],
    text: "Open a ticket.",
    embed: {
      enabled: true,
      title: "Panel title",
      description: "Panel description",
      customColor: "",
      url: "",
      image: "",
      thumbnail: "",
      footer: "",
      fields: [],
      timestamp: false
    },
    settings: {
      dropdownPlaceholder: "",
      enableMaxTicketsWarningInText: false,
      enableMaxTicketsWarningInEmbed: true,
      describeOptionsLayout: "normal",
      describeOptionsCustomTitle: "",
      describeOptionsInText: false,
      describeOptionsInEmbedFields: true,
      describeOptionsInEmbedDescription: false
    }
  }

  return {
    ...base,
    ...overrides,
    embed: {
      ...base.embed,
      ...(overrides.embed || {})
    },
    settings: {
      ...base.settings,
      ...(overrides.settings || {})
    }
  }
}

function seedArrayEditorFixtures(projectRoot: string) {
  const questions = [
    buildQuestionFixture({
      id: "q-priority",
      name: "Priority",
      placeholder: "How urgent is this?"
    }),
    buildQuestionFixture({
      id: "q-context",
      name: "Context",
      type: "paragraph",
      required: false,
      placeholder: "Share more detail."
    })
  ]

  const options = [
    buildTicketOptionFixture({
      id: "ticket-main",
      name: "Main ticket",
      description: "Handles the default intake path.",
      button: {
        emoji: "🎫",
        label: "Main ticket"
      },
      questions: ["q-priority"]
    }),
    buildTicketOptionFixture({
      id: "ticket-alt",
      name: "Alternate ticket",
      description: "Fallback queue.",
      button: {
        emoji: "🧾",
        label: "Alternate ticket"
      }
    })
  ]

  const panels = [
    buildPanelFixture({
      id: "panel-entry",
      name: "Entry panel",
      options: ["ticket-main", "ticket-alt"],
      text: "Open the main intake flow.",
      embed: {
        title: "Entry panel",
        description: "Start here."
      }
    }),
    buildPanelFixture({
      id: "panel-backup",
      name: "Backup panel",
      options: ["ticket-alt"],
      text: "Fallback entry.",
      embed: {
        title: "Backup panel",
        description: "Alternate entry."
      }
    })
  ]

  writeManagedConfig(projectRoot, "questions", questions)
  writeManagedConfig(projectRoot, "options", options)
  writeManagedConfig(projectRoot, "panels", panels)

  return { questions, options, panels }
}

function expectConfigOperationError(
  action: () => unknown,
  expected: {
    code: string
    guidance?: RegExp
    referenceId?: string
  }
) {
  try {
    action()
    assert.fail(`Expected config operation error ${expected.code}`)
  } catch (error) {
    const operationError = error as {
      code?: string
      guidance?: string
      references?: Array<{ id?: string }>
    }

    assert.equal(operationError.code, expected.code)
    if (expected.guidance) {
      assert.match(String(operationError.guidance || ""), expected.guidance)
    }
    if (expected.referenceId) {
      assert.equal(
        Boolean(operationError.references?.some((reference) => reference.id === expected.referenceId)),
        true
      )
    }
  }
}

function writePluginFixture(
  projectRoot: string,
  pluginId: string,
  options: {
    manifest?: Record<string, unknown>
    assets?: Record<string, string>
  } = {}
) {
  const pluginRoot = path.join(projectRoot, "plugins", pluginId)
  fs.mkdirSync(pluginRoot, { recursive: true })

  const manifest = {
    id: pluginId,
    name: pluginId === "ot-config-reload" ? "OT Config Reload" : "Manifest Only",
    version: "1.0.0",
    startFile: "index.ts",
    enabled: false,
    priority: 0,
    events: [],
    npmDependencies: [],
    requiredPlugins: [],
    incompatiblePlugins: [],
    supportedVersions: ["OTv4.1.x"],
    details: {
      author: "tester",
      contributors: ["reviewer"],
      shortDescription: "Plugin fixture",
      longDescription: "Plugin fixture used by the dashboard tests.",
      imageUrl: "",
      projectUrl: "",
      tags: ["fixture"]
    },
    ...(options.manifest || {})
  }

  fs.writeFileSync(path.join(pluginRoot, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n")

  const assets = options.assets || {
    "config.json": JSON.stringify({ enabled: true, mode: "default" }, null, 2) + "\n",
    "data/runtime.json": JSON.stringify({ version: 1 }, null, 2) + "\n"
  }

  Object.entries(assets).forEach(([relativePath, content]) => {
    const absolutePath = path.join(pluginRoot, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, "utf8")
  })

  return pluginRoot
}

function createTranscriptPreviewRuntimeBridge(): DashboardRuntimeBridge {
  const transcriptService = {
    isHealthy() {
      return true
    },
    async getSummary() {
      return {
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
      }
    },
    async resolveTranscript() {
      return null
    },
    async listTranscripts() {
      return { total: 0, items: [] }
    },
    async getTranscriptDetail() {
      return null
    },
    async listTranscriptStylePresets() {
      return [
        {
          id: "discord-classic",
          label: "Discord Classic",
          description: "Keeps the familiar Discord charcoal and gold transcript look.",
          draft: {
            background: { enableCustomBackground: true, backgroundColor: "#101318", backgroundImage: "" },
            header: { enableCustomHeader: true, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
            stats: { enableCustomStats: true, backgroundColor: "#202225", keyTextColor: "#8b919c", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
            favicon: { enableCustomFavicon: false, imageUrl: "" }
          }
        },
        {
          id: "midnight-cyan",
          label: "Midnight Cyan",
          description: "Cool blue contrast with a brighter operational accent.",
          draft: {
            background: { enableCustomBackground: true, backgroundColor: "#08131d", backgroundImage: "" },
            header: { enableCustomHeader: true, backgroundColor: "#0f2230", decoColor: "#3dd9eb", textColor: "#eafcff" },
            stats: { enableCustomStats: true, backgroundColor: "#0c1b28", keyTextColor: "#7cb9c5", valueTextColor: "#eafcff", hideBackgroundColor: "#153447", hideTextColor: "#dcfbff" },
            favicon: { enableCustomFavicon: false, imageUrl: "" }
          }
        }
      ]
    },
    async renderTranscriptStylePreview(styleDraft: any) {
      return {
        status: "ok",
        message: "",
        html: `<html><body data-header="${styleDraft.header.backgroundColor}" data-background="${styleDraft.background.backgroundColor}">${styleDraft.header.backgroundColor}</body></html>`,
        contentSecurityPolicy: "default-src 'none'; frame-ancestors 'self'; img-src 'self' data: http: https:; script-src 'none'; style-src 'unsafe-inline'"
      }
    },
    async revokeTranscript(id: string) {
      return { ok: true, action: "revoke", target: id, status: "ok", message: `revoked ${id}` }
    },
    async reissueTranscript(id: string) {
      return { ok: true, action: "reissue", target: id, status: "ok", message: `reissued ${id}` }
    },
    async deleteTranscript(id: string) {
      return { ok: true, action: "delete", target: id, status: "ok", message: `deleted ${id}` }
    }
  }

  return {
    getSnapshot() {
      return {
        capturedAt: new Date("2026-03-27T15:45:00.000Z").toISOString(),
        availability: "ready",
        processStartTime: new Date("2026-03-27T15:30:00.000Z").toISOString(),
        readyTime: new Date("2026-03-27T15:31:00.000Z").toISOString(),
        checkerSummary: { hasResult: true, valid: true, errorCount: 0, warningCount: 0, infoCount: 0 },
        pluginSummary: { discovered: 1, enabled: 1, executed: 1, crashed: 0, unknownCrashed: 0 },
        configInventory: [],
        statsSummary: { available: true, scopeCount: 0 },
        ticketSummary: { available: true, total: 0, open: 0, closed: 0, claimed: 0, pinned: 0, recentActivityCount: 0 },
        warnings: [],
        recentTicketActivity: []
      }
    },
    listPlugins() {
      return []
    },
    getPluginDetail(_projectRoot, pluginId) {
      if (pluginId !== "ot-html-transcripts") return null
      return {
        id: "ot-html-transcripts",
        directory: "ot-html-transcripts",
        pluginRoot: "/plugins/ot-html-transcripts",
        manifestPath: "/plugins/ot-html-transcripts/plugin.json",
        hasManifest: true,
        source: "runtime+manifest",
        name: "OT HTML Transcripts",
        version: "1.0.0",
        enabled: true,
        executed: true,
        crashed: false,
        crashReason: null,
        priority: 0,
        author: "tester",
        authors: ["tester"],
        contributors: [],
        shortDescription: "Preview fixture",
        tags: [],
        supportedVersions: ["OTv4.1.x"],
        assetCount: 0,
        configEntryPoints: [],
        editableAssets: [],
        unknownCrashWarning: false,
        longDescription: "",
        imageUrl: "",
        projectUrl: "",
        requiredPlugins: [],
        incompatiblePlugins: [],
        npmDependencies: [],
        missingDependencies: [],
        missingRequiredPlugins: [],
        activeIncompatiblePlugins: [],
        warnings: []
      } as any
    },
    listTickets() {
      return []
    },
    getRuntimeSource() {
      return {
        plugins: {
          getAll() {
            return []
          },
          classes: {
            get(id: string) {
              return id === "ot-html-transcripts:service" ? transcriptService : null
            }
          }
        }
      } as any
    }
  }
}

function parseHiddenValue(html: string, name: string) {
  const match = html.match(new RegExp(`name="${name}" value="([^"]+)"`))
  return match ? match[1] : ""
}

function parseBodyData(html: string, key: string) {
  const match = html.match(new RegExp(`data-${key}="([^"]+)"`))
  return match ? match[1] : ""
}

class FakeDashboardEvent {
  type: string
  bubbles: boolean
  defaultPrevented = false
  returnValue: unknown = undefined
  target: unknown = null

  constructor(type: string, options: { bubbles?: boolean } = {}) {
    this.type = type
    this.bubbles = options.bubbles === true
  }

  preventDefault() {
    this.defaultPrevented = true
  }
}

class FakeDashboardElement {
  tagName: string
  children: FakeDashboardElement[] = []
  parentNode: FakeDashboardElement | null = null
  dataset: Record<string, string> = {}
  attributes = new Map<string, string>()
  listeners = new Map<string, Array<(event: FakeDashboardEvent) => void>>()
  style: Record<string, string> = {}
  className = ""
  hidden = false
  textContent = ""
  value = ""
  type = ""
  form: FakeDashboardElement | null = null
  readOnly = false
  disabled = false
  files: Array<{ text(): Promise<string> }> = []
  classList: { add: (...names: string[]) => void }

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
    this.classList = {
      add: (...names: string[]) => {
        const existing = new Set(this.className.split(/\s+/).filter(Boolean))
        names.forEach((name) => existing.add(name))
        this.className = Array.from(existing).join(" ")
      }
    }
  }

  append(...nodes: FakeDashboardElement[]) {
    nodes.forEach((node) => {
      if (node.parentNode) {
        node.parentNode.children = node.parentNode.children.filter((child) => child !== node)
      }
      node.parentNode = this
      this.children.push(node)
    })
  }

  insertBefore(node: FakeDashboardElement, reference: FakeDashboardElement | null) {
    if (node.parentNode) {
      node.parentNode.children = node.parentNode.children.filter((child) => child !== node)
    }
    node.parentNode = this
    const index = reference ? this.children.indexOf(reference) : -1
    if (index >= 0) {
      this.children.splice(index, 0, node)
    } else {
      this.children.push(node)
    }
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this)
      this.parentNode = null
    }
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value))
    if (name === "type") this.type = String(value)
    if (name === "readonly") this.readOnly = true
    if (name === "disabled") this.disabled = true
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
      this.dataset[key] = String(value)
    }
  }

  getAttribute(name: string) {
    if (name === "type") return this.type
    if (name === "class") return this.className
    return this.attributes.get(name) || ""
  }

  addEventListener(type: string, listener: (event: FakeDashboardEvent) => void) {
    const listeners = this.listeners.get(type) || []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatchEvent(event: FakeDashboardEvent) {
    event.target = event.target || this
    for (const listener of this.listeners.get(event.type) || []) {
      listener(event)
    }
    return !event.defaultPrevented
  }

  select() {}

  querySelectorAll(selector: string): FakeDashboardElement[] {
    const matches: FakeDashboardElement[] = []
    const visit = (node: FakeDashboardElement) => {
      node.children.forEach((child) => {
        if (selector === "button" && child.tagName === "BUTTON") {
          matches.push(child)
        }
        if (selector === "[data-field-tools]" && child.dataset.fieldTools) {
          matches.push(child)
        }
        visit(child)
      })
    }
    visit(this)
    return matches
  }
}

function findButton(root: FakeDashboardElement, label: string) {
  return root.querySelectorAll("button").find((button) => button.textContent === label)
}

function dashboardFieldMessages() {
  return {
    fieldTools: {
      json: {
        format: "Format JSON",
        minify: "Minify JSON",
        validate: "Validate JSON",
        jumpToError: "Jump to error",
        foldAll: "Fold all",
        unfoldAll: "Unfold all",
        search: "Search",
        valid: "JSON is valid.",
        invalid: "Invalid JSON: {message}",
        savedDraft: "Saved draft",
        unsavedChanges: "Unsaved changes"
      },
      common: {
        copy: "Copy",
        clear: "Clear",
        cleanupList: "Clean up list",
        expand: "Expand"
      }
    }
  }
}

function createFakeDocument() {
  return {
    createElement(tagName: string) {
      return new FakeDashboardElement(tagName)
    },
    getElementById() {
      return null
    },
    querySelector() {
      return null
    },
    querySelectorAll() {
      return []
    },
    addEventListener() {}
  }
}

function runBrowserScript(sourcePath: string, windowObject: Record<string, any>, extras: Record<string, any> = {}) {
  const source = fs.readFileSync(sourcePath, "utf8")
  vm.runInNewContext(source, {
    window: windowObject,
    document: createFakeDocument(),
    Event: FakeDashboardEvent,
    console,
    JSON,
    Object,
    Array,
    String,
    Promise,
    ...extras
  })
}

function createJsonEditorHarness(initialValue: string) {
  const root = new FakeDashboardElement("div")
  const form = new FakeDashboardElement("form")
  const textarea = new FakeDashboardElement("textarea")
  textarea.value = initialValue
  textarea.form = form
  root.append(textarea)

  const toasts: Array<{ message: string; type: string }> = []
  const windowObject: Record<string, any> = {
    DashboardUI: {
      readJson: () => dashboardFieldMessages(),
      showToast(message: string, type: string) {
        toasts.push({ message, type })
      }
    },
    DashboardCodeMirrorJson: {
      createJsonEditor(options: any) {
        let value = String(options.value || "")
        const diagnostics = () => {
          try {
            JSON.parse(value)
            return []
          } catch (error) {
            return [{ from: 0, to: 0, severity: "error", source: "json", message: (error as Error).message }]
          }
        }
        const update = (nextValue: string) => {
          value = nextValue
          if (typeof options.onChange === "function") {
            options.onChange(value)
          }
        }
        return {
          focus() {},
          getValue() {
            return value
          },
          setValue(nextValue: string) {
            update(String(nextValue || ""))
          },
          validateJson() {
            return diagnostics()
          },
          getFirstDiagnostic() {
            return diagnostics()[0] || null
          },
          jumpToFirstError() {
            return diagnostics()[0] || null
          },
          formatJson() {
            const formatted = JSON.stringify(JSON.parse(value), null, 2)
            update(formatted)
            return formatted
          },
          minifyJson() {
            const minified = JSON.stringify(JSON.parse(value))
            update(minified)
            return minified
          },
          foldAll() {
            return true
          },
          unfoldAll() {
            return true
          },
          openSearch() {},
          destroy() {}
        }
      }
    },
    addEventListener() {}
  }

  runBrowserScript(path.join(pluginRoot, "public", "js", "json-editor.js"), windowObject)
  const api = windowObject.DashboardJsonEditor.mount(textarea)
  return { root, form, textarea, api, toasts }
}

function createFieldToolsHarness(mode: string, value: string, attributes: Record<string, string> = {}) {
  const root = new FakeDashboardElement("div")
  const textarea = new FakeDashboardElement("textarea")
  textarea.value = value
  textarea.dataset.fieldTools = mode
  Object.entries(attributes).forEach(([key, entryValue]) => {
    textarea.setAttribute(key, entryValue)
  })
  root.append(textarea)

  const windowObject: Record<string, any> = {
    DashboardUI: {
      readJson: () => dashboardFieldMessages()
    }
  }
  runBrowserScript(path.join(pluginRoot, "public", "js", "field-tools.js"), windowObject, {
    navigator: {},
    document: {
      ...createFakeDocument(),
      body: new FakeDashboardElement("body"),
      execCommand() {
        return true
      }
    }
  })
  windowObject.DashboardFieldTools.mount(textarea)
  return { root, textarea }
}

function buildRuntimeGuildMember(userId: string, roleIds: string[]) {
  return {
    guildId: "guild-1",
    userId,
    username: userId,
    globalName: userId.replace(/-/g, " "),
    displayName: userId.replace(/-/g, " "),
    avatarUrl: null,
    roleIds
  }
}

async function startDiscordLogin(runtime: { baseUrl: string }, returnTo = "/dash/admin") {
  let cookie = ""
  const getLogin = await fetch(`${runtime.baseUrl}/dash/login?returnTo=${encodeURIComponent(returnTo)}`, { redirect: "manual" })
  cookie = (getLogin.headers.get("set-cookie") || "").split(";")[0]
  await getLogin.text()

  const startResponse = await fetch(`${runtime.baseUrl}/dash/login/discord?returnTo=${encodeURIComponent(returnTo)}`, {
    redirect: "manual",
    headers: { cookie }
  })

  const startCookie = startResponse.headers.get("set-cookie")
  if (startCookie) {
    cookie = startCookie.split(";")[0]
  }

  assert.equal(startResponse.status, 302)
  const location = String(startResponse.headers.get("location") || "")
  assert.match(location, /discord\.com\/oauth2\/authorize/)
  const state = new URL(location).searchParams.get("state")
  assert.ok(state)

  return { cookie, state: String(state) }
}

async function finishDiscordLogin(
  runtime: { baseUrl: string },
  cookie: string,
  state: string,
  code: string
) {
  const callbackResponse = await fetch(
    `${runtime.baseUrl}/dash/login/discord/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    {
      redirect: "manual",
      headers: { cookie }
    }
  )

  const callbackCookie = callbackResponse.headers.get("set-cookie")
  if (callbackCookie) {
    cookie = callbackCookie.split(";")[0]
  }

  return {
    cookie,
    response: callbackResponse
  }
}

async function login(runtime: { baseUrl: string }, userId = "admin-user", returnTo = "/dash/admin") {
  const started = await startDiscordLogin(runtime, returnTo)
  const completed = await finishDiscordLogin(runtime, started.cookie, started.state, userId)

  assert.equal(completed.response.status, 302)
  assert.equal(completed.response.headers.get("location"), returnTo)
  await completed.response.arrayBuffer()

  return { cookie: completed.cookie }
}

function prepareTestPluginRoot(projectRoot: string) {
  const target = path.join(projectRoot, "plugins", "ot-dashboard")
  fs.cpSync(pluginRoot, target, { recursive: true })
  return target
}

async function startTestServer(
  basePath = "/dash",
  overrides: {
    runtimeBridge?: DashboardRuntimeBridge
    actionProviderBridge?: DashboardActionProviderBridge
    configOverride?: Partial<DashboardConfig>
    useTempPluginRoot?: boolean
  } = {}
) {
  const projectRoot = createTempProjectRoot()
  const runtimePluginRoot = overrides.useTempPluginRoot ? prepareTestPluginRoot(projectRoot) : pluginRoot
  const authRoleIds = {
    reviewer: "role-reviewer",
    editor: "role-editor",
    admin: "role-admin"
  }
  const authMembers = new Map<string, ReturnType<typeof buildRuntimeGuildMember>>([
    ["admin-user", buildRuntimeGuildMember("admin-user", [authRoleIds.admin])],
    ["editor-user", buildRuntimeGuildMember("editor-user", [authRoleIds.editor])],
    ["reviewer-user", buildRuntimeGuildMember("reviewer-user", [authRoleIds.reviewer])],
    ["owner-user", buildRuntimeGuildMember("owner-user", [])],
    ["member-user", buildRuntimeGuildMember("member-user", [])]
  ])
  const config: DashboardConfig = {
    host: "127.0.0.1",
    port: 0,
    basePath,
    publicBaseUrl: "",
    viewerPublicBaseUrl: "",
    trustProxyHops: 1,
    dashboardName: "Test Dashboard",
    locale: "english",
    brand: {
      title: "Test Dashboard",
      faviconPath: "./public/assets/eotfs-dashboard-favicon.png"
    },
    auth: {
      passwordHash: "",
      password: "",
      sessionSecret: "test-secret",
      sqlitePath: "runtime/ot-dashboard/auth.sqlite",
      discord: {
        clientId: "discord-client-id",
        clientSecret: "discord-client-secret"
      },
      breakglass: {
        enabled: false,
        passwordHash: ""
      },
      maxAgeHours: 1,
      loginRateLimit: { windowMinutes: 15, maxAttempts: 3 }
    },
    viewerAuth: {
      discord: {
        clientId: "discord-client-id",
        clientSecret: "discord-client-secret"
      }
    },
    rbac: {
      ownerUserIds: ["owner-user"],
      roleIds: {
        reviewer: [authRoleIds.reviewer],
        editor: [authRoleIds.editor],
        admin: [authRoleIds.admin]
      },
      userIds: {
        reviewer: [],
        editor: [],
        admin: []
      }
    }
  }

  if (overrides.configOverride) {
    Object.assign(config, overrides.configOverride)
    if (overrides.configOverride.auth) {
      config.auth = {
        ...config.auth,
        ...overrides.configOverride.auth,
        discord: {
          ...config.auth.discord,
          ...overrides.configOverride.auth.discord
        },
        breakglass: {
          ...config.auth.breakglass,
          ...overrides.configOverride.auth.breakglass
        }
      }
    }
    if (overrides.configOverride.viewerAuth) {
      config.viewerAuth = {
        ...config.viewerAuth,
        ...overrides.configOverride.viewerAuth,
        discord: {
          ...config.viewerAuth.discord,
          ...overrides.configOverride.viewerAuth.discord
        }
      }
    }
    if (overrides.configOverride.rbac) {
      config.rbac = overrides.configOverride.rbac
    }
  }

  const runtimeBridge: DashboardRuntimeBridge = {
    getSnapshot(projectRoot: string) {
      return overrides.runtimeBridge?.getSnapshot(projectRoot) || {
        capturedAt: new Date("2026-03-27T15:45:00.000Z").toISOString(),
        availability: "unavailable",
        processStartTime: null,
        readyTime: null,
        checkerSummary: { hasResult: false, valid: null, errorCount: 0, warningCount: 0, infoCount: 0 },
        pluginSummary: { discovered: 0, enabled: 0, executed: 0, crashed: 0, unknownCrashed: 0 },
        configInventory: [],
        statsSummary: { available: false, scopeCount: 0 },
        ticketSummary: { available: false, total: 0, open: 0, closed: 0, claimed: 0, pinned: 0, recentActivityCount: 0 },
        warnings: ["Open Ticket runtime is not registered with the dashboard registry."],
        recentTicketActivity: []
      }
    },
    listPlugins(projectRoot: string) {
      return overrides.runtimeBridge?.listPlugins(projectRoot) || defaultDashboardRuntimeBridge.listPlugins(projectRoot)
    },
    getPluginDetail(projectRoot: string, pluginId: string) {
      return overrides.runtimeBridge?.getPluginDetail(projectRoot, pluginId)
        || defaultDashboardRuntimeBridge.getPluginDetail(projectRoot, pluginId)
    },
    listTickets() {
      return overrides.runtimeBridge?.listTickets() || []
    },
    getRuntimeSource() {
      return overrides.runtimeBridge?.getRuntimeSource?.() || null
    },
    getGuildId() {
      return overrides.runtimeBridge?.getGuildId?.() || "guild-1"
    },
    async resolveGuildMember(userId: string) {
      const resolved = await overrides.runtimeBridge?.resolveGuildMember?.(userId)
      if (resolved) {
        return resolved
      }

      return authMembers.get(userId) || null
    }
  }

  const { app, context } = createDashboardApp({
    projectRoot,
    pluginRoot: runtimePluginRoot,
    configOverride: config,
    runtimeBridge,
    actionProviderBridge: overrides.actionProviderBridge,
    adminAuthClient: {
      async exchangeCode(code: string) {
        return code
      },
      async fetchAdminIdentity(accessToken: string) {
        return {
          userId: accessToken,
          username: accessToken,
          globalName: accessToken.replace(/-/g, " "),
          avatarUrl: null,
          authenticatedAt: new Date().toISOString()
        }
      }
    }
  })
  const server = await new Promise<import("http").Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener))
  })
  const connections = new Set<Socket>()

  server.on("connection", (socket) => {
    connections.add(socket)
    socket.on("close", () => {
      connections.delete(socket)
    })
  })

  return {
    projectRoot,
    server,
    connections,
    context,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }
}

async function stopTestServer(runtime: Awaited<ReturnType<typeof startTestServer>>) {
  runtime.server.close()
  runtime.server.closeIdleConnections?.()
  runtime.server.closeAllConnections?.()

  for (const socket of runtime.connections) {
    socket.destroy()
  }

  await runtime.context.authStore.close()
  runtime.server.unref()
  await new Promise((resolve) => setTimeout(resolve, 0))

  fs.rmSync(runtime.projectRoot, { recursive: true, force: true })
}

test("login page is English-first and sanitizes external return targets", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const response = await fetch(`${runtime.baseUrl}/dash/login?returnTo=https://evil.example`, { redirect: "manual" })
  const html = await response.text()

  assert.equal(response.status, 200)
  assert.match(html, /Test Dashboard/)
  assert.match(html, /eotfs-dashboard-favicon\.png/)
  assert.match(html, /eotfs-login-hero\.png/)
  assert.match(html, /Continue with Discord/)
  assert.match(html, /href="\/dash\/login\/discord\?returnTo=%2Fdash%2Fadmin"/)
  assert.match(html, /Use Discord sign-in with current Editor or Admin access on the admin host\./)
  assert.doesNotMatch(html, /login-inline-actions/)
  assert.doesNotMatch(html, /Back to landing/)
  assert.doesNotMatch(html, /login-masthead/)
  assert.doesNotMatch(html, /login-brand-title/)
  assert.doesNotMatch(html, /data-action="check-health"/)
  assert.doesNotMatch(html, /login-health-status/)
  assert.doesNotMatch(html, /Check health/)
  assert.doesNotMatch(html, /Only current Discord staff mapped to Editor or Admin can sign in here\./)
  assert.doesNotMatch(html, /brand-logo/)
  assert.doesNotMatch(html, /js\/login\.js/)
  assert.doesNotMatch(html, /type="password"/)
})

test("landing route redirects straight to login-first entry", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const response = await fetch(`${runtime.baseUrl}/dash`, { redirect: "manual" })
  await response.arrayBuffer()

  assert.equal(response.status, 302)
  assert.equal(response.headers.get("location"), "/dash/login?returnTo=%2Fdash%2Fadmin")
})

test("expired Discord admin login states redirect back to login with a fresh prompt", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const started = await startDiscordLogin(runtime)
  const response = await fetch(`${runtime.baseUrl}/dash/login/discord/callback?state=expired-state`, {
    redirect: "manual",
    headers: {
      cookie: started.cookie
    }
  })

  const location = response.headers.get("location") || ""
  await response.arrayBuffer()

  assert.equal(response.status, 302)
  assert.match(location, /^\/dash\/login\?/)
  assert.match(decodeURIComponent(location), /Discord sign-in attempt expired/)
  assert.match(location, /returnTo=%2Fdash%2Fadmin/)

  const refreshed = await fetch(`${runtime.baseUrl}${location}`, {
    headers: started.cookie ? { cookie: started.cookie } : {}
  })
  const refreshedHtml = await refreshed.text()

  assert.equal(refreshed.status, 200)
  assert.match(refreshedHtml, /The Discord sign-in attempt expired\. Start again\./)
  assert.match(refreshedHtml, /href="\/dash\/login\/discord\?returnTo=%2Fdash%2Fadmin"/)
})

test("Discord admin login callback rejects missing codes", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const started = await startDiscordLogin(runtime)
  const response = await fetch(`${runtime.baseUrl}/dash/login/discord/callback?state=${encodeURIComponent(started.state)}`, {
    redirect: "manual",
    headers: {
      cookie: started.cookie
    }
  })
  const location = String(response.headers.get("location") || "")
  await response.arrayBuffer()

  assert.equal(response.status, 302)
  assert.match(decodeURIComponent(location), /Discord sign-in did not return a usable code/)
  assert.match(location, /returnTo=%2Fdash%2Fadmin/)
})

test("seeded owners can bootstrap admin access while non-mapped members cannot sign in", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const owner = await login(runtime, "owner-user")
  const ownerHome = await fetch(`${runtime.baseUrl}/dash/admin`, {
    headers: { cookie: owner.cookie }
  })
  const ownerHtml = await ownerHome.text()

  assert.equal(ownerHome.status, 200)
  assert.match(ownerHtml, />Home</)
  assert.match(ownerHtml, /href="\/dash\/admin\/advanced"[^>]*>Advanced</)

  const memberStarted = await startDiscordLogin(runtime)
  const memberCompleted = await finishDiscordLogin(runtime, memberStarted.cookie, memberStarted.state, "member-user")
  const memberLocation = String(memberCompleted.response.headers.get("location") || "")
  await memberCompleted.response.arrayBuffer()

  assert.equal(memberCompleted.response.status, 302)
  assert.match(decodeURIComponent(memberLocation), /Your Discord account does not currently have admin-host access\./)
  assert.match(memberLocation, /returnTo=%2Fdash%2Fadmin/)
})

test("editors get ticket queue home without admin setup while reviewers stay inside quality review", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  seedArrayEditorFixtures(runtime.projectRoot)

  const reviewerStarted = await startDiscordLogin(runtime)
  const reviewerCompleted = await finishDiscordLogin(runtime, reviewerStarted.cookie, reviewerStarted.state, "reviewer-user")
  const reviewerLocation = String(reviewerCompleted.response.headers.get("location") || "")
  await reviewerCompleted.response.arrayBuffer()

  assert.equal(reviewerCompleted.response.status, 302)
  assert.equal(reviewerLocation, "/dash/admin/quality-review")
  const reviewerReview = await fetch(`${runtime.baseUrl}/dash/admin/quality-review`, {
    headers: { cookie: reviewerCompleted.cookie }
  })
  const reviewerReviewHtml = await reviewerReview.text()
  assert.equal(reviewerReview.status, 200)
  assert.match(reviewerReviewHtml, /Quality review workspace/)
  const reviewerTickets = await fetch(`${runtime.baseUrl}/dash/admin/tickets`, {
    headers: { cookie: reviewerCompleted.cookie },
    redirect: "manual"
  })
  await reviewerTickets.arrayBuffer()
  assert.equal(reviewerTickets.status, 302)
  assert.equal(reviewerTickets.headers.get("location"), "/dash/admin/quality-review")

  const { cookie } = await login(runtime, "editor-user", "/dash/visual/options")
  const optionsResponse = await fetch(`${runtime.baseUrl}/dash/visual/options`, {
    headers: { cookie }
  })
  const optionsHtml = await optionsResponse.text()
  const csrfToken = parseBodyData(optionsHtml, "csrf-token")

  assert.equal(optionsResponse.status, 200)
  assert.ok(csrfToken.length > 0)
  assert.doesNotMatch(optionsHtml, /Review JSON before apply/)
  assert.doesNotMatch(optionsHtml, /Create config backup/)
  assert.match(optionsHtml, /id="overflowCategories"[^>]*data-field-tools="none"/)
  assert.match(optionsHtml, /id="ticketAdmins"[^>]*data-field-tools="none"/)

  const panelsResponse = await fetch(`${runtime.baseUrl}/dash/visual/panels`, {
    headers: { cookie }
  })
  await panelsResponse.arrayBuffer()
  assert.equal(panelsResponse.status, 200)

  const questionsResponse = await fetch(`${runtime.baseUrl}/dash/visual/questions`, {
    headers: { cookie }
  })
  await questionsResponse.arrayBuffer()
  assert.equal(questionsResponse.status, 200)

  const editorHome = await fetch(`${runtime.baseUrl}/dash/admin`, {
    headers: { cookie }
  })
  const editorHomeHtml = await editorHome.text()
  assert.equal(editorHome.status, 200)
  assert.match(editorHomeHtml, /Ticket Queue/)
  assert.doesNotMatch(editorHomeHtml, /Setup areas/)
  assert.doesNotMatch(editorHomeHtml, /Quality review/)

  const disallowedGetTargets = [
    `${runtime.baseUrl}/dash/visual/general`,
    `${runtime.baseUrl}/dash/visual/transcripts`,
    `${runtime.baseUrl}/dash/config/general`,
    `${runtime.baseUrl}/dash/admin/runtime`,
    `${runtime.baseUrl}/dash/admin/plugins`,
    `${runtime.baseUrl}/dash/admin/evidence`,
    `${runtime.baseUrl}/dash/admin/security`,
    `${runtime.baseUrl}/dash/admin/advanced`,
    `${runtime.baseUrl}/dash/admin/quality-review`
  ]

  for (const target of disallowedGetTargets) {
    const response = await fetch(target, {
      headers: { cookie },
      redirect: "manual"
    })
    await response.arrayBuffer()

    assert.equal(response.status, 302)
    assert.equal(response.headers.get("location"), "/dash/visual/options")
  }

  const optionSaveResponse = await fetch(`${runtime.baseUrl}/dash/api/options/save`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      option: buildTicketOptionFixture({
        id: "ticket-main",
        name: "Main ticket revised",
        description: "Updated by editor.",
        questions: ["q-priority"]
      }),
      editIndex: 0
    })
  })
  const optionSave = await optionSaveResponse.json() as { success: boolean }
  assert.equal(optionSaveResponse.status, 200)
  assert.equal(optionSave.success, true)

  const panelSaveResponse = await fetch(`${runtime.baseUrl}/dash/api/panels/save`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      panel: buildPanelFixture({
        id: "panel-entry",
        name: "Entry panel revised",
        options: ["ticket-main", "ticket-alt"],
        text: "Updated by editor."
      }),
      editIndex: 0
    })
  })
  const panelSave = await panelSaveResponse.json() as { success: boolean }
  assert.equal(panelSaveResponse.status, 200)
  assert.equal(panelSave.success, true)

  const questionSaveResponse = await fetch(`${runtime.baseUrl}/dash/api/questions/save`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      question: buildQuestionFixture({
        id: "q-priority",
        name: "Priority revised",
        placeholder: "Updated by editor."
      }),
      editIndex: 0
    })
  })
  const questionSave = await questionSaveResponse.json() as { success: boolean }
  assert.equal(questionSaveResponse.status, 200)
  assert.equal(questionSave.success, true)

  const backupResponse = await fetch(`${runtime.baseUrl}/dash/admin/configs/backups/create`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      note: "editor denied"
    }).toString()
  })
  const backupBody = await backupResponse.text()

  assert.equal(backupResponse.status, 403)
  assert.equal(backupBody, "Forbidden")
})

test("authenticated sessions can access the raw config editor", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const editorResponse = await fetch(`${runtime.baseUrl}/dash/config/general`, {
    headers: { cookie }
  })
  const editorHtml = await editorResponse.text()

  assert.equal(editorResponse.status, 200)
  assert.match(editorHtml, /Advanced JSON editor/)
  assert.match(editorHtml, /general\.json/)
  assert.match(editorHtml, /__OPEN_TICKET_REDACTED_SECRET__/)
  assert.match(editorHtml, /data-json-editor="true" data-field-tools="json"/)
  assert.match(editorHtml, /codemirror-json\.js/)
  assert.match(editorHtml, /json-editor\.js/)
  assert.match(editorHtml, /Format JSON/)
  assert.match(editorHtml, /Minify JSON/)
  assert.match(editorHtml, /Validate JSON/)
  assert.match(editorHtml, /Jump to error/)
  assert.doesNotMatch(editorHtml, /(&quot;|&#34;)token(&quot;|&#34;):\s*(&quot;|&#34;)token/)

  const csrfToken = parseHiddenValue(editorHtml, "csrfToken")
  const currentGeneral = JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "config", "general.json"), "utf8"))
  const saveResponse = await fetch(`${runtime.baseUrl}/dash/config/general`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      json: JSON.stringify({
        ...currentGeneral,
        token: "__OPEN_TICKET_REDACTED_SECRET__",
        language: "german"
      }, null, 2)
    }).toString()
  })
  await saveResponse.arrayBuffer()

  assert.equal(saveResponse.status, 302)
  const savedGeneral = JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "config", "general.json"), "utf8"))
  assert.equal(savedGeneral.token, "token")
  assert.equal(savedGeneral.language, "german")

  const exported = await (await fetch(`${runtime.baseUrl}/dash/admin/configs/general/export`, {
    headers: { cookie }
  })).text()
  assert.match(exported, /__OPEN_TICKET_REDACTED_SECRET__/)
  assert.doesNotMatch(exported, /"token": "token"/)
})

test("json editor toolbar actions preserve invalid drafts and sync formatted submitted text", () => {
  const invalidDraft = "{\"broken\": true"
  const harness = createJsonEditorHarness(invalidDraft)
  assert.ok(harness.api)

  let inputEvents = 0
  harness.textarea.addEventListener("input", () => {
    inputEvents += 1
  })

  findButton(harness.api.shell, "Validate JSON")?.dispatchEvent(new FakeDashboardEvent("click"))
  assert.equal(harness.textarea.value, invalidDraft)
  assert.equal(inputEvents, 0)

  findButton(harness.api.shell, "Jump to error")?.dispatchEvent(new FakeDashboardEvent("click"))
  assert.equal(harness.textarea.value, invalidDraft)
  assert.equal(inputEvents, 0)

  harness.api.setValue("{\"alpha\":1,\"beta\":2}")
  inputEvents = 0
  findButton(harness.api.shell, "Format JSON")?.dispatchEvent(new FakeDashboardEvent("click"))
  assert.equal(harness.textarea.value, "{\n  \"alpha\": 1,\n  \"beta\": 2\n}")
  assert.ok(inputEvents > 0)

  inputEvents = 0
  findButton(harness.api.shell, "Minify JSON")?.dispatchEvent(new FakeDashboardEvent("click"))
  assert.equal(harness.textarea.value, "{\"alpha\":1,\"beta\":2}")
  assert.ok(inputEvents > 0)

  harness.form.dispatchEvent(new FakeDashboardEvent("submit"))
  assert.equal(harness.textarea.value, "{\"alpha\":1,\"beta\":2}")
})

test("json editor visible toolbar strings come from the locale payload", () => {
  const locale = JSON.parse(fs.readFileSync(path.join(pluginRoot, "locales", "english.json"), "utf8"))
  for (const key of [
    "format",
    "minify",
    "validate",
    "jumpToError",
    "foldAll",
    "unfoldAll",
    "search",
    "searchFind",
    "searchNext",
    "searchPrevious",
    "searchAll",
    "searchClose",
    "valid",
    "invalid",
    "savedDraft",
    "unsavedChanges"
  ]) {
    assert.equal(typeof locale.fieldTools.json[key], "string")
    assert.ok(locale.fieldTools.json[key].length > 0)
  }

  const source = fs.readFileSync(path.join(pluginRoot, "public", "js", "json-editor.js"), "utf8")
  for (const hardcoded of [
    "Format JSON",
    "Minify JSON",
    "Validate JSON",
    "Jump to error",
    "Fold all",
    "Unfold all",
    "Find",
    "Next match",
    "Previous match",
    "Select all matches",
    "Close search",
    "Saved draft",
    "Unsaved changes"
  ]) {
    assert.equal(
      source.includes(`"${hardcoded}"`) || source.includes(`'${hardcoded}'`) || source.includes(`\`${hardcoded}\``),
      false
    )
  }
  assert.match(source, /fieldTools\.json/)

  const bundleSource = fs.readFileSync(path.join(pluginRoot, "scripts", "build-editor.mjs"), "utf8")
  assert.match(bundleSource, /createSearchOnlyPanel/)
  assert.match(bundleSource, /searchMessages/)
  assert.match(bundleSource, /button\.setAttribute\("title", label\)/)
  assert.match(bundleSource, /input\.setAttribute\("title", findLabel\)/)
  assert.doesNotMatch(bundleSource, /replaceNext|replaceAll|replaceField/)
})

test("field tools clean up opted-in id lists, keep values as strings, and honor opt-out and secret guards", () => {
  const idList = createFieldToolsHarness("id-list", " 123456789012345678 \n\n234567890123456789,\n 345678901234567890 ")
  let inputEvents = 0
  idList.textarea.addEventListener("input", () => {
    inputEvents += 1
  })

  findButton(idList.root, "Clean up list")?.dispatchEvent(new FakeDashboardEvent("click"))
  assert.equal(idList.textarea.value, "123456789012345678\n234567890123456789\n345678901234567890")
  assert.deepEqual(idList.textarea.value.split("\n"), [
    "123456789012345678",
    "234567890123456789",
    "345678901234567890"
  ])
  assert.equal(inputEvents, 1)

  const optedOut = createFieldToolsHarness("none", " 123 ")
  assert.equal(Boolean(findButton(optedOut.root, "Clean up list")), false)

  for (const attributes of [
    { name: "apiToken", "data-field-tools-copy": "true" },
    { name: "providerApiKey", "data-field-tools-copy": "true" },
    { id: "bearerHeader", "data-field-tools-copy": "true" }
  ] as Array<Record<string, string>>) {
    const secretShaped = createFieldToolsHarness("id-list", "secret-value", attributes)
    assert.equal(Boolean(findButton(secretShaped.root, "Copy")), false)
    assert.equal(Boolean(findButton(secretShaped.root, "Clean up list")), false)
  }
})

test("legacy in-scope config detail routes redirect to visual workspaces while transcripts detail stays available", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  for (const id of ["general", "options", "panels", "questions"]) {
    const response = await fetch(`${runtime.baseUrl}/dash/admin/configs/${id}`, {
      headers: { cookie },
      redirect: "manual"
    })
    await response.arrayBuffer()

    assert.equal(response.status, 302)
    assert.equal(response.headers.get("location"), `/dash/visual/${id}`)
  }

  const transcriptsResponse = await fetch(`${runtime.baseUrl}/dash/admin/configs/transcripts`, {
    headers: { cookie },
    redirect: "manual"
  })
  const transcriptsHtml = await transcriptsResponse.text()

  assert.equal(transcriptsResponse.status, 200)
  assert.match(transcriptsHtml, /Transcript delivery/)
  assert.match(transcriptsHtml, /Open visual editor/)
  assert.match(transcriptsHtml, /data-json-editor="true" data-field-tools="json"/)
  assert.match(transcriptsHtml, /codemirror-json\.js/)
  assert.match(transcriptsHtml, /Validate JSON/)
})

test("config service blocks duplicate ids, reference-breaking edits, and persists array reorder", (t) => {
  const projectRoot = createTempProjectRoot()
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  })

  seedArrayEditorFixtures(projectRoot)
  const service = createConfigService(projectRoot)

  expectConfigOperationError(
    () => service.saveOption(buildTicketOptionFixture({ id: "ticket-main", name: "Duplicate option" }), -1),
    {
      code: "OPTION_DUPLICATE_ID",
      guidance: /Choose a different option ID/i
    }
  )

  expectConfigOperationError(
    () => service.savePanel({ id: "panel-entry" }, 1),
    {
      code: "PANEL_DUPLICATE_ID",
      guidance: /Choose a different panel ID/i
    }
  )

  expectConfigOperationError(
    () => service.saveQuestion({ id: "q-priority" }, 1),
    {
      code: "QUESTION_DUPLICATE_ID",
      guidance: /Choose a different question ID/i
    }
  )

  expectConfigOperationError(
    () => service.saveOption({ id: "ticket-renamed" }, 0),
    {
      code: "OPTION_RENAME_BLOCKED",
      guidance: /Remove this option from the listed panels first/i,
      referenceId: "panel-entry"
    }
  )

  expectConfigOperationError(
    () => service.deleteArrayItem("options", 0),
    {
      code: "OPTION_DELETE_BLOCKED",
      guidance: /Remove this option from the listed panels first/i,
      referenceId: "panel-entry"
    }
  )

  expectConfigOperationError(
    () => service.saveQuestion({ id: "q-priority-renamed" }, 0),
    {
      code: "QUESTION_RENAME_BLOCKED",
      guidance: /Remove this question from the listed options first/i,
      referenceId: "ticket-main"
    }
  )

  expectConfigOperationError(
    () => service.deleteArrayItem("questions", 0),
    {
      code: "QUESTION_DELETE_BLOCKED",
      guidance: /Remove this question from the listed options first/i,
      referenceId: "ticket-main"
    }
  )

  const reorderResult = service.reorderArrayItems("options", ["ticket-alt", "ticket-main"])
  assert.deepEqual(reorderResult.orderedIds, ["ticket-alt", "ticket-main"])
  assert.deepEqual(
    service.readManagedJson<Array<{ id: string }>>("options").map((option) => option.id),
    ["ticket-alt", "ticket-main"]
  )

  const dependencyGraph = service.getEditorDependencyGraph()
  assert.equal(dependencyGraph.optionPanels["ticket-main"]?.[0]?.id, "panel-entry")
  assert.equal(dependencyGraph.questionOptions["q-priority"]?.[0]?.id, "ticket-main")
})

test("root base-path auth redirects stay same-origin", async (t) => {
  const runtime = await startTestServer("/")
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const response = await fetch(`${runtime.baseUrl}/admin`, { redirect: "manual" })
  await response.arrayBuffer()

  assert.equal(response.status, 302)
  assert.equal(response.headers.get("location"), "/login?returnTo=%2Fadmin")
})

test("array editor routes expose dependency data, persist reorder, and return structured guard payloads", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  seedArrayEditorFixtures(runtime.projectRoot)

  const { cookie } = await login(runtime)
  const optionsPageResponse = await fetch(`${runtime.baseUrl}/dash/visual/options`, {
    headers: { cookie }
  })
  const optionsHtml = await optionsPageResponse.text()
  const csrfToken = parseBodyData(optionsHtml, "csrf-token")

  assert.equal(optionsPageResponse.status, 200)
  assert.ok(csrfToken.length > 0)
  assert.match(optionsHtml, /available-questions-data/)
  assert.match(optionsHtml, /dependency-graph-data/)
  assert.match(optionsHtml, /optionPanels/)
  assert.match(optionsHtml, /questionOptions/)
  assert.match(optionsHtml, /panel-entry/)

  const blockedRenameResponse = await fetch(`${runtime.baseUrl}/dash/api/questions/save`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      question: {
        id: "q-priority-renamed"
      },
      editIndex: 0
    })
  })
  const blockedRename = await blockedRenameResponse.json() as {
    success: boolean
    code: string
    guidance: string
    references: Array<{ id: string }>
  }

  assert.equal(blockedRenameResponse.status, 409)
  assert.equal(blockedRename.success, false)
  assert.equal(blockedRename.code, "QUESTION_RENAME_BLOCKED")
  assert.match(blockedRename.guidance, /Remove this question from the listed options first/i)
  assert.equal(blockedRename.references.some((reference) => reference.id === "ticket-main"), true)

  const optionsReorderResponse = await fetch(`${runtime.baseUrl}/dash/api/options/reorder`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      orderedIds: ["ticket-alt", "ticket-main"]
    })
  })
  const optionsReorder = await optionsReorderResponse.json() as {
    success: boolean
    orderedIds: string[]
  }

  assert.equal(optionsReorderResponse.status, 200)
  assert.equal(optionsReorder.success, true)
  assert.deepEqual(optionsReorder.orderedIds, ["ticket-alt", "ticket-main"])
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "config", "options.json"), "utf8")).map(
      (option: { id: string }) => option.id
    ),
    ["ticket-alt", "ticket-main"]
  )

  const panelsReorderResponse = await fetch(`${runtime.baseUrl}/dash/api/panels/reorder`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      orderedIds: ["panel-backup", "panel-entry"]
    })
  })
  const panelsReorder = await panelsReorderResponse.json() as {
    success: boolean
    orderedIds: string[]
  }

  assert.equal(panelsReorderResponse.status, 200)
  assert.equal(panelsReorder.success, true)
  assert.deepEqual(panelsReorder.orderedIds, ["panel-backup", "panel-entry"])
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "config", "panels.json"), "utf8")).map(
      (panel: { id: string }) => panel.id
    ),
    ["panel-backup", "panel-entry"]
  )

  const questionsReorderResponse = await fetch(`${runtime.baseUrl}/dash/api/questions/reorder`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      orderedIds: ["q-context", "q-priority"]
    })
  })
  const questionsReorder = await questionsReorderResponse.json() as {
    success: boolean
    orderedIds: string[]
  }

  assert.equal(questionsReorderResponse.status, 200)
  assert.equal(questionsReorder.success, true)
  assert.deepEqual(questionsReorder.orderedIds, ["q-context", "q-priority"])
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "config", "questions.json"), "utf8")).map(
      (question: { id: string }) => question.id
    ),
    ["q-context", "q-priority"]
  )

  const blockedDeleteResponse = await fetch(`${runtime.baseUrl}/dash/api/options/delete/1`, {
    method: "POST",
    headers: {
      cookie,
      "x-csrf-token": csrfToken
    }
  })
  const blockedDelete = await blockedDeleteResponse.json() as {
    success: boolean
    code: string
    guidance: string
    references: Array<{ id: string }>
  }

  assert.equal(blockedDeleteResponse.status, 409)
  assert.equal(blockedDelete.success, false)
  assert.equal(blockedDelete.code, "OPTION_DELETE_BLOCKED")
  assert.match(blockedDelete.guidance, /Remove this option from the listed panels first/i)
  assert.equal(blockedDelete.references.some((reference) => reference.id === "panel-entry"), true)
})

test("general visual editor renders runtime-aligned enum choices", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const generalHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/general`, {
    headers: { cookie }
  })).text()
  const csrfToken = parseBodyData(generalHtml, "csrf-token")

  assert.ok(csrfToken.length > 0)
  assert.match(generalHtml, /value="custom"/)
  assert.match(generalHtml, /Saved token configured/)
  assert.doesNotMatch(generalHtml, /name="token" value="token"/)
  assert.doesNotMatch(generalHtml, /hero-eyebrow/)
  assert.match(generalHtml, /data-responsive-disclosure="workspace-advanced-tools"/)
  assert.match(generalHtml, /class="card-actions editor-utility-actions"/)
  assert.match(generalHtml, /class="editor-savebar-copy"/)
  assert.doesNotMatch(generalHtml, /utility tray for raw JSON, backup, review, and restore tasks/)
  assert.doesNotMatch(generalHtml, /field names unchanged/)
  assert.doesNotMatch(generalHtml, /value="competing"/)
  assert.match(generalHtml, /value="double"/)
  assert.match(generalHtml, /value="disabled"/)
  assert.doesNotMatch(generalHtml, /value="none"/)

  const saveResponse = await fetch(`${runtime.baseUrl}/dash/api/config/general`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      token: "",
      mainColor: "#ffffff",
      language: "english",
      prefix: "!ticket ",
      serverId: "1",
      globalAdmins: "[]",
      slashCommands: "on",
      "status.type": "watching",
      "status.mode": "online",
      "system.emojiStyle": "before"
    }).toString()
  })
  await saveResponse.arrayBuffer()

  assert.equal(saveResponse.status, 302)
  const savedGeneral = JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "config", "general.json"), "utf8"))
  assert.equal(savedGeneral.token, "token")
})

test("array visual editors expose compact toolbar and savebar hooks without duplicate item-card kickers", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const optionsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/options`, {
    headers: { cookie }
  })).text()
  assert.match(optionsHtml, /Duplicate/)
  assert.match(optionsHtml, /class="card-actions editor-toolbar-actions"/)
  assert.match(optionsHtml, /class="editor-savebar-copy"/)
  assert.doesNotMatch(optionsHtml, /class="brand-logo"/)
  assert.doesNotMatch(optionsHtml, /<p class="config-file">Assigned questions<\/p>/)
  assert.doesNotMatch(optionsHtml, /<p class="config-file">Referencing panels<\/p>/)

  const panelsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/panels`, {
    headers: { cookie }
  })).text()
  assert.match(panelsHtml, /Duplicate/)
  assert.match(panelsHtml, /class="card-actions editor-toolbar-actions"/)
  assert.match(panelsHtml, /class="editor-savebar-copy"/)
  assert.doesNotMatch(panelsHtml, /class="brand-logo"/)
  assert.doesNotMatch(panelsHtml, /<p class="config-file">Selected options<\/p>/)
  assert.doesNotMatch(panelsHtml, /<p class="config-file">Member-facing summary<\/p>/)

  const questionsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/questions`, {
    headers: { cookie }
  })).text()
  assert.match(questionsHtml, /Duplicate/)
  assert.match(questionsHtml, /class="card-actions editor-toolbar-actions"/)
  assert.match(questionsHtml, /class="editor-savebar-copy"/)
  assert.doesNotMatch(questionsHtml, /class="brand-logo"/)
  assert.doesNotMatch(questionsHtml, /<p class="config-file">Referenced by options<\/p>/)
})

test("transcripts visual editor renders runtime-aligned enum choices", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const transcriptsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/transcripts`, {
    headers: { cookie }
  })).text()

  assert.match(transcriptsHtml, /<option value="html" selected>HTML transcript<\/option>/)
  assert.match(transcriptsHtml, /<option value="text" >Text transcript<\/option>/)
  assert.match(transcriptsHtml, /<option value="normal" selected>Normal<\/option>/)
  assert.match(transcriptsHtml, /<option value="channel-name" selected>Channel name<\/option>/)
  assert.match(transcriptsHtml, /<option value="channel-id" >Channel ID<\/option>/)
  assert.doesNotMatch(transcriptsHtml, /value="txt"/)
  assert.doesNotMatch(transcriptsHtml, /value="ticket-id"/)
  assert.doesNotMatch(transcriptsHtml, /<option value="html" selected>html<\/option>/)
  assert.match(transcriptsHtml, /Control transcript delivery defaults and preview the locked Discord-default appearance\./)
})

test("transcripts visual editor degrades cleanly when preview capability is unavailable", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const transcriptsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/transcripts`, {
    headers: { cookie }
  })).text()

  assert.match(transcriptsHtml, /Preview is unavailable/)
  assert.match(transcriptsHtml, /service is healthy and connected to the dashboard runtime/i)
  assert.match(transcriptsHtml, /Transcript delivery/)
  assert.match(transcriptsHtml, /Advanced transcript options/)
  assert.doesNotMatch(transcriptsHtml, /name="transcript-style-preview"/)
})

test("transcript preview routes require auth and render saved and unsaved drafts without persisting preview changes", async (t) => {
  const runtime = await startTestServer("/dash", {
    runtimeBridge: createTranscriptPreviewRuntimeBridge()
  })
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const unauthenticated = await fetch(`${runtime.baseUrl}/dash/visual/transcripts/preview`, { redirect: "manual" })
  await unauthenticated.arrayBuffer()
  assert.equal(unauthenticated.status, 302)

  const { cookie } = await login(runtime)
  const editorHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/transcripts`, {
    headers: { cookie }
  })).text()
  const csrfToken = parseBodyData(editorHtml, "csrf-token")

  assert.match(editorHtml, /Discord-default appearance/)
  assert.match(editorHtml, /locked Discord-default dark appearance/i)
  assert.match(editorHtml, /Refresh preview/)
  assert.match(editorHtml, /name="transcript-style-preview"/)

  const getPreview = await fetch(`${runtime.baseUrl}/dash/visual/transcripts/preview`, {
    headers: { cookie }
  })
  const getPreviewHtml = await getPreview.text()

  assert.equal(getPreview.status, 200)
  assert.match(getPreview.headers.get("content-security-policy") || "", /frame-ancestors 'self'/)
  assert.match(getPreviewHtml, /#1e1f22/)
  assert.match(getPreviewHtml, /#313338/)

  const postPreview = await fetch(`${runtime.baseUrl}/dash/visual/transcripts/preview`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      "htmlTranscriptStyle.header.backgroundColor": "#123456",
      "htmlTranscriptStyle.background.backgroundColor": "#010203"
    }).toString()
  })
  const postPreviewHtml = await postPreview.text()

  assert.equal(postPreview.status, 200)
  assert.match(postPreviewHtml, /#1e1f22/)
  assert.match(postPreviewHtml, /#313338/)
  assert.doesNotMatch(postPreviewHtml, /#123456/)
  assert.doesNotMatch(postPreviewHtml, /#010203/)

  const savedTranscripts = JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "config", "transcripts.json"), "utf8"))
  assert.equal(savedTranscripts.htmlTranscriptStyle.header.backgroundColor, "#202225")
  assert.equal(savedTranscripts.htmlTranscriptStyle.background.backgroundColor, "")
})

test("options visual editor renders runtime-aligned enum choices", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  seedArrayEditorFixtures(runtime.projectRoot)

  const { cookie } = await login(runtime)
  const optionsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/options`, {
    headers: { cookie }
  })).text()

  assert.match(optionsHtml, /id="createOptionButton"/)
  assert.match(optionsHtml, /Duplicate/)
  assert.match(optionsHtml, /Move up/)
  assert.match(optionsHtml, /Question assignment/)
  assert.match(optionsHtml, /Assigned questions/)
  assert.match(optionsHtml, /data-question-id="q-priority"/)
  assert.doesNotMatch(optionsHtml, /Primary editor/)
  assert.doesNotMatch(optionsHtml, /leave raw JSON in the advanced tools tray/)
  assert.doesNotMatch(optionsHtml, /payload shape unchanged/)
  assert.match(optionsHtml, /value="blue"/)
  assert.match(optionsHtml, /value="counter-dynamic"/)
  assert.match(optionsHtml, /value="user-nickname"/)
  assert.match(optionsHtml, /value="random-hex"/)
  assert.doesNotMatch(optionsHtml, /id="openOptionModal"/)
  assert.doesNotMatch(optionsHtml, /<option value="primary">/)
  assert.doesNotMatch(optionsHtml, /<option value="number">/)
})

test("panels visual editor renders runtime-aligned enum choices", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  seedArrayEditorFixtures(runtime.projectRoot)

  const { cookie } = await login(runtime)
  const panelsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/panels`, {
    headers: { cookie }
  })).text()

  assert.match(panelsHtml, /id="createPanelButton"/)
  assert.match(panelsHtml, /Duplicate/)
  assert.match(panelsHtml, /Option picker/)
  assert.match(panelsHtml, /Member preview/)
  assert.match(panelsHtml, /data-option-id="ticket-main"/)
  assert.doesNotMatch(panelsHtml, /Primary editor/)
  assert.doesNotMatch(panelsHtml, /raw JSON stays in advanced tools/)
  assert.doesNotMatch(panelsHtml, /payload shape unchanged/)
  assert.doesNotMatch(panelsHtml, /id="openPanelModal"/)
  assert.doesNotMatch(panelsHtml, /value="compact"/)
})

test("questions visual editor renders usage summaries and non-modal workspace controls", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  seedArrayEditorFixtures(runtime.projectRoot)

  const { cookie } = await login(runtime)
  const questionsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/questions`, {
    headers: { cookie }
  })).text()

  assert.match(questionsHtml, /id="createQuestionButton"/)
  assert.match(questionsHtml, /Duplicate/)
  assert.match(questionsHtml, /Usage/)
  assert.match(questionsHtml, /Question details/)
  assert.match(questionsHtml, /ticket-main/)
  assert.doesNotMatch(questionsHtml, /Primary editor/)
  assert.doesNotMatch(questionsHtml, /raw JSON stays in advanced tools/)
  assert.doesNotMatch(questionsHtml, /payload shape unchanged/)
  assert.doesNotMatch(questionsHtml, /id="openQuestionModal"/)
})

test("raw editor keeps invalid JSON in the form after a failed save", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const editorResponse = await fetch(`${runtime.baseUrl}/dash/config/general`, {
    headers: { cookie }
  })
  const editorHtml = await editorResponse.text()
  const csrfToken = parseHiddenValue(editorHtml, "csrfToken")
  const invalidJson = "{\"broken\": true"

  const response = await fetch(`${runtime.baseUrl}/dash/config/general`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      json: invalidJson
    }).toString()
  })
  const html = await response.text()

  assert.equal(response.status, 400)
  assert.match(html, /Invalid JSON:/)
  assert.match(html, /(&quot;|&#34;)broken(&quot;|&#34;): true/)
})

test("authenticated admin home renders the beginner-first nav and keeps advanced routes available", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const response = await fetch(`${runtime.baseUrl}/dash/admin`, {
    headers: { cookie }
  })
  const html = await response.text()

  assert.equal(response.status, 200)
  assert.match(html, />Home</)
  assert.match(html, /Check system status and review setup from one place\./)
  assert.match(html, /aria-label="Primary navigation"/)
  assert.match(html, /href="\/dash\/admin"[^>]*>Home</)
  assert.doesNotMatch(html, /href="\/dash\/admin\/configs"[^>]*>Setup</)
  assert.match(html, /href="\/dash\/admin\/tickets"[^>]*>Tickets</)
  assert.match(html, /href="\/dash\/admin\/transcripts"[^>]*>Transcripts</)
  assert.match(html, /href="\/dash\/admin\/plugins"[^>]*>Add-ons</)
  assert.match(html, /href="\/dash\/admin\/advanced"[^>]*>Advanced</)
  assert.doesNotMatch(html, /Public landing/)
  assert.doesNotMatch(html, /brand-logo/)
  assert.doesNotMatch(html, /brand-kicker/)
  assert.doesNotMatch(html, /href="\/dash\/health"/)
  assert.doesNotMatch(html, /class="site-footer"/)
  assert.match(html, /id="dashboard-ui-messages"/)
  assert.doesNotMatch(html, /href="\/dash\/admin\/runtime"[^>]*class="rail-link/)
  assert.doesNotMatch(html, /href="\/dash\/admin\/evidence"[^>]*class="rail-link/)
  assert.doesNotMatch(html, /control center/i)
  assert.doesNotMatch(html, /Daily work/)
  assert.doesNotMatch(html, /Review live tickets/)
  assert.match(html, /overview-stage-status/)
  assert.match(html, /System health/)
  assert.doesNotMatch(html, /class="status-strip tone-/)
  assert.match(html, /\/dash\/admin\/configs/)
  assert.match(html, /\/dash\/admin\/plugins/)
  assert.match(html, /\/dash\/admin\/tickets/)

  const ticketsResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets`, {
    headers: { cookie }
  })
  const ticketsHtml = await ticketsResponse.text()
  assert.equal(ticketsResponse.status, 200)
  assert.match(ticketsHtml, /Ticket workbench/)
  assert.match(ticketsHtml, /Ticket inventory is unavailable/)

  const advancedResponse = await fetch(`${runtime.baseUrl}/dash/admin/advanced`, {
    headers: { cookie }
  })
  const securityResponse = await fetch(`${runtime.baseUrl}/dash/admin/security`, {
    headers: { cookie }
  })
  const runtimeResponse = await fetch(`${runtime.baseUrl}/dash/admin/runtime`, {
    headers: { cookie }
  })
  const evidenceResponse = await fetch(`${runtime.baseUrl}/dash/admin/evidence`, {
    headers: { cookie }
  })

  const advancedHtml = await advancedResponse.text()
  await securityResponse.arrayBuffer()
  await runtimeResponse.arrayBuffer()
  const evidenceHtml = await evidenceResponse.text()

  assert.equal(advancedResponse.status, 200)
  assert.doesNotMatch(advancedHtml, /setup\.areas\./)
  assert.doesNotMatch(advancedHtml, /advanced\.sections\.editors\.items\./)
  assert.equal(securityResponse.status, 200)
  assert.equal(runtimeResponse.status, 200)
  assert.equal(evidenceResponse.status, 200)
  assert.match(evidenceHtml, /evidence[\\/]ot-dashboard-plugin-self-containment-verification\.md/)
  assert.doesNotMatch(evidenceHtml, /C:\\Users\\/)
})

test("security workspace writes only allowed routing and RBAC fields, keeps secrets read-only, and records backups plus audit evidence", async (t) => {
  const runtime = await startTestServer("/dash", { useTempPluginRoot: true })
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const securityResponse = await fetch(`${runtime.baseUrl}/dash/admin/security`, {
    headers: { cookie }
  })
  const securityHtml = await securityResponse.text()
  const csrfToken = parseBodyData(securityHtml, "csrf-token")

  assert.equal(securityResponse.status, 200)
  assert.ok(csrfToken.length > 0)
  assert.match(securityHtml, /Security workspace/)
  assert.match(securityHtml, /Secret readiness/)
  for (const fieldName of [
    "rbac.ownerUserIds",
    "rbac.roleIds.reviewer",
    "rbac.roleIds.editor",
    "rbac.roleIds.admin",
    "rbac.userIds.reviewer",
    "rbac.userIds.editor",
    "rbac.userIds.admin"
  ]) {
    assert.match(securityHtml, new RegExp(`name="${fieldName.replace(/[.]/g, "\\.")}"[^>]*data-field-tools="id-list"`))
  }
  assert.doesNotMatch(securityHtml, /name="sessionSecret"/)
  assert.doesNotMatch(securityHtml, /name="auth\.breakglass\.passwordHash"/)
  assert.doesNotMatch(securityHtml, /name="auth\.discord\.clientSecret"/)
  assert.doesNotMatch(securityHtml, /name="auth\.maxAgeHours"/)
  assert.doesNotMatch(securityHtml, /data-field-tools-copy/)
  assert.doesNotMatch(securityHtml, /data-field-tools="secret"/)

  const configPath = path.join(runtime.projectRoot, "plugins", "ot-dashboard", "config.json")
  const beforeConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))

  const saveResponse = await fetch(`${runtime.baseUrl}/dash/admin/security`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      publicBaseUrl: "https://admin.example",
      viewerPublicBaseUrl: "https://records.example",
      trustProxyHops: "3",
      "rbac.ownerUserIds": " 100000000000000001 \n\n100000000000000002 ",
      "rbac.roleIds.reviewer": "200000000000000001",
      "rbac.roleIds.editor": "200000000000000002",
      "rbac.roleIds.admin": "200000000000000003",
      "rbac.userIds.reviewer": "300000000000000001",
      "rbac.userIds.editor": "300000000000000002",
      "rbac.userIds.admin": "admin-user\n\n 300000000000000003 ",
      "auth.breakglass.enabled": "true"
    }).toString()
  })
  await saveResponse.arrayBuffer()

  assert.equal(saveResponse.status, 302)
  assert.match(decodeURIComponent(String(saveResponse.headers.get("location") || "")), /Saved security settings/)

  const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
  assert.equal(savedConfig.publicBaseUrl, "https://admin.example")
  assert.equal(savedConfig.viewerPublicBaseUrl, "https://records.example")
  assert.equal(savedConfig.trustProxyHops, 3)
  assert.deepEqual(savedConfig.rbac.ownerUserIds, ["100000000000000001", "100000000000000002"])
  assert.deepEqual(savedConfig.rbac.roleIds.reviewer, ["200000000000000001"])
  assert.deepEqual(savedConfig.rbac.roleIds.editor, ["200000000000000002"])
  assert.deepEqual(savedConfig.rbac.roleIds.admin, ["200000000000000003"])
  assert.deepEqual(savedConfig.rbac.userIds.reviewer, ["300000000000000001"])
  assert.deepEqual(savedConfig.rbac.userIds.editor, ["300000000000000002"])
  assert.deepEqual(savedConfig.rbac.userIds.admin, ["admin-user", "300000000000000003"])
  assert.equal(savedConfig.auth.breakglass.enabled, true)
  assert.equal(savedConfig.auth.sessionSecret, beforeConfig.auth.sessionSecret)
  assert.equal(savedConfig.auth.passwordHash, beforeConfig.auth.passwordHash)

  const savedSecurityResponse = await fetch(`${runtime.baseUrl}/dash/admin/security`, {
    headers: { cookie }
  })
  const savedSecurityHtml = await savedSecurityResponse.text()
  assert.equal(savedSecurityResponse.status, 200)
  assert.match(savedSecurityHtml, /300000000000000003/)
  assert.doesNotMatch(savedSecurityHtml, /auth\.breakglass\.passwordHash/)

  const runtimeBackupRoot = path.join(runtime.projectRoot, "runtime", "ot-dashboard", "backups")
  const runtimeBackups = fs.readdirSync(runtimeBackupRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  assert.ok(runtimeBackups.length > 0)

  const securityBackupRoot = path.join(runtime.projectRoot, "runtime", "ot-dashboard", "security", "backups")
  const securityBackups = fs.readdirSync(securityBackupRoot)
  assert.ok(securityBackups.length > 0)

  const auditPath = path.join(runtime.projectRoot, "runtime", "ot-dashboard", "security", "audit.jsonl")
  assert.equal(fs.existsSync(auditPath), true)
  const auditText = fs.readFileSync(auditPath, "utf8")
  assert.match(auditText, /publicBaseUrl/)
  assert.match(auditText, /viewerPublicBaseUrl/)
  assert.match(auditText, /auth\.breakglass\.enabled/)
})

test("config review flow applies changes, exports json, and records runtime-owned backups", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const detailResponse = await fetch(`${runtime.baseUrl}/dash/visual/general`, {
    headers: { cookie }
  })
  const detailHtml = await detailResponse.text()
  const csrfToken = parseBodyData(detailHtml, "csrf-token")

  assert.match(detailHtml, /Advanced tools/)
  assert.match(detailHtml, /Review JSON before apply/)

  const reviewedConfig = {
    token: "token",
    mainColor: "#ffffff",
    language: "dutch",
    prefix: "!ticket ",
    serverId: "1",
    globalAdmins: [],
    slashCommands: true,
    textCommands: false,
    tokenFromENV: false,
    status: { enabled: true, type: "watching", mode: "online", text: "ready", state: "" },
    system: {
      emojiStyle: "before",
      pinEmoji: "📌",
      logs: { enabled: true, channel: "2" },
      limits: { enabled: true, globalMaximum: 5, userMaximum: 1 },
      channelTopic: {},
      permissions: {},
      messages: {}
    }
  }

  const reviewResponse = await fetch(`${runtime.baseUrl}/dash/admin/configs/general/review`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      sourceLabel: "Draft review",
      candidateText: JSON.stringify(reviewedConfig, null, 2)
    }).toString()
  })
  const reviewHtml = await reviewResponse.text()
  const reviewToken = parseHiddenValue(reviewHtml, "reviewToken")

  assert.equal(reviewResponse.status, 200)
  assert.match(reviewHtml, /Review general\.json before apply/)
  assert.match(reviewHtml, /Changed paths/)
  assert.match(reviewHtml, /__OPEN_TICKET_REDACTED_SECRET__/)
  assert.doesNotMatch(reviewHtml, /(&quot;|&#34;)token(&quot;|&#34;):\s*(&quot;|&#34;)token/)
  assert.ok(reviewToken.length > 0)

  const applyResponse = await fetch(`${runtime.baseUrl}/dash/admin/configs/general/apply`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      reviewToken
    }).toString()
  })
  await applyResponse.arrayBuffer()

  assert.equal(applyResponse.status, 302)
  assert.match(decodeURIComponent(String(applyResponse.headers.get("location") || "")), /Applied general\.json\./)

  const savedGeneral = JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "config", "general.json"), "utf8"))
  assert.equal(savedGeneral.language, "dutch")

  const backupRoot = path.join(runtime.projectRoot, "runtime", "ot-dashboard", "backups")
  const backupDirectories = fs.readdirSync(backupRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  assert.ok(backupDirectories.length > 0)

  const exported = await (await fetch(`${runtime.baseUrl}/dash/admin/configs/general/export`, {
    headers: { cookie }
  })).text()
  assert.match(exported, /"language": "dutch"/)
  assert.match(exported, /__OPEN_TICKET_REDACTED_SECRET__/)
  assert.doesNotMatch(exported, /"token": "token"/)
})

test("invalid config review drafts preserve the submitted json and surface an error", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const detailResponse = await fetch(`${runtime.baseUrl}/dash/visual/general`, {
    headers: { cookie }
  })
  const detailHtml = await detailResponse.text()
  const csrfToken = parseBodyData(detailHtml, "csrf-token")
  const invalidDraft = "{\"broken\": true"

  const reviewResponse = await fetch(`${runtime.baseUrl}/dash/admin/configs/general/review`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      sourceLabel: "Draft review",
      candidateText: invalidDraft
    }).toString()
  })
  const html = await reviewResponse.text()

  assert.equal(reviewResponse.status, 200)
  assert.match(html, /Fix the draft below and review again/)
  assert.match(html, /property value in JSON at position/)
  assert.match(html, /(&quot;|&#34;)broken(&quot;|&#34;): true/)
})

test("plugin inventory and detail routes render richer workbench data and ignore excluded directories", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  writePluginFixture(runtime.projectRoot, "manifest-only", {
    assets: {
      "config.json": JSON.stringify({ enabled: true, mode: "default" }, null, 2) + "\n",
      "data/runtime.json": JSON.stringify({ version: 1 }, null, 2) + "\n",
      "public/ignored.json": "{}\n",
      "dist/ignored.json": "{}\n",
      "locales/english.json": "{}\n",
      "node_modules/pkg.json": "{}\n",
      ".hidden/secret.json": "{}\n"
    }
  })

  const { cookie } = await login(runtime)
  const inventoryHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/plugins`, {
    headers: { cookie }
  })).text()

  assert.match(inventoryHtml, /Add-ons/)
  assert.match(inventoryHtml, /manifest-only/)
  assert.match(inventoryHtml, /Open/)
  assert.match(inventoryHtml, /2 JSON files/)
  assert.match(inventoryHtml, /Disabled/)
  assert.match(inventoryHtml, /pluginInventoryEmpty/)
  assert.match(inventoryHtml, /config\.json/)
  assert.match(inventoryHtml, /data\/runtime\.json/)
  assert.doesNotMatch(inventoryHtml, /Manifest only/)
  assert.doesNotMatch(inventoryHtml, /public\/ignored\.json/)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only`, {
    headers: { cookie }
  })
  const detailHtml = await detailResponse.text()

  assert.equal(detailResponse.status, 200)
  assert.match(detailHtml, /Manifest settings/)
  assert.match(detailHtml, /JSON files/)
  assert.match(detailHtml, /config\.json/)
  assert.match(detailHtml, /data\/runtime\.json/)
  assert.doesNotMatch(detailHtml, /public\/ignored\.json/)
  assert.match(detailHtml, /Create plugin backup/)

  const missingResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/missing-plugin`, {
    headers: { cookie }
  })
  await missingResponse.arrayBuffer()
  assert.equal(missingResponse.status, 404)
})

test("plugin manifest and asset flows apply changes, preserve fields, export data, and restore from plugin backups", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  writePluginFixture(runtime.projectRoot, "manifest-only", {
    manifest: {
      enabled: false,
      priority: 1,
      requiredPlugins: ["ot-other"],
      details: {
        author: "tester",
        contributors: ["reviewer"],
        shortDescription: "Plugin fixture",
        longDescription: "Plugin fixture used by the dashboard tests.",
        imageUrl: "",
        projectUrl: "",
        tags: ["fixture", "json"]
      }
    },
    assets: {
      "config.json": JSON.stringify({ enabled: true, mode: "default" }, null, 2) + "\n",
      "data/runtime.json": JSON.stringify({ version: 1 }, null, 2) + "\n"
    }
  })

  const { cookie } = await login(runtime)
  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only`, {
    headers: { cookie }
  })
  const detailHtml = await detailResponse.text()
  const csrfToken = parseBodyData(detailHtml, "csrf-token")

  const manifestReviewResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/manifest/review`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      enabled: "true",
      priority: "7"
    }).toString()
  })
  const manifestReviewHtml = await manifestReviewResponse.text()
  const manifestReviewToken = parseHiddenValue(manifestReviewHtml, "reviewToken")

  assert.equal(manifestReviewResponse.status, 200)
  assert.match(manifestReviewHtml, /Review manifest-only manifest changes/)
  assert.ok(manifestReviewToken.length > 0)

  const manifestApplyResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/manifest/apply`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      reviewToken: manifestReviewToken
    }).toString()
  })
  await manifestApplyResponse.arrayBuffer()

  assert.equal(manifestApplyResponse.status, 302)
  assert.match(decodeURIComponent(String(manifestApplyResponse.headers.get("location") || "")), /Restart required/)

  const savedManifestText = fs.readFileSync(path.join(runtime.projectRoot, "plugins", "manifest-only", "plugin.json"), "utf8")
  const savedManifest = JSON.parse(savedManifestText)
  assert.equal(savedManifest.enabled, true)
  assert.equal(savedManifest.priority, 7)
  assert.deepEqual(savedManifest.requiredPlugins, ["ot-other"])
  assert.equal(savedManifest.details.author, "tester")
  assert.ok(savedManifestText.indexOf('"enabled"') < savedManifestText.indexOf('"priority"'))
  assert.ok(savedManifestText.indexOf('"priority"') < savedManifestText.indexOf('"events"'))

  const manifestExport = await (await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/manifest/export`, {
    headers: { cookie }
  })).text()
  assert.match(manifestExport, /"enabled": true/)
  assert.match(manifestExport, /"priority": 7/)

  const manualBackupResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/backups/create`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      note: "before asset apply"
    }).toString()
  })
  await manualBackupResponse.arrayBuffer()
  const backupLocation = decodeURIComponent(String(manualBackupResponse.headers.get("location") || ""))
  const backupIdMatch = backupLocation.match(/Created plugin backup ([^.]+)\./)
  assert.ok(backupIdMatch)
  const backupId = String(backupIdMatch && backupIdMatch[1])

  const assetId = Buffer.from("config.json", "utf8").toString("base64url")
  const assetResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}`, {
    headers: { cookie }
  })
  const assetHtml = await assetResponse.text()

  assert.equal(assetResponse.status, 200)
  assert.match(assetHtml, /data-json-editor="true"/)
  assert.match(assetHtml, /data-field-tools="json"/)
  assert.match(assetHtml, /data-load-json-into="#pluginAssetDraft"/)
  assert.match(assetHtml, /codemirror-json\.js/)
  assert.match(assetHtml, /Validate JSON/)

  const assetReviewResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}/review`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      sourceLabel: "Plugin asset review",
      candidateText: JSON.stringify({ enabled: false, mode: "updated" }, null, 2)
    }).toString()
  })
  const assetReviewHtml = await assetReviewResponse.text()
  const assetReviewToken = parseHiddenValue(assetReviewHtml, "reviewToken")

  assert.equal(assetReviewResponse.status, 200)
  assert.match(assetReviewHtml, /Review config\.json before apply/)
  assert.ok(assetReviewToken.length > 0)

  const assetApplyResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}/apply`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      reviewToken: assetReviewToken
    }).toString()
  })
  await assetApplyResponse.arrayBuffer()

  assert.equal(assetApplyResponse.status, 302)
  assert.match(decodeURIComponent(String(assetApplyResponse.headers.get("location") || "")), /Restart required/)

  const savedAsset = JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "plugins", "manifest-only", "config.json"), "utf8"))
  assert.equal(savedAsset.mode, "updated")

  const assetExport = await (await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}/export`, {
    headers: { cookie }
  })).text()
  assert.match(assetExport, /"mode": "updated"/)

  const restoreReviewResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}/restore/${encodeURIComponent(backupId)}`, {
    headers: { cookie }
  })
  const restoreReviewHtml = await restoreReviewResponse.text()
  const restoreReviewToken = parseHiddenValue(restoreReviewHtml, "reviewToken")

  assert.equal(restoreReviewResponse.status, 200)
  assert.match(restoreReviewHtml, /Preview restore for config\.json/)
  assert.ok(restoreReviewToken.length > 0)

  const restoreApplyResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}/apply`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      reviewToken: restoreReviewToken
    }).toString()
  })
  await restoreApplyResponse.arrayBuffer()

  assert.equal(restoreApplyResponse.status, 302)
  const restoredAsset = JSON.parse(fs.readFileSync(path.join(runtime.projectRoot, "plugins", "manifest-only", "config.json"), "utf8"))
  assert.equal(restoredAsset.mode, "default")

  const pluginBackupRoot = path.join(runtime.projectRoot, "runtime", "ot-dashboard", "backups", "plugins", "manifest-only", backupId)
  const pluginBackupMetadata = JSON.parse(fs.readFileSync(path.join(pluginBackupRoot, "metadata.json"), "utf8"))
  assert.equal(pluginBackupMetadata.pluginId, "manifest-only")
  assert.equal(pluginBackupMetadata.files.some((file: { relativePath: string }) => file.relativePath === "plugin.json"), true)
  assert.equal(pluginBackupMetadata.files.some((file: { relativePath: string }) => file.relativePath === "config.json"), true)
  assert.equal(pluginBackupMetadata.files.some((file: { relativePath: string }) => file.relativePath === "data/runtime.json"), true)
})

test("plugin asset review preserves invalid drafts and new plugin POST routes reject missing csrf tokens", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  writePluginFixture(runtime.projectRoot, "manifest-only")
  const assetId = Buffer.from("config.json", "utf8").toString("base64url")

  const unauthenticatedResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only`, { redirect: "manual" })
  await unauthenticatedResponse.arrayBuffer()
  assert.equal(unauthenticatedResponse.status, 302)
  assert.equal(unauthenticatedResponse.headers.get("location"), "/dash/login?returnTo=%2Fdash%2Fadmin%2Fplugins%2Fmanifest-only")

  const { cookie } = await login(runtime)
  const assetPage = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}`, {
    headers: { cookie }
  })
  const assetHtml = await assetPage.text()
  const csrfToken = parseBodyData(assetHtml, "csrf-token")
  const invalidDraft = "{\"broken\": true"

  const invalidReviewResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}/review`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      candidateText: invalidDraft
    }).toString()
  })
  const invalidReviewHtml = await invalidReviewResponse.text()

  assert.equal(invalidReviewResponse.status, 200)
  assert.match(invalidReviewHtml, /Fix the draft below and review again/)
  assert.match(invalidReviewHtml, /property value in JSON at position/)
  assert.match(invalidReviewHtml, /(&quot;|&#34;)broken(&quot;|&#34;): true/)

  const traversalId = Buffer.from("../secret.json", "utf8").toString("base64url")
  const traversalResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${traversalId}`, {
    headers: { cookie },
    redirect: "manual"
  })
  await traversalResponse.arrayBuffer()
  assert.equal(traversalResponse.status, 404)

  const postTargets = [
    `${runtime.baseUrl}/dash/admin/plugins/manifest-only/manifest/review`,
    `${runtime.baseUrl}/dash/admin/plugins/manifest-only/manifest/apply`,
    `${runtime.baseUrl}/dash/admin/plugins/manifest-only/backups/create`,
    `${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}/review`,
    `${runtime.baseUrl}/dash/admin/plugins/manifest-only/assets/${assetId}/apply`
  ]

  for (const target of postTargets) {
    const response = await fetch(target, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: "reviewToken=fake"
    })
    await response.arrayBuffer()
    assert.equal(response.status, 403)
  }
})

test("runtime page keeps generic actions while plugin detail pages show only matching plugin-owned actions", async (t) => {
  let providerInvocation = ""
  const actionProviderBridge: DashboardActionProviderBridge = {
    list(_snapshot, options) {
      if (options && options.pluginId === "manifest-only") {
        return [
          {
            id: "owned-provider",
            title: "Owned plugin actions",
            pluginId: "manifest-only",
            availability: { available: true },
            actions: [
              {
                id: "owned:run",
                label: "Run owned action",
                description: "Owned action",
                confirmation: {
                  required: true,
                  text: "Run owned action?"
                },
                guard: {
                  auth: "required",
                  csrf: "required",
                  runtimeAvailability: "required"
                }
              }
            ]
          }
        ]
      }

      return [
        {
          id: "generic-provider",
          title: "Generic runtime actions",
          pluginId: null,
          availability: { available: true },
          actions: [
            {
              id: "generic:run",
              label: "Run generic action",
              description: "Generic action",
              confirmation: {
                required: true,
                text: "Run generic action?"
              },
              guard: {
                auth: "required",
                csrf: "required",
                runtimeAvailability: "required"
              }
            }
          ]
        }
      ]
    },
    async run(providerId, actionId) {
      providerInvocation = `${providerId}:${actionId}`
      return {
        ok: true,
        message: "Executed action."
      }
    }
  }

  const runtime = await startTestServer("/dash", { actionProviderBridge })
  t.after(async () => {
    await stopTestServer(runtime)
  })

  writePluginFixture(runtime.projectRoot, "manifest-only")
  const { cookie } = await login(runtime)

  const runtimeHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/runtime`, {
    headers: { cookie }
  })).text()
  assert.match(runtimeHtml, /Generic runtime actions/)
  assert.match(runtimeHtml, /Run generic action/)
  assert.doesNotMatch(runtimeHtml, /Owned plugin actions/)

  const pluginHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/plugins/manifest-only`, {
    headers: { cookie }
  })).text()
  assert.match(pluginHtml, /Owned plugin actions/)
  assert.match(pluginHtml, /Run owned action/)
  assert.doesNotMatch(pluginHtml, /Generic runtime actions/)

  const csrfToken = parseBodyData(runtimeHtml, "csrf-token")
  const actionResponse = await fetch(`${runtime.baseUrl}/dash/admin/actions/generic-provider/${encodeURIComponent("generic:run")}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      returnTo: "/dash/admin/runtime"
    }).toString()
  })
  await actionResponse.arrayBuffer()

  assert.equal(actionResponse.status, 302)
  assert.equal(providerInvocation, "generic-provider:generic:run")
})

test("ot-config-reload provider source keeps explicit guard metadata", () => {
  const providerSource = fs.readFileSync(
    path.join(pluginRoot, "server", "providers", "ot-config-reload-provider.ts"),
    "utf8"
  )

  assert.match(providerSource, /const REQUIRED_ACTION_GUARD: DashboardActionGuard = \{/)
  assert.match(providerSource, /auth: "required"/)
  assert.match(providerSource, /csrf: "required"/)
  assert.match(providerSource, /runtimeAvailability: "required"/)
  assert.match(providerSource, /id: "reload:all"/)
  assert.match(providerSource, /guard: REQUIRED_ACTION_GUARD/)
})

test("missing csrf tokens are rejected on authenticated POST routes", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const response = await fetch(`${runtime.baseUrl}/dash/logout`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    }
  })
  const body = await response.text()

  assert.equal(response.status, 403)
  assert.match(body, /Invalid CSRF token/)
})
