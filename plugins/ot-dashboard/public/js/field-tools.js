(function () {
  const SECRET_NAME_PATTERN = /(?:token|secret|password|hash|credential|authorization|api[_-]?key|bearer)/i

  function readMessages() {
    if (window.DashboardUI && typeof window.DashboardUI.readJson === "function") {
      return window.DashboardUI.readJson("dashboard-ui-messages", {})
    }
    return {}
  }

  const fieldMessages = (readMessages().fieldTools || {})
  const commonMessages = fieldMessages.common || {}
  const DISCORD_ID_PATTERN = /^\d{17,20}$/

  function label(key, params) {
    const template = commonMessages[key] || `fieldTools.common.${key}`
    if (!params) return template
    return Object.keys(params).reduce((text, paramKey) => {
      return text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(params[paramKey]))
    }, template)
  }

  function dispatchInput(target) {
    target.dispatchEvent(new Event("input", { bubbles: true }))
  }

  function isDeniedField(field) {
    const type = String(field.getAttribute("type") || "").toLowerCase()
    const name = String(field.getAttribute("name") || "")
    const id = String(field.getAttribute("id") || "")
    return type === "password"
      || type === "hidden"
      || field.hidden === true
      || field.readOnly === true
      || field.disabled === true
      || name === "csrfToken"
      || id === "csrfToken"
      || SECRET_NAME_PATTERN.test(name)
      || SECRET_NAME_PATTERN.test(id)
  }

  function createButton(key) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "field-tool-button"
    button.textContent = label(key)
    button.setAttribute("aria-label", label(key))
    button.setAttribute("title", label(key))
    return button
  }

  function parseIdEntries(value) {
    return String(value || "")
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  function uniqueEntries(entries) {
    const seen = new Set()
    const normalized = []
    entries.forEach((entry) => {
      if (seen.has(entry)) {
        return
      }
      seen.add(entry)
      normalized.push(entry)
    })
    return normalized
  }

  function duplicateEntries(entries) {
    const seen = new Set()
    const duplicates = new Set()
    entries.forEach((entry) => {
      if (seen.has(entry)) {
        duplicates.add(entry)
        return
      }
      seen.add(entry)
    })
    return Array.from(duplicates)
  }

  function invalidDiscordIdEntries(entries) {
    const invalid = new Set()
    entries.forEach((entry) => {
      if (!DISCORD_ID_PATTERN.test(entry)) {
        invalid.add(entry)
      }
    })
    return Array.from(invalid)
  }

  function analyzeIdList(field) {
    const entries = parseIdEntries(field.value)
    return {
      entries,
      unique: uniqueEntries(entries),
      duplicates: duplicateEntries(entries),
      invalid: invalidDiscordIdEntries(entries)
    }
  }

  function setStatusText(element, text) {
    element.textContent = text
    element.hidden = !text
  }

  async function copyToClipboard(value) {
    if (!value) return
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value)
      return
    }
    const textarea = document.createElement("textarea")
    textarea.value = value
    textarea.setAttribute("readonly", "readonly")
    textarea.style.position = "fixed"
    textarea.style.left = "-9999px"
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand("copy")
    textarea.remove()
  }

  function cleanupIdList(field) {
    const normalized = uniqueEntries(parseIdEntries(field.value)).join("\n")
    if (field.value === normalized) {
      return
    }
    field.value = normalized
    dispatchInput(field)
  }

  function updateIdListStatus(field, elements) {
    const analysis = analyzeIdList(field)
    setStatusText(elements.count, label("count", { count: analysis.unique.length }))
    setStatusText(elements.duplicates, analysis.duplicates.length
      ? label("duplicates", { values: analysis.duplicates.join(", ") })
      : "")
    setStatusText(elements.invalid, analysis.invalid.length
      ? label("invalidShape", { values: analysis.invalid.join(", ") })
      : "")
  }

  function mountIdListTools(field) {
    const shell = document.createElement("div")
    shell.className = "field-tools-shell"
    const toolbar = document.createElement("div")
    toolbar.className = "field-tools-toolbar"

    const cleanupButton = createButton("cleanupList")
    cleanupButton.addEventListener("click", () => cleanupIdList(field))
    toolbar.append(cleanupButton)

    if (field.getAttribute("data-field-tools-copy") === "true") {
      const copyButton = createButton("copy")
      copyButton.addEventListener("click", () => {
        void copyToClipboard(String(field.value || ""))
      })
      toolbar.append(copyButton)
    }

    const status = document.createElement("div")
    status.className = "field-tools-status"
    const count = document.createElement("span")
    count.className = "field-tools-count"
    const duplicates = document.createElement("span")
    duplicates.className = "field-tools-warning"
    const invalid = document.createElement("span")
    invalid.className = "field-tools-warning"
    status.append(count, duplicates, invalid)

    field.parentNode.insertBefore(shell, field)
    shell.append(toolbar, field, status)
    const elements = { count, duplicates, invalid }
    field.addEventListener("input", () => updateIdListStatus(field, elements))
    updateIdListStatus(field, elements)
  }

  function mountFieldTools(field) {
    if (!field || field.dataset.fieldToolsBound === "true") {
      return
    }

    const mode = String(field.dataset.fieldTools || "").trim()
    field.dataset.fieldToolsBound = "true"
    if (!mode || mode === "none" || mode === "secret" || isDeniedField(field)) {
      return
    }

    if (mode === "id-list" && field.tagName === "TEXTAREA") {
      mountIdListTools(field)
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-field-tools]").forEach((field) => {
      mountFieldTools(field)
    })
  })

  window.DashboardFieldTools = {
    mount: mountFieldTools,
    cleanupIdList
  }
})()
