document.addEventListener("DOMContentLoaded", () => {
  const ui = window.DashboardUI;
  if (!ui) return;

  const savedStyle = ui.readJson("transcript-saved-style", null);
  const presetCatalog = ui.readJson("transcript-style-presets", []);
  ui.readJson("transcript-editor-messages", {});

  const fields = {
    backgroundEnable: document.querySelector('[name="htmlTranscriptStyle.background.enableCustomBackground"]'),
    backgroundColor: document.querySelector('[name="htmlTranscriptStyle.background.backgroundColor"]'),
    backgroundImage: document.querySelector('[name="htmlTranscriptStyle.background.backgroundImage"]'),
    headerEnable: document.querySelector('[name="htmlTranscriptStyle.header.enableCustomHeader"]'),
    headerBackground: document.querySelector('[name="htmlTranscriptStyle.header.backgroundColor"]'),
    headerAccent: document.querySelector('[name="htmlTranscriptStyle.header.decoColor"]'),
    headerText: document.querySelector('[name="htmlTranscriptStyle.header.textColor"]'),
    statsEnable: document.querySelector('[name="htmlTranscriptStyle.stats.enableCustomStats"]'),
    statsBackground: document.querySelector('[name="htmlTranscriptStyle.stats.backgroundColor"]'),
    statsKeyText: document.querySelector('[name="htmlTranscriptStyle.stats.keyTextColor"]'),
    statsValueText: document.querySelector('[name="htmlTranscriptStyle.stats.valueTextColor"]'),
    statsHideBackground: document.querySelector('[name="htmlTranscriptStyle.stats.hideBackgroundColor"]'),
    statsHideText: document.querySelector('[name="htmlTranscriptStyle.stats.hideTextColor"]'),
    faviconEnable: document.querySelector('[name="htmlTranscriptStyle.favicon.enableCustomFavicon"]'),
    faviconImage: document.querySelector('[name="htmlTranscriptStyle.favicon.imageUrl"]')
  };

  function setCheckbox(element, value) {
    if (!element) return;
    element.checked = Boolean(value);
  }

  function setValue(element, value) {
    if (!element) return;
    element.value = String(value || "");
  }

  function applyDraft(draft) {
    if (!draft) return;

    setCheckbox(fields.backgroundEnable, draft.background?.enableCustomBackground);
    setValue(fields.backgroundColor, draft.background?.backgroundColor);
    setValue(fields.backgroundImage, draft.background?.backgroundImage);

    setCheckbox(fields.headerEnable, draft.header?.enableCustomHeader);
    setValue(fields.headerBackground, draft.header?.backgroundColor);
    setValue(fields.headerAccent, draft.header?.decoColor);
    setValue(fields.headerText, draft.header?.textColor);

    setCheckbox(fields.statsEnable, draft.stats?.enableCustomStats);
    setValue(fields.statsBackground, draft.stats?.backgroundColor);
    setValue(fields.statsKeyText, draft.stats?.keyTextColor);
    setValue(fields.statsValueText, draft.stats?.valueTextColor);
    setValue(fields.statsHideBackground, draft.stats?.hideBackgroundColor);
    setValue(fields.statsHideText, draft.stats?.hideTextColor);

    setCheckbox(fields.faviconEnable, draft.favicon?.enableCustomFavicon);
    setValue(fields.faviconImage, draft.favicon?.imageUrl);
  }

  document.querySelectorAll("[data-apply-transcript-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const presetId = String(button.getAttribute("data-apply-transcript-preset") || "");
      const preset = Array.isArray(presetCatalog)
        ? presetCatalog.find((candidate) => String(candidate?.id || "") === presetId)
        : null;

      if (preset?.draft) {
        applyDraft(preset.draft);
      }
    });
  });

  document.getElementById("resetTranscriptStyle")?.addEventListener("click", () => {
    applyDraft(savedStyle);
  });
});
