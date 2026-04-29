import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  createRateLimiter,
  hashPassword,
  sanitizeReturnTo,
  sanitizeViewerReturnTo,
  verifyPassword
} from "../server/auth"
import { DashboardAuthStore } from "../server/auth-store"
import type { DashboardConfig } from "../server/dashboard-config"
import { getDashboardSecurityWarnings, loadDashboardConfig, resolveDashboardTrustProxy } from "../server/dashboard-config"
import { getDashboardRuntimeApi, installDashboardRuntimeApi } from "../server/dashboard-runtime-api"

const baseConfig: DashboardConfig = {
  host: "127.0.0.1",
  port: 3360,
  basePath: "/dash",
  publicBaseUrl: "",
  viewerPublicBaseUrl: "",
  trustProxyHops: 1,
  dashboardName: "Auth Test",
  locale: "english",
  brand: {
    title: "Auth Test"
  },
  auth: {
    passwordHash: "",
    password: "",
    sessionSecret: "test-session-secret-with-safe-length",
    sqlitePath: "runtime/ot-dashboard/auth.sqlite",
    discord: {
      clientId: "",
      clientSecret: ""
    },
    breakglass: {
      enabled: false,
      passwordHash: ""
    },
    maxAgeHours: 1,
    loginRateLimit: {
      windowMinutes: 15,
      maxAttempts: 2
    }
  },
  viewerAuth: {
    discord: {
      clientId: "",
      clientSecret: ""
    }
  },
  rbac: {
    ownerUserIds: [],
    roleIds: {
      reviewer: [],
      editor: [],
      admin: []
    },
    userIds: {
      reviewer: [],
      editor: [],
      admin: []
    }
  }
}

test("scrypt password hashes verify correctly", async () => {
  const passwordHash = await hashPassword("secret")
  const config = {
    ...baseConfig,
    auth: {
      ...baseConfig.auth,
      passwordHash
    }
  }

  assert.equal(await verifyPassword("secret", config), true)
  assert.equal(await verifyPassword("wrong", config), false)
})

test("return targets stay inside the configured base path", () => {
  assert.equal(sanitizeReturnTo("/dash", "/dash/config/general", "/dash/admin"), "/dash/config/general")
  assert.equal(sanitizeReturnTo("/dash", "https://evil.example", "/dash/admin"), "/dash/admin")
  assert.equal(sanitizeReturnTo("/dash", "/other/path", "/dash/admin"), "/dash/admin")
})

test("viewer return targets stay inside transcript viewer routes only", () => {
  assert.equal(sanitizeViewerReturnTo("/dash", "/dash/transcripts/slug-1", ""), "/dash/transcripts/slug-1")
  assert.equal(sanitizeViewerReturnTo("/dash", "/dash/transcripts/slug-1/assets/file.png", ""), "/dash/transcripts/slug-1/assets/file.png")
  assert.equal(sanitizeViewerReturnTo("/dash", "/dash/transcripts/_auth/login", "/dash/transcripts/slug-1"), "/dash/transcripts/slug-1")
  assert.equal(sanitizeViewerReturnTo("/dash", "/dash/admin", "/dash/transcripts/slug-1"), "/dash/transcripts/slug-1")
})

test("login rate limiting blocks after the configured number of failures", async () => {
  const limiter = createRateLimiter(baseConfig)

  assert.equal((await limiter.inspect("ip-1")).allowed, true)
  await limiter.recordFailure("ip-1")
  assert.equal((await limiter.inspect("ip-1")).allowed, true)
  await limiter.recordFailure("ip-1")
  assert.equal((await limiter.inspect("ip-1")).allowed, false)
  await limiter.reset("ip-1")
  assert.equal((await limiter.inspect("ip-1")).allowed, true)
})

