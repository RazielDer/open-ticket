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

  document.querySelectorAll("[data-confirm-message]").forEach((button) => {
    const form = button.closest("form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const confirmed = await ui.confirm(button.getAttribute("data-confirm-message"));
      if (confirmed) form.submit();
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
})();
