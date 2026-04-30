import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import {
    BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT
} from "../bridge-core"
import {
    evaluateCreateTicketDecision,
    findMisconfiguredEligibleOptionIds
} from "../bridge-runtime"

test("bridge config keeps the locked whitelist application form contract mapping", () => {
    const configPath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-eotfs-bridge", "config.json")
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        formId: string
        targetGroupKey: string
        authorizedRoleIds: string[]
        canonicalStaffGuildId: string | null
        formContract: {
            discordUsernamePosition: number
            alderonIdsPosition: number
            rulesPasswordPosition: number
            requiredAcknowledgementPositions: number[]
        }
    }

    assert.equal(config.formId, "whitelist-review-form")
    assert.equal(config.targetGroupKey, "community_mirror")
    assert.deepEqual(config.authorizedRoleIds, [])
    assert.equal(config.canonicalStaffGuildId, "1433418426029834305")
    assert.deepEqual(config.formContract, {
        discordUsernamePosition: 1,
        alderonIdsPosition: 2,
        rulesPasswordPosition: 19,
        requiredAcknowledgementPositions: [5, 6, 7, 8, 9, 17, 18]
    })
})

test("bridge loads after ot-ticket-forms so the applicant card can stay above the staff control card", () => {
    const bridgePluginPath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-eotfs-bridge", "plugin.json")
    const formsPluginPath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-ticket-forms", "plugin.json")
    const bridgePlugin = JSON.parse(fs.readFileSync(bridgePluginPath, "utf8")) as { priority: number }
    const formsPlugin = JSON.parse(fs.readFileSync(formsPluginPath, "utf8")) as { priority: number }

    assert.equal(bridgePlugin.priority < formsPlugin.priority, true)
})

test("bridge presentation source keeps the applicant card as the bottom application block and renders the review card last", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-eotfs-bridge", "index.ts")
    const source = fs.readFileSync(sourcePath, "utf8")
    const followupSourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-followups", "index.ts")
    const followupSource = fs.readFileSync(followupSourcePath, "utf8")

    assert.equal(source.includes("findApplicantStartFormMessage(channel, channel.id)"), true)
    assert.equal(source.includes("shouldRecreateBridgeControlForPlacement("), true)
    assert.equal(source.includes("await formsService.refreshTicketStartFormMessage(channel.id, config.formId, {"), true)
    assert.equal(source.includes("await formsService.hideSubmittedTicketFormMessage(channel.id, config.formId)"), true)
    assert.equal(source.includes("await formsService.syncSubmittedTicketFormMessage(channel.id, config.formId"), true)
    assert.equal(source.includes("await ensureControlMessage(channel, nextState"), true)
    assert.equal(source.includes("await syncConfiguredFollowupMessages(ticket, channel, nextState, anchorTimestamp)"), true)
    assert.equal(source.includes("await normalizeConfiguredFollowupMessages(ticket, channel, nextState, anchorTimestamp)"), true)
    assert.equal(source.includes("placementRepairAfterMessageTimestamp: anchorTimestamp"), true)
    assert.equal(source.includes("presentationStackVersion"), true)
    assert.equal(source.includes("whitelistProcessMessageId"), true)
    assert.equal(source.includes("whitelistExpectationsMessageId"), true)
    assert.equal(source.includes("placementRepairAfterMessageTimestamp"), true)
    assert.equal(followupSource.includes("ownsTicketFollowups"), true)
    assert.equal(followupSource.includes("afterTicketMainMessageCreated"), true)
})

test("bridge source reuses the shared authorization helper for button clicks and modal submits", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-eotfs-bridge", "index.ts")
    const source = fs.readFileSync(sourcePath, "utf8")
    const helperMatches = source.match(/getBridgeInteractionAuthorization\(/g) ?? []

    assert.equal(helperMatches.length >= 2, true)
    assert.equal(source.includes("getBridgeAuthorizationDeniedMessage()"), true)
    assert.equal(source.includes("getCanonicalWhitelistPermissionDeniedMessage()"), true)
    assert.equal(source.includes("resolveBridgeActionAuthorizationContext("), true)
    assert.equal(source.includes("actor_user_id: actorUserId"), true)
    assert.equal(source.includes("actor_role_ids: actorRoleIds"), true)
    assert.equal(source.includes("source_guild_id: sourceGuildId"), true)
    assert.equal(source.includes("Number(actorUserId)"), false)
    assert.equal(source.includes("Number(sourceGuildId)"), false)
    assert.equal(source.includes("Staff warning:"), true)
    assert.equal(source.includes("result.operator_warning"), true)
})

