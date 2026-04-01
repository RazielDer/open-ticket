import {api, opendiscord, utilities} from "#opendiscord"
import * as discord from "discord.js"
if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

import { OTForms_Form } from "./classes/Form"
import { OTForms_AnswersManager } from "./classes/AnswersManager";
import {
    OTFormsService,
    OT_FORMS_PLUGIN_SERVICE_ID,
    resolveOriginalApplicantDiscordUserId,
    type OTFormsCompletedTicketFormContext
} from "./service/forms-service";
import type { OTForms_Form as OTFormsFormConfig } from "./types/configDefaults";

import "./config/configRegistration";
import "./builders/messageBuilders";
import "./builders/embedBuilders";
import "./builders/buttonBuilders";
import "./builders/modalBuilders";
import "./builders/dropdownBuilders";
import "./builders/commandBuilders";

const forms = new Map<string, OTForms_Form>();

function isGuildTextBasedChannel(
    channel: discord.Channel | null
): channel is discord.GuildTextBasedChannel {
    return !!channel && channel.isTextBased() && "guildId" in channel
}

function resolveTicketFormContext(ticket: api.ODTicket, channel: discord.GuildTextBasedChannel, applicantDiscordUserId: string | null): OTFormsCompletedTicketFormContext | null {
    if (!applicantDiscordUserId) return null
    return {
        ticketChannelId: channel.id,
        ticketChannelName: channel.name,
        ticketOptionId: ticket.option.id.value,
        applicantDiscordUserId
    }
}

async function resolveAnswerChannel(
    guild: discord.Guild,
    ticketChannel: discord.GuildTextBasedChannel,
    formConfig: OTFormsFormConfig
): Promise<discord.GuildTextBasedChannel | null> {
    if (formConfig.answerTarget == "ticket_managed_record") {
        return ticketChannel;
    }
    const answersChannel = await guild.channels.fetch(formConfig.responseChannel);
    if (!isGuildTextBasedChannel(answersChannel)) {
        opendiscord.log("Error: Invalid answers channel.", "plugin");
        return null;
    }
    return answersChannel;
}

function registerForm(
    formConfig: OTFormsFormConfig,
    channel: discord.GuildTextBasedChannel,
    answersChannel: discord.GuildTextBasedChannel | null,
    ticketContext: OTFormsCompletedTicketFormContext | null
): OTForms_Form {
    const questions = [...formConfig.questions].sort((a, b) => a.position - b.position);
    const form = new OTForms_Form(
        formConfig.id,
        channel.id,
        channel,
        formConfig.name,
        formConfig.color,
        questions,
        formConfig.answerTarget,
        answersChannel,
        ticketContext
    );
    forms.set(form.instanceId, form);
    return form;
}

async function restoreTicketForms(): Promise<void> {
    const formsConfig = opendiscord.configs.get("ot-ticket-forms:config").data;
    const service = opendiscord.plugins.classes.get(OT_FORMS_PLUGIN_SERVICE_ID) as OTFormsService;
    for (const ticket of opendiscord.tickets.getFiltered((entry) => !entry.get("opendiscord:closed").value)) {
        const matchingForms = formsConfig.filter((formConfig) => formConfig.autoSendOptionIds.includes(ticket.option.id.value));
        if (matchingForms.length < 1) continue;

        let channel: discord.GuildTextBasedChannel | null = null;
        try {
            const fetchedChannel = await opendiscord.client.client.channels.fetch(ticket.id.value);
            if (isGuildTextBasedChannel(fetchedChannel)) {
                channel = fetchedChannel;
            }
        } catch {
            channel = null;
        }
        if (!channel) continue;

        const applicantDiscordUserId = resolveOriginalApplicantDiscordUserId(
            ticket.get("opendiscord:opened-by").value,
            ticket.get("opendiscord:previous-creators").value
        );
        for (const formConfig of matchingForms) {
            const answersChannel = await resolveAnswerChannel(channel.guild, channel, formConfig);
            if (!answersChannel) continue;
            if (!forms.has(channel.id)) {
                registerForm(
                    formConfig,
                    channel,
                    answersChannel,
                    resolveTicketFormContext(ticket, channel, applicantDiscordUserId)
                );
            }
            await service.refreshTicketStartFormMessage(channel.id, formConfig.id);
        }
    }
}

