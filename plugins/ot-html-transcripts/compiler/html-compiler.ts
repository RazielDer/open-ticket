import { routeTranscriptReadyMessages, type TranscriptReadyMessagesLike } from "../routing/channel-delivery"
import { TRANSCRIPT_PLUGIN_SERVICE_ID } from "../contracts/constants"

function getRuntime() {
    return require("#opendiscord") as typeof import("#opendiscord")
}

export async function buildHtmlTranscriptReadyMessages(result: unknown): Promise<TranscriptReadyMessagesLike> {
    const { opendiscord } = getRuntime()
    const compileResult = result as any

    return {
        channelMessage: await opendiscord.builders.messages.getSafe("opendiscord:transcript-html-ready").build("channel", { guild: compileResult.channel.guild, channel: compileResult.channel, user: compileResult.user, ticket: compileResult.ticket, result: compileResult, compiler: opendiscord.transcripts.get("opendiscord:html-compiler") } as never),
        creatorDmMessage: await opendiscord.builders.messages.getSafe("opendiscord:transcript-html-ready").build("creator-dm", { guild: compileResult.channel.guild, channel: compileResult.channel, user: compileResult.user, ticket: compileResult.ticket, result: compileResult, compiler: opendiscord.transcripts.get("opendiscord:html-compiler") } as never),
        participantDmMessage: await opendiscord.builders.messages.getSafe("opendiscord:transcript-html-ready").build("participant-dm", { guild: compileResult.channel.guild, channel: compileResult.channel, user: compileResult.user, ticket: compileResult.ticket, result: compileResult, compiler: opendiscord.transcripts.get("opendiscord:html-compiler") } as never),
        activeAdminDmMessage: await opendiscord.builders.messages.getSafe("opendiscord:transcript-html-ready").build("active-admin-dm", { guild: compileResult.channel.guild, channel: compileResult.channel, user: compileResult.user, ticket: compileResult.ticket, result: compileResult, compiler: opendiscord.transcripts.get("opendiscord:html-compiler") } as never),
        everyAdminDmMessage: await opendiscord.builders.messages.getSafe("opendiscord:transcript-html-ready").build("every-admin-dm", { guild: compileResult.channel.guild, channel: compileResult.channel, user: compileResult.user, ticket: compileResult.ticket, result: compileResult, compiler: opendiscord.transcripts.get("opendiscord:html-compiler") } as never)
    }
}

export function createLocalHtmlTranscriptCompiler(
    dependencies: {
        createCompiler?: (definition: { init?: any; compile: any; ready: any }) => any
        compileHtmlTranscript?: (ticket: unknown, channel: unknown, user: unknown) => Promise<unknown>
        buildReadyMessages?: (result: unknown) => Promise<TranscriptReadyMessagesLike>
        routeReadyMessages?: (result: unknown, readyResult: TranscriptReadyMessagesLike) => Promise<TranscriptReadyMessagesLike>
    } = {}
) {
    const createCompiler = dependencies.createCompiler ?? ((definition: { init?: any; compile: any; ready: any }) => {
        const { api } = getRuntime()
        return new api.ODTranscriptCompiler<{ url: string; availableUntil: Date }, null>(
            "opendiscord:html-compiler",
            definition.init,
            definition.compile,
            definition.ready
        )
    })
    const compileHtmlTranscript = dependencies.compileHtmlTranscript ?? (async (ticket, channel, user) => {
        const { opendiscord } = getRuntime()
        const service = opendiscord.plugins.classes.get(TRANSCRIPT_PLUGIN_SERVICE_ID)
        return await service.compileHtmlTranscript(ticket as never, channel as never, user as never) as never
    })
    const buildReadyMessages = dependencies.buildReadyMessages ?? buildHtmlTranscriptReadyMessages
    const routeReadyMessages = dependencies.routeReadyMessages ?? routeTranscriptReadyMessages

    return createCompiler({
        init: undefined,
        compile: async (ticket, channel, user) => {
            return await compileHtmlTranscript(ticket, channel, user) as never
        },
        ready: async (result) => {
            const readyResult = await buildReadyMessages(result as never)
            return await routeReadyMessages(result as never, readyResult as never) as never
        }
    })
}

export function registerLocalHtmlTranscriptCompiler() {
    const { opendiscord } = getRuntime()

    opendiscord.events.get("afterTranscriptCompilersLoaded").listen((transcripts) => {
        transcripts.add(createLocalHtmlTranscriptCompiler(), true)
    })
}
