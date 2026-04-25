///////////////////////////////////////
//TICKET WORKFLOW SYSTEM
///////////////////////////////////////
import {opendiscord, api} from "../index"
import * as discord from "discord.js"

const generalConfig = opendiscord.configs.get("opendiscord:general")

export type TicketWorkflowAction =
    "request-close" |
    "cancel-close-request" |
    "approve-close-request" |
    "dismiss-close-request" |
    "set-awaiting-user" |
    "clear-awaiting-user"

export interface TicketWorkflowLockResult {
    locked: boolean
    reason: string | null
}

type CloseRequestApprovalVerificationFailureCode =
    "permission-denied" |
    "ticket-not-open" |
    "ticket-busy" |
    "close-request-missing" |
    "close-before-message" |
    "close-before-admin-message"

type CloseRequestApprovalVerificationResult =
    { ok: true, permsResult: any } |
    { ok: false, code: CloseRequestApprovalVerificationFailureCode, message: string, permissionReason?: string | null }

const WORKFLOW_ACTIONS = new Set<TicketWorkflowAction>([
    "request-close",
    "cancel-close-request",
    "approve-close-request",
    "dismiss-close-request",
    "set-awaiting-user",
    "clear-awaiting-user"
])

const DASHBOARD_ACTION_TO_WORKFLOW: Record<string, TicketWorkflowAction> = {
    "request-close": "request-close",
    "cancel-close-request": "cancel-close-request",
    "approve-close-request": "approve-close-request",
    "dismiss-close-request": "dismiss-close-request",
    "set-awaiting-user": "set-awaiting-user",
    "clear-awaiting-user": "clear-awaiting-user"
}

function ticketData<T>(ticket: api.ODTicket, id: keyof api.ODTicketIds, fallback: T): T {
    const data = ticket.get(id)
    return data ? data.value as T : fallback
}

export function getTicketWorkflowPolicy(ticket: api.ODTicket) {
    const option = ticket.option
    return {
        closeRequest: {
            enabled: Boolean(option.get("opendiscord:workflow-close-request-enabled")?.value)
        },
        awaitingUser: {
            enabled: Boolean(option.get("opendiscord:workflow-awaiting-user-enabled")?.value),
            reminderEnabled: Boolean(option.get("opendiscord:workflow-awaiting-user-reminder-enabled")?.value),
            reminderHours: Number(option.get("opendiscord:workflow-awaiting-user-reminder-hours")?.value ?? 24),
            autoCloseEnabled: Boolean(option.get("opendiscord:workflow-awaiting-user-autoclose-enabled")?.value),
            autoCloseHours: Number(option.get("opendiscord:workflow-awaiting-user-autoclose-hours")?.value ?? 72)
        }
    }
}

export function getTicketWorkflowState(ticket: api.ODTicket) {
    const closeRequestState = ticketData<string|null>(ticket,"opendiscord:close-request-state",null) == "requested" ? "requested" : null
    const awaitingUserStateValue = ticketData<string|null>(ticket,"opendiscord:awaiting-user-state",null)
    const awaitingUserState = awaitingUserStateValue == "waiting" || awaitingUserStateValue == "reminded" ? awaitingUserStateValue : null
    return {
        closeRequestState,
        closeRequestBy: ticketData<string|null>(ticket,"opendiscord:close-request-by",null),
        closeRequestAt: ticketData<number|null>(ticket,"opendiscord:close-request-on",null),
        awaitingUserState,
        awaitingUserSince: ticketData<number|null>(ticket,"opendiscord:awaiting-user-since",null)
    }
}

export function resetTicketCloseRequest(ticket: api.ODTicket) {
    ticket.get("opendiscord:close-request-state").value = null
    ticket.get("opendiscord:close-request-by").value = null
    ticket.get("opendiscord:close-request-on").value = null
}

export function resetTicketAwaitingUser(ticket: api.ODTicket) {
    ticket.get("opendiscord:awaiting-user-state").value = null
    ticket.get("opendiscord:awaiting-user-since").value = null
}

export function resetTicketWorkflowState(ticket: api.ODTicket) {
    resetTicketCloseRequest(ticket)
    resetTicketAwaitingUser(ticket)
}

export function isTicketCurrentCreator(ticket: api.ODTicket, userId: string | null | undefined) {
    return Boolean(userId && ticket.get("opendiscord:opened-by").value == userId)
}

