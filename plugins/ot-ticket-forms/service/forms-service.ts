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
import { ensureStartFormMessage, resolveStartFormRenderState } from "./start-form-runtime"
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

    async storeTicketDraft(snapshot: OTFormsTicketDraftSnapshot): Promise<OTFormsTicketDraftSnapshot> {
        await this.ensureTicketDraftsRestored()
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
        await this.refreshTicketStartFormMessage(normalized.ticketChannelId, normalized.formId)
        return normalized
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

    async refreshTicketStartFormMessage(ticketChannelId: string, formId: string): Promise<boolean> {
        await this.ensureTicketDraftsRestored()

        const ticket = opendiscord.tickets.get(ticketChannelId)
        if (!ticket || ticket.get("opendiscord:closed").value) return false

        const formConfig = resolveTicketFormConfig(formId)
        if (!formConfig) return false

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

        const applicantDiscordUserId = resolveOriginalApplicantDiscordUserId(
            ticket.get("opendiscord:opened-by").value,
            ticket.get("opendiscord:previous-creators").value
        )
        const draft = applicantDiscordUserId
            ? await this.getTicketDraft(ticketChannelId, formId, applicantDiscordUserId)
            : null
        const canApplicantEdit = resolveBridgeEditGate()?.canApplicantEdit(ticketChannelId) ?? true
        const renderState = resolveStartFormRenderState(
            formConfig.description,
            draft?.draftState ?? null,
            canApplicantEdit
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
                buttonLabel: renderState.buttonLabel
            }
        )

        await ensureStartFormMessage(channel, startMessageTemplate.message, channel.id)
        return true
    }
}
