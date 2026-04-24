import type {
    LocalAssetRef,
    LocalTranscriptActor,
    LocalTranscriptAttachment,
    LocalTranscriptComponent,
    LocalTranscriptDocument,
    LocalTranscriptEmbed,
    LocalTranscriptFormAnswerData,
    LocalTranscriptFormAnswerFile,
    LocalTranscriptFormRecord,
    LocalTranscriptMessage
} from "../contracts/document"

export const ASSET_BASE_PLACEHOLDER = "__OT_TRANSCRIPT_ASSET_BASE__"

export interface TranscriptHtmlRenderOptions {
    previewMode?: boolean
}

export function renderTranscriptHtml(document: LocalTranscriptDocument, options: TranscriptHtmlRenderOptions = {}): string {
    const faviconHref = resolveOptionalPreviewAssetUrl(document.style.favicon.faviconAsset, "favicon", options)
    const backgroundHref = resolveOptionalPreviewAssetUrl(document.style.background.backgroundAsset, "background", options)
    const faviconTag = document.style.favicon.enabled && faviconHref
        ? `<link rel="icon" href="${escapeAttribute(faviconHref)}">`
        : ""

    const backgroundStyle = backgroundHref
        ? `background-image: linear-gradient(rgba(10, 14, 22, 0.85), rgba(10, 14, 22, 0.95)), url('${escapeAttribute(backgroundHref)}'); background-size: cover; background-attachment: fixed;`
        : `background: radial-gradient(circle at top, ${escapeAttribute(document.style.header.decoColor)}22, transparent 35%), ${escapeAttribute(document.style.background.backgroundColor)};`

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(document.ticket.name)} Transcript</title>
${faviconTag}
<style>
:root {
  --page-bg: ${escapeCss(document.style.background.backgroundColor)};
  --card-bg: ${escapeCss(document.style.header.backgroundColor)};
  --card-fg: ${escapeCss(document.style.header.textColor)};
  --accent: ${escapeCss(document.style.header.decoColor)};
  --stats-bg: ${escapeCss(document.style.stats.backgroundColor)};
  --stats-key: ${escapeCss(document.style.stats.keyTextColor)};
  --stats-value: ${escapeCss(document.style.stats.valueTextColor)};
  --stats-toggle-bg: ${escapeCss(document.style.stats.hideBackgroundColor)};
  --stats-toggle-fg: ${escapeCss(document.style.stats.hideTextColor)};
  --message-bg: rgba(255,255,255,0.04);
  --embed-bg: rgba(255,255,255,0.06);
  --border: rgba(255,255,255,0.12);
  --muted: rgba(255,255,255,0.72);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", "Trebuchet MS", sans-serif;
  color: #f5f7fa;
  ${backgroundStyle}
}
a { color: #8fd3ff; }
.page {
  width: min(1100px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}
.header {
  background: var(--card-bg);
  color: var(--card-fg);
  border: 1px solid var(--border);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0,0,0,0.35);
}
.header-top {
  padding: 24px;
  border-top: 6px solid var(--accent);
  display: flex;
  gap: 18px;
  align-items: center;
}
.guild-icon, .actor-avatar, .reply-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.12);
}
.actor-avatar, .reply-avatar { width: 40px; height: 40px; }
.avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), rgba(255,255,255,0.18));
  color: white;
  font-weight: 700;
}
.ticket-meta h1 {
  margin: 0 0 6px;
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.05;
}
.ticket-meta p {
  margin: 0;
  color: rgba(255,255,255,0.78);
}
.stats {
  margin-top: 20px;
  background: var(--stats-bg);
  border: 1px solid var(--border);
  border-radius: 20px;
  overflow: hidden;
}
.stats summary {
  list-style: none;
  cursor: pointer;
  padding: 16px 18px;
  background: var(--stats-toggle-bg);
  color: var(--stats-toggle-fg);
  font-weight: 700;
}
.stats summary::-webkit-details-marker { display: none; }
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  padding: 18px;
}
.stat {
  padding: 14px;
  border-radius: 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
}
.stat-key {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--stats-key);
}
.stat-value {
  display: block;
  margin-top: 6px;
  font-size: 20px;
  font-weight: 700;
  color: var(--stats-value);
}
.warnings {
  margin-top: 18px;
  background: rgba(255, 208, 122, 0.12);
  border: 1px solid rgba(255, 208, 122, 0.28);
  border-radius: 20px;
  padding: 16px 18px;
}
.warnings h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.warnings ul { margin: 0; padding-left: 18px; }
.messages {
  margin-top: 24px;
  display: grid;
  gap: 18px;
}
.message {
  padding: 18px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--message-bg);
  backdrop-filter: blur(8px);
}
.message.important { border-color: rgba(255, 209, 102, 0.42); }
.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.message-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.message-author {
  font-weight: 700;
  color: inherit;
}
.message-time {
  color: var(--muted);
  font-size: 13px;
}
.message-body {
  margin-top: 12px;
  line-height: 1.55;
  white-space: normal;
}
.reply, .embed, .attachment, .component-box {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--embed-bg);
}
.form-record {
  margin-top: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(143, 211, 255, 0.28);
  background: rgba(143, 211, 255, 0.08);
}
.form-record-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 10px;
}
.form-answer {
  margin-top: 10px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
}
.form-answer-title {
  display: block;
  margin-bottom: 6px;
}
.form-answer-files {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.reply {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.reply-meta strong, .embed strong { display: block; }
.mention {
  display: inline-block;
  padding: 0 8px;
  border-radius: 999px;
  margin: 0 1px;
  font-size: 0.95em;
  background: rgba(143, 211, 255, 0.16);
  color: #bfe7ff;
}
.mention.role { background: rgba(255,255,255,0.12); }
.embed-fields {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}
.field {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255,255,255,0.04);
}
.attachment img, .attachment video {
  max-width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  display: block;
}
.attachment audio { width: 100%; }
.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
}
.dropdown-option {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255,255,255,0.04);
}
.muted { color: var(--muted); }
@media (max-width: 720px) {
  .page { width: min(100%, calc(100% - 20px)); }
  .header-top { padding: 18px; }
  .ticket-meta h1 { font-size: 26px; }
}
</style>
</head>
<body>
  <main class="page">
    <section class="header">
      <div class="header-top">
        ${renderAvatar(document.guild.icon, document.guild.name, "guild-icon")}
        <div class="ticket-meta">
          <h1>${escapeHtml(document.ticket.name)}</h1>
          <p>${escapeHtml(document.guild.name)} • ${escapeHtml(document.ticket.id)}</p>
        </div>
      </div>
    </section>
    <details class="stats" open>
      <summary>Transcript Stats</summary>
      <div class="stats-grid">
        ${renderStat("Messages", String(document.totals.messages))}
        ${renderStat("Embeds", String(document.totals.embeds))}
        ${renderStat("Attachments", String(document.totals.attachments))}
        ${renderStat("Reactions", String(document.totals.reactions))}
        ${renderStat("Interactions", String(document.totals.interactions))}
        ${renderStat("Warnings", String(document.warningCount))}
      </div>
    </details>
    ${document.warnings.length > 0 ? renderWarnings(document) : ""}
    <section class="messages">
      ${document.messages.map((message) => renderMessage(message)).join("")}
    </section>
  </main>
