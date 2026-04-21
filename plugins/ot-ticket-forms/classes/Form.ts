import * as discord from "discord.js"
import { opendiscord } from "#opendiscord"
import { OTFormsAnswerTarget, OTForms_Question } from "../types/configDefaults"
import { OTForms_FormSession } from "./FormSession"
import type { OTFormsCompletedTicketFormContext } from "../service/forms-service"
import {
    OT_FORMS_PLUGIN_SERVICE_ID,
    type OTFormsService
} from "../service/forms-service"
import { OTFormsActiveSessionRegistry } from "../service/draft-runtime"
import {
    type OTFormsApplicantLifecycleState,
    buildInactiveStepRecoveryMessage,
    resolveStartFormCardState
} from "../service/start-form-runtime"

interface OTFormsBridgeEditGate {
    canApplicantEdit(ticketChannelId: string): boolean
    resolveApplicantLifecycleState?(ticketChannelId: string): OTFormsApplicantLifecycleState
}

/* FORM CLASS
 * This is the main class of a form (every form message sent is a OTForms_Form). 
 * A single form on the config can have multiple OTForms_Form instances. It contains all the information of a form.
 * Creates and manages OTForms_FormSession.
 */
export class OTForms_Form {
    id: string;
    instanceId: string;
    channel: discord.GuildTextBasedChannel;
    name: string;
    color: discord.ColorResolvable;
    questions: OTForms_Question[];
    answerTarget: OTFormsAnswerTarget;
    answersChannel: discord.GuildTextBasedChannel | null;
    totalSections: number;
    private readonly ticketContext: OTFormsCompletedTicketFormContext | null;
    private activeSessions: Map<string, OTForms_FormSession>;
    private readonly activeSessionRegistry: OTFormsActiveSessionRegistry;
    private readonly sectionNumbersByQuestionIndex: number[];
    private sessionCounter: number = 0;

    constructor(
        formId: string,
        instanceId: string,
        channel: discord.GuildTextBasedChannel,
        name: string,
        color: discord.ColorResolvable,
        questions: OTForms_Question[],
        answerTarget: OTFormsAnswerTarget,
        answersChannel: discord.GuildTextBasedChannel | null,
        ticketContext: OTFormsCompletedTicketFormContext | null = null
    ) {
        this.id = formId;
        this.instanceId = instanceId;
        this.channel = channel;
        this.name = name;
        this.color = color;
        this.questions = questions;
        this.answerTarget = answerTarget;
        this.answersChannel = answersChannel;
        this.ticketContext = ticketContext;
        this.activeSessions = new Map<string, OTForms_FormSession>();
        this.activeSessionRegistry = new OTFormsActiveSessionRegistry();
        this.sectionNumbersByQuestionIndex = [];

        // Calculate total sections
        this.totalSections = 0;
        let lastQuestionType: "short" | "paragraph" | "dropdown" | "button" | undefined;
        let typeTextCount = 1;
        questions.forEach((question, index) => {
            if (question.type !== "short" && question.type !== "paragraph") {
                // If it's not type text ("short" or "paragraph"), it counts as a section
                this.totalSections++;
            } else {
                // If it's type text, it only counts as a section if the last question wasn't text
                if (typeTextCount === 5 || (lastQuestionType !== "short" && lastQuestionType !== "paragraph")) {
                    this.totalSections++;
                    typeTextCount = 1;
                } else {
                    typeTextCount++;
                }
            }
            lastQuestionType = question.type;
            this.sectionNumbersByQuestionIndex[index] = this.totalSections;
        });
    }

    /* CREATE SESSION
     * Creates a new session for a user to answer the form.
     */
    public createSession(
        user: discord.User,
        message: discord.Message,
        options: {
            replaceExistingBinding?: boolean
            targetQuestionPosition?: number | null
        } = {}
    ): OTForms_FormSession {
        if(!this.totalSections) throw new Error("Total sections not calculated");
        const existingSessionId = this.activeSessionRegistry.get(user.id);
        if (existingSessionId) {
            const existingSession = this.activeSessions.get(existingSessionId);
            if (existingSession && !options.replaceExistingBinding) {
                return existingSession;
            }
            this.activeSessions.delete(existingSessionId);
            this.activeSessionRegistry.clear(user.id);
        }
        const sessionId = this.generateSessionId();

        const session = new OTForms_FormSession(sessionId, user, this, {
            targetQuestionPosition: options.targetQuestionPosition ?? null
        });
        this.activeSessions.set(sessionId, session);
        this.activeSessionRegistry.set(user.id, sessionId);
        return session;
    }

