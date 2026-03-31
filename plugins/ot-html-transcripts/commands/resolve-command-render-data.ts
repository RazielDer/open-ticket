import type { TranscriptAdminAction, TranscriptCommandRenderData } from "../contracts/types"

export interface TranscriptCommandServiceAccess {
    isHealthy(): boolean
    resolveAdminTarget(target: string): Promise<TranscriptCommandRenderData["transcript"]>
    buildPublicTranscriptUrl(slug: string): string
    revokeTranscript(target: string, reason?: string): Promise<{ ok: boolean; target: string; status: TranscriptCommandRenderData["status"]; message: string; reason?: string }>
    reissueTranscript(target: string, reason?: string): Promise<{ ok: boolean; target: string; status: TranscriptCommandRenderData["status"]; message: string; reason?: string }>
    deleteTranscript(target: string, reason?: string): Promise<{ ok: boolean; target: string; status: TranscriptCommandRenderData["status"]; message: string; reason?: string }>
}

export async function resolveCommandRenderData(
    service: TranscriptCommandServiceAccess | null,
    action: TranscriptAdminAction,
    target: string,
    reason: string | null
): Promise<TranscriptCommandRenderData> {
    if (!service || !service.isHealthy()) {
        return {
            action,
            target,
            ok: false,
            status: "not-ready",
            message: "The local transcript service is not healthy.",
            reason
        }
    }

    if (action == "get") {
        const transcript = await service.resolveAdminTarget(target)
        if (!transcript) {
            return {
                action,
                target,
                ok: false,
                status: "error",
                message: "Transcript not found.",
                reason
            }
        }

        return {
            action,
            target,
            ok: true,
            status: "ok",
            message: "Transcript resolved.",
            reason,
            transcript,
            url: transcript.activeSlug ? service.buildPublicTranscriptUrl(transcript.activeSlug) : null
        }
    }

    const result = action == "revoke"
        ? await service.revokeTranscript(target, reason ?? undefined)
        : action == "reissue"
            ? await service.reissueTranscript(target, reason ?? undefined)
            : await service.deleteTranscript(target, reason ?? undefined)

    const resolvedTarget = result.ok ? result.target : target
    const transcript = await service.resolveAdminTarget(resolvedTarget)

    return {
        action,
        target: resolvedTarget,
        ok: result.ok,
        status: result.status,
        message: result.message,
        reason: result.reason ?? reason,
        transcript,
        url: transcript?.activeSlug ? service.buildPublicTranscriptUrl(transcript.activeSlug) : null
    }
}
