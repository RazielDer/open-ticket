import crypto from "crypto"

import session from "express-session"
import type express from "express"

import { DashboardAuthStore } from "./auth-store"
import {
  DEFAULT_DASHBOARD_SESSION_SECRET,
  joinBasePath,
  resolveDashboardDiscordAuthConfig,
  type DashboardConfig
} from "./dashboard-config"
import type { DashboardAppContext } from "./create-app"
import {
  getDashboardRuntimeGuildId,
  resolveDashboardRuntimeGuildMember,
  type DashboardRuntimeBridge,
  type DashboardRuntimeGuildMember
} from "./runtime-bridge"

interface RateLimitEntry {
  attempts: number
  resetAt: number
}

export const ADMIN_SESSION_COOKIE_NAME = "otdash_admin"
export const VIEWER_SESSION_COOKIE_NAME = "otdash_viewer"

export interface LoginRateLimitState {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export interface LoginRateLimiter {
  inspect: (key: string) => Promise<LoginRateLimitState>
  recordFailure: (key: string) => Promise<LoginRateLimitState>
  reset: (key: string) => Promise<void>
}

export type DashboardAccessTier = "reviewer" | "editor" | "admin"
export type DashboardAccessMembership = "member" | "missing" | "unresolved"
export type DashboardCapability =
  | "viewer.portal"
  | "config.write.visual"
  | "admin.shell"
  | "ticket.workbench"
  | "analytics.view"
  | "transcript.view.global"
  | "transcript.manage"
  | "config.write.general"
  | "config.write.security"
  | "runtime.view"
  | "plugin.manage"

export interface DashboardIdentitySession {
  userId: string
  username: string
  globalName: string | null
  avatarUrl: string | null
  authenticatedAt: string
  accessTierAtAuth?: DashboardAccessTier | null
}

export type DashboardViewerSession = DashboardIdentitySession
export type DashboardAdminSession = DashboardIdentitySession

export interface DashboardViewerOAuthState {
  state: string
  returnTo: string
}

export interface DashboardAdminOAuthState {
  state: string
  returnTo: string
}

export interface DashboardViewerAuthClient {
  exchangeCode: (code: string, redirectUri: string, config: DashboardConfig) => Promise<string>
  fetchViewerIdentity: (accessToken: string) => Promise<DashboardViewerSession>
}

export interface DashboardAdminAuthClient {
  exchangeCode: (code: string, redirectUri: string, config: DashboardConfig) => Promise<string>
  fetchAdminIdentity: (accessToken: string) => Promise<DashboardAdminSession>
}

export interface DashboardSessionHandlers {
  admin: express.RequestHandler
  viewer: express.RequestHandler
}

export interface DashboardAdminAccessState {
  authenticated: boolean
  identity: DashboardAdminSession | null
  tier: DashboardAccessTier | null
  membership: DashboardAccessMembership
  capabilities: DashboardCapability[]
  preferredEntryPath: string
  canAccessAdminHost: boolean
  canUseAdvancedEditorTools: boolean
  revalidatedAt: string
  source: "live" | "cache"
  freshnessMs: number
}

export interface DashboardViewerAccessState {
  authenticated: boolean
  identity: DashboardViewerSession | null
  membership: DashboardAccessMembership
  tier: DashboardAccessTier | null
  ownerOverride: boolean
  revalidatedAt: string
  source: "live" | "cache"
  freshnessMs: number
}

interface DiscordIdentityResponse {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
}

type DashboardRequirementInput =
  | DashboardCapability
  | DashboardCapability[]
  | ((req: express.Request) => DashboardCapability | DashboardCapability[])

const DASHBOARD_ACCESS_CACHE_MAX_AGE_MS = 60_000
const DASHBOARD_EDITOR_ALLOWED_PATHS = [
  "/visual/options",
  "/visual/panels",
  "/visual/questions",
  "/admin/tickets",
  "/admin/configs/options",
  "/admin/configs/panels",
  "/admin/configs/questions"
]

const HASH_PREFIX = "scrypt"
const HASH_COST = 16384
const HASH_BLOCK_SIZE = 8
const HASH_PARALLELIZATION = 1
const HASH_KEY_LENGTH = 64

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      HASH_KEY_LENGTH,
      { N: HASH_COST, r: HASH_BLOCK_SIZE, p: HASH_PARALLELIZATION },
      (error, derivedKey) => {
        if (error) return reject(error)
        resolve(derivedKey as Buffer)
      }
    )
  })
}

