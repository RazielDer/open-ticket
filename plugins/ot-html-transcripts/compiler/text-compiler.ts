import { routeTranscriptReadyMessages, type TranscriptReadyMessagesLike } from "../routing/channel-delivery"

function getRuntime() {
    return require("#opendiscord") as typeof import("#opendiscord")
}

export function createWrappedTextTranscriptCompiler(
    originalCompiler: {
        init: any
        compile: any
        ready: any
    },
    dependencies: {
        createCompiler?: (definition: { init?: any; compile: any; ready: any }) => any
        routeReadyMessages?: (result: unknown, readyResult: TranscriptReadyMessagesLike) => Promise<TranscriptReadyMessagesLike>
    } = {}
) {
    if (!originalCompiler.compile || !originalCompiler.ready) {
        return null
    }

    const createCompiler = dependencies.createCompiler ?? ((definition: { init?: any; compile: any; ready: any }) => {
        const { api } = getRuntime()
        return new api.ODTranscriptCompiler<{ contents: string }, null>(
            "opendiscord:text-compiler",
            definition.init,
            definition.compile,
            definition.ready
        )
    })
    const routeReadyMessages = dependencies.routeReadyMessages ?? routeTranscriptReadyMessages

    return createCompiler({
        init: originalCompiler.init
            ? async (ticket: unknown, channel: unknown, user: unknown) => {
                return await originalCompiler.init(ticket, channel, user) as never
            }
            : undefined,
        compile: async (ticket, channel, user, initData) => {
            return await originalCompiler.compile(ticket, channel, user, initData) as never
        },
        ready: async (result) => {
            const readyResult = await originalCompiler.ready(result as never)
            return await routeReadyMessages(result as never, readyResult as never) as never
        }
    })
}

export function registerWrappedTextTranscriptCompiler() {
    const { opendiscord } = getRuntime()

    opendiscord.events.get("afterTranscriptCompilersLoaded").listen((transcripts) => {
        const originalCompiler = transcripts.get("opendiscord:text-compiler")
        if (!originalCompiler) {
            return
        }

        const wrappedCompiler = createWrappedTextTranscriptCompiler(originalCompiler as never)
        if (!wrappedCompiler) {
            return
        }

        transcripts.add(wrappedCompiler, true)
    })
}
