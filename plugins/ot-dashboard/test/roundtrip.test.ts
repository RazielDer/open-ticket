import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"

import { createConfigService } from "../server/config-service"
import { createBackupService } from "../server/backup-service"
import {
  clearTicketPlatformRuntimeApiForTests,
  installTicketPlatformRuntimeApi
} from "../../../src/core/api/openticket/ticket-platform.js"

const generalGlobalAdminIds = ["123456789012345678", "234567890123456789"]

function createFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-roundtrip-"))
  const configDir = path.join(root, "config")
  fs.mkdirSync(configDir, { recursive: true })

  fs.writeFileSync(path.join(configDir, "general.json"), JSON.stringify({
    token: "token",
    mainColor: "#ff0000",
    language: "simplified-chinese",
    prefix: "!ticket ",
    serverId: "guild",
    globalAdmins: [generalGlobalAdminIds[0]],
    slashCommands: true,
    textCommands: false,
    tokenFromENV: false,
    status: { enabled: true, type: "watching", mode: "online", text: "hello", state: "orbit" },
    system: {
      preferSlashOverText: true,
      sendErrorOnUnknownCommand: true,
      questionFieldsInCodeBlock: true,
      displayFieldsWithQuestions: false,
      showGlobalAdminsInPanelRoles: false,
      disableVerifyBars: false,
      useRedErrorEmbeds: true,
      alwaysShowReason: false,
      replyOnTicketCreation: false,
      replyOnReactionRole: true,
      askPriorityOnTicketCreation: false,
      removeParticipantsOnClose: true,
      disableAutocloseAfterReopen: true,
      autodeleteRequiresClosedTicket: true,
      adminOnlyDeleteWithoutTranscript: true,
      allowCloseBeforeMessage: false,
      allowCloseBeforeAdminMessage: true,
      useTranslatedConfigChecker: true,
      pinFirstTicketMessage: false,
      enableTicketClaimButtons: true,
      enableTicketCloseButtons: true,
      enableTicketPinButtons: true,
      enableTicketDeleteButtons: true,
      enableTicketActionWithReason: true,
      enableDeleteWithoutTranscript: true,
      emojiStyle: "before",
      pinEmoji: "📌",
      logs: { enabled: true, channel: "2" },
      limits: { enabled: true, globalMaximum: 100, userMaximum: 5 },
      channelTopic: {
        showOptionName: true,
        showOptionDescription: false,
        showOptionTopic: true,
        showPriority: false,
        showClosed: true,
        showClaimed: false,
        showPinned: false,
        showCreator: false,
        showParticipants: false
      },
      permissions: {
        help: "everyone",
        panel: "admin",
        ticket: "everyone",
        close: "admin",
        delete: "admin",
        reopen: "admin",
        claim: "admin",
        unclaim: "admin",
        pin: "admin",
        unpin: "admin",
        move: "admin",
        rename: "admin",
        add: "admin",
        remove: "admin",
        blacklist: "admin",
        stats: "everyone",
        clear: "admin",
        autoclose: "admin",
        autodelete: "admin",
        transfer: "admin",
        topic: "admin",
        priority: "admin"
      },
      messages: {
        creation: { dm: true, logs: true },
        closing: { dm: true, logs: true },
        deleting: { dm: true, logs: true },
        reopening: { dm: false, logs: true },
        claiming: { dm: false, logs: true },
        pinning: { dm: false, logs: true },
        adding: { dm: false, logs: true },
        removing: { dm: false, logs: true },
        renaming: { dm: false, logs: true },
        moving: { dm: true, logs: true },
        blacklisting: { dm: true, logs: true },
        transferring: { dm: true, logs: true },
        topicChange: { dm: false, logs: true },
        priorityChange: { dm: false, logs: true },
        reactionRole: { dm: false, logs: true }
      }
    }
  }, null, 2))

  fs.writeFileSync(path.join(configDir, "options.json"), JSON.stringify([
    {
      id: "option-1",
      name: "Whitelist Application Ticket",
      description: "Open this ticket.",
      type: "ticket",
      button: { emoji: "", label: "Whitelist Application Ticket", color: "green" },
      ticketAdmins: [],
      readonlyAdmins: [],
      allowCreationByBlacklistedUsers: false,
      questions: [],
      channel: {
        prefix: "whitelist-",
        suffix: "counter-fixed",
        category: "1",
        backupCategory: "2",
        closedCategory: "3",
        claimedCategory: [{ user: "4", category: "44" }],
        topic: "Open this ticket."
      },
      dmMessage: {
        enabled: true,
        text: "DM text",
        embed: {
          enabled: true,
          title: "DM title",
          description: "DM description",
          customColor: "",
          image: "",
          thumbnail: "",
          fields: [{ name: "DM retained", value: "DM field", inline: false }],
          timestamp: false
        }
      },
      ticketMessage: {
        enabled: true,
        text: "",
        embed: {
          enabled: true,
          title: "Whitelist Application Ticket",
          description: "Open this ticket.",
          fields: [{ name: "Retained", value: "Field", inline: false }]
        },
        ping: {
          "@here": true,
          "@everyone": false,
          custom: ["8"]
        }
      },
      autoclose: {
        enableInactiveHours: true,
        inactiveHours: 24,
        enableUserLeave: true,
        disableOnClaim: true
      },
      autodelete: {
        enableInactiveDays: true,
        inactiveDays: 7,
        enableUserLeave: false,
        disableOnClaim: true
      },
      integrationProfileId: "profile-1",
      aiAssistProfileId: "assist-1"
    },
    {
      id: "role-1",
      name: "Role option",
      description: "Assign a role.",
      type: "role",
      button: { emoji: "", label: "Role option", color: "blue" },
      roles: ["9"],
      mode: "add&remove",
      removeRolesOnAdd: [],
      addOnMemberJoin: false
    }
  ], null, 2))

  fs.writeFileSync(path.join(configDir, "panels.json"), JSON.stringify([
    {
      id: "panel-1",
      name: "HELP CENTER",
      dropdown: true,
      options: ["option-1"],
      text: "",
      embed: {
        enabled: true,
        title: "HELP CENTER",
        description: "Choose an option.",
        footer: "Retained footer",
        fields: [{ name: "Retained", value: "Field", inline: false }]
      },
      settings: {
        dropdownPlaceholder: "Open a ticket",
        enableMaxTicketsWarningInText: false,
        enableMaxTicketsWarningInEmbed: true,
        describeOptionsLayout: "normal",
        describeOptionsCustomTitle: "",
        describeOptionsInText: false,
        describeOptionsInEmbedFields: true,
        describeOptionsInEmbedDescription: false
      }
    }
  ], null, 2))

  fs.writeFileSync(path.join(configDir, "questions.json"), "[]\n")
  fs.writeFileSync(path.join(configDir, "ai-assist-profiles.json"), JSON.stringify([
    {
      id: "assist-1",
      providerId: "reference",
      label: "Reference assist",
      enabled: true,
      knowledgeSourceIds: ["faq-1"],
      context: {
        maxRecentMessages: 40,
        includeTicketMetadata: true,
        includeParticipants: true,
        includeManagedFormSnapshot: true,
        includeBotMessages: false
      },
      settings: {
        tone: "concise"
      }
    }
  ], null, 2))
  fs.writeFileSync(path.join(configDir, "knowledge-sources.json"), JSON.stringify([
    {
      id: "faq-1",
      label: "Staff FAQ",
      kind: "faq-json",
      path: "knowledge/staff-faq.json",
      enabled: false
    }
  ], null, 2))
  fs.writeFileSync(path.join(configDir, "integration-profiles.json"), JSON.stringify([
    {
      id: "profile-1",
      providerId: "test-provider",
      label: "Test profile",
      enabled: true,
      settings: {
        token: "test-secret-token",
        endpoint: "https://example.invalid/api"
      }
    }
  ], null, 2))
  fs.writeFileSync(path.join(configDir, "transcripts.json"), JSON.stringify({
    general: { enabled: true, enableChannel: true, enableCreatorDM: true, enableParticipantDM: false, enableActiveAdminDM: false, enableEveryAdminDM: false, channel: "1", mode: "html" },
    embedSettings: { customColor: "", listAllParticipants: false, includeTicketStats: false },
    textTranscriptStyle: {
      layout: "normal",
      includeStats: true,
      includeIds: false,
      includeEmbeds: true,
      includeFiles: true,
      includeBotMessages: true,
      fileMode: "channel-name",
      customFileName: "transcript"
    },
    htmlTranscriptStyle: {
      background: { enableCustomBackground: false, backgroundColor: "", backgroundImage: "" },
      header: { enableCustomHeader: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
      stats: { enableCustomStats: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
      favicon: { enableCustomFavicon: false, imageUrl: "https://example.com/favicon.png" }
    }
  }, null, 2))

  return root
}

test("visual save helpers preserve runtime-aligned values and nested option data", () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)

  try {
    service.saveGeneralForm({
      "status.type": "custom",
      "system.emojiStyle": "disabled"
    })

    service.saveOption({
      id: "option-1",
      name: "Updated option",
      description: "Edited description",
      type: "ticket",
      button: { label: "Updated option", emoji: "", color: "green" },
      integrationProfileId: "profile-1",
      aiAssistProfileId: "assist-1"
    }, 0)

    service.savePanel({
      id: "panel-1",
      name: "Updated panel",
      options: ["option-1"],
      dropdown: true
    }, 0)

    service.saveTranscriptsForm({
      "general.enabled": "on",
      "general.enableChannel": "on",
      "general.enableCreatorDM": "on",
      "general.enableParticipantDM": "",
      "general.enableActiveAdminDM": "",
      "general.enableEveryAdminDM": "",
      "general.channel": "1",
      "general.mode": "text",
      "embedSettings.customColor": "",
      "embedSettings.listAllParticipants": "",
      "embedSettings.includeTicketStats": "",
      "textTranscriptStyle.layout": "normal",
      "textTranscriptStyle.fileMode": "channel-id",
      "textTranscriptStyle.customFileName": "transcript",
      "textTranscriptStyle.includeStats": "on",
      "textTranscriptStyle.includeIds": "",
      "textTranscriptStyle.includeEmbeds": "on",
      "textTranscriptStyle.includeFiles": "on",
      "textTranscriptStyle.includeBotMessages": "on",
      "htmlTranscriptStyle.background.enableCustomBackground": "",
      "htmlTranscriptStyle.background.backgroundColor": "",
      "htmlTranscriptStyle.background.backgroundImage": "",
      "htmlTranscriptStyle.header.enableCustomHeader": "",
      "htmlTranscriptStyle.header.backgroundColor": "#202225",
      "htmlTranscriptStyle.header.decoColor": "#f8ba00",
      "htmlTranscriptStyle.header.textColor": "#ffffff",
      "htmlTranscriptStyle.stats.enableCustomStats": "",
      "htmlTranscriptStyle.stats.backgroundColor": "#202225",
      "htmlTranscriptStyle.stats.keyTextColor": "#737373",
      "htmlTranscriptStyle.stats.valueTextColor": "#ffffff",
      "htmlTranscriptStyle.stats.hideBackgroundColor": "#40444a",
      "htmlTranscriptStyle.stats.hideTextColor": "#ffffff",
      "htmlTranscriptStyle.favicon.enableCustomFavicon": "",
      "htmlTranscriptStyle.favicon.imageUrl": "https://example.com/favicon.png"
    })

    const general = service.readManagedJson<any>("general")
    const options = service.readManagedJson<any[]>("options")
    const panels = service.readManagedJson<any[]>("panels")
    const transcripts = service.readManagedJson<any>("transcripts")

    assert.equal(general.status.type, "custom")
    assert.equal(general.system.emojiStyle, "disabled")
    assert.equal(options[0].channel.suffix, "counter-fixed")
    assert.deepEqual(options[0].channel.claimedCategory, [{ user: "4", category: "44" }])
    assert.deepEqual(options[0].dmMessage.embed.fields, [{ name: "DM retained", value: "DM field", inline: false }])
    assert.deepEqual(options[0].ticketMessage.embed.fields, [{ name: "Retained", value: "Field", inline: false }])
    assert.deepEqual(options[0].ticketMessage.ping.custom, ["8"])
    assert.equal(options[0].autoclose.enableUserLeave, true)
    assert.equal(options[0].autodelete.disableOnClaim, true)
    assert.equal(options[0].integrationProfileId, "profile-1")
    assert.equal(options[0].aiAssistProfileId, "assist-1")
    assert.equal(panels[0].settings.describeOptionsLayout, "normal")
    assert.equal(panels[0].embed.footer, "Retained footer")
    assert.equal(transcripts.general.mode, "text")
    assert.equal(transcripts.textTranscriptStyle.fileMode, "channel-id")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("ticket option integration and AI assist profile bindings roundtrip, strip from non-ticket options, and validate references", () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)

  try {
    service.saveOption({
      id: "option-1",
      name: "Whitelist Application Ticket",
      description: "Open this ticket.",
      type: "ticket",
      button: { label: "Whitelist Application Ticket", emoji: "", color: "green" },
      integrationProfileId: "profile-1",
      aiAssistProfileId: "assist-1"
    }, 0)

    let options = service.readManagedJson<any[]>("options")
    assert.equal(options[0].integrationProfileId, "profile-1")
    assert.equal(options[0].aiAssistProfileId, "assist-1")

    assert.throws(() => {
      service.saveOption({
        id: "option-1",
        name: "Whitelist Application Ticket",
        description: "Open this ticket.",
        type: "ticket",
        button: { label: "Whitelist Application Ticket", emoji: "", color: "green" },
        integrationProfileId: "missing-profile",
        aiAssistProfileId: "assist-1"
      }, 0)
    }, /Unknown integration profile/i)

    assert.throws(() => {
      service.saveOption({
        id: "option-1",
        name: "Whitelist Application Ticket",
        description: "Open this ticket.",
        type: "ticket",
        button: { label: "Whitelist Application Ticket", emoji: "", color: "green" },
        integrationProfileId: "profile-1",
        aiAssistProfileId: "missing-assist"
      }, 0)
    }, /Unknown AI assist profile/i)

    service.saveOption({
      id: "role-1",
      type: "role",
      button: { emoji: "", label: "Role option", color: "blue" },
      integrationProfileId: "profile-1",
      aiAssistProfileId: "assist-1"
    }, 1)

    service.saveOption({
      id: "website-1",
      name: "Website option",
      description: "Open docs.",
      type: "website",
      button: { emoji: "🌐", label: "Website option" },
      url: "https://example.com/docs",
      integrationProfileId: "profile-1",
      aiAssistProfileId: "assist-1"
    }, -1)

    options = service.readManagedJson<any[]>("options")
    assert.equal("integrationProfileId" in options[1], false)
    assert.equal("integrationProfileId" in options[2], false)
    assert.equal("aiAssistProfileId" in options[1], false)
    assert.equal("aiAssistProfileId" in options[2], false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("integration profile backups redact provider secrets and restore preserves existing redacted secrets", () => {
  clearTicketPlatformRuntimeApiForTests()
  const runtime = installTicketPlatformRuntimeApi()
  runtime.registerIntegrationProvider({
    id: "test-provider",
    capabilities: [],
    secretSettingKeys: ["token"]
  })

  const root = createFixtureRoot()
  const service = createConfigService(root)
  const backupService = createBackupService(root, service)

  try {
    const backup = backupService.createBackup("redaction test", "test")
    const backupText = backupService.getBackupText(backup.id, "integration-profiles")

    assert.match(backupText, /__OPEN_TICKET_REDACTED_SECRET__/)
    assert.doesNotMatch(backupText, /test-secret-token/)
    assert.match(backupText, /https:\/\/example\.invalid\/api/)

    const redactedProfiles = JSON.parse(backupText)
    redactedProfiles[0].settings.endpoint = "https://example.invalid/restored"
    service.writeManagedJson("integration-profiles", redactedProfiles)

    const restored = service.readManagedJson<any[]>("integration-profiles")
    assert.equal(restored[0].settings.token, "test-secret-token")
    assert.equal(restored[0].settings.endpoint, "https://example.invalid/restored")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    clearTicketPlatformRuntimeApiForTests()
  }
})

test("AI assist profiles and knowledge sources reject secret settings and guarded deletes", () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)

  try {
    for (const secretKey of ["apiKey", "bearer"]) {
      assert.throws(() => {
        service.saveRawJson("ai-assist-profiles", JSON.stringify([
          {
            id: "assist-1",
            providerId: "reference",
            label: "Reference assist",
            enabled: true,
            knowledgeSourceIds: ["faq-1"],
            context: { maxRecentMessages: 40 },
            settings: { [secretKey]: "must-not-be-here" }
          }
        ]))
      }, /secret-shaped key/i)
    }

    assert.throws(() => {
      service.saveRawJson("knowledge-sources", JSON.stringify([]))
    }, /still reference it/i)

    assert.throws(() => {
      service.saveRawJson("ai-assist-profiles", JSON.stringify([]))
    }, /options still reference it/i)

    const backupText = service.readManagedBackupText("ai-assist-profiles")
    assert.match(backupText, /"settings": \{\s+"tone": "concise"\s+\}/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("general globalAdmins saves normalize quoted role IDs, clear on whitespace, and fail closed on invalid JSON", () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)
  const generalPath = path.join(root, "config", "general.json")

  try {
    service.saveGeneralForm({
      globalAdmins: JSON.stringify([
        ` ${generalGlobalAdminIds[0]} `,
        generalGlobalAdminIds[0],
        generalGlobalAdminIds[1]
      ])
    })

    let general = service.readManagedJson<any>("general")
    assert.deepEqual(general.globalAdmins, generalGlobalAdminIds)

    service.saveGeneralForm({
      globalAdmins: "   "
    })

    general = service.readManagedJson<any>("general")
    assert.deepEqual(general.globalAdmins, [])

    const beforeInvalidSave = fs.readFileSync(generalPath, "utf8")
    assert.throws(() => {
      service.saveGeneralForm({
        globalAdmins: `[\n  "${generalGlobalAdminIds[0]}",\n]`
      })
    }, /valid JSON/i)
    assert.equal(fs.readFileSync(generalPath, "utf8"), beforeInvalidSave)

    assert.throws(() => {
      service.saveGeneralForm({
        globalAdmins: `[${generalGlobalAdminIds[0]}]`
      })
    }, /quoted Discord role ID strings/i)
    assert.equal(fs.readFileSync(generalPath, "utf8"), beforeInvalidSave)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("general globalAdmins inspection repairs the known legacy split corruption shape only when safe", () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)

  try {
    const recovered = service.inspectGeneralGlobalAdmins([
      "[",
      ` "${generalGlobalAdminIds[0]}", `,
      `"${generalGlobalAdminIds[1]}",`,
      "]"
    ])
    assert.equal(recovered.mode, "legacy_recovered")
    assert.deepEqual(recovered.normalizedValue, generalGlobalAdminIds)
    assert.equal(recovered.draftText, JSON.stringify(generalGlobalAdminIds, null, 2))

    const invalidSaved = service.inspectGeneralGlobalAdmins({
      broken: true,
      ids: [generalGlobalAdminIds[0]]
    })
    assert.equal(invalidSaved.mode, "invalid_saved")
    assert.match(invalidSaved.draftText, /"broken": true/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("ticket option transcript routing roundtrips through the config service and non-ticket saves strip plugin-owned routing", () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)

  try {
    service.saveOption({
      id: "option-1",
      name: "Whitelist Application Ticket",
      description: "Open this ticket.",
      type: "ticket",
      button: { label: "Whitelist Application Ticket", emoji: "", color: "green" }
    }, 0)

    let options = service.readManagedJson<any[]>("options")
    assert.deepEqual(options[0].transcripts, {
      useGlobalDefault: true,
      channels: []
    })

    service.saveOption({
      id: "option-1",
      type: "ticket",
      button: { label: "Whitelist Application Ticket", emoji: "", color: "green" },
      transcripts: {
        useGlobalDefault: false,
        channels: ["123456789012345678", "123456789012345678", " 234567890123456789 "]
      }
    }, 0)

    options = service.readManagedJson<any[]>("options")
    assert.deepEqual(options[0].transcripts, {
      useGlobalDefault: false,
      channels: ["123456789012345678", "234567890123456789"]
    })

    service.saveOption({
      id: "role-1",
      type: "role",
      button: { emoji: "", label: "Role option", color: "blue" },
      transcripts: {
        useGlobalDefault: false,
        channels: ["999999999999999999"]
      }
    }, 1)

    options = service.readManagedJson<any[]>("options")
    assert.equal("transcripts" in options[1], false)

    service.saveOption({
      id: "website-1",
      name: "Website option",
      description: "Open docs.",
      type: "website",
      button: { emoji: "🌐", label: "Website option" },
      url: "https://example.com/docs",
      transcripts: {
        useGlobalDefault: false,
        channels: ["999999999999999999"]
      }
    }, -1)

    options = service.readManagedJson<any[]>("options")
    assert.equal("transcripts" in options[2], false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("ticket option workflow roundtrips, strips from non-ticket options, and validates timer ordering", () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)

  try {
    service.saveOption({
      id: "option-1",
      name: "Whitelist Application Ticket",
      description: "Open this ticket.",
      type: "ticket",
      button: { label: "Whitelist Application Ticket", emoji: "", color: "green" },
      workflow: {
        closeRequest: { enabled: true },
        awaitingUser: {
          enabled: true,
          reminderEnabled: true,
          reminderHours: 12,
          autoCloseEnabled: true,
          autoCloseHours: 36
        }
      }
    }, 0)

    let options = service.readManagedJson<any[]>("options")
    assert.deepEqual(options[0].workflow, {
      closeRequest: { enabled: true },
      awaitingUser: {
        enabled: true,
        reminderEnabled: true,
        reminderHours: 12,
        autoCloseEnabled: true,
        autoCloseHours: 36
      }
    })

    assert.throws(() => {
      service.saveOption({
        id: "option-1",
        type: "ticket",
        button: { label: "Whitelist Application Ticket", emoji: "", color: "green" },
        workflow: {
          closeRequest: { enabled: true },
          awaitingUser: {
            enabled: true,
            reminderEnabled: true,
            reminderHours: 24,
            autoCloseEnabled: true,
            autoCloseHours: 24
          }
        }
      }, 0)
    }, /autoCloseHours/)

    service.saveOption({
      id: "role-1",
      type: "role",
      button: { emoji: "", label: "Role option", color: "blue" },
      workflow: {
        closeRequest: { enabled: true },
        awaitingUser: { enabled: true }
      }
    }, 1)

    service.saveOption({
      id: "website-1",
      name: "Website option",
      description: "Open docs.",
      type: "website",
      button: { emoji: "🌐", label: "Website option" },
      url: "https://example.com/docs",
      workflow: {
        closeRequest: { enabled: true },
        awaitingUser: { enabled: true }
      }
    }, -1)

    options = service.readManagedJson<any[]>("options")
    assert.equal("workflow" in options[1], false)
    assert.equal("workflow" in options[2], false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("transcript HTML style normalization ignores preview-only helpers and keeps the persisted shape unchanged", () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)

  try {
    const savedTranscripts = service.readManagedJson<any>("transcripts")
    const normalized = service.normalizeTranscriptHtmlStyleDraft({
      ...savedTranscripts,
      transcriptPreviewAction: "refresh",
      transcriptPresetId: "midnight-cyan",
      transcriptEditorSection: "appearance",
      transcriptModeLabel: "HTML transcript",
      "htmlTranscriptStyle.header.backgroundColor": "#123456"
    }, savedTranscripts.htmlTranscriptStyle)

    assert.equal(normalized.background.backgroundColor, "#313338")
    assert.equal(normalized.header.backgroundColor, "#1e1f22")
    assert.equal(normalized.header.decoColor, "#5865f2")
    assert.equal(normalized.favicon.imageUrl, "")
    assert.equal("transcriptPreviewAction" in normalized, false)
    assert.equal("transcriptPresetId" in normalized, false)
    assert.equal("transcriptEditorSection" in normalized, false)
    assert.equal("transcriptModeLabel" in normalized, false)

    service.saveTranscriptsForm({
      "general.enabled": "on",
      "general.enableChannel": "on",
      "general.enableCreatorDM": "on",
      "general.enableParticipantDM": "",
      "general.enableActiveAdminDM": "",
      "general.enableEveryAdminDM": "",
      "general.channel": "1",
      "general.mode": "html",
      "embedSettings.customColor": "",
      "embedSettings.listAllParticipants": "",
      "embedSettings.includeTicketStats": "",
      "textTranscriptStyle.layout": "normal",
      "textTranscriptStyle.fileMode": "channel-name",
      "textTranscriptStyle.customFileName": "transcript",
      "textTranscriptStyle.includeStats": "on",
      "textTranscriptStyle.includeIds": "",
      "textTranscriptStyle.includeEmbeds": "on",
      "textTranscriptStyle.includeFiles": "on",
      "textTranscriptStyle.includeBotMessages": "on",
      "htmlTranscriptStyle.background.enableCustomBackground": "",
      "htmlTranscriptStyle.background.backgroundColor": "",
      "htmlTranscriptStyle.background.backgroundImage": "",
      "htmlTranscriptStyle.header.enableCustomHeader": "",
      "htmlTranscriptStyle.header.backgroundColor": "#123456",
      "htmlTranscriptStyle.header.decoColor": "#f8ba00",
      "htmlTranscriptStyle.header.textColor": "#ffffff",
      "htmlTranscriptStyle.stats.enableCustomStats": "",
      "htmlTranscriptStyle.stats.backgroundColor": "#202225",
      "htmlTranscriptStyle.stats.keyTextColor": "#737373",
      "htmlTranscriptStyle.stats.valueTextColor": "#ffffff",
      "htmlTranscriptStyle.stats.hideBackgroundColor": "#40444a",
      "htmlTranscriptStyle.stats.hideTextColor": "#ffffff",
      "htmlTranscriptStyle.favicon.enableCustomFavicon": "",
      "htmlTranscriptStyle.favicon.imageUrl": "https://example.com/favicon.png",
      transcriptPreviewAction: "refresh",
      transcriptPresetId: "ember-slate",
      transcriptEditorSection: "preview",
      transcriptModeLabel: "HTML transcript"
    })

    const persisted = service.readManagedJson<any>("transcripts")
    assert.equal(persisted.htmlTranscriptStyle.background.backgroundColor, "#313338")
    assert.equal(persisted.htmlTranscriptStyle.header.backgroundColor, "#1e1f22")
    assert.equal(persisted.htmlTranscriptStyle.header.decoColor, "#5865f2")
    assert.equal(persisted.htmlTranscriptStyle.favicon.imageUrl, "")
    assert.equal("transcriptPreviewAction" in persisted, false)
    assert.equal("transcriptPresetId" in persisted, false)
    assert.equal("transcriptEditorSection" in persisted, false)
    assert.equal("transcriptModeLabel" in persisted, false)
    assert.deepEqual(Object.keys(persisted.htmlTranscriptStyle).sort(), ["background", "favicon", "header", "stats"])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("dashboard config service rejects audited invalid values", () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)

  try {
    assert.throws(() => {
      service.saveGeneralForm({
        "status.type": "competing"
      })
    }, /Status type/)

    assert.throws(() => {
      service.saveTranscriptsForm({
        "general.mode": "txt"
      })
    }, /Transcript mode/)

    assert.throws(() => {
      service.saveOption({
        id: "option-1",
        name: "Updated option",
        type: "ticket",
        button: { label: "Updated option", emoji: "", color: "primary" }
      }, 0)
    }, /Button color/)

    assert.throws(() => {
      service.savePanel({
        id: "panel-1",
        name: "Updated panel",
        dropdown: true,
        options: ["role-1"]
      }, 0)
    }, /ticket options/)

    assert.throws(() => {
      service.saveQuestion({
        id: "bad id",
        name: "Valid question",
        type: "short",
        required: true,
        placeholder: "",
        length: {
          enabled: false,
          min: 0,
          max: 100
        }
      }, -1)
    }, /Question IDs/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