</body>
</html>`
}

function renderWarnings(document: LocalTranscriptDocument) {
    return `<section class="warnings">
  <h2>Archive Warnings</h2>
  <ul>${document.warnings.map((warning) => `<li>${escapeHtml(warning.message)}${warning.sourceUrl ? ` <span class="muted">(${escapeHtml(warning.sourceUrl)})</span>` : ""}</li>`).join("")}</ul>
</section>`
}

function renderStat(key: string, value: string) {
    return `<div class="stat"><span class="stat-key">${escapeHtml(key)}</span><span class="stat-value">${escapeHtml(value)}</span></div>`
}

function renderMessage(message: LocalTranscriptMessage) {
    return `<article class="message${message.important ? " important" : ""}">
  <div class="message-header">
    ${renderActorAvatar(message.author)}
    <div class="message-meta">
      <span class="message-author" style="color:${escapeAttribute(message.author.color || "#ffffff")}">${escapeHtml(message.author.name)}</span>
      <span class="message-time">${escapeHtml(formatTimestamp(message.timestamp))}${message.edited ? " • edited" : ""}</span>
    </div>
  </div>
  ${message.reply.type ? renderReply(message.author, message.reply) : ""}
  ${message.content ? `<div class="message-body">${renderFormattedText(message.content)}</div>` : ""}
  ${message.formRecord ? renderFormRecord(message.formRecord) : ""}
  ${message.embeds.map((embed) => renderEmbed(embed)).join("")}
  ${message.attachments.map((attachment) => renderAttachment(attachment)).join("")}
  ${message.components.map((component) => renderComponent(component)).join("")}
