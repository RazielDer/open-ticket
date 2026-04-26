import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import { OTAiAssistService, resolveKnowledgeSourcePath } from "../service/ai-assist-runtime.js"
import {
  REFERENCE_PROVIDER_MISSING_CONFIG_REASON,
  createReferenceAiAssistProvider
} from "../providers/reference-provider.js"

function runtimeDataSource(entries: Record<string, unknown>) {
  const data = new Map(Object.entries(entries).map(([id, value]) => [id, { value }]))
  return {
    exists(id: string) {
      return data.has(id)
    },
    get(id: string) {
      return data.get(id) || { value: undefined }
    }
  }
}

function ticket(profileId: string, optionProfileId = "drifted-option-profile") {
  return {
    id: { value: "ticket-1" },
    option: runtimeDataSource({
      "opendiscord:ai-assist-profile": optionProfileId
    }),
    ...runtimeDataSource({
      "opendiscord:ai-assist-profile": profileId,
      "opendiscord:opened-by": "creator-1",
      "opendiscord:opened-on": 1710000000000,
      "opendiscord:open": true,
      "opendiscord:closed": false,
      "opendiscord:topic": "Whitelist question",
      "opendiscord:participants": [{ type: "user", id: "staff-1" }]
    })
  }
}

function channel() {
  return {
    messages: {
      cache: [
        {
          id: "message-1",
          content: "I need help with the rules password.",
          createdTimestamp: 1710000001000,
          author: { id: "creator-1", username: "Creator", bot: false },
          attachments: new Map([
            ["a", { name: "proof.png" }],
            ["b", { attachment: "https://cdn.discordapp.invalid/attachments/ticket-1/secret.png" }]
          ])
        },
        {
          id: "message-2",
          content: "Bot message should be excluded.",
          createdTimestamp: 1710000002000,
          author: { id: "bot-1", username: "Bot", bot: true },
          attachments: new Map()
        }
      ]
    }
  }
}

test("reference provider registers but fails closed without host env", async () => {
  const provider = createReferenceAiAssistProvider({})
  const result = await provider.summarize?.({
    profile: {
      id: "profile-1",
      providerId: "reference",
      label: "Reference",
      enabled: true,
      knowledgeSourceIds: [],
      context: {
        maxRecentMessages: 40,
        includeTicketMetadata: true,
        includeParticipants: true,
        includeManagedFormSnapshot: true,
        includeBotMessages: false
      },
      settings: {}
    },
    settings: {},
    ticket: {},
    channel: {},
    guild: {},
    actorUser: {},
    context: {
      messages: [],
      ticketMetadata: null,
      participants: [],
      managedFormAnswers: []
    },
    knowledge: [],
    request: { action: "summarize", prompt: null, instructions: null, source: "dashboard" }
  })

  assert.equal(result?.outcome, "unavailable")
  assert.equal(result?.degradedReason, REFERENCE_PROVIDER_MISSING_CONFIG_REASON)

  const service = new OTAiAssistService({
    projectRoot: process.cwd(),
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        {
          id: "profile-1",
          providerId: "reference",
          label: "Reference",
          enabled: true,
          knowledgeSourceIds: [],
          context: { maxRecentMessages: 40 },
          settings: {}
        }
      ]
      if (id === "opendiscord:knowledge-sources") return []
      return null
    },
    getProvider() {
      return provider
    }
  })
  const summary = service.getTicketAiAssistSummary({ ticket: ticket("profile-1") })
  assert.equal(summary?.available, false)
  assert.equal(summary?.reason, REFERENCE_PROVIDER_MISSING_CONFIG_REASON)
})

test("reference provider rejects bearer-shaped profile settings", () => {
  const provider = createReferenceAiAssistProvider({})
  assert.throws(() => provider.validateProfileSettings?.({
    profile: {
      id: "profile-1",
      providerId: "reference",
      label: "Reference",
      enabled: true,
      knowledgeSourceIds: [],
      context: {
        maxRecentMessages: 40,
        includeTicketMetadata: true,
        includeParticipants: true,
        includeManagedFormSnapshot: true,
        includeBotMessages: false
      },
      settings: { bearer: "must-not-be-here" }
    },
    settings: { bearer: "must-not-be-here" },
    referencedByOptionIds: [],
    knowledgeSources: []
  }), /secret-shaped key/i)
})

