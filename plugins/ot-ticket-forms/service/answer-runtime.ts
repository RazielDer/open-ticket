import * as discord from "discord.js"
import { ODSystemError } from "../../../src/core/api/modules/base"
import {
    getModalInputSupport,
    type ODModalInputKind
} from "../../../src/core/api/modules/builder"

import type {
    OTFormsAnswerData,
    OTFormsCapturedAnswer,
    OTForms_ButtonQuestion,
    OTForms_DropdownQuestion,
    OTFormsEntitySelectAnswerData,
    OTFormsFileUploadAnswerData,
    OTForms_FileUploadQuestion,
    OTFormsModalCapableQuestionType,
    OTForms_ModalQuestion,
    OTFormsUnsupportedQuestionType,
    OTForms_Question
} from "../types/configDefaults"

export const OT_FORMS_MODAL_CAPABLE_QUESTION_TYPES = [
    "short",
    "paragraph",
    "string_select",
    "user_select",
    "role_select",
    "channel_select",
    "mentionable_select",
    "file_upload"
] as const satisfies readonly OTFormsModalCapableQuestionType[]

export const OT_FORMS_UNSUPPORTED_QUESTION_TYPES = [
    "radio_group",
    "checkbox_group",
    "checkbox"
] as const satisfies readonly OTFormsUnsupportedQuestionType[]

export interface OTFormsModalResponseValueReader {
    getTextField(name: string, required: boolean): string | null
    getStringSelectValues(name: string, required: boolean): readonly string[] | null
    getSelectedUsers(name: string, required: boolean): { values(): IterableIterator<any> } | null
    getSelectedRoles(name: string, required: boolean): { values(): IterableIterator<any> } | null
    getSelectedChannels(name: string, required: boolean, channelTypes?: readonly discord.ChannelType[]): { values(): IterableIterator<any> } | null
    getSelectedMentionables(name: string, required: boolean): discord.ModalSelectedMentionables | null
    getUploadedFiles(name: string, required: boolean): { values(): IterableIterator<discord.Attachment> } | null
}

const OT_FORMS_EXECUTABLE_EXTENSIONS = [
    ".exe", ".bat", ".com", ".cmd", ".inf", ".ipa", ".osx", ".pif", ".wsh", ".vb", ".vbs", ".ws", ".msi", ".job",
    ".bash", ".app", ".action", ".bin", ".command", ".csh", ".workflow", ".dmg", ".pkg",
    ".run", ".apk", ".jar"
]

const OT_FORMS_COMPRESSED_EXTENSIONS = [
    ".zip", ".7z", ".rar", ".tar", ".apk", ".ipa", ".pak", ".tar.gz", ".iso", ".tgz", ".gz", ".gzip", ".tar.xy"
]

export function isOTFormsModalCapableQuestionType(value: unknown): value is OTFormsModalCapableQuestionType {
    return OT_FORMS_MODAL_CAPABLE_QUESTION_TYPES.includes(value as OTFormsModalCapableQuestionType)
}

export function isOTFormsUnsupportedQuestionType(value: unknown): value is OTFormsUnsupportedQuestionType {
    return OT_FORMS_UNSUPPORTED_QUESTION_TYPES.includes(value as OTFormsUnsupportedQuestionType)
}

export function isOTFormsModalCapableQuestion(question: OTForms_Question | { type?: unknown } | null | undefined): question is OTForms_ModalQuestion {
    return isOTFormsModalCapableQuestionType(question?.type)
}

export function isOTFormsLegacyPromptQuestion(question: OTForms_Question | { type?: unknown } | null | undefined): question is OTForms_DropdownQuestion | OTForms_ButtonQuestion {
    return question?.type == "dropdown" || question?.type == "button"
}

