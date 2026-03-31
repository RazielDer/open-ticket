import { joinBasePath } from "./dashboard-config"

export type DashboardPluginAssetKind = "json" | "object" | "array"
export type DashboardPluginSectionTone = "info" | "success" | "warning" | "danger" | "muted"

export interface DashboardPluginAssetHint {
  relativePath: string
  kind: Exclude<DashboardPluginAssetKind, "json">
}

export interface DashboardPluginSectionResolverContext {
  basePath: string
  buildPath: (...segments: string[]) => string
}

export interface DashboardPluginSectionAction {
  label: string
  href: string
  description?: string
  confirmText?: string
  method?: "get" | "post"
}

export interface DashboardPluginSectionSummaryItem {
  label: string
  value: string
  detail?: string
}

export interface DashboardPluginNoticeSection {
  type: "notice"
  id: string
  title: string
  tone: DashboardPluginSectionTone
  body: string
}

export interface DashboardPluginSummarySection {
  type: "summary"
  id: string
  title: string
  items: DashboardPluginSectionSummaryItem[]
}

export interface DashboardPluginListSection {
  type: "list"
  id: string
  title: string
  emptyMessage?: string
  items: Array<{
    label: string
    detail?: string
    tone?: DashboardPluginSectionTone
  }>
}

export interface DashboardPluginActionsSection {
  type: "actions"
  id: string
  title: string
  description?: string
  actions: DashboardPluginSectionAction[]
}

export interface DashboardPluginWorkbenchSection {
  type: "workbench"
  id: string
  title: string
  badge?: {
    label: string
    tone: DashboardPluginSectionTone
  }
  body?: string
  summaryItems?: DashboardPluginSectionSummaryItem[]
  actions?: DashboardPluginSectionAction[]
}

export type DashboardPluginSection =
  | DashboardPluginNoticeSection
  | DashboardPluginSummarySection
  | DashboardPluginListSection
  | DashboardPluginActionsSection
  | DashboardPluginWorkbenchSection

export interface DashboardPluginDashboardEntry {
  pluginId: string
  assetHints?: DashboardPluginAssetHint[]
  sections?: DashboardPluginSection[]
  buildSections?: (
    context: DashboardPluginSectionResolverContext
  ) => DashboardPluginSection[] | Promise<DashboardPluginSection[]>
}

interface NormalizedDashboardPluginEntry {
  pluginId: string
  assetHints: DashboardPluginAssetHint[]
  sections: DashboardPluginSection[]
  buildSections?: DashboardPluginDashboardEntry["buildSections"]
}

const registry = new Map<string, NormalizedDashboardPluginEntry>()

function normalizeRelativePath(value: string) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "")
}

function normalizeString(value: unknown) {
  return String(value || "")
}

function normalizeTone(value: unknown, fallback: DashboardPluginSectionTone = "muted"): DashboardPluginSectionTone {
  return ["info", "success", "warning", "danger", "muted"].includes(String(value))
    ? String(value) as DashboardPluginSectionTone
    : fallback
}

function normalizeAction(action: unknown): DashboardPluginSectionAction | null {
  if (!action || typeof action !== "object") return null
  const candidate = action as Record<string, unknown>
  const label = normalizeString(candidate.label)
  const href = normalizeString(candidate.href)
  if (!label || !href) return null

  return {
    label,
    href,
    description: candidate.description == null ? undefined : normalizeString(candidate.description),
    confirmText: candidate.confirmText == null ? undefined : normalizeString(candidate.confirmText),
    method: candidate.method === "post" ? "post" : "get"
  }
}

function normalizeSummaryItem(item: unknown): DashboardPluginSectionSummaryItem | null {
  if (!item || typeof item !== "object") return null
  const candidate = item as Record<string, unknown>
  const label = normalizeString(candidate.label)
  const value = normalizeString(candidate.value)
  if (!label || !value) return null

  return {
    label,
    value,
    detail: candidate.detail == null ? undefined : normalizeString(candidate.detail)
  }
}

function normalizeListItem(item: unknown) {
  if (!item || typeof item !== "object") return null
  const candidate = item as Record<string, unknown>
  const label = normalizeString(candidate.label)
  if (!label) return null

  return {
    label,
    detail: candidate.detail == null ? undefined : normalizeString(candidate.detail),
    tone: candidate.tone == null ? undefined : normalizeTone(candidate.tone)
  }
}

