import { api, opendiscord } from "#opendiscord"
import * as discord from "discord.js"
import {
    OTFormsCompletedTicketFormStore,
    OT_FORMS_COMPLETED_TICKET_FORM_CATEGORY,
    OT_FORMS_PLUGIN_SERVICE_ID,
    OT_FORMS_TICKET_DRAFT_CATEGORY,
    OTFormsTicketDraftStore,
    createCompletedTicketFormKey,
    createTicketDraftKey,
    resolveOriginalApplicantDiscordUserId,
    type OTFormsCompletedTicketFormSnapshot,
    type OTFormsTicketDraftSnapshot
} from "./forms-model"
import {
    buildManagedRecordFields,
    buildTicketManagedRecordMessagePayload,
    rebindManagedRecordSnapshot,
    splitManagedRecordFields
} from "./ticket-managed-record-runtime"
import type { OTFormsCapturedAnswer } from "../types/configDefaults"
import { cloneOTFormsCapturedAnswers } from "./answer-runtime"
import {
    type OTFormsApplicantLifecycleState,
    buildStartFormEditAnswerOptions,
    ensureStartFormMessage,
    resolveStartFormRenderState
} from "./start-form-runtime"
import type { OTForms_Form as OTFormsFormConfig } from "../types/configDefaults"

export {
    OTFormsCompletedTicketFormStore,
    OT_FORMS_COMPLETED_TICKET_FORM_CATEGORY,
    OT_FORMS_PLUGIN_SERVICE_ID,
    OT_FORMS_TICKET_DRAFT_CATEGORY,
    OTFormsTicketDraftStore,
    createCompletedTicketFormKey,
    createTicketDraftKey,
    normalizeCompletedTicketFormSnapshot,
    normalizeTicketDraftSnapshot,
    normalizeDiscordUserId,
    resolveOriginalApplicantDiscordUserId,
    type OTFormsCompletedTicketFormAnswer,
    type OTFormsCompletedTicketFormContext,
    type OTFormsCompletedTicketFormSnapshot,
    type OTFormsTicketDraftSnapshot
} from "./forms-model"

interface OTFormsBridgeEditGate {
    canApplicantEdit(ticketChannelId: string): boolean
    resolveApplicantLifecycleState?(ticketChannelId: string): OTFormsApplicantLifecycleState
}

function isGuildTextBasedChannel(
    channel: discord.Channel | null
): channel is discord.GuildTextBasedChannel {
    return !!channel && channel.isTextBased() && "guildId" in channel
}

function resolveTicketFormConfig(formId: string): OTFormsFormConfig | null {
    const formsConfig = opendiscord.configs.get("ot-ticket-forms:config").data as OTFormsFormConfig[]
    return formsConfig.find((formConfig) => formConfig.id == formId) ?? null
}

function resolveBridgeEditGate(): OTFormsBridgeEditGate | null {
    try {
        return opendiscord.plugins.classes.get("ot-eotfs-bridge:service") as unknown as OTFormsBridgeEditGate
    } catch {
        return null
    }
}

function resolveApplicantLifecycleState(ticketChannelId: string): OTFormsApplicantLifecycleState {
    const bridgeEditGate = resolveBridgeEditGate()
    if (!bridgeEditGate) return "unsubmitted"
    if (typeof bridgeEditGate.resolveApplicantLifecycleState == "function") {
        return bridgeEditGate.resolveApplicantLifecycleState(ticketChannelId)
    }
    return bridgeEditGate.canApplicantEdit(ticketChannelId) ? "unsubmitted" : "locked"
}

function cloneDraftAnswers(
    answers: readonly OTFormsCapturedAnswer[]
): OTFormsCapturedAnswer[] {
    return cloneOTFormsCapturedAnswers(answers)
}

