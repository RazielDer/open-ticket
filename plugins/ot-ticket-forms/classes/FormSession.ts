import { api, opendiscord } from "#opendiscord"
import * as discord from "discord.js"
import {
    OTForms_ButtonQuestion,
    OTForms_DropdownQuestion,
    OTForms_ModalQuestion,
    OTFormsCapturedAnswer,
    OTFormsDraftState
} from "../types/configDefaults"
import { OTForms_Form } from "./Form"
import { OTForms_AnswersManager } from "./AnswersManager"
import {
    OT_FORMS_PLUGIN_SERVICE_ID,
    type OTFormsService
} from "../service/forms-service"
import { clearAwaitingUserForApplicantMutation } from "../../../src/actions/ticketWorkflow.js"
import {
    applyDraftResponses,
    OTFormsInteractionGate,
    resolveNextSessionAction,
    resolveDraftStateFromAnswers,
    resolveDraftResumeQuestionIndex
} from "../service/draft-runtime"
import {
    findSavedAnswer,
    hydrateModalQuestionsWithSavedAnswers
} from "../service/edit-mode-runtime"
import {
    captureOTFormsModalQuestionAnswer,
    cloneOTFormsCapturedAnswers,
    isOTFormsLegacyPromptQuestion,
    isOTFormsModalCapableQuestion
} from "../service/answer-runtime"
import {
    buildEphemeralStatusMessage,
    deliverLiveContinuePrompt,
    deliverLiveQuestionPrompt,
    deliverPassiveAnsweredConfirmation,
    deliverStatusReply,
    OT_FORMS_SAVE_FAILURE_MESSAGE,
    type OTFormsSessionMessageDeliveryMode,
    type OTFormsSessionResponderInstance,
    type OTFormsSessionTransportKind
} from "../service/session-message-runtime"

interface OTFormsSessionOptions {
    targetQuestionPosition?: number | null
}

type OTFormsResponderInstance =
    | api.ODButtonResponderInstance
    | api.ODDropdownResponderInstance
    | api.ODModalResponderInstance

/* FORM SESSION CLASS
 * This is the main clas of a form session (every user answering a form is a OTForms_FormSession).
 * A single user can have multiple OTForms_FormSession instances.
 * Sends form questions and manage answers.
 */
export class OTForms_FormSession {
    private id: string;
    user: discord.User;
    private form: OTForms_Form;
    private currentSection: number = 1;
    private currentQuestionNumber: number = 0;
    private answers: OTFormsCapturedAnswer[] = [];
    private instance: OTFormsResponderInstance | undefined;
    private answersManager: OTForms_AnswersManager | undefined;
    private readonly interactionGate = new OTFormsInteractionGate();
    private hydratedFromDraft = false;
    private readonly targetQuestionPosition: number | null;

    constructor(id: string, user: discord.User, form: OTForms_Form, options: OTFormsSessionOptions = {}) {
        this.id = id;
        this.user = user;
        this.form = form;
        this.targetQuestionPosition = options.targetQuestionPosition ?? null;
    }

    public async start(): Promise<void> {
        await this.hydrateFromDraftState();
        if (!this.applyTargetedEditPosition()) {
            await this.acknowledgeNeutralRecovery(this.instance);
            this.form.finalizeSession(this.id, this.form.name, this.user);
            return;
        }
        await this.sendNextQuestion();
    }

    public async continue(mode:"question" | "continue"): Promise<boolean> {
        if (this.currentQuestionNumber >= this.form.questions.length) {
            this.currentSection++;
            return this.finalize();
        }
        if (mode === "question") {
            return this.sendNextQuestion();
        }
        this.currentSection++;
        switch (resolveNextSessionAction(this.form.questions, this.currentQuestionNumber)) {
            case "auto_advance_question":
                await this.sendPassiveSectionConfirmation();
                return this.sendNextQuestion();
            case "finalize":
                return this.finalize();
            case "continue_prompt":
            default:
                return this.sendContinueMessage(true);
        }
    }

