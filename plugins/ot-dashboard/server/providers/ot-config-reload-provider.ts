import * as discord from "discord.js"

import * as api from "../../../../src/core/api/api"
import { registerDashboardActionProvider } from "../dashboard-action-registry"
import type { DashboardActionProvider } from "../dashboard-action-registry"
import type { DashboardActionGuard } from "../dashboard-action-registry"
import type { DashboardRuntimeSnapshot } from "../dashboard-runtime-registry"

type ManagedReloadTarget = "general" | "options" | "panels" | "questions" | "transcripts"
export type DashboardReloadTarget = ManagedReloadTarget | "all"

const RELOADABLE_CONFIGS: ManagedReloadTarget[] = ["general", "options", "panels", "questions", "transcripts"]
const REQUIRED_ACTION_GUARD: DashboardActionGuard = {
  auth: "required",
  csrf: "required",
  runtimeAvailability: "required"
}

export interface OtConfigReloadRuntime {
  flags: { get: (id: string) => { value: boolean } | null }
  configs: { get: (id: string) => any }
  checkers: { get: (id: string) => any; checkAll: (sort: boolean) => api.ODCheckerResult }
  client: { client?: { application?: { commands: { cache: Map<string, any> | { forEach: (callback: (command: any) => void) => void } } } } }
  languages: { getTranslation: (key: string) => string }
  plugins?: { get: (id: string) => any }
  log: (message: string, type?: any) => void
}

function getConfigPath(runtime: OtConfigReloadRuntime) {
  const devconfigFlag = runtime.flags.get("opendiscord:dev-config")
  return devconfigFlag?.value ? "./devconfig/" : "./config/"
}

async function reloadPanelCommand(runtime: OtConfigReloadRuntime) {
  const panelChoices: { name: string; value: string }[] = []
  try {
    const panelConfig = runtime.configs.get("opendiscord:panels")
    panelConfig?.data?.forEach?.((panel: any) => {
      panelChoices.push({ name: String(panel.name), value: String(panel.id) })
    })
  } catch (error) {
    runtime.log(`Error updating panel command: ${error}`, "error")
    return
  }

  const newOptions: discord.ApplicationCommandOptionData[] = [
    {
      name: "id",
      description: runtime.languages.getTranslation("commands.panelId"),
      type: discord.ApplicationCommandOptionType.String,
      required: true,
      choices: panelChoices
    },
    {
      name: "auto-update",
      description: runtime.languages.getTranslation("commands.panelAutoUpdate"),
      type: discord.ApplicationCommandOptionType.Boolean,
      required: false
    }
  ]

  runtime.client.client?.application?.commands?.cache?.forEach?.((command: any) => {
    if (command?.name === "panel" && typeof command.setOptions === "function") {
      command.setOptions(newOptions)
    }
  })
}

async function reloadMoveCommand(runtime: OtConfigReloadRuntime) {
  const ticketChoices: { name: string; value: string }[] = []
  try {
    const optionsConfig = runtime.configs.get("opendiscord:options")
    optionsConfig?.data?.forEach?.((option: any) => {
      if (option?.type !== "ticket") return
      ticketChoices.push({ name: String(option.name), value: String(option.id) })
    })
  } catch (error) {
    runtime.log(`Error updating move command: ${error}`, "error")
    return
  }

  const newOptions: discord.ApplicationCommandOptionData[] = [
    {
      name: "id",
      description: runtime.languages.getTranslation("commands.moveId"),
      type: discord.ApplicationCommandOptionType.String,
      required: true,
      choices: ticketChoices
    },
    {
      name: "reason",
      description: runtime.languages.getTranslation("commands.reason"),
      type: discord.ApplicationCommandOptionType.String,
      required: false
    }
  ]

  runtime.client.client?.application?.commands?.cache?.forEach?.((command: any) => {
    if (command?.name === "move" && typeof command.setOptions === "function") {
      command.setOptions(newOptions)
    }
  })
}

function withTemporaryChecker(runtime: OtConfigReloadRuntime, target: ManagedReloadTarget, config: api.ODJsonConfig) {
  const checker = runtime.checkers.get(`opendiscord:${target}`)
  const originalConfig = checker?.config
  if (checker) {
    checker.config = config
  }
  return () => {
    if (checker) {
      checker.config = originalConfig
    }
  }
}

