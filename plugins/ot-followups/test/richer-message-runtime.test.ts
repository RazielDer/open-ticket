import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"

import {
    followUpHasNotificationTargets,
    followUpHasUnsafeRicherMedia,
    followUpMessageRequiresLegacyPayload
} from "../richer-message-runtime.js"

function buildMessage(overrides: Record<string, unknown> = {}) {
    return {
        id: "welcome",
        content: "Welcome to the ticket.",
        embed: {
            enabled: true,
            title: "Welcome",
            url: "",
            description: "Staff will be with you shortly.",
            customColor: "#2f3136",
            image: "",
            thumbnail: "",
            authorText: "",
            authorImage: "",
            footerText: "",
            footerImage: "",
            timestamp: false,
            fields: []
        },
        ping: {
            "@here": false,
            "@everyone": false,
            custom: []
        },
        ...overrides
    } as any
}

test("text-only followups can use the richer non-interactive layout", () => {
    const message = buildMessage()

    assert.equal(followUpHasNotificationTargets(message), false)
    assert.equal(followUpHasUnsafeRicherMedia(message), false)
    assert.equal(followUpMessageRequiresLegacyPayload(message), false)
})

test("notification-bearing followups stay on the legacy payload path", () => {
    assert.equal(followUpMessageRequiresLegacyPayload(buildMessage({
        ping: { "@here": true, "@everyone": false, custom: [] }
    })), true)
    assert.equal(followUpMessageRequiresLegacyPayload(buildMessage({
        ping: { "@here": false, "@everyone": true, custom: [] }
    })), true)
    assert.equal(followUpMessageRequiresLegacyPayload(buildMessage({
        ping: { "@here": false, "@everyone": false, custom: ["123456789012345678"] }
    })), true)
    assert.equal(followUpMessageRequiresLegacyPayload(buildMessage({
        content: "@everyone read this",
        ping: { "@here": false, "@everyone": false, custom: [] }
    })), true)
    assert.equal(followUpMessageRequiresLegacyPayload(buildMessage({
        content: "Staff ping: @here",
        ping: { "@here": false, "@everyone": false, custom: [] }
    })), true)
    assert.equal(followUpMessageRequiresLegacyPayload(buildMessage({
        content: "Role ping: <@&123456789012345678>",
        ping: { "@here": false, "@everyone": false, custom: [] }
    })), true)
})

test("media-bearing followups stay on the legacy payload path", () => {
    const mediaFields = ["image", "thumbnail", "authorImage", "footerImage"] as const

    for (const field of mediaFields) {
        const message = buildMessage({
            embed: {
                ...buildMessage().embed,
                [field]: "https://example.com/image.png"
            }
        })

        assert.equal(followUpHasUnsafeRicherMedia(message), true)
        assert.equal(followUpMessageRequiresLegacyPayload(message), true)
    }
})

test("SLICE-013B keeps followups presentation-only and reuses the shared richer helper", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..", "..")
    const source = fs.readFileSync(path.join(repoRoot, "plugins", "ot-followups", "index.ts"), "utf8")

    assert.match(source, /api\.applyRicherMessageSurface\(instance/)
    assert.match(source, /surfaceId:\s*"ot-followups:message"/)
    assert.doesNotMatch(source, /builders\.buttons|builders\.dropdowns|addComponent\(/)
})