</article>`
}

function renderFormRecord(record: LocalTranscriptFormRecord) {
    const completedAt = record.completedAt ? ` • completed ${escapeHtml(formatTimestamp(Date.parse(record.completedAt)))}` : ""
    return `<section class="form-record">
  <div class="form-record-header">
    <strong>Archived form result</strong>
    <span class="muted">${escapeHtml(record.formName || record.formId)} • ${escapeHtml(record.draftState)}${completedAt}</span>
  </div>
  ${record.answers.map((answer) => `<div class="form-answer">
    <strong class="form-answer-title">${escapeHtml(String(answer.position))}. ${escapeHtml(answer.question)}</strong>
    <div>${answer.answer ? renderFormattedText(answer.answer) : `<span class="muted">No compatibility answer text was archived.</span>`}</div>
    ${renderFormAnswerData(answer.answerData)}
  </div>`).join("")}
</section>`
}

function renderFormAnswerData(answerData: LocalTranscriptFormAnswerData | null) {
    if (!answerData) return ""

    if (answerData.kind == "text") {
        return answerData.value
            ? `<div class="muted" style="margin-top:6px">Structured text answer preserved.</div>`
            : `<div class="muted" style="margin-top:6px">Structured text answer was empty.</div>`
    }

    if (answerData.kind == "file_upload") {
        return `<div class="form-answer-files">
  ${answerData.files.length > 0
            ? answerData.files.map((file) => renderFormAnswerFile(file)).join("")
            : `<div class="attachment"><strong>No files archived.</strong><div class="muted">The submitted file answer did not contain file metadata.</div></div>`}
</div>`
    }

    const selected = answerData.selected
    if (selected.length == 0) {
        return `<div class="muted" style="margin-top:6px">No structured selections were archived.</div>`
    }

    return `<div class="pill-row" style="margin-top:10px">${selected.map((entry) => `<span class="pill">${escapeHtml(entry.label)}</span>`).join("")}</div>`
}

function renderFormAnswerFile(file: LocalTranscriptFormAnswerFile) {
    const size = file.size === false ? "unknown size" : formatByteSize(file.size)
    const type = file.contentType || "unknown"
    if (!file.asset || file.asset.status != "mirrored" || !file.asset.assetName) {
        return `<div class="attachment">
  <strong>${escapeHtml(file.name)}</strong>
  <div class="muted">${escapeHtml(type)} • ${escapeHtml(size)}</div>
  <div style="margin-top:8px">File evidence unavailable in this archive.${file.asset?.unavailableReason ? ` <span class="muted">${escapeHtml(file.asset.unavailableReason)}</span>` : ""}</div>
</div>`
    }

    if (file.displayKind == "image") {
        return `<div class="attachment"><strong>${escapeHtml(file.name)}</strong><div class="muted">${escapeHtml(size)}</div><div style="margin-top:10px">${renderImageAsset(file.asset, file.name)}</div></div>`
    }

    if (file.displayKind == "video") {
        return `<div class="attachment"><strong>${escapeHtml(file.name)}</strong><div class="muted">${escapeHtml(size)}</div><video controls preload="metadata" src="${assetUrl(file.asset)}"></video></div>`
    }

    if (file.displayKind == "audio") {
        return `<div class="attachment"><strong>${escapeHtml(file.name)}</strong><div class="muted">${escapeHtml(size)}</div><audio controls preload="metadata" src="${assetUrl(file.asset)}"></audio></div>`
    }

    return `<div class="attachment"><strong>${escapeHtml(file.name)}</strong><div class="muted">${escapeHtml(type)} • ${escapeHtml(size)}</div><div style="margin-top:10px"><a href="${assetUrl(file.asset)}" target="_blank" rel="noopener noreferrer">Download archived file evidence</a></div></div>`
}

function renderReply(_author: LocalTranscriptActor, reply: LocalTranscriptMessage["reply"]) {
    if (!reply.type || !reply.user) return ""
    const preview = reply.type == "command"
        ? `Used command /${escapeHtml(reply.interactionName ?? "unknown")}`
        : renderFormattedText(reply.content || "Reply preview unavailable")

    return `<div class="reply">
  ${renderActorAvatar(reply.user, "reply-avatar")}
  <div class="reply-meta">
    <strong>${escapeHtml(reply.user.name)}</strong>
    <div class="muted">${reply.type == "command" ? "Command Context" : "Reply Context"}</div>
    <div>${preview}</div>
  </div>
