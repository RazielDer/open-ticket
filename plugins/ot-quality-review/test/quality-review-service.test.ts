import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  OTQualityReviewService,
  QUALITY_REVIEW_CASES_CATEGORY,
  QUALITY_REVIEW_NOTE_ADJUSTMENTS_CATEGORY,
  QUALITY_REVIEW_NOTES_CATEGORY,
  QUALITY_REVIEW_NOTIFICATION_STATE_CATEGORY,
  QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY,
  type OTQualityReviewConfig
} from "../service/quality-review-service.js"

class MemoryDatabase {
  rows: { category: string; key: string; value: any }[] = []

  set(category: string, key: string, value: any) {
    const existing = this.rows.find((row) => row.category === category && row.key === key)
    if (existing) {
      existing.value = value
      return true
    }
    this.rows.push({ category, key, value })
    return false
  }

  get(category: string, key: string) {
    return this.rows.find((row) => row.category === category && row.key === key)?.value
  }

  getCategory(category: string) {
    return this.rows
      .filter((row) => row.category === category)
      .map((row) => ({ key: row.key, value: row.value }))
  }
}

function createService(options: {
  now?: () => number
  fetchAsset?: (url: string) => Promise<Response>
  config?: Partial<OTQualityReviewConfig>
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-quality-review-"))
  let nextId = 1
  const database = new MemoryDatabase()
  const service = new OTQualityReviewService({
    database,
    assetRoot: path.join(root, "runtime", "ot-quality-review", "assets"),
    now: options.now || (() => 1710000000000),
    randomId: () => `uuid-${nextId++}`,
    fetchAsset: options.fetchAsset || (async () => new Response(Buffer.from("mirrored"), {
      headers: {
        "content-length": "8",
        "content-type": "image/png"
      }
    })),
    config: options.config
  })
  return { root, database, service }
}

function qualityReviewCase(overrides: Record<string, unknown> = {}) {
  return {
    ticketId: "ticket-1",
    stored: true,
    state: "unreviewed",
    ownerUserId: null,
    createdAt: 0,
    updatedAt: 0,
    resolvedAt: null,
    lastSignalAt: 0,
    noteCount: 0,
    rawFeedbackStatus: "none",
    latestRawFeedbackSessionId: null,
    ...overrides
  } as any
}

function notificationDelivery(messages: Array<{ targetId: string; content: string; allowedMentions: unknown }>, targetOverrides: Record<string, unknown> = {}) {
  return {
    expectedGuildId: "guild-1",
    async resolveTarget(channelId: string) {
      return {
        id: channelId,
        guildId: "guild-1",
        kind: "text",
        canView: true,
        canSend: true,
        send: async (payload: { content: string; allowedMentions: unknown }) => {
          messages.push({ targetId: channelId, content: payload.content, allowedMentions: payload.allowedMentions })
        },
        ...targetOverrides
      } as any
    }
  }
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    session: {
      sessionId: "session-1",
      ticketId: "ticket-1",
      triggerMode: "close",
      status: "completed",
      completedAt: 1710000000000,
      respondentUserId: "creator-1",
      closeCountAtTrigger: 2,
      ...overrides
    },
    responses: [
      { label: "Freeform", type: "text", answer: "raw private comment" },
      { label: "Rating", type: "rating", answer: "4" },
      { label: "Choice", type: "choice", choices: ["Good", "Bad"], answer: "Good" },
      { label: "Screenshot", type: "image", answer: { url: "https://cdn.discordapp.invalid/secret.png", name: "../../secret.png", contentType: "image/png", size: 8 } }
    ]
  }
}