async function prepareTargetChecker(runtime: OtConfigReloadRuntime, target: ManagedReloadTarget) {
  const temporaryConfig = new api.ODJsonConfig(`ot-config-reload:${target}`, `${target}.json`, getConfigPath(runtime))
  await temporaryConfig.init()
  const restoreChecker = withTemporaryChecker(runtime, target, temporaryConfig)
  return restoreChecker
}

export async function executeOtConfigReload(runtime: OtConfigReloadRuntime, target: DashboardReloadTarget) {
  const targets = target === "all" ? RELOADABLE_CONFIGS : [target]
  const restoreCallbacks: Array<() => void> = []

  try {
    for (const item of targets) {
      const restoreChecker = await prepareTargetChecker(runtime, item)
      restoreCallbacks.push(restoreChecker)
    }

    const checkerResult = runtime.checkers.checkAll(true)
    if (checkerResult.valid) {
      for (const item of targets) {
        runtime.configs.get(`opendiscord:${item}`)?.reload?.()
      }
      if (targets.includes("options")) {
        await reloadMoveCommand(runtime)
      }
      if (targets.includes("panels")) {
        await reloadPanelCommand(runtime)
      }
    }

    return {
      checkerResult,
      reloaded: checkerResult.valid ? targets : []
    }
  } finally {
    restoreCallbacks.reverse().forEach((restore) => restore())
  }
}

function providerAvailability(runtime: OtConfigReloadRuntime, snapshot: DashboardRuntimeSnapshot) {
  const plugin = runtime.plugins?.get?.("ot-config-reload")
  if (!plugin || plugin.executed !== true || plugin.crashed === true) {
    return {
      available: false,
      reason: "The `ot-config-reload` plugin is not loaded in the current runtime."
    }
  }
  if (snapshot.availability === "unavailable") {
    return {
      available: false,
      reason: "Open Ticket runtime is not available."
    }
  }
  return { available: true }
}

export function createOtConfigReloadProvider(runtime: OtConfigReloadRuntime): DashboardActionProvider {
  return {
    id: "ot-config-reload",
    title: "Config reload actions",
    pluginId: "ot-config-reload",
    availability(snapshot) {
      return providerAvailability(runtime, snapshot)
    },
    actions(snapshot) {
      const availability = providerAvailability(runtime, snapshot)
      if (!availability.available) return []
      return [
        {
          id: "reload:all",
          label: "Reload all configs",
          description: "Validate and reload every managed Open Ticket config.",
          confirmation: {
            required: true,
            text: "Reload all managed Open Ticket configs now?"
          },
          guard: REQUIRED_ACTION_GUARD
        },
        ...RELOADABLE_CONFIGS.map((target) => ({
          id: `reload:${target}`,
          label: `Reload ${target}`,
          description: `Validate and reload ${target}.json through the live runtime.`,
          confirmation: {
            required: true,
            text: `Reload ${target}.json now?`
          },
          guard: REQUIRED_ACTION_GUARD
        }))
      ]
    },
    async run(actionId, context) {
      const [, rawTarget = "all"] = String(actionId || "").split(":")
      const target = rawTarget === "all" ? "all" : RELOADABLE_CONFIGS.includes(rawTarget as ManagedReloadTarget) ? (rawTarget as ManagedReloadTarget) : null
      if (!target) {
        return {
          ok: false,
          message: `Unknown reload action: ${actionId}`
        }
      }

      const { checkerResult, reloaded } = await executeOtConfigReload(runtime, target)
      return {
        ok: checkerResult.valid,
        message: checkerResult.valid
          ? `Reloaded ${target === "all" ? "all managed configs" : `${target}.json`} successfully.`
          : `Reload validation failed for ${target === "all" ? "one or more managed configs" : `${target}.json`}.`,
        warnings: checkerResult.valid
          ? []
          : checkerResult.messages.filter((message) => message.type !== "info").slice(0, 6).map((message) => message.message)
      }
    }
  }
}

export function registerOtConfigReloadProvider(runtime: OtConfigReloadRuntime) {
  registerDashboardActionProvider(createOtConfigReloadProvider(runtime))
}
