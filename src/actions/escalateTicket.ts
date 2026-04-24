//TICKET ESCALATION SYSTEM
///////////////////////////////////////
import {opendiscord, api} from "../index"
import { validateTicketMoveTransport } from "./ticketTransport.js"
import { clearTicketClaimState, getTicketOptionEscalationTargetIds } from "./ticketRouting.js"

export const registerActions = async () => {
    opendiscord.actions.add(new api.ODAction("opendiscord:escalate-ticket"))
    opendiscord.actions.get("opendiscord:escalate-ticket").workers.add([
        new api.ODWorker("opendiscord:escalate-ticket",2,async (instance,params,source,cancel) => {
            const {guild,channel,user,ticket,reason,data} = params
            const allowedTargets = getTicketOptionEscalationTargetIds(ticket.option)
            if (!allowedTargets.includes(data.id.value)){
                await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error").build("other",{guild,channel,user,error:"This ticket option is not an allowed escalation target for the current route.",layout:"simple"})).message).catch(() => null)
                return cancel()
            }

            const moveValidation = validateTicketMoveTransport(ticket,data)
            if (!moveValidation.valid){
                await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error").build("other",{guild,channel,user,error:moveValidation.reason,layout:"simple"})).message).catch(() => null)
                return cancel()
            }

            ticket.get("opendiscord:busy").value = true
            clearTicketClaimState(ticket)

            await opendiscord.actions.get("opendiscord:move-ticket").run(source,{guild,channel,user,ticket,reason,sendMessage:false,data})
            if (params.sendMessage) await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:move-message").build(source,{guild,channel,user,ticket,reason,data})).message)
        }),
        new api.ODWorker("opendiscord:logs",0,(instance,params,source,cancel) => {
            const {channel,user,ticket,data} = params

            opendiscord.log(user.displayName+" escalated a ticket!","info",[
                {key:"user",value:user.username},
                {key:"userid",value:user.id,hidden:true},
                {key:"channel",value:"#"+channel.name},
                {key:"channelid",value:channel.id,hidden:true},
                {key:"ticketid",value:ticket.id.value,hidden:true},
                {key:"target",value:data.id.value},
                {key:"reason",value:params.reason ?? "/"},
                {key:"method",value:source}
            ])
        })
    ])
    opendiscord.actions.get("opendiscord:escalate-ticket").workers.backupWorker = new api.ODWorker("opendiscord:cancel-busy",0,(instance,params) => {
        params.ticket.get("opendiscord:busy").value = false
    })
}