test("raw feedback capture stores answered values and mirrors accepted assets without persisting source URLs", async (t) => {
  const { root, database, service } = createService()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const record = await service.captureFeedbackPayload(payload())

  assert.ok(record)
  assert.equal(record?.sessionId, "session-1")
  assert.equal(record?.storageStatus, "available")
  assert.equal(record?.answers[0].textValue, "raw private comment")
  assert.equal(record?.answers[1].ratingValue, 4)
  assert.equal(record?.answers[2].choiceIndex, 0)
  assert.equal(record?.answers[3].assets[0].captureStatus, "mirrored")
  assert.equal(record?.answers[3].assets[0].fileName, "uuid-1.png")
  assert.doesNotMatch(JSON.stringify(record), /cdn\.discordapp|secret\.png|\.\./)
  assert.equal(database.rows[0].category, QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY)

  const asset = await service.resolveQualityReviewAsset("ticket-1", "session-1", "uuid-1")
  assert.equal(asset.status, "available")
  assert.ok(asset.filePath)
  assert.equal(fs.existsSync(String(asset.filePath)), true)
})

test("ignored sessions stay telemetry-only and partial mirror failures preserve raw text", async (t) => {
  const { root, database, service } = createService({
    fetchAsset: async () => {
      throw new Error("network included https://cdn.discordapp.invalid/secret.png")
    }
  })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  assert.equal(await service.captureFeedbackPayload(payload({ status: "ignored" })), null)
  assert.equal(database.rows.length, 0)

  const record = await service.captureFeedbackPayload(payload())
  assert.equal(record?.storageStatus, "partial")
  assert.equal(record?.answers[0].textValue, "raw private comment")
  assert.equal(record?.answers[3].assets[0].captureStatus, "failed")
  assert.doesNotMatch(JSON.stringify(record), /cdn\.discordapp|network included/)
})

test("retention expiry removes mirrored files and blanks raw text without deleting cases or notes", async (t) => {
  let now = 1000
  const { root, database, service } = createService({
    now: () => now,
    config: { rawFeedbackRetentionDays: 1 }
  })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  await service.captureFeedbackPayload(payload({ completedAt: now }))
  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "set-state",
    actorUserId: "admin-1",
    state: "in_review",
    lastSignalAt: now
  })
  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "add-note",
    actorUserId: "admin-1",
    actorLabel: "Admin One",
    note: "Investigating",
    lastSignalAt: now
  })
  const before = await service.resolveQualityReviewAsset("ticket-1", "session-1", "uuid-1")
  assert.equal(before.status, "available")

  now += 2 * 24 * 60 * 60 * 1000
  assert.equal(await service.sweepExpiredRawFeedback(), 1)
  const expired = database.get(QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY, "session-1")
  assert.equal(expired.storageStatus, "expired")
  assert.equal(expired.answers[0].textValue, null)
  assert.equal(expired.answers[3].assets[0].captureStatus, "expired")
  assert.equal(fs.existsSync(String(before.filePath)), false)
  assert.equal(database.getCategory(QUALITY_REVIEW_CASES_CATEGORY).length, 1)
  assert.equal(database.getCategory(QUALITY_REVIEW_NOTES_CATEGORY).length, 1)
  assert.equal((await service.resolveQualityReviewAsset("ticket-1", "session-1", "uuid-1")).status, "expired")
})

test("case actions create durable state and resolved cases reset when newer signals arrive", async (t) => {
  const { root, service } = createService()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "assign-owner",
    actorUserId: "admin-1",
    ownerUserId: "admin-2",
    firstKnownAt: 100,
    lastSignalAt: 200
  })
  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "set-state",
    actorUserId: "admin-1",
    state: "in_review",
    firstKnownAt: 100,
    lastSignalAt: 200
  })
  const bareResolved = await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "set-state",
    actorUserId: "admin-1",
    state: "resolved",
    firstKnownAt: 100,
    lastSignalAt: 200
  })
  assert.equal(bareResolved.ok, false)
  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "resolve-with-outcome",
    actorUserId: "admin-1",
    resolutionOutcome: "action_taken",
    firstKnownAt: 100,
    lastSignalAt: 200
  })

  const current = await service.listDashboardQualityReviewCases({
    tickets: [{ ticketId: "ticket-1", firstKnownAt: 100, lastSignalAt: 200, latestCompletedAnsweredSessionId: null }]
  })
  assert.equal(current.cases[0].state, "resolved")
  assert.equal(current.cases[0].resolutionOutcome, "action_taken")
  assert.equal(current.cases[0].resolvedByUserId, "admin-1")
  assert.equal(current.cases[0].ownerUserId, "admin-2")

  const reset = await service.listDashboardQualityReviewCases({
    tickets: [{ ticketId: "ticket-1", firstKnownAt: 100, lastSignalAt: 1710000001000, latestCompletedAnsweredSessionId: null }]
  })
  assert.equal(reset.cases[0].state, "unreviewed")
  assert.equal(reset.cases[0].resolutionOutcome, null)
  assert.equal(reset.cases[0].resolvedByUserId, null)
  assert.equal(reset.cases[0].ownerUserId, null)
})