    private async handleResponse(answers: OTFormsCapturedAnswer[]): Promise<void> {
        const previousQuestionNumber = this.currentQuestionNumber;
        const previousSection = this.currentSection;
        const previousAnswers = cloneOTFormsCapturedAnswers(this.answers);
        const advancedQuestionNumber = this.currentQuestionNumber + answers.length;
        const isTargetedEdit = this.isTargetedEdit();
        try {
            const nextState = await applyDraftResponses({
                currentQuestionIndex: this.currentQuestionNumber,
                existingAnswers: this.answers,
                incomingAnswers: answers,
                updateDraft: async (mergedAnswers) => {
                    this.answers = mergedAnswers;
                    this.currentQuestionNumber = advancedQuestionNumber;
                    await this.updateAnswersMessage();
                    await this.clearAwaitingUserForApplicantMutation();
                },
                continueSession: async () => {
                    this.currentQuestionNumber = advancedQuestionNumber;
                    return isTargetedEdit
                        ? this.completeTargetedEdit()
                        : this.continue("continue");
                }
            });
            this.currentQuestionNumber = nextState.currentQuestionIndex;
            this.answers = nextState.answers;

            if (!isTargetedEdit && !nextState.uiDeliverySucceeded && nextState.currentQuestionIndex < this.form.questions.length) {
                await this.sendContinueMessage(false);
            }
        } catch {
            this.currentQuestionNumber = previousQuestionNumber;
            this.currentSection = previousSection;
            this.answers = previousAnswers;
            await this.acknowledgeUnsavedFailure();
        }
    }

    public async handleButtonResponse(response: string): Promise<void> {
        await this.withInteractionGuard(async () => {
            if (!this.isCurrentComponentPromptActive()) {
                await this.acknowledgeNeutralRecovery(this.instance);
                return;
            }
            const question = this.form.questions[this.currentQuestionNumber];
            await this.handleResponse([{ question, answer: response, answerData: null }]);
        });
    }

    public async handleDropdownResponse(
        response: api.ODDropdownResponderInstanceValues
    ): Promise<void> {
        await this.withInteractionGuard(async () => {
            if (!this.isCurrentComponentPromptActive()) {
                await this.acknowledgeNeutralRecovery(this.instance);
                return;
            }
            const question = this.form.questions[this.currentQuestionNumber];
            const answer = response.getStringValues().join(", ");
            await this.handleResponse([{ question, answer, answerData: null }]);
        });
    }

    public async handleModalResponse(
        response: api.ODModalResponderInstanceValues,
        answeredQuestions: { number: number; required: boolean; }[]
    ): Promise<void> {
        await this.withInteractionGuard(async () => {
            const answers = answeredQuestions.map((q) => {
                const questionIndex = this.form.getQuestionIndexByPosition(q.number);
                const question = this.form.questions[questionIndex];
                if (!isOTFormsModalCapableQuestion(question)) {
                    throw new api.ODSystemError(`ot-ticket-forms: stale modal question ${q.number} is not modal-capable.`)
                }
                return captureOTFormsModalQuestionAnswer(question, response)
            });
            await this.handleResponse(answers);
        });
    }

    public async setInstance(
        instance: OTFormsResponderInstance,
        onlyIfNotSessionMessage: boolean = false
    ) {
        this.instance = instance;
        void onlyIfNotSessionMessage;
    }

    private async sendNextQuestion(): Promise<boolean> {
        const question = this.form.questions[this.currentQuestionNumber];
        if (isOTFormsModalCapableQuestion(question)) return this.sendModalQuestions();
        if (question.type == "dropdown") return this.sendDropdownQuestion(question as OTForms_DropdownQuestion);
        if (question.type == "button") return this.sendButtonQuestion(question as OTForms_ButtonQuestion);
        console.error("Unknown question type: ", question.type);
        return false;
    }

