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
    const setResult = (message, tone) => {
      if (!resultBox) return;
      resultBox.hidden = false;
      resultBox.className = `inline-alert ${tone || "info"}`;
      resultBox.textContent = message;
    };
    const resultText = (result) => {
      if (!result) return "";
      return result.summary || result.answer || result.draft || result.degradedReason || result.message || "";
    };

    panel.querySelectorAll("[data-ai-assist-form]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const route = String(form.getAttribute("data-ai-route") || "").trim();
        if (!ticketId || !route) return;

        const submit = form.querySelector("button[type='submit']");
        if (submit) submit.disabled = true;
        setResult("Working...", "info");
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
          const text = resultText(response.result);
          setResult(text || response.result?.message || "AI assist request completed.", "success");
        } catch (error) {
          setResult(error.message || "AI assist request failed.", "warning");
        } finally {
          if (submit) submit.disabled = false;
        }
      });
    });
  });
})();
