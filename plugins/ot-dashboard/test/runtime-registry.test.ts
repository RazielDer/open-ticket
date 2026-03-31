import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import {
  beginDashboardTicketLoad,
  clearDashboardRuntimeRegistry,
  completeDashboardTicketLoad,
  getDashboardPluginDetail,
  getDashboardRuntimeSnapshot,
  getDashboardRuntimeSource,
  listDashboardPlugins,
  registerDashboardRuntime
} from "../server/dashboard-runtime-registry"

class MockTicket {
  id: { value: string }
  option: { id: { value: string } }
  private data: Record<string, unknown>

  constructor(id: string, optionId: string) {
    this.id = { value: id }
    this.option = { id: { value: optionId } }
    this.data = {
      "opendiscord:open": true,
      "opendiscord:closed": false,
      "opendiscord:claimed": false,
      "opendiscord:pinned": false,
      "opendiscord:opened-by": "user-1",
      "opendiscord:opened-on": Date.now(),
      "opendiscord:closed-on": null,
      "opendiscord:reopened-on": null,
      "opendiscord:claimed-on": null,
      "opendiscord:pinned-on": null,
      "opendiscord:claimed-by": null,
      "opendiscord:pinned-by": null,
      "opendiscord:participants": [],
      "opendiscord:category-mode": "normal",
      "opendiscord:channel-suffix": "user-name"
    }
  }

  get(id: string) {
    return { value: this.data[id] }
  }

  set(id: string, value: unknown) {
    this.data[id] = value
  }
}

class MockTicketManager {
  private tickets: MockTicket[] = []
  private addListeners: Array<(ticket: MockTicket, overwritten: boolean) => void> = []
  private changeListeners: Array<(ticket: MockTicket) => void> = []
  private removeListeners: Array<(ticket: MockTicket) => void> = []

  getAll() {
    return this.tickets
  }

  onAdd(callback: (ticket: MockTicket, overwritten: boolean) => void) {
    this.addListeners.push(callback)
  }

  onChange(callback: (ticket: MockTicket) => void) {
    this.changeListeners.push(callback)
  }

  onRemove(callback: (ticket: MockTicket) => void) {
    this.removeListeners.push(callback)
  }

  add(ticket: MockTicket) {
    this.tickets.push(ticket)
    this.addListeners.forEach((listener) => listener(ticket, false))
  }

  change(ticket: MockTicket) {
    this.changeListeners.forEach((listener) => listener(ticket))
  }

  remove(ticket: MockTicket) {
    this.tickets = this.tickets.filter((item) => item !== ticket)
    this.removeListeners.forEach((listener) => listener(ticket))
  }
}

test("runtime registry import is side-effect free until a runtime is registered", () => {
  clearDashboardRuntimeRegistry()
  assert.equal(getDashboardRuntimeSource(), null)

  const snapshot = getDashboardRuntimeSnapshot()
  assert.equal(snapshot.availability, "unavailable")
  assert.equal(snapshot.warnings.length > 0, true)
})

test("runtime registry reports starting and ready snapshots and caps recent activity", () => {
  clearDashboardRuntimeRegistry()
  const tickets = new MockTicketManager()
  const runtime = {
    processStartupDate: new Date("2026-03-20T10:00:00Z"),
    readyStartupDate: null as Date | null,
    plugins: {
      getAll() {
        return []
      },
      unknownCrashedPlugins: []
    },
    checkers: {
      lastResult: null
    },
    stats: {
      getAll() {
        return []
      }
    },
    tickets
  }

  registerDashboardRuntime(runtime)
  beginDashboardTicketLoad()
  tickets.add(new MockTicket("historical-ticket", "support"))
  completeDashboardTicketLoad()

  let snapshot = getDashboardRuntimeSnapshot()
  assert.equal(snapshot.availability, "starting")
  assert.equal(snapshot.recentTicketActivity.length, 0)

  runtime.readyStartupDate = new Date("2026-03-20T10:05:00Z")
  for (let index = 0; index < 45; index += 1) {
    tickets.add(new MockTicket(`ticket-${index}`, "support"))
  }
  const trackedTicket = tickets.getAll()[0]
  trackedTicket.set("opendiscord:closed", true)
  trackedTicket.set("opendiscord:closed-on", Date.now())
  tickets.change(trackedTicket)

  snapshot = getDashboardRuntimeSnapshot()
  assert.equal(snapshot.availability, "ready")
  assert.equal(snapshot.recentTicketActivity.length, 40)
  assert.equal(snapshot.recentTicketActivity.some((item) => item.type === "closed"), true)
})

