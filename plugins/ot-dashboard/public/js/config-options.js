document.addEventListener("DOMContentLoaded", () => {
  const ui = window.DashboardUI;
  if (!ui) return;

  const options = ui.readJson("options-data", []);
  const availableQuestions = ui.readJson("available-questions-data", []);
  const supportTeams = ui.readJson("support-teams-data", []);
  const integrationProfiles = ui.readJson("integration-profiles-data", []);
  const aiAssistProfiles = ui.readJson("ai-assist-profiles-data", []);
  const dependencyGraph = ui.readJson("dependency-graph-data", {
    optionPanels: {},
    questionOptions: {},
    supportTeamOptions: {},
    integrationProfileOptions: {},
    aiAssistProfileOptions: {},
    knowledgeSourceProfiles: {}
  });
  const messages = ui.readJson("page-messages", {});
  const form = document.getElementById("optionForm");
  const dirtyTracker = form ? ui.trackDirty(form) : null;

  if (!form) return;

  const fields = {
    editIndex: document.getElementById("optionEditIndex"),
    originalId: document.getElementById("optionOriginalId"),
    type: document.getElementById("optionType"),
    id: document.getElementById("optionId"),
    name: document.getElementById("optionName"),
    description: document.getElementById("optionDescription"),
    buttonEmoji: document.getElementById("buttonEmoji"),
    buttonLabel: document.getElementById("buttonLabel"),
    buttonColor: document.getElementById("buttonColor"),
    buttonColorWrap: document.getElementById("buttonColorWrap"),
    allowBlacklisted: document.getElementById("allowBlacklisted"),
    ticketAdmins: document.getElementById("ticketAdmins"),
    readonlyAdmins: document.getElementById("readonlyAdmins"),
    channelPrefix: document.getElementById("channelPrefix"),
    channelSuffix: document.getElementById("channelSuffix"),
    channelCategory: document.getElementById("channelCategory"),
    closedCategory: document.getElementById("closedCategory"),
    backupCategory: document.getElementById("backupCategory"),
    claimedCategory: document.getElementById("claimedCategory"),
    channelTopic: document.getElementById("channelTopic"),
    cooldownEnabled: document.getElementById("cooldownEnabled"),
    cooldownMinutes: document.getElementById("cooldownMinutes"),
    autocloseEnabled: document.getElementById("autocloseEnabled"),
    autocloseHours: document.getElementById("autocloseHours"),
    autocloseOnLeave: document.getElementById("autocloseOnLeave"),
    autocloseDisableOnClaim: document.getElementById("autocloseDisableOnClaim"),
    autodeleteEnabled: document.getElementById("autodeleteEnabled"),
    autodeleteDays: document.getElementById("autodeleteDays"),
    autodeleteOnLeave: document.getElementById("autodeleteOnLeave"),
    autodeleteDisableOnClaim: document.getElementById("autodeleteDisableOnClaim"),
    limitsEnabled: document.getElementById("limitsEnabled"),
    globalMaximum: document.getElementById("globalMaximum"),
    userMaximum: document.getElementById("userMaximum"),
    transcriptUseGlobalDefault: document.getElementById("transcriptUseGlobalDefault"),
    transcriptChannels: document.getElementById("transcriptChannels"),
    transcriptRoutingHelper: document.getElementById("transcriptRoutingHelper"),
    routingSupportTeamId: document.getElementById("routingSupportTeamId"),
    routingEscalationTargetIds: document.getElementById("routingEscalationTargetIds"),
    integrationProfileId: document.getElementById("integrationProfileId"),
    aiAssistProfileId: document.getElementById("aiAssistProfileId"),
    workflowCloseRequestEnabled: document.getElementById("workflowCloseRequestEnabled"),
    workflowAwaitingUserEnabled: document.getElementById("workflowAwaitingUserEnabled"),
    workflowAwaitingUserReminderEnabled: document.getElementById("workflowAwaitingUserReminderEnabled"),
    workflowAwaitingUserReminderHours: document.getElementById("workflowAwaitingUserReminderHours"),
    workflowAwaitingUserAutocloseEnabled: document.getElementById("workflowAwaitingUserAutocloseEnabled"),
    workflowAwaitingUserAutocloseHours: document.getElementById("workflowAwaitingUserAutocloseHours"),
    slowModeEnabled: document.getElementById("slowModeEnabled"),
    slowModeSeconds: document.getElementById("slowModeSeconds"),
    dmMessageJson: document.getElementById("dmMessageJson"),
    ticketMessageJson: document.getElementById("ticketMessageJson"),
    websiteUrl: document.getElementById("websiteUrl"),
    roleIds: document.getElementById("roleIds"),
    removeRoleIds: document.getElementById("removeRoleIds"),
    roleMode: document.getElementById("roleMode"),
    addOnMemberJoin: document.getElementById("addOnMemberJoin"),
    ticketFields: document.getElementById("ticketFields"),
    ticketMessageFields: document.getElementById("ticketMessageFields"),
    websiteFields: document.getElementById("websiteFields"),
    roleFields: document.getElementById("roleFields"),
    workspaceTitle: document.getElementById("optionWorkspaceTitle"),
    orderPosition: document.getElementById("optionOrderPosition"),
    assignedQuestionCard: document.getElementById("assignedQuestionsCard"),
    ticketQuestionSummaryCard: document.getElementById("ticketQuestionSummaryCard"),
    assignedQuestionCount: document.getElementById("assignedQuestionCount"),
    assignedQuestionsCountPill: document.getElementById("assignedQuestionsCountPill"),
    assignedQuestionsEmpty: document.getElementById("assignedQuestionsEmpty"),
    assignedQuestionsList: document.getElementById("assignedQuestionsList"),
    referencingPanelCount: document.getElementById("referencingPanelCount"),
    referencingPanelsCountPill: document.getElementById("referencingPanelsCountPill"),
    referencingPanelsEmpty: document.getElementById("referencingPanelsEmpty"),
    referencingPanelsList: document.getElementById("referencingPanelsList"),
    referenceWarning: document.getElementById("optionReferenceWarning"),
    duplicateButton: document.getElementById("duplicateOptionButton"),
    moveUpButton: document.getElementById("moveOptionUpButton"),
    moveDownButton: document.getElementById("moveOptionDownButton"),
    deleteButton: document.getElementById("deleteOptionButton")
  };

  const buttonColors = Array.from(fields.buttonColor?.options || []).map((option) => option.value);
  const channelSuffixes = Array.from(fields.channelSuffix?.options || []).map((option) => option.value);
  const roleModes = Array.from(fields.roleMode?.options || []).map((option) => option.value);
  const supportTeamIds = new Set(supportTeams.map((team) => String(team.id || "")));
  const integrationProfileIds = new Set(integrationProfiles.map((profile) => String(profile.id || "")));
  const aiAssistProfileIds = new Set(aiAssistProfiles.map((profile) => String(profile.id || "")));
  const questionCheckboxes = Array.from(document.querySelectorAll("[data-question-id]"));
  const questionById = new Map(availableQuestions.map((question) => [String(question.id), question]));
  const inventoryButtons = Array.from(document.querySelectorAll("[data-option-select]"));

  const defaultWorkspaceTitle = fields.workspaceTitle?.textContent || "";
  const defaultOrderPosition = fields.orderPosition?.textContent || "";

  let selectedIndex = -1;

  function buildDefaultDmMessage() {
    return {
      enabled: false,
      text: "",
      embed: {
        enabled: false,
        title: "",
        description: "",
        customColor: "",
        image: "",
        thumbnail: "",
        fields: [],
        timestamp: false
      }
    };
  }

  function buildDefaultTicketMessage(option = {}) {
    return {
      enabled: true,
      text: "",
      embed: {
        enabled: true,
        title: option.name || "Ticket",
        description: option.description || "",
        customColor: "",
        image: "",
        thumbnail: "",
        fields: [],
        timestamp: true
      },
      ping: {
        "@here": false,
        "@everyone": false,
        custom: []
      }
    };
  }

  function buildDefaultTranscriptRouting() {
    return {
      useGlobalDefault: true,
      channels: []
    };
  }

  function buildDefaultWorkflow() {
    return {
      closeRequest: {
        enabled: false
      },
      awaitingUser: {
        enabled: false,
        reminderEnabled: false,
        reminderHours: 24,
        autoCloseEnabled: false,
        autoCloseHours: 72
      }
    };
  }

  function assertAllowed(value, allowed, message) {
    if (!allowed.includes(value)) {
      throw new Error(message);
    }
    return value;
  }

  function parseJsonValue(source, fallback, message) {
    try {
      const parsed = ui.parseJson(source, fallback);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("invalid-shape");
      }
      return parsed;
    } catch {
      throw new Error(message);
    }
  }

  function parseClaimedCategories() {
    try {
      const parsed = ui.parseJson(fields.claimedCategory.value, []);
      if (!Array.isArray(parsed)) throw new Error("invalid-array");
      parsed.forEach((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error("invalid-entry");
        }
        if (!String(entry.user || "").trim() || !String(entry.category || "").trim()) {
          throw new Error("invalid-entry");
        }
      });
      return parsed;
    } catch {
      throw new Error(messages["options.flash.validationClaimedCategory"] || "Claimed category mappings must be valid JSON objects.");
    }
  }

  function getSelectedQuestionIds() {
    return questionCheckboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => String(checkbox.dataset.questionId || "").trim())
      .filter(Boolean);
  }

  function setSelectedQuestionIds(questionIds) {
    const selected = new Set(Array.isArray(questionIds) ? questionIds.map((value) => String(value)) : []);
    questionCheckboxes.forEach((checkbox) => {
      checkbox.checked = selected.has(String(checkbox.dataset.questionId || ""));
    });
  }

  function getCurrentPanelReferences() {
    const referenceId = String(fields.originalId.value || "").trim();
    return referenceId ? dependencyGraph.optionPanels?.[referenceId] || [] : [];
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

  function updateWorkspaceTitle() {
    const name = String(fields.name.value || "").trim();
    fields.workspaceTitle.textContent = name || defaultWorkspaceTitle;
  }

  function updateTranscriptRoutingState() {
    const disabled = fields.type.value !== "ticket" || fields.transcriptUseGlobalDefault.checked;
    const inheritedHelp = fields.transcriptRoutingHelper.dataset.inheritedHelp || "";
    const overrideHelp = fields.transcriptRoutingHelper.dataset.overrideHelp || "";

    fields.transcriptChannels.disabled = disabled;
    fields.transcriptChannels.readOnly = disabled;
    fields.transcriptRoutingHelper.textContent = fields.transcriptUseGlobalDefault.checked
      ? inheritedHelp
      : overrideHelp;
  }

  function toggleSections() {
    const type = fields.type.value;
    const isTicket = type === "ticket";

    fields.ticketFields.hidden = !isTicket;
    fields.ticketMessageFields.hidden = !isTicket;
    fields.websiteFields.hidden = type !== "website";
    fields.roleFields.hidden = type !== "role";
    fields.buttonColorWrap.hidden = type === "website";
    fields.assignedQuestionCard.hidden = !isTicket;
    fields.ticketQuestionSummaryCard.hidden = !isTicket;
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
    toggleSections();
    updateTranscriptRoutingState();
    syncInventorySelection();

    const isExistingOption = selectedIndex >= 0;
    const references = getCurrentPanelReferences();
    const selectedQuestions = fields.type.value === "ticket"
      ? getSelectedQuestionIds().map((questionId) => questionById.get(questionId) || { id: questionId, name: questionId })
      : [];

    fields.orderPosition.textContent = isExistingOption
      ? `${selectedIndex + 1} / ${options.length}`
      : defaultOrderPosition;
    fields.assignedQuestionCount.textContent = String(selectedQuestions.length);
    fields.assignedQuestionsCountPill.textContent = String(selectedQuestions.length);
    fields.referencingPanelCount.textContent = String(references.length);
    fields.referencingPanelsCountPill.textContent = String(references.length);

    updatePillList(
      fields.assignedQuestionsList,
      fields.assignedQuestionsEmpty,
      selectedQuestions.map((question) => `${question.name} (${question.id})`)
    );
    updatePillList(
      fields.referencingPanelsList,
      fields.referencingPanelsEmpty,
      references.map((reference) => `${reference.name} (${reference.id})`)
    );

    fields.referenceWarning.hidden = references.length === 0;
    fields.duplicateButton.disabled = !isExistingOption;
    fields.moveUpButton.disabled = !isExistingOption || selectedIndex <= 0;
    fields.moveDownButton.disabled = !isExistingOption || selectedIndex >= options.length - 1;
    fields.deleteButton.disabled = !isExistingOption || references.length > 0;
  }

  function resetForm() {
    selectedIndex = -1;
    fields.editIndex.value = "-1";
    fields.originalId.value = "";
    form.reset();
    fields.type.value = "";
    fields.ticketAdmins.value = "[]";
    fields.readonlyAdmins.value = "[]";
    fields.claimedCategory.value = ui.stringifyJson([]);
    fields.roleIds.value = "[]";
    fields.removeRoleIds.value = "[]";
    fields.channelSuffix.value = "user-name";
    fields.buttonColor.value = "gray";
    fields.cooldownMinutes.value = 10;
    fields.autocloseHours.value = 24;
    fields.autocloseOnLeave.checked = false;
    fields.autocloseDisableOnClaim.checked = false;
    fields.autodeleteDays.value = 7;
    fields.autodeleteOnLeave.checked = false;
    fields.autodeleteDisableOnClaim.checked = false;
    fields.globalMaximum.value = 20;
    fields.userMaximum.value = 3;
    fields.transcriptUseGlobalDefault.checked = true;
    fields.transcriptChannels.value = ui.stringifyList(buildDefaultTranscriptRouting().channels);
    fields.routingSupportTeamId.value = "";
    fields.routingEscalationTargetIds.value = "[]";
    fields.integrationProfileId.value = "";
    fields.aiAssistProfileId.value = "";
    fields.workflowCloseRequestEnabled.checked = false;
    fields.workflowAwaitingUserEnabled.checked = false;
    fields.workflowAwaitingUserReminderEnabled.checked = false;
    fields.workflowAwaitingUserReminderHours.value = 24;
    fields.workflowAwaitingUserAutocloseEnabled.checked = false;
    fields.workflowAwaitingUserAutocloseHours.value = 72;
    fields.slowModeSeconds.value = 20;
    fields.dmMessageJson.value = ui.stringifyJson(buildDefaultDmMessage());
    fields.ticketMessageJson.value = ui.stringifyJson(buildDefaultTicketMessage());
    fields.roleMode.value = "add";
    setSelectedQuestionIds([]);
    renderSelectionState();
  }

  function fillForm(option, index) {
    selectedIndex = index;
    fields.editIndex.value = String(index);
    fields.originalId.value = option.id || "";
    fields.type.value = option.type || "";
    fields.id.value = option.id || "";
    fields.name.value = option.name || "";
    fields.description.value = option.description || "";
    fields.buttonEmoji.value = option.button?.emoji || "";
    fields.buttonLabel.value = option.button?.label || "";
    fields.buttonColor.value = option.button?.color || "gray";
    fields.allowBlacklisted.checked = Boolean(option.allowCreationByBlacklistedUsers);
    fields.ticketAdmins.value = ui.stringifyList(option.ticketAdmins || []);
    fields.readonlyAdmins.value = ui.stringifyList(option.readonlyAdmins || []);
    fields.channelPrefix.value = option.channel?.prefix || "";
    fields.channelSuffix.value = option.channel?.suffix || "user-name";
    fields.channelCategory.value = option.channel?.category || "";
    fields.closedCategory.value = option.channel?.closedCategory || "";
    fields.backupCategory.value = option.channel?.backupCategory || "";
    fields.claimedCategory.value = ui.stringifyJson(option.channel?.claimedCategory || []);
    fields.channelTopic.value = option.channel?.topic || "";
    fields.cooldownEnabled.checked = Boolean(option.cooldown?.enabled);
    fields.cooldownMinutes.value = option.cooldown?.cooldownMinutes ?? 10;
    fields.autocloseEnabled.checked = Boolean(option.autoclose?.enableInactiveHours);
    fields.autocloseHours.value = option.autoclose?.inactiveHours ?? 24;
    fields.autocloseOnLeave.checked = Boolean(option.autoclose?.enableUserLeave);
    fields.autocloseDisableOnClaim.checked = Boolean(option.autoclose?.disableOnClaim);
    fields.autodeleteEnabled.checked = Boolean(option.autodelete?.enableInactiveDays);
    fields.autodeleteDays.value = option.autodelete?.inactiveDays ?? 7;
    fields.autodeleteOnLeave.checked = Boolean(option.autodelete?.enableUserLeave);
    fields.autodeleteDisableOnClaim.checked = Boolean(option.autodelete?.disableOnClaim);
    fields.limitsEnabled.checked = Boolean(option.limits?.enabled);
    fields.globalMaximum.value = option.limits?.globalMaximum ?? 20;
    fields.userMaximum.value = option.limits?.userMaximum ?? 3;
    fields.transcriptUseGlobalDefault.checked = option.transcripts?.useGlobalDefault !== false;
    fields.transcriptChannels.value = ui.stringifyList(option.transcripts?.channels || []);
    fields.routingSupportTeamId.value = option.routing?.supportTeamId || "";
    fields.routingEscalationTargetIds.value = ui.stringifyList(option.routing?.escalationTargetOptionIds || []);
    fields.integrationProfileId.value = option.integrationProfileId || "";
    fields.aiAssistProfileId.value = option.aiAssistProfileId || "";
    fields.workflowCloseRequestEnabled.checked = Boolean(option.workflow?.closeRequest?.enabled);
    fields.workflowAwaitingUserEnabled.checked = Boolean(option.workflow?.awaitingUser?.enabled);
    fields.workflowAwaitingUserReminderEnabled.checked = Boolean(option.workflow?.awaitingUser?.reminderEnabled);
    fields.workflowAwaitingUserReminderHours.value = option.workflow?.awaitingUser?.reminderHours ?? 24;
    fields.workflowAwaitingUserAutocloseEnabled.checked = Boolean(option.workflow?.awaitingUser?.autoCloseEnabled);
    fields.workflowAwaitingUserAutocloseHours.value = option.workflow?.awaitingUser?.autoCloseHours ?? 72;
    fields.slowModeEnabled.checked = Boolean(option.slowMode?.enabled);
    fields.slowModeSeconds.value = option.slowMode?.slowModeSeconds ?? 20;
    fields.dmMessageJson.value = ui.stringifyJson(option.dmMessage || buildDefaultDmMessage());
    fields.ticketMessageJson.value = ui.stringifyJson(option.ticketMessage || buildDefaultTicketMessage(option));
    fields.websiteUrl.value = option.url || "";
    fields.roleIds.value = ui.stringifyList(option.roles || []);
    fields.removeRoleIds.value = ui.stringifyList(option.removeRolesOnAdd || []);
    fields.roleMode.value = option.mode || "add";
    fields.addOnMemberJoin.checked = Boolean(option.addOnMemberJoin);
    setSelectedQuestionIds(option.questions || []);
    renderSelectionState();
  }

  function collectOption() {
    const type = fields.type.value;
    if (!type) throw new Error(messages["options.flash.validationType"] || "Choose a type.");
    if (!fields.name.value.trim()) throw new Error(messages["options.flash.validationName"] || "Enter a name.");

    const option = {
      id: fields.id.value.trim(),
      name: fields.name.value.trim(),
      description: fields.description.value.trim(),
      type,
      button: {
        emoji: fields.buttonEmoji.value.trim(),
        label: fields.buttonLabel.value.trim() || fields.name.value.trim()
      }
    };

    if (type === "ticket") {
      option.button.color = assertAllowed(
        fields.buttonColor.value,
        buttonColors,
        messages["options.flash.validationButtonColor"] || "Choose a valid button color."
      );
      option.ticketAdmins = ui.parseList(fields.ticketAdmins.value);
      option.readonlyAdmins = ui.parseList(fields.readonlyAdmins.value);
      option.questions = getSelectedQuestionIds();
      option.allowCreationByBlacklistedUsers = fields.allowBlacklisted.checked;
      option.channel = {
        prefix: fields.channelPrefix.value.trim(),
        suffix: assertAllowed(
          fields.channelSuffix.value,
          channelSuffixes,
          messages["options.flash.validationChannelSuffix"] || "Choose a valid channel suffix."
        ),
        category: fields.channelCategory.value.trim(),
        closedCategory: fields.closedCategory.value.trim(),
        backupCategory: fields.backupCategory.value.trim(),
        claimedCategory: parseClaimedCategories(),
        topic: fields.channelTopic.value.trim()
      };
      option.dmMessage = parseJsonValue(
        fields.dmMessageJson.value,
        buildDefaultDmMessage(),
        messages["options.flash.validationMessageJson"] || "Advanced message settings must be valid JSON objects."
      );
      option.ticketMessage = parseJsonValue(
        fields.ticketMessageJson.value,
        buildDefaultTicketMessage(option),
        messages["options.flash.validationMessageJson"] || "Advanced message settings must be valid JSON objects."
      );
      option.cooldown = {
        enabled: fields.cooldownEnabled.checked,
        cooldownMinutes: Number(fields.cooldownMinutes.value || 10)
      };
      option.autoclose = {
        enableInactiveHours: fields.autocloseEnabled.checked,
        inactiveHours: Number(fields.autocloseHours.value || 24),
        enableUserLeave: fields.autocloseOnLeave.checked,
        disableOnClaim: fields.autocloseDisableOnClaim.checked
      };
      option.autodelete = {
        enableInactiveDays: fields.autodeleteEnabled.checked,
        inactiveDays: Number(fields.autodeleteDays.value || 7),
        enableUserLeave: fields.autodeleteOnLeave.checked,
        disableOnClaim: fields.autodeleteDisableOnClaim.checked
      };
      option.limits = {
        enabled: fields.limitsEnabled.checked,
        globalMaximum: Number(fields.globalMaximum.value || 20),
        userMaximum: Number(fields.userMaximum.value || 3)
      };
      option.transcripts = {
        useGlobalDefault: fields.transcriptUseGlobalDefault.checked,
        channels: ui.parseList(fields.transcriptChannels.value)
      };
      const routingSupportTeamId = fields.routingSupportTeamId.value.trim();
      if (routingSupportTeamId && !supportTeamIds.has(routingSupportTeamId)) {
        throw new Error(messages["options.flash.validationRoutingTargets"] || "Choose an existing support team for this route.");
      }
      option.routing = {
        supportTeamId: routingSupportTeamId,
        escalationTargetOptionIds: ui.parseList(fields.routingEscalationTargetIds.value)
      };
      const integrationProfileId = fields.integrationProfileId.value.trim();
      if (integrationProfileId && !integrationProfileIds.has(integrationProfileId)) {
        throw new Error(messages["options.flash.validationIntegrationProfile"] || "Choose an existing integration profile.");
      }
      option.integrationProfileId = integrationProfileId;
      const aiAssistProfileId = fields.aiAssistProfileId.value.trim();
      if (aiAssistProfileId && !aiAssistProfileIds.has(aiAssistProfileId)) {
        throw new Error(messages["options.flash.validationAiAssistProfile"] || "Choose an existing AI assist profile.");
      }
      option.aiAssistProfileId = aiAssistProfileId;
      option.workflow = {
        closeRequest: {
          enabled: fields.workflowCloseRequestEnabled.checked
        },
        awaitingUser: {
          enabled: fields.workflowAwaitingUserEnabled.checked,
          reminderEnabled: fields.workflowAwaitingUserReminderEnabled.checked,
          reminderHours: Number(fields.workflowAwaitingUserReminderHours.value || 24),
          autoCloseEnabled: fields.workflowAwaitingUserAutocloseEnabled.checked,
          autoCloseHours: Number(fields.workflowAwaitingUserAutocloseHours.value || 72)
        }
      };
      if (
        option.workflow.awaitingUser.reminderEnabled
        && option.workflow.awaitingUser.autoCloseEnabled
        && option.workflow.awaitingUser.autoCloseHours <= option.workflow.awaitingUser.reminderHours
      ) {
        throw new Error(messages["options.flash.validationWorkflowHours"] || "Awaiting-user timeout hours must be greater than reminder hours.");
      }
      option.slowMode = {
        enabled: fields.slowModeEnabled.checked,
        slowModeSeconds: Number(fields.slowModeSeconds.value || 20)
      };
    } else if (type === "website") {
      if (!fields.websiteUrl.value.trim()) throw new Error(messages["options.flash.validationUrl"] || "Enter a URL.");
      option.url = fields.websiteUrl.value.trim();
    } else if (type === "role") {
      option.button.color = assertAllowed(
        fields.buttonColor.value,
        buttonColors,
        messages["options.flash.validationButtonColor"] || "Choose a valid button color."
      );
      option.roles = ui.parseList(fields.roleIds.value);
      option.removeRolesOnAdd = ui.parseList(fields.removeRoleIds.value);
      option.mode = assertAllowed(
        fields.roleMode.value,
        roleModes,
        messages["options.flash.validationRoleMode"] || "Choose a valid role mode."
      );
      option.addOnMemberJoin = fields.addOnMemberJoin.checked;
    }

    return option;
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
    const raw = String(sourceId || "option").trim() || "option";
    const base = `${raw}-copy`;
    const existingIds = new Set(options.map((option) => String(option.id || "")));
    let candidate = base;
    let counter = 2;

    while (existingIds.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    return candidate;
  }

  function buildDuplicateName(sourceName) {
    const raw = String(sourceName || "Option").trim() || "Option";
    const base = `${raw} copy`;
    const existingNames = new Set(options.map((option) => String(option.name || "")));
    let candidate = base;
    let counter = 2;

    while (existingNames.has(candidate)) {
      candidate = `${base} ${counter}`;
      counter += 1;
    }

    return candidate;
  }

  async function saveOption(editIndex, option) {
    const result = await ui.requestJson(ui.join("api/options/save"), {
      method: "POST",
      json: { option, editIndex }
    });
    dirtyTracker?.clear();
    window.location.assign(buildWorkspaceLocation(result.id, true));
  }

  async function reorderActiveOption(direction) {
    if (selectedIndex < 0) return;

    const nextIndex = selectedIndex + direction;
    if (nextIndex < 0 || nextIndex >= options.length) return;

    const orderedIds = options.map((option) => String(option.id || ""));
    const [currentId] = orderedIds.splice(selectedIndex, 1);
    orderedIds.splice(nextIndex, 0, currentId);

    await ui.requestJson(ui.join("api/options/reorder"), {
      method: "POST",
      json: { orderedIds }
    });
    dirtyTracker?.clear();
    window.location.assign(buildWorkspaceLocation(currentId, true));
  }

  document.getElementById("createOptionButton")?.addEventListener("click", () => {
    resetForm();
    fields.type.focus();
  });

  inventoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (Number.isInteger(index) && options[index]) {
        fillForm(options[index], index);
      }
    });
  });

  fields.type.addEventListener("change", renderSelectionState);
  fields.name.addEventListener("input", updateWorkspaceTitle);
  form.addEventListener("input", renderSelectionState);
  form.addEventListener("change", renderSelectionState);

  fields.duplicateButton.addEventListener("click", async () => {
    if (selectedIndex < 0) return;

    try {
      const option = collectOption();
      option.id = buildDuplicateId(option.id);
      option.name = buildDuplicateName(option.name);
      await saveOption(-1, option);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.moveUpButton.addEventListener("click", async () => {
    try {
      await reorderActiveOption(-1);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.moveDownButton.addEventListener("click", async () => {
    try {
      await reorderActiveOption(1);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  fields.deleteButton.addEventListener("click", async () => {
    if (selectedIndex < 0) return;

    const okay = await ui.confirm(messages["options.flash.deleteConfirm"] || "Delete this option?");
    if (!okay) return;

    const nextSelectedId =
      options[selectedIndex + 1]?.id ||
      options[selectedIndex - 1]?.id ||
      "";

    try {
      await ui.requestJson(ui.join(`api/options/delete/${selectedIndex}`), { method: "POST" });
      dirtyTracker?.clear();
      window.location.assign(buildWorkspaceLocation(nextSelectedId, true));
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const option = collectOption();
      await saveOption(Number(fields.editIndex.value), option);
    } catch (error) {
      ui.showToast(error.message, "error");
    }
  });

  const requestedId = new URL(window.location.href).searchParams.get("select");
  const requestedIndex = requestedId
    ? options.findIndex((option) => String(option.id || "") === requestedId)
    : -1;

  if (requestedIndex >= 0) {
    fillForm(options[requestedIndex], requestedIndex);
  } else if (options.length) {
    fillForm(options[0], 0);
  } else {
    resetForm();
  }
});
