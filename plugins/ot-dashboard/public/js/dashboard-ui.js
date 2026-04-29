(function () {
  const basePath = document.body.dataset.basePath || "/";
  const uiMessages = readJson("dashboard-ui-messages", {});

  function join(pathname) {
    const clean = String(pathname || "").replace(/^\/+/, "");
    if (!clean) return basePath === "/" ? "/" : basePath;
    return basePath === "/" ? `/${clean}` : `${basePath}/${clean}`;
  }

  function readJson(id, fallback) {
    const element = document.getElementById(id);
    if (!element) return fallback;
    const source = "value" in element ? element.value : element.textContent;
    if (!source) return fallback;
    try {
      return JSON.parse(source);
    } catch {
      return fallback;
    }
  }

  function parseList(source) {
    const text = String(source || "").trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {}
    return text
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function stringifyList(list) {
    return JSON.stringify(Array.isArray(list) ? list : [], null, 2);
  }

  function parseJson(source, fallback) {
    const text = String(source ?? "").trim();
    if (!text) return fallback;
    return JSON.parse(text);
  }

  function stringifyJson(value) {
    return JSON.stringify(value ?? null, null, 2);
  }

  function toastRegion() {
    let region = document.querySelector(".toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "true");
      document.body.appendChild(region);
    }
    return region;
  }

  function showToast(message, type) {
    const toast = document.createElement("div");
    toast.className = `toast ${type || "success"}`;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    toastRegion().appendChild(toast);
    window.setTimeout(() => toast.remove(), 3200);
  }

  async function requestJson(url, options) {
    const response = await fetch(url, {
      method: options?.method || "GET",
      headers: {
        ...(options?.json !== undefined ? { "Content-Type": "application/json" } : {}),
        "x-csrf-token": document.body.dataset.csrfToken || "",
        ...(options?.headers || {})
      },
      body: options?.json !== undefined ? JSON.stringify(options.json) : options?.body
    });

    const data = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status}` }));
    if (!response.ok || data.success === false) {
      throw new Error(data.error || data.result?.degradedReason || data.result?.message || `HTTP ${response.status}`);
    }
    return data;
  }

  function trackDirty(form) {
    let dirty = false;
    const markDirty = () => {
      dirty = true;
    };
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("submit", () => {
      dirty = false;
    });
    window.addEventListener("beforeunload", (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
    return {
      clear() {
        dirty = false;
      }
    };
  }

  function getFocusableElements(root) {
    return Array.from(
      root.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
  }

  function bindModal(element) {
    if (!element) {
      return { open() {}, close() {} };
    }

    const closeButtons = element.querySelectorAll('[data-action="close-modal"]');
    const dialog = element.querySelector(".modal-dialog");
    let previousFocus = null;

    const close = () => {
      element.hidden = true;
      element.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };
    const open = () => {
      previousFocus = document.activeElement;
      element.hidden = false;
      element.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      window.setTimeout(() => {
        const target = (dialog && getFocusableElements(dialog)[0]) || dialog || element;
        if (target && typeof target.focus === "function") {
          target.focus();
        }
      }, 0);
    };
    closeButtons.forEach((button) => button.addEventListener("click", close));
    element.addEventListener("click", (event) => {
      if (event.target === element) close();
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !element.hidden) {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab" || element.hidden || !dialog) return;

      const focusable = getFocusableElements(dialog);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    });
    return { open, close };
  }

  async function confirm(message) {
    return new Promise((resolve) => {
      const shell = document.createElement("div");
      shell.className = "modal-shell";
      shell.setAttribute("aria-hidden", "false");
      const previousFocus = document.activeElement;
      shell.innerHTML = `
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboardConfirmTitle" tabindex="-1">
          <div class="modal-header">
            <h3 id="dashboardConfirmTitle">${uiMessages.confirmTitle || "Confirm action"}</h3>
            <button class="icon-button" type="button" data-close aria-label="${uiMessages.closeDialog || "Close dialog"}">×</button>
          </div>
          <div class="modal-body">
            <p class="item-copy">${String(message)}</p>
            <div class="card-actions">
              <button class="btn primary" type="button" data-confirm>${uiMessages.continue || "Continue"}</button>
              <button class="btn secondary" type="button" data-close>${uiMessages.cancel || "Cancel"}</button>
            </div>
          </div>
        </div>
      `;

      const cleanup = (value) => {
        document.body.classList.remove("modal-open");
        shell.removeEventListener("keydown", handleKeyDown);
        shell.remove();
        if (previousFocus && typeof previousFocus.focus === "function") {
          previousFocus.focus();
        }
        resolve(value);
      };

      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cleanup(false);
          return;
        }

        if (event.key !== "Tab") return;

        const dialog = shell.querySelector(".modal-dialog");
        const focusable = dialog ? getFocusableElements(dialog) : [];
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      };

      shell.querySelectorAll("[data-close]").forEach((button) => {
        button.addEventListener("click", () => cleanup(false));
      });
      shell.querySelector("[data-confirm]").addEventListener("click", () => cleanup(true));
      shell.addEventListener("click", (event) => {
        if (event.target === shell) cleanup(false);
      });
      document.body.appendChild(shell);
      document.body.classList.add("modal-open");
      shell.addEventListener("keydown", handleKeyDown);
      const initialFocus = shell.querySelector("[data-confirm]") || shell.querySelector(".modal-dialog");
      if (initialFocus && typeof initialFocus.focus === "function") {
        initialFocus.focus();
      }
    });
  }

  function initResponsiveDisclosures() {
    if (typeof window.matchMedia !== "function") return;
    const collapseForStackedLayout = window.matchMedia("(max-width: 900px)").matches;
    document.querySelectorAll("details[data-responsive-disclosure]").forEach((element) => {
      if (element.tagName !== "DETAILS") return;
      element.open = !collapseForStackedLayout;
    });
  }

  function initializeUi() {
    initResponsiveDisclosures();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeUi, { once: true });
  } else {
    initializeUi();
  }

  window.DashboardUI = {
    join,
    readJson,
    parseList,
    stringifyList,
    parseJson,
    stringifyJson,
    showToast,
    requestJson,
    trackDirty,
    bindModal,
    confirm
  };
})();