test("AI assist service uses stored ticket profile, reads local FAQ knowledge, and excludes bot messages", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-ai-assist-"))
  fs.mkdirSync(path.join(root, "knowledge"), { recursive: true })
  fs.writeFileSync(path.join(root, "knowledge", "faq.json"), JSON.stringify([
    { id: "rules-password", question: "rules password", aliases: ["password"], answer: "The rules password is in the rules channel." }
  ]), "utf8")

  const provider = createReferenceAiAssistProvider({
    OT_AI_ASSIST_REFERENCE_API_KEY: "test-key",
    OT_AI_ASSIST_REFERENCE_MODEL: "test-model"
  })
  let contextMessagesSeen: any[] = []
  const service = new OTAiAssistService({
    projectRoot: root,
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        {
          id: "stored-profile",
          providerId: "reference",
          label: "Stored profile",
          enabled: true,
          knowledgeSourceIds: ["faq"],
          context: {
            maxRecentMessages: 40,
            includeTicketMetadata: true,
            includeParticipants: true,
            includeManagedFormSnapshot: true,
            includeBotMessages: false
          },
          settings: {}
        },
        {
          id: "drifted-option-profile",
          providerId: "reference",
          label: "Option drift",
          enabled: false,
          knowledgeSourceIds: [],
          context: { maxRecentMessages: 40 },
          settings: {}
        }
      ]
      if (id === "opendiscord:knowledge-sources") return [
        { id: "faq", label: "Staff FAQ", kind: "faq-json", path: "knowledge/faq.json", enabled: true }
      ]
      return null
    },
    getProvider() {
      return {
        ...provider,
        answerFaq(input) {
          contextMessagesSeen = input.context.messages
          return provider.answerFaq!(input)
        }
      }
    }
  })

  try {
    const summary = service.getTicketAiAssistSummary({ ticket: ticket("stored-profile") })
    assert.equal(summary?.profileId, "stored-profile")
    assert.equal(summary?.available, true)

    const result = await service.runTicketAiAssist({
      ticket: ticket("stored-profile"),
      channel: channel(),
      guild: {},
      actorUser: { id: "staff-1" },
      action: "answerFaq",
      source: "dashboard",
      prompt: "Where is the password?"
    })

    assert.equal(result.outcome, "success")
    assert.equal(result.answer, "The rules password is in the rules channel.")
    assert.equal(result.profileId, "stored-profile")
    assert.equal(result.providerId, "reference")
    assert.equal(contextMessagesSeen.length, 1)
    assert.deepEqual(contextMessagesSeen[0]?.attachmentFilenames, ["proof.png"])
    assert.equal(result.citations[0]?.sourceId, "faq")
    assert.equal(result.citations[0]?.locator, "knowledge/faq.json#rules-password")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("AI assist service strips low-confidence output text and citations", async () => {
  const service = new OTAiAssistService({
    projectRoot: process.cwd(),
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        {
          id: "profile-1",
          providerId: "probe",
          label: "Probe",
          enabled: true,
          knowledgeSourceIds: [],
          context: { maxRecentMessages: 40 },
          settings: {}
        }
      ]
      if (id === "opendiscord:knowledge-sources") return []
      return null
    },
    getProvider() {
      return {
        id: "probe",
        capabilities: ["suggestReply"],
        suggestReply() {
          return {
            outcome: "low-confidence",
            confidence: "low",
            draft: "do not render this draft",
            citations: [{ kind: "knowledge-source", sourceId: "faq", label: "FAQ", locator: "knowledge/faq.json#entry", excerpt: "do not render" }],
            degradedReason: "Low confidence.",
            warnings: []
          }
        }
      }
    }
  })

  const result = await service.runTicketAiAssist({
    ticket: ticket("profile-1"),
    channel: channel(),
    guild: {},
    actorUser: { id: "staff-1" },
    action: "suggestReply",
    source: "dashboard"
  })

  assert.equal(result.outcome, "low-confidence")
  assert.equal(result.draft, null)
  assert.deepEqual(result.citations, [])
  assert.equal(result.degradedReason, "Low confidence.")
})