export async function resolveTicketWorkflowLock(ticket: api.ODTicket, action?: TicketWorkflowAction): Promise<TicketWorkflowLockResult> {
    if (action && !WORKFLOW_ACTIONS.has(action)) return {locked:false, reason:null}

    let bridgeService: any = null
    try {
        bridgeService = opendiscord.plugins.classes.get("ot-eotfs-bridge:service") as any
    } catch {
        bridgeService = null
    }
    const ticketId = ticket.id.value
    let dashboardLock: any = null
    if (bridgeService && typeof bridgeService.getDashboardTicketLockState == "function"){
        try{
            dashboardLock = await bridgeService.getDashboardTicketLockState(ticketId)
        }catch{
            dashboardLock = null
        }
    }
    if (dashboardLock){
        const lockedActions = Array.isArray(dashboardLock.lockedActions) ? dashboardLock.lockedActions : []
        const mappedAction = action ? DASHBOARD_ACTION_TO_WORKFLOW[action] : null
        const workflowLocked = mappedAction
            ? lockedActions.includes(mappedAction)
            : lockedActions.some((lockedAction: unknown) => typeof lockedAction == "string" && WORKFLOW_ACTIONS.has(lockedAction as TicketWorkflowAction))
        if (workflowLocked){
            return {
                locked:true,
                reason: typeof dashboardLock.message == "string" && dashboardLock.message.length > 0
                    ? dashboardLock.message
                    : "Ticket workflow is locked by its provider."
            }
        }
    }

    if (bridgeService && typeof bridgeService.resolveApplicantLifecycleState == "function"){
        try{
            const lifecycleState = bridgeService.resolveApplicantLifecycleState(ticketId)
            if (lifecycleState == "submitted" || lifecycleState == "locked"){
                return {
                    locked:true,
                    reason:"Whitelist review controls this ticket lifecycle until staff returns it for applicant edits."
                }
            }
        }catch{}
    }

    return {locked:false, reason:null}
}

export async function refreshWorkflowTicketMessage(guild: discord.Guild, channel: discord.GuildTextBasedChannel, user: discord.User, ticket: api.ODTicket) {
    const ticketMessage = await opendiscord.tickets.getTicketMessage(ticket)
    if (!ticketMessage) return
    await ticketMessage.edit((await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild,channel,user,ticket})).message).catch((err) => {
        opendiscord.log("Unable to edit ticket message during ticket workflow update.","warning",[
            {key:"channelid",value:channel.id,hidden:true},
            {key:"messageid",value:ticketMessage.id,hidden:true}
        ])
        opendiscord.debugfile.writeErrorMessage(new api.ODError(err,"uncaughtException"))
    })
}

async function sendWorkflowMessage(
    messageId: "opendiscord:close-request-message"|"opendiscord:awaiting-user-message",
    variant: "requested"|"cancelled"|"dismissed"|"set"|"reminder"|"cleared",
    guild: discord.Guild,
    channel: discord.GuildTextBasedChannel,
    user: discord.User,
    ticket: api.ODTicket,
    reason: string | null
) {
    await channel.send((await opendiscord.builders.messages.getSafe(messageId).build(variant as any,{guild,channel,user,ticket,reason})).message)
}

export async function canShowRequestCloseButton(guild: discord.Guild, channel: discord.GuildTextBasedChannel, ticket: api.ODTicket): Promise<boolean> {
    const policy = getTicketWorkflowPolicy(ticket)
    const state = getTicketWorkflowState(ticket)
    if (!policy.closeRequest.enabled) return false
    if (!ticket.get("opendiscord:open").value || ticket.get("opendiscord:closed").value) return false
    if (state.closeRequestState || state.awaitingUserState) return false
    const lock = await resolveTicketWorkflowLock(ticket,"request-close")
    if (lock.locked) return false
    const directCloseAvailable = await resolveCreatorDirectCloseAvailability(guild,channel,ticket)
    return directCloseAvailable === false
}

export async function resolveCreatorDirectCloseAvailability(guild: discord.Guild, channel: discord.GuildTextBasedChannel, ticket: api.ODTicket): Promise<boolean | null> {
    const creatorId = ticket.get("opendiscord:opened-by").value
    if (!creatorId) return null
    try{
        const creator = await opendiscord.client.fetchUser(creatorId)
        if (!creator) return null
        const member = await guild.members.fetch(creatorId).catch(() => null)
        if (!member) return null
        const permsResult = await opendiscord.permissions.checkCommandPerms(generalConfig.data.system.permissions.close,"support",creator,member,channel,guild)
        if (!permsResult || typeof permsResult.hasPerms != "boolean") return null
        return permsResult.hasPerms
    }catch{
        return null
    }
}

