import type {
    LocalAssetRef,
    LocalTranscriptFormAnswerData,
    LocalTranscriptFormAnswerFile,
    LocalTranscriptFormAnswerRecord,
    LocalTranscriptFormRecord
} from "../contracts/document"

export type TicketFormsDraftState = "initial" | "partial" | "completed"

export interface TicketFormsCapturedAnswerLike {
    question: {
        position: number
        question: string
    }
    answer: string | null
    answerData?: unknown
}

export interface TicketFormsCompletedAnswerLike {
    position: number
    question: string
    answer: string | null
    answerData?: unknown
}

export interface TicketFormsDraftSnapshotLike {
    ticketChannelId: string
    formId: string
    answerTarget: string
    draftState: TicketFormsDraftState
    updatedAt: string
    completedAt: string | null
    managedRecordMessageId: string | null
    applicantDiscordUserId: string
    answers: TicketFormsCapturedAnswerLike[]
}

export interface TicketFormsCompletedSnapshotLike {
    applicantDiscordUserId: string
    completedAt: string
    answers: TicketFormsCompletedAnswerLike[]
}

export interface TicketFormsServiceLike {
    listTicketDrafts(): Promise<TicketFormsDraftSnapshotLike[]>
    getCompletedTicketForm?(ticketChannelId: string, formId: string): Promise<TicketFormsCompletedSnapshotLike | null>
}

export function buildLocalTranscriptFormRecord(
    draft: TicketFormsDraftSnapshotLike,
    formName: string | false,
    completedSnapshot: TicketFormsCompletedSnapshotLike | null = null
): LocalTranscriptFormRecord | null {
    if (draft.answerTarget != "ticket_managed_record") return null

    const answers = completedSnapshot
        ? completedSnapshot.answers.map((answer) => buildLocalTranscriptFormAnswerRecord({
            position: answer.position,
            question: answer.question,
            answer: answer.answer,
            answerData: answer.answerData
        }))
        : draft.answers.map((answer) => buildLocalTranscriptFormAnswerRecord({
            position: answer.question.position,
            question: answer.question.question,
            answer: answer.answer,
            answerData: answer.answerData
        }))

    return {
        source: "ot-ticket-forms",
        formId: draft.formId,
        formName,
        applicantDiscordUserId: completedSnapshot?.applicantDiscordUserId ?? draft.applicantDiscordUserId,
        draftState: normalizeDraftState(draft.draftState),
        updatedAt: draft.updatedAt,
        completedAt: completedSnapshot?.completedAt ?? draft.completedAt ?? false,
        answers: answers.sort((left, right) => left.position - right.position)
    }
}

function buildLocalTranscriptFormAnswerRecord(answer: {
    position: number
    question: string
    answer: string | null
    answerData?: unknown
}): LocalTranscriptFormAnswerRecord {
    return {
        position: answer.position,
        question: answer.question,
        answer: normalizeString(answer.answer) ?? false,
        answerData: normalizeLocalTranscriptFormAnswerData(answer.answerData)
    }
}

export function normalizeLocalTranscriptFormAnswerData(answerData: unknown): LocalTranscriptFormAnswerData | null {
    if (!answerData || typeof answerData != "object" || Array.isArray(answerData)) return null
    const raw = answerData as Record<string, unknown>

    if (raw.kind == "text") {
        return {
            kind: "text",
            value: normalizeString(raw.value) ?? false
        }
    }

    if (raw.kind == "string_select") {
        return {
            kind: "string_select",
            selected: normalizeArray(raw.selected).map((entry) => ({
                value: normalizeString((entry as Record<string, unknown>).value) ?? "",
                label: normalizeString((entry as Record<string, unknown>).label) ?? ""
            }))
        }
    }

    if (
        raw.kind == "user_select"
        || raw.kind == "role_select"
        || raw.kind == "channel_select"
        || raw.kind == "mentionable_select"
    ) {
        const kind = raw.kind as "user_select" | "role_select" | "channel_select" | "mentionable_select"
        return {
            kind,
            selected: normalizeArray(raw.selected)
                .map((entry) => normalizeEntitySelection(entry))
                .filter((entry): entry is { id: string; label: string; entityKind: "user" | "role" | "channel" } => entry != null)
        }
    }

    if (raw.kind == "file_upload") {
        return {
            kind: "file_upload",
            files: normalizeArray(raw.files)
                .map((entry) => normalizeFileAnswer(entry))
                .filter((entry): entry is LocalTranscriptFormAnswerFile => entry != null)
        }
    }

    return null
}

