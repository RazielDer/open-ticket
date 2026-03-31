(function () {
  const registry = new WeakMap();

  function dispatchInput(target) {
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function parseJsonError(value) {
    try {
      JSON.parse(value);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error || "Invalid JSON")
    }
  }

  function updateBanner(banner, value) {
    const message = parseJsonError(value)
    banner.hidden = message.length === 0
    banner.textContent = message.length === 0 ? "" : `Parse error: ${message}`
  }

  function updateDirtyState(shell, status, currentValue, cleanValue) {
    const dirty = currentValue !== cleanValue.value
    shell.dataset.dirty = dirty ? "true" : "false"
    status.textContent = dirty ? "Unsaved changes" : "Saved draft"
    return dirty
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

    const formatButton = document.createElement("button")
    formatButton.type = "button"
    formatButton.className = "btn secondary"
    formatButton.textContent = "Format JSON"

    const searchButton = document.createElement("button")
    searchButton.type = "button"
    searchButton.className = "btn subtle"
    searchButton.textContent = "Search"

    const status = document.createElement("span")
    status.className = "json-editor-status"
    status.textContent = "Saved draft"

    const banner = document.createElement("div")
    banner.className = "json-editor-banner"
    banner.hidden = true

    const host = document.createElement("div")
    host.className = "json-editor-host"

    actions.append(formatButton, searchButton)
    toolbar.append(actions, status)
    shell.append(toolbar, banner, host)
    textarea.parentNode.insertBefore(shell, textarea)
    textarea.classList.add("json-editor-source")
    textarea.hidden = true
    shell.append(textarea)

    const cleanValue = { value: String(textarea.value || "") }

    const editor = factory({
      parent: host,
      value: cleanValue.value,
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

    function setValue(nextValue, options) {
      editor.setValue(String(nextValue ?? ""))
      if (options && options.markClean) {
        cleanValue.value = editor.getValue()
      }
      const currentValue = editor.getValue()
      textarea.value = currentValue
      dispatchInput(textarea)
      updateBanner(banner, currentValue)
      updateDirtyState(shell, status, currentValue, cleanValue)
    }

    formatButton.addEventListener("click", () => {
      try {
        setValue(JSON.stringify(JSON.parse(editor.getValue()), null, 2))
      } catch (error) {
        updateBanner(banner, editor.getValue())
        if (window.DashboardUI && typeof window.DashboardUI.showToast === "function") {
          window.DashboardUI.showToast((error && error.message) || "Invalid JSON", "error")
        }
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