async function rejectUnauthorizedMutation(
    instance: api.ODButtonResponderInstance | api.ODDropdownResponderInstance | api.ODModalResponderInstance,
    form: OTForms_Form
): Promise<boolean> {
    const rejectionMessage = form.getMutationBlockReason(instance.user.id);
    if (!rejectionMessage) return false;

    if (!instance.didReply && !instance.interaction.deferred && !instance.interaction.replied) {
        if (instance instanceof api.ODModalResponderInstance) {
            await instance.defer("reply", true);
            await instance.interaction.editReply({ content: rejectionMessage });
        } else {
            await instance.reply({
                id: new api.ODId("ot-ticket-forms:not-applicant"),
                ephemeral: true,
                message: {
                    content: rejectionMessage
                }
            });
        }
    }
    return true;
}

opendiscord.events.get("onPluginClassLoad").listen((classes) => {
    classes.add(new OTFormsService(OT_FORMS_PLUGIN_SERVICE_ID))
})

opendiscord.events.get("afterCodeExecuted").listen(async () => {
    const formsConfig = opendiscord.configs.get("ot-ticket-forms:config").data;
    for(const formConfig of formsConfig) {
        formConfig.questions.sort((a, b) => a.position - b.position);
    }
    opendiscord.log("Plugin \"ot-ticket-forms\" restoring answers...", "plugin");
    const service = opendiscord.plugins.classes.get(OT_FORMS_PLUGIN_SERVICE_ID) as OTFormsService;
    await service.restoreCompletedTicketForms();
    await service.restoreTicketDrafts();
    await OTForms_AnswersManager.restore();
    await restoreTicketForms();
})

/* TICKET CREATED EVENT
 * When a ticket is created, check if the ticket ID is in the list of forms that should be automatically sent.
 * If it is, send the form to the channel.
 */
opendiscord.events.get("afterTicketCreated").listen(async (ticket, creator, channel) => {
    const formsConfig = opendiscord.configs.get("ot-ticket-forms:config").data;
    const ticketId = ticket.option.id.value;
    const service = opendiscord.plugins.classes.get(OT_FORMS_PLUGIN_SERVICE_ID) as OTFormsService;

    for(const formConfig of formsConfig) {
        if (formConfig.autoSendOptionIds.includes(ticketId)) {
            const answersChannel = await resolveAnswerChannel(channel.guild, channel, formConfig);
            if(!answersChannel) return;

            registerForm(
                formConfig,
                channel,
                answersChannel,
                resolveTicketFormContext(
                    ticket,
                    channel,
                    resolveOriginalApplicantDiscordUserId(
                        creator.id,
                        ticket.get("opendiscord:previous-creators").value
                    )
                )
            );
            await service.refreshTicketStartFormMessage(channel.id, formConfig.id);
        }
    };
});

//REGISTER COMMAND RESPONDER
opendiscord.events.get("onCommandResponderLoad").listen((commands) => {
    const generalConfig = opendiscord.configs.get("opendiscord:general")
    const formsConfig = opendiscord.configs.get("ot-ticket-forms:config").data;

    /* FORM COMMAND RESPONDER
     * The command manage forms. Currently limited to sending forms to a channel.
     */
    commands.add(new api.ODCommandResponder("ot-ticket-forms:form",generalConfig.data.prefix,"form"))
    commands.get("ot-ticket-forms:form").workers.add([
        new api.ODWorker("ot-ticket-forms:form",0,async (instance,params,source,cancel) => {
            const {guild,channel,user} = instance
            if (!guild){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build("button",{channel,user}))
                return cancel()
            }

            if (!opendiscord.permissions.hasPermissions("admin",await opendiscord.permissions.getPermissions(instance.user,instance.channel,instance.guild))){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build(source,{guild:instance.guild,channel:instance.channel,user:instance.user,permissions:["admin"]}))
                return cancel()
            }

            //command doesn't support text-commands!
            if (source == "text") return cancel()
            const scope = instance.options.getSubCommand() as "send"

            if (scope == "send"){
                const formId = instance.options.getString("id",true)
                const formChannel = instance.options.getChannel("channel",true) as discord.GuildTextBasedChannel
                const service = opendiscord.plugins.classes.get(OT_FORMS_PLUGIN_SERVICE_ID) as OTFormsService
                
                const formConfig = formsConfig.find((form) => form.id == formId)
                if (!formConfig){
                    instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build(source,{guild,channel,user,layout:"simple",error:"Invalid form id. Please try again!"}))
                    return cancel()
                }

                const startMessageTemplate = await opendiscord.builders.messages.getSafe("ot-ticket-forms:start-form-message").build("ticket", {
                    formId: formConfig.id,
                    formInstanceId: formChannel.id,
                    formName: formConfig.name,
                    formDescription: formConfig.description,
                    formColor: formConfig.color,
                    acceptAnswers: true
                });
                const answersChannel = await resolveAnswerChannel(guild, formChannel, formConfig);
                if(!answersChannel) {
                    return;
                }

                const ticket = opendiscord.tickets.get(formChannel.id);
                const applicantDiscordUserId = ticket
                    ? resolveOriginalApplicantDiscordUserId(
                        ticket.get("opendiscord:opened-by").value,
                        ticket.get("opendiscord:previous-creators").value
                    )
                    : null;
                registerForm(
                    formConfig,
                    formChannel,
                    answersChannel,
                    ticket ? resolveTicketFormContext(ticket, formChannel, applicantDiscordUserId) : null
                );
                if (ticket) {
                    await service.refreshTicketStartFormMessage(formChannel.id, formConfig.id);
                } else {
                    await formChannel.send(startMessageTemplate.message);
                }
            }

            await instance.reply(await opendiscord.builders.messages.getSafe("ot-ticket-forms:success-message").build(source,{}))
        }),
        new api.ODWorker("ot-ticket-forms:logs",-1,(instance,params,source,cancel) => {
            const scope = instance.options.getSubCommand() as "send"
            opendiscord.log(instance.user.displayName+" used the 'form "+scope+"' command!","plugin",[
                {key:"user",value:instance.user.username},
                {key:"userid",value:instance.user.id,hidden:true},
                {key:"channelid",value:instance.channel.id,hidden:true},
                {key:"method",value:source}
            ])
        })
    ])
})

