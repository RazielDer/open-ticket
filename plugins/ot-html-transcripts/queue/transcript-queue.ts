export class TranscriptQueue {
    #active = 0
    #maxActive = 1
    #pending: Array<() => void> = []

    configure(maxActive: number) {
        this.#maxActive = Math.max(1, Math.floor(maxActive))
    }

    getDepth() {
        return this.#pending.length
    }

    getActiveCount() {
        return this.#active
    }

    async run<T>(task: () => Promise<T>): Promise<T> {
        await this.#acquire()

        try {
            return await task()
        } finally {
            this.#release()
        }
    }

    async #acquire() {
        if (this.#active < this.#maxActive) {
            this.#active++
            return
        }

        await new Promise<void>((resolve) => {
            this.#pending.push(() => {
                this.#active++
                resolve()
            })
        })
    }

    #release() {
        this.#active = Math.max(0, this.#active - 1)
        const next = this.#pending.shift()
        if (next) next()
    }
}