function buildInitialTicketDraftSnapshot(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel,
    formConfig: OTFormsFormConfig,
    applicantDiscordUserId: string,
    existingDraft: OTFormsTicketDraftSnapshot | null
): OTFormsTicketDraftSnapshot {
    return {
        ticketChannelId: channel.id,
        ticketChannelName: channel.name,
        ticketOptionId: ticket.option.id.value,
        applicantDiscordUserId,
        formId: formConfig.id,
        answerTarget: formConfig.answerTarget,
        draftState: existingDraft?.draftState ?? "initial",
        formColor: String(existingDraft?.formColor ?? formConfig.color ?? ""),
        updatedAt: existingDraft?.updatedAt ?? new Date().toISOString(),
        completedAt: existingDraft?.completedAt ?? null,
        startFormMessageId: existingDraft?.startFormMessageId ?? null,
        managedRecordMessageId: existingDraft?.managedRecordMessageId ?? null,
        answers: cloneDraftAnswers(existingDraft?.answers ?? [])
    }
}

export class OTFormsService extends api.ODManagerData {
    private readonly store = new OTFormsCompletedTicketFormStore()
    private readonly draftStore = new OTFormsTicketDraftStore()
    private completedFormsRestored = false
    private ticketDraftsRestored = false

    constructor(id: api.ODValidId = OT_FORMS_PLUGIN_SERVICE_ID) {
        super(id)
    }

    private async ensureCompletedFormsRestored(): Promise<void> {
        if (this.completedFormsRestored) return
        await this.restoreCompletedTicketForms()
    }

    private async ensureTicketDraftsRestored(): Promise<void> {
        if (this.ticketDraftsRestored) return
        await this.restoreTicketDrafts()
    }

    async restoreCompletedTicketForms(): Promise<void> {
        const globalDatabase = opendiscord.databases.get("opendiscord:global")
        const storedEntries = await globalDatabase.getCategory(OT_FORMS_COMPLETED_TICKET_FORM_CATEGORY) ?? []
        this.store.restore(storedEntries.map((entry) => entry.value as OTFormsCompletedTicketFormSnapshot))
        this.completedFormsRestored = true
    }

    async restoreTicketDrafts(): Promise<void> {
        const globalDatabase = opendiscord.databases.get("opendiscord:global")
        const storedEntries = await globalDatabase.getCategory(OT_FORMS_TICKET_DRAFT_CATEGORY) ?? []
        this.draftStore.restore(storedEntries.map((entry) => entry.value as OTFormsTicketDraftSnapshot))
        this.ticketDraftsRestored = true
    }

    private async persistTicketDraftSnapshot(
        snapshot: OTFormsTicketDraftSnapshot,
        refreshStartFormMessage: boolean
    ): Promise<OTFormsTicketDraftSnapshot> {
        const normalized = this.draftStore.upsert(snapshot)
        opendiscord.databases
            .get("opendiscord:global")
            .set(
                OT_FORMS_TICKET_DRAFT_CATEGORY,
                createTicketDraftKey(
                    normalized.ticketChannelId,
                    normalized.formId,
                    normalized.applicantDiscordUserId
                ),
                normalized
            )
        if (refreshStartFormMessage) {
            await this.refreshTicketStartFormMessage(normalized.ticketChannelId, normalized.formId)
        }
        return normalized
    }

    async storeCompletedTicketForm(snapshot: OTFormsCompletedTicketFormSnapshot): Promise<OTFormsCompletedTicketFormSnapshot> {
        await this.ensureCompletedFormsRestored()
        const normalized = this.store.upsert(snapshot)
        opendiscord.databases
            .get("opendiscord:global")
            .set(
                OT_FORMS_COMPLETED_TICKET_FORM_CATEGORY,
                createCompletedTicketFormKey(normalized.ticketChannelId, normalized.formId),
                normalized
            )
        return normalized
    }

    async getCompletedTicketForm(ticketChannelId: string, formId: string): Promise<OTFormsCompletedTicketFormSnapshot | null> {
        await this.ensureCompletedFormsRestored()
        return this.store.getCompletedTicketForm(ticketChannelId, formId)
    }

