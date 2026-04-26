import fs from "fs"
import path from "path"

import {
  ODTICKET_PLATFORM_METADATA_IDS,
  type TicketAiAssistCitation,
  type TicketAiAssistConfidence,
  type TicketAiAssistHookInput,
  type TicketAiAssistHookResult,
  type TicketAiAssistKnowledgeContext,
  type TicketAiAssistKnowledgeSource,
  type TicketAiAssistOutcome,
  type TicketAiAssistParticipantContext,
  type TicketAiAssistProfile,
  type TicketAiAssistRequestSource,
  type TicketAiAssistRequestContext,
  type TicketAiAssistTicketMetadataContext,
  type TicketPlatformAiAssistCapability,
  type TicketPlatformAiAssistProvider,
  resolveTicketAiAssistProfileState
} from "../../../src/core/api/openticket/ticket-platform.js"

export type AiAssistRequestSource = TicketAiAssistRequestSource

export interface AiAssistSummary {
  profileId: string
  providerId: string
  label: string
  available: boolean
  actions: TicketPlatformAiAssistCapability[]
  reason: string | null
}

export interface AiAssistRunInput {
  ticket: unknown
  channel: unknown
  guild: unknown
  actorUser: unknown
  action: TicketPlatformAiAssistCapability
  source: AiAssistRequestSource
  prompt?: string | null
  instructions?: string | null
}

export interface AiAssistRunResult {
  profileId: string | null
  providerId: string | null
  action: TicketPlatformAiAssistCapability
  outcome: TicketAiAssistOutcome
  confidence: TicketAiAssistConfidence | null
  summary: string | null
  answer: string | null
  draft: string | null
  citations: TicketAiAssistCitation[]
  warnings: string[]
  degradedReason: string | null
}

export interface AiAssistServiceDependencies {
  projectRoot: string
  getConfigData(id: string): unknown
  getProvider(id: string): TicketPlatformAiAssistProvider | null
  getFormsDrafts?(): Promise<unknown[]>
}

const DEFAULT_UNAVAILABLE_REASON = "AI assist is unavailable for this ticket."
const DEFAULT_MAX_RECENT_MESSAGES = 40
const MIN_MAX_RECENT_MESSAGES = 10
const MAX_MAX_RECENT_MESSAGES = 100
const MAX_KNOWLEDGE_EXCERPTS = 4
const MAX_TOTAL_KNOWLEDGE_CHARS = 6000
const MAX_FAQ_EXCERPT_CHARS = 1200
const MAX_MARKDOWN_EXCERPT_CHARS = 2000
const MAX_CITATIONS = 6
const PROVIDER_ERROR_REASON = "AI assist provider returned an error."
const KNOWLEDGE_SOURCE_UNAVAILABLE_REASON = "One or more configured knowledge sources could not be read."
const FAQ_QUESTION_REQUIRED_REASON = "FAQ assist requires a question."
const FAQ_KNOWLEDGE_REQUIRED_REASON = "FAQ assist requires at least one usable enabled local knowledge source."
const FAQ_NO_MATCH_REASON = "FAQ assist could not find a matching knowledge entry."

class AiAssistRuntimeError extends Error {
  constructor(
    readonly outcome: TicketAiAssistOutcome,
    reason: string
  ) {
    super(reason)
  }
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => normalizeString(entry)).filter(Boolean))]
    : []
}

function normalizeAttachmentFilename(attachment: unknown) {
  if (!attachment || typeof attachment !== "object") return ""
  const name = normalizeString((attachment as { name?: unknown }).name)
  if (!name || /^[a-z][a-z0-9+.-]*:\/\//i.test(name)) return ""
  return path.posix.basename(name.replace(/\\/g, "/"))
}

function valuesFromCollection(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value.values === "function") return Array.from(value.values())
  if (typeof value === "object") return Object.values(value)
  return []
}

function runtimeDataValue(source: any, id: string) {
  if (!source || typeof source.get !== "function") return undefined
  if (typeof source.exists === "function" && !source.exists(id)) return undefined
  return source.get(id)?.value
}

function entityId(entity: any) {
  return normalizeString(entity?.id?.value || entity?.id)
}