test("note adjustments append audited correction and redaction records without mutating original notes", async (t) => {
  const { root, database, service } = createService()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "add-note",
    actorUserId: "admin-1",
    actorLabel: "Admin One",
    note: "Original private note",
    lastSignalAt: 100
  })
  const note = database.getCategory(QUALITY_REVIEW_NOTES_CATEGORY)[0].value
  const wrongTicket = await service.runDashboardQualityReviewAction({
    ticketId: "ticket-2",
    action: "correct-note",
    actorUserId: "admin-1",
    actorLabel: "Admin One",
    noteId: note.noteId,
    reason: "Wrong case",
    replacementBody: "Should not land"
  })
  assert.equal(wrongTicket.ok, false)

  const corrected = await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "correct-note",
    actorUserId: "admin-1",
    actorLabel: "Admin One",
    noteId: note.noteId,
    reason: "Tone correction",
    replacementBody: "Corrected note"
  })
  assert.equal(corrected.ok, true)
  let detail = await service.getDashboardQualityReviewCase("ticket-1", { lastSignalAt: 100 })
  assert.equal(detail?.notes[0].body, "Corrected note")
  assert.equal(detail?.notes[0].latestAdjustment?.mode, "corrected")
  assert.equal(database.get(QUALITY_REVIEW_NOTES_CATEGORY, note.noteId).body, "Original private note")

  const redacted = await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "redact-note",
    actorUserId: "admin-1",
    actorLabel: "Admin One",
    noteId: note.noteId,
    reason: "Contains private data"
  })
  assert.equal(redacted.ok, true)
  detail = await service.getDashboardQualityReviewCase("ticket-1", { lastSignalAt: 100 })
  assert.equal(detail?.notes[0].body, "[Redacted quality review note]")
  assert.equal(detail?.notes[0].latestAdjustment?.mode, "redacted")
  assert.equal(detail?.notes[0].adjustmentHistory?.length, 2)
  assert.equal(detail?.noteAdjustmentCount, 2)
  assert.equal(database.getCategory(QUALITY_REVIEW_NOTE_ADJUSTMENTS_CATEGORY).length, 2)
  assert.equal(database.get(QUALITY_REVIEW_NOTES_CATEGORY, note.noteId).body, "Original private note")
})

test("asset resolution rejects traversal paths even when storage is tampered", async (t) => {
  const { root, database, service } = createService()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await service.captureFeedbackPayload(payload())
  const stored = database.get(QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY, "session-1")
  stored.answers[3].assets[0].relativePath = "../outside.txt"

  const result = await service.resolveQualityReviewAsset("ticket-1", "session-1", "uuid-1")
  assert.equal(result.status, "missing")
})

test("asset resolution rejects symlink escapes even when storage is tampered", async (t) => {
  const { root, database, service } = createService()
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ot-quality-review-outside-"))
  const linkDir = path.join(root, "runtime", "ot-quality-review", "assets", "ticket-1", "session-1", "escaped")
  t.after(() => {
    try {
      fs.unlinkSync(linkDir)
    } catch {
      try {
        fs.rmdirSync(linkDir)
      } catch {}
    }
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outsideRoot, { recursive: true, force: true })
  })

  await service.captureFeedbackPayload(payload())
  fs.writeFileSync(path.join(outsideRoot, "outside.txt"), "escaped", "utf8")
  fs.mkdirSync(path.dirname(linkDir), { recursive: true })
  try {
    fs.symlinkSync(outsideRoot, linkDir, process.platform === "win32" ? "junction" : "dir")
  } catch {
    t.skip("symlink support unavailable")
    return
  }

  const stored = database.get(QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY, "session-1")
  stored.answers[3].assets[0].relativePath = "ticket-1/session-1/escaped/outside.txt"

  const result = await service.resolveQualityReviewAsset("ticket-1", "session-1", "uuid-1")
  assert.equal(result.status, "missing")
})