    async storeTicketDraft(
        snapshot: OTFormsTicketDraftSnapshot,
        options: { refreshStartFormMessage?: boolean } = {}
    ): Promise<OTFormsTicketDraftSnapshot> {
        await this.ensureTicketDraftsRestored()
        return await this.persistTicketDraftSnapshot(snapshot, options.refreshStartFormMessage !== false)
    }

    async getTicketDraft(
        ticketChannelId: string,
        formId: string,
        applicantDiscordUserId: string
    ): Promise<OTFormsTicketDraftSnapshot | null> {
        await this.ensureTicketDraftsRestored()
        return this.draftStore.getTicketDraft(ticketChannelId, formId, applicantDiscordUserId)
    }

    async listTicketDrafts(): Promise<OTFormsTicketDraftSnapshot[]> {
        await this.ensureTicketDraftsRestored()
        return this.draftStore.listTicketDrafts()
    }

    async buildSubmissionCandidate(
        ticketChannelId: string,
        formId: string,
        completedAt: string = new Date().toISOString()
    ): Promise<OTFormsCompletedTicketFormSnapshot | null> {
        await this.ensureTicketDraftsRestored()

        const ticket = opendiscord.tickets.get(ticketChannelId)
        if (!ticket || ticket.get("opendiscord:closed").value) return null

        const applicantDiscordUserId = resolveOriginalApplicantDiscordUserId(
            ticket.get("opendiscord:opened-by").value,
            ticket.get("opendiscord:previous-creators").value
        )
        if (!applicantDiscordUserId) return null

        const draft = await this.getTicketDraft(ticketChannelId, formId, applicantDiscordUserId)
        if (!draft || draft.draftState != "completed") return null

        return {
            ticketChannelId: draft.ticketChannelId,
            ticketChannelName: draft.ticketChannelName,
            ticketOptionId: draft.ticketOptionId,
            applicantDiscordUserId: draft.applicantDiscordUserId,
            formId,
            completedAt,
            answers: draft.answers.map((entry) => ({
                position: entry.question.position,
                question: entry.question.question,
                answer: entry.answer,
                answerData: entry.answerData ?? null
            }))
        }
    }

    async hideSubmittedTicketFormMessage(ticketChannelId: string, formId: string): Promise<boolean> {
        await this.ensureTicketDraftsRestored()

        const ticket = opendiscord.tickets.get(ticketChannelId)
        if (!ticket || ticket.get("opendiscord:closed").value) return false

        const applicantDiscordUserId = resolveOriginalApplicantDiscordUserId(
            ticket.get("opendiscord:opened-by").value,
            ticket.get("opendiscord:previous-creators").value
        )
        if (!applicantDiscordUserId) return false

        const draft = await this.getTicketDraft(ticketChannelId, formId, applicantDiscordUserId)
        if (!draft || !draft.managedRecordMessageId) return false

        let channel: discord.GuildTextBasedChannel | null = null
        try {
            const fetchedChannel = await opendiscord.client.client.channels.fetch(ticketChannelId)
            if (isGuildTextBasedChannel(fetchedChannel)) {
                channel = fetchedChannel
            }
        } catch {
            channel = null
        }
        if (!channel) return false

        const existingMessage = await channel.messages.fetch(draft.managedRecordMessageId).catch(() => null)
        if (existingMessage) {
            await existingMessage.delete().catch(() => null)
        }

        await this.storeTicketDraft(
            rebindManagedRecordSnapshot(draft, {
                managedRecordMessageId: null,
                draftState: draft.draftState,
                updatedAt: new Date().toISOString(),
                completedAt: draft.completedAt,
                answers: cloneDraftAnswers(draft.answers)
            }),
            { refreshStartFormMessage: false }
        )
        return true
    }

