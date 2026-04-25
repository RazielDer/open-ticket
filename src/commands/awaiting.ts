///////////////////////////////////////
//AWAITING USER COMMAND
///////////////////////////////////////
import {opendiscord, api} from "../index"
import {
    clearTicketAwaitingUser,
    dismissTicketCloseRequest,
    getTicketWorkflowState,
    requestTicketClose,
    cancelTicketCloseRequest,
    setTicketAwaitingUser
} from "../actions/ticketWorkflow.js"

const generalConfig = opendiscord.configs.get("opendiscord:general")

async function resolveOpenTicket(instance: api.ODCommandResponderInstance | api.ODButtonResponderInstance, source: "slash"|"text"|"button") {
    const {guild,channel,user} = instance
    if (!guild){
        await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build(source,{channel,user}))
        return null
    }
    if (!channel || channel.isDMBased()){
        await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-unknown").build(source,{guild,channel,user}))
        return null
    }
    const ticket = opendiscord.tickets.get(channel.id)
    if (!ticket){
        await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-unknown").build(source,{guild,channel,user}))
        return null
    }
    if (ticket.get("opendiscord:closed").value || !ticket.get("opendiscord:open").value){
        await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build(source,{guild,channel,user,error:"Ticket is not open.",layout:"simple"}))
        return null
    }
    if (ticket.get("opendiscord:busy").value){
        await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-busy").build(source,{guild,channel,user}))
        return null
    }
    return {guild,channel,ticket,user}
}

async function requireClosePermission(instance: api.ODCommandResponderInstance | api.ODButtonResponderInstance, source: "slash"|"text"|"button") {
    const permsResult = await opendiscord.permissions.checkCommandPerms(generalConfig.data.system.permissions.close,"support",instance.user,instance.member,instance.channel,instance.guild)
    if (permsResult.hasPerms) return true
    if (permsResult.reason == "not-in-server") await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build(source,{channel:instance.channel,user:instance.user}))
    else await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build(source,{guild:instance.guild,channel:instance.channel,user:instance.user,permissions:["support"]}))
    return false
}

export const registerCommandResponders = async () => {
    opendiscord.responders.commands.add(new api.ODCommandResponder("opendiscord:awaiting",generalConfig.data.prefix,/^awaiting/))
    opendiscord.responders.commands.get("opendiscord:awaiting").workers.add([
        new api.ODWorker("opendiscord:awaiting",0,async (instance,params,source,cancel) => {
            if (!await requireClosePermission(instance,source)) return cancel()
            const resolved = await resolveOpenTicket(instance,source)
            if (!resolved) return cancel()
            const scope = instance.options.getSubCommand()
            if (!scope || (scope != "set" && scope != "clear")) return cancel()
            const reason = instance.options.getString("reason",false)
            await instance.defer(false)
            if (scope == "set"){
                await setTicketAwaitingUser(resolved.guild,resolved.channel,resolved.user,resolved.ticket,reason)
                await instance.reply({id:new api.ODId("opendiscord:awaiting-user-set"),message:{content:"Awaiting-user state set."},ephemeral:false})
            }else{
                await clearTicketAwaitingUser(resolved.guild,resolved.channel,resolved.user,resolved.ticket,reason)
                await instance.reply({id:new api.ODId("opendiscord:awaiting-user-clear"),message:{content:"Awaiting-user state cleared."},ephemeral:false})
            }
        }),
        new api.ODWorker("opendiscord:logs",-1,(instance,params,source) => {
            const scope = instance.options.getSubCommand()
            opendiscord.log(instance.user.displayName+" used the 'awaiting "+scope+"' command!","info",[
                {key:"user",value:instance.user.username},
                {key:"userid",value:instance.user.id,hidden:true},
                {key:"channelid",value:instance.channel.id,hidden:true},
                {key:"method",value:source}
            ])
        })
    ])
}

export const registerButtonResponders = async () => {
    opendiscord.responders.buttons.add(new api.ODButtonResponder("opendiscord:request-close",/^od:request-close$/))
    opendiscord.responders.buttons.get("opendiscord:request-close").workers.add(new api.ODWorker("opendiscord:request-close",0,async (instance,params,source,cancel) => {
        const resolved = await resolveOpenTicket(instance,"button")
        if (!resolved) return cancel()
        try{
            await instance.defer("update",false)
            await requestTicketClose(resolved.guild,resolved.channel,resolved.user,resolved.ticket,null)
            await instance.update(await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild:resolved.guild,channel:resolved.channel,user:resolved.user,ticket:resolved.ticket}))
        }catch(err){
            await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild:resolved.guild,channel:resolved.channel,user:resolved.user,error:err instanceof Error ? err.message : "Close request failed.",layout:"simple"}))
        }
    }))

    opendiscord.responders.buttons.add(new api.ODButtonResponder("opendiscord:cancel-close-request",/^od:cancel-close-request$/))
    opendiscord.responders.buttons.get("opendiscord:cancel-close-request").workers.add(new api.ODWorker("opendiscord:cancel-close-request",0,async (instance,params,source,cancel) => {
        const resolved = await resolveOpenTicket(instance,"button")
        if (!resolved) return cancel()
        try{
            await instance.defer("update",false)
            await cancelTicketCloseRequest(resolved.guild,resolved.channel,resolved.user,resolved.ticket,null)
            await instance.update(await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild:resolved.guild,channel:resolved.channel,user:resolved.user,ticket:resolved.ticket}))
        }catch(err){
            await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild:resolved.guild,channel:resolved.channel,user:resolved.user,error:err instanceof Error ? err.message : "Close request cancellation failed.",layout:"simple"}))
        }
    }))

    opendiscord.responders.buttons.add(new api.ODButtonResponder("opendiscord:approve-close-request",/^od:approve-close-request$/))
    opendiscord.responders.buttons.get("opendiscord:approve-close-request").workers.add(new api.ODWorker("opendiscord:approve-close-request",0,async (instance,params,source,cancel) => {
        const resolved = await resolveOpenTicket(instance,"button")
        if (!resolved) return cancel()
        if (getTicketWorkflowState(resolved.ticket).closeRequestState != "requested"){
            await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild:resolved.guild,channel:resolved.channel,user:resolved.user,error:"No close request is pending.",layout:"simple"}))
            return cancel()
        }
        const verifybar = opendiscord.verifybars.get("opendiscord:approve-close-request-message")
        if (!verifybar) return cancel()
        await verifybar.activate(instance)
    }))

    opendiscord.responders.buttons.add(new api.ODButtonResponder("opendiscord:dismiss-close-request",/^od:dismiss-close-request$/))
    opendiscord.responders.buttons.get("opendiscord:dismiss-close-request").workers.add(new api.ODWorker("opendiscord:dismiss-close-request",0,async (instance,params,source,cancel) => {
        if (!await requireClosePermission(instance,"button")) return cancel()
        const resolved = await resolveOpenTicket(instance,"button")
        if (!resolved) return cancel()
        try{
            await instance.defer("update",false)
            await dismissTicketCloseRequest(resolved.guild,resolved.channel,resolved.user,resolved.ticket,null)
            await instance.update(await opendiscord.builders.messages.getSafe("opendiscord:close-request-message").build("dismissed",{guild:resolved.guild,channel:resolved.channel,user:resolved.user,ticket:resolved.ticket,reason:null}))
        }catch(err){
            await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild:resolved.guild,channel:resolved.channel,user:resolved.user,error:err instanceof Error ? err.message : "Close request dismissal failed.",layout:"simple"}))
        }
    }))
}
