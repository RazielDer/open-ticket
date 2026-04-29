import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

const projectRoot = path.resolve(__dirname, "..", "..", "..", "..")

test("admin route handlers keep redesign UI copy locale-backed", () => {
  const routeSource = fs.readFileSync(
    path.join(projectRoot, "plugins", "ot-dashboard", "server", "routes", "admin.ts"),
    "utf8"
  )

  for (const phrase of [
    "Draft review",
    "Pre-save review",
    "Fix the draft below and review again.",
    "Manifest review",
    "Plugin asset review",
    "This review patches only `enabled` and `priority` in `plugin.json`.",
    "The diff below compares the live plugin asset against the reviewed candidate.",
    "Restore this backup copy into the live plugin asset now?",
    "Created plugin backup",
    "The review token is missing or expired."
  ]) {
    assert.equal(routeSource.includes(phrase), false, `expected route source to avoid hardcoded phrase: ${phrase}`)
  }

  for (const localeCall of [
    'i18n.t("routeMessages.backupCreated"',
    'i18n.t("routeMessages.configReviewSubtitle")',
    'i18n.t("routeMessages.configRestoreSubtitle")',
    'i18n.t("routeMessages.manifestReviewSubtitle")',
    'i18n.t("routeMessages.manifestApplySuccess")',
    'i18n.t("routeMessages.pluginAssetReviewSubtitle")',
    'i18n.t("routeMessages.pluginAssetRestoreConfirm")',
    'i18n.t("routeMessages.pluginBackupCreated"',
    'i18n.t("routeMessages.reviewTokenExpired")'
  ]) {
    assert.equal(routeSource.includes(localeCall), true, `expected route source to use locale call: ${localeCall}`)
  }
})

test("transcript editor template and route model keep transcript copy locale-backed", () => {
  const pageRouteSource = fs.readFileSync(
    path.join(projectRoot, "plugins", "ot-dashboard", "server", "routes", "pages.ts"),
    "utf8"
  )
  const templateSource = fs.readFileSync(
    path.join(projectRoot, "plugins", "ot-dashboard", "public", "views", "config-transcripts.ejs"),
    "utf8"
  )

  for (const phrase of [
    "Enable transcripts",
    "Send to a channel",
    "Transcript channel ID",
    "Text transcript output",
    "HTML appearance",
    "Background color",
    "Apply preset",
    "Refresh preview",
    "Reset style to saved values"
  ]) {
    assert.equal(templateSource.includes(phrase), false, `expected transcript template to avoid hardcoded phrase: ${phrase}`)
  }

  for (const localeCall of [
    't("transcripts.editor.introTitle")',
    't("transcripts.editor.sections.delivery")',
    't("transcripts.editor.sections.preview")',
    't("transcripts.editor.sections.appearance")',
    '"transcripts.editor.fields.generalEnabled"',
    't("transcripts.editor.preview.body")',
    't("transcripts.editor.appearanceLockedTitle")',
    't("transcripts.editor.preview.unavailableTitle")'
  ]) {
    assert.equal(templateSource.includes(localeCall), true, `expected transcript template to use locale call: ${localeCall}`)
  }

  for (const routeSnippet of [
    "transcriptModeOptions",
    "transcriptTextLayoutOptions",
    "transcriptFileModeOptions",
    "transcriptEditorMessages",
    "i18n.t(`transcripts.editor.enums.mode.${value}`)",
    "i18n.t(`transcripts.editor.enums.textLayout.${value}`)",
    "i18n.t(`transcripts.editor.enums.fileMode.${value}`)",
    'i18n.t("transcripts.editor.preview.unavailableService")',
    'i18n.t("transcripts.editor.preview.unavailableError")'
  ]) {
    assert.equal(pageRouteSource.includes(routeSnippet), true, `expected transcript page route source to include: ${routeSnippet}`)
  }
})