test("notification cycle is disabled by default and does not create reminder state", async (t) => {
  const { root, database, service } = createService()
  const messages: Array<{ targetId: string; content: string; allowedMentions: unknown }> = []
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const result = await service.runNotificationCycle({
    now: Date.parse("2026-04-28T14:00:00.000Z"),
    cases: [qualityReviewCase({ lastSignalAt: Date.parse("2026-04-20T14:00:00.000Z") })],
    delivery: notificationDelivery(messages)
  })

  assert.equal(result.sentReminderCount, 0)
  assert.equal(result.digestDelivered, false)
  assert.equal(result.digestSkippedReason, "notifications_disabled")
  assert.equal(messages.length, 0)
  assert.equal(database.getCategory(QUALITY_REVIEW_NOTIFICATION_STATE_CATEGORY).length, 0)
})

test("reminder scan sends summary-only overdue reminders and honors cooldown", async (t) => {
  const now = Date.parse("2026-04-28T14:00:00.000Z")
  const { root, database, service } = createService({
    config: {
      notificationsEnabled: true,
      deliveryChannelIds: ["123456789012345678"],
      overdueReminderCooldownHours: 24
    }
  })
  const messages: Array<{ targetId: string; content: string; allowedMentions: unknown }> = []
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const result = await service.runReminderScan({
    now,
    queueHref: "https://dashboard.invalid/dash/admin/quality-review",
    cases: [
      qualityReviewCase({
        ticketId: "ticket-overdue",
        ownerUserId: "owner-1",
        lastSignalAt: now - 73 * 60 * 60 * 1000,
        updatedAt: now - 73 * 60 * 60 * 1000
      }),
      qualityReviewCase({
        ticketId: "ticket-fresh",
        lastSignalAt: now - 60 * 60 * 1000,
        updatedAt: now - 60 * 60 * 1000
      }),
      qualityReviewCase({
        ticketId: "ticket-resolved",
        state: "resolved",
        resolvedAt: now - 60 * 60 * 1000,
        lastSignalAt: now - 100 * 60 * 60 * 1000,
        updatedAt: now - 100 * 60 * 60 * 1000
      })
    ],
    delivery: notificationDelivery(messages)
  })

  assert.equal(result.sentReminderCount, 1)
  assert.equal(messages.length, 1)
  assert.match(messages[0].content, /Quality review reminder/)
  assert.match(messages[0].content, /Ticket: ticket-overdue/)
  assert.match(messages[0].content, /Queue: https:\/\/dashboard\.invalid\/dash\/admin\/quality-review/)
  assert.doesNotMatch(messages[0].content, /raw private comment|Investigating|cdn\.discordapp|@everyone|@here|<@/)
  assert.deepEqual(messages[0].allowedMentions, { parse: [] })
  const state = database.get(QUALITY_REVIEW_NOTIFICATION_STATE_CATEGORY, "ticket-overdue")
  assert.equal(state.ticketId, "ticket-overdue")
  assert.equal(state.lastReminderAt, now)
  assert.equal(state.lastReminderOverdueKind, "unreviewed")

  const second = await service.runReminderScan({
    now: now + 60 * 60 * 1000,
    cases: [qualityReviewCase({ ticketId: "ticket-overdue", lastSignalAt: now - 73 * 60 * 60 * 1000, updatedAt: now - 73 * 60 * 60 * 1000 })],
    delivery: notificationDelivery(messages)
  })
  assert.equal(second.sentReminderCount, 0)
  assert.equal(messages.length, 1)
})