export function calculateOTFormsQuestionSections(questions: readonly OTForms_Question[]): {
    totalSections: number,
    sectionNumbersByQuestionIndex: number[]
} {
    let totalSections = 0
    let modalQuestionCount = 0
    const sectionNumbersByQuestionIndex: number[] = []

    questions.forEach((question, index) => {
        if (!isOTFormsModalCapableQuestion(question)) {
            totalSections++
            modalQuestionCount = 0
        } else if (modalQuestionCount == 0 || modalQuestionCount == 5) {
            totalSections++
            modalQuestionCount = 1
        } else {
            modalQuestionCount++
        }
        sectionNumbersByQuestionIndex[index] = totalSections
    })

    return {
        totalSections,
        sectionNumbersByQuestionIndex
    }
}

export function resolveOTFormsModalInputKind(questionType: OTFormsModalCapableQuestionType): ODModalInputKind {
    switch (questionType) {
        case "short":
        case "paragraph":
            return "text-input"
        case "string_select":
            return "string-select"
        case "user_select":
            return "user-select"
        case "role_select":
            return "role-select"
        case "channel_select":
            return "channel-select"
        case "mentionable_select":
            return "mentionable-select"
        case "file_upload":
            return "file-upload"
    }
}

export function assertOTFormsModalInputSupported(questionType: OTFormsModalCapableQuestionType): void {
    const kind = resolveOTFormsModalInputKind(questionType)
    const support = getModalInputSupport(kind)
    if (support.status != "stable") {
        throw new ODSystemError(`ot-ticket-forms: modal input kind "${kind}" is ${support.status}: ${support.reason ?? "No reason provided."}`)
    }
}

export function normalizeOTFormsDisplayString(value: string | null | undefined): string | null {
    if (typeof value != "string") return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
}

export function normalizeOTFormsDisplayAnswer(answerData: OTFormsAnswerData | null | undefined): string | null {
    if (!answerData) return null
    switch (answerData.kind) {
        case "text":
            return normalizeOTFormsDisplayString(answerData.value)
        case "string_select":
        case "user_select":
        case "role_select":
        case "channel_select":
        case "mentionable_select":
            return normalizeOTFormsDisplayString(answerData.selected.map((entry) => entry.label).join(", "))
        case "file_upload":
            return normalizeOTFormsDisplayString(answerData.files.map((entry) => entry.name).join(", "))
    }
}

export function cloneOTFormsAnswerData(answerData: OTFormsAnswerData | null | undefined): OTFormsAnswerData | null {
    if (!answerData) return null
    switch (answerData.kind) {
        case "text":
            return { kind: "text", value: answerData.value }
        case "string_select":
            return {
                kind: "string_select",
                selected: answerData.selected.map((entry) => ({ ...entry }))
            }
        case "user_select":
        case "role_select":
        case "channel_select":
        case "mentionable_select":
            return {
                kind: answerData.kind,
                selected: answerData.selected.map((entry) => ({ ...entry }))
            }
        case "file_upload":
            return {
                kind: "file_upload",
                files: answerData.files.map((entry) => ({ ...entry }))
            }
    }
}

export function cloneOTFormsQuestion(question: OTForms_Question): OTForms_Question {
    const cloned = { ...question } as any
    switch (question.type) {
        case "dropdown":
            cloned.choices = [...((question as any).choices ?? [])].map((choice) => ({ ...choice }))
            return cloned as OTForms_Question
        case "button":
            cloned.choices = [...((question as any).choices ?? [])].map((choice) => ({ ...choice }))
            return cloned as OTForms_Question
        case "string_select":
            cloned.choices = [...((question as any).choices ?? [])].map((choice) => ({ ...choice }))
            return cloned as OTForms_Question
        case "channel_select":
            cloned.channelTypes = (question as any).channelTypes ? [...(question as any).channelTypes] : undefined
            cloned.defaultChannels = (question as any).defaultChannels ? [...(question as any).defaultChannels] : undefined
            return cloned as OTForms_Question
        case "user_select":
            cloned.defaultUsers = (question as any).defaultUsers ? [...(question as any).defaultUsers] : undefined
            return cloned as OTForms_Question
        case "role_select":
            cloned.defaultRoles = (question as any).defaultRoles ? [...(question as any).defaultRoles] : undefined
            return cloned as OTForms_Question
        case "mentionable_select":
            cloned.defaultUsers = (question as any).defaultUsers ? [...(question as any).defaultUsers] : undefined
            cloned.defaultRoles = (question as any).defaultRoles ? [...(question as any).defaultRoles] : undefined
            return cloned as OTForms_Question
        case "file_upload":
            cloned.currentFileNames = (question as any).currentFileNames ? [...(question as any).currentFileNames] : undefined
            return cloned as OTForms_Question
        default:
            return cloned as OTForms_Question
    }
}

