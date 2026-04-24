import {api, opendiscord, utilities} from "#opendiscord"
import * as discord from "discord.js"

/** ## OTForms_Form `interface`
 * This is the main structure of the form
 */
export interface OTForms_Form {
    id: string,
    name: string,
    description: string,
    color: discord.ColorResolvable,

    answerTarget: OTFormsAnswerTarget,
    responseChannel: string,
    autoSendOptionIds: string[],

    questions: OTForms_Question[]
}

export type OTFormsAnswerTarget = "response_channel" | "ticket_managed_record"
export type OTFormsDraftState = "initial" | "partial" | "completed"
export type OTFormsModalCapableQuestionType =
    "short" |
    "paragraph" |
    "string_select" |
    "user_select" |
    "role_select" |
    "channel_select" |
    "mentionable_select" |
    "file_upload"
export type OTFormsUnsupportedQuestionType = "radio_group" | "checkbox_group" | "checkbox"
export type OTFormsQuestionType = OTFormsModalCapableQuestionType | "dropdown" | "button"

export interface OTFormsTextAnswerData {
    kind: "text",
    value: string | null
}

export interface OTFormsStringSelectAnswerData {
    kind: "string_select",
    selected: {
        value: string,
        label: string
    }[]
}

export interface OTFormsEntitySelectAnswerData {
    kind: "user_select" | "role_select" | "channel_select" | "mentionable_select",
    selected: {
        id: string,
        label: string,
        entityKind: "user" | "role" | "channel"
    }[]
}

export interface OTFormsFileUploadAnswerData {
    kind: "file_upload",
    files: {
        attachmentId: string | null,
        name: string,
        url: string,
        contentType: string | null,
        size: number | null
    }[]
}

export type OTFormsAnswerData =
    OTFormsTextAnswerData |
    OTFormsStringSelectAnswerData |
    OTFormsEntitySelectAnswerData |
    OTFormsFileUploadAnswerData

export interface OTFormsCapturedAnswer {
    question: OTForms_Question,
    answer: string | null,
    answerData?: OTFormsAnswerData | null
}

/** ## OTForms_BaseQuestion `interface`
 * This is the main structure of a question
 */
export interface OTForms_BaseQuestion {
    position: number,
    question: string,
    type: OTFormsQuestionType,
}

/** ## OTForms_Question `interface`
 * This is the persisted/base question shape. Specific runtime question interfaces add config-only fields.
 */
export interface OTForms_Question extends OTForms_BaseQuestion {}

/** ## OTForms_DropdownQuestion `interface`
 * This is the structure of a question TYPE DROPDOWN
 */
export interface OTForms_DropdownQuestion extends OTForms_BaseQuestion {
    type: "dropdown",
    placeholder: string,
    minAnswerChoices: number,
    maxAnswerChoices: number,
    choices: OTForms_DropdownChoice[]
}

/** ## OTForms_ButtonQuestion `interface`
 * This is the structure of a question TYPE BUTTON
 */
export interface OTForms_ButtonQuestion extends OTForms_BaseQuestion {
    type: "button",
    choices: OTForms_ButtonChoice[]
}

/** ## OTForms_TextModalQuestion `interface`
 * This is the structure of a text question TYPE MODAL
 */
export interface OTForms_TextModalQuestion extends OTForms_BaseQuestion {
    type: "short" | "paragraph",
    placeholder?: string,
    optional?: boolean,
    maxLength?: number,
    value?: string,
}

export interface OTForms_StringSelectChoice {
    label: string,
    value: string,
    description?: string,
    emoji?: string,
    default?: boolean
}

export interface OTForms_StringSelectQuestion extends OTForms_BaseQuestion {
    type: "string_select",
    optional: boolean,
    placeholder: string,
    minAnswerChoices: number,
    maxAnswerChoices: number,
    choices: OTForms_StringSelectChoice[]
}

export interface OTForms_BaseEntitySelectQuestion extends OTForms_BaseQuestion {
    type: "user_select" | "role_select" | "channel_select" | "mentionable_select",
    optional: boolean,
    placeholder: string,
    minAnswerChoices: number,
    maxAnswerChoices: number
}

export interface OTForms_UserSelectQuestion extends OTForms_BaseEntitySelectQuestion {
    type: "user_select",
    defaultUsers?: string[]
}

export interface OTForms_RoleSelectQuestion extends OTForms_BaseEntitySelectQuestion {
    type: "role_select",
    defaultRoles?: string[]
}

export interface OTForms_ChannelSelectQuestion extends OTForms_BaseEntitySelectQuestion {
    type: "channel_select",
    channelTypes?: discord.ChannelType[],
    defaultChannels?: string[]
}

export interface OTForms_MentionableSelectQuestion extends OTForms_BaseEntitySelectQuestion {
    type: "mentionable_select",
    defaultUsers?: string[],
    defaultRoles?: string[]
}

export interface OTForms_FileUploadQuestion extends OTForms_BaseQuestion {
    type: "file_upload",
    optional: boolean,
    minFiles: number,
    maxFiles: number,
    allowExecutables: boolean,
    allowZipFiles: boolean,
    currentFileNames?: string[]
}

/** ## OTForms_ModalQuestion `type`
 * This is the modal-capable question union.
 */
export type OTForms_ModalQuestion =
    OTForms_TextModalQuestion |
    OTForms_StringSelectQuestion |
    OTForms_UserSelectQuestion |
    OTForms_RoleSelectQuestion |
    OTForms_ChannelSelectQuestion |
    OTForms_MentionableSelectQuestion |
    OTForms_FileUploadQuestion

/** ## OTForms_Choice `interface`
 * This is the structure of an answer choice for a question
 */
export interface OTForms_Choice {
    name: string,
    emoji: string
}

/** ## OTForms_ButtonChoice `interface`
 * This is the structure of an answer choice for a question TYPE BUTTON
 */
export interface OTForms_ButtonChoice extends OTForms_Choice {
    color: api.ODValidButtonColor
}

/** ## OTForms_DropdownChoice `interface`
 * This is the structure of an answer choice for a question TYPE DROPDOWN
 */
export interface OTForms_DropdownChoice extends OTForms_Choice {
    description: string
}

/** ## ODJsonConfig_DefaultForms `class`
 * This is the default structure of the forms config
 */
export class ODJsonConfig_DefaultForms extends api.ODJsonConfig {
    declare data: OTForms_Form[]
}