export async function verifyTicketCloseRequestApproval(
    guild: discord.Guild,
    channel: discord.GuildTextBasedChannel,
    user: discord.User,
    member: discord.GuildMember | null | undefined,
    ticket: api.ODTicket
): Promise<CloseRequestApprovalVerificationResult> {
    const checkedMember = member ?? await guild.members.fetch(user.id).catch(() => null)
    const permsResult = await opendiscord.permissions.checkCommandPerms(generalConfig.data.system.permissions.close,"support",user,checkedMember,channel,guild)
    if (!permsResult?.hasPerms){
        return {
            ok:false,
            code:"permission-denied",
            permissionReason:permsResult?.reason ?? null,
            message:"You do not have permission to close this ticket."
        }
    }
    if (ticket.get("opendiscord:closed").value || !ticket.get("opendiscord:open").value){
        return {ok:false, code:"ticket-not-open", message:"Ticket is not open."}
    }
    if (ticket.get("opendiscord:busy").value){
        return {ok:false, code:"ticket-busy", message:"Ticket is busy."}
    }
    if (getTicketWorkflowState(ticket).closeRequestState != "requested"){
        return {ok:false, code:"close-request-missing", message:"No close request is pending."}
    }
    if (!permsResult.isAdmin && (!generalConfig.data.system.allowCloseBeforeMessage || !generalConfig.data.system.allowCloseBeforeAdminMessage)){
        const analysis = await opendiscord.transcripts.collector.ticketUserMessagesAnalysis(ticket,guild,channel)
        if (analysis && !generalConfig.data.system.allowCloseBeforeMessage && analysis.totalMessages < 1){
            return {ok:false, code:"close-before-message", message:opendiscord.languages.getTranslation("errors.descriptions.closeBeforeMessage")}
        }
        if (analysis && !generalConfig.data.system.allowCloseBeforeAdminMessage && analysis.adminMessages < 1){
            return {ok:false, code:"close-before-admin-message", message:opendiscord.languages.getTranslation("errors.descriptions.closeBeforeAdminMessage")}
        }
    }
    return {ok:true, permsResult}
}

async function replyCloseRequestApprovalFailure(instance: api.ODButtonResponderInstance, failure: Exclude<CloseRequestApprovalVerificationResult,{ok:true}>, guild: discord.Guild, channel: discord.GuildTextBasedChannel, user: discord.User) {
    if (failure.code == "permission-denied"){
        if (failure.permissionReason == "not-in-server") await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build("button",{channel,user}))
        else await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build("button",{guild,channel,user,permissions:["support"]}))
        return
    }
    if (failure.code == "ticket-busy"){
        await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-busy").build("button",{guild,channel,user}))
        return
    }
    if (failure.code == "close-before-message" || failure.code == "close-before-admin-message"){
        await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild,channel,user,layout:"simple",error:failure.message,customTitle:opendiscord.languages.getTranslation("errors.titles.noPermissions")}))
        return
    }
    await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild,channel,user,error:failure.message,layout:"simple"}))
}

export async function requestTicketClose(guild: discord.Guild, channel: discord.GuildTextBasedChannel, user: discord.User, ticket: api.ODTicket, reason: string | null) {
    const state = getTicketWorkflowState(ticket)
    const policy = getTicketWorkflowPolicy(ticket)
    if (!policy.closeRequest.enabled) throw new api.ODSystemError("Close requests are not enabled for this ticket option.")
    if (!isTicketCurrentCreator(ticket,user.id)) throw new api.ODSystemError("Only the current ticket creator can request close.")
    if (!ticket.get("opendiscord:open").value || ticket.get("opendiscord:closed").value) throw new api.ODSystemError("Only open tickets can receive close requests.")
    if (state.awaitingUserState) throw new api.ODSystemError("Close request is unavailable while this ticket is awaiting user response.")
    if (state.closeRequestState) throw new api.ODSystemError("A close request is already pending.")
    const lock = await resolveTicketWorkflowLock(ticket,"request-close")
    if (lock.locked) throw new api.ODSystemError(lock.reason || "Ticket workflow is locked by its provider.")
    const directCloseAvailable = await resolveCreatorDirectCloseAvailability(guild,channel,ticket)
    if (directCloseAvailable !== false){
        throw new api.ODSystemError(directCloseAvailable === true
            ? "Use the direct close action for this ticket."
            : "Close request availability could not be verified.")
    }

    ticket.get("opendiscord:close-request-state").value = "requested"
    ticket.get("opendiscord:close-request-by").value = user.id
    ticket.get("opendiscord:close-request-on").value = Date.now()
    await sendWorkflowMessage("opendiscord:close-request-message","requested",guild,channel,user,ticket,reason)
    await refreshWorkflowTicketMessage(guild,channel,user,ticket)
}