//REGISTER HELP MENU
opendiscord.events.get("onHelpMenuComponentLoad").listen((menu) => {
    menu.get("opendiscord:extra").add(new api.ODHelpMenuCommandComponent("ot-ticket-forms:form",0,{
        slashName:"form send",
        slashDescription:"Send a form to a channel.",
    }))
})

// BUTTON RESPONDER
opendiscord.events.get("onButtonResponderLoad").listen((buttons, responders, actions) => {
    /* START FORM BUTTON RESPONDER
     * The button to start answering a form.
     */
    buttons.add(new api.ODButtonResponder("ot-ticket-forms:start-form-button", /^ot-ticket-forms:sb_/));
    opendiscord.responders.buttons.get("ot-ticket-forms:start-form-button").workers.add(new api.ODWorker("ot-ticket-forms:start-form-button", 0, async (instance, params, source, cancel) => {
        const formInstanceId = instance.interaction.customId.split("_")[1];
        const form = forms.get(formInstanceId);
        if (!form) return
        if (await rejectUnauthorizedMutation(instance, form)) return cancel()

        const session = form.createSession(instance.interaction.user, instance.message);
        await session.setInstance(instance);
        await session.start();
    }));

    /* CONTINUE BUTTON RESPONDER
     * The button between two form questions. To continue to the next section of the form.
     */
    buttons.add(new api.ODButtonResponder("ot-ticket-forms:continue-button", /^ot-ticket-forms:cb_/));
    opendiscord.responders.buttons.get("ot-ticket-forms:continue-button").workers.add(new api.ODWorker("ot-ticket-forms:continue-button", 0, async (instance, params, source, cancel) => {
        const customIdParts = instance.interaction.customId.split("_");
        const formInstanceId = customIdParts[1];
        const form = forms.get(formInstanceId);
        if (!form) return

        const sessionId = customIdParts[2];

        const session = form.getSession(sessionId);
        if (!session) return
        if (await rejectUnauthorizedMutation(instance, form)) return cancel()

        await session.setInstance(instance);

        await session.continue("question");
    }));

    /* DELETE ANSWERS MESSAGE BUTTON RESPONDER
     * The button to delete a form session. Visible on the answers message until the form is completed.
     */
    buttons.add(new api.ODButtonResponder("ot-ticket-forms:delete-answers-button", /^ot-ticket-forms:db_/));
    opendiscord.responders.buttons.get("ot-ticket-forms:delete-answers-button").workers.add(new api.ODWorker("ot-ticket-forms:delete-answers-button", 0, async (instance, params, source, cancel) => {
        const customIdParts = instance.interaction.customId.split("_");
        const formInstanceId = customIdParts[1];
        const form = forms.get(formInstanceId);
        if (!form) return
        if (await rejectUnauthorizedMutation(instance, form)) return cancel()

        await instance.defer("update",true);
        OTForms_AnswersManager.removeInstance(instance.message.id);
        instance.message.delete();

        const sessionId = customIdParts[2];

        form.finalizeSession(sessionId, form.name, instance.user);
    }));

    /* QUESTION BUTTON RESPONDER
     * A type button question can have multiple question buttons. Every button represents a possible answer.
     */
    buttons.add(new api.ODButtonResponder("ot-ticket-forms:question-button", /^ot-ticket-forms:qb_/));
    opendiscord.responders.buttons.get("ot-ticket-forms:question-button").workers.add(new api.ODWorker("ot-ticket-forms:question-button", 0, async (instance, params, source, cancel) => {
        const customIdParts = instance.interaction.customId.split("_");
        const formInstanceId = customIdParts[1];
        const form = forms.get(formInstanceId);
        if (!form) return

        const sessionId = customIdParts[2];

        const session = form.getSession(sessionId);
        if (!session) return
        if (await rejectUnauthorizedMutation(instance, form)) return cancel()

        await session.setInstance(instance);

        const answer = customIdParts.slice(3).join("_");
        await session.handleButtonResponse(answer);
    }));

    // PAGINATION BUTTONS
    /* NEXT PAGE BUTTON RESPONDER
     * The button to go to the next page of the answers message.
     */
    buttons.add(new api.ODButtonResponder("ot-ticket-forms:next-page-button", /^ot-ticket-forms:npb_/));
    opendiscord.responders.buttons.get("ot-ticket-forms:next-page-button").workers.add(new api.ODWorker("ot-ticket-forms:next-page-button", 0, async (instance, params, source, cancel) => {
        instance.defer("update",true);
        const answersManager = OTForms_AnswersManager.getInstance(instance.message.id);
        if (!answersManager) return;

        const currentPageNumber = Number(instance.interaction.customId.split("_")[1]);

        answersManager.editMessage(currentPageNumber + 1);
    }));

    /* PREVIOUS PAGE BUTTON RESPONDER
     * The button to go to the previous page of the answers message.
     */
    buttons.add(new api.ODButtonResponder("ot-ticket-forms:previous-page-button", /^ot-ticket-forms:ppb_/));
    opendiscord.responders.buttons.get("ot-ticket-forms:previous-page-button").workers.add(new api.ODWorker("ot-ticket-forms:previous-page-button", 0, async (instance, params, source, cancel) => {
        instance.defer("update",true);
        const answersManager = OTForms_AnswersManager.getInstance(instance.message.id);
        if (!answersManager) return;

        const currentPageNumber = Number(instance.interaction.customId.split("_")[1]);

        answersManager.editMessage(currentPageNumber - 1);
    }));
});

