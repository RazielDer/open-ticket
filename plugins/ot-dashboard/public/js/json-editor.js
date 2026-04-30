(function () {
  const registry = new WeakMap()

  function readJson(id, fallback) {
    if (window.DashboardUI && typeof window.DashboardUI.readJson === "function") {
      return window.DashboardUI.readJson(id, fallback)
    }
    const element = document.getElementById(id)
    if (!element) return fallback
    const source = "value" in element ? element.value : element.textContent
    if (!source) return fallback
    try {
      return JSON.parse(source)
    } catch {
      return fallback
    }
  }

  const localizedMessages = readJson("dashboard-ui-messages", {})
  const fieldMessages = localizedMessages.fieldTools || {}
  const jsonMessages = fieldMessages.json || {}

  function formatMessage(template, values) {
    return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
      return Object.prototype.hasOwnProperty.call(values || {}, key) ? String(values[key]) : ""
    })
  }

  function message(key, values) {
    const template = jsonMessages[key] || `fieldTools.json.${key}`
    return formatMessage(template, values || {})
  }

  function dispatchInput(target) {
    target.dispatchEvent(new Event("input", { bubbles: true }))
  }

  function parseJsonError(value) {
    try {
      JSON.parse(value)
      return ""
    } catch (error) {
      return error instanceof Error ? error.message : String(error || "fieldTools.json.invalid")
    }
  }

  function showToast(text, tone) {
    if (window.DashboardUI && typeof window.DashboardUI.showToast === "function") {
      window.DashboardUI.showToast(text, tone)
    }
  }

  function showError(banner, detail) {
    banner.hidden = false
    banner.textContent = message("invalid", { message: detail })
  }

  function updateBanner(banner, value) {
    const detail = parseJsonError(value)
    banner.hidden = detail.length === 0
    banner.textContent = detail.length === 0 ? "" : message("invalid", { message: detail })
  }

  function updateDirtyState(shell, status, currentValue, cleanValue) {
    const dirty = currentValue !== cleanValue.value
    shell.dataset.dirty = dirty ? "true" : "false"
    status.textContent = dirty ? message("unsavedChanges") : message("savedDraft")
    return dirty
  }

  function createToolbarButton(key, variant) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = `btn ${variant || "subtle"}`
    button.textContent = message(key)
    button.setAttribute("aria-label", message(key))
    button.setAttribute("title", message(key))
    return button
  }

  function firstDiagnosticFrom(diagnostics) {
    if (!Array.isArray(diagnostics) || diagnostics.length < 1) {
      return null
    }
    return diagnostics[0] || null
  }

  function localDiagnostics(value) {
    const detail = parseJsonError(value)
    return detail ? [{ from: 0, to: 0, severity: "error", source: "json", message: detail }] : []
  }

  function diagnosticMessage(diagnostic) {
    return String(diagnostic && diagnostic.message ? diagnostic.message : "fieldTools.json.invalid")
  }

  function mountEditor(textarea) {
    if (!textarea || registry.has(textarea)) {
      return registry.get(textarea) || null
    }

    const factory = window.DashboardCodeMirrorJson && window.DashboardCodeMirrorJson.createJsonEditor
    if (typeof factory !== "function") {
      return null
    }

    const form = textarea.form
    const shell = document.createElement("div")
    shell.className = "json-editor-shell"

    const toolbar = document.createElement("div")
    toolbar.className = "json-editor-toolbar"

    const actions = document.createElement("div")
    actions.className = "json-editor-actions"

    const validateButton = createToolbarButton("validate", "subtle")
    const jumpButton = createToolbarButton("jumpToError", "subtle")
    const formatButton = createToolbarButton("format", "secondary")
    const minifyButton = createToolbarButton("minify", "subtle")
    const foldButton = createToolbarButton("foldAll", "subtle")
    const unfoldButton = createToolbarButton("unfoldAll", "subtle")
    const searchButton = createToolbarButton("search", "subtle")

    const status = document.createElement("span")
    status.className = "json-editor-status"
    status.textContent = message("savedDraft")

    const banner = document.createElement("div")
    banner.className = "json-editor-banner"
    banner.hidden = true

    const host = document.createElement("div")
    host.className = "json-editor-host"

    actions.append(validateButton, jumpButton, formatButton, minifyButton, foldButton, unfoldButton, searchButton)
    toolbar.append(actions, status)
    shell.append(toolbar, banner, host)
    textarea.parentNode.insertBefore(shell, textarea)
    textarea.classList.add("json-editor-source")
    textarea.hidden = true
    textarea.dataset.fieldTools = textarea.dataset.fieldTools || "json"
    shell.append(textarea)

    const cleanValue = { value: String(textarea.value || "") }

    const editor = factory({
      parent: host,
      value: cleanValue.value,
      searchMessages: {
        find: message("searchFind"),
        next: message("searchNext"),
        previous: message("searchPrevious"),
        all: message("searchAll"),
        close: message("searchClose")
      },
      onChange(nextValue) {
        textarea.value = nextValue
        dispatchInput(textarea)
        updateBanner(banner, nextValue)
        updateDirtyState(shell, status, nextValue, cleanValue)
      },
      onSave() {
        if (form && typeof form.requestSubmit === "function") {
          form.requestSubmit()
        }
      }
    })

    function syncFromEditor(options) {
      const currentValue = editor.getValue()
      textarea.value = currentValue
      if (!options || options.dispatchInput !== false) {
        dispatchInput(textarea)
      }
      updateBanner(banner, currentValue)
      updateDirtyState(shell, status, currentValue, cleanValue)
      return currentValue
    }

    function setValue(nextValue, options) {
      editor.setValue(String(nextValue ?? ""))
      if (options && options.markClean) {
        cleanValue.value = editor.getValue()
      }
      syncFromEditor({ dispatchInput: !(options && options.dispatchInput === false) })
    }

    function validateCurrentJson() {
      const diagnostics = typeof editor.validateJson === "function"
        ? editor.validateJson()
        : localDiagnostics(editor.getValue())
      const diagnostic = firstDiagnosticFrom(diagnostics)
      if (diagnostic) {
        showError(banner, diagnosticMessage(diagnostic))
        showToast(message("invalid", { message: diagnosticMessage(diagnostic) }), "error")
        return false
      }
      updateBanner(banner, editor.getValue())
      showToast(message("valid"), "success")
      return true
    }

    validateButton.addEventListener("click", () => {
      validateCurrentJson()
    })

    jumpButton.addEventListener("click", () => {
      const diagnostic = typeof editor.jumpToFirstError === "function"
        ? editor.jumpToFirstError()
        : firstDiagnosticFrom(typeof editor.getFirstDiagnostic === "function"
          ? [editor.getFirstDiagnostic()].filter(Boolean)
          : localDiagnostics(editor.getValue()))
      if (diagnostic) {
        showError(banner, diagnosticMessage(diagnostic))
        return
      }
      validateCurrentJson()
    })

    formatButton.addEventListener("click", () => {
      try {
        if (typeof editor.formatJson === "function") {
          editor.formatJson()
        } else {
          editor.setValue(JSON.stringify(JSON.parse(editor.getValue()), null, 2))
        }
        syncFromEditor({ dispatchInput: true })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error || "fieldTools.json.invalid")
        showError(banner, detail)
        showToast(message("invalid", { message: detail }), "error")
      }
    })

    minifyButton.addEventListener("click", () => {
      try {
        if (typeof editor.minifyJson === "function") {
          editor.minifyJson()
        } else {
          editor.setValue(JSON.stringify(JSON.parse(editor.getValue())))
        }
        syncFromEditor({ dispatchInput: true })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error || "fieldTools.json.invalid")
        showError(banner, detail)
        showToast(message("invalid", { message: detail }), "error")
      }
    })

    foldButton.addEventListener("click", () => {
      if (typeof editor.foldAll === "function") {
        editor.foldAll()
      }
    })

    unfoldButton.addEventListener("click", () => {
      if (typeof editor.unfoldAll === "function") {
        editor.unfoldAll()
      }
    })

    searchButton.addEventListener("click", () => {
      editor.openSearch()
    })

    if (form) {
      form.addEventListener("submit", () => {
        textarea.value = editor.getValue()
        cleanValue.value = textarea.value
        updateDirtyState(shell, status, textarea.value, cleanValue)
      })
    }

    updateBanner(banner, cleanValue.value)
    updateDirtyState(shell, status, cleanValue.value, cleanValue)

    const api = {
      textarea,
      shell,
      getValue() {
        return editor.getValue()
      },
      setValue(nextValue, options) {
        setValue(nextValue, options || null)
      },
      validateJson() {
        return validateCurrentJson()
      },
      openSearch() {
        editor.openSearch()
      },
      focus() {
        editor.focus()
      },
      isDirty() {
        return shell.dataset.dirty === "true"
      }
    }

    registry.set(textarea, api)
    return api
  }

  function findEditor(target) {
    if (!target) return null
    const element = typeof target === "string" ? document.querySelector(target) : target
    if (!element) return null
    return registry.get(element) || mountEditor(element)
  }

  function bindFileInput(input) {
    if (input.dataset.jsonEditorImportBound === "true") {
      return
    }
    input.dataset.jsonEditorImportBound = "true"
    input.addEventListener("change", async () => {
      const selector = input.getAttribute("data-load-json-into")
      const file = input.files && input.files[0]
      if (!selector || !file) return

      const editor = findEditor(selector)
      const text = await file.text()
      if (editor) {
        editor.setValue(text)
        return
      }

      const target = document.querySelector(selector)
      if (target) {
        target.value = text
        dispatchInput(target)
      }
    })
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("textarea[data-json-editor]").forEach((textarea) => {
      mountEditor(textarea)
    })

    document.querySelectorAll("input[type='file'][data-load-json-into]").forEach((input) => {
      bindFileInput(input)
    })

    window.addEventListener("beforeunload", (event) => {
      const dirty = Array.from(document.querySelectorAll("textarea[data-json-editor]")).some((textarea) => {
        const editor = registry.get(textarea)
        return Boolean(editor && editor.isDirty())
      })
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ""
    })
  })

  window.DashboardJsonEditor = {
    mount: mountEditor,
    find: findEditor
  }
})()
