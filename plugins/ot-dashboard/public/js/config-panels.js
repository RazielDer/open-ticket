document.addEventListener("DOMContentLoaded", () => {
  const ui = window.DashboardUI;
  if (!ui) return;

  const panels = ui.readJson("panels-data", []);
  const availableOptions = ui.readJson("available-options-data", []);
  const messages = ui.readJson("page-messages", {});
  const contracts = ui.readJson("page-contracts", { dropdownOptionType: "ticket" });
  const form = document.getElementById("panelForm");
  const dirtyTracker = form ? ui.trackDirty(form) : null;

  if (!form) return;

  const describeLayouts = Array.from(document.getElementById("describeLayout")?.options || []).map((option) => option.value);
  const optionCheckboxes = Array.from(document.querySelectorAll("[data-option-id]"));
  const optionById = new Map(availableOptions.map((option) => [String(option.id), option]));
  const inventoryButtons = Array.from(document.querySelectorAll("[data-panel-select]"));

  const fields = {
    editIndex: document.getElementById("panelEditIndex"),
    workspaceTitle: document.getElementById("panelWorkspaceTitle"),
    id: document.getElementById("panelId"),
    name: document.getElementById("panelName"),
    dropdown: document.getElementById("panelDropdown"),
    text: document.getElementById("panelText"),
    embedEnabled: document.getElementById("embedEnabled"),
    embedTitle: document.getElementById("embedTitle"),
    embedDescription: document.getElementById("embedDescription"),
    embedColor: document.getElementById("embedColor"),
    embedUrl: document.getElementById("embedUrl"),
    embedImage: document.getElementById("embedImage"),
    embedThumbnail: document.getElementById("embedThumbnail"),
    embedFooter: document.getElementById("embedFooter"),
    embedTimestamp: document.getElementById("embedTimestamp"),
    dropdownPlaceholder: document.getElementById("dropdownPlaceholder"),
    describeLayout: document.getElementById("describeLayout"),
    describeCustomTitle: document.getElementById("describeCustomTitle"),
    maxTicketsText: document.getElementById("maxTicketsText"),
    maxTicketsEmbed: document.getElementById("maxTicketsEmbed"),
    describeInText: document.getElementById("describeInText"),
    describeInFields: document.getElementById("describeInFields"),
    describeInDescription: document.getElementById("describeInDescription"),
    orderPosition: document.getElementById("panelOrderPosition"),
    displayMode: document.getElementById("panelDisplayMode"),
    selectedOptionCount: document.getElementById("selectedOptionCount"),
    selectedOptionCountPill: document.getElementById("selectedOptionCountPill"),
    selectedOptionsEmpty: document.getElementById("selectedOptionsEmpty"),
    selectedOptionsList: document.getElementById("selectedOptionsList"),
    previewText: document.getElementById("panelPreviewText"),
    previewEmbedSummary: document.getElementById("panelPreviewEmbedSummary"),
    previewMeta: document.getElementById("panelPreviewMeta"),
    dropdownWarning: document.getElementById("dropdownCompatibilityWarning"),
    duplicateButton: document.getElementById("duplicatePanelButton"),
    moveUpButton: document.getElementById("movePanelUpButton"),
    moveDownButton: document.getElementById("movePanelDownButton"),
    deleteButton: document.getElementById("deletePanelButton")
  };

  const defaultWorkspaceTitle = fields.workspaceTitle?.textContent || "";
  const defaultOrderPosition = fields.orderPosition?.textContent || "";
  const defaultEmbedColor = "#000000";
  const hexColorPattern = /^#[0-9a-f]{6}$/i;
  let selectedIndex = -1;

  function normalizeEmbedColor(value) {
    const candidate = String(value || "").trim();
    return hexColorPattern.test(candidate) ? candidate : defaultEmbedColor;
  }

  function getSelectedOptionIds() {
    return optionCheckboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => String(checkbox.dataset.optionId || "").trim())
      .filter(Boolean);
  }

  function setSelectedOptionIds(optionIds) {
    const selected = new Set(Array.isArray(optionIds) ? optionIds.map((value) => String(value)) : []);
    optionCheckboxes.forEach((checkbox) => {
      checkbox.checked = selected.has(String(checkbox.dataset.optionId || ""));
    });
  }

  function updateWorkspaceTitle() {
    const name = String(fields.name.value || "").trim();
    fields.workspaceTitle.textContent = name || defaultWorkspaceTitle;
  }

  function getSelectedOptionDetails() {
    return getSelectedOptionIds().map((optionId) => {
      const option = optionById.get(optionId);
      if (option) return option;

      return {
        id: optionId,
        name: optionId,
        type: "unknown",
        description: "",
        emoji: ""
      };
    });
  }

  function getInvalidDropdownOptions() {
    if (!fields.dropdown.checked) return [];
    return getSelectedOptionDetails().filter((option) => option.type && option.type !== contracts.dropdownOptionType);
  }

  function updatePillList(container, emptyState, values) {
    container.innerHTML = "";
    if (!values.length) {
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;
    values.forEach((value) => {
      const pill = document.createElement("span");
      pill.className = "pill-tag muted";
      pill.textContent = value;
      container.appendChild(pill);
    });
  }

  function syncInventorySelection() {
    inventoryButtons.forEach((button) => {
      const index = Number(button.dataset.index);
      const active = index === selectedIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function renderSelectionState() {
    updateWorkspaceTitle();
    syncInventorySelection();

    const isExistingPanel = selectedIndex >= 0;
    const selectedOptions = getSelectedOptionDetails();
    const invalidDropdownOptions = getInvalidDropdownOptions();
    const displayModeLabel = fields.dropdown.checked
      ? (fields.displayMode.dataset.dropdownLabel || "Dropdown")
      : (fields.displayMode.dataset.buttonsLabel || "Buttons");
    const previewText = String(fields.text.value || "").trim();
    const embedEnabled = fields.embedEnabled.checked;
    const previewTitle = String(fields.embedTitle.value || "").trim();
    const previewDescription = String(fields.embedDescription.value || "").trim();
    const previewMetaParts = [];

    fields.orderPosition.textContent = isExistingPanel
      ? `${selectedIndex + 1} / ${panels.length}`
      : defaultOrderPosition;
    fields.displayMode.textContent = displayModeLabel;
    fields.selectedOptionCount.textContent = String(selectedOptions.length);
    fields.selectedOptionCountPill.textContent = String(selectedOptions.length);

    updatePillList(
      fields.selectedOptionsList,
      fields.selectedOptionsEmpty,
      selectedOptions.map((option) => `${option.name} (${option.id}) [${option.type || "unknown"}]`)
    );

    fields.previewText.textContent = previewText || fields.previewText.dataset.emptyLabel || "";

    if (embedEnabled && (previewTitle || previewDescription)) {
      fields.previewEmbedSummary.textContent = [previewTitle, previewDescription].filter(Boolean).join(" | ");
    } else {
      fields.previewEmbedSummary.textContent = fields.previewEmbedSummary.dataset.emptyLabel || "";
    }

    if (fields.dropdown.checked) {
      previewMetaParts.push(displayModeLabel);
      previewMetaParts.push(
        fields.dropdownPlaceholder.value.trim()
          ? `${fields.previewMeta.dataset.placeholderLabel || "Placeholder"}: ${fields.dropdownPlaceholder.value.trim()}`
          : `${fields.previewMeta.dataset.placeholderLabel || "Placeholder"}: ${fields.previewMeta.dataset.noPlaceholderLabel || "None"}`
      );
    } else {
      previewMetaParts.push(displayModeLabel);
      previewMetaParts.push(`${selectedOptions.length} option(s)`);
    }
    if (embedEnabled) {
      previewMetaParts.push(fields.embedTimestamp.checked ? "Timestamp on" : "Timestamp off");
    }

    fields.previewMeta.textContent = previewMetaParts.join(" · ");
    fields.dropdownWarning.hidden = invalidDropdownOptions.length === 0;

    fields.duplicateButton.disabled = !isExistingPanel;
    fields.moveUpButton.disabled = !isExistingPanel || selectedIndex <= 0;
    fields.moveDownButton.disabled = !isExistingPanel || selectedIndex >= panels.length - 1;
    fields.deleteButton.disabled = !isExistingPanel;
  }

  function resetForm() {
    selectedIndex = -1;
    fields.editIndex.value = "-1";
    form.reset();
    fields.embedEnabled.checked = true;
    fields.maxTicketsEmbed.checked = true;
    fields.describeInFields.checked = true;
    fields.describeLayout.value = "normal";
    fields.embedColor.value = "#000000";
    setSelectedOptionIds([]);
    renderSelectionState();
  }

  function fillForm(panel, index) {
    selectedIndex = index;
    fields.editIndex.value = String(index);
    fields.id.value = panel.id || "";
    fields.name.value = panel.name || "";
    fields.dropdown.checked = Boolean(panel.dropdown);
    fields.text.value = panel.text || "";
    fields.embedEnabled.checked = panel.embed?.enabled !== false;
    fields.embedTitle.value = panel.embed?.title || "";
    fields.embedDescription.value = panel.embed?.description || "";
    fields.embedColor.value = normalizeEmbedColor(panel.embed?.customColor);
    fields.embedUrl.value = panel.embed?.url || "";
    fields.embedImage.value = panel.embed?.image || "";
    fields.embedThumbnail.value = panel.embed?.thumbnail || "";
    fields.embedFooter.value = panel.embed?.footer || "";
    fields.embedTimestamp.checked = Boolean(panel.embed?.timestamp);
    fields.dropdownPlaceholder.value = panel.settings?.dropdownPlaceholder || "";
    fields.describeLayout.value = panel.settings?.describeOptionsLayout || "normal";
    fields.describeCustomTitle.value = panel.settings?.describeOptionsCustomTitle || "";
    fields.maxTicketsText.checked = Boolean(panel.settings?.enableMaxTicketsWarningInText);
    fields.maxTicketsEmbed.checked = panel.settings?.enableMaxTicketsWarningInEmbed !== false;
    fields.describeInText.checked = Boolean(panel.settings?.describeOptionsInText);
    fields.describeInFields.checked = panel.settings?.describeOptionsInEmbedFields !== false;
    fields.describeInDescription.checked = Boolean(panel.settings?.describeOptionsInEmbedDescription);
    setSelectedOptionIds(panel.options || []);
    renderSelectionState();
  }

  function collectPanel() {
    const optionIds = getSelectedOptionIds();
    if (!optionIds.length) throw new Error(messages["panels.flash.validationOptions"] || "Select at least one option.");
    if (!describeLayouts.includes(fields.describeLayout.value)) {
      throw new Error(messages["panels.flash.validationLayout"] || "Choose a valid options description layout.");
    }

    const availableById = new Map(availableOptions.map((option) => [String(option.id), String(option.type || "")]));
    const unknownOptionIds = optionIds.filter((optionId) => availableById.size > 0 && !availableById.has(String(optionId)));
    if (unknownOptionIds.length > 0) {
      throw new Error(
        messages["panels.flash.validationUnknownOptions"] || `Unknown option IDs: ${unknownOptionIds.join(", ")}`
      );
    }
    if (fields.dropdown.checked) {
      const invalidDropdownOptions = optionIds.filter((optionId) => {
        const type = availableById.get(String(optionId));
        return type && type !== contracts.dropdownOptionType;
      });
      if (invalidDropdownOptions.length > 0) {
        throw new Error(
          messages["panels.flash.validationDropdownOptions"] ||
            `Dropdown panels only support ${contracts.dropdownOptionType} options.`
        );
      }
    }

    return {
      id: fields.id.value.trim(),
      name: fields.name.value.trim(),
      dropdown: fields.dropdown.checked,
      options: optionIds,
      text: fields.text.value.trim(),
      embed: {
        enabled: fields.embedEnabled.checked,
        title: fields.embedTitle.value.trim(),
        description: fields.embedDescription.value.trim(),
        customColor: normalizeEmbedColor(fields.embedColor.value),
        url: fields.embedUrl.value.trim(),
        image: fields.embedImage.value.trim(),
        thumbnail: fields.embedThumbnail.value.trim(),
        footer: fields.embedFooter.value.trim(),
        timestamp: fields.embedTimestamp.checked
      },
      settings: {
        dropdownPlaceholder: fields.dropdownPlaceholder.value.trim(),
        enableMaxTicketsWarningInText: fields.maxTicketsText.checked,
        enableMaxTicketsWarningInEmbed: fields.maxTicketsEmbed.checked,
        describeOptionsLayout: fields.describeLayout.value,
        describeOptionsCustomTitle: fields.describeCustomTitle.value.trim(),
        describeOptionsInText: fields.describeInText.checked,
        describeOptionsInEmbedFields: fields.describeInFields.checked,
        describeOptionsInEmbedDescription: fields.describeInDescription.checked
      }
    };
  }

  function buildWorkspaceLocation(selectId, saved) {
    const next = new URL(window.location.href);
    next.searchParams.delete("select");
    next.searchParams.delete("saved");
    if (saved) next.searchParams.set("saved", "1");
    if (selectId) next.searchParams.set("select", selectId);
    return `${next.pathname}${next.search}`;
  }

  function buildDuplicateId(sourceId) {
    const raw = String(sourceId || "panel").trim() || "panel";
    const base = `${raw}-copy`;
    const existingIds = new Set(panels.map((panel) => String(panel.id || "")));
    let candidate = base;
    let counter = 2;

    while (existingIds.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    return candidate;
  }

  function buildDuplicateName(sourceName) {
    const raw = String(sourceName || "Panel").trim() || "Panel";
    const base = `${raw} copy`;
    const existingNames = new Set(panels.map((panel) => String(panel.name || "")));
    let candidate = base;
    let counter = 2;

    while (existingNames.has(candidate)) {
      candidate = `${base} ${counter}`;
      counter += 1;
    }

    return candidate;
  }

  async function savePanel(editIndex, panel) {
    const result = await ui.requestJson(ui.join("api/panels/save"), {
      method: "POST",
      json: { panel, editIndex }
    });
    dirtyTracker?.clear();
    window.location.assign(buildWorkspaceLocation(result.id, true));
  }

  async function reorderActivePanel(direction) {
    if (selectedIndex < 0) return;

    const nextIndex = selectedIndex + direction;
    if (nextIndex < 0 || nextIndex >= panels.length) return;

    const orderedIds = panels.map((panel) => String(panel.id || ""));
    const [currentId] = orderedIds.splice(selectedIndex, 1);
    orderedIds.splice(nextIndex, 0, currentId);

    await ui.requestJson(ui.join("api/panels/reorder"), {
      method: "POST",
      json: { orderedIds }
    });
    dirtyTracker?.clear();
    window.location.assign(buildWorkspaceLocation(currentId, true));
  }

  document.getElementById("createPanelButton")?.addEventListener("click", () => {
    resetForm();
    fields.id.focus();
  });

  inventoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (Number.isInteger(index) && panels[index]) {
        fillForm(panels[index], index);
      }
    });
  });

  fields.dropdown.addEventListener("change", renderSelectionState);
  fields.name.addEventListener("input", updateWorkspaceTitle);
  form.addEventListener("input", renderSelectionState);
  form.addEventListener("change", renderSelectionState);

  fields.duplicateButton.addEventListener("click", async () => {
    if (selectedIndex < 0) return;

    try {
      const panel = collectPanel();
      panel.id = buildDuplicateId(panel.id);
      panel.name = buildDuplicateName(panel.name);
      await savePanel(-1, panel);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.moveUpButton.addEventListener("click", async () => {
    try {
      await reorderActivePanel(-1);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.moveDownButton.addEventListener("click", async () => {
    try {
      await reorderActivePanel(1);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.deleteButton.addEventListener("click", async () => {
    if (selectedIndex < 0) return;

    const okay = await ui.confirm(messages["panels.flash.deleteConfirm"] || "Delete this panel?");
    if (!okay) return;

    const nextSelectedId =
      panels[selectedIndex + 1]?.id ||
      panels[selectedIndex - 1]?.id ||
      "";

    try {
      await ui.requestJson(ui.join(`api/panels/delete/${selectedIndex}`), { method: "POST" });
      dirtyTracker?.clear();
      window.location.assign(buildWorkspaceLocation(nextSelectedId, true));
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const panel = collectPanel();
      await savePanel(Number(fields.editIndex.value), panel);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  const requestedId = new URL(window.location.href).searchParams.get("select");
  const requestedIndex = requestedId
    ? panels.findIndex((panel) => String(panel.id || "") === requestedId)
    : -1;

  if (requestedIndex >= 0) {
    fillForm(panels[requestedIndex], requestedIndex);
  } else if (panels.length) {
    fillForm(panels[0], 0);
  } else {
    resetForm();
  }
});