function normalizeContext(input: any): TicketAiAssistProfile["context"] {
  const context = input && typeof input === "object" && !Array.isArray(input) ? input : {}
  const maxRecentMessages = Math.floor(Number(context.maxRecentMessages))
  return {
    maxRecentMessages: Number.isFinite(maxRecentMessages)
      ? Math.min(MAX_MAX_RECENT_MESSAGES, Math.max(MIN_MAX_RECENT_MESSAGES, maxRecentMessages))
      : DEFAULT_MAX_RECENT_MESSAGES,
    includeTicketMetadata: context.includeTicketMetadata !== false,
    includeParticipants: context.includeParticipants !== false,
    includeManagedFormSnapshot: context.includeManagedFormSnapshot !== false,
    includeBotMessages: context.includeBotMessages === true
  }
}

export function normalizeAiAssistProfile(value: unknown): TicketAiAssistProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const profile = value as Record<string, unknown>
  const id = normalizeString(profile.id)
  const providerId = normalizeString(profile.providerId)
  if (!id || !providerId) return null
  return {
    id,
    providerId,
    label: normalizeString(profile.label) || id,
    enabled: profile.enabled === true,
    knowledgeSourceIds: normalizeStringArray(profile.knowledgeSourceIds),
    context: normalizeContext(profile.context),
    settings: profile.settings && typeof profile.settings === "object" && !Array.isArray(profile.settings)
      ? profile.settings as Record<string, unknown>
      : {}
  }
}

export function normalizeKnowledgeSource(value: unknown): TicketAiAssistKnowledgeSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const id = normalizeString(source.id)
  const kind = source.kind === "markdown-file" || source.kind === "faq-json" ? source.kind : null
  const sourcePath = normalizeString(source.path)
  if (!id || !kind || !sourcePath) return null
  return {
    id,
    label: normalizeString(source.label) || id,
    kind,
    path: sourcePath,
    enabled: source.enabled === true
  }
}