test("AI assist service strips summarize prompt and instructions before provider dispatch", async () => {
  let requestSeen: any = null
  const service = new OTAiAssistService({
    projectRoot: process.cwd(),
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        {
          id: "profile-1",
          providerId: "probe",
          label: "Probe",
          enabled: true,
          knowledgeSourceIds: [],
          context: { maxRecentMessages: 40 },
          settings: {}
        }
      ]
      if (id === "opendiscord:knowledge-sources") return []
      return null
    },
    getProvider() {
      return {
        id: "probe",
        capabilities: ["summarize"],
        summarize(input) {
          requestSeen = input.request
          return { outcome: "success", confidence: "high", summary: "ok", citations: [], degradedReason: null, warnings: [] }
        }
      }
    }
  })

  const result = await service.runTicketAiAssist({
    ticket: ticket("profile-1"),
    channel: channel(),
    guild: {},
    actorUser: { id: "staff-1" },
    action: "summarize",
    source: "dashboard",
    prompt: "unexpected prompt",
    instructions: "unexpected instructions"
  })

  assert.equal(result.outcome, "success")
  assert.deepEqual(requestSeen, {
    action: "summarize",
    prompt: null,
    instructions: null,
    source: "dashboard"
  })
})

test("AI assist service sanitizes provider exceptions before returning results", async () => {
  const service = new OTAiAssistService({
    projectRoot: process.cwd(),
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        {
          id: "profile-1",
          providerId: "probe",
          label: "Probe",
          enabled: true,
          knowledgeSourceIds: [],
          context: { maxRecentMessages: 40 },
          settings: {}
        }
      ]
      if (id === "opendiscord:knowledge-sources") return []
      return null
    },
    getProvider() {
      return {
        id: "probe",
        capabilities: ["summarize"],
        summarize() {
          throw new Error("raw provider response contained secret prompt text")
        }
      }
    }
  })

  const result = await service.runTicketAiAssist({
    ticket: ticket("profile-1"),
    channel: channel(),
    guild: {},
    actorUser: { id: "staff-1" },
    action: "summarize",
    source: "dashboard"
  })

  assert.equal(result.outcome, "provider-error")
  assert.equal(result.degradedReason, "AI assist provider returned an error.")
  assert.doesNotMatch(JSON.stringify(result), /secret prompt text|raw provider response/)
})

test("FAQ assist fails closed without resolved local knowledge and does not dispatch provider", async () => {
  let called = false
  const service = new OTAiAssistService({
    projectRoot: process.cwd(),
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        {
          id: "profile-1",
          providerId: "probe",
          label: "Probe",
          enabled: true,
          knowledgeSourceIds: [],
          context: { maxRecentMessages: 40 },
          settings: {}
        }
      ]
      if (id === "opendiscord:knowledge-sources") return []
      return null
    },
    getProvider() {
      return {
        id: "probe",
        capabilities: ["answerFaq"],
        answerFaq() {
          called = true
          return { outcome: "success", confidence: "high", answer: "ungrounded answer", citations: [], degradedReason: null, warnings: [] }
        }
      }
    }
  })

  const result = await service.runTicketAiAssist({
    ticket: ticket("profile-1"),
    channel: channel(),
    guild: {},
    actorUser: { id: "staff-1" },
    action: "answerFaq",
    source: "dashboard",
    prompt: "question"
  })

  assert.equal(called, false)
  assert.equal(result.outcome, "unavailable")
  assert.equal(result.answer, null)
  assert.match(result.degradedReason || "", /enabled local knowledge source/i)
})

