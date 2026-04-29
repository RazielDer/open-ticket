import { api, opendiscord } from "#opendiscord";
import * as discord from "discord.js";
import {
    OTFormsAnswerTarget,
    OTFormsCapturedAnswer,
    OTFormsDraftState
} from "../types/configDefaults";
import {
    OT_FORMS_PLUGIN_SERVICE_ID,
    createTicketDraftKey,
    type OTFormsCompletedTicketFormContext,
    type OTFormsService,
    type OTFormsTicketDraftSnapshot
} from "../service/forms-service";
import {
    buildManagedRecordFields,
    buildTicketManagedRecordMessagePayload,
    rebindManagedRecordSnapshot,
    splitManagedRecordFields
} from "../service/ticket-managed-record-runtime";
import { cloneOTFormsCapturedAnswers } from "../service/answer-runtime";
import { toRicherMessageEditPayload } from "../../../src/core/api/openticket/richer-message";

function cloneAnswers(answers: readonly OTFormsCapturedAnswer[]): OTFormsCapturedAnswer[] {
    return cloneOTFormsCapturedAnswers(answers);
}

function resolveDraftKey(
    formId: string,
    answerTarget: OTFormsAnswerTarget,
    ticketContext: OTFormsCompletedTicketFormContext | null
): string | null {
    if (answerTarget != "ticket_managed_record" || !ticketContext) return null;
    return createTicketDraftKey(
        ticketContext.ticketChannelId,
        formId,
        ticketContext.applicantDiscordUserId
    );
}

function isGuildTextBasedChannel(
    channel: discord.Channel | null
): channel is discord.GuildTextBasedChannel {
    return !!channel && channel.isTextBased() && "guildId" in channel;
}

/**## OTForms_AnswersManager `class`
 * This is an OT Forms plugin answers message manager.
 * 
 * It is responsible for rendering the entire answers message.
 */
export class OTForms_AnswersManager {
    private static _instancesByMessageId: Map<string, OTForms_AnswersManager> = new Map();
    private static _instancesByDraftKey: Map<string, OTForms_AnswersManager> = new Map();

    private formId: string;
    private formInstanceId: string;
    private sessionId: string;
    private _message: discord.Message<boolean> | null;
    private pages: api.ODEmbedBuildResult[];
    private source: "button" | "other";
    private _type: OTFormsDraftState;
    private _user: discord.User;
    private _formColor: discord.ColorResolvable;
    private _answers: OTFormsCapturedAnswer[];
    private _currentPage: number = 1;
    private timestamp: Date = new Date();
    private completedAt: Date | null = null;
    private readonly answerTarget: OTFormsAnswerTarget;
    private readonly ticketContext: OTFormsCompletedTicketFormContext | null;
    private readonly draftKey: string | null;

    constructor(
        formId: string,
        formInstanceId: string,
        sessionId: string,
        source: "button" | "other",
        type: OTFormsDraftState,
        user: discord.User,
        formColor: discord.ColorResolvable,
        answers: OTFormsCapturedAnswer[],
        answerTarget: OTFormsAnswerTarget = "response_channel",
        ticketContext: OTFormsCompletedTicketFormContext | null = null
    ) {
        this.formId = formId;
        this.formInstanceId = formInstanceId;
        this.sessionId = sessionId;
        this._message = null;
        this.pages = [];
        this.source = source;
        this._type = type;
        this._user = user;
        this._formColor = formColor;
        this._answers = cloneAnswers(answers);
        this.answerTarget = answerTarget;
        this.ticketContext = ticketContext;
        this.draftKey = resolveDraftKey(formId, answerTarget, ticketContext);
        if (type === "completed") this.completedAt = new Date();
    }

    get message(): discord.Message<boolean> | null {
        return this._message;
    }

    get user(): discord.User {
        return this._user;
    }

    get formColor(): discord.ColorResolvable {
        return this._formColor;
    }

    get answers(): OTFormsCapturedAnswer[] {
        return cloneAnswers(this._answers);
    }