export function resolveKnowledgeSourcePath(projectRoot: string, sourcePath: string) {
  const normalized = normalizeString(sourcePath).replace(/\\/g, "/")
  if (!normalized) throw new Error("Knowledge source path is required.")
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) throw new Error("Knowledge sources must be local files, not URLs.")
  if (path.isAbsolute(normalized)) throw new Error("Knowledge source paths must be relative.")
  if (normalized.split("/").includes("..")) throw new Error("Knowledge source paths may not contain '..'.")
  if (!(normalized.startsWith("knowledge/") || normalized.startsWith(".docs/"))) {
    throw new Error("Knowledge source paths must stay under knowledge/ or .docs/.")
  }

  const absolutePath = path.resolve(projectRoot, normalized)
  const allowedRoots = [path.resolve(projectRoot, "knowledge"), path.resolve(projectRoot, ".docs")]
  if (!allowedRoots.some((root) => absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`))) {
    throw new Error("Knowledge source paths must stay under knowledge/ or .docs/.")
  }
  if (!fs.existsSync(absolutePath)) return absolutePath

  const stats = fs.lstatSync(absolutePath)
  if (stats.isSymbolicLink()) throw new Error("Knowledge source files may not be symbolic links.")
  const realPath = fs.realpathSync(absolutePath)
  const realAllowedRoots = allowedRoots.map((root) => fs.existsSync(root) ? fs.realpathSync(root) : root)
  if (!realAllowedRoots.some((root) => realPath === root || realPath.startsWith(`${root}${path.sep}`))) {
    throw new Error("Knowledge source files may not escape knowledge/ or .docs/.")
  }
  return absolutePath
}

function readTicketProfileId(ticket: any) {
  const stored = resolveTicketAiAssistProfileState(ticket)
  if (stored.hasStoredValue) return stored.profileId
  return normalizeString(runtimeDataValue(ticket?.option, ODTICKET_PLATFORM_METADATA_IDS.aiAssistProfileId))
}

function readProfiles(data: unknown) {
  return Array.isArray(data) ? data.map(normalizeAiAssistProfile).filter(Boolean) as TicketAiAssistProfile[] : []
}

function readSources(data: unknown) {
  return Array.isArray(data) ? data.map(normalizeKnowledgeSource).filter(Boolean) as TicketAiAssistKnowledgeSource[] : []
}

function knowledgeSourcesForProfile(profile: TicketAiAssistProfile, data: unknown) {
  const sourceById = new Map(readSources(data).map((source) => [source.id, source]))
  return profile.knowledgeSourceIds
    .map((sourceId) => sourceById.get(sourceId) || null)
    .filter((source): source is TicketAiAssistKnowledgeSource => Boolean(source))
}

function providerValidationReason(
  provider: TicketPlatformAiAssistProvider,
  profile: TicketAiAssistProfile,
  knowledgeSources: TicketAiAssistKnowledgeSource[]
) {
  if (typeof provider.validateProfileSettings !== "function") return null
  try {
    provider.validateProfileSettings({
      profile,
      settings: profile.settings,
      referencedByOptionIds: [],
      knowledgeSources
    })
    return null
  } catch (error) {
    return error instanceof Error ? error.message : DEFAULT_UNAVAILABLE_REASON
  }
}

function sanitizedErrorResult(error: unknown): { outcome: TicketAiAssistOutcome; reason: string } {
  if (error instanceof AiAssistRuntimeError) {
    return { outcome: error.outcome, reason: error.message }
  }
  return { outcome: "provider-error", reason: PROVIDER_ERROR_REASON }
}

function actionPrompt(action: TicketPlatformAiAssistCapability, value: unknown) {
  return action === "answerFaq" ? normalizeString(value) || null : null
}

function actionInstructions(action: TicketPlatformAiAssistCapability, value: unknown) {
  return action === "suggestReply" ? normalizeString(value) || null : null
}

async function fetchRecentMessages(channel: any, maxRecentMessages: number) {
  const fetched = typeof channel?.messages?.fetch === "function"
    ? await channel.messages.fetch({ limit: maxRecentMessages }).catch(() => null)
    : channel?.messages?.cache
  return valuesFromCollection(fetched).slice(0, maxRecentMessages)
}

async function buildMessageContext(channel: any, profile: TicketAiAssistProfile) {
  const messages = await fetchRecentMessages(channel, profile.context.maxRecentMessages)
  return messages
    .filter((message) => profile.context.includeBotMessages || !Boolean(message?.author?.bot))
    .map((message): TicketAiAssistRequestContext["messages"][number] => ({
      messageId: normalizeString(message?.id),
      authorUserId: normalizeString(message?.author?.id),
      authorLabel: normalizeString(message?.member?.displayName || message?.author?.globalName || message?.author?.username) || normalizeString(message?.author?.id) || "Unknown",
      createdAt: message?.createdAt instanceof Date ? message.createdAt.toISOString() : new Date(Number(message?.createdTimestamp || Date.now())).toISOString(),
      content: normalizeString(message?.content),
      attachmentFilenames: valuesFromCollection(message?.attachments).map((attachment) => normalizeAttachmentFilename(attachment)).filter(Boolean)
    }))
}

function buildTicketMetadata(ticket: any): TicketAiAssistTicketMetadataContext {
  const open = runtimeDataValue(ticket, "opendiscord:open")
  const closed = runtimeDataValue(ticket, "opendiscord:closed")
  const transportMode = normalizeString(runtimeDataValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.transportMode))
  const priorityValue = Number(runtimeDataValue(ticket, "opendiscord:priority"))
  return {
    ticketId: entityId(ticket),
    optionId: entityId(ticket?.option) || null,
    transportMode: transportMode === "channel_text" || transportMode === "private_thread" ? transportMode : null,
    assignedTeamId: normalizeString(runtimeDataValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.assignedTeamId)) || null,
    assignedStaffUserId: normalizeString(runtimeDataValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.assignedStaffUserId)) || null,
    state: closed === true ? "closed" : open === true ? "open" : "unknown",
    priority: Number.isFinite(priorityValue) ? priorityValue : null
  }
}

function buildParticipants(ticket: any): TicketAiAssistParticipantContext[] {
  const participants: TicketAiAssistParticipantContext[] = []
  const creatorUserId = normalizeString(runtimeDataValue(ticket, "opendiscord:opened-by"))
  if (creatorUserId) participants.push({ userId: creatorUserId, label: creatorUserId, role: "creator" })
  for (const participant of valuesFromCollection(runtimeDataValue(ticket, "opendiscord:participants"))) {
    const userId = normalizeString(participant?.id)
    if (!userId || participants.some((entry) => entry.userId === userId)) continue
    participants.push({ userId, label: userId, role: participant?.type === "staff" ? "staff" : "participant" })
  }
  return participants
}

async function buildManagedFormAnswers(ticket: any, getFormsDrafts?: () => Promise<unknown[]>) {
  if (!getFormsDrafts) return []
  const ticketId = entityId(ticket)
  if (!ticketId) return []
  const drafts = await getFormsDrafts().catch(() => [])
  return drafts
    .filter((draft: any) => normalizeString(draft?.ticketChannelId) === ticketId)
    .flatMap((draft: any) => valuesFromCollection(draft?.answers || draft?.answerRecords))
    .map((answer: any) => ({
      questionId: normalizeString(answer?.questionId || answer?.id),
      questionLabel: normalizeString(answer?.questionLabel || answer?.question || answer?.label) || normalizeString(answer?.questionId || answer?.id) || "Question",
      answer: normalizeString(answer?.answer || answer?.value)
    }))
    .filter((answer) => answer.questionId || answer.answer)
}

function clip(value: string, maxLength: number) {
  if (maxLength <= 0) return ""
  if (value.length <= maxLength) return value
  if (maxLength <= 3) return value.slice(0, maxLength)
  return `${value.slice(0, maxLength - 3)}...`
}

function selectFaqEntry(entries: any[], prompt: string | null) {
  const normalizedPrompt = normalizeString(prompt).toLowerCase()
  if (!normalizedPrompt) return null
  return entries.find((entry) => {
    const candidates = [entry?.question, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])]
      .map((candidate) => normalizeString(candidate).toLowerCase())
      .filter(Boolean)
    return candidates.some((candidate) => normalizedPrompt.includes(candidate) || candidate.includes(normalizedPrompt))
  }) || null
}

function normalizeKnowledgeLocatorPath(sourcePath: string) {
  return normalizeString(sourcePath).replace(/\\/g, "/")
}

function slugifyHeading(value: string) {
  const slug = normalizeString(value)
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "section"
}

function promptTokens(prompt: string | null) {
  return [...new Set(normalizeString(prompt).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3))]
}

function scoreTextForPrompt(text: string, tokens: string[]) {
  const haystack = text.toLowerCase()
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
}

function selectMarkdownSection(raw: string, requestPrompt: string | null) {
  const sections: Array<{ heading: string; slug: string; text: string }> = []
  let currentHeading = "Document"
  let currentSlug = "document"
  let currentLines: string[] = []

  const flush = () => {
    const text = currentLines.join("\n").trim()
    if (!text && currentHeading === "Document") return
    if (!text && sections.length > 0) return
    sections.push({
      heading: currentHeading,
      slug: currentSlug,
      text: [currentHeading, text].filter(Boolean).join("\n").trim()
    })
  }

  for (const line of raw.split(/\r?\n/)) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (headingMatch) {
      flush()
      currentHeading = normalizeString(headingMatch[2]) || "Section"
      currentSlug = slugifyHeading(currentHeading)
      currentLines = []
      continue
    }
    currentLines.push(line)
  }
  flush()

  const tokens = promptTokens(requestPrompt)
  if (tokens.length < 1) return sections[0] || null
  return sections
    .map((section, index) => ({ section, index, score: scoreTextForPrompt(`${section.heading}\n${section.text}`, tokens) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.section || sections[0] || null
}

function parseFaqEntries(raw: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("FAQ knowledge source is malformed.")
  }
  if (!Array.isArray(parsed)) {
    throw new Error("FAQ knowledge source must be an array.")
  }
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("FAQ knowledge source is malformed.")
    const record = entry as Record<string, unknown>
    if (!normalizeString(record.id) || !normalizeString(record.question) || !normalizeString(record.answer)) {
      throw new Error("FAQ knowledge source is malformed.")
    }
    if (
      typeof record.aliases !== "undefined"
      && (!Array.isArray(record.aliases) || record.aliases.some((alias) => typeof alias !== "string"))
    ) {
      throw new Error("FAQ knowledge source is malformed.")
    }
    return record
  })
}

function readKnowledgeContent(projectRoot: string, source: TicketAiAssistKnowledgeSource, requestPrompt: string | null): TicketAiAssistKnowledgeContext | null {
  if (!source.enabled) return null
  const filePath = resolveKnowledgeSourcePath(projectRoot, source.path)
  if (!fs.existsSync(filePath)) throw new Error("Knowledge source file is unavailable.")
  const raw = fs.readFileSync(filePath, "utf8")
  const locatorPath = normalizeKnowledgeLocatorPath(source.path)
  if (source.kind === "faq-json") {
    const entries = parseFaqEntries(raw)
    const entry = selectFaqEntry(entries, requestPrompt)
    if (!entry) return null
    const question = normalizeString(entry.question || entry.id || source.label)
    const answer = normalizeString(entry.answer)
    const entryId = normalizeString(entry.id) || slugifyHeading(question)
    if (!answer) return null
    return {
      sourceId: source.id,
      label: `${source.label}: ${question}`,
      kind: source.kind,
      content: clip(answer, MAX_FAQ_EXCERPT_CHARS),
      locator: `${locatorPath}#${entryId}`
    }
  }
  const section = selectMarkdownSection(raw, requestPrompt)
  if (!section) return null
  return {
    sourceId: source.id,
    label: `${source.label}: ${section.heading}`,
    kind: source.kind,
    content: clip(section.text.replace(/\s+/g, " ").trim(), MAX_MARKDOWN_EXCERPT_CHARS),
    locator: `${locatorPath}#${section.slug}`
  }
}

