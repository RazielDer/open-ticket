document.addEventListener("DOMContentLoaded", () => {
  const ui = window.DashboardUI;
  if (!ui) return;

  const questions = ui.readJson("questions-data", []);
  const dependencyGraph = ui.readJson("dependency-graph-data", { questionOptions: {} });
  const messages = ui.readJson("page-messages", {});
  const contracts = ui.readJson("page-contracts", {
    idPattern: "^[A-Za-z0-9-éèçàêâôûî]+$",
    idMinLength: 3,
    idMaxLength: 40,
    nameMinLength: 3,
    nameMaxLength: 45,
    placeholderMaxLength: 100,
    lengthMin: 0,
    lengthMax: 1024
  });
  const form = document.getElementById("questionForm");
  const dirtyTracker = form ? ui.trackDirty(form) : null;

  if (!form) return;

  const idPattern = new RegExp(contracts.idPattern);
  const inventoryButtons = Array.from(document.querySelectorAll("[data-question-select]"));

  const fields = {
    editIndex: document.getElementById("questionEditIndex"),
    originalId: document.getElementById("questionOriginalId"),
    workspaceTitle: document.getElementById("questionWorkspaceTitle"),
    id: document.getElementById("questionId"),
    name: document.getElementById("questionName"),
    type: document.getElementById("questionType"),
    required: document.getElementById("questionRequired"),
    placeholder: document.getElementById("questionPlaceholder"),
    lengthEnabled: document.getElementById("lengthEnabled"),
    minLength: document.getElementById("minLength"),
    maxLength: document.getElementById("maxLength"),
    orderPosition: document.getElementById("questionOrderPosition"),
    typeSummary: document.getElementById("questionTypeSummary"),
    usageCount: document.getElementById("questionUsageCount"),
    usageCountPill: document.getElementById("questionUsageCountPill"),
    referenceWarning: document.getElementById("questionReferenceWarning"),
    usedByOptionsEmpty: document.getElementById("usedByOptionsEmpty"),
    usedByOptionsList: document.getElementById("usedByOptionsList"),
    duplicateButton: document.getElementById("duplicateQuestionButton"),
    moveUpButton: document.getElementById("moveQuestionUpButton"),
    moveDownButton: document.getElementById("moveQuestionDownButton"),
    deleteButton: document.getElementById("deleteQuestionButton")
  };

  const defaultWorkspaceTitle = fields.workspaceTitle?.textContent || "";
  const defaultOrderPosition = fields.orderPosition?.textContent || "";
  let selectedIndex = -1;

  function getCurrentUsage() {
    const referenceId = String(fields.originalId.value || "").trim();
    return referenceId ? dependencyGraph.questionOptions?.[referenceId] || [] : [];
  }

  function updateWorkspaceTitle() {
    const name = String(fields.name.value || "").trim();
    fields.workspaceTitle.textContent = name || defaultWorkspaceTitle;
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

    const usages = getCurrentUsage();
    const isExistingQuestion = selectedIndex >= 0;

    fields.orderPosition.textContent = isExistingQuestion
      ? `${selectedIndex + 1} / ${questions.length}`
      : defaultOrderPosition;
    fields.typeSummary.textContent = String(fields.type.value || "");
    fields.usageCount.textContent = String(usages.length);
    fields.usageCountPill.textContent = String(usages.length);
    fields.referenceWarning.hidden = usages.length === 0;

    updatePillList(
      fields.usedByOptionsList,
      fields.usedByOptionsEmpty,
      usages.map((reference) => `${reference.name} (${reference.id})${reference.type ? ` [${reference.type}]` : ""}`)
    );

    fields.duplicateButton.disabled = !isExistingQuestion;
    fields.moveUpButton.disabled = !isExistingQuestion || selectedIndex <= 0;
    fields.moveDownButton.disabled = !isExistingQuestion || selectedIndex >= questions.length - 1;
    fields.deleteButton.disabled = !isExistingQuestion || usages.length > 0;
  }

  function resetForm() {
    selectedIndex = -1;
    fields.editIndex.value = "-1";
    fields.originalId.value = "";
    form.reset();
    fields.required.checked = true;
    fields.minLength.value = 0;
    fields.maxLength.value = 1000;
    renderSelectionState();
  }

  function fillForm(question, index) {
    selectedIndex = index;
    fields.editIndex.value = String(index);
    fields.originalId.value = question.id || "";
    fields.id.value = question.id || "";
    fields.name.value = question.name || "";
    fields.type.value = question.type || "short";
    fields.required.checked = question.required !== false;
    fields.placeholder.value = question.placeholder || "";
    fields.lengthEnabled.checked = Boolean(question.length?.enabled);
    fields.minLength.value = question.length?.min ?? 0;
    fields.maxLength.value = question.length?.max ?? 1000;
    renderSelectionState();
  }

  function collectQuestion() {
    const id = fields.id.value.trim();
    const name = fields.name.value.trim();
    const placeholder = fields.placeholder.value.trim();

    if (!id) throw new Error(messages["questions.flash.validationId"] || "Enter an ID.");
    if (id.length < contracts.idMinLength || id.length > contracts.idMaxLength) {
      throw new Error(messages["questions.flash.validationIdLength"] || "Question IDs are outside the allowed length.");
    }
    if (!idPattern.test(id)) {
      throw new Error(messages["questions.flash.validationIdFormat"] || "Question IDs use unsupported characters.");
    }
    if (!name) throw new Error(messages["questions.flash.validationName"] || "Enter a name.");
    if (name.length < contracts.nameMinLength || name.length > contracts.nameMaxLength) {
      throw new Error(messages["questions.flash.validationNameLength"] || "Question names are outside the allowed length.");
    }
    if (placeholder.length > contracts.placeholderMaxLength) {
      throw new Error(messages["questions.flash.validationPlaceholderLength"] || "Question placeholders are too long.");
    }

    const min = Number(fields.minLength.value || 0);
    const max = Number(fields.maxLength.value || 1000);
    if (min < contracts.lengthMin || min > contracts.lengthMax) {
      throw new Error(messages["questions.flash.validationMinimum"] || "Minimum length is outside the allowed range.");
    }
    if (max < 1 || max > contracts.lengthMax) {
      throw new Error(messages["questions.flash.validationMaximum"] || "Maximum length is outside the allowed range.");
    }
    if (min > max) throw new Error(messages["questions.flash.validationLength"] || "Invalid length range.");

    return {
      id,
      name,
      type: fields.type.value,
      required: fields.required.checked,
      placeholder,
      length: {
        enabled: fields.lengthEnabled.checked,
        min,
        max
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
    const raw = String(sourceId || "question").trim() || "question";
    const base = `${raw}-copy`;
    const existingIds = new Set(questions.map((question) => String(question.id || "")));
    let candidate = base;
    let counter = 2;

    while (existingIds.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    return candidate;
  }

  function buildDuplicateName(sourceName) {
    const raw = String(sourceName || "Question").trim() || "Question";
    const base = `${raw} copy`;
    const existingNames = new Set(questions.map((question) => String(question.name || "")));
    let candidate = base;
    let counter = 2;

    while (existingNames.has(candidate)) {
      candidate = `${base} ${counter}`;
      counter += 1;
    }

    return candidate;
  }

  async function saveQuestion(editIndex, question) {
    const result = await ui.requestJson(ui.join("api/questions/save"), {
      method: "POST",
      json: { question, editIndex }
    });
    dirtyTracker?.clear();
    window.location.assign(buildWorkspaceLocation(result.id, true));
  }

  async function reorderActiveQuestion(direction) {
    if (selectedIndex < 0) return;

    const nextIndex = selectedIndex + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;

    const orderedIds = questions.map((question) => String(question.id || ""));
    const [currentId] = orderedIds.splice(selectedIndex, 1);
    orderedIds.splice(nextIndex, 0, currentId);

    await ui.requestJson(ui.join("api/questions/reorder"), {
      method: "POST",
      json: { orderedIds }
    });
    dirtyTracker?.clear();
    window.location.assign(buildWorkspaceLocation(currentId, true));
  }

  document.getElementById("createQuestionButton")?.addEventListener("click", () => {
    resetForm();
    fields.id.focus();
  });

  inventoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (Number.isInteger(index) && questions[index]) {
        fillForm(questions[index], index);
      }
    });
  });

  fields.name.addEventListener("input", updateWorkspaceTitle);
  form.addEventListener("input", renderSelectionState);
  form.addEventListener("change", renderSelectionState);

  fields.duplicateButton.addEventListener("click", async () => {
    if (selectedIndex < 0) return;

    try {
      const question = collectQuestion();
      question.id = buildDuplicateId(question.id);
      question.name = buildDuplicateName(question.name);
      await saveQuestion(-1, question);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.moveUpButton.addEventListener("click", async () => {
    try {
      await reorderActiveQuestion(-1);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.moveDownButton.addEventListener("click", async () => {
    try {
      await reorderActiveQuestion(1);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.deleteButton.addEventListener("click", async () => {
    if (selectedIndex < 0) return;

    const okay = await ui.confirm(messages["questions.flash.deleteConfirm"] || "Delete this question?");
    if (!okay) return;

    const nextSelectedId =
      questions[selectedIndex + 1]?.id ||
      questions[selectedIndex - 1]?.id ||
      "";

    try {
      await ui.requestJson(ui.join(`api/questions/delete/${selectedIndex}`), { method: "POST" });
      dirtyTracker?.clear();
      window.location.assign(buildWorkspaceLocation(nextSelectedId, true));
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const question = collectQuestion();
      await saveQuestion(Number(fields.editIndex.value), question);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  const requestedId = new URL(window.location.href).searchParams.get("select");
  const requestedIndex = requestedId
    ? questions.findIndex((question) => String(question.id || "") === requestedId)
    : -1;

  if (requestedIndex >= 0) {
    fillForm(questions[requestedIndex], requestedIndex);
  } else if (questions.length) {
    fillForm(questions[0], 0);
  } else {
    resetForm();
  }
});