</div>`
}

function renderEmbed(embed: LocalTranscriptEmbed) {
    return `<section class="embed" style="border-left:4px solid ${escapeAttribute(embed.color || "#5865f2")}">
  ${embed.authorText || embed.authorAsset ? `<div class="muted">${renderOptionalAsset(embed.authorAsset, "reply-avatar")} ${embed.authorText ? escapeHtml(String(embed.authorText)) : ""}</div>` : ""}
  ${embed.title ? `<strong>${renderFormattedText(String(embed.title))}</strong>` : ""}
  ${embed.description ? `<div class="message-body">${renderFormattedText(String(embed.description))}</div>` : ""}
  ${embed.thumbnail?.assetName ? `<div style="margin-top:10px">${renderImageAsset(embed.thumbnail, embed.title || "Embed thumbnail")}</div>` : ""}
  ${embed.image?.assetName ? `<div style="margin-top:10px">${renderImageAsset(embed.image, embed.title || "Embed image")}</div>` : ""}
  ${embed.fields.length > 0 ? `<div class="embed-fields">${embed.fields.map((field) => `<div class="field"><strong>${escapeHtml(field.name)}</strong><div>${renderFormattedText(field.value)}</div></div>`).join("")}</div>` : ""}
  ${embed.footerText || embed.footerAsset ? `<div class="muted" style="margin-top:10px">${renderOptionalAsset(embed.footerAsset, "reply-avatar")} ${embed.footerText ? escapeHtml(String(embed.footerText)) : ""}</div>` : ""}
</section>`
}

function renderAttachment(attachment: LocalTranscriptAttachment) {
    if (!attachment.asset || attachment.asset.status != "mirrored" || !attachment.asset.assetName) {
        return `<section class="attachment">
  <strong>${escapeHtml(attachment.name)}</strong>
  <div class="muted">${escapeHtml(attachment.fileType)} • ${escapeHtml(attachment.size)}</div>
  <div style="margin-top:8px">Asset unavailable in this archive.${attachment.asset?.unavailableReason ? ` <span class="muted">${escapeHtml(attachment.asset.unavailableReason)}</span>` : ""}</div>