    private async sendModalQuestions(): Promise<boolean> {
        const modalQuestions: OTForms_ModalQuestion[] = [];
        let count = 0;

        if (!this.instance || this.instance.didReply) {
            opendiscord.log("Error: Modal questions have not been sent. Instance not found or already replied.", "plugin");
            return false;
        }

        if (this.instance instanceof api.ODModalResponderInstance) {
            opendiscord.log("Error: Modal questions have not been sent. Current instance is not valid for modals.", "plugin");
            return false;
        }

        if (this.isTargetedEdit()) {
            const question = this.form.questions[this.currentQuestionNumber];
            if (isOTFormsModalCapableQuestion(question)) {
                modalQuestions.push(question as OTForms_ModalQuestion);
            }
        } else {
            while (count < 5 && this.currentQuestionNumber + count < this.form.questions.length) {
                const question = this.form.questions[this.currentQuestionNumber + count];
                if (!isOTFormsModalCapableQuestion(question)) break;
                modalQuestions.push(question as OTForms_ModalQuestion);
                count++;
            }
        }

        return (this.instance as api.ODButtonResponderInstance | api.ODDropdownResponderInstance).modal(
            await opendiscord.builders.modals.getSafe("ot-ticket-forms:questions-modal").build(
                "other",
                {
                    formId: this.form.id,
                    formInstanceId: this.form.instanceId,
                    sessionId: this.id,
                    formName: this.form.name,
                    questions: hydrateModalQuestionsWithSavedAnswers(modalQuestions, this.answers),
                    currentSection: this.currentSection,
                    totalSections: this.form.totalSections
                }
            )
        );
    }

    private async sendDropdownQuestion(question: OTForms_DropdownQuestion): Promise<boolean> {
        if (!this.instance) {
            opendiscord.log("Error: Dropdown question has not been sent. Interaction not found.", "plugin");
            return false;
        }
        const savedAnswer = findSavedAnswer(this.answers, question);

        const message = await opendiscord.builders.messages.getSafe("ot-ticket-forms:question-message").build(
            "other",
            {
                formId: this.form.id,
                formInstanceId: this.form.instanceId,
                sessionId: this.id,
                question,
                currentSection: this.currentSection,
                totalSections: this.form.totalSections,
                formColor: this.form.color,
                savedAnswer,
                displayMode: "live_prompt"
            }
        );

        const delivery = await deliverLiveQuestionPrompt({
            transportKind: this.resolveTransportKind(),
            instance: this.instance as OTFormsSessionResponderInstance,
            message,
            deliveryMode: this.resolveQuestionPromptDeliveryMode()
        });
        return delivery.success;
    }

    private async sendButtonQuestion(question: OTForms_ButtonQuestion): Promise<boolean> {
        if (!this.instance) {
            opendiscord.log("Error: Button question has not been sent. Interaction not found.", "plugin");
            return false;
        }
        const savedAnswer = findSavedAnswer(this.answers, question);

        const message = await opendiscord.builders.messages.getSafe("ot-ticket-forms:question-message").build(
            "other",
            {
                formId: this.form.id,
                formInstanceId: this.form.instanceId,
                sessionId: this.id,
                question,
                currentSection: this.currentSection,
                totalSections: this.form.totalSections,
                formColor: this.form.color,
                savedAnswer,
                displayMode: "live_prompt"
            }
        );

        const delivery = await deliverLiveQuestionPrompt({
            transportKind: this.resolveTransportKind(),
            instance: this.instance as OTFormsSessionResponderInstance,
            message,
            deliveryMode: this.resolveQuestionPromptDeliveryMode()
        });
        return delivery.success;
    }

