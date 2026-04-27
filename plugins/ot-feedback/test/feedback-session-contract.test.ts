import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"

import {
  completeFeedbackSession,
  createDeliveryFailedFeedbackSession,
  createFeedbackSession,
  feedbackResponsesContainAnswer
} from "../service/feedback-session.js"

test("feedback session helper mints the locked telemetry envelope before delivery", () => {
  const session = createFeedbackSession({
    ticketId: "ticket-1",
    triggerMode: "first-close-only",
    closeCountAtTrigger: 0,
    now: () => 1710000000000,
    randomId: () => "session-1"
  })

  assert.deepEqual(session, {
    sessionId: "session-1",
    ticketId: "ticket-1",
    triggerMode: "first-close-only",
    triggeredAt: 1710000000000,
    completedAt: null,
    status: "delivery_failed",
    respondentUserId: null,
    closeCountAtTrigger: 0
  })

  assert.equal(feedbackResponsesContainAnswer([{ answer: null }, { answer: undefined }]), false)
  assert.equal(feedbackResponsesContainAnswer([{ answer: "" }]), true)
})

test("feedback session helper distinguishes completed, ignored, and delivery-failed outcomes", () => {
  const base = createFeedbackSession({
    ticketId: "ticket-1",
    triggerMode: "close",
    closeCountAtTrigger: 2,
    now: () => 1000,
    randomId: () => "session-2"
  })

  assert.deepEqual(completeFeedbackSession(base, [], "creator-1", 2000), {
    ...base,
    completedAt: 2000,
    status: "ignored",
    respondentUserId: "creator-1"
  })

  assert.deepEqual(completeFeedbackSession(base, [{ answer: "5" }], "creator-1", 3000), {
    ...base,
    completedAt: 3000,
    status: "completed",
    respondentUserId: "creator-1"
  })

  assert.deepEqual(createDeliveryFailedFeedbackSession({ ...base, respondentUserId: "creator-1", completedAt: 2500, status: "completed" }), {
    ...base,
    completedAt: null,
    status: "delivery_failed",
    respondentUserId: null
  })
})

test("ot-feedback keeps the stable event id but emits the shared session payload", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "plugins", "ot-feedback", "index.ts"), "utf8")

  assert.match(source, /"ot-feedback:afterFeedback":api\.ODEvent_Default<\(payload:OTFeedbackAfterFeedbackPayload<OTFeedbackConfigAnsweredValidQuestion>\)/)
  assert.match(source, /emit\(\[\{session,responses\}\]\)/)
  assert.match(source, /config\.data\.trigger == "first-close-only" && closeCountAtTrigger === 0/)
  assert.doesNotMatch(source, /"ot-feedback:afterFeedback":api\.ODEvent_Default<\(responses:/)
  assert.doesNotMatch(source, /emit\(\[responses\]\)/)
})