export function getFormRecordSearchParts(record: LocalTranscriptFormRecord | null): string[] {
    if (!record) return []
    return [
        record.formId,
        record.formName || "",
        record.applicantDiscordUserId,
        ...record.answers.flatMap((answer) => [
            answer.question,
            answer.answer || "",
            ...getAnswerDataSearchParts(answer.answerData)
        ])
    ]
}

function normalizeEntitySelection(entry: unknown) {
    if (!entry || typeof entry != "object" || Array.isArray(entry)) return null
    const raw = entry as Record<string, unknown>
    const id = normalizeString(raw.id)
    const label = normalizeString(raw.label)
    const entityKind = raw.entityKind
    if (!id || !label) return null
    if (entityKind != "user" && entityKind != "role" && entityKind != "channel") return null
    return { id, label, entityKind }
}

function normalizeFileAnswer(entry: unknown): LocalTranscriptFormAnswerFile | null {
    if (!entry || typeof entry != "object" || Array.isArray(entry)) return null
    const raw = entry as Record<string, unknown>
    const name = normalizeString(raw.name)
    const url = normalizeString(raw.url)
    if (!name) return null

    const contentType = normalizeString(raw.contentType) ?? false
    const size = typeof raw.size == "number" && Number.isFinite(raw.size) ? raw.size : false
    const displayKind = detectAttachmentKind(contentType || "", name)

    return {
        name,
        url: url ?? "",
        contentType,
        size,
        displayKind,
        asset: url ? createOptionalAssetRef(url, "form-answer." + name, displayKind != "file") : null
    }
}

function normalizeDraftState(value: unknown): TicketFormsDraftState {
    if (value == "initial") return "initial"
    if (value == "completed") return "completed"
    return "partial"
}

function normalizeArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function normalizeString(value: unknown): string | null {
    if (typeof value != "string") return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
}

function getAnswerDataSearchParts(answerData: LocalTranscriptFormAnswerData | null): string[] {
    if (!answerData) return []
    switch (answerData.kind) {
        case "text":
            return [answerData.value || ""]
        case "string_select":
        case "user_select":
        case "role_select":
        case "channel_select":
        case "mentionable_select":
            return answerData.selected.flatMap((entry) => Object.values(entry).map((value) => String(value)))
        case "file_upload":
            return answerData.files.flatMap((file) => [file.name, file.contentType || "", file.url])
    }
}

function createAssetRef(sourceUrl: string, purpose: string, inlinePreferred: boolean): LocalAssetRef {
    return {
        sourceUrl,
        purpose,
        inlinePreferred,
        assetName: null,
        archivePath: null,
        mimeType: null,
        byteSize: 0,
        status: "skipped"
    }
}

function createOptionalAssetRef(sourceUrl: string | null | undefined, purpose: string, inlinePreferred: boolean) {
    if (!sourceUrl || sourceUrl.length == 0) return null
    return createAssetRef(sourceUrl, purpose, inlinePreferred)
}

function detectAttachmentKind(fileType: string, fileName: string) {
    const normalized = (fileType || fileName).toLowerCase()
    if (normalized.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(fileName)) return "image"
    if (normalized.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(fileName)) return "video"
    if (normalized.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(fileName)) return "audio"
    return "file"
}