function collectKnowledgeContext(projectRoot: string, sources: TicketAiAssistKnowledgeSource[], requestPrompt: string | null) {
  const entries: TicketAiAssistKnowledgeContext[] = []
  const warnings: string[] = []
  let enabledSourceCount = 0

  for (const source of sources) {
    if (!source.enabled) continue
    enabledSourceCount += 1
    try {
      const entry = readKnowledgeContent(projectRoot, source, requestPrompt)
      if (entry) entries.push(entry)
    } catch {
      warnings.push(KNOWLEDGE_SOURCE_UNAVAILABLE_REASON)
    }
  }

  return {
    knowledge: applyKnowledgeBudget(entries),
    warnings: [...new Set(warnings)],
    enabledSourceCount
  }
}

function buildCitations(knowledge: TicketAiAssistKnowledgeContext[]): TicketAiAssistCitation[] {
  return knowledge.slice(0, MAX_CITATIONS).map((entry) => ({
    kind: "knowledge-source",
    sourceId: entry.sourceId,
    label: entry.label,
    locator: entry.locator,
    excerpt: clip(entry.content, 240)
  }))
}

function applyKnowledgeBudget(entries: TicketAiAssistKnowledgeContext[]) {
  const final: TicketAiAssistKnowledgeContext[] = []
  let remaining = MAX_TOTAL_KNOWLEDGE_CHARS
  for (const entry of entries) {
    if (final.length >= MAX_KNOWLEDGE_EXCERPTS || remaining <= 0) break
    const content = clip(entry.content, remaining)
    if (!content) continue
    final.push({ ...entry, content })
    remaining -= content.length
  }
  return final
}

