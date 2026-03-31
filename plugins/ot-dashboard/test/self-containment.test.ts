import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

import {
  clearDashboardActionProviders,
  getDashboardActionProvider
} from "../server/dashboard-action-registry"
import {
  DASHBOARD_RUNTIME_API_SYMBOL,
  getDashboardRuntimeApi,
  installDashboardRuntimeApi
} from "../server/dashboard-runtime-api"
import {
  clearDashboardPluginEntries,
  getDashboardPluginEntry,
  listDashboardPluginSections
} from "../server/dashboard-plugin-registry"

// Tests run from dist/plugins/ot-dashboard/test, so walk back to the repo root.
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..")

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return []
  }

  const output: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      output.push(...listFiles(fullPath))
      continue
    }
    output.push(fullPath)
  }
  return output
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8")
}

function usesLegacyDashboardImport(filePath: string) {
  const source = readText(filePath)
  return /from\s+["'][^"']*src\/dashboard/.test(source) || /require\(\s*["'][^"']*src\/dashboard/.test(source)
}

test("dashboard source ownership stays inside plugins and root dashboard hooks remain removed", () => {
  const pluginsRoot = path.join(projectRoot, "plugins")
  const pluginSources = listFiles(pluginsRoot).filter((filePath) => filePath.endsWith(".ts"))
  const srcDashboardRoot = path.join(projectRoot, "src", "dashboard")

  assert.equal(
    pluginSources.some((filePath) => usesLegacyDashboardImport(filePath)),
    false
  )
  assert.deepEqual(listFiles(srcDashboardRoot), [])

  const rootIndex = readText(path.join(projectRoot, "src", "index.ts"))
  const startupInit = readText(path.join(projectRoot, "src", "core", "startup", "init.ts"))

  for (const token of [
    "registerDashboardRuntime",
    "beginDashboardTicketLoad",
    "completeDashboardTicketLoad",
    "refreshDashboardRuntimeSnapshot"
  ]) {
    assert.equal(rootIndex.includes(token), false)
    assert.equal(startupInit.includes(token), false)
  }
})

test("dashboard maintainer tooling lives under the plugin package boundary", () => {
  const rootPackageJson = JSON.parse(readText(path.join(projectRoot, "package.json")))
  const pluginPackageJson = JSON.parse(readText(path.join(projectRoot, "plugins", "ot-dashboard", "package.json")))

  assert.equal(Boolean(rootPackageJson.scripts?.["bundle:dashboard-editor"]), false)
  assert.equal(Boolean(rootPackageJson.scripts?.["test:dashboard"]), false)
  assert.equal(Boolean(rootPackageJson.scripts?.["verify:dashboard"]), false)

  for (const dependency of [
    "@codemirror/autocomplete",
    "@codemirror/commands",
    "@codemirror/lang-json",
    "@codemirror/language",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "esbuild"
  ]) {
    assert.equal(Boolean(rootPackageJson.devDependencies?.[dependency]), false)
  }

  assert.equal(pluginPackageJson.scripts?.["build:editor"], "node scripts/build-editor.mjs")
})

test("dashboard runtime API exposes plugin-owned registration hooks", async () => {
  clearDashboardActionProviders()
  clearDashboardPluginEntries()
  delete (globalThis as Record<symbol, unknown>)[DASHBOARD_RUNTIME_API_SYMBOL]

  const runtimeApi = installDashboardRuntimeApi()
  runtimeApi.registerActionProvider({
    id: "self-containment-provider",
    title: "Self containment",
    availability: () => ({ available: true }),
    actions: () => [],
    run: () => ({ ok: true, message: "ok" })
  })
  runtimeApi.registerPluginEntry({
    pluginId: "self-containment-plugin",
    async buildSections(context) {
      return [
        {
          type: "workbench",
          id: "self-containment",
          title: "Self containment",
          badge: { label: "Ready", tone: "success" },
          body: "Registered through the runtime API.",
          actions: [
            {
              label: "Open runtime",
              href: context.buildPath("admin", "runtime")
            }
          ]
        }
      ]
    }
  })

  assert.equal(getDashboardRuntimeApi(), runtimeApi)
  assert.equal(getDashboardActionProvider("self-containment-provider")?.id, "self-containment-provider")
  assert.equal(getDashboardPluginEntry("self-containment-plugin")?.pluginId, "self-containment-plugin")
  const sections = await listDashboardPluginSections("self-containment-plugin", {
    basePath: "/dash",
    buildPath(...segments: string[]) {
      return `/dash/${segments.join("/")}`
    }
  })
  assert.equal(sections[0]?.type, "workbench")
  if (sections[0]?.type !== "workbench") {
    throw new Error("expected a workbench section")
  }
  assert.equal(sections[0].actions?.[0]?.href, "/dash/admin/runtime")

  clearDashboardActionProviders()
  clearDashboardPluginEntries()
  delete (globalThis as Record<symbol, unknown>)[DASHBOARD_RUNTIME_API_SYMBOL]
})

test("dashboard source no longer special-cases transcript workbench rendering", () => {
  const adminRoutes = readText(path.join(projectRoot, "plugins", "ot-dashboard", "server", "routes", "admin.ts"))
  const pluginDetailTemplate = readText(path.join(projectRoot, "plugins", "ot-dashboard", "public", "views", "sections", "plugin-detail.ejs"))

  assert.equal(adminRoutes.includes('detail.id === "ot-html-transcripts"'), false)
  assert.equal(adminRoutes.includes("buildTranscriptWorkbenchModel"), false)
  assert.equal(pluginDetailTemplate.includes("detail.transcriptWorkspace"), false)
  assert.equal(pluginDetailTemplate.includes('section.type === "workbench"'), true)
})

test("ot-config-reload provider source stays plugin-owned and keeps the expected registration contract", () => {
  const providerSource = readText(path.join(projectRoot, "plugins", "ot-dashboard", "server", "providers", "ot-config-reload-provider.ts"))

  assert.match(providerSource, /export function createOtConfigReloadProvider/)
  assert.match(providerSource, /pluginId: "ot-config-reload"/)
  assert.match(providerSource, /registerDashboardActionProvider\(createOtConfigReloadProvider\(runtime\)\)/)
  assert.match(providerSource, /id: "reload:all"/)
  assert.match(providerSource, /guard: REQUIRED_ACTION_GUARD/)
})