test("FAQ assist rejects blank and unmatched prompts without falling back to the first entry", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-ai-assist-faq-match-"))
  fs.mkdirSync(path.join(root, "knowledge"), { recursive: true })
  fs.writeFileSync(path.join(root, "knowledge", "faq.json"), JSON.stringify([
    { id: "rules-password", question: "rules password", aliases: ["password"], answer: "The rules password is in the rules channel." }
  ]), "utf8")

  let called = false
  const service = new OTAiAssistService({
    projectRoot: root,
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        {
          id: "profile-1",
          providerId: "probe",
          label: "Probe",
          enabled: true,
          knowledgeSourceIds: ["faq"],
          context: { maxRecentMessages: 40 },
          settings: {}
        }
      ]
      if (id === "opendiscord:knowledge-sources") return [
        { id: "faq", label: "FAQ", kind: "faq-json", path: "knowledge/faq.json", enabled: true }
      ]
      return null
    },
    getProvider() {
      return {
        id: "probe",
        capabilities: ["answerFaq"],
        answerFaq() {
          called = true
          return { outcome: "success", confidence: "high", answer: "should not dispatch", citations: [], degradedReason: null, warnings: [] }
        }
      }
    }
  })

  try {
    const blank = await service.runTicketAiAssist({
      ticket: ticket("profile-1"),
      channel: channel(),
      guild: {},
      actorUser: { id: "staff-1" },
      action: "answerFaq",
      source: "dashboard",
      prompt: "   "
    })
    const unmatched = await service.runTicketAiAssist({
      ticket: ticket("profile-1"),
      channel: channel(),
      guild: {},
      actorUser: { id: "staff-1" },
      action: "answerFaq",
      source: "dashboard",
      prompt: "unrelated billing question"
    })

    assert.equal(called, false)
    assert.equal(blank.outcome, "unavailable")
    assert.match(blank.degradedReason || "", /requires a question/i)
    assert.equal(unmatched.outcome, "unavailable")
    assert.equal(unmatched.answer, null)
    assert.match(unmatched.degradedReason || "", /matching knowledge entry/i)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("malformed FAQ knowledge fails safely without breaking summarize", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-ai-assist-malformed-faq-"))
  fs.mkdirSync(path.join(root, "knowledge"), { recursive: true })
  fs.writeFileSync(path.join(root, "knowledge", "bad.json"), "{ not valid json", "utf8")

  let faqCalled = false
  const service = new OTAiAssistService({
    projectRoot: root,
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        {
          id: "profile-1",
          providerId: "probe",
          label: "Probe",
          enabled: true,
          knowledgeSourceIds: ["bad"],
          context: { maxRecentMessages: 40 },
          settings: {}
        }
      ]
      if (id === "opendiscord:knowledge-sources") return [
        { id: "bad", label: "Bad FAQ", kind: "faq-json", path: "knowledge/bad.json", enabled: true }
      ]
      return null
    },
    getProvider() {
      return {
        id: "probe",
        capabilities: ["summarize", "answerFaq"],
        summarize() {
          return { outcome: "success", confidence: "high", summary: "summary ok", citations: [], degradedReason: null, warnings: [] }
        },
        answerFaq() {
          faqCalled = true
          return { outcome: "success", confidence: "high", answer: "should not dispatch", citations: [], degradedReason: null, warnings: [] }
        }
      }
    }
  })

  try {
    const summary = await service.runTicketAiAssist({
      ticket: ticket("profile-1"),
      channel: channel(),
      guild: {},
      actorUser: { id: "staff-1" },
      action: "summarize",
      source: "dashboard"
    })
    const faq = await service.runTicketAiAssist({
      ticket: ticket("profile-1"),
      channel: channel(),
      guild: {},
      actorUser: { id: "staff-1" },
      action: "answerFaq",
      source: "dashboard",
      prompt: "rules password"
    })

    assert.equal(summary.outcome, "success")
    assert.equal(summary.summary, "summary ok")
    assert.deepEqual(summary.warnings, ["One or more configured knowledge sources could not be read."])
    assert.equal(faqCalled, false)
    assert.equal(faq.outcome, "unavailable")
    assert.equal(faq.answer, null)
    assert.equal(faq.degradedReason, "One or more configured knowledge sources could not be read.")
    assert.doesNotMatch(JSON.stringify(faq), /not valid json|SyntaxError/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("knowledge retrieval enforces excerpt budget and citation locators", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-ai-assist-budget-"))
  fs.mkdirSync(path.join(root, "knowledge"), { recursive: true })
  fs.writeFileSync(path.join(root, "knowledge", "faq.json"), JSON.stringify([
    { id: "long-entry", question: "long faq", answer: "a".repeat(1500) }
  ]), "utf8")
  fs.writeFileSync(path.join(root, "knowledge", "guide.md"), [
    "# Intro",
    "general intro",
    "## Install Steps",
    "install ".repeat(500),
    "## Other",
    "other text"
  ].join("\n"), "utf8")
  fs.writeFileSync(path.join(root, "knowledge", "extra-1.md"), "# Extra One\n" + "one ".repeat(600), "utf8")
  fs.writeFileSync(path.join(root, "knowledge", "extra-2.md"), "# Extra Two\n" + "two ".repeat(600), "utf8")
  fs.writeFileSync(path.join(root, "knowledge", "extra-3.md"), "# Extra Three\n" + "three ".repeat(600), "utf8")

  let seenKnowledge: any[] = []
  const service = new OTAiAssistService({
    projectRoot: root,
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        {
          id: "profile-1",
          providerId: "probe",
          label: "Probe",
          enabled: true,
          knowledgeSourceIds: ["faq", "guide", "extra-1", "extra-2", "extra-3"],
          context: { maxRecentMessages: 40 },
          settings: {}
        }
      ]
      if (id === "opendiscord:knowledge-sources") return [
        { id: "faq", label: "FAQ", kind: "faq-json", path: "knowledge/faq.json", enabled: true },
        { id: "guide", label: "Guide", kind: "markdown-file", path: "knowledge/guide.md", enabled: true },
        { id: "extra-1", label: "Extra 1", kind: "markdown-file", path: "knowledge/extra-1.md", enabled: true },
        { id: "extra-2", label: "Extra 2", kind: "markdown-file", path: "knowledge/extra-2.md", enabled: true },
        { id: "extra-3", label: "Extra 3", kind: "markdown-file", path: "knowledge/extra-3.md", enabled: true }
      ]
      return null
    },
    getProvider() {
      return {
        id: "probe",
        capabilities: ["answerFaq"],
        answerFaq(input) {
          seenKnowledge = input.knowledge
          return { outcome: "success", confidence: "high", answer: "ok", citations: [], degradedReason: null, warnings: [] }
        }
      }
    }
  })

  try {
    const result = await service.runTicketAiAssist({
      ticket: ticket("profile-1"),
      channel: channel(),
      guild: {},
      actorUser: { id: "staff-1" },
      action: "answerFaq",
      source: "dashboard",
      prompt: "long faq install"
    })

    assert.equal(result.outcome, "success")
    assert.equal(seenKnowledge.length, 4)
    assert.ok(seenKnowledge.reduce((total, entry) => total + entry.content.length, 0) <= 6000)
    assert.equal(seenKnowledge[0]?.locator, "knowledge/faq.json#long-entry")
    assert.ok(seenKnowledge[0]?.content.length <= 1200)
    assert.equal(seenKnowledge[1]?.locator, "knowledge/guide.md#install-steps")
    assert.equal(result.citations[0]?.locator, "knowledge/faq.json#long-entry")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("AI assist context defaults to forty messages and clamps below-contract values", async () => {
  const seenLimits: number[] = []
  const service = new OTAiAssistService({
    projectRoot: process.cwd(),
    getConfigData(id) {
      if (id === "opendiscord:ai-assist-profiles") return [
        { id: "default-profile", providerId: "probe", label: "Default", enabled: true, knowledgeSourceIds: [], context: {}, settings: {} },
        { id: "low-profile", providerId: "probe", label: "Low", enabled: true, knowledgeSourceIds: [], context: { maxRecentMessages: 1 }, settings: {} }
      ]
      if (id === "opendiscord:knowledge-sources") return []
      return null
    },
    getProvider() {
      return {
        id: "probe",
        capabilities: ["summarize"],
        summarize(input) {
          seenLimits.push(input.profile.context.maxRecentMessages)
          return { outcome: "success", confidence: "high", summary: "ok", citations: [], degradedReason: null, warnings: [] }
        }
      }
    }
  })

  await service.runTicketAiAssist({ ticket: ticket("default-profile"), channel: channel(), guild: {}, actorUser: { id: "staff-1" }, action: "summarize", source: "dashboard" })
  await service.runTicketAiAssist({ ticket: ticket("low-profile"), channel: channel(), guild: {}, actorUser: { id: "staff-1" }, action: "summarize", source: "dashboard" })

  assert.deepEqual(seenLimits, [40, 10])
})

test("knowledge source path guard rejects URLs, traversal, and absolute paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-ai-assist-path-"))
  fs.mkdirSync(path.join(root, "knowledge"), { recursive: true })
  const sourcePath = path.join(root, "knowledge", "safe.md")
  fs.writeFileSync(sourcePath, "safe", "utf8")

  try {
    assert.equal(resolveKnowledgeSourcePath(root, "knowledge/safe.md"), sourcePath)
    assert.throws(() => resolveKnowledgeSourcePath(root, "https://example.invalid/faq.md"), /local files/i)
    assert.throws(() => resolveKnowledgeSourcePath(root, "knowledge/../secret.md"), /may not contain/i)
    assert.throws(() => resolveKnowledgeSourcePath(root, sourcePath), /relative/i)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