function normalizeSection(section: unknown): DashboardPluginSection | null {
  if (!section || typeof section !== "object") return null
  const candidate = section as Record<string, unknown>
  const type = normalizeString(candidate.type)
  const id = normalizeString(candidate.id)
  const title = normalizeString(candidate.title)
  if (!type || !id || !title) return null

  if (type === "notice") {
    return {
      type: "notice",
      id,
      title,
      tone: normalizeTone(candidate.tone, "warning"),
      body: normalizeString(candidate.body)
    }
  }

  if (type === "summary") {
    const items = Array.isArray(candidate.items)
      ? candidate.items.map((item) => normalizeSummaryItem(item)).filter(Boolean)
      : []
    return {
      type: "summary",
      id,
      title,
      items: items as DashboardPluginSectionSummaryItem[]
    }
  }

  if (type === "list") {
    const items = Array.isArray(candidate.items)
      ? candidate.items.map((item) => normalizeListItem(item)).filter(Boolean)
      : []
    return {
      type: "list",
      id,
      title,
      emptyMessage: candidate.emptyMessage == null ? undefined : normalizeString(candidate.emptyMessage),
      items: items as DashboardPluginListSection["items"]
    }
  }

  if (type === "actions") {
    const actions = Array.isArray(candidate.actions)
      ? candidate.actions.map((action) => normalizeAction(action)).filter(Boolean)
      : []
    return {
      type: "actions",
      id,
      title,
      description: candidate.description == null ? undefined : normalizeString(candidate.description),
      actions: actions as DashboardPluginSectionAction[]
    }
  }

  if (type === "workbench") {
    const summaryItems = Array.isArray(candidate.summaryItems)
      ? candidate.summaryItems.map((item) => normalizeSummaryItem(item)).filter(Boolean)
      : []
    const actions = Array.isArray(candidate.actions)
      ? candidate.actions.map((action) => normalizeAction(action)).filter(Boolean)
      : []
    const badge = candidate.badge && typeof candidate.badge === "object"
      ? {
          label: normalizeString((candidate.badge as Record<string, unknown>).label),
          tone: normalizeTone((candidate.badge as Record<string, unknown>).tone)
        }
      : undefined

    return {
      type: "workbench",
      id,
      title,
      badge: badge && badge.label ? badge : undefined,
      body: candidate.body == null ? undefined : normalizeString(candidate.body),
      summaryItems: summaryItems as DashboardPluginSectionSummaryItem[],
      actions: actions as DashboardPluginSectionAction[]
    }
  }

  return null
}

function cloneSection<T extends DashboardPluginSection>(section: T): T {
  if (section.type === "notice") {
    return { ...section } as T
  }

  if (section.type === "summary") {
    return {
      ...section,
      items: section.items.map((item) => ({ ...item }))
    } as T
  }

  if (section.type === "list") {
    return {
      ...section,
      items: section.items.map((item) => ({ ...item }))
    } as T
  }

  if (section.type === "actions") {
    return {
      ...section,
      actions: section.actions.map((action) => ({ ...action }))
    } as T
  }

  return {
    ...section,
    badge: section.badge ? { ...section.badge } : undefined,
    summaryItems: section.summaryItems?.map((item) => ({ ...item })),
    actions: section.actions?.map((action) => ({ ...action }))
  } as T
}

function normalizeSections(sections: unknown, options: { strict: boolean }) {
  if (!Array.isArray(sections)) {
    return options.strict ? null : []
  }

  const normalized: DashboardPluginSection[] = []
  for (const section of sections) {
    const value = normalizeSection(section)
    if (!value) {
      if (options.strict) return null
      continue
    }
    normalized.push(value)
  }

  return normalized
}

function createDynamicSectionFailureNotice(pluginId: string): DashboardPluginNoticeSection {
  return {
    type: "notice",
    id: `${pluginId}-dynamic-sections-unavailable`,
    title: "Additional plugin content unavailable",
    tone: "warning",
    body: "The dashboard could not load one or more plugin-owned sections for this page."
  }
}

export function createDashboardPluginSectionResolverContext(basePath: string): DashboardPluginSectionResolverContext {
  return {
    basePath,
    buildPath(...segments: string[]) {
      return joinBasePath(basePath, segments.map((segment) => normalizeRelativePath(segment)).join("/"))
    }
  }
}

export function registerDashboardPluginEntry(entry: DashboardPluginDashboardEntry) {
  const staticSections = normalizeSections(entry.sections || [], { strict: false }) || []

  registry.set(entry.pluginId, {
    pluginId: entry.pluginId,
    assetHints: Array.isArray(entry.assetHints)
      ? entry.assetHints.map((hint) => ({
          relativePath: normalizeRelativePath(hint.relativePath),
          kind: hint.kind
        }))
      : [],
    sections: staticSections,
    buildSections: typeof entry.buildSections === "function" ? entry.buildSections : undefined
  })
}

export function clearDashboardPluginEntries() {
  registry.clear()
}

export function getDashboardPluginEntry(pluginId: string) {
  return registry.get(pluginId) || null
}

export async function listDashboardPluginSections(
  pluginId: string,
  context: DashboardPluginSectionResolverContext
) {
  const entry = registry.get(pluginId)
  if (!entry) return []

  const staticSections = entry.sections.map((section) => cloneSection(section))
  if (!entry.buildSections) {
    return staticSections
  }

  try {
    const builtSections = await entry.buildSections({
      basePath: context.basePath,
      buildPath: (...segments: string[]) => context.buildPath(...segments)
    })
    const normalizedSections = normalizeSections(builtSections, { strict: true })
    if (!normalizedSections) {
      throw new Error("Invalid dashboard plugin sections")
    }

    return [
      ...staticSections,
      ...normalizedSections.map((section) => cloneSection(section))
    ]
  } catch {
    return [
      ...staticSections,
      createDynamicSectionFailureNotice(pluginId)
    ]
  }
}

export function getDashboardPluginAssetKind(pluginId: string, relativePath: string): DashboardPluginAssetKind {
  const normalizedPath = normalizeRelativePath(relativePath)
  const hint = registry
    .get(pluginId)
    ?.assetHints
    ?.find((item) => item.relativePath === normalizedPath)

  return hint?.kind || "json"
}
