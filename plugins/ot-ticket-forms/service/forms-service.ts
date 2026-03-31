import { api, opendiscord } from "#opendiscord"
import {
    OTFormsCompletedTicketFormStore,
    OT_FORMS_COMPLETED_TICKET_FORM_CATEGORY,
    OT_FORMS_PLUGIN_SERVICE_ID,
    createCompletedTicketFormKey,
    type OTFormsCompletedTicketFormSnapshot
} from "./forms-model"

export {
    OTFormsCompletedTicketFormStore,
    OT_FORMS_COMPLETED_TICKET_FORM_CATEGORY,
    OT_FORMS_PLUGIN_SERVICE_ID,
    createCompletedTicketFormKey,
    normalizeCompletedTicketFormSnapshot,
    normalizeDiscordUserId,
    resolveOriginalApplicantDiscordUserId,
    type OTFormsCompletedTicketFormAnswer,
    type OTFormsCompletedTicketFormContext,
    type OTFormsCompletedTicketFormSnapshot
} from "./forms-model"

export class OTFormsService extends api.ODManagerData {
    private readonly store = new OTFormsCompletedTicketFormStore()
    private restored = false

    constructor(id: api.ODValidId = OT_FORMS_PLUGIN_SERVICE_ID) {
        super(id)
    }

    private async ensureRestored(): Promise<void> {
        if (this.restored) return
        await this.restoreCompletedTicketForms()
    }

    async restoreCompletedTicketForms(): Promise<void> {
        const globalDatabase = opendiscord.databases.get("opendiscord:global")
        const storedEntries = await globalDatabase.getCategory(OT_FORMS_COMPLETED_TICKET_FORM_CATEGORY) ?? []
        this.store.restore(storedEntries.map((entry) => entry.value as OTFormsCompletedTicketFormSnapshot))
        this.restored = true
    }

    async storeCompletedTicketForm(snapshot: OTFormsCompletedTicketFormSnapshot): Promise<OTFormsCompletedTicketFormSnapshot> {
        await this.ensureRestored()
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
        await this.ensureRestored()
        return this.store.getCompletedTicketForm(ticketChannelId, formId)
    }
}
