///////////////////////////////////////
//ESCALATE COMMAND
///////////////////////////////////////
import {opendiscord, api} from "../index"
import { validateTicketMoveTransport } from "../actions/ticketTransport.js"
import { getTicketOptionEscalationTargetIds } from "../actions/ticketRouting.js"

const generalConfig = opendiscord.configs.get("opendiscord:general")

export const registerCommandResponders = async () => {
    opendiscord.responders.commands.add(new api.ODCommandResponder("opendiscord:escalate",generalConfig.data.prefix,"escalate"))
    opendiscord.responders.commands.get("opendiscord:escalate").workers.add([
        new api.ODWorker("opendiscord:escalate",0,async (instance,params,source,cancel) => {
            const {guild,channel,user,member} = instance

            const permsResult = await opendiscord.permissions.checkCommandPerms(generalConfig.data.system.permissions.escalate,"support",user,member,channel,guild)
            if (!permsResult.hasPerms){
                if (permsResult.reason == "not-in-server") await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build("button",{channel,user}))
                else await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-no-permissions").build(source,{guild,channel,user,permissions:["support"]}))
                return cancel()
            }

            if (!guild){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-not-in-guild").build("button",{channel,user}))
                return cancel()
            }

            const ticket = opendiscord.tickets.get(channel.id)
            if (!ticket || channel.isDMBased()){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-unknown").build("button",{guild,channel,user}))
                return cancel()
            }
            if (ticket.get("opendiscord:busy").value){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error-ticket-busy").build("button",{guild,channel,user}))
                return cancel()
            }

            const id = instance.options.getString("id",true)
            const reason = instance.options.getString("reason",false)
            const option = opendiscord.options.get(id)
            if (!option || !(option instanceof api.ODTicketOption)){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild,channel,user,error:opendiscord.languages.getTranslation("errors.titles.unknownOption"),layout:"simple"}))
                return cancel()
            }
            if (ticket.option.id.value == option.id.value){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild,channel,user,error:"This ticket is already the same as the chosen option!",layout:"simple"}))
                return cancel()
            }
            if (!getTicketOptionEscalationTargetIds(ticket.option).includes(option.id.value)){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild,channel,user,error:"This ticket option is not an allowed escalation target for the current route.",layout:"simple"}))
                return cancel()
            }
            const moveValidation = validateTicketMoveTransport(ticket,option)
            if (!moveValidation.valid){
                instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:error").build("button",{guild,channel,user,error:moveValidation.reason,layout:"simple"}))
                return cancel()
            }

            await instance.defer(false)
            await opendiscord.actions.get("opendiscord:escalate-ticket").run(source,{guild,channel,user,ticket,reason,sendMessage:false,data:option})
            await instance.reply(await opendiscord.builders.messages.getSafe("opendiscord:move-message").build(source,{guild,channel,user,ticket,reason,data:option}))
        }),
        new api.ODWorker("opendiscord:logs",-1,(instance,params,source,cancel) => {
            opendiscord.log(instance.user.displayName+" used the 'escalate' command!","info",[
                {key:"user",value:instance.user.username},
                {key:"userid",value:instance.user.id,hidden:true},
                {key:"channelid",value:instance.channel.id,hidden:true},
                {key:"method",value:source}
            ])
        })
    ])
}
