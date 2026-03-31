import fs from "fs"
import path from "path"

import type { DashboardBrandConfig } from "./dashboard-config"

export interface DashboardBrand {
  title: string
  logo: string | null
  logoAbsolutePath: string | null
  favicon: string | null
  faviconAbsolutePath: string | null
  primaryColor: string
  accentColor: string
  backgroundColor: string
  surfaceColor: string
  textColor: string
  creditName: string
  creditUrl: string
}

function resolveAssetPath(pluginRoot: string, assetPath?: string): string | null {
  if (!assetPath) return null
  if (/^https?:\/\//i.test(assetPath)) return assetPath
  return path.isAbsolute(assetPath) ? assetPath : path.resolve(pluginRoot, assetPath)
}

function toPublicAssetPath(pluginRoot: string, assetPath?: string): string | null {
  if (!assetPath) return null
  if (/^https?:\/\//i.test(assetPath)) return assetPath

  const absolute = resolveAssetPath(pluginRoot, assetPath)
  if (!absolute) return null

  const publicDir = path.join(pluginRoot, "public")
  if (absolute.startsWith(publicDir)) {
    return absolute.slice(publicDir.length + 1).replace(/\\/g, "/")
  }

  return assetPath.replace(/^\.\/public\//, "").replace(/\\/g, "/")
}

function existingPath(value: string | null): string | null {
  if (!value || /^https?:\/\//i.test(value)) return value
  return fs.existsSync(value) ? value : null
}

export function buildBrand(pluginRoot: string, brandConfig: DashboardBrandConfig, dashboardName: string): DashboardBrand {
  const logoAbsolutePath = existingPath(resolveAssetPath(pluginRoot, brandConfig.logoPath))
  const faviconAbsolutePath = existingPath(resolveAssetPath(pluginRoot, brandConfig.faviconPath))

  return {
    title: brandConfig.title || dashboardName,
    logo: toPublicAssetPath(pluginRoot, logoAbsolutePath || brandConfig.logoPath),
    logoAbsolutePath,
    favicon: toPublicAssetPath(pluginRoot, faviconAbsolutePath || brandConfig.faviconPath),
    faviconAbsolutePath,
    primaryColor: brandConfig.primaryColor || "#c46332",
    accentColor: brandConfig.accentColor || "#f0aa45",
    backgroundColor: brandConfig.backgroundColor || "#0e1117",
    surfaceColor: brandConfig.surfaceColor || "#181d27",
    textColor: brandConfig.textColor || "#f7f2e7",
    creditName: brandConfig.creditName || "",
    creditUrl: brandConfig.creditUrl || ""
  }
}
