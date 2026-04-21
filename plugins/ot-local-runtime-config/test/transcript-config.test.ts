import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "fs"
import path from "path"

test("local runtime transcript sanitizer force-enables the transcript action and html compiler mode", () => {
    const sourcePath = path.resolve(process.cwd(), "plugins", "ot-local-runtime-config", "index.ts")
    const source = fs.readFileSync(sourcePath, "utf8")

    assert.match(source, /transcripts\.general\.enabled = true/)
    assert.match(source, /if \(!isSnowflake\(transcripts\.general\.channel\)\) transcripts\.general\.channel = ""/)
    assert.match(source, /transcripts\.general\.mode != "html"/)
    assert.match(source, /transcripts\.general\.mode = "html"/)
})

test("local runtime bridge sanitizer wires canonical staff guild separately from OT bridge roles", () => {
    const sourcePath = path.resolve(process.cwd(), "plugins", "ot-local-runtime-config", "index.ts")
    const source = fs.readFileSync(sourcePath, "utf8")

    assert.match(source, /EOTFS_OT_WHITELIST_CANONICAL_STAFF_GUILD_ID/)
    assert.match(source, /bridge\.canonicalStaffGuildId/)
    assert.match(source, /trimEnv\("STAFF_GUILD_ID"\)/)
})