export function cloneOTFormsCapturedAnswer(entry: OTFormsCapturedAnswer): OTFormsCapturedAnswer {
    return {
        question: cloneOTFormsQuestion(entry.question),
        answer: entry.answer,
        answerData: cloneOTFormsAnswerData(entry.answerData)
    }
}

export function cloneOTFormsCapturedAnswers(answers: readonly OTFormsCapturedAnswer[]): OTFormsCapturedAnswer[] {
    return answers.map(cloneOTFormsCapturedAnswer)
}

export function isOTFormsExecutableFileName(name: string): boolean {
    const normalized = name.trim().toLowerCase()
    return OT_FORMS_EXECUTABLE_EXTENSIONS.some((extension) => normalized.endsWith(extension))
}

export function isOTFormsCompressedFileName(name: string): boolean {
    const normalized = name.trim().toLowerCase()
    return OT_FORMS_COMPRESSED_EXTENSIONS.some((extension) => normalized.endsWith(extension))
}

export function validateOTFormsUploadedFiles(question: OTForms_FileUploadQuestion, files: readonly discord.Attachment[]): void {
    const minFiles = question.optional ? 0 : question.minFiles
    if (files.length < minFiles || files.length > question.maxFiles) {
        throw new ODSystemError(`ot-ticket-forms: file upload question ${question.position} received ${files.length} file(s), expected ${minFiles}-${question.maxFiles}.`)
    }

    for (const file of files) {
        if (!question.allowExecutables && isOTFormsExecutableFileName(file.name)) {
            throw new ODSystemError(`ot-ticket-forms: executable uploads are disabled for question ${question.position}.`)
        }
        if (!question.allowZipFiles && isOTFormsCompressedFileName(file.name)) {
            throw new ODSystemError(`ot-ticket-forms: compressed uploads are disabled for question ${question.position}.`)
        }
    }
}

export function createOTFormsTextAnswerData(value: string | null): OTFormsAnswerData {
    return {
        kind: "text",
        value: normalizeOTFormsDisplayString(value)
    }
}

export function createOTFormsStringSelectAnswerData(
    question: Extract<OTForms_ModalQuestion, { type: "string_select" }>,
    selectedValues: readonly string[]
): OTFormsAnswerData {
    const choicesByValue = new Map(question.choices.map((choice) => [choice.value, choice]))
    return {
        kind: "string_select",
        selected: selectedValues.map((value) => {
            const choice = choicesByValue.get(value)
            return {
                value,
                label: choice?.label ?? value
            }
        })
    }
}

function entitySelection(kind: OTFormsEntitySelectAnswerData["kind"], id: string, label: string, entityKind: "user" | "role" | "channel") {
    return {
        id,
        label: normalizeOTFormsDisplayString(label) ?? id,
        entityKind
    }
}

function collectionValues<T>(collection: { values(): IterableIterator<T | null> } | null | undefined): NonNullable<T>[] {
    if (!collection) return []
    return [...collection.values()].filter((value): value is NonNullable<T> => value != null)
}

function userLabel(user: { id: string, displayName?: string | null, globalName?: string | null, username?: string | null, tag?: string | null }): string {
    return user.displayName ?? user.globalName ?? user.username ?? user.tag ?? user.id
}

