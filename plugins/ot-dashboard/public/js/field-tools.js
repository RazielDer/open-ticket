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

  function label(key) {
    return commonMessages[key] || `fieldTools.common.${key}`
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
    const normalized = String(field.value || "")
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join("\n")
    if (field.value === normalized) {
      return
    }
    field.value = normalized
    dispatchInput(field)
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

    field.parentNode.insertBefore(shell, field)
    shell.append(toolbar, field)
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
