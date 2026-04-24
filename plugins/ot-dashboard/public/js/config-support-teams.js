document.addEventListener("DOMContentLoaded", () => {
  const ui = window.DashboardUI;
  if (!ui) return;

  const supportTeams = ui.readJson("support-teams-data", []);
  const dependencyGraph = ui.readJson("dependency-graph-data", { supportTeamOptions: {} });
  const messages = ui.readJson("page-messages", {});
  const form = document.getElementById("supportTeamForm");
  const dirtyTracker = form ? ui.trackDirty(form) : null;

  if (!form) return;

  const fields = {
    editIndex: document.getElementById("supportTeamEditIndex"),
    originalId: document.getElementById("supportTeamOriginalId"),
    id: document.getElementById("supportTeamId"),
    name: document.getElementById("supportTeamName"),
    roleIds: document.getElementById("supportTeamRoleIds"),
    assignmentStrategy: document.getElementById("supportTeamAssignmentStrategy"),
    workspaceTitle: document.getElementById("supportTeamWorkspaceTitle"),
    referencesEmpty: document.getElementById("referencingOptionsEmpty"),
    referencesList: document.getElementById("referencingOptionsList"),
    referencesCount: document.getElementById("referencingOptionsCountPill"),
    moveUpButton: document.getElementById("moveSupportTeamUpButton"),
    moveDownButton: document.getElementById("moveSupportTeamDownButton"),
    deleteButton: document.getElementById("deleteSupportTeamButton")
  };

  const inventoryButtons = Array.from(document.querySelectorAll("[data-support-team-select]"));
  const assignmentStrategies = Array.from(fields.assignmentStrategy?.options || []).map((option) => option.value);
  const defaultTitle = fields.workspaceTitle?.textContent || "";
  let selectedIndex = -1;

  function getCurrentReferences() {
    const id = String(fields.originalId.value || fields.id.value || "").trim();
    return id ? (dependencyGraph.supportTeamOptions?.[id] || []) : [];
  }

  function updateReferences() {
    const references = getCurrentReferences();
    fields.referencesCount.textContent = String(references.length);
    fields.referencesList.innerHTML = "";
    fields.referencesEmpty.hidden = references.length > 0;
    references.forEach((reference) => {
      const pill = document.createElement("span");
      pill.className = "pill-tag muted";
      pill.textContent = `${reference.name} (${reference.id})`;
      fields.referencesList.appendChild(pill);
    });
    fields.deleteButton.disabled = selectedIndex < 0 || references.length > 0;
  }

  function updateInventorySelection() {
    inventoryButtons.forEach((button) => {
      const active = Number(button.dataset.index) === selectedIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function renderSelectionState() {
    const isExisting = selectedIndex >= 0;
    fields.workspaceTitle.textContent = fields.name.value.trim() || defaultTitle;
    fields.moveUpButton.disabled = !isExisting || selectedIndex <= 0;
    fields.moveDownButton.disabled = !isExisting || selectedIndex >= supportTeams.length - 1;
    updateReferences();
    updateInventorySelection();
  }

  function resetForm() {
    selectedIndex = -1;
    form.reset();
    fields.editIndex.value = "-1";
    fields.originalId.value = "";
    fields.id.value = "";
    fields.name.value = "";
    fields.roleIds.value = "[]";
    fields.assignmentStrategy.value = "manual";
    renderSelectionState();
  }

  function fillForm(team, index) {
    selectedIndex = index;
    fields.editIndex.value = String(index);
    fields.originalId.value = team.id || "";
    fields.id.value = team.id || "";
    fields.name.value = team.name || "";
    fields.roleIds.value = ui.stringifyList(team.roleIds || []);
    fields.assignmentStrategy.value = team.assignmentStrategy || "manual";
    renderSelectionState();
  }

  function collectTeam() {
    const id = fields.id.value.trim();
    const name = fields.name.value.trim();
    const roleIds = ui.parseList(fields.roleIds.value);
    const assignmentStrategy = fields.assignmentStrategy.value;

    if (!id) throw new Error(messages["supportTeams.flash.validationId"] || "Enter a support-team id.");
    if (!name) throw new Error(messages["supportTeams.flash.validationName"] || "Enter a support-team name.");
    if (roleIds.length < 1) throw new Error(messages["supportTeams.flash.validationRoles"] || "Add at least one support-team role id.");
    if (!assignmentStrategies.includes(assignmentStrategy)) throw new Error(messages["supportTeams.flash.validationStrategy"] || "Choose a valid assignment strategy.");

    return { id, name, roleIds, assignmentStrategy };
  }

  function buildWorkspaceLocation(selectedId, saved) {
    const params = new URLSearchParams();
    if (selectedId) params.set("select", selectedId);
    if (saved) params.set("saved", "1");
    const query = params.toString();
    return query ? `${window.location.pathname}?${query}` : window.location.pathname;
  }

  async function saveTeam(editIndex, team) {
    const result = await ui.requestJson(ui.join("api/support-teams/save"), {
      method: "POST",
      json: { team, editIndex }
    });
    dirtyTracker?.clear();
    window.location.assign(buildWorkspaceLocation(result.id, true));
  }

  async function reorderActiveTeam(direction) {
    if (selectedIndex < 0) return;
    const nextIndex = selectedIndex + direction;
    if (nextIndex < 0 || nextIndex >= supportTeams.length) return;

    const orderedIds = supportTeams.map((team) => String(team.id || ""));
    const [currentId] = orderedIds.splice(selectedIndex, 1);
    orderedIds.splice(nextIndex, 0, currentId);

    await ui.requestJson(ui.join("api/support-teams/reorder"), {
      method: "POST",
      json: { orderedIds }
    });
    dirtyTracker?.clear();
    window.location.assign(buildWorkspaceLocation(currentId, true));
  }

  document.getElementById("createSupportTeamButton")?.addEventListener("click", () => {
    resetForm();
    fields.id.focus();
  });

  inventoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (Number.isInteger(index) && supportTeams[index]) fillForm(supportTeams[index], index);
    });
  });

  fields.name.addEventListener("input", renderSelectionState);
  fields.id.addEventListener("input", renderSelectionState);
  form.addEventListener("input", renderSelectionState);
  form.addEventListener("change", renderSelectionState);

  fields.moveUpButton.addEventListener("click", async () => {
    try {
      await reorderActiveTeam(-1);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.moveDownButton.addEventListener("click", async () => {
    try {
      await reorderActiveTeam(1);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.deleteButton.addEventListener("click", async () => {
    if (selectedIndex < 0) return;
    const okay = await ui.confirm(messages["supportTeams.flash.deleteConfirm"] || "Delete this support team?");
    if (!okay) return;

    const nextSelectedId = supportTeams[selectedIndex + 1]?.id || supportTeams[selectedIndex - 1]?.id || "";
    try {
      await ui.requestJson(ui.join(`api/support-teams/delete/${selectedIndex}`), { method: "POST" });
      dirtyTracker?.clear();
      window.location.assign(buildWorkspaceLocation(nextSelectedId, true));
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveTeam(Number(fields.editIndex.value), collectTeam());
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  const requestedId = new URL(window.location.href).searchParams.get("select");
  const requestedIndex = requestedId
    ? supportTeams.findIndex((team) => String(team.id || "") === requestedId)
    : -1;

  if (requestedIndex >= 0) fillForm(supportTeams[requestedIndex], requestedIndex);
  else if (supportTeams.length) fillForm(supportTeams[0], 0);
  else resetForm();
});
