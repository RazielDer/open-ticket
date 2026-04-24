import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import {
  PRIVATE_THREAD_ACCESS_WARNING,
  TICKET_OPTION_THREAD_PARENT_CHANNEL_ID,
  TICKET_OPTION_TRANSPORT_MODE_ID,
  buildTicketTransportMetadata,
  getTicketOptionTransportMode,
  getTicketUserParticipantIds,
  validatePrivateThreadOption,
  validateTicketMoveTransport
} from "../../../src/actions/ticketTransport.js"
import { ODTICKET_PLATFORM_METADATA_IDS } from "../../../src/core/api/openticket/ticket-platform.js"

function createOption(values: Record<string, unknown>) {
  return {
    exists(id: string) {
      return Object.prototype.hasOwnProperty.call(values, id)
    },
    get(id: string) {
      return { value: values[id] }
    }
  } as any
}

function createTicket(values: Record<string, unknown>) {
  return {
    get(id: string) {
      return { value: values[id] }
    }
  } as any
}

test("ticket option transport defaults to channel_text and private_thread requires a parent text channel", () => {
  const defaultOption = createOption({})
  const missingParentThreadOption = createOption({
    [TICKET_OPTION_TRANSPORT_MODE_ID]: "private_thread",
    [TICKET_OPTION_THREAD_PARENT_CHANNEL_ID]: ""
  })
  const validThreadOption = createOption({
    [TICKET_OPTION_TRANSPORT_MODE_ID]: "private_thread",
    [TICKET_OPTION_THREAD_PARENT_CHANNEL_ID]: "123456789012345678"
  })

  assert.equal(getTicketOptionTransportMode(defaultOption), "channel_text")
  assert.deepEqual(validatePrivateThreadOption(defaultOption), { valid: true })
  assert.equal(validatePrivateThreadOption(missingParentThreadOption).valid, false)
  assert.deepEqual(validatePrivateThreadOption(validThreadOption), { valid: true })
  assert.deepEqual(buildTicketTransportMetadata(validThreadOption, "123456789012345678"), {
    transportMode: "private_thread",
    transportParentChannelId: "123456789012345678",
    transportParentMessageId: null
  })
})

test("private-thread move validation rejects cross-transport and different-parent moves without mutating state", () => {
  const privateThreadTicket = createTicket({
    [ODTICKET_PLATFORM_METADATA_IDS.transportMode]: "private_thread",
    [ODTICKET_PLATFORM_METADATA_IDS.transportParentChannelId]: "parent-1"
  })
  const sameParentThreadOption = createOption({
    [TICKET_OPTION_TRANSPORT_MODE_ID]: "private_thread",
    [TICKET_OPTION_THREAD_PARENT_CHANNEL_ID]: "parent-1"
  })
  const differentParentThreadOption = createOption({
    [TICKET_OPTION_TRANSPORT_MODE_ID]: "private_thread",
    [TICKET_OPTION_THREAD_PARENT_CHANNEL_ID]: "parent-2"
  })
  const channelOption = createOption({
    [TICKET_OPTION_TRANSPORT_MODE_ID]: "channel_text"
  })

  assert.deepEqual(validateTicketMoveTransport(privateThreadTicket, sameParentThreadOption), { valid: true })
  assert.match((validateTicketMoveTransport(privateThreadTicket, differentParentThreadOption) as any).reason, /different threadParentChannel/i)
  assert.match((validateTicketMoveTransport(privateThreadTicket, channelOption) as any).reason, /across transport modes/i)
})

test("thread participant helpers keep creator and explicit user participants while ignoring roles", () => {
  const ticket = createTicket({
    "opendiscord:opened-by": "creator-1",
    "opendiscord:participants": [
      { type: "role", id: "staff-role-1" },
      { type: "user", id: "creator-1" },
      { type: "user", id: "participant-1" }
    ]
  })

  assert.deepEqual(getTicketUserParticipantIds(ticket), ["creator-1", "participant-1"])
})

