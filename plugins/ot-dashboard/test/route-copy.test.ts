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

  for (const phrase of [
    "<strong>Priority:</strong>",
    "<strong>Topic:</strong>",
    "Operator workflows",
    "Current creator:",
    "Original applicant:",
    "Pin, unpin, and freeform rename remain Discord-only actions in this packet."
  ]) {
    assert.equal(templateSource.includes(phrase) || modelSource.includes(phrase), false, `expected ticket detail source to avoid hardcoded phrase: ${phrase}`)
  }

  for (const localeCall of [
    't("tickets.detail.operatorWorkflowsTitle")',
    't("tickets.detail.facts.priority")',
    't("tickets.detail.facts.topic")',
    't("tickets.detail.facts.currentCreator")',
    't("tickets.detail.facts.originalApplicant")',
    't("tickets.detail.deferredActions.pinUnpinRename")'
  ]) {
    assert.equal(templateSource.includes(localeCall) || modelSource.includes(localeCall), true, `expected ticket detail source to use locale call: ${localeCall}`)
  }
})
