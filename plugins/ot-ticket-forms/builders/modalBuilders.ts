import {api, opendiscord, utilities} from "#opendiscord"
import * as discord from "discord.js"
import type { OTForms_ModalQuestion } from "../types/configDefaults"
import {
    assertOTFormsModalInputSupported,
    resolveOTFormsModalInputKind
} from "../service/answer-runtime"

function isTextOnlyModalQuestion(question: OTForms_ModalQuestion): question is Extract<OTForms_ModalQuestion, { type: "short" | "paragraph" }> {
    return question.type == "short" || question.type == "paragraph"
}

function addLegacyTextQuestion(instance: api.ODModalInstance, question: Extract<OTForms_ModalQuestion, { type: "short" | "paragraph" }>): void {
    instance.addQuestion({
        customId: `${question.position}`,
        label: question.question,
        style: question.type,
        required: !question.optional,
        placeholder: question.placeholder ? question.placeholder : undefined,
        maxLength: question.maxLength ?? 1023,
        value: question.value ?? undefined
    })
}

function selectionMinValues(question: Extract<OTForms_ModalQuestion, { minAnswerChoices: number; optional: boolean }>): number {
    return question.optional ? 0 : question.minAnswerChoices
}

function addComponentQuestion(instance: api.ODModalInstance, question: OTForms_ModalQuestion): void {
    assertOTFormsModalInputSupported(question.type)
    const customId = `${question.position}`
    const baseLabel = {
        type: "label" as const,
        label: question.question
    }

    switch (question.type) {
        case "short":
        case "paragraph":
            instance.addLabelComponent({
                ...baseLabel,
                component: {
                    kind: "text-input",
                    customId,
                    style: question.type,
                    required: !question.optional,
                    placeholder: question.placeholder ? question.placeholder : undefined,
                    maxLength: question.maxLength ?? 1023,
                    value: question.value ?? undefined
                }
            })
            return
        case "string_select":
            instance.addLabelComponent({
                ...baseLabel,
                component: {
                    kind: "string-select",
                    customId,
                    required: !question.optional,
                    minValues: selectionMinValues(question),
                    maxValues: question.maxAnswerChoices,
                    placeholder: question.placeholder ? question.placeholder : undefined,
                    options: question.choices.map((choice) => ({
                        label: choice.label,
                        value: choice.value,
                        description: choice.description,
                        emoji: choice.emoji,
                        default: choice.default
                    }))
                }
            })
            return
        case "user_select":
            instance.addLabelComponent({
                ...baseLabel,
                component: {
                    kind: "user-select",
                    customId,
                    required: !question.optional,
                    minValues: selectionMinValues(question),
                    maxValues: question.maxAnswerChoices,
                    placeholder: question.placeholder ? question.placeholder : undefined,
                    defaultUsers: question.defaultUsers
                }
            })
            return
        case "role_select":
            instance.addLabelComponent({
                ...baseLabel,
                component: {
                    kind: "role-select",
                    customId,
                    required: !question.optional,
                    minValues: selectionMinValues(question),
                    maxValues: question.maxAnswerChoices,
                    placeholder: question.placeholder ? question.placeholder : undefined,
                    defaultRoles: question.defaultRoles
                }
            })
            return
        case "channel_select":
            instance.addLabelComponent({
                ...baseLabel,
                component: {
                    kind: "channel-select",
                    customId,
                    required: !question.optional,
                    minValues: selectionMinValues(question),
                    maxValues: question.maxAnswerChoices,
                    placeholder: question.placeholder ? question.placeholder : undefined,
                    channelTypes: question.channelTypes,
                    defaultChannels: question.defaultChannels
                }
            })
            return
        case "mentionable_select":
            instance.addLabelComponent({
                ...baseLabel,
                component: {
                    kind: "mentionable-select",
                    customId,
                    required: !question.optional,
                    minValues: selectionMinValues(question),
                    maxValues: question.maxAnswerChoices,
                    placeholder: question.placeholder ? question.placeholder : undefined,
                    defaultUsers: question.defaultUsers,
                    defaultRoles: question.defaultRoles
                }
            })
            return
        case "file_upload":
            instance.addLabelComponent({
                ...baseLabel,
                description: question.currentFileNames && question.currentFileNames.length > 0
                    ? `Current file(s): ${question.currentFileNames.join(", ")}`
                    : undefined,
                component: {
                    kind: "file-upload",
                    customId,
                    required: !question.optional,
                    minFiles: question.optional ? 0 : question.minFiles,
                    maxFiles: question.maxFiles,
                    attachmentPolicy: "local-discord-attachment"
                }
            })
            return
    }
}

// MODALS
opendiscord.events.get("onModalBuilderLoad").listen((modals) => {
    modals.add(new api.ODModal("ot-ticket-forms:questions-modal"))
    modals.get("ot-ticket-forms:questions-modal").workers.add(
        new api.ODWorker("ot-ticket-forms:questions-modal",0,async (instance,params,source) => {
            const { formInstanceId, sessionId, formName, questions, currentSection, totalSections } = params;

            const questionsId = questions.map((q) => `${q.position}/${q.optional ? 0 : 1}`).join('-');

            instance.setCustomId(`ot-ticket-forms:qm_${formInstanceId}_${sessionId}_${questionsId}`); 
            instance.setTitle(`${formName} - ${currentSection}/${totalSections}`);
            const componentMode = questions.some((question: OTForms_ModalQuestion) => !isTextOnlyModalQuestion(question))
            for (const question of questions as OTForms_ModalQuestion[]) {
                assertOTFormsModalInputSupported(question.type)
                void resolveOTFormsModalInputKind(question.type)
                if (!componentMode && isTextOnlyModalQuestion(question)) addLegacyTextQuestion(instance, question)
                else addComponentQuestion(instance, question)
            }
        })
    )
});