    private async sendContinueMessage(includePassiveConfirmation: boolean): Promise<boolean> {
        if (!this.instance) {
            opendiscord.log("Error: The continue message has not been sent. Interaction not found.", "plugin");
            return false;
        }

        if (includePassiveConfirmation) {
            await this.sendPassiveSectionConfirmation();
        }

        const message = await opendiscord.builders.messages.getSafe("ot-ticket-forms:continue-message").build(
            "button",
            {
                formId: this.form.id,
                formInstanceId: this.form.instanceId,
                sessionId: this.id,
                currentSection: this.currentSection,
                totalSections: this.form.totalSections,
                formColor: this.form.color,
                displayMode: "continue_prompt"
            }
        );

        const delivery = await deliverLiveContinuePrompt({
            transportKind: this.resolveTransportKind(),
            instance: this.instance as OTFormsSessionResponderInstance,
            message,
            deliveryMode: "follow_up"
        });
        return delivery.success;
    }

    private async updateAnswersMessage(): Promise<void> {
        const type = this.resolveDraftState();

        if (!this.answersManager) {
            const ticketContext = this.form.getCompletedTicketFormContext();
            if (ticketContext) {
                this.answersManager = OTForms_AnswersManager.getDraftInstance(
                    this.form.id,
                    ticketContext.ticketChannelId,
                    ticketContext.applicantDiscordUserId
                );
            }
        }

        if (!this.answersManager) {
            this.answersManager = new OTForms_AnswersManager(
                this.form.id,
                this.form.instanceId,
                this.id,
                "other",
                type,
                this.user,
                this.form.color,
                this.answers,
                this.form.answerTarget,
                this.form.getCompletedTicketFormContext()
            );
            await this.answersManager.render();
            await this.answersManager.sendMessage(this.form.getAnswerDeliveryChannel());
            return;
        }

        this.answersManager.answers = this.answers;
        this.answersManager.type = type;
        await this.answersManager.render();
        await this.answersManager.editMessage();
    }

    private async clearAwaitingUserForApplicantMutation(): Promise<void> {
        const ticketContext = this.form.getCompletedTicketFormContext();
        if (!ticketContext) return;
        await clearAwaitingUserForApplicantMutation(
            ticketContext.ticketChannelId,
            this.user.id,
            ticketContext.applicantDiscordUserId,
            this.form.answerTarget
        ).catch(() => null);
    }

    private async finalize(): Promise<boolean> {
        let deliverySucceeded = true;
        if (this.instance) {
            deliverySucceeded = await this.sendPassiveSectionConfirmation();
        }
        return this.finishSession(deliverySucceeded, "Form answered.");
    }

    private async completeTargetedEdit(): Promise<boolean> {
        let deliverySucceeded = true;
        if (this.instance) {
            deliverySucceeded = await this.sendTargetedEditSavedConfirmation();
        }
        return this.finishSession(deliverySucceeded, "Form answer updated.");
    }

    private finishSession(deliverySucceeded: boolean, logMessage: string): boolean {
        opendiscord.log(logMessage, "plugin", [
            { key: "Form", value: this.form.name },
            { key: "User", value: this.user.tag }
        ]);
        this.form.finalizeSession(this.id, this.form.name, this.user);
        return deliverySucceeded;
    }

    private async hydrateFromDraftState(): Promise<void> {
        if (this.hydratedFromDraft) return;
        this.hydratedFromDraft = true;

        const ticketContext = this.form.getCompletedTicketFormContext();
        if (!ticketContext || this.form.answerTarget != "ticket_managed_record") return;

        this.answersManager = OTForms_AnswersManager.getDraftInstance(
            this.form.id,
            ticketContext.ticketChannelId,
            ticketContext.applicantDiscordUserId
        );
        if (this.answersManager) {
            this.answers = this.answersManager.answers;
            this.currentQuestionNumber = resolveDraftResumeQuestionIndex(
                this.form.questions,
                this.answersManager.draftState,
                this.answers
            );
            this.currentSection = this.form.getSectionNumberForQuestionIndex(this.currentQuestionNumber);
            return;
        }

        const service = opendiscord.plugins.classes.get(OT_FORMS_PLUGIN_SERVICE_ID) as OTFormsService;
        const draft = await service.getTicketDraft(
            ticketContext.ticketChannelId,
            this.form.id,
            ticketContext.applicantDiscordUserId
        );
        if (!draft) return;

        this.answers = cloneOTFormsCapturedAnswers(draft.answers);
        this.currentQuestionNumber = resolveDraftResumeQuestionIndex(
            this.form.questions,
            draft.draftState,
            this.answers
        );
        this.currentSection = this.form.getSectionNumberForQuestionIndex(this.currentQuestionNumber);
    }