function readSession(req: express.Request) {
  return req.session as any
}

interface CachedRuntimeMember {
  resolvedAt: number
  member: DashboardRuntimeGuildMember | null
}

interface ResolvedRuntimeMemberState {
  member: DashboardRuntimeGuildMember | null
  source: "live" | "cache"
  freshnessMs: number
  unresolved: boolean
}

const runtimeMemberCache = new Map<string, CachedRuntimeMember>()

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function applyDashboardPrivateHeaders(res: express.Response) {
  res.setHeader("Cache-Control", "no-store, private")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive")
}

export function buildDashboardAuditActor(identity: DashboardIdentitySession | null | undefined) {
  if (!identity) {
    return null
  }

  return {
    userId: identity.userId,
    username: identity.username,
    globalName: identity.globalName ?? null
  }
}

function uniqueValues(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index)
}

function buildDiscordAvatarUrl(userId: string, avatarHash: string | null | undefined) {
  if (!avatarHash) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(userId)}/${encodeURIComponent(avatarHash)}.png?size=256`
}

function mapDiscordIdentitySession(identity: DiscordIdentityResponse): DashboardIdentitySession {
  return {
    userId: identity.id,
    username: identity.username,
    globalName: identity.global_name ?? null,
    avatarUrl: buildDiscordAvatarUrl(identity.id, identity.avatar ?? null),
    authenticatedAt: new Date().toISOString()
  }
}

function capabilitySetForTier(tier: DashboardAccessTier | null) {
  const capabilities: DashboardCapability[] = []

  if (tier === "reviewer" || tier === "editor" || tier === "admin") {
    capabilities.push("viewer.portal")
  }

  if (tier === "editor" || tier === "admin") {
    capabilities.push("config.write.visual", "admin.shell", "ticket.workbench")
  }

  if (tier === "admin") {
    capabilities.push(
      "transcript.view.global",
      "analytics.view",
      "transcript.manage",
      "config.write.general",
      "config.write.security",
      "runtime.view",
      "plugin.manage"
    )
  }

  return capabilities
}

function hasAnyValue(values: string[], candidates: string[]) {
  const candidateSet = new Set(candidates.map((value) => normalizeString(value)).filter(Boolean))
  return values.some((value) => candidateSet.has(normalizeString(value)))
}

function resolveAccessTier(config: DashboardConfig, member: DashboardRuntimeGuildMember | null): DashboardAccessTier | null {
  if (!member) {
    return null
  }

  if (config.rbac.ownerUserIds.includes(member.userId)) {
    return "admin"
  }

  const roleIds = uniqueValues(member.roleIds.map((value) => normalizeString(value)).filter(Boolean))
  const userId = member.userId

  if (
    config.rbac.userIds.admin.includes(userId)
    || hasAnyValue(roleIds, config.rbac.roleIds.admin)
  ) {
    return "admin"
  }

  if (
    config.rbac.userIds.editor.includes(userId)
    || hasAnyValue(roleIds, config.rbac.roleIds.editor)
  ) {
    return "editor"
  }

  if (
    config.rbac.userIds.reviewer.includes(userId)
    || hasAnyValue(roleIds, config.rbac.roleIds.reviewer)
  ) {
    return "reviewer"
  }

  return null
}

function buildAdminAccessState(
  basePath: string,
  identity: DashboardAdminSession | null,
  member: DashboardRuntimeGuildMember | null,
  tier: DashboardAccessTier | null,
  source: "live" | "cache",
  freshnessMs: number
): DashboardAdminAccessState {
  const capabilities = capabilitySetForTier(tier)
  const preferredEntryPath = tier === "admin"
    ? joinBasePath(basePath, "admin")
    : joinBasePath(basePath, "visual/options")

  return {
    authenticated: Boolean(identity),
    identity,
    tier,
    membership: member ? "member" : "missing",
    capabilities,
    preferredEntryPath,
    canAccessAdminHost: tier === "editor" || tier === "admin",
    canUseAdvancedEditorTools: tier === "admin",
    revalidatedAt: new Date().toISOString(),
    source,
    freshnessMs
  }
}

async function resolveRuntimeMember(runtimeBridge: DashboardRuntimeBridge, userId: string) {
  const normalizedUserId = normalizeString(userId)
  const guildId = getDashboardRuntimeGuildId(runtimeBridge)
  if (!normalizedUserId) {
    return {
      member: null,
      source: "live" as const,
      freshnessMs: DASHBOARD_ACCESS_CACHE_MAX_AGE_MS,
      unresolved: false
    }
  }

  if (!guildId) {
    if (typeof runtimeBridge.resolveGuildMember === "function") {
      try {
        return {
          member: await runtimeBridge.resolveGuildMember(normalizedUserId),
          source: "live" as const,
          freshnessMs: 0,
          unresolved: false
        }
      } catch {
        return {
          member: null,
          source: "live" as const,
          freshnessMs: DASHBOARD_ACCESS_CACHE_MAX_AGE_MS,
          unresolved: true
        }
      }
    }

    return {
      member: null,
      source: "live" as const,
      freshnessMs: DASHBOARD_ACCESS_CACHE_MAX_AGE_MS,
      unresolved: true
    }
  }

  const cacheKey = `${guildId}:${normalizedUserId}`
  const now = Date.now()
  const cached = runtimeMemberCache.get(cacheKey)

  try {
    const member = await resolveDashboardRuntimeGuildMember(runtimeBridge, normalizedUserId)
    runtimeMemberCache.set(cacheKey, {
      member,
      resolvedAt: now
    })

    return {
      member,
      source: "live" as const,
      freshnessMs: 0,
      unresolved: false
    }
  } catch {
    if (cached && now - cached.resolvedAt <= DASHBOARD_ACCESS_CACHE_MAX_AGE_MS) {
      return {
        member: cached.member,
        source: "cache" as const,
        freshnessMs: now - cached.resolvedAt,
        unresolved: false
      }
    }

    return {
      member: null,
      source: "live" as const,
      freshnessMs: cached ? now - cached.resolvedAt : DASHBOARD_ACCESS_CACHE_MAX_AGE_MS,
      unresolved: true
    }
  }
}

function createViewerAccessState(
  identity: DashboardViewerSession | null,
  runtimeMember: ResolvedRuntimeMemberState,
  config: DashboardConfig
): DashboardViewerAccessState {
  const tier = resolveAccessTier(config, runtimeMember.member)
  const ownerOverride = Boolean(runtimeMember.member && config.rbac.ownerUserIds.includes(runtimeMember.member.userId))

  return {
    authenticated: Boolean(identity),
    identity,
    membership: runtimeMember.unresolved
      ? "unresolved"
      : runtimeMember.member
        ? "member"
        : "missing",
    tier,
    ownerOverride,
    revalidatedAt: new Date().toISOString(),
    source: runtimeMember.source,
    freshnessMs: runtimeMember.freshnessMs
  }
}

function createScopedSessionMiddleware(
  config: DashboardConfig,
  authStore: DashboardAuthStore,
  cookieName: string,
  scope: "admin" | "viewer"
) {
  return session({
    name: cookieName,
    secret: config.auth.sessionSecret || DEFAULT_DASHBOARD_SESSION_SECRET,
    store: authStore.createSessionStore(scope),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
      path: config.basePath === "/" ? "/" : config.basePath,
      maxAge: Math.max(1, Number(config.auth.maxAgeHours || 12)) * 60 * 60 * 1000
    }
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const derivedKey = await scryptAsync(password, salt)
  return [
    HASH_PREFIX,
    HASH_COST,
    HASH_BLOCK_SIZE,
    HASH_PARALLELIZATION,
    HASH_KEY_LENGTH,
    salt.toString("base64"),
    derivedKey.toString("base64")
  ].join("$")
}

async function verifyHash(password: string, hash: string): Promise<boolean> {
  const [prefix, costText, blockSizeText, parallelText, keyLengthText, saltText, expectedText] = hash.split("$")
  if (prefix !== HASH_PREFIX) return false

  const cost = Number(costText)
  const blockSize = Number(blockSizeText)
  const parallelization = Number(parallelText)
  const keyLength = Number(keyLengthText)
  const salt = Buffer.from(saltText, "base64")
  const expected = Buffer.from(expectedText, "base64")

  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelization },
      (error, output) => {
        if (error) return reject(error)
        resolve(output as Buffer)
      }
    )
  })

  return expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey)
}

export async function verifyPassword(password: string, config: DashboardConfig): Promise<boolean> {
  const configuredHash = (config.auth.passwordHash || "").trim()
  if (configuredHash) {
    return verifyHash(password, configuredHash)
  }

  const fallbackPassword = String(config.auth.password || "")
  return fallbackPassword.length > 0 && crypto.timingSafeEqual(Buffer.from(password), Buffer.from(fallbackPassword))
}

export function createSessionHandlers(config: DashboardConfig, authStore: DashboardAuthStore): DashboardSessionHandlers {
  return {
    admin: createScopedSessionMiddleware(config, authStore, ADMIN_SESSION_COOKIE_NAME, "admin"),
    viewer: createScopedSessionMiddleware(config, authStore, VIEWER_SESSION_COOKIE_NAME, "viewer")
  }
}

export function createRateLimiter(config: DashboardConfig, authStore?: DashboardAuthStore): LoginRateLimiter {
  const entries = new Map<string, RateLimitEntry>()
  const windowMs = Math.max(1, Number(config.auth.loginRateLimit?.windowMinutes || 15)) * 60 * 1000
  const maxAttempts = Math.max(1, Number(config.auth.loginRateLimit?.maxAttempts || 8))

  const inspectMemory = (key: string): LoginRateLimitState => {
    const now = Date.now()
    const entry = entries.get(key)
    if (!entry || entry.resetAt <= now) {
      entries.delete(key)
      return {
        allowed: true,
        remaining: maxAttempts,
        retryAfterMs: 0
      }
    }

    return {
      allowed: entry.attempts < maxAttempts,
      remaining: Math.max(0, maxAttempts - entry.attempts),
      retryAfterMs: Math.max(0, entry.resetAt - now)
    }
  }

  return {
    async inspect(key: string) {
      if (authStore) {
        return await authStore.inspectThrottle("admin-login", key, windowMs, maxAttempts)
      }

      return inspectMemory(key)
    },
    async recordFailure(key: string) {
      if (authStore) {
        return await authStore.recordThrottleFailure("admin-login", key, windowMs, maxAttempts)
      }

      const now = Date.now()
      const current = entries.get(key)
      if (!current || current.resetAt <= now) {
        const next: RateLimitEntry = { attempts: 1, resetAt: now + windowMs }
        entries.set(key, next)
        return inspectMemory(key)
      }

      current.attempts += 1
      entries.set(key, current)
      return inspectMemory(key)
    },
    async reset(key: string) {
      if (authStore) {
        await authStore.resetThrottle("admin-login", key)
        return
      }

      entries.delete(key)
    }
  }
}

export function getRequestKey(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || "unknown"
}

export function sanitizeReturnTo(basePath: string, candidate: unknown, fallback?: string): string {
  const defaultTarget = fallback || `${basePath === "/" ? "" : basePath}/admin`
  if (typeof candidate !== "string" || candidate.length === 0) return defaultTarget
  if (!candidate.startsWith("/")) return defaultTarget
  if (candidate.startsWith("//")) return defaultTarget
  if (candidate.includes("://")) return defaultTarget
  if (basePath !== "/" && !candidate.startsWith(basePath)) return defaultTarget
  return candidate
}

export function sanitizeViewerReturnTo(basePath: string, candidate: unknown, fallback = ""): string {
  if (typeof candidate !== "string" || candidate.length === 0) return fallback
  if (!candidate.startsWith("/")) return fallback
  if (candidate.startsWith("//")) return fallback
  if (candidate.includes("://")) return fallback
  if (basePath !== "/" && !candidate.startsWith(basePath)) return fallback

  const normalizedBasePath = basePath === "/" ? "" : basePath
  const portalPath = `${normalizedBasePath}/me/transcripts`
  if (candidate === portalPath || candidate.startsWith(`${portalPath}/`)) {
    return candidate
  }

  const prefix = `${normalizedBasePath}/transcripts/`
  if (!candidate.startsWith(prefix)) return fallback
  if (candidate.startsWith(`${prefix}_auth/`)) return fallback
  return candidate
}

function isEditorAllowedPath(basePath: string, candidate: string) {
  return DASHBOARD_EDITOR_ALLOWED_PATHS.some((prefix) => {
    const target = joinBasePath(basePath, prefix)
    return candidate === target || candidate.startsWith(`${target}/`) || candidate.startsWith(`${target}?`)
  })
}

export function resolveAdminReturnTo(
  basePath: string,
  access: DashboardAdminAccessState,
  candidate: unknown
) {
  const sanitized = sanitizeReturnTo(basePath, candidate, access.preferredEntryPath)
  if (access.tier !== "editor") {
    return sanitized
  }

  return isEditorAllowedPath(basePath, sanitized)
    ? sanitized
    : access.preferredEntryPath
}

export function createViewerOAuthState(returnTo: string): DashboardViewerOAuthState {
  return {
    state: crypto.randomBytes(24).toString("hex"),
    returnTo
  }
}

export function createAdminOAuthState(returnTo: string): DashboardAdminOAuthState {
  return {
    state: crypto.randomBytes(24).toString("hex"),
    returnTo
  }
}

export function getAdminSession(req: express.Request): DashboardAdminSession | null {
  const sessionData = readSession(req)
  const admin = sessionData.admin
  if (!admin || typeof admin !== "object") {
    return null
  }

  return admin as DashboardAdminSession
}

export function setAdminSession(req: express.Request, admin: DashboardAdminSession) {
  const sessionData = readSession(req)
  sessionData.admin = admin
}

export function clearAdminSession(req: express.Request) {
  const sessionData = readSession(req)
  delete sessionData.admin
  delete sessionData.authed
}

export function getViewerSession(req: express.Request): DashboardViewerSession | null {
  const sessionData = readSession(req)
  const viewer = sessionData.viewer
  if (!viewer || typeof viewer !== "object") {
    return null
  }

  return viewer as DashboardViewerSession
}

export function setViewerSession(req: express.Request, viewer: DashboardViewerSession) {
  const sessionData = readSession(req)
  sessionData.viewer = viewer
}

export function clearViewerSession(req: express.Request) {
  const sessionData = readSession(req)
  delete sessionData.viewer
}

function buildDiscordAuthorizeUrl(config: DashboardConfig, redirectUri: string, state: string) {
  const discord = resolveDashboardDiscordAuthConfig(config)
  const params = new URLSearchParams({
    client_id: discord.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify",
    state
  })
  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

export function buildViewerDiscordAuthorizeUrl(config: DashboardConfig, redirectUri: string, state: string) {
  return buildDiscordAuthorizeUrl(config, redirectUri, state)
}

export function buildAdminDiscordAuthorizeUrl(config: DashboardConfig, redirectUri: string, state: string) {
  return buildDiscordAuthorizeUrl(config, redirectUri, state)
}

function createDiscordIdentityAuthClient(options: {
  tokenExchangeError: string
  accessTokenError: string
  identityError: string
}) {
  return {
    async exchangeCode(code, redirectUri, config) {
      const discord = resolveDashboardDiscordAuthConfig(config)
      const response = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: discord.clientId,
          client_secret: discord.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri
        }).toString()
      })

      if (!response.ok) {
        throw new Error(options.tokenExchangeError)
      }

      const payload = await response.json() as { access_token?: string }
      if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
        throw new Error(options.accessTokenError)
      }

      return payload.access_token
    },
    async fetchIdentity(accessToken: string) {
      const response = await fetch("https://discord.com/api/users/@me", {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        throw new Error(options.identityError)
      }

      return mapDiscordIdentitySession(await response.json() as DiscordIdentityResponse)
    }
  }
}

export function createDiscordViewerAuthClient(): DashboardViewerAuthClient {
  const client = createDiscordIdentityAuthClient({
    tokenExchangeError: "Discord viewer sign-in failed during token exchange.",
    accessTokenError: "Discord viewer sign-in did not return an access token.",
    identityError: "Discord viewer sign-in failed while loading the user profile."
  })

  return {
    exchangeCode: client.exchangeCode,
    fetchViewerIdentity: client.fetchIdentity
  }
}

export function createDiscordAdminAuthClient(): DashboardAdminAuthClient {
  const client = createDiscordIdentityAuthClient({
    tokenExchangeError: "Discord admin sign-in failed during token exchange.",
    accessTokenError: "Discord admin sign-in did not return an access token.",
    identityError: "Discord admin sign-in failed while loading the user profile."
  })

  return {
    exchangeCode: client.exchangeCode,
    fetchAdminIdentity: client.fetchIdentity
  }
}

export async function verifyBreakglassPassword(password: string, config: DashboardConfig): Promise<boolean> {
  if (config.auth.breakglass?.enabled !== true) {
    return false
  }

  const configuredHash = normalizeString(config.auth.breakglass?.passwordHash)
  if (!configuredHash) {
    return false
  }

  return await verifyHash(password, configuredHash)
}

export async function resolveDashboardAdminAccess(
  config: DashboardConfig,
  basePath: string,
  runtimeBridge: DashboardRuntimeBridge,
  identity: DashboardAdminSession | null
): Promise<DashboardAdminAccessState> {
  if (!identity) {
    return {
      authenticated: false,
      identity: null,
      tier: null,
      membership: "missing",
      capabilities: [],
      preferredEntryPath: joinBasePath(basePath, "login"),
      canAccessAdminHost: false,
      canUseAdvancedEditorTools: false,
      revalidatedAt: new Date().toISOString(),
      source: "live",
      freshnessMs: DASHBOARD_ACCESS_CACHE_MAX_AGE_MS
    }
  }

  const runtimeGuildId = getDashboardRuntimeGuildId(runtimeBridge)
  if (!runtimeGuildId && typeof runtimeBridge.resolveGuildMember !== "function") {
    return {
      authenticated: true,
      identity,
      tier: null,
      membership: "unresolved",
      capabilities: [],
      preferredEntryPath: joinBasePath(basePath, "login"),
      canAccessAdminHost: false,
      canUseAdvancedEditorTools: false,
      revalidatedAt: new Date().toISOString(),
      source: "live",
      freshnessMs: DASHBOARD_ACCESS_CACHE_MAX_AGE_MS
    }
  }

  const runtimeMember = await resolveRuntimeMember(runtimeBridge, identity.userId)
  const tier = resolveAccessTier(config, runtimeMember.member)
  const access = buildAdminAccessState(
    basePath,
    identity,
    runtimeMember.member,
    tier,
    runtimeMember.source,
    runtimeMember.freshnessMs
  )

  if (!runtimeMember.member) {
    return {
      ...access,
      membership: runtimeMember.unresolved ? "unresolved" : "missing"
    }
  }

  return access
}

export async function resolveDashboardViewerAccess(
  config: DashboardConfig,
  runtimeBridge: DashboardRuntimeBridge,
  identity: DashboardViewerSession | null
): Promise<DashboardViewerAccessState> {
  if (!identity) {
    return {
      authenticated: false,
      identity: null,
      membership: "missing",
      tier: null,
      ownerOverride: false,
      revalidatedAt: new Date().toISOString(),
      source: "live",
      freshnessMs: DASHBOARD_ACCESS_CACHE_MAX_AGE_MS
    }
  }

  const runtimeGuildId = getDashboardRuntimeGuildId(runtimeBridge)
  if (!runtimeGuildId && typeof runtimeBridge.resolveGuildMember !== "function") {
    return {
      authenticated: true,
      identity,
      membership: "unresolved",
      tier: null,
      ownerOverride: false,
      revalidatedAt: new Date().toISOString(),
      source: "live",
      freshnessMs: DASHBOARD_ACCESS_CACHE_MAX_AGE_MS
    }
  }

  const runtimeMember = await resolveRuntimeMember(runtimeBridge, identity.userId)
  return createViewerAccessState(identity, runtimeMember, config)
}

export function hasDashboardCapability(
  access: DashboardAdminAccessState | null | undefined,
  capability: DashboardCapability
) {
  return Boolean(access && access.capabilities.includes(capability))
}

function normalizeRequirements(req: express.Request, input: DashboardRequirementInput) {
  const resolved = typeof input === "function" ? input(req) : input
  return Array.isArray(resolved) ? resolved : [resolved]
}

function sendApiDenied(res: express.Response) {
  res.status(403).json({ success: false, error: "Forbidden" })
}

function sendFormDenied(res: express.Response) {
  res.status(403).type("text/plain; charset=utf-8").send("Forbidden")
}

function redirectToLogin(req: express.Request, res: express.Response, basePath: string) {
  const loginPath = joinBasePath(basePath, "login")
  const returnTo = encodeURIComponent(req.originalUrl || joinBasePath(basePath, "admin"))
  res.redirect(`${loginPath}?returnTo=${returnTo}`)
}

function redirectToPreferredEntry(res: express.Response, access: DashboardAdminAccessState) {
  res.redirect(access.preferredEntryPath)
}

export function createAdminGuard(
  context: Pick<DashboardAppContext, "basePath" | "config" | "runtimeBridge" | "authStore">
) {
  const ensureAccess = async (req: express.Request, res: express.Response) => {
    const identity = getAdminSession(req)
    if (!identity) {
      return { state: "unauthenticated" as const, access: null }
    }

    const access = await resolveDashboardAdminAccess(
      context.config,
      context.basePath,
      context.runtimeBridge,
      identity
    )
    res.locals.dashboardAccess = access

    if (!access.canAccessAdminHost) {
      await context.authStore.recordAuditEvent({
        eventType: "session-invalidated",
        sessionScope: "admin",
        sessionId: req.sessionID,
        actor: buildDashboardAuditActor(identity),
        target: req.originalUrl || joinBasePath(context.basePath, "admin"),
        outcome: "invalidated",
        reason: access.membership === "missing"
          ? "lost-guild-membership"
          : access.membership === "unresolved"
            ? "membership-unresolved"
            : "lost-admin-tier",
        details: {
          membership: access.membership,
          tier: access.tier,
          source: access.source,
          freshnessMs: access.freshnessMs
        }
      }).catch(() => {})
      clearAdminSession(req)
      return { state: "unauthorized" as const, access }
    }

    return { state: "ok" as const, access }
  }

  const allow = async (
    req: express.Request,
    res: express.Response,
    requirementsInput: DashboardRequirementInput,
    mode: "page" | "form" | "api"
  ) => {
    const result = await ensureAccess(req, res)
    if (result.state === "unauthenticated" || result.state === "unauthorized") {
      if (mode === "api") {
        sendApiDenied(res)
        return false
      }

      if (mode === "form") {
        sendFormDenied(res)
        return false
      }

      redirectToLogin(req, res, context.basePath)
      return false
    }

    const requirements = normalizeRequirements(req, requirementsInput)
    if (requirements.every((capability) => hasDashboardCapability(result.access, capability))) {
      return true
    }

    if (mode === "api") {
      sendApiDenied(res)
      return false
    }

    if (mode === "form") {
      sendFormDenied(res)
      return false
    }

    redirectToPreferredEntry(res, result.access)
    return false
  }

  const createHandler = (requirementsInput: DashboardRequirementInput, mode: "page" | "form" | "api"): express.RequestHandler => {
    return (req, res, next) => {
      void allow(req, res, requirementsInput, mode)
        .then((allowed) => {
          if (allowed) {
            next()
          }
        })
        .catch(next)
    }
  }

  return {
    getAccess(res: express.Response) {
      return (res.locals.dashboardAccess as DashboardAdminAccessState | undefined) || null
    },
    page(requirementsInput: DashboardRequirementInput) {
      return createHandler(requirementsInput, "page")
    },
    form(requirementsInput: DashboardRequirementInput) {
      return createHandler(requirementsInput, "form")
    },
    api(requirementsInput: DashboardRequirementInput) {
      return createHandler(requirementsInput, "api")
    }
  }
}

export const requireAuth: express.RequestHandler = (req, res, next) => {
  if (getAdminSession(req)) {
    return next()
  }

  const returnTo = encodeURIComponent(req.originalUrl)
  const loginPath = joinBasePath(String(res.locals.basePath || "/"), "login")
  res.redirect(`${loginPath}?returnTo=${returnTo}`)
}

export function regenerateSession(req: express.Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error)
      resolve()
    })
  })
}
