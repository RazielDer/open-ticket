import test from "node:test"
import assert from "node:assert/strict"

import {
    findUnresolvedBridgeAuthorizedRoleIds,
    parseBridgeAuthorizedRoleIds
} from "../service/bridge-role-config"

test("bridge role env parsing trims, drops blanks, and dedupes valid role ids", () => {
    const parsed = parseBridgeAuthorizedRoleIds(" 111111111111111111 , , 222222222222222222,111111111111111111 ")

    assert.deepEqual(parsed.roleIds, ["111111111111111111", "222222222222222222"])
    assert.deepEqual(parsed.invalidTokens, [])
})

test("bridge role env parsing reports malformed tokens and keeps valid snowflakes only", () => {
    const parsed = parseBridgeAuthorizedRoleIds("111111111111111111,not-a-role,333,222222222222222222")

    assert.deepEqual(parsed.roleIds, ["111111111111111111", "222222222222222222"])
    assert.deepEqual(parsed.invalidTokens, ["not-a-role", "333"])
})

test("unresolved bridge role classification reports configured ids that are missing from the OT guild", () => {
    const unresolved = findUnresolvedBridgeAuthorizedRoleIds(
        ["111111111111111111", "222222222222222222", "111111111111111111", "333333333333333333"],
        ["222222222222222222"]
    )

    assert.deepEqual(unresolved, ["111111111111111111", "333333333333333333"])
})