test("ticket detail template and model keep extended operation copy locale-backed", () => {
  const templateSource = fs.readFileSync(
    path.join(projectRoot, "plugins", "ot-dashboard", "public", "views", "sections", "ticket-detail.ejs"),
    "utf8"
  )
  const modelSource = fs.readFileSync(
    path.join(projectRoot, "plugins", "ot-dashboard", "server", "ticket-workbench.ts"),
    "utf8"
  )
  const runtimeBridgeSource = fs.readFileSync(
    path.join(projectRoot, "plugins", "ot-dashboard", "server", "runtime-bridge.ts"),
    "utf8"
  )

  for (const phrase of [
    "<strong>Priority:</strong>",
    "<strong>Topic:</strong>",
    "Operator workflows",
    "Current creator:",
    "Original applicant:",
    "Pin, unpin, and freeform rename remain Discord-only actions in this packet.",
    "Original applicant authority remains with",
    "This ticket route has no same-owner same-transport move targets. Use escalate for ownership-transfer routes.",
    "Choose a same-owner same-transport move target before moving this ticket.",
    "Choose a valid move target before moving this ticket.",
    "Ticket moved.",
    "Choose a different eligible creator before transferring this ticket.",
    "Ticket creator transferred.",
    "Choose a valid user participant before updating this ticket.",
    "Selected user is already a participant.",
    "Selected user is not a participant.",
    "The current ticket creator cannot be removed as a participant.",
    "Ticket participant added.",
    "Ticket participant removed.",
    "Choose a valid priority before updating this ticket.",
    "Choose a configured Open Ticket priority before updating this ticket.",
    "Ticket priority updated.",
    "Enter a ticket topic before updating this ticket.",
    "Ticket topic updated.",
    "Pin this channel ticket through the Open Ticket runtime action.",
    "Unpin this channel ticket through the Open Ticket runtime action.",
    "Rename this ticket channel through the Open Ticket runtime action.",
    "Enter a ticket channel name before renaming this ticket.",
    "The Open Ticket rename action is unavailable in the current runtime."
  ]) {
    assert.equal(templateSource.includes(phrase) || modelSource.includes(phrase) || runtimeBridgeSource.includes(phrase), false, `expected ticket detail source to avoid hardcoded phrase: ${phrase}`)
  }

  for (const localeCall of [
    't("tickets.detail.operatorWorkflowsTitle")',
    't("tickets.detail.facts.priority")',
    't("tickets.detail.facts.topic")',
    't("tickets.detail.facts.currentCreator")',
    't("tickets.detail.facts.originalApplicant")',
    't(`tickets.detail.actionCopy.${key}.title`)',
    't("tickets.detail.actions.renameNameLabel")',
    't("tickets.detail.actions.renameNamePlaceholder")',
    '"tickets.detail.warnings.creatorTransfer"',
    '"tickets.detail.availability.noSameOwnerMoveTargets"',
    '"tickets.detail.availability.pinUnsupportedTransport"',
    '"tickets.detail.availability.ticketAlreadyPinned"',
    '"tickets.detail.availability.ticketNotPinned"',
    '"tickets.detail.availability.renameUnavailable"',
    '"tickets.detail.actionResults.moveMissingTarget"',
    '"tickets.detail.actionResults.moveInvalidTarget"',
    '"tickets.detail.actionResults.moveSuccess"',
    '"tickets.detail.actionResults.transferMissingCreator"',
    '"tickets.detail.actionResults.transferSuccess"',
    '"tickets.detail.actionResults.participantInvalidUser"',
    '"tickets.detail.actionResults.participantAlreadyPresent"',
    '"tickets.detail.actionResults.participantNotPresent"',
    '"tickets.detail.actionResults.participantCreatorRemoveDenied"',
    '"tickets.detail.actionResults.participantAddSuccess"',
    '"tickets.detail.actionResults.participantRemoveSuccess"',
    '"tickets.detail.actionResults.priorityInvalid"',
    '"tickets.detail.actionResults.priorityUnconfigured"',
    '"tickets.detail.actionResults.prioritySuccess"',
    '"tickets.detail.actionResults.topicMissing"',
    '"tickets.detail.actionResults.topicSuccess"',
    '"tickets.detail.actionResults.pinSuccess"',
    '"tickets.detail.actionResults.unpinSuccess"',
    '"tickets.detail.actionResults.renameMissingName"',
    '"tickets.detail.actionResults.renameSuccess"'
  ]) {
    assert.equal(templateSource.includes(localeCall) || modelSource.includes(localeCall) || runtimeBridgeSource.includes(localeCall), true, `expected ticket detail source to use locale call: ${localeCall}`)
  }
})