test("slice 008 source contracts cover action branches, config warnings, cleaners, and permission registration", () => {
  const root = process.cwd()
  const read = (relativePath: string) => fs.readFileSync(path.resolve(root, relativePath), "utf8")
  const actionFiles = [
    "src/actions/createTicket.ts",
    "src/actions/claimTicket.ts",
    "src/actions/unclaimTicket.ts",
    "src/actions/closeTicket.ts",
    "src/actions/reopenTicket.ts",
    "src/actions/moveTicket.ts",
    "src/actions/transferTicket.ts",
    "src/actions/addTicketUser.ts",
    "src/actions/removeTicketUser.ts",
    "src/actions/updateTicketTopic.ts",
    "src/actions/updateTicketPriority.ts",
    "src/actions/deleteTicket.ts",
    "src/actions/pinTicket.ts",
    "src/actions/unpinTicket.ts",
    "src/actions/renameTicket.ts"
  ]

  for (const actionFile of actionFiles) {
    assert.equal(read(actionFile).includes("Open Ticket doesn't support threads"), false, actionFile)
  }

  const createTicket = read("src/actions/createTicket.ts")
  assert.equal(createTicket.includes("discord.ChannelType.PrivateThread"), true)
  assert.equal(createTicket.includes("invitable:false"), true)
  assert.equal(createTicket.includes("fetchGuildTextChannel(guild,threadParentChannelId)"), true)
  assert.equal(read("src/actions/ticketTransport.ts").includes("transportParentMessageId"), true)

  const closeTicket = read("src/actions/closeTicket.ts")
  assert.equal(closeTicket.includes("removePrivateThreadMembers"), true)
  assert.equal(closeTicket.includes("setLocked(true"), true)
  assert.equal(closeTicket.includes("setArchived(true"), true)

  const reopenTicket = read("src/actions/reopenTicket.ts")
  assert.equal(reopenTicket.includes("setArchived(false"), true)
  assert.equal(reopenTicket.includes("setLocked(false"), true)
  assert.equal(reopenTicket.includes("addPrivateThreadMembers"), true)

  const moveTicket = read("src/actions/moveTicket.ts")
  assert.equal(moveTicket.includes("validateTicketMoveTransport"), true)
  assert.equal(moveTicket.includes("PRIVATE_THREAD_ACCESS_WARNING"), true)

  assert.equal(read("src/actions/addTicketUser.ts").includes(".members.add(data.id)"), true)
  assert.equal(read("src/actions/removeTicketUser.ts").includes(".members.remove(data.id)"), true)
  assert.equal(read("src/actions/transferTicket.ts").includes(".members.add(newCreator.id)"), true)
  assert.equal(read("src/actions/updateTicketTopic.ts").includes("!channel.isThread() && channel instanceof discord.TextChannel"), true)
  assert.equal(read("src/actions/pinTicket.ts").includes("!channel.isThread() && channel.parent"), true)

  const checkerLoader = read("src/data/framework/checkerLoader.ts")
  assert.equal(checkerLoader.includes("opendiscord:ticket-channel-transport-mode"), true)
  assert.equal(checkerLoader.includes("opendiscord:ticket-channel-thread-parent-required"), true)
  assert.equal(checkerLoader.includes("opendiscord:ticket-channel-thread-ignores-category-routing"), true)
  assert.equal(checkerLoader.includes('"warning"'), true)

  const codeLoader = read("src/data/framework/codeLoader.ts")
  assert.equal(codeLoader.includes("fetchGuildTextBasedChannel(mainServer,ticket.key)"), true)
  assert.equal(codeLoader.includes('client.on("threadDelete"'), true)

  const permissionLoader = read("src/data/framework/permissionLoader.ts")
  assert.equal(permissionLoader.includes("fetchGuildTextBasedChannel(mainServer,ticket.id.value)"), true)

  assert.match(PRIVATE_THREAD_ACCESS_WARNING, /Manage Threads/)
})

test("dashboard runtime keeps private-thread tickets in the same ticket record model", () => {
  const root = process.cwd()
  const registrySource = fs.readFileSync(path.resolve(root, "plugins", "ot-dashboard", "server", "dashboard-runtime-registry.ts"), "utf8")

  assert.equal(registrySource.includes("transportMode: DashboardTicketTransportMode | null"), true)
  assert.equal(registrySource.includes("transportParentChannelId: string | null"), true)
  assert.equal(registrySource.includes("transportParentMessageId: string | null"), true)
  assert.equal(registrySource.includes("DashboardTicketActivityType"), true)
  assert.equal(registrySource.includes('"thread"'), false)
})
