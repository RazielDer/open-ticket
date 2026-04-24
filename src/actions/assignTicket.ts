///////////////////////////////////////
//TICKET ASSIGNMENT SYSTEM
///////////////////////////////////////
import {opendiscord, api} from "../index"
import { setTicketAssignedStaff } from "./ticketRouting.js"

export const registerActions = async () => {
    opendiscord.actions.add(new api.ODAction("opendiscord:assign-ticket"))
    opendiscord.actions.get("opendiscord:assign-ticket").workers.add([
        new api.ODWorker("opendiscord:assign-ticket",2,async (instance,params,source,cancel) => {
            const {guild,channel,user,ticket,reason,assigneeUserId} = params
            const normalizedAssigneeUserId = typeof assigneeUserId == "string" ? assigneeUserId.trim() : ""
            if (normalizedAssigneeUserId.length < 1){
                await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error").build("other",{guild,channel,user,error:"Choose a staff member before assigning this ticket.",layout:"simple"})).message).catch(() => null)
                return cancel()
            }

            const claimed = ticket.get("opendiscord:claimed").value === true
            const claimedBy = typeof ticket.get("opendiscord:claimed-by").value == "string" ? ticket.get("opendiscord:claimed-by").value : null
            if (claimed && claimedBy && claimedBy != normalizedAssigneeUserId){
                await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error").build("other",{guild,channel,user,error:"This ticket is currently claimed by another staff member. Unclaim it before assigning a different staff member.",layout:"simple"})).message).catch(() => null)
                return cancel()
            }

            setTicketAssignedStaff(ticket,normalizedAssigneeUserId)
            await opendiscord.actions.get("opendiscord:update-ticket-topic").run("ticket-action",{guild,channel,user,ticket,sendMessage:false,newTopic:null})

            if (params.sendMessage){
                const assignee = await opendiscord.client.client.users.fetch(normalizedAssigneeUserId).catch(() => null)
                const assigneeLabel = assignee ? assignee.username : normalizedAssigneeUserId
                await channel.send(`Ticket assigned to ${assigneeLabel}${reason ? `: ${reason}` : "."}`).catch(() => null)
            }
        }),
        new api.ODWorker("opendiscord:logs",0,(instance,params,source,cancel) => {
            const {channel,user,ticket,assigneeUserId} = params
            opendiscord.log(user.displayName+" assigned a ticket!","info",[
                {key:"user",value:user.username},
                {key:"userid",value:user.id,hidden:true},
                {key:"channel",value:"#"+channel.name},
                {key:"channelid",value:channel.id,hidden:true},
                {key:"ticketid",value:ticket.id.value,hidden:true},
                {key:"assignee",value:assigneeUserId},
                {key:"reason",value:params.reason ?? "/"},
                {key:"method",value:source}
            ])
        })
    ])
}