export async function cancelTicketCloseRequest(guild: discord.Guild, channel: discord.GuildTextBasedChannel, user: discord.User, ticket: api.ODTicket, reason: string | null) {
    const state = getTicketWorkflowState(ticket)
    if (!isTicketCurrentCreator(ticket,user.id)) throw new api.ODSystemError("Only the current ticket creator can cancel the close request.")
    if (state.closeRequestState != "requested") throw new api.ODSystemError("No close request is pending.")
    resetTicketCloseRequest(ticket)
    await sendWorkflowMessage("opendiscord:close-request-message","cancelled",guild,channel,user,ticket,reason)
    await refreshWorkflowTicketMessage(guild,channel,user,ticket)
}

export async function approveTicketCloseRequest(guild: discord.Guild, channel: discord.GuildTextBasedChannel, user: discord.User, ticket: api.ODTicket, reason: string | null, member?: discord.GuildMember | null) {
    const verification = await verifyTicketCloseRequestApproval(guild,channel,user,member,ticket)
    if (!verification.ok) throw new api.ODSystemError(verification.message)
    const lock = await resolveTicketWorkflowLock(ticket,"approve-close-request")
    if (lock.locked) throw new api.ODSystemError(lock.reason || "Ticket workflow is locked by its provider.")
    await opendiscord.actions.get("opendiscord:close-ticket").run("close-request",{guild,channel,user,ticket,reason,sendMessage:true})
}

export async function dismissTicketCloseRequest(guild: discord.Guild, channel: discord.GuildTextBasedChannel, user: discord.User, ticket: api.ODTicket, reason: string | null) {
    const state = getTicketWorkflowState(ticket)
    if (state.closeRequestState != "requested") throw new api.ODSystemError("No close request is pending.")
    const lock = await resolveTicketWorkflowLock(ticket,"dismiss-close-request")
    if (lock.locked) throw new api.ODSystemError(lock.reason || "Ticket workflow is locked by its provider.")
    resetTicketCloseRequest(ticket)
    await sendWorkflowMessage("opendiscord:close-request-message","dismissed",guild,channel,user,ticket,reason)
    await refreshWorkflowTicketMessage(guild,channel,user,ticket)
}

export async function setTicketAwaitingUser(guild: discord.Guild, channel: discord.GuildTextBasedChannel, user: discord.User, ticket: api.ODTicket, reason: string | null) {
    const policy = getTicketWorkflowPolicy(ticket)
    const state = getTicketWorkflowState(ticket)
    if (!policy.awaitingUser.enabled) throw new api.ODSystemError("Awaiting-user workflow is not enabled for this ticket option.")
    if (!ticket.get("opendiscord:open").value || ticket.get("opendiscord:closed").value) throw new api.ODSystemError("Only open tickets can be marked awaiting user.")
    if (state.closeRequestState) throw new api.ODSystemError("Awaiting user is unavailable while a close request is pending.")
    if (state.awaitingUserState) throw new api.ODSystemError("This ticket is already awaiting user response.")
    const lock = await resolveTicketWorkflowLock(ticket,"set-awaiting-user")
    if (lock.locked) throw new api.ODSystemError(lock.reason || "Ticket workflow is locked by its provider.")

    ticket.get("opendiscord:awaiting-user-state").value = "waiting"
    ticket.get("opendiscord:awaiting-user-since").value = Date.now()
    resetTicketCloseRequest(ticket)
    await sendWorkflowMessage("opendiscord:awaiting-user-message","set",guild,channel,user,ticket,reason)
    await refreshWorkflowTicketMessage(guild,channel,user,ticket)
}

export async function clearTicketAwaitingUser(guild: discord.Guild, channel: discord.GuildTextBasedChannel, user: discord.User, ticket: api.ODTicket, reason: string | null) {
    const state = getTicketWorkflowState(ticket)
    if (!state.awaitingUserState) throw new api.ODSystemError("This ticket is not awaiting user response.")
    const lock = await resolveTicketWorkflowLock(ticket,"clear-awaiting-user")
    if (lock.locked) throw new api.ODSystemError(lock.reason || "Ticket workflow is locked by its provider.")
    resetTicketAwaitingUser(ticket)
    await sendWorkflowMessage("opendiscord:awaiting-user-message","cleared",guild,channel,user,ticket,reason)
    await refreshWorkflowTicketMessage(guild,channel,user,ticket)
}