function roleLabel(role: { id: string, name?: string | null }): string {
    return role.name ?? role.id
}

function channelLabel(channel: { id: string, name?: string | null }): string {
    return channel.name ?? channel.id
}

export function createOTFormsUserSelectAnswerData(users: { values(): IterableIterator<any> } | null | undefined): OTFormsAnswerData {
    return {
        kind: "user_select",
        selected: collectionValues(users).map((user) => entitySelection("user_select", user.id, userLabel(user), "user"))
    }
}

export function createOTFormsRoleSelectAnswerData(roles: { values(): IterableIterator<any> } | null | undefined): OTFormsAnswerData {
    return {
        kind: "role_select",
        selected: collectionValues(roles).map((role) => entitySelection("role_select", role.id, roleLabel(role), "role"))
    }
}

export function createOTFormsChannelSelectAnswerData(channels: { values(): IterableIterator<any> } | null | undefined): OTFormsAnswerData {
    return {
        kind: "channel_select",
        selected: collectionValues(channels).map((channel) => entitySelection("channel_select", channel.id, channelLabel(channel), "channel"))
    }
}

export function createOTFormsMentionableSelectAnswerData(mentionables: discord.ModalSelectedMentionables | null | undefined): OTFormsAnswerData {
    const seen = new Set<string>()
    const selected: OTFormsEntitySelectAnswerData["selected"] = []

    for (const user of collectionValues(mentionables?.users)) {
        if (seen.has(`user:${user.id}`)) continue
        seen.add(`user:${user.id}`)
        selected.push(entitySelection("mentionable_select", user.id, userLabel(user), "user"))
    }
    for (const role of collectionValues(mentionables?.roles)) {
        if (seen.has(`role:${role.id}`)) continue
        seen.add(`role:${role.id}`)
        selected.push(entitySelection("mentionable_select", role.id, roleLabel(role), "role"))
    }

    return {
        kind: "mentionable_select",
        selected
    }
}

export function createOTFormsFileUploadAnswerData(question: OTForms_FileUploadQuestion, files: { values(): IterableIterator<discord.Attachment> } | null | undefined): OTFormsFileUploadAnswerData {
    const attachments = collectionValues(files)
    validateOTFormsUploadedFiles(question, attachments)
    return {
        kind: "file_upload",
        files: attachments.map((file) => ({
            attachmentId: file.id ?? null,
            name: file.name,
            url: file.url,
            contentType: file.contentType ?? null,
            size: typeof file.size == "number" ? file.size : null
        }))
    }
}

export function captureOTFormsModalQuestionAnswer(
    question: OTForms_ModalQuestion,
    response: OTFormsModalResponseValueReader
): OTFormsCapturedAnswer {
    assertOTFormsModalInputSupported(question.type)
    const customId = String(question.position)
    const required = !question.optional
    const answerData = (() => {
        switch (question.type) {
            case "short":
            case "paragraph":
                return createOTFormsTextAnswerData(response.getTextField(customId, required))
            case "string_select":
                return createOTFormsStringSelectAnswerData(
                    question,
                    response.getStringSelectValues(customId, required) ?? []
                )
            case "user_select":
                return createOTFormsUserSelectAnswerData(response.getSelectedUsers(customId, required))
            case "role_select":
                return createOTFormsRoleSelectAnswerData(response.getSelectedRoles(customId, required))
            case "channel_select":
                return createOTFormsChannelSelectAnswerData(
                    response.getSelectedChannels(customId, required, question.channelTypes)
                )
            case "mentionable_select":
                return createOTFormsMentionableSelectAnswerData(response.getSelectedMentionables(customId, required))
            case "file_upload":
                return createOTFormsFileUploadAnswerData(question, response.getUploadedFiles(customId, required))
        }
    })()

    return {
        question: cloneOTFormsQuestion(question),
        answer: normalizeOTFormsDisplayAnswer(answerData),
        answerData
    }
}
