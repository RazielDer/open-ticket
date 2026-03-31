import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import session from "express-session"
import * as sqlite3 from "sqlite3"

export type DashboardSessionScope = "admin" | "viewer"

interface AuthSessionRow {
  data: string
  expires_at: number
}

interface AuthOAuthStateRow {
  state: string
  return_to: string
}

interface AuthThrottleRow {
  attempts: number
  reset_at: number
}

interface AuthAuditRow {
  id: string
  event_type: string
  session_scope: DashboardSessionScope | null
  session_id: string | null
  actor_user_id: string | null
  actor_username: string | null
  actor_global_name: string | null
  target: string | null
  outcome: string | null
  reason: string | null
  details_json: string
  created_at: number
}

export interface DashboardStoredOAuthState {
  state: string
  returnTo: string
}

export interface DashboardAuditEventInput {
  eventType: string
  sessionScope?: DashboardSessionScope | null
  sessionId?: string | null
  actor?: {
    userId?: string | null
    username?: string | null
    globalName?: string | null
  } | null
  target?: string | null
  outcome?: string | null
  reason?: string | null
  details?: Record<string, unknown> | null
}

export interface DashboardAuditEventRecord {
  id: string
  eventType: string
  sessionScope: DashboardSessionScope | null
  sessionId: string | null
  actorUserId: string | null
  actorUsername: string | null
  actorGlobalName: string | null
  target: string | null
  outcome: string | null
  reason: string | null
  details: Record<string, unknown>
  createdAt: string
}

export interface DashboardAuditEventQuery {
  limit?: number
  eventType?: string
  actorUserId?: string
  sessionScope?: DashboardSessionScope
}

function normalizeConfiguredPath(projectRoot: string, configuredPath: string) {
  const trimmed = String(configuredPath || "").trim()
  if (!trimmed) {
    return path.resolve(projectRoot, "runtime", "ot-dashboard", "auth.sqlite")
  }

  return path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(projectRoot, trimmed)
}

