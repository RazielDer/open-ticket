import { test } from "node:test"
import assert from "node:assert/strict"

import {
  clearDashboardPluginEntries,
  getDashboardPluginAssetKind,
  listDashboardPluginSections,
  registerDashboardPluginEntry
} from "../server/dashboard-plugin-registry"

test("plugin dashboard registry stores typed sections, asset hints, and async provider-built workbench sections", async () => {
  clearDashboardPluginEntries()

  registerDashboardPluginEntry({
    pluginId: "ot-config-reload",
    assetHints: [
      { relativePath: "config.json", kind: "object" },
      { relativePath: "data/items.json", kind: "array" }
    ],
    sections: [
      {
        type: "notice",
        id: "notice",
        title: "Notice",
        tone: "warning",
        body: "Restart required."
      },
      {
        type: "summary",
        id: "summary",
        title: "Summary",
        items: [
          {
            label: "Reloadables",
            value: "5",
            detail: "Managed configs"
          }
        ]
      }
    ],
    async buildSections(context) {
      return [
        {
          type: "workbench",
          id: "workspace",
          title: "Workspace",
          badge: { label: "Ready", tone: "success" },
          body: `Base path ${context.basePath}`,
          summaryItems: [
            {
              label: "Integration",
              value: "Ready",
              detail: "Dynamic provider section"
            }
          ],
          actions: [
            {
              label: "Open workspace",
              href: context.buildPath("admin", "transcripts")
            }
          ]
        }
      ]
    }
  })

  assert.equal(getDashboardPluginAssetKind("ot-config-reload", "config.json"), "object")
  assert.equal(getDashboardPluginAssetKind("ot-config-reload", "data\\items.json"), "array")
  assert.equal(getDashboardPluginAssetKind("ot-config-reload", "other.json"), "json")

  const sections = await listDashboardPluginSections("ot-config-reload", {
    basePath: "/dash",
    buildPath(...segments: string[]) {
      return `/dash/${segments.join("/")}`
    }
  })
  assert.equal(sections.length, 3)
  assert.equal(sections[0].type, "notice")
  assert.equal(sections[1].type, "summary")
  assert.equal(sections[2].type, "workbench")
  if (sections[2].type !== "workbench") {
    throw new Error("expected a workbench section")
  }
  assert.equal(sections[2].actions?.[0]?.href, "/dash/admin/transcripts")

  const missingSections = await listDashboardPluginSections("unregistered-plugin", {
    basePath: "/dash",
    buildPath(...segments: string[]) {
      return `/dash/${segments.join("/")}`
    }
  })
  assert.equal(missingSections.length, 0)

  clearDashboardPluginEntries()
})

test("plugin dashboard registry degrades provider failures to a generic warning notice", async () => {
  clearDashboardPluginEntries()

  registerDashboardPluginEntry({
    pluginId: "ot-failing-plugin",
    sections: [
      {
        type: "summary",
        id: "existing",
        title: "Existing",
        items: [{ label: "State", value: "Static" }]
      }
    ],
    buildSections() {
      return {
        invalid: true
      } as any
    }
  })

  const sections = await listDashboardPluginSections("ot-failing-plugin", {
    basePath: "/dash",
    buildPath(...segments: string[]) {
      return `/dash/${segments.join("/")}`
    }
  })

  assert.equal(sections.length, 2)
  assert.equal(sections[0].type, "summary")
  assert.deepEqual(sections[1], {
    type: "notice",
    id: "ot-failing-plugin-dynamic-sections-unavailable",
    title: "Additional plugin content unavailable",
    tone: "warning",
    body: "The dashboard could not load one or more plugin-owned sections for this page."
  })

  clearDashboardPluginEntries()
})