    get draftState(): OTFormsDraftState {
        return this._type;
    }

    set type(type: OTFormsDraftState) {
        this._type = type;
        if (type === "completed" && !this.completedAt) this.completedAt = new Date();
    }

    set answers(answers: OTFormsCapturedAnswer[]) {
        this._answers = cloneAnswers(answers);
    }

    static getInstance(messageId: string): OTForms_AnswersManager | undefined {
        return OTForms_AnswersManager._instancesByMessageId.get(messageId);
    }

    static getDraftInstance(
        formId: string,
        ticketChannelId: string,
        applicantDiscordUserId: string
    ): OTForms_AnswersManager | undefined {
        return OTForms_AnswersManager._instancesByDraftKey.get(
            createTicketDraftKey(ticketChannelId, formId, applicantDiscordUserId)
        );
    }

    static removeInstance(messageId: string): void {
        const existing = OTForms_AnswersManager._instancesByMessageId.get(messageId);
        if (existing?.draftKey) {
            OTForms_AnswersManager._instancesByDraftKey.delete(existing.draftKey);
        }
        OTForms_AnswersManager._instancesByMessageId.delete(messageId);
    }

    private registerInstance(): void {
        if (this._message) {
            OTForms_AnswersManager._instancesByMessageId.set(this._message.id, this);
        }
        if (this.draftKey) {
            OTForms_AnswersManager._instancesByDraftKey.set(this.draftKey, this);
        }
    }

    async render(): Promise<void> {
        this.pages = await this.splitAnswersIntoEmbeds(
            this.source,
            this._type,
            this._user,
            this._formColor,
            this._answers
        );
    }

    async sendMessage(
        channel: discord.GuildTextBasedChannel,
        pageNumber: number = this._currentPage
    ): Promise<void> {
        if (this.pages.length === 0) return;
        this._currentPage = pageNumber;

        if (this.answerTarget == "ticket_managed_record") {
            this._message = null;
            this.registerInstance();
            await this.save();
            return;
        }

        this._message = await channel.send(
            (
                await opendiscord.builders.messages.getSafe("ot-ticket-forms:answers-message").build(
                    this.source,
                    {
                        formId: this.formId,
                        formInstanceId: this.formInstanceId,
                        sessionId: this.sessionId,
                        type: this._type,
                        currentPageNumber: pageNumber,
                        totalPages: this.pages.length,
                        currentPage: this.pages[pageNumber - 1]
                    }
                )
            ).message
        );
        this.registerInstance();
        await this.save();
    }

    async editMessage(pageNumber: number = this._currentPage): Promise<void> {
        this._currentPage = pageNumber;

        if (this.answerTarget == "ticket_managed_record") {
            this.registerInstance();
            await this.save();
            return;
        }

        if (!this._message) return;
        const builtMessage = await opendiscord.builders.messages.getSafe("ot-ticket-forms:answers-message").build(
            this.source,
            {
                formId: this.formId,
                formInstanceId: this.formInstanceId,
                sessionId: this.sessionId,
                type: this._type,
                currentPageNumber: pageNumber,
                totalPages: this.pages.length,
                currentPage: this.pages[pageNumber - 1]
            }
        );
        await this._message.edit(toRicherMessageEditPayload(builtMessage.message as discord.MessageCreateOptions));
        await this.save();
    }

    private async editManagedRecordMessage(): Promise<void> {
        const payload = buildTicketManagedRecordMessagePayload(
            this.pages
                .map((entry) => entry.embed)
                .filter((embed): embed is discord.EmbedBuilder => embed !== null)
        );

        if (this._message) {
            try {
                await this._message.edit(payload);
                this.registerInstance();
                await this.save();
                return;
            } catch {
                OTForms_AnswersManager.removeInstance(this._message.id);
                this._message = null;
            }
        }

        const channel = await this.resolveManagedRecordChannel();
        if (!channel) return;
        this._message = await channel.send(payload);
        this.registerInstance();
        await this.save();
    }