    private async withInteractionGuard(callback: () => Promise<void>): Promise<void> {
        if (!this.instance) return;
        const interactionId = this.instance.interaction.id;
        if (!this.interactionGate.begin(interactionId)) {
            await this.acknowledgeDuplicateInteraction(this.instance);
            return;
        }
        try {
            await callback();
        } finally {
            this.interactionGate.finish(interactionId);
        }
    }

    private async acknowledgeDuplicateInteraction(instance: OTFormsResponderInstance): Promise<void> {
        if (instance.didReply || instance.interaction.deferred || instance.interaction.replied) {
            return;
        }
        await this.acknowledgeNeutralRecovery(instance);
    }

    private resolveTransportKind(): OTFormsSessionTransportKind {
        if (!this.instance) {
            throw new Error("Session interaction is not available.");
        }
        if (this.instance instanceof api.ODModalResponderInstance) return "modal";
        if (this.instance instanceof api.ODDropdownResponderInstance) return "dropdown";
        return "button";
    }

    private resolveTransportKindForInstance(instance: OTFormsResponderInstance): OTFormsSessionTransportKind {
        if (instance instanceof api.ODModalResponderInstance) return "modal";
        if (instance instanceof api.ODDropdownResponderInstance) return "dropdown";
        return "button";
    }

    private resolveQuestionPromptDeliveryMode(): OTFormsSessionMessageDeliveryMode {
        const customId = this.resolveInteractionCustomId();
        if (!customId) return "initial_reply";
        if (customId.startsWith("ot-ticket-forms:cb_")) return "replace_active_prompt";
        if (
            customId.startsWith("ot-ticket-forms:qb_")
            || customId.startsWith("ot-ticket-forms:qd_")
            || customId.startsWith("ot-ticket-forms:qm_")
        ) {
            return "follow_up";
        }
        return "initial_reply";
    }

    private resolveInteractionCustomId(): string | null {
        if (!this.instance) return null;
        const interaction = this.instance.interaction as { customId?: string };
        return typeof interaction.customId == "string" ? interaction.customId : null;
    }

    private getAnsweredComponentQuestion(): OTForms_ButtonQuestion | OTForms_DropdownQuestion | null {
        const answeredQuestion = this.form.questions[this.currentQuestionNumber - 1];
        if (!answeredQuestion) return null;
        if (!isOTFormsLegacyPromptQuestion(answeredQuestion)) return null;
        return answeredQuestion as OTForms_ButtonQuestion | OTForms_DropdownQuestion;
    }

