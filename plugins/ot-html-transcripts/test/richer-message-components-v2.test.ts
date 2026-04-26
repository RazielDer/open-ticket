import test from "node:test"
import assert from "node:assert/strict"
import * as discord from "discord.js"

import { ODTranscriptCollector } from "../../../src/core/api/openticket/transcript.js"

function buildFakeComponentsV2Message(): discord.Message<true> {
  const actionRow = new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
    new discord.ButtonBuilder()
      .setCustomId("od:approve-close-request")
      .setLabel("Approve")
      .setStyle(discord.ButtonStyle.Success)
  ).toJSON()

  return {
    guild: { id: "guild-1" },
    channel: { id: "channel-1" },
    id: "message-1",
    createdTimestamp: 123456,
    editedAt: null,
    type: discord.MessageType.Default,
    content: "",
    mentions: { everyone: false },
    flags: { has: () => false },
    author: {
      id: "bot-1",
      username: "Ticket Bot",
      displayName: "Ticket Bot",
      displayAvatarURL: () => "https://example.com/avatar.png",
      flags: null,
      system: false,
      bot: true
    },
    member: null,
    embeds: [],
    attachments: [],
    components: [
      {
        type: discord.ComponentType.Container,
        components: [
          {
            type: discord.ComponentType.TextDisplay,
            content: "## Whitelist Staff Review\nWaiting for staff review."
          },
          {
            type: discord.ComponentType.Separator,
            divider: true
          },
          {
            type: discord.ComponentType.TextDisplay,
            content: "**Case**\nTicket ref: `ot:123456789012345678`"
          }
        ]
      },
      actionRow
    ],
    reference: null,
    reactions: { cache: [] }
  } as unknown as discord.Message<true>
}

test("transcript collector preserves Components V2 text display copy and stock action rows", async () => {
  const collector = new ODTranscriptCollector({} as any, {} as any, {} as any)
  const [message] = await collector.convertMessagesToTranscriptData([buildFakeComponentsV2Message()])

  assert.match(message.content ?? "", /Whitelist Staff Review/)
  assert.match(message.content ?? "", /Ticket ref: `ot:123456789012345678`/)
  assert.equal(message.embeds.length, 0)
  assert.equal(message.components.length, 1)
  assert.equal(message.components[0].components[0].type, "button")
  assert.equal(message.components[0].components[0].id, "od:approve-close-request")
})