test("submit for review compiles a transcript before case_created and keeps transcript_attached as fallback-only", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-eotfs-bridge", "index.ts")
    const servicePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-html-transcripts", "service", "transcript-service.ts")
    const source = fs.readFileSync(sourcePath, "utf8")
    const serviceSource = fs.readFileSync(servicePath, "utf8")

    assert.equal(serviceSource.includes("validateWhitelistBridgeTranscriptReadiness"), true)
    assert.equal(serviceSource.includes("compileWhitelistBridgeTranscript"), true)
    assert.equal(serviceSource.includes("resolveTranscriptTargetChannels"), true)
    assert.equal(source.includes("compileWhitelistBridgeTranscript("), true)
    assert.equal(source.includes("prepared.payload.transcript_url = transcriptCompile.transcriptUrl"), true)
    assert.equal(source.includes('opendiscord.events.get("afterTranscriptReady")'), true)
    assert.equal(source.includes("prepareTranscriptAttachedEvent(channel.id, transcriptUrl, existingState)"), true)
})

test("bridge restore skips stale state when the ticket no longer exists", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-eotfs-bridge", "index.ts")
    const source = fs.readFileSync(sourcePath, "utf8")

    assert.equal(source.includes('warnMissingCanonicalBridgeProfile(null, "restore-bridge-state")'), false)
    assert.equal(source.includes('resolveRequiredBridgeConfigForTicket(ticket, "restore-bridge-state")'), true)
})

test("create-ticket decision blocks duplicate live whitelist tickets", () => {
    const decision = evaluateCreateTicketDecision(
        "whitelist-application-ticket-81642e12",
        ["whitelist-application-ticket-81642e12"],
        "111111111111111111",
        [
            {
                ticketChannelId: "123456789012345678",
                optionId: "whitelist-application-ticket-81642e12",
                creatorDiscordUserId: "111111111111111111",
                closed: false
            }
        ],
        null,
        null
    )

    assert.equal(decision.allow, false)
    assert.equal(decision.reason?.includes("already have an open whitelist ticket"), true)
})

test("create-ticket decision fails open when eligibility is degraded", () => {
    const decision = evaluateCreateTicketDecision(
        "whitelist-application-ticket-81642e12",
        ["whitelist-application-ticket-81642e12"],
        "111111111111111111",
        [],
        null,
        "Eligibility service unavailable."
    )

    assert.deepEqual(decision, {
        allow: true,
        reason: null,
        failOpen: true
    })
})

test("create-ticket decision blocks canonical bot-side lockout states", () => {
    const decision = evaluateCreateTicketDecision(
        "whitelist-application-ticket-81642e12",
        ["whitelist-application-ticket-81642e12"],
        "111111111111111111",
        [],
        {
            applicant_discord_user_id: "111111111111111111",
            eligible: false,
            current_block_state: BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT,
            block_expires_at: "2026-04-01T00:00:00.000Z",
            policy: {
                max_retry_denials: 99,
                retry_cooldown_minutes: 5,
                limit_lockout_minutes: 43200,
                next_retry_outcome: "limit_locked",
                total_staged_attempts: 3,
                active_retry_denial_count: 99,
                lifetime_retry_denial_count: 99,
                lifetime_limit_lockout_count: 1,
                duplicate_rejection_count: 0,
                accept_count: 0,
                hard_deny_count: 0,
                current_block_state: BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT,
                block_expires_at: "2026-04-01T00:00:00.000Z",
                historical_alderon_ids: [],
                override_actor_user_id: null,
                override_reason: null,
                override_updated_at: null
            }
        },
        null
    )

    assert.equal(decision.allow, false)
    assert.equal(decision.reason?.includes("limit lockout"), true)
})

test("misconfigured eligible options are reported when userMaximum drifts from one", () => {
    const misconfigured = findMisconfiguredEligibleOptionIds([
        {
            optionId: "eligible-good",
            limitsEnabled: true,
            userMaximum: 1
        },
        {
            optionId: "eligible-drifted",
            limitsEnabled: true,
            userMaximum: 3
        },
        {
            optionId: "eligible-disabled",
            limitsEnabled: false,
            userMaximum: 1
        }
    ])

    assert.deepEqual(misconfigured, ["eligible-drifted", "eligible-disabled"])
})
