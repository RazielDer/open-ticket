import path from "path"

import { api, opendiscord, utilities } from "#opendiscord"

import { createDashboardApp } from "./server/create-app"
import { getDashboardSecurityWarnings, loadDashboardConfig } from "./server/dashboard-config"
import {
  beginDashboardTicketLoad,
  completeDashboardTicketLoad,
  refreshDashboardRuntimeSnapshot,
  registerDashboardRuntime
} from "./server/dashboard-runtime-registry"
import { installDashboardRuntimeApi } from "./server/dashboard-runtime-api"
import { registerOtConfigReloadProvider } from "./server/providers/ot-config-reload-provider"

if (utilities.project != "openticket") {
  throw new api.ODPluginError("This plugin only works in Open Ticket!")
}

const projectRoot = process.cwd()
const pluginRoot = path.resolve(projectRoot, "plugins", "ot-dashboard")
const config = loadDashboardConfig(pluginRoot)
const securityWarnings = getDashboardSecurityWarnings(config)

installDashboardRuntimeApi(config)
beginDashboardTicketLoad()
registerDashboardRuntime(opendiscord as any)
registerOtConfigReloadProvider(opendiscord as any)

for (const warning of securityWarnings) {
  opendiscord.log(`OT Dashboard security warning: ${warning}`, "plugin", [
    { key: "plugin", value: "ot-dashboard" }
  ])
}

opendiscord.events.get("afterPluginsLoaded").listen(() => {
  refreshDashboardRuntimeSnapshot("afterPluginsLoaded")
})

opendiscord.events.get("afterCheckersExecuted").listen(() => {
  refreshDashboardRuntimeSnapshot("afterCheckersExecuted")
})

opendiscord.events.get("onTicketLoad").listen(() => {
  beginDashboardTicketLoad()
})

opendiscord.events.get("afterTicketsLoaded").listen(() => {
  completeDashboardTicketLoad()
  refreshDashboardRuntimeSnapshot("afterTicketsLoaded")
})

opendiscord.events.get("onReadyForUsage").listen(() => {
  refreshDashboardRuntimeSnapshot("onReadyForUsage")
})

const { app } = createDashboardApp({ projectRoot, pluginRoot, configOverride: config })

app.listen(config.port, config.host, () => {
  const basePath = config.basePath === "/" ? "/" : `${config.basePath}/`
  console.log(`\x1b[35m[OT-DASHBOARD]\x1b[0m Listening on http://${config.host}:${config.port}${basePath}`)
})