test("plugin inventory and detail discovery expose editable asset metadata and ignore excluded directories", () => {
  clearDashboardRuntimeRegistry()
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-registry-"))
  fs.mkdirSync(path.join(projectRoot, "plugins", "manifest-only", "data"), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "plugins", "manifest-only", "public"), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "plugins", "manifest-only", "dist"), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "plugins", "manifest-only", "locales"), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "plugins", "manifest-only", "node_modules"), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "plugins", "manifest-only", ".hidden"), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "plugins", "runtime-plugin"), { recursive: true })

  fs.writeFileSync(path.join(projectRoot, "plugins", "manifest-only", "plugin.json"), JSON.stringify({
    id: "manifest-only",
    name: "Manifest Only",
    version: "1.0.0",
    startFile: "index.ts",
    enabled: false,
    priority: 0,
    events: [],
    npmDependencies: [],
    requiredPlugins: [],
    incompatiblePlugins: [],
    details: {
      author: "tester",
      shortDescription: "Manifest only plugin",
      longDescription: "Manifest only plugin",
      imageUrl: "",
      projectUrl: "",
      tags: ["test"]
    }
  }, null, 2))
  fs.writeFileSync(path.join(projectRoot, "plugins", "manifest-only", "config.json"), "{}\n")
  fs.writeFileSync(path.join(projectRoot, "plugins", "manifest-only", "data", "runtime.json"), "{}\n")
  fs.writeFileSync(path.join(projectRoot, "plugins", "manifest-only", "public", "ignored.json"), "{}\n")
  fs.writeFileSync(path.join(projectRoot, "plugins", "manifest-only", "dist", "ignored.json"), "{}\n")
  fs.writeFileSync(path.join(projectRoot, "plugins", "manifest-only", "locales", "english.json"), "{}\n")
  fs.writeFileSync(path.join(projectRoot, "plugins", "manifest-only", "node_modules", "pkg.json"), "{}\n")
  fs.writeFileSync(path.join(projectRoot, "plugins", "manifest-only", ".hidden", "secret.json"), "{}\n")
  fs.writeFileSync(path.join(projectRoot, "plugins", "runtime-plugin", "plugin.json"), JSON.stringify({
    id: "runtime-plugin",
    name: "Runtime Plugin",
    version: "1.2.0",
    startFile: "index.ts",
    enabled: true,
    priority: 5,
    events: [],
    npmDependencies: [],
    requiredPlugins: [],
    incompatiblePlugins: [],
    details: {
      author: "tester",
      shortDescription: "Runtime plugin",
      longDescription: "Runtime plugin",
      imageUrl: "",
      projectUrl: "",
      tags: ["runtime"]
    }
  }, null, 2))

  registerDashboardRuntime({
    processStartupDate: new Date(),
    readyStartupDate: new Date(),
    plugins: {
      getAll() {
        return [
          {
            id: { value: "runtime-plugin" },
            name: "Runtime Plugin",
            enabled: true,
            executed: true,
            crashed: false,
            crashReason: null,
            priority: 5,
            version: { toString: () => "v1.2.0" }
          }
        ]
      },
      unknownCrashedPlugins: []
    },
    checkers: { lastResult: null },
    stats: { getAll: () => [] },
    tickets: new MockTicketManager()
  })

  const plugins = listDashboardPlugins({ projectRoot })
  const manifestOnly = plugins.find((plugin) => plugin.id === "manifest-only")
  const runtimePlugin = plugins.find((plugin) => plugin.id === "runtime-plugin")
  const manifestDetail = getDashboardPluginDetail({ projectRoot, pluginId: "manifest-only" })

  assert.ok(manifestOnly)
  assert.equal(manifestOnly?.source, "manifest")
  assert.deepEqual(manifestOnly?.configEntryPoints, ["config.json", "data/runtime.json"])
  assert.equal(manifestOnly?.assetCount, 2)
  assert.equal(manifestOnly?.editableAssets.every((asset) => asset.relativePath === "config.json" || asset.relativePath === "data/runtime.json"), true)

  assert.ok(runtimePlugin)
  assert.equal(runtimePlugin?.source, "runtime+manifest")
  assert.equal(runtimePlugin?.executed, true)

  assert.ok(manifestDetail)
  assert.equal(manifestDetail?.editableAssets.find((asset) => asset.relativePath === "config.json")?.kind, "json")
  assert.equal(manifestDetail?.editableAssets.find((asset) => asset.relativePath === "config.json")?.detectedRootShape, "object")
  assert.equal(manifestDetail?.warnings.length, 0)

  fs.rmSync(projectRoot, { recursive: true, force: true })
})