test("dashboard auth store persists audit rows across reopen and supports filtering", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-auth-store-"))
  const configuredPath = "runtime/ot-dashboard/auth.sqlite"
  const firstStore = new DashboardAuthStore(projectRoot, configuredPath, 60_000)

  try {
    await firstStore.recordAuditEvent({
      eventType: "viewer-login-success",
      sessionScope: "viewer",
      sessionId: "viewer-session-1",
      actor: {
        userId: "viewer-1",
        username: "viewer-1",
        globalName: "Viewer One"
      },
      target: "/dash/me/transcripts",
      outcome: "success",
      reason: "discord-oauth",
      details: {
        tier: null,
        membership: "member"
      }
    })
    await firstStore.recordAuditEvent({
      eventType: "session-invalidated",
      sessionScope: "admin",
      sessionId: "admin-session-1",
      actor: {
        userId: "admin-1",
        username: "admin-1",
        globalName: "Admin One"
      },
      target: "/dash/admin",
      outcome: "invalidated",
      reason: "lost-guild-membership",
      details: {
        membership: "missing"
      }
    })
  } finally {
    await firstStore.close()
  }

  const reopenedStore = new DashboardAuthStore(projectRoot, configuredPath, 60_000)
  try {
    const allEvents = await reopenedStore.listAuditEvents({ limit: 10 })
    const viewerEvents = await reopenedStore.listAuditEvents({
      eventType: "viewer-login-success",
      actorUserId: "viewer-1",
      sessionScope: "viewer"
    })
    const invalidation = allEvents.find((event) => event.eventType === "session-invalidated")

    assert.equal(allEvents.length, 2)
    assert.equal(invalidation?.actorUserId, "admin-1")
    assert.equal(invalidation?.details.membership, "missing")
    assert.equal(viewerEvents.length, 1)
    assert.equal(viewerEvents[0]?.target, "/dash/me/transcripts")
    assert.equal(viewerEvents[0]?.details.membership, "member")
  } finally {
    await reopenedStore.close()
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test("dashboard security warnings flag public binds, missing breakglass hash, and weak public URLs", () => {
  const warnings = getDashboardSecurityWarnings({
    ...baseConfig,
    host: "0.0.0.0",
    publicBaseUrl: "http://dashboard.example",
    auth: {
      ...baseConfig.auth,
      sessionSecret: "change-this-session-secret",
      breakglass: {
        enabled: true,
        passwordHash: ""
      }
    }
  })

  assert.equal(warnings.some((warning) => warning.includes("loopback-only")), true)
  assert.equal(warnings.some((warning) => warning.includes("breakglass auth is enabled")), true)
  assert.equal(warnings.some((warning) => warning.includes("sessionSecret")), true)
  assert.equal(warnings.some((warning) => warning.includes("publicBaseUrl uses http")), true)
})

test("dashboard security warnings stay quiet for loopback binds, Discord auth, and https public URLs", async () => {
  const breakglassPasswordHash = await hashPassword("secret")
  const warnings = getDashboardSecurityWarnings({
    ...baseConfig,
    publicBaseUrl: "https://dashboard.example",
    auth: {
      ...baseConfig.auth,
      sessionSecret: "0123456789abcdef0123456789abcdef",
      discord: {
        clientId: "discord-client-id",
        clientSecret: "discord-client-secret"
      },
      breakglass: {
        enabled: true,
        passwordHash: breakglassPasswordHash
      }
    }
  })

  assert.deepEqual(warnings, [])
})

test("dashboard trust proxy is only enabled for loopback binds", () => {
  assert.equal(resolveDashboardTrustProxy(baseConfig), 1)
  assert.equal(resolveDashboardTrustProxy({ ...baseConfig, host: "localhost" }), 1)
  assert.equal(resolveDashboardTrustProxy({ ...baseConfig, host: "0.0.0.0", trustProxyHops: 0 }), 0)
})

test("dashboard config loading supports publicBaseUrl and viewer Discord env overrides", () => {
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-config-"))
  const previousEnv = {
    OT_DASHBOARD_PUBLIC_BASE_URL: process.env.OT_DASHBOARD_PUBLIC_BASE_URL,
    OT_DASHBOARD_VIEWER_DISCORD_CLIENT_ID: process.env.OT_DASHBOARD_VIEWER_DISCORD_CLIENT_ID,
    OT_DASHBOARD_VIEWER_DISCORD_CLIENT_SECRET: process.env.OT_DASHBOARD_VIEWER_DISCORD_CLIENT_SECRET
  }

  try {
    fs.writeFileSync(path.join(pluginRoot, "config.json"), JSON.stringify({
      basePath: "/dash",
      publicBaseUrl: " https://dashboard.example/ ",
      viewerAuth: {
        discord: {
          clientId: "file-client",
          clientSecret: "file-secret"
        }
      }
    }, null, 2))

    process.env.OT_DASHBOARD_PUBLIC_BASE_URL = "https://env-dashboard.example///"
    process.env.OT_DASHBOARD_VIEWER_DISCORD_CLIENT_ID = "env-client"
    process.env.OT_DASHBOARD_VIEWER_DISCORD_CLIENT_SECRET = "env-secret"

    const config = loadDashboardConfig(pluginRoot)
    assert.equal(config.publicBaseUrl, "https://env-dashboard.example")
    assert.equal(config.viewerAuth.discord.clientId, "env-client")
    assert.equal(config.viewerAuth.discord.clientSecret, "env-secret")
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === "string") {
        process.env[key] = value
      } else {
        delete process.env[key]
      }
    }

    fs.rmSync(pluginRoot, { recursive: true, force: true })
  }
})

test("dashboard runtime API builds viewer URLs and returns null when publicBaseUrl is invalid", () => {
  installDashboardRuntimeApi({
    ...baseConfig,
    publicBaseUrl: "https://dashboard.example/",
    viewerAuth: {
      discord: {
        clientId: "client-id",
        clientSecret: "client-secret"
      }
    }
  })

  const runtimeApi = getDashboardRuntimeApi()
  assert.ok(runtimeApi)
  assert.equal(runtimeApi?.buildPublicUrl("/transcripts/slug-1"), "https://dashboard.example/dash/transcripts/slug-1")

  installDashboardRuntimeApi(baseConfig)
  assert.equal(getDashboardRuntimeApi()?.buildPublicUrl("/transcripts/slug-1"), null)
})

test("dashboard runtime API exposes metadata-only audit event recorder", async () => {
  const recorded: unknown[] = []
  installDashboardRuntimeApi(baseConfig, {
    recordAuditEvent(event) {
      recorded.push(event)
    }
  })

  const runtimeApi = getDashboardRuntimeApi()
  assert.ok(runtimeApi)
  const ok = await runtimeApi!.recordAuditEvent({
    eventType: "ai-assist-request",
    actor: { userId: "staff-1", username: "Staff", globalName: null },
    target: "ticket-1",
    outcome: "success",
    details: { action: "summarize", profileId: "assist-1", providerId: "reference", confidence: "high" }
  })

  assert.equal(ok, true)
  assert.deepEqual(recorded, [{
    eventType: "ai-assist-request",
    actor: { userId: "staff-1", username: "Staff", globalName: null },
    target: "ticket-1",
    outcome: "success",
    details: { action: "summarize", profileId: "assist-1", providerId: "reference", confidence: "high" }
  }])
  assert.doesNotMatch(JSON.stringify(recorded), /prompt|answer|summary|draft/i)
})