function normalizeOutcome(value: unknown): TicketAiAssistOutcome {
  return value === "success"
    || value === "unavailable"
    || value === "busy"
    || value === "low-confidence"
    || value === "provider-error"
    || value === "denied"
    ? value
    : "provider-error"
}

function normalizeConfidence(value: unknown): TicketAiAssistConfidence | null {
  return value === "high" || value === "medium" || value === "low" ? value : null
}

function normalizeCitation(value: any): TicketAiAssistCitation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const kind = value.kind === "ticket-message" || value.kind === "knowledge-source" || value.kind === "managed-form"
    ? value.kind
    : null
  if (!kind) return null
  const sourceId = normalizeString(value.sourceId)
  const label = normalizeString(value.label)
  if (!sourceId || !label) return null
  return {
    kind,
    sourceId,
    label,
    locator: normalizeString(value.locator) || null,
    excerpt: normalizeString(value.excerpt) ? clip(normalizeString(value.excerpt), 240) : null
  }
}

function normalizeHookResult(action: TicketPlatformAiAssistCapability, result: TicketAiAssistHookResult): AiAssistRunResult {
  let outcome = normalizeOutcome(result?.outcome)
  const confidence = normalizeConfidence(result?.confidence)
  let degradedReason = normalizeString(result?.degradedReason) || null
  let citations = Array.isArray(result?.citations)
    ? result.citations.map(normalizeCitation).filter(Boolean).slice(0, MAX_CITATIONS) as TicketAiAssistCitation[]
    : []
  const warnings = Array.isArray(result?.warnings) ? result.warnings.map(normalizeString).filter(Boolean) : []

  let summary = action === "summarize" ? normalizeString((result as any).summary) || null : null
  let answer = action === "answerFaq" ? normalizeString((result as any).answer) || null : null
  let draft = action === "suggestReply" ? normalizeString((result as any).draft) || null : null

  if (outcome === "success" && confidence === "low") {
    outcome = "low-confidence"
  }
  if (outcome === "provider-error") {
    degradedReason = PROVIDER_ERROR_REASON
  }
  if (outcome !== "success" || confidence === "low") {
    summary = null
    answer = null
    draft = null
    citations = []
  }

  return {
    profileId: null,
    providerId: null,
    action,
    outcome,
    confidence,
    summary,
    answer,
    draft,
    citations,
    warnings,
    degradedReason
  }
}

