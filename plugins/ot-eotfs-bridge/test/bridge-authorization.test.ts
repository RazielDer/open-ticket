import test from "node:test"
import assert from "node:assert/strict"

import { isBridgeActorAuthorized } from "../bridge-core"

test("ot admin participants remain authorized when no bridge roles are configured", () => {
    assert.equal(isBridgeActorAuthorized(true, [], []), true)
})

test("configured bridge-authorized roles allow non-admin OT guild members", () => {
    assert.equal(
        isBridgeActorAuthorized(false, ["111111111111111111", "222222222222222222"], ["222222222222222222"]),
        true
    )
})

test("actors without OT admin participation or a configured bridge role stay denied", () => {
    assert.equal(
        isBridgeActorAuthorized(false, ["111111111111111111"], ["222222222222222222"]),
        false
    )
})

test("modal submit authorization re-check denies once the configured role is removed", () => {
    const authorizedAtOpen = isBridgeActorAuthorized(
        false,
        ["222222222222222222"],
        ["222222222222222222"]
    )
    const deniedAtSubmit = isBridgeActorAuthorized(
        false,
        [],
        ["222222222222222222"]
    )

    assert.equal(authorizedAtOpen, true)
    assert.equal(deniedAtSubmit, false)
})