    private async sendPassiveSectionConfirmation(): Promise<boolean> {
        if (!this.instance) return false;

        const transportKind = this.resolveTransportKind();
        let message: api.ODMessageBuildResult;

        if (transportKind == "modal") {
            message = await opendiscord.builders.messages.getSafe("ot-ticket-forms:continue-message").build(
                "button",
                {
                    formId: this.form.id,
                    formInstanceId: this.form.instanceId,
                    sessionId: this.id,
                    currentSection: this.currentSection,
                    totalSections: this.form.totalSections,
                    formColor: this.form.color,
                    displayMode: "passive_confirmation"
                }
            );
        } else {
            const answeredQuestion = this.getAnsweredComponentQuestion();
            if (!answeredQuestion) {
                message = await opendiscord.builders.messages.getSafe("ot-ticket-forms:continue-message").build(
                    "button",
                    {
                        formId: this.form.id,
                        formInstanceId: this.form.instanceId,
                        sessionId: this.id,
                        currentSection: this.currentSection,
                        totalSections: this.form.totalSections,
                        formColor: this.form.color,
                        displayMode: "passive_confirmation"
                    }
                );
            } else {
                message = await opendiscord.builders.messages.getSafe("ot-ticket-forms:question-message").build(
                    "other",
                    {
                        formId: this.form.id,
                        formInstanceId: this.form.instanceId,
                        sessionId: this.id,
                        question: answeredQuestion,
                        currentSection: this.currentSection,
                        totalSections: this.form.totalSections,
                        formColor: this.form.color,
                        savedAnswer: findSavedAnswer(this.answers, answeredQuestion),
                        displayMode: "passive_confirmation"
                    }
                );
            }
        }

        const delivery = await deliverPassiveAnsweredConfirmation({
            transportKind,
            instance: this.instance as OTFormsSessionResponderInstance,
            message
        });
        return delivery.success;
    }

    private isCurrentComponentPromptActive(): boolean {
        if (
            !this.instance
            || this.instance instanceof api.ODModalResponderInstance
        ) {
            return false;
        }
        const expectedQuestion = this.form.questions[this.currentQuestionNumber];
        if (!isOTFormsLegacyPromptQuestion(expectedQuestion)) {
            return false;
        }

        const title = this.instance.message?.embeds?.[0]?.title ?? "";
        const match = /^Question (\d+)$/.exec(title);
        return match !== null && Number(match[1]) == expectedQuestion.position;
    }

    private async acknowledgeNeutralRecovery(instance: OTFormsResponderInstance | undefined): Promise<void> {
        if (!instance || instance.didReply || instance.interaction.deferred || instance.interaction.replied) {
            return;
        }

        await deliverStatusReply({
            transportKind: this.resolveTransportKindForInstance(instance),
            instance: instance as OTFormsSessionResponderInstance,
            message: buildEphemeralStatusMessage(
                "ot-ticket-forms:stale-recovery",
                await this.form.buildInactiveRecoveryMessage()
            )
        });
    }

    private async acknowledgeUnsavedFailure(): Promise<void> {
        if (!this.instance) return;

        await deliverStatusReply({
            transportKind: this.resolveTransportKind(),
            instance: this.instance as OTFormsSessionResponderInstance,
            message: buildEphemeralStatusMessage(
                "ot-ticket-forms:save-failure",
                OT_FORMS_SAVE_FAILURE_MESSAGE
            )
        });
    }

    private isTargetedEdit(): boolean {
        return typeof this.targetQuestionPosition == "number";
    }

    private applyTargetedEditPosition(): boolean {
        if (!this.isTargetedEdit()) return true;
        const questionIndex = this.form.getQuestionIndexByPosition(this.targetQuestionPosition as number);
        if (questionIndex < 0) return false;
        const question = this.form.questions[questionIndex];
        if (!question || !findSavedAnswer(this.answers, question)) return false;
        this.currentQuestionNumber = questionIndex;
        this.currentSection = this.form.getSectionNumberForQuestionIndex(questionIndex);
        return true;
    }

    private resolveDraftState(): OTFormsDraftState {
        return resolveDraftStateFromAnswers(this.form.questions, this.answers);
    }

    private async sendTargetedEditSavedConfirmation(): Promise<boolean> {
        if (!this.instance) return false;

        const delivery = await deliverPassiveAnsweredConfirmation({
            transportKind: this.resolveTransportKind(),
            instance: this.instance as OTFormsSessionResponderInstance,
            message: buildEphemeralStatusMessage(
                "ot-ticket-forms:targeted-edit-saved",
                "Answer updated. Use the ticket card to continue or edit another saved answer."
            )
        });
        return delivery.success;
    }
}
