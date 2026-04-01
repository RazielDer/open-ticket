import {api, opendiscord, utilities} from "#opendiscord"
import * as discord from "discord.js"
import {
    OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL,
    OT_FORMS_START_FORM_BUTTON_LABEL,
    OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL
} from "../service/start-form-runtime"

// EMBEDS
opendiscord.events.get("onEmbedBuilderLoad").listen((embeds) => {
    /* START FORM EMBED
     * The embed that shows the initial form message with the applicant start button.
     */
    embeds.add(new api.ODEmbed("ot-ticket-forms:start-form-embed"));
    embeds.get("ot-ticket-forms:start-form-embed").workers.add(
        new api.ODWorker("ot-ticket-forms:start-form-embed", 0, async (instance, params, source, cancel) => {
            const { formName, formDescription, formColor } = params;
            instance.setTitle(formName);
            instance.setDescription(formDescription);
            instance.setColor(formColor);
        })
    );

    /* CONTINUE EMBED
     * The embed that shows the continue button for a form.
     */
    embeds.add(new api.ODEmbed("ot-ticket-forms:continue-embed"));
    embeds.get("ot-ticket-forms:continue-embed").workers.add(
        new api.ODWorker("ot-ticket-forms:continue-embed", 0, async (instance, params, source, cancel) => {
            const { currentSection, totalSections, formColor, displayMode } = params;
            instance.setColor(formColor);

            if(currentSection <= totalSections) { // Initial or partial answers
                instance.setTitle(`Section ${currentSection-1}/${totalSections} answered!`);
                instance.setDescription(
                    displayMode == "passive_confirmation"
                        ? "Progress saved."
                        : "Continue the application when you're ready."
                );

            } else { // All questions answered
                instance.setTitle(`Form completed!`);
                instance.setDescription(
                    displayMode == "passive_confirmation"
                        ? "Your application has been saved in this ticket."
                        : "You have answered all the questions."
                );
            }
        })
    );

    /* QUESTION EMBED
     * The embed that shows a question of a form and offers you the answers.
     */
    embeds.add(new api.ODEmbed("ot-ticket-forms:question-embed"));
    embeds.get("ot-ticket-forms:question-embed").workers.add(
        new api.ODWorker("ot-ticket-forms:question-embed", 0, async (instance, params, source, cancel) => {
            const { question, currentSection, totalSections, formColor, savedAnswer, displayMode } = params;
            instance.setColor(formColor);

            if (displayMode == "passive_confirmation") {
                if (currentSection <= totalSections) {
                    instance.setTitle(`Section ${currentSection-1}/${totalSections} answered!`);
                    instance.setDescription("Progress saved.");
                } else {
                    instance.setTitle("Form completed!");
                    instance.setDescription("Your application has been saved in this ticket.");
                }
                return;
            }

            instance.setTitle(`Question ${question.position}`);
            instance.setDescription(question.question);
            instance.setFooter(`Section ${currentSection}/${totalSections}`);
            if (typeof savedAnswer == "string" && savedAnswer.trim().length > 0) {
                instance.addFields({
                    name: "Current saved answer",
                    value: `\`\`\`${savedAnswer.trim()}\`\`\``,
                    inline: false
                });
            }
        })
    );

    /* ANSWERS EMBED
     * The embed that shows the answers of a form for a user.
     */
    embeds.add(new api.ODEmbed("ot-ticket-forms:answers-embed"));
    embeds.get("ot-ticket-forms:answers-embed").workers.add(
        new api.ODWorker("ot-ticket-forms:answers-embed", 0, async (instance, params, source, cancel) => {
            const { type, user, formColor, fields, timestamp } = params;

            instance.setTitle(`Form Answers`);   
            instance.setAuthor(`${user.displayName} (ID: ${user.id})`, user.displayAvatarURL());
            instance.setTimestamp(timestamp);
            
            if ( type === "completed") {
                instance.setColor(formColor);
                instance.setDescription(`<@${user.id}>\nApplication submitted. Use the ${OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL} button while staff review remains editable.`);
            } else {
                instance.setColor(formColor);
                instance.setDescription(`<@${user.id}>\nDraft saved. Use the ${OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL} button in this ticket to resume.`);
            }

            instance.addFields(...fields);
        })
    );
});