test("invalid notification targets fail closed without advancing digest state", async (t) => {
  const now = Date.parse("2026-04-28T14:00:00.000Z")
  const { root, database, service } = createService({
    config: {
      notificationsEnabled: true,
      deliveryChannelIds: ["123456789012345678"],
      digestEnabled: true,
      digestHourUtc: 14
    }
  })
  const messages: Array<{ targetId: string; content: string; allowedMentions: unknown }> = []
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const result = await service.runNotificationCycle({
    now,
    cases: [qualityReviewCase({ ticketId: "ticket-overdue", lastSignalAt: now - 73 * 60 * 60 * 1000, updatedAt: now - 73 * 60 * 60 * 1000 })],
    delivery: notificationDelivery(messages, { kind: "thread" })
  })

  assert.equal(result.validTargetCount, 0)
  assert.equal(result.sentReminderCount, 0)
  assert.equal(result.digestDelivered, false)
  assert.equal(result.digestSkippedReason, "no_valid_delivery_targets")
  assert.match(result.lastDeliveryError || "", /thread channels are not valid delivery targets/)
  assert.equal(messages.length, 0)
  assert.equal(database.get(QUALITY_REVIEW_NOTIFICATION_STATE_CATEGORY, "daily:2026-04-28"), undefined)
})

test("daily digest is global, deduped, bounded, and mention-inert", async (t) => {
  const now = Date.parse("2026-04-28T14:05:00.000Z")
  const { root, database, service } = createService({
    config: {
      notificationsEnabled: true,
      deliveryChannelIds: ["123456789012345678"],
      digestEnabled: true,
      digestHourUtc: 14,
      digestMaxTickets: 1
    }
  })
  const messages: Array<{ targetId: string; content: string; allowedMentions: unknown }> = []
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const cases = [
    qualityReviewCase({
      ticketId: "ticket-oldest",
      ownerLabel: "@everyone <@123>",
      ownerUserId: "123",
      lastSignalAt: now - 100 * 60 * 60 * 1000,
      updatedAt: now - 100 * 60 * 60 * 1000
    }),
    qualityReviewCase({
      ticketId: "ticket-newer",
      state: "in_review",
      ownerUserId: null,
      lastSignalAt: now - 200 * 60 * 60 * 1000,
      updatedAt: now - 169 * 60 * 60 * 1000
    }),
    qualityReviewCase({
      ticketId: "ticket-fresh",
      ownerUserId: null,
      lastSignalAt: now - 60 * 60 * 1000,
      updatedAt: now - 60 * 60 * 1000
    })
  ]

  const result = await service.runDigestScan({
    now,
    queueHref: "https://dashboard.invalid/dash/admin/quality-review",
    cases,
    delivery: notificationDelivery(messages)
  })

  assert.equal(result.digestDelivered, true)
  assert.equal(messages.length, 1)
  assert.match(messages[0].content, /Quality review daily digest 2026-04-28/)
  assert.match(messages[0].content, /Active: 3/)
  assert.match(messages[0].content, /Unassigned: 2/)
  assert.match(messages[0].content, /Overdue: 2/)
  assert.match(messages[0].content, /Overdue unreviewed: 1/)
  assert.match(messages[0].content, /Overdue in review: 1/)
  assert.match(messages[0].content, /ticket-oldest/)
  assert.doesNotMatch(messages[0].content, /ticket-newer|@everyone|@here|<@|raw private comment|cdn\.discordapp/)
  assert.deepEqual(messages[0].allowedMentions, { parse: [] })
  const digest = database.get(QUALITY_REVIEW_NOTIFICATION_STATE_CATEGORY, "daily:2026-04-28")
  assert.equal(digest.deliveredCount, 3)

  const second = await service.runDigestScan({
    now: now + 5 * 60 * 1000,
    cases,
    delivery: notificationDelivery(messages)
  })
  assert.equal(second.digestDelivered, false)
  assert.equal(second.digestSkippedReason, "already_delivered")
  assert.equal(messages.length, 1)
})