</section>`
    }

    if (attachment.displayKind == "image") {
        return `<section class="attachment"><strong>${escapeHtml(attachment.name)}</strong><div class="muted">${escapeHtml(attachment.size)}</div><div style="margin-top:10px">${renderImageAsset(attachment.asset, attachment.name)}</div></section>`
    }

    if (attachment.displayKind == "video") {
        return `<section class="attachment"><strong>${escapeHtml(attachment.name)}</strong><div class="muted">${escapeHtml(attachment.size)}</div><video controls preload="metadata" src="${assetUrl(attachment.asset)}"></video></section>`
    }

    if (attachment.displayKind == "audio") {
        return `<section class="attachment"><strong>${escapeHtml(attachment.name)}</strong><div class="muted">${escapeHtml(attachment.size)}</div><audio controls preload="metadata" src="${assetUrl(attachment.asset)}"></audio></section>`
    }

    return `<section class="attachment"><strong>${escapeHtml(attachment.name)}</strong><div class="muted">${escapeHtml(attachment.fileType)} • ${escapeHtml(attachment.size)}</div><div style="margin-top:10px"><a href="${assetUrl(attachment.asset)}" target="_blank" rel="noopener noreferrer">Download archived file</a></div></section>`
}

function renderComponent(component: LocalTranscriptComponent) {
    if (component.type == "buttons") {
        return `<section class="component-box"><div class="pill-row">${component.buttons.map((button) => `<span class="pill">${renderOptionalAsset(button.iconAsset, "reply-avatar")} ${button.icon ? escapeHtml(button.icon) : ""} ${button.label ? escapeHtml(String(button.label)) : button.id ? escapeHtml(String(button.id)) : "Button"}${button.disabled ? " • disabled" : ""}</span>`).join("")}</div></section>`
    }

    if (component.type == "dropdown") {
        return `<section class="component-box"><strong>${component.placeholder ? escapeHtml(String(component.placeholder)) : "Dropdown"}</strong>${component.options.map((option) => `<div class="dropdown-option">${renderOptionalAsset(option.iconAsset, "reply-avatar")} ${option.icon ? escapeHtml(option.icon) + " " : ""}<strong>${option.label ? escapeHtml(String(option.label)) : "Option"}</strong>${option.description ? `<div class="muted">${escapeHtml(String(option.description))}</div>` : ""}</div>`).join("")}</section>`
    }

    if (component.reactions.length == 0) return ""
    return `<section class="component-box"><div class="pill-row">${component.reactions.map((reaction) => `<span class="pill">${renderOptionalAsset(reaction.asset, "reply-avatar")} ${!reaction.asset && reaction.emoji ? escapeHtml(reaction.emoji) : ""} × ${reaction.amount}</span>`).join("")}</div></section>`
}

function renderActorAvatar(actor: LocalTranscriptActor, className = "actor-avatar") {
    return renderAvatar(actor.avatar, actor.name, className)
}

function renderAvatar(asset: LocalAssetRef | null, label: string, className: string) {
    if (asset && asset.status == "mirrored" && asset.assetName) {
        return `<img class="${className}" src="${assetUrl(asset)}" alt="${escapeAttribute(label)}">`
    }

    const initials = label.split(/\s+/g).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?"
    return `<span class="${className} avatar-fallback">${escapeHtml(initials)}</span>`
}

function renderOptionalAsset(asset: LocalAssetRef | null | undefined, className: string) {
    if (!asset || asset.status != "mirrored" || !asset.assetName) return ""
    return `<img class="${className}" src="${assetUrl(asset)}" alt="">`
}

function renderImageAsset(asset: LocalAssetRef, alt: string | false) {
    return `<img src="${assetUrl(asset)}" alt="${escapeAttribute(String(alt || "Archived image"))}">`
}

function assetUrl(asset: LocalAssetRef) {
    return ASSET_BASE_PLACEHOLDER + asset.assetName
}

function resolveOptionalPreviewAssetUrl(
    asset: LocalAssetRef | null | undefined,
    kind: "background" | "favicon",
    options: TranscriptHtmlRenderOptions
) {
    if (!asset) return null
    if (asset.assetName) return assetUrl(asset)
    if (!options.previewMode) return null
    if (kind != "background" && kind != "favicon") return null

    const sourceUrl = String(asset.sourceUrl || "").trim()
    return /^(https?:|data:)/i.test(sourceUrl) ? sourceUrl : null
}

function renderFormattedText(text: string) {
    const tokenRegex = /<@&([^:>]+)::([^>]+)> |<@([^>]+)> |<#([^>]+)> /g
    let cursor = 0
    let output = ""
    let match: RegExpExecArray | null

    while ((match = tokenRegex.exec(text)) !== null) {
        output += escapeTextSegment(text.slice(cursor, match.index))
        cursor = match.index + match[0].length

        if (match[1]) {
            output += `<span class="mention role" style="${match[2] && match[2] != "regular" ? `color:${escapeAttribute(match[2])};` : ""}">@${decodeNbsp(match[1])}</span>`
        } else if (match[3]) {
            output += `<span class="mention user">@${decodeNbsp(match[3])}</span>`
        } else if (match[4]) {
            output += `<span class="mention channel">#${decodeNbsp(match[4])}</span>`
        }
    }

    output += escapeTextSegment(text.slice(cursor))
    return output
}

function escapeTextSegment(segment: string) {
    return escapeHtml(segment).replace(/\n/g, "<br>")
}

function decodeNbsp(value: string) {
    return escapeHtml(value.replaceAll("&nbsp;", "\u00A0"))
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;")
}

function escapeAttribute(value: string) {
    return escapeHtml(value)
}

function escapeCss(value: string) {
    return value.replace(/[^#(),.%\-\s0-9a-zA-Z]/g, "")
}

function formatTimestamp(timestamp: number) {
    return new Date(timestamp).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    })
}

function formatByteSize(bytes: number) {
    if (!Number.isFinite(bytes) || bytes < 0) return "unknown size"
    if (bytes < 1024) return `${Math.round(bytes)} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
    return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
}
