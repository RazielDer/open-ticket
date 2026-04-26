import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"
import * as discord from "discord.js"

import { ODId } from "../../../src/core/api/modules/base.js"
import { ODMessage, ODMessageInstance } from "../../../src/core/api/modules/builder.js"
import {
  OD_RICHER_MESSAGE_DISABLE_ENV,
  applyRicherMessageSurface,
  buildRicherMessagePayload,
  toRicherMessageEditPayload,
  withRicherMessageFlags
} from "../../../src/core/api/openticket/richer-message.js"

test("richer message helper converts embed and action row payloads to Components V2 while preserving action ids", () => {
  const embed = new discord.EmbedBuilder()
    .setTitle("Application")
    .setDescription("Submit the form when every required answer is ready.")
    .setColor(0x2563EB)
    .addFields({ name: "State", value: "Draft complete", inline: false })
  const row = new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
    new discord.ButtonBuilder()
      .setCustomId("ot-ticket-forms:start:form-instance-1")
      .setLabel("Continue Application")
      .setStyle(discord.ButtonStyle.Primary)
  )

  const payload = buildRicherMessagePayload({
    surfaceId: "ot-ticket-forms:start-form-message",
    embeds: [embed],
    actionRows: [row]
  })

  assert.ok(payload)
  assert.deepEqual(payload.flags, [discord.MessageFlags.IsComponentsV2])
  assert.equal(Object.hasOwn(payload, "content"), false)
  assert.equal(Object.hasOwn(payload, "embeds"), false)
  const components = payload.components as any[]
  assert.equal(components[0].type, discord.ComponentType.Container)
  assert.equal(components[0].accent_color, 0x2563EB)
  assert.equal(components[0].components[0].type, discord.ComponentType.TextDisplay)
  assert.match(components[0].components[0].content, /## Application/)
  assert.match(components[0].components[0].content, /\*\*State\*\*/)
  assert.equal(components[1].type, discord.ComponentType.ActionRow)
  assert.equal(components[1].components[0].custom_id, "ot-ticket-forms:start:form-instance-1")

  const editPayload = toRicherMessageEditPayload(payload)
  assert.equal(editPayload.content, null)
  assert.deepEqual(editPayload.embeds, [])
})

test("ODMessage richer adoption keeps the built legacy payload as the fallback path", async () => {
  const instance = new ODMessageInstance()
  instance.setEmbeds({
    id: new ODId("test:embed"),
    embed: new discord.EmbedBuilder()
      .setTitle("Close Request")
      .setDescription("A ticket close request is waiting for review.")
  })
  instance.addComponent({
    id: new ODId("test:approve"),
    component: new discord.ButtonBuilder()
      .setCustomId("od:approve-close-request")
      .setLabel("Approve")
      .setStyle(discord.ButtonStyle.Success)
  })

  assert.equal(applyRicherMessageSurface(instance, { surfaceId: "opendiscord:close-request-message" }), true)
  assert.equal(instance.data.embeds.length, 0)
  assert.equal(instance.data.components.length, 0)
  const payload = instance.data.additionalOptions as discord.MessageCreateOptions
  assert.deepEqual(payload.flags, [discord.MessageFlags.IsComponentsV2])
  const components = payload.components as any[]
  assert.equal(components[1].components[0].custom_id, "od:approve-close-request")

  const builder = new ODMessage<"test", Record<string, never>>("test:richer", (builtInstance) => {
    builtInstance.setContent("legacy content")
    builtInstance.setEmbeds({
      id: new ODId("test:compiled-embed"),
      embed: new discord.EmbedBuilder().setTitle("Compiled Layout")
    })
    applyRicherMessageSurface(builtInstance, { surfaceId: "test:richer" })
  })
  const built = await builder.build("test", {})
  assert.equal(Object.hasOwn(built.message, "content"), false)
  assert.equal(Object.hasOwn(built.message, "embeds"), false)

  const previousDisableValue = process.env[OD_RICHER_MESSAGE_DISABLE_ENV]
  process.env[OD_RICHER_MESSAGE_DISABLE_ENV] = "1"
  try {
    const fallbackInstance = new ODMessageInstance()
    fallbackInstance.setEmbeds({
      id: new ODId("test:fallback-embed"),
      embed: new discord.EmbedBuilder().setTitle("Legacy Layout")
    })
    assert.equal(applyRicherMessageSurface(fallbackInstance, { surfaceId: "opendiscord:awaiting-user-message" }), false)
    assert.equal(fallbackInstance.data.embeds.length, 1)
    assert.equal(fallbackInstance.data.components.length, 0)
    assert.equal((fallbackInstance.data.additionalOptions as discord.MessageCreateOptions).components, undefined)
  } finally {
    if (previousDisableValue == null) delete process.env[OD_RICHER_MESSAGE_DISABLE_ENV]
    else process.env[OD_RICHER_MESSAGE_DISABLE_ENV] = previousDisableValue
  }
})