    private async resolveManagedRecordChannel(): Promise<discord.GuildTextBasedChannel | null> {
        if (!this.ticketContext) return null;
        try {
            const channel = await opendiscord.client.client.channels.fetch(this.ticketContext.ticketChannelId);
            if (!isGuildTextBasedChannel(channel)) return null;
            return channel;
        } catch {
            return null;
        }
    }

    private async splitAnswersIntoEmbeds(
        source: "button" | "other",
        type: OTFormsDraftState,
        user: discord.User,
        formColor: discord.ColorResolvable,
        answers: OTFormsCapturedAnswer[]
    ): Promise<api.ODEmbedBuildResult[]> {
        const embeds: api.ODEmbedBuildResult[] = [];
        const fieldPages = splitManagedRecordFields(buildManagedRecordFields(answers));

        for (const fields of fieldPages) {
            const currentEmbedStructure = await opendiscord.builders.embeds.getSafe("ot-ticket-forms:answers-embed").build(
                source,
                { type, user, formColor, fields, timestamp: this.timestamp }
            );
            embeds.push(currentEmbedStructure);
        }

        return embeds;
    }

    private async save(): Promise<void> {
        if (this.answerTarget == "ticket_managed_record" && this.ticketContext) {
            const service = opendiscord.plugins.classes.get(OT_FORMS_PLUGIN_SERVICE_ID) as OTFormsService;
            const previousDraft = await service.getTicketDraft(
                this.ticketContext.ticketChannelId,
                this.formId,
                this.ticketContext.applicantDiscordUserId
            );
            const completedAt = this._type == "completed"
                ? (this.completedAt ?? new Date()).toISOString()
                : previousDraft?.completedAt ?? null;
            if (this._type == "completed" && !this.completedAt && completedAt) {
                this.completedAt = new Date(completedAt);
            }

            const fallbackSnapshot: OTFormsTicketDraftSnapshot = {
                ...this.ticketContext,
                formId: this.formId,
                answerTarget: this.answerTarget,
                draftState: this._type,
                formColor: String(this._formColor),
                updatedAt: new Date().toISOString(),
                completedAt,
                startFormMessageId: previousDraft?.startFormMessageId ?? null,
                managedRecordMessageId: previousDraft?.managedRecordMessageId ?? null,
                answers: cloneAnswers(this._answers)
            };

            await service.storeTicketDraft(
                rebindManagedRecordSnapshot(previousDraft ?? fallbackSnapshot, {
                    managedRecordMessageId: previousDraft?.managedRecordMessageId ?? null,
                    draftState: this._type,
                    updatedAt: fallbackSnapshot.updatedAt,
                    completedAt,
                    answers: cloneAnswers(this._answers)
                })
            );
            return;
        }

        const data: {
            formId: string,
            sessionId: string,
            messageId: string | null,
            source: "button" | "other",
            type: OTFormsDraftState,
            userId: string,
            formColor: discord.ColorResolvable,
            answers: OTFormsCapturedAnswer[],
            currentPage: number,
            timestamp: number
        } = {
            formId: this.formId,
            sessionId: this.sessionId,
            messageId: this._message ? this._message.id : null,
            source: this.source,
            type: this._type,
            userId: this._user.id,
            formColor: this._formColor,
            answers: cloneAnswers(this._answers),
            currentPage: this._currentPage,
            timestamp: this.timestamp.getTime()
        };

        const channelId = this._message ? this._message.channel.id : null;
        const messageId = this._message ? this._message.id : null;

        opendiscord.databases.get("opendiscord:global").set(
            "ot-ticket-forms:answers-manager",
            `${channelId}_${messageId}`,
            data
        );
        if (this._type !== "completed" || !this.ticketContext) return;

        const completedAt = this.completedAt ?? new Date();
        this.completedAt = completedAt;

        const service = opendiscord.plugins.classes.get(OT_FORMS_PLUGIN_SERVICE_ID) as OTFormsService;
        await service.storeCompletedTicketForm({
            ...this.ticketContext,
            formId: this.formId,
            completedAt: completedAt.toISOString(),
            answers: this._answers.map((entry) => ({
                position: entry.question.position,
                question: entry.question.question,
                answer: entry.answer,
                answerData: entry.answerData ?? null
            }))
        });
    }

