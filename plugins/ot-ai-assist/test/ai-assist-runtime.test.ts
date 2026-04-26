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
          attachments: new Map([["a", { name: "proof.png" }]])
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
        maxRecentMessages: 25,
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
    request: { action: "summarize", prompt: null, instructions: null, source: "test" }
  })

  assert.equal(result?.outcome, "unavailable")
  assert.equal(result?.degradedReason, REFERENCE_PROVIDER_MISSING_CONFIG_REASON)
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
  const messagesSeen: number[] = []
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
            maxRecentMessages: 25,
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
          context: { maxRecentMessages: 25 },
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
          messagesSeen.push(input.context.messages.length)
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
    assert.deepEqual(messagesSeen, [1])
    assert.equal(result.citations[0]?.sourceId, "faq")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
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