test("responder payload normalization preserves Components V2 flags and clears legacy fields on edits", async () => {
  const builder = new ODMessage<"test", Record<string, never>>("test:richer-responder", (builtInstance) => {
    builtInstance.setContent("legacy content")
    builtInstance.setEmbeds({
      id: new ODId("test:compiled-embed"),
      embed: new discord.EmbedBuilder().setTitle("Compiled Layout")
    })
    applyRicherMessageSurface(builtInstance, { surfaceId: "opendiscord:close-request-message" })
  })

  const built = await builder.build("test", {})
  const createPayload = withRicherMessageFlags(built.message as discord.MessageCreateOptions, [discord.MessageFlags.Ephemeral])
  assert.deepEqual(createPayload.flags, [discord.MessageFlags.IsComponentsV2, discord.MessageFlags.Ephemeral])
  assert.equal(Object.hasOwn(createPayload, "content"), false)
  assert.equal(Object.hasOwn(createPayload, "embeds"), false)

  const editPayload = toRicherMessageEditPayload(built.message as discord.MessageCreateOptions, [discord.MessageFlags.Ephemeral])
  assert.deepEqual(editPayload.flags, [discord.MessageFlags.IsComponentsV2, discord.MessageFlags.Ephemeral])
  assert.equal(editPayload.content, null)
  assert.deepEqual(editPayload.embeds, [])

  const legacyEditPayload = toRicherMessageEditPayload({ content: "legacy" }, [discord.MessageFlags.Ephemeral])
  assert.deepEqual(legacyEditPayload.flags, [discord.MessageFlags.Ephemeral])
  assert.equal(legacyEditPayload.content, "legacy")
  assert.equal(Object.hasOwn(legacyEditPayload, "embeds"), false)

  assert.equal(Object.hasOwn(built.message, "content"), false)
  assert.equal(Object.hasOwn(built.message, "embeds"), false)
})

test("richer message adoption is limited to the approved SLICE-013A and SLICE-013B surfaces", () => {
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..")
  const formsSource = fs.readFileSync(path.join(repoRoot, "plugins", "ot-ticket-forms", "builders", "messageBuilders.ts"), "utf8")
  const startFormRuntimeSource = fs.readFileSync(path.join(repoRoot, "plugins", "ot-ticket-forms", "service", "start-form-runtime.ts"), "utf8")
  const sessionMessageRuntimeSource = fs.readFileSync(path.join(repoRoot, "plugins", "ot-ticket-forms", "service", "session-message-runtime.ts"), "utf8")
  const answersManagerSource = fs.readFileSync(path.join(repoRoot, "plugins", "ot-ticket-forms", "classes", "AnswersManager.ts"), "utf8")
  const followupsSource = fs.readFileSync(path.join(repoRoot, "plugins", "ot-followups", "index.ts"), "utf8")
  const coreMessageSource = fs.readFileSync(path.join(repoRoot, "src", "builders", "messages.ts"), "utf8")
  const bridgeSource = fs.readFileSync(path.join(repoRoot, "plugins", "ot-eotfs-bridge", "index.ts"), "utf8")
  const responderSource = fs.readFileSync(path.join(repoRoot, "src", "core", "api", "modules", "responder.ts"), "utf8")

  const formSurfaceIds = [...formsSource.matchAll(/surfaceId:\s*"([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(formSurfaceIds, [
    "ot-ticket-forms:start-form-message",
    "ot-ticket-forms:continue-message",
    "ot-ticket-forms:question-message",
    "ot-ticket-forms:answers-message"
  ])
  assert.equal(formSurfaceIds.includes("ot-ticket-forms:success-message"), false)

  const coreSurfaceIds = [...coreMessageSource.matchAll(/surfaceId:"([^"]+)"/g)].map((match) => match[1])
  assert.equal(coreSurfaceIds.includes("opendiscord:close-request-message"), true)
  assert.equal(coreSurfaceIds.includes("opendiscord:awaiting-user-message"), true)
  assert.equal(coreSurfaceIds.includes("opendiscord:ticket-message"), false)
  assert.equal(coreSurfaceIds.some((id) => id.includes("verifybar")), false)

  assert.match(bridgeSource, /surfaceId:\s*"ot-eotfs-bridge:whitelist-staff-review"/)
  assert.match(bridgeSource, /toRicherMessageEditPayload\(messagePayload\)/)
  assert.match(startFormRuntimeSource, /toRicherMessageEditPayload\(messagePayload\)/)
  assert.match(sessionMessageRuntimeSource, /withRicherMessageFlags\(/)
  assert.match(answersManagerSource, /toRicherMessageEditPayload\(builtMessage\.message as discord\.MessageCreateOptions\)/)
  assert.match(followupsSource, /surfaceId:\s*"ot-followups:message"/)
  assert.match(followupsSource, /followUpMessageRequiresLegacyPayload\(message\)/)
  assert.doesNotMatch(followupsSource, /builders\.buttons|builders\.dropdowns|addComponent\(/)
  assert.match(responderSource, /buildResponderEditPayload\(msg\)/)
  assert.match(responderSource, /toRicherMessageEditPayload\(msg\.message as discord\.MessageCreateOptions/)
  assert.doesNotMatch(responderSource, /Object\.assign\(msg\.message,\{flags:msgFlags\}\)/)
  assert.doesNotMatch(bridgeSource, /provider action form|generic provider action|provider-specific standalone/i)
})