    private static async restoreManagedDrafts(): Promise<void> {
        const service = opendiscord.plugins.classes.get(OT_FORMS_PLUGIN_SERVICE_ID) as OTFormsService;
        const snapshots = await service.listTicketDrafts();

        for (const snapshot of snapshots) {
            if (snapshot.answerTarget != "ticket_managed_record") continue;

            let user: discord.User;
            try {
                user = await opendiscord.client.client.users.fetch(snapshot.applicantDiscordUserId);
            } catch {
                continue;
            }

            const manager = new OTForms_AnswersManager(
                snapshot.formId,
                snapshot.ticketChannelId,
                `draft:${snapshot.applicantDiscordUserId}`,
                "other",
                snapshot.draftState,
                user,
                snapshot.formColor as discord.ColorResolvable,
                cloneAnswers(snapshot.answers),
                snapshot.answerTarget,
                {
                    ticketChannelId: snapshot.ticketChannelId,
                    ticketChannelName: snapshot.ticketChannelName,
                    ticketOptionId: snapshot.ticketOptionId,
                    applicantDiscordUserId: snapshot.applicantDiscordUserId
                }
            );
            if (snapshot.completedAt) {
                manager.completedAt = new Date(snapshot.completedAt);
            }
            await manager.render();

            manager._message = null;
            manager.registerInstance();
        }
    }

    static async restore(): Promise<void> {
        await OTForms_AnswersManager.restoreManagedDrafts();

        const globalDatabase = opendiscord.databases.get("opendiscord:global");
        const answersManagerCategory = await globalDatabase.getCategory("ot-ticket-forms:answers-manager") ?? [];

        for (const answersManagerData of answersManagerCategory) {
            const data: {
                formId: string,
                sessionId: string,
                messageId: string | null,
                source: "button" | "other",
                type: OTFormsDraftState,
                userId: string,
                formColor: discord.ColorResolvable,
                answers: OTFormsCapturedAnswer[],
                currentPage: number,
                timestamp: number
            } = answersManagerData.value;

            const formId = data.formId;
            const sessionId = data.sessionId;
            const messageId = data.messageId;
            const source = data.source;
            const type = data.type;
            const userId = data.userId;
            const formColor = data.formColor;
            const answers = cloneAnswers(data.answers);
            const currentPage = data.currentPage;

            let user: discord.User;
            try {
                user = await opendiscord.client.client.users.fetch(userId);
            } catch {
                continue;
            }

            const channelId = answersManagerData.key.split("_")[0];
            let channel: discord.Channel | null;
            try {
                channel = await opendiscord.client.client.channels.fetch(channelId);
            } catch {
                globalDatabase.delete("ot-ticket-forms:answers-manager", `${channelId}_${messageId}`);
                continue;
            }
            if (!channel || !channel.isTextBased()) {
                continue;
            }

            if (!messageId) {
                continue;
            }

            let message: discord.Message | null;
            try {
                message = await channel.messages.fetch(messageId);
            } catch {
                globalDatabase.delete("ot-ticket-forms:answers-manager", `${channelId}_${messageId}`);
                continue;
            }

            if (!message) {
                continue;
            }

            const answersManager = new OTForms_AnswersManager(
                formId,
                formId,
                sessionId,
                source,
                type,
                user,
                formColor,
                answers
            );
            answersManager._currentPage = currentPage;
            answersManager.timestamp = new Date(data.timestamp);
            answersManager._message = message as discord.Message<boolean>;
            await answersManager.render();
            answersManager.registerInstance();
        }
    }
}