export async function clearAwaitingUserForRequesterActivity(input: {
    guild: discord.Guild
    channel: discord.GuildTextBasedChannel
    user: discord.User
    ticket: api.ODTicket
    reason?: string | null
}) {
    const {guild,channel,user,ticket} = input
    const state = getTicketWorkflowState(ticket)
    if (!state.awaitingUserState) return false
    if (!ticket.get("opendiscord:open").value || ticket.get("opendiscord:closed").value) return false
    if (!isTicketCurrentCreator(ticket,user.id)) return false
    return clearAwaitingUserForAuthorizedActivity({
        guild,
        channel,
        user,
        ticket,
        reason: input.reason ?? "Requester activity"
    })
}

async function clearAwaitingUserForAuthorizedActivity(input: {
    guild: discord.Guild
    channel: discord.GuildTextBasedChannel
    user: discord.User
    ticket: api.ODTicket
    reason: string | null
}) {
    const {guild,channel,user,ticket} = input
    const state = getTicketWorkflowState(ticket)
    if (!state.awaitingUserState) return false
    if (!ticket.get("opendiscord:open").value || ticket.get("opendiscord:closed").value) return false
    resetTicketAwaitingUser(ticket)
    await sendWorkflowMessage("opendiscord:awaiting-user-message","cleared",guild,channel,user,ticket,input.reason)
    await refreshWorkflowTicketMessage(guild,channel,user,ticket)
    return true
}

export async function clearAwaitingUserForApplicantMutation(
    ticketChannelId: string,
    actorUserId: string,
    authoritativeApplicantUserId: string | null,
    answerTarget: string
) {
    const ticket = opendiscord.tickets.get(ticketChannelId)
    if (!ticket) return false
    const channel = await opendiscord.tickets.getTicketChannel(ticket)
    if (!channel) return false
    const expectedUserId = answerTarget == "ticket_managed_record"
        ? authoritativeApplicantUserId
        : ticket.get("opendiscord:opened-by").value
    if (!expectedUserId || expectedUserId != actorUserId) return false
    const user = await opendiscord.client.fetchUser(actorUserId)
    if (!user) return false
    return clearAwaitingUserForAuthorizedActivity({
        guild: channel.guild,
        channel,
        user,
        ticket,
        reason: "Applicant form activity"
    })
}

export async function runAwaitingUserWorkflowScan() {
    let reminders = 0
    let closed = 0
    const now = Date.now()
    for (const ticket of opendiscord.tickets.getAll()){
        const state = getTicketWorkflowState(ticket)
        if (!state.awaitingUserState || !state.awaitingUserSince) continue
        if (!ticket.get("opendiscord:open").value || ticket.get("opendiscord:closed").value) continue
        const policy = getTicketWorkflowPolicy(ticket)
        if (!policy.awaitingUser.enabled) continue
        const lock = await resolveTicketWorkflowLock(ticket)
        if (lock.locked) continue
        const channel = await opendiscord.tickets.getTicketChannel(ticket)
        if (!channel) continue
        const botUser = opendiscord.client.client.user
        if (!botUser) continue

        const elapsedMs = now - state.awaitingUserSince
        const autoCloseMs = policy.awaitingUser.autoCloseHours*60*60*1000
        if (policy.awaitingUser.autoCloseEnabled && elapsedMs >= autoCloseMs){
            await opendiscord.actions.get("opendiscord:close-ticket").run("awaiting-user-timeout",{
                guild: channel.guild,
                channel,
                user: botUser,
                ticket,
                reason: "Awaiting user timeout",
                sendMessage: true
            })
            closed++
            continue
        }

        const reminderMs = policy.awaitingUser.reminderHours*60*60*1000
        if (state.awaitingUserState == "waiting" && policy.awaitingUser.reminderEnabled && elapsedMs >= reminderMs){
            await sendWorkflowMessage("opendiscord:awaiting-user-message","reminder",channel.guild,channel,botUser,ticket,null)
            ticket.get("opendiscord:awaiting-user-state").value = "reminded"
            await refreshWorkflowTicketMessage(channel.guild,channel,botUser,ticket)
            reminders++
        }
    }
    return {reminders, closed}
}