export class OTAiAssistService {
  private readonly inFlight = new Set<string>()

  constructor(private readonly dependencies: AiAssistServiceDependencies) {}

  getTicketAiAssistSummary(input: { ticket: unknown; channel?: unknown; guild?: unknown }): AiAssistSummary | null {
    void input.channel
    void input.guild
    const ticket = input.ticket as any
    const profileId = readTicketProfileId(ticket)
    if (!profileId) return null

    const profile = readProfiles(this.dependencies.getConfigData("opendiscord:ai-assist-profiles")).find((candidate) => candidate.id === profileId) || null
    if (!profile) {
      return { profileId, providerId: "", label: profileId, available: false, actions: [], reason: "AI assist profile is missing." }
    }
    const provider = this.dependencies.getProvider(profile.providerId)
    if (!profile.enabled) {
      return { profileId: profile.id, providerId: profile.providerId, label: profile.label, available: false, actions: [], reason: "AI assist profile is disabled." }
    }
    if (!provider) {
      return { profileId: profile.id, providerId: profile.providerId, label: profile.label, available: false, actions: [], reason: "AI assist provider is unavailable." }
    }
    const validationReason = providerValidationReason(
      provider,
      profile,
      knowledgeSourcesForProfile(profile, this.dependencies.getConfigData("opendiscord:knowledge-sources"))
    )
    if (validationReason) {
      return { profileId: profile.id, providerId: profile.providerId, label: profile.label, available: false, actions: [], reason: validationReason }
    }
    return {
      profileId: profile.id,
      providerId: profile.providerId,
      label: profile.label,
      available: true,
      actions: provider.capabilities.filter((capability) => typeof provider[capability] === "function"),
      reason: null
    }
  }