// MODAL RESPONDER
opendiscord.events.get("onModalResponderLoad").listen((modals, responders, actions) => {
    /* QUESTIONS MODAL RESPONDER
     * This modal is used to answer questions of a form.
     */
    modals.add(new api.ODModalResponder("ot-ticket-forms:questions-modal", /^ot-ticket-forms:qm_/));
    opendiscord.responders.modals.get("ot-ticket-forms:questions-modal").workers.add(new api.ODWorker("ot-ticket-forms:questions-modal", 0, async (instance, params, source, cancel) => {
        const customIdParts = instance.interaction.customId.split("_");
        const formInstanceId = customIdParts[1];
        const form = forms.get(formInstanceId);
        if (!form) return

        const sessionId = customIdParts[2];
        const session = form.getSession(sessionId);
        if (!session) return
        if (await rejectUnauthorizedMutation(instance, form)) return cancel()

        const answeredQuestions: {number: number,required:boolean}[] = customIdParts[3].split('-').map(pair => {
            const [num, required] = pair.split('/');
            return {
                number: Number(num),
                required: required === '1'
            };
        });

        const response = instance.values;
        await session.setInstance(instance, true);

        await session.handleModalResponse(response, answeredQuestions);
    }));
})

opendiscord.events.get("onDropdownResponderLoad").listen((dropdowns, responders, actions) => {
    /* QUESTION DROPDOWN RESPONDER
     * This dropdown is used to answer questions of a form. It can be used for multiple choice questions.
     */
    dropdowns.add(new api.ODDropdownResponder("ot-ticket-forms:question-dropdown", /^ot-ticket-forms:qd_/));
    opendiscord.responders.dropdowns.get("ot-ticket-forms:question-dropdown").workers.add(new api.ODWorker("ot-ticket-forms:question-dropdown", 0, async (instance, params, source, cancel) => {
        const customIdParts = instance.interaction.customId.split("_");
        const formInstanceId = customIdParts[1];
        const form = forms.get(formInstanceId);
        if (!form) return

        const sessionId = customIdParts[2];
        const session = form.getSession(sessionId);
        if (!session) return
        if (await rejectUnauthorizedMutation(instance, form)) return cancel()

        const response = instance.values;
        await session.setInstance(instance);
        
        await session.handleDropdownResponse(response);
    }));
});