    async syncSubmittedTicketFormMessage(
        ticketChannelId: string,
        formId: string,
        options: {
            forceRecreate?: boolean
            placementRepairAfterMessageTimestamp?: number | null
        } = {}
    ): Promise<{ messageId: string | null; createdTimestamp: number | null }> {
        await this.ensureCompletedFormsRestored()
        await this.ensureTicketDraftsRestored()

        const ticket = opendiscord.tickets.get(ticketChannelId)
        if (!ticket || ticket.get("opendiscord:closed").value) {
            return { messageId: null, createdTimestamp: null }
        }

        const formConfig = resolveTicketFormConfig(formId)
        if (!formConfig) {
            return { messageId: null, createdTimestamp: null }
        }

        let channel: discord.GuildTextBasedChannel | null = null
        try {
            const fetchedChannel = await opendiscord.client.client.channels.fetch(ticketChannelId)
            if (isGuildTextBasedChannel(fetchedChannel)) {
                channel = fetchedChannel
            }
        } catch {
            channel = null
        }
        if (!channel) {
            return { messageId: null, createdTimestamp: null }
        }

        const applicantDiscordUserId = resolveOriginalApplicantDiscordUserId(
            ticket.get("opendiscord:opened-by").value,
            ticket.get("opendiscord:previous-creators").value
        )
        if (!applicantDiscordUserId) {
            return { messageId: null, createdTimestamp: null }
        }

        const draft = await this.getTicketDraft(ticketChannelId, formId, applicantDiscordUserId)
        const submittedSnapshot = await this.getCompletedTicketForm(ticketChannelId, formId)
        if (!draft || !submittedSnapshot) {
            await this.hideSubmittedTicketFormMessage(ticketChannelId, formId)
            return { messageId: null, createdTimestamp: null }
        }

        const applicantUser = await opendiscord.client.client.users.fetch(submittedSnapshot.applicantDiscordUserId).catch(() => null)
        if (!applicantUser) {
            return { messageId: null, createdTimestamp: null }
        }

        const answerFields = splitManagedRecordFields(buildManagedRecordFields(
            submittedSnapshot.answers.map((entry) => ({
                question: {
                    position: entry.position,
                    question: entry.question,
                    type: "paragraph" as const
                },
                answer: entry.answer,
                answerData: entry.answerData ?? null
            }))
        ))
        const embeds = (
            await Promise.all(answerFields.map(async (fields) => {
                const embedBuild = await opendiscord.builders.embeds.getSafe("ot-ticket-forms:answers-embed").build(
                    "other",
                    {
                        type: "completed",
                        user: applicantUser,
                        formColor: (draft.formColor || formConfig.color) as discord.ColorResolvable,
                        fields,
                        timestamp: new Date(submittedSnapshot.completedAt)
                    }
                )
                return embedBuild.embed
            }))
        ).filter((embed): embed is discord.EmbedBuilder => embed != null)

        const payload = buildTicketManagedRecordMessagePayload(embeds)
        let existingMessage = draft.managedRecordMessageId
            ? await channel.messages.fetch(draft.managedRecordMessageId).catch(() => null)
            : null
        const mustRecreate = options.forceRecreate === true
            || (
                existingMessage != null
                && options.placementRepairAfterMessageTimestamp != null
                && Number.isFinite(options.placementRepairAfterMessageTimestamp)
                && existingMessage.createdTimestamp <= Number(options.placementRepairAfterMessageTimestamp)
            )
        if (mustRecreate && existingMessage) {
            await existingMessage.delete().catch(() => null)
            existingMessage = null
        }

        const persistedMessage = existingMessage && existingMessage.editable
            ? await existingMessage.edit(payload).then(() => existingMessage)
            : await channel.send(payload)

        await this.storeTicketDraft(
            rebindManagedRecordSnapshot(draft, {
                managedRecordMessageId: persistedMessage.id,
                draftState: draft.draftState,
                updatedAt: new Date().toISOString(),
                completedAt: submittedSnapshot.completedAt,
                answers: cloneDraftAnswers(draft.answers)
            }),
            { refreshStartFormMessage: false }
        )

        return {
            messageId: persistedMessage.id,
            createdTimestamp: persistedMessage.createdTimestamp
        }
    }