function resolveSessionExpiry(sessionData: Record<string, any>, fallbackMaxAgeMs: number) {
  const cookie = sessionData?.cookie
  const expires = cookie?.expires
  if (typeof expires === "string" || expires instanceof Date) {
    const parsed = new Date(expires).getTime()
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  const maxAge = Number(cookie?.maxAge)
  if (Number.isFinite(maxAge) && maxAge > 0) {
    return Date.now() + maxAge
  }

  return Date.now() + fallbackMaxAgeMs
}

class DashboardSqliteSessionStore extends session.Store {
  constructor(
    private readonly authStore: DashboardAuthStore,
    private readonly scope: DashboardSessionScope
  ) {
    super()
  }

  get(
    sid: string,
    callback: (error?: unknown, sessionData?: session.SessionData | null) => void
  ) {
    void this.authStore.getSession(this.scope, sid)
      .then((sessionData) => callback(undefined, sessionData as session.SessionData | null))
      .catch((error) => callback(error))
  }

  set(
    sid: string,
    sessionData: session.SessionData,
    callback?: (error?: unknown) => void
  ) {
    void this.authStore.setSession(this.scope, sid, sessionData as Record<string, any>)
      .then(() => callback?.())
      .catch((error) => callback?.(error))
  }

  touch(
    sid: string,
    sessionData: session.SessionData,
    callback?: () => void
  ) {
    void this.authStore.touchSession(this.scope, sid, sessionData as Record<string, any>)
      .then(() => callback?.())
      .catch(() => callback?.())
  }

  destroy(sid: string, callback?: (error?: unknown) => void) {
    void this.authStore.destroySession(this.scope, sid)
      .then(() => callback?.())
      .catch((error) => callback?.(error))
  }
}

export class DashboardAuthStore {
  readonly filePath: string

  readonly #connection: sqlite3.Database
  readonly #sessionMaxAgeMs: number
  readonly #ready: Promise<void>
  #lastCleanupAt = 0
  #closed = false

  constructor(projectRoot: string, configuredPath: string, sessionMaxAgeMs: number) {
    this.filePath = normalizeConfiguredPath(projectRoot, configuredPath)
    this.#sessionMaxAgeMs = Math.max(60_000, sessionMaxAgeMs)

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    this.#connection = new sqlite3.Database(this.filePath, (error) => {
      if (error) throw error
    })
    this.#ready = this.initialize()
  }

  createSessionStore(scope: DashboardSessionScope) {
    return new DashboardSqliteSessionStore(this, scope)
  }

  async getSession(scope: DashboardSessionScope, sid: string): Promise<Record<string, any> | null> {
    await this.#ready
    const now = Date.now()
    await this.maybeCleanup(now)

    const row = await this.get<AuthSessionRow>(
      "SELECT data, expires_at FROM auth_sessions WHERE scope = ? AND sid = ?",
      [scope, sid]
    )

    if (!row) {
      return null
    }

    if (row.expires_at <= now) {
      await this.run("DELETE FROM auth_sessions WHERE scope = ? AND sid = ?", [scope, sid])
      return null
    }

    try {
      return JSON.parse(row.data) as Record<string, any>
    } catch {
      await this.run("DELETE FROM auth_sessions WHERE scope = ? AND sid = ?", [scope, sid])
      return null
    }
  }

  async setSession(scope: DashboardSessionScope, sid: string, sessionData: Record<string, any>) {
    await this.#ready
    const now = Date.now()
    const expiresAt = resolveSessionExpiry(sessionData, this.#sessionMaxAgeMs)

    await this.run(
      `
        INSERT INTO auth_sessions (
          scope,
          sid,
          data,
          expires_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope, sid) DO UPDATE SET
          data = excluded.data,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `,
      [scope, sid, JSON.stringify(sessionData), expiresAt, now, now]
    )
  }

  async touchSession(scope: DashboardSessionScope, sid: string, sessionData: Record<string, any>) {
    await this.#ready
    const now = Date.now()
    const expiresAt = resolveSessionExpiry(sessionData, this.#sessionMaxAgeMs)

    await this.run(
      `
        UPDATE auth_sessions
        SET expires_at = ?, updated_at = ?
        WHERE scope = ? AND sid = ?
      `,
      [expiresAt, now, scope, sid]
    )
  }

  async destroySession(scope: DashboardSessionScope, sid: string) {
    await this.#ready
    await this.run("DELETE FROM auth_sessions WHERE scope = ? AND sid = ?", [scope, sid])
  }

  async storeOAuthState(input: {
    scope: string
    sessionScope: DashboardSessionScope
    sessionId: string
    state: string
    returnTo: string
    expiresAt: number
  }) {
    await this.#ready
    const now = Date.now()
    await this.run(
      `
        INSERT INTO auth_oauth_states (
          scope,
          state,
          session_scope,
          session_id,
          return_to,
          expires_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope, state) DO UPDATE SET
          session_scope = excluded.session_scope,
          session_id = excluded.session_id,
          return_to = excluded.return_to,
          expires_at = excluded.expires_at,
          created_at = excluded.created_at
      `,
      [
        input.scope,
        input.state,
        input.sessionScope,
        input.sessionId,
        input.returnTo,
        input.expiresAt,
        now
      ]
    )
  }

  async consumeOAuthState(input: {
    scope: string
    sessionScope: DashboardSessionScope
    sessionId: string
    state: string
  }): Promise<DashboardStoredOAuthState | null> {
    await this.#ready
    const now = Date.now()
    await this.maybeCleanup(now)

    const row = await this.get<AuthOAuthStateRow>(
      `
        SELECT state, return_to
        FROM auth_oauth_states
        WHERE scope = ?
          AND state = ?
          AND session_scope = ?
          AND session_id = ?
          AND expires_at > ?
      `,
      [input.scope, input.state, input.sessionScope, input.sessionId, now]
    )

    if (!row) {
      return null
    }

    await this.run(
      "DELETE FROM auth_oauth_states WHERE scope = ? AND state = ?",
      [input.scope, input.state]
    )

    return {
      state: row.state,
      returnTo: row.return_to
    }
  }

  async clearOAuthStatesForSession(scope: string, sessionScope: DashboardSessionScope, sessionId: string) {
    await this.#ready
    await this.run(
      `
        DELETE FROM auth_oauth_states
        WHERE scope = ? AND session_scope = ? AND session_id = ?
      `,
      [scope, sessionScope, sessionId]
    )
  }

  async inspectThrottle(scope: string, throttleKey: string, windowMs: number, maxAttempts: number) {
    await this.#ready
    const now = Date.now()
    await this.maybeCleanup(now)

    const row = await this.get<AuthThrottleRow>(
      "SELECT attempts, reset_at FROM auth_login_throttle WHERE scope = ? AND throttle_key = ?",
      [scope, throttleKey]
    )

    if (!row || row.reset_at <= now) {
      if (row) {
        await this.run(
          "DELETE FROM auth_login_throttle WHERE scope = ? AND throttle_key = ?",
          [scope, throttleKey]
        )
      }

      return {
        allowed: true,
        remaining: maxAttempts,
        retryAfterMs: 0
      }
    }

    return {
      allowed: row.attempts < maxAttempts,
      remaining: Math.max(0, maxAttempts - row.attempts),
      retryAfterMs: Math.max(0, row.reset_at - now)
    }
  }

  async recordThrottleFailure(scope: string, throttleKey: string, windowMs: number, maxAttempts: number) {
    await this.#ready
    const now = Date.now()
    const row = await this.get<AuthThrottleRow>(
      "SELECT attempts, reset_at FROM auth_login_throttle WHERE scope = ? AND throttle_key = ?",
      [scope, throttleKey]
    )

    const attempts = !row || row.reset_at <= now ? 1 : row.attempts + 1
    const resetAt = !row || row.reset_at <= now ? now + windowMs : row.reset_at

    await this.run(
      `
        INSERT INTO auth_login_throttle (
          scope,
          throttle_key,
          attempts,
          reset_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(scope, throttle_key) DO UPDATE SET
          attempts = excluded.attempts,
          reset_at = excluded.reset_at,
          updated_at = excluded.updated_at
      `,
      [scope, throttleKey, attempts, resetAt, now]
    )

    return {
      allowed: attempts < maxAttempts,
      remaining: Math.max(0, maxAttempts - attempts),
      retryAfterMs: Math.max(0, resetAt - now)
    }
  }

  async resetThrottle(scope: string, throttleKey: string) {
    await this.#ready
    await this.run(
      "DELETE FROM auth_login_throttle WHERE scope = ? AND throttle_key = ?",
      [scope, throttleKey]
    )
  }

  async cleanupExpiredRows(now = Date.now()) {
    await this.#ready
    await this.run("DELETE FROM auth_sessions WHERE expires_at <= ?", [now])
    await this.run("DELETE FROM auth_oauth_states WHERE expires_at <= ?", [now])
    await this.run("DELETE FROM auth_login_throttle WHERE reset_at <= ?", [now])
  }

  async recordAuditEvent(input: DashboardAuditEventInput): Promise<DashboardAuditEventRecord> {
    await this.#ready
    const createdAtMs = Date.now()
    const id = crypto.randomUUID()
    const actor = input.actor || null
    const details = normalizeAuditDetails(input.details)

    await this.run(
      `
        INSERT INTO auth_audit_log (
          id,
          event_type,
          session_scope,
          session_id,
          actor_user_id,
          actor_username,
          actor_global_name,
          target,
          outcome,
          reason,
          details_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        String(input.eventType || "").trim(),
        input.sessionScope ?? null,
        normalizeNullableText(input.sessionId),
        normalizeNullableText(actor?.userId),
        normalizeNullableText(actor?.username),
        normalizeNullableText(actor?.globalName),
        normalizeNullableText(input.target),
        normalizeNullableText(input.outcome),
        normalizeNullableText(input.reason),
        JSON.stringify(details),
        createdAtMs
      ]
    )

    return {
      id,
      eventType: String(input.eventType || "").trim(),
      sessionScope: input.sessionScope ?? null,
      sessionId: normalizeNullableText(input.sessionId),
      actorUserId: normalizeNullableText(actor?.userId),
      actorUsername: normalizeNullableText(actor?.username),
      actorGlobalName: normalizeNullableText(actor?.globalName),
      target: normalizeNullableText(input.target),
      outcome: normalizeNullableText(input.outcome),
      reason: normalizeNullableText(input.reason),
      details,
      createdAt: new Date(createdAtMs).toISOString()
    }
  }

  async listAuditEvents(query: DashboardAuditEventQuery = {}): Promise<DashboardAuditEventRecord[]> {
    await this.#ready
    const clauses: string[] = []
    const params: unknown[] = []

    if (typeof query.eventType === "string" && query.eventType.trim().length > 0) {
      clauses.push("event_type = ?")
      params.push(query.eventType.trim())
    }

    if (typeof query.actorUserId === "string" && query.actorUserId.trim().length > 0) {
      clauses.push("actor_user_id = ?")
      params.push(query.actorUserId.trim())
    }

    if (query.sessionScope === "admin" || query.sessionScope === "viewer") {
      clauses.push("session_scope = ?")
      params.push(query.sessionScope)
    }

    const limit = Math.max(1, Math.min(Number(query.limit) || 50, 500))
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""
    const rows = await this.all<AuthAuditRow>(
      `
        SELECT
          id,
          event_type,
          session_scope,
          session_id,
          actor_user_id,
          actor_username,
          actor_global_name,
          target,
          outcome,
          reason,
          details_json,
          created_at
        FROM auth_audit_log
        ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `,
      [...params, limit]
    )

    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      sessionScope: row.session_scope,
      sessionId: row.session_id,
      actorUserId: row.actor_user_id,
      actorUsername: row.actor_username,
      actorGlobalName: row.actor_global_name,
      target: row.target,
      outcome: row.outcome,
      reason: row.reason,
      details: parseAuditDetails(row.details_json),
      createdAt: new Date(row.created_at).toISOString()
    }))
  }

  async close() {
    if (this.#closed) {
      return
    }

    this.#closed = true
    await this.#ready
    await new Promise<void>((resolve, reject) => {
      this.#connection.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  private async initialize() {
    await this.exec("PRAGMA journal_mode=WAL;")
    await this.exec("PRAGMA synchronous=NORMAL;")
    await this.exec("PRAGMA busy_timeout=5000;")
    await this.exec(
      `
        CREATE TABLE IF NOT EXISTS auth_sessions (
          scope TEXT NOT NULL,
          sid TEXT NOT NULL,
          data TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (scope, sid)
        );

        CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
        ON auth_sessions (expires_at);

        CREATE TABLE IF NOT EXISTS auth_oauth_states (
          scope TEXT NOT NULL,
          state TEXT NOT NULL,
          session_scope TEXT NOT NULL,
          session_id TEXT NOT NULL,
          return_to TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (scope, state)
        );

        CREATE INDEX IF NOT EXISTS idx_auth_oauth_states_expires_at
        ON auth_oauth_states (expires_at);

        CREATE TABLE IF NOT EXISTS auth_login_throttle (
          scope TEXT NOT NULL,
          throttle_key TEXT NOT NULL,
          attempts INTEGER NOT NULL,
          reset_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (scope, throttle_key)
        );

        CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_reset_at
        ON auth_login_throttle (reset_at);

        CREATE TABLE IF NOT EXISTS auth_audit_log (
          id TEXT NOT NULL PRIMARY KEY,
          event_type TEXT NOT NULL,
          session_scope TEXT NULL,
          session_id TEXT NULL,
          actor_user_id TEXT NULL,
          actor_username TEXT NULL,
          actor_global_name TEXT NULL,
          target TEXT NULL,
          outcome TEXT NULL,
          reason TEXT NULL,
          details_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at
        ON auth_audit_log (created_at);

        CREATE INDEX IF NOT EXISTS idx_auth_audit_log_event_type
        ON auth_audit_log (event_type);

        CREATE INDEX IF NOT EXISTS idx_auth_audit_log_actor_user_id
        ON auth_audit_log (actor_user_id);
      `
    )
  }

  private async maybeCleanup(now: number) {
    if (now - this.#lastCleanupAt < 60_000) {
      return
    }

    this.#lastCleanupAt = now
    try {
      await this.cleanupExpiredRows(now)
    } catch {}
  }

  private async exec(sql: string) {
    return await new Promise<void>((resolve, reject) => {
      this.#connection.exec(sql, (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  private async run(sql: string, params: unknown[] = []) {
    return await new Promise<void>((resolve, reject) => {
      this.#connection.run(sql, params, (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  private async get<T>(sql: string, params: unknown[] = []) {
    return await new Promise<T | undefined>((resolve, reject) => {
      this.#connection.get(sql, params, (error, row: T | undefined) => {
        if (error) {
          reject(error)
          return
        }
        resolve(row)
      })
    })
  }

  private async all<T>(sql: string, params: unknown[] = []) {
    return await new Promise<T[]>((resolve, reject) => {
      this.#connection.all(sql, params, (error, rows: T[]) => {
        if (error) {
          reject(error)
          return
        }
        resolve(rows)
      })
    })
  }
}

function normalizeNullableText(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed.length > 0 ? trimmed : null
}

function normalizeAuditDetails(details: Record<string, unknown> | null | undefined) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {}
  }

  return details
}

function parseAuditDetails(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {}

  return {}
}