  async runTicketAiAssist(input: AiAssistRunInput): Promise<AiAssistRunResult> {
    const summary = this.getTicketAiAssistSummary(input)
    if (!summary?.available || !summary.actions.includes(input.action)) {
      return {
        profileId: summary?.profileId ?? null,
        providerId: summary?.providerId ?? null,
        action: input.action,
        outcome: "unavailable",
        confidence: null,
        summary: null,
        answer: null,
        draft: null,
        citations: [],
        warnings: [],
        degradedReason: summary?.reason || DEFAULT_UNAVAILABLE_REASON
      }
    }
    if (input.action === "answerFaq" && !normalizeString(input.prompt)) {
      return {
        profileId: summary.profileId,
        providerId: summary.providerId,
        action: input.action,
        outcome: "unavailable",
        confidence: null,
        summary: null,
        answer: null,
        draft: null,
        citations: [],
        warnings: [],
        degradedReason: FAQ_QUESTION_REQUIRED_REASON
      }
    }

    const inFlightKey = `${entityId(input.ticket) || "unknown"}:${input.action}`
    if (this.inFlight.has(inFlightKey)) {
      return {
        profileId: summary.profileId,
        providerId: summary.providerId,
        action: input.action,
        outcome: "busy",
        confidence: null,
        summary: null,
        answer: null,
        draft: null,
        citations: [],
        warnings: [],
        degradedReason: "AI assist is already running for this ticket action."
      }
    }

    this.inFlight.add(inFlightKey)
    try {
      const profiles = readProfiles(this.dependencies.getConfigData("opendiscord:ai-assist-profiles"))
      const profile = profiles.find((candidate) => candidate.id === summary.profileId)
      const provider = profile ? this.dependencies.getProvider(profile.providerId) : null
      const hook = provider?.[input.action]
      if (!profile || !provider || typeof hook !== "function") {
        throw new AiAssistRuntimeError("unavailable", DEFAULT_UNAVAILABLE_REASON)
      }

      const requestPrompt = actionPrompt(input.action, input.prompt)
      const requestInstructions = actionInstructions(input.action, input.instructions)
      const knowledgeResult = collectKnowledgeContext(
        this.dependencies.projectRoot,
        knowledgeSourcesForProfile(profile, this.dependencies.getConfigData("opendiscord:knowledge-sources")),
        requestPrompt
      )
      const knowledge = knowledgeResult.knowledge

      if (input.action === "answerFaq" && knowledge.length < 1) {
        return {
          profileId: profile.id,
          providerId: profile.providerId,
          action: input.action,
          outcome: "unavailable",
          confidence: null,
          summary: null,
          answer: null,
          draft: null,
          citations: [],
          warnings: knowledgeResult.warnings,
          degradedReason: knowledgeResult.warnings.length > 0
            ? KNOWLEDGE_SOURCE_UNAVAILABLE_REASON
            : knowledgeResult.enabledSourceCount > 0
              ? FAQ_NO_MATCH_REASON
              : FAQ_KNOWLEDGE_REQUIRED_REASON
        }
      }

      const context: TicketAiAssistRequestContext = {
        messages: await buildMessageContext(input.channel, profile),
        ticketMetadata: profile.context.includeTicketMetadata ? buildTicketMetadata(input.ticket) : null,
        participants: profile.context.includeParticipants ? buildParticipants(input.ticket) : [],
        managedFormAnswers: profile.context.includeManagedFormSnapshot ? await buildManagedFormAnswers(input.ticket, this.dependencies.getFormsDrafts) : []
      }

      const hookInput: TicketAiAssistHookInput = {
        profile,
        settings: profile.settings,
        ticket: input.ticket,
        channel: input.channel ?? null,
        guild: input.guild ?? null,
        actorUser: input.actorUser,
        context,
        knowledge,
        request: {
          action: input.action,
          prompt: requestPrompt,
          instructions: requestInstructions,
          source: input.source
        }
      }

      const normalized = normalizeHookResult(input.action, await hook(hookInput))
      return {
        ...normalized,
        warnings: [...knowledgeResult.warnings, ...normalized.warnings],
        profileId: profile.id,
        providerId: profile.providerId,
        citations: normalized.outcome === "success"
          ? normalized.citations.length > 0 ? normalized.citations : buildCitations(knowledge)
          : []
      }
    } catch (error) {
      const sanitized = sanitizedErrorResult(error)
      return {
        profileId: summary.profileId,
        providerId: summary.providerId,
        action: input.action,
        outcome: sanitized.outcome,
        confidence: null,
        summary: null,
        answer: null,
        draft: null,
        citations: [],
        warnings: [],
        degradedReason: sanitized.reason
      }
    } finally {
      this.inFlight.delete(inFlightKey)
    }
  }
}
