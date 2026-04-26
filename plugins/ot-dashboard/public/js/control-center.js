(function () {
  const ui = window.DashboardUI;
  if (!ui) return;

  document.querySelectorAll("[data-filter-input]").forEach((input) => {
    const targetSelector = input.getAttribute("data-filter-input");
    const target = targetSelector ? document.querySelector(targetSelector) : null;
    const emptySelector = input.getAttribute("data-filter-empty");
    const emptyState = emptySelector ? document.querySelector(emptySelector) : null;
    if (!target) return;
    const updateFilter = () => {
      const query = String(input.value || "").toLowerCase().trim();
      let visibleCount = 0;
      target.querySelectorAll("[data-filter-item]").forEach((item) => {
        const haystack = String(item.getAttribute("data-filter-item") || "");
        item.hidden = query.length > 0 && !haystack.includes(query);
        if (!item.hidden) visibleCount += 1;
      });
      target.querySelectorAll("[data-filter-group]").forEach((group) => {
        let groupVisibleCount = 0;
        group.querySelectorAll("[data-filter-item]").forEach((item) => {
          if (!item.hidden) groupVisibleCount += 1;
        });
        group.hidden = groupVisibleCount === 0;
      });
      target.hidden = visibleCount === 0;
      if (emptyState) {
        emptyState.hidden = !(query.length > 0 && visibleCount === 0);
      }
    };
    input.addEventListener("input", updateFilter);
    updateFilter();
  });

  document.querySelectorAll("[data-load-json-into]").forEach((input) => {
    if (input.dataset.jsonEditorImportBound === "true") return;
    input.addEventListener("change", async () => {
      const selector = input.getAttribute("data-load-json-into");
      const target = selector ? document.querySelector(selector) : null;
      const file = input.files && input.files[0];
      if (!target || !file) return;
      const text = await file.text();
      const editor = window.DashboardJsonEditor && window.DashboardJsonEditor.find(selector);
      if (editor) {
        editor.setValue(text);
        return;
      }
      target.value = text;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  const confirmationForms = new Set();
  document.querySelectorAll("[data-confirm-message]").forEach((button) => {
    const form = button.closest("form");
    if (!form || confirmationForms.has(form)) return;
    confirmationForms.add(form);
    form.addEventListener("submit", async (event) => {
      const submitter = event.submitter && event.submitter.getAttribute ? event.submitter : button;
      const message = submitter.getAttribute("data-confirm-message");
      if (!message) return;
      event.preventDefault();
      const confirmed = await ui.confirm(message);
      if (!confirmed) return;
      if (submitter.formAction) form.action = submitter.formAction;
      form.submit();
    });
  });

  document.querySelectorAll("[data-ai-assist-panel]").forEach((panel) => {
    const ticketId = String(panel.getAttribute("data-ticket-id") || "").trim();
    const resultBox = panel.querySelector("[data-ai-assist-result]");
    const resultTextBox = resultBox ? resultBox.querySelector("[data-ai-assist-result-text]") : null;
    const warningsBox = resultBox ? resultBox.querySelector("[data-ai-assist-warnings]") : null;
    const warningsList = resultBox ? resultBox.querySelector("[data-ai-assist-warning-list]") : null;
    const citationsBox = resultBox ? resultBox.querySelector("[data-ai-assist-citations]") : null;
    const citationsList = resultBox ? resultBox.querySelector("[data-ai-assist-citation-list]") : null;
    const copyButton = resultBox ? resultBox.querySelector("[data-ai-assist-copy]") : null;
    let copyText = "";

    const clearList = (list) => {
      if (!list) return;
      while (list.firstChild) list.firstChild.remove();
    };
    const addListItem = (list, text) => {
      if (!list || !text) return;
      const item = document.createElement("li");
      item.textContent = text;
      list.appendChild(item);
    };
    const citationText = (citation) => {
      if (!citation || typeof citation !== "object") return "";
      const parts = [
        citation.label,
        citation.locator,
        citation.excerpt
      ].map((value) => String(value || "").trim()).filter(Boolean);
      return parts.join(" - ");
    };
    const resetResultDetails = () => {
      if (resultTextBox) resultTextBox.textContent = "";
      clearList(warningsList);
      clearList(citationsList);
      if (warningsBox) warningsBox.hidden = true;
      if (citationsBox) citationsBox.hidden = true;
      if (copyButton) {
        copyButton.hidden = true;
        copyButton.textContent = copyButton.getAttribute("data-copy-label") || "Copy";
      }
      copyText = "";
    };
    const copyToClipboard = async (value) => {
      if (!value) return;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
        return;
      }
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    };
    const setMessage = (message, tone) => {
      if (!resultBox) return;
      resultBox.hidden = false;
      resultBox.className = `inline-alert ${tone || "info"}`;
      resetResultDetails();
      if (resultTextBox) {
        resultTextBox.textContent = message;
      } else {
        resultBox.textContent = message;
      }
    };
    const resultText = (result) => {
      if (!result) return "";
      return result.summary || result.answer || result.draft || result.degradedReason || result.message || "";
    };
    const renderResult = (result, fallback) => {
      const text = resultText(result) || fallback || "AI assist request completed.";
      if (!resultTextBox) {
        setMessage(text, "success");
        return;
      }

      resultBox.hidden = false;
      resultBox.className = `inline-alert ${result && result.outcome === "success" ? "success" : "warning"}`;
      resetResultDetails();
      resultTextBox.textContent = text;

      const warnings = Array.isArray(result?.warnings)
        ? result.warnings.map((warning) => String(warning || "").trim()).filter(Boolean)
        : [];
      warnings.forEach((warning) => addListItem(warningsList, warning));
      if (warningsBox) warningsBox.hidden = warnings.length < 1;

      const citations = Array.isArray(result?.citations)
        ? result.citations.map(citationText).filter(Boolean)
        : [];
      citations.forEach((citation) => addListItem(citationsList, citation));
      if (citationsBox) citationsBox.hidden = citations.length < 1;

      const successfulText = result?.outcome === "success" ? (result.summary || result.answer || result.draft || "") : "";
      copyText = String(successfulText || "").trim();
      if (copyButton) copyButton.hidden = copyText.length < 1;
    };
    if (copyButton) {
      copyButton.addEventListener("click", async () => {
        await copyToClipboard(copyText);
        copyButton.textContent = copyButton.getAttribute("data-copied-label") || "Copied";
      });
    }

    panel.querySelectorAll("[data-ai-assist-form]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const route = String(form.getAttribute("data-ai-route") || "").trim();
        if (!ticketId || !route) return;

        const submit = form.querySelector("button[type='submit']");
        if (submit) submit.disabled = true;
        setMessage("Working...", "info");
        try {
          const formData = new FormData(form);
          const payload = {};
          if (route === "answer-faq") {
            payload.question = String(formData.get("prompt") || "");
          } else if (route === "suggest-reply") {
            payload.instructions = String(formData.get("instructions") || "");
          }
          const response = await ui.requestJson(ui.join(`api/tickets/${encodeURIComponent(ticketId)}/ai/${route}`), {
            method: "POST",
            json: payload
          });
          renderResult(response.result, response.result?.message);
        } catch (error) {
          setMessage(error.message || "AI assist request failed.", "warning");
        } finally {
          if (submit) submit.disabled = false;
        }
      });
    });
  });

  const ticketBulkForm = document.querySelector("[data-ticket-bulk-form]");
  if (ticketBulkForm) {
    const checkboxes = Array.from(document.querySelectorAll('input[data-ticket-row-select][form="ticket-bulk-actions"]'));
    const selectedCount = ticketBulkForm.querySelector("[data-ticket-selected-count]");
    const submitButtons = Array.from(ticketBulkForm.querySelectorAll("[data-ticket-bulk-submit]"));
    const selectionTemplate = selectedCount ? selectedCount.textContent || "__COUNT__ selected" : "__COUNT__ selected";
    const selectedTickets = () => checkboxes.filter((checkbox) => checkbox.checked);
    const updateSelection = () => {
      const count = selectedTickets().length;
      if (selectedCount) {
        selectedCount.textContent = selectionTemplate.replace(/\d+|__COUNT__/, String(count));
      }
      submitButtons.forEach((button) => {
        button.disabled = count < 1;
      });
    };
    const clearSelection = () => {
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
      updateSelection();
    };
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", updateSelection);
    });
    ticketBulkForm.querySelector("[data-ticket-select-visible]")?.addEventListener("click", () => {
      checkboxes.forEach((checkbox) => {
        const row = checkbox.closest("tr");
        checkbox.checked = !row || !row.hidden;
      });
      updateSelection();
    });
    ticketBulkForm.querySelector("[data-ticket-clear-selection]")?.addEventListener("click", clearSelection);
    ticketBulkForm.addEventListener("submit", (event) => {
      if (selectedTickets().length > 0) return;
      event.preventDefault();
      ui.showToast("Select at least one ticket.", "warning");
    });

    const clearOnNavigation = (event) => {
      const target = event.target;
      if (target?.closest?.(".ticket-filter-shell form") || target?.closest?.(".pagination-bar a")) {
        clearSelection();
      }
    };
    document.addEventListener("submit", clearOnNavigation, true);
    document.addEventListener("click", clearOnNavigation, true);
    updateSelection();
  }

  const ticketWorkbench = document.querySelector(".ticket-workbench-shell");
  if (ticketWorkbench) {
    const basePath = String(document.body?.dataset?.basePath || "").replace(/\/$/, "");
    const ticketsPath = `${basePath === "/" ? "" : basePath}/admin/tickets`;
    const viewStorageKey = "ot-dashboard:ticket-workbench:last-view";
    const filterKeys = ["q", "status", "transport", "teamId", "assigneeId", "optionId", "panelId", "creatorId", "sort", "limit"];
    const validValues = {
      status: new Set(["all", "open", "closed", "claimed", "unclaimed"]),
      transport: new Set(["all", "channel_text", "private_thread"]),
      sort: new Set(["opened-desc", "opened-asc", "activity-desc", "activity-asc"]),
      limit: new Set(["10", "25", "50", "100"])
    };
    const normalizedViewParams = (searchParams) => {
      const params = new URLSearchParams();
      filterKeys.forEach((key) => {
        const value = String(searchParams.get(key) || "").trim();
        if (!value) return;
        if (validValues[key] && !validValues[key].has(value)) return;
        params.set(key, value);
      });
      return params;
    };

    const currentUrl = new URL(window.location.href);
    if (currentUrl.pathname === ticketsPath) {
      const currentView = normalizedViewParams(currentUrl.searchParams);
      if ([...currentView.keys()].length > 0) {
        localStorage.setItem(viewStorageKey, currentView.toString());
      } else if (!currentUrl.searchParams.has("msg")) {
        const saved = new URLSearchParams(localStorage.getItem(viewStorageKey) || "");
        const savedView = normalizedViewParams(saved);
        if ([...savedView.keys()].length > 0) {
          window.location.replace(`${ticketsPath}?${savedView.toString()}`);
        }
      }
    }
  }
})();