    async refreshTicketStartFormMessage(
        ticketChannelId: string,
        formId: string,
        options: {
            forceRecreate?: boolean
            placementRepairAfterMessageTimestamp?: number | null
        } = {}
    ): Promise<{ messageId: string | null; createdTimestamp: number | null }> {
        await this.ensureTicketDraftsRestored()

        const ticket = opendiscord.tickets.get(ticketChannelId)
        if (!ticket || ticket.get("opendiscord:closed").value) {
            return { messageId: null, createdTimestamp: null }
        }

        const formConfig = resolveTicketFormConfig(formId)
        if (!formConfig) {
            return { messageId: null, createdTimestamp: null }
        }

        let channel: discord.GuildTextBasedChannel | null = null
        try {
            const fetchedChannel = await opendiscord.client.client.channels.fetch(ticketChannelId)
            if (isGuildTextBasedChannel(fetchedChannel)) {
                channel = fetchedChannel
            }
        } catch {
            channel = null
        }
        if (!channel) {
            return { messageId: null, createdTimestamp: null }
        }

        const applicantDiscordUserId = resolveOriginalApplicantDiscordUserId(
            ticket.get("opendiscord:opened-by").value,
            ticket.get("opendiscord:previous-creators").value
        )
        if (!applicantDiscordUserId) {
            return { messageId: null, createdTimestamp: null }
        }

        const draft = await this.getTicketDraft(ticketChannelId, formId, applicantDiscordUserId)
        const draftSnapshot = buildInitialTicketDraftSnapshot(ticket, channel, formConfig, applicantDiscordUserId, draft)
        const lifecycleState = resolveApplicantLifecycleState(ticketChannelId)
        const editAnswerOptions = buildStartFormEditAnswerOptions(
            [...formConfig.questions].sort((left, right) => left.position - right.position),
            draftSnapshot.answers
        )
        const renderState = resolveStartFormRenderState(
            formConfig.description,
            draftSnapshot.draftState,
            lifecycleState,
            editAnswerOptions
        )
        const startMessageTemplate = await opendiscord.builders.messages.getSafe("ot-ticket-forms:start-form-message").build(
            "ticket",
            {
                formId: formConfig.id,
                formInstanceId: channel.id,
                formName: formConfig.name,
                formDescription: renderState.description,
                formColor: formConfig.color,
                acceptAnswers: renderState.buttonEnabled,
                buttonLabel: renderState.buttonLabel,
                showEditAnswerSelector: renderState.editAnswerVisible,
                editAnswerEnabled: renderState.editAnswerEnabled,
                editAnswerPlaceholder: renderState.editAnswerPlaceholder,
                editAnswerOptions: renderState.editAnswerOptions,
                showSubmitForReviewButton: renderState.submitForReviewVisible,
                submitForReviewEnabled: renderState.submitForReviewEnabled,
                submitForReviewLabel: renderState.submitForReviewLabel
            }
        )

        const renderedMessage = await ensureStartFormMessage(
            channel,
            startMessageTemplate.message,
            channel.id,
            draftSnapshot.startFormMessageId,
            {
                forceRecreate: options.forceRecreate,
                placementRepairAfterMessageTimestamp: options.placementRepairAfterMessageTimestamp
            }
        )

        if (draft == null || draft.startFormMessageId != renderedMessage.messageId) {
            await this.persistTicketDraftSnapshot(
                {
                    ...draftSnapshot,
                    startFormMessageId: renderedMessage.messageId,
                    updatedAt: draft == null ? new Date().toISOString() : draftSnapshot.updatedAt
                },
                false
            )
        }

        return {
            messageId: renderedMessage.messageId,
            createdTimestamp: renderedMessage.createdTimestamp
        }
    }
}
