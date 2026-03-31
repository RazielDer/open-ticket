import fs from "fs"
import path from "path"

interface TranslationMap {
  [key: string]: string | TranslationMap
}

type TranslationNode = string | TranslationMap

export interface DashboardI18n {
  locale: string
  messages: TranslationMap
  t: (key: string, params?: Record<string, string | number>) => string
  pick: (keys: string[]) => Record<string, string>
}

function readLocaleFile(pluginRoot: string, locale: string): TranslationMap {
  const localePath = path.join(pluginRoot, "locales", `${locale}.json`)
  const fallbackPath = path.join(pluginRoot, "locales", "english.json")
  const selected = fs.existsSync(localePath) ? localePath : fallbackPath
  return JSON.parse(fs.readFileSync(selected, "utf8")) as TranslationMap
}

function getNode(messages: TranslationMap, key: string): TranslationNode | undefined {
  return key.split(".").reduce<TranslationNode | undefined>((node, segment) => {
    if (!node || typeof node === "string") return undefined
    return node[segment]
  }, messages)
}

function interpolate(message: string, params?: Record<string, string | number>): string {
  if (!params) return message
  return Object.entries(params).reduce((text, [key, value]) => {
    return text.replace(new RegExp(`\\{${key}\\}`, "g"), String(value))
  }, message)
}

export function loadI18n(pluginRoot: string, locale: string): DashboardI18n {
  const normalizedLocale = locale || "english"
  const messages = readLocaleFile(pluginRoot, normalizedLocale)

  const t = (key: string, params?: Record<string, string | number>): string => {
    const value = getNode(messages, key)
    if (typeof value !== "string") return key
    return interpolate(value, params)
  }

  return {
    locale: normalizedLocale,
    messages,
    t,
    pick(keys: string[]) {
      return keys.reduce<Record<string, string>>((selected, key) => {
        selected[key] = t(key)
        return selected
      }, {})
    }
  }
}
