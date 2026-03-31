import * as discord from "discord.js"
import { opendiscord } from "#opendiscord"
import { OTForms_Question } from "../types/configDefaults"
import { OTForms_FormSession } from "./FormSession"
import type { OTFormsCompletedTicketFormContext } from "../service/forms-service"

/* FORM CLASS
 * This is the main class of a form (every form message sent is a OTForms_Form). 
 * A single form on the config can have multiple OTForms_Form instances. It contains all the information of a form.
 * Creates and manages OTForms_FormSession.
 */
export class OTForms_Form {
    id: string;
    instanceId: string;
    message: discord.Message<boolean>;
    name: string;
    color: discord.ColorResolvable;
    questions: OTForms_Question[];
    answersChannel: discord.GuildTextBasedChannel;
    totalSections: number;
    private readonly ticketContext: OTFormsCompletedTicketFormContext | null;
    private activeSessions: Map<string, OTForms_FormSession>;
    private sessionCounter: number = 0;

    constructor(formId: string, instanceId: string, message: discord.Message<boolean>, name: string, color: discord.ColorResolvable, questions: OTForms_Question[], answersChannel: discord.GuildTextBasedChannel, ticketContext: OTFormsCompletedTicketFormContext | null = null) {
        this.id = formId;
        this.instanceId = instanceId;
        this.message = message;
        this.name = name;
        this.color = color;
        this.questions = questions;
        this.answersChannel = answersChannel;
        this.ticketContext = ticketContext;
        this.activeSessions = new Map<string, OTForms_FormSession>();

        // Calculate total sections
        this.totalSections = 0;
        let lastQuestionType: "short" | "paragraph" | "dropdown" | "button" | undefined;
        let typeTextCount = 1;
        questions.forEach((question) => {
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
        });
    }

    /* CREATE SESSION
     * Creates a new session for a user to answer the form.
     */
    public createSession(user: discord.User, message: discord.Message): OTForms_FormSession {
        if(!this.totalSections) throw new Error("Total sections not calculated");
        const sessionId = this.generateSessionId();

        const session = new OTForms_FormSession(sessionId, user, this);
        this.activeSessions.set(sessionId, session);
        return session;
    }

    /* FINALIZE SESSION
     * Removes a session from the active sessions.
     */
    public finalizeSession(sessionId: string, formName: string, user: discord.User): void {
        this.activeSessions.delete(sessionId);
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
        const channel = this.message.channel;
        const ticketChannelName = ("name" in channel && typeof channel.name === "string" && channel.name.length > 0)
            ? channel.name
            : this.ticketContext.ticketChannelName;
        return {
            ...this.ticketContext,
            ticketChannelName
        };
    }
}