    /* FINALIZE SESSION
     * Removes a session from the active sessions.
     */
    public finalizeSession(sessionId: string, formName: string, user: discord.User): void {
        this.activeSessions.delete(sessionId);
        if (this.activeSessionRegistry.get(user.id) == sessionId) {
            this.activeSessionRegistry.clear(user.id);
        }
        opendiscord.log(`Form session removed.`, "plugin", [
            {key:"Form", value:formName},
            {key:"User", value:user.tag}
        ])
    }

    /* GENERATE SESSION ID
     * Generates a new session id.
     */
    private generateSessionId(): string {
        return `s${this.sessionCounter++}`;
    }

    /* GET SESSION
     * Returns a session by its id.
    */
    public getSession(sessionId:string): OTForms_FormSession | undefined {
        return this.activeSessions.get(sessionId);
    }

    public getCompletedTicketFormContext(): OTFormsCompletedTicketFormContext | null {
        if (!this.ticketContext) return null;
        const ticketChannelName = ("name" in this.channel && typeof this.channel.name === "string" && this.channel.name.length > 0)
            ? this.channel.name
            : this.ticketContext.ticketChannelName;
        return {
            ...this.ticketContext,
            ticketChannelName
        };
    }

    private getBridgeEditGate(): OTFormsBridgeEditGate | null {
        try {
            return opendiscord.plugins.classes.get("ot-eotfs-bridge:service") as unknown as OTFormsBridgeEditGate;
        } catch {
            return null;
        }
    }

    public getMutationBlockReason(userId: string): string | null {
        if (this.answerTarget != "ticket_managed_record" || !this.ticketContext) return null;
        if (this.ticketContext.applicantDiscordUserId != userId) {
            return "Only the applicant who opened this ticket can change the whitelist application.";
        }
        const bridgeEditGate = this.getBridgeEditGate();
        if (bridgeEditGate && !bridgeEditGate.canApplicantEdit(this.ticketContext.ticketChannelId)) {
            return "The whitelist application is locked because staff review is no longer open for updates.";
        }
        return null;
    }

    public canUserMutate(userId: string): boolean {
        return this.getMutationBlockReason(userId) === null;
    }

    public getAnswerDeliveryChannel(): discord.GuildTextBasedChannel {
        return this.answerTarget == "ticket_managed_record"
            ? this.channel
            : this.answersChannel ?? this.channel;
    }

    public getQuestionIndexByPosition(position: number): number {
        return this.questions.findIndex((question) => question.position == position);
    }

    public getSectionNumberForQuestionIndex(questionIndex: number): number {
        return this.sectionNumbersByQuestionIndex[questionIndex] ?? 1;
    }

    public async buildInactiveRecoveryMessage(): Promise<string> {
        const ticketContext = this.getCompletedTicketFormContext();
        if (!ticketContext || this.answerTarget != "ticket_managed_record") {
            return buildInactiveStepRecoveryMessage("fill_out", false, "unsubmitted");
        }

        const service = opendiscord.plugins.classes.get(OT_FORMS_PLUGIN_SERVICE_ID) as OTFormsService;
        const draft = await service.getTicketDraft(
            ticketContext.ticketChannelId,
            this.id,
            ticketContext.applicantDiscordUserId
        );
        const lifecycleState = this.getBridgeEditGate()?.resolveApplicantLifecycleState?.(ticketContext.ticketChannelId)
            ?? (this.canUserMutate(ticketContext.applicantDiscordUserId) ? "unsubmitted" : "locked");
        const cardState = resolveStartFormCardState(
            draft?.draftState ?? null,
            lifecycleState
        );
        const hasSavedAnswers = (draft?.answers.length ?? 0) > 0;
        return buildInactiveStepRecoveryMessage(cardState, hasSavedAnswers, lifecycleState);
    }
}