export const registerActions = async () => {
    opendiscord.actions.add(new api.ODAction("opendiscord:request-close"))
    opendiscord.actions.get("opendiscord:request-close").workers.add(new api.ODWorker("opendiscord:request-close",0,async (instance,params) => {
        await requestTicketClose(params.guild,params.channel,params.user,params.ticket,params.reason ?? null)
    }))

    opendiscord.actions.add(new api.ODAction("opendiscord:cancel-close-request"))
    opendiscord.actions.get("opendiscord:cancel-close-request").workers.add(new api.ODWorker("opendiscord:cancel-close-request",0,async (instance,params) => {
        await cancelTicketCloseRequest(params.guild,params.channel,params.user,params.ticket,params.reason ?? null)
    }))

    opendiscord.actions.add(new api.ODAction("opendiscord:approve-close-request"))
    opendiscord.actions.get("opendiscord:approve-close-request").workers.add(new api.ODWorker("opendiscord:approve-close-request",0,async (instance,params) => {
        await approveTicketCloseRequest(params.guild,params.channel,params.user,params.ticket,params.reason ?? null,params.member ?? null)
    }))

    opendiscord.actions.add(new api.ODAction("opendiscord:dismiss-close-request"))
    opendiscord.actions.get("opendiscord:dismiss-close-request").workers.add(new api.ODWorker("opendiscord:dismiss-close-request",0,async (instance,params) => {
        await dismissTicketCloseRequest(params.guild,params.channel,params.user,params.ticket,params.reason ?? null)
    }))

    opendiscord.actions.add(new api.ODAction("opendiscord:set-awaiting-user"))
    opendiscord.actions.get("opendiscord:set-awaiting-user").workers.add(new api.ODWorker("opendiscord:set-awaiting-user",0,async (instance,params) => {
        await setTicketAwaitingUser(params.guild,params.channel,params.user,params.ticket,params.reason ?? null)
    }))

    opendiscord.actions.add(new api.ODAction("opendiscord:clear-awaiting-user"))
    opendiscord.actions.get("opendiscord:clear-awaiting-user").workers.add(new api.ODWorker("opendiscord:clear-awaiting-user",0,async (instance,params) => {
        await clearTicketAwaitingUser(params.guild,params.channel,params.user,params.ticket,params.reason ?? null)
    }))
}

export const registerVerifyBars = async () => {
    opendiscord.verifybars.add(new api.ODVerifyBar("opendiscord:approve-close-request-message",opendiscord.builders.messages.getSafe("opendiscord:verifybar-close-request-message"),!generalConfig.data.system.disableVerifyBars))
    const approveCloseRequestVerifybar = opendiscord.verifybars.get("opendiscord:approve-close-request-message")
    if (!approveCloseRequestVerifybar) return
    approveCloseRequestVerifybar.success.add(new api.ODWorker("opendiscord:approve-close-request",0,async (instance,params,source,cancel) => {
        const {user,member,channel,guild} = instance
        if (!guild){
            instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build("button",{channel,user}))
            return cancel()
        }
        const ticket = opendiscord.tickets.get(channel.id)
        if (!ticket || channel.isDMBased()){
            instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-unknown").build("button",{guild,channel,user}))
            return cancel()
        }
        const verification = await verifyTicketCloseRequestApproval(guild,channel,user,member,ticket)
        if (!verification.ok){
            await replyCloseRequestApprovalFailure(instance,verification,guild,channel,user)
            return cancel()
        }
        if (params.data == "reason"){
            instance.modal(await opendiscord.builders.modals.getSafe("opendiscord:close-ticket-reason").build("close-request",{guild,channel,user,ticket}))
        }else{
            await instance.defer("update",false)
            await approveTicketCloseRequest(guild,channel,user,ticket,null,member)
            await instance.update(await opendiscord.builders.messages.getSafe("opendiscord:close-request-message").build("approved" as any,{guild,channel,user,ticket,reason:null}))
        }
    }))
    approveCloseRequestVerifybar.failure.add(new api.ODWorker("opendiscord:back-to-close-request",0,async (instance,params,source,cancel) => {
        const {guild,channel,user} = instance
        if (!guild) return cancel()
        const ticket = opendiscord.tickets.get(channel.id)
        if (!ticket || channel.isDMBased()) return cancel()
        await instance.update(await opendiscord.builders.messages.getSafe("opendiscord:close-request-message").build("requested",{guild,channel,user,ticket,reason:null}))
    }))
}
