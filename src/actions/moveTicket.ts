///////////////////////////////////////
//TICKET MOVING SYSTEM
///////////////////////////////////////
import {opendiscord, api, utilities} from "../index"
import * as discord from "discord.js"
import { PRIVATE_THREAD_ACCESS_WARNING, validateTicketMoveTransport } from "./ticketTransport.js"
import { applyTicketRoutingAssignment, getTicketOptionSupportTeamRoleIds, resolveTicketOpenCategoryRoute, type ODTicketOpenCategoryRoute } from "./ticketRouting.js"
import { setTicketIntegrationProfileIdFromOption } from "./ticketIntegration.js"
import { setTicketAiAssistProfileIdFromOption } from "./ticketAiAssist.js"

const generalConfig = opendiscord.configs.get("opendiscord:general")

export const registerActions = async () => {
    opendiscord.actions.add(new api.ODAction("opendiscord:move-ticket"))
    opendiscord.actions.get("opendiscord:move-ticket").workers.add([
        new api.ODWorker("opendiscord:move-ticket",2,async (instance,params,source,cancel) => {
            const {guild,channel,user,ticket,reason,data} = params
            const moveValidation = validateTicketMoveTransport(ticket,data)
            if (!moveValidation.valid){
                await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error").build("other",{guild,channel,user,error:moveValidation.reason,layout:"simple"})).message).catch(() => null)
                return cancel()
            }

            let openCategoryRoute: ODTicketOpenCategoryRoute|null = null
            if (!channel.isThread()){
                const rawClaimCategory = data.get("opendiscord:channel-categories-claimed").value.find((c) => c.user == user.id)
                const claimCategory = (rawClaimCategory) ? rawClaimCategory.category : null
                const closeCategory = data.get("opendiscord:channel-category-closed").value
                if (!claimCategory && !(closeCategory != "" && ticket.get("opendiscord:closed").value)){
                    openCategoryRoute = await resolveTicketOpenCategoryRoute({guild,option:data,logPrefix:"Ticket Move"})
                    if (!openCategoryRoute.ok){
                        await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error").build("other",{guild,channel,user,error:openCategoryRoute.reason,layout:"simple"})).message).catch(() => null)
                        return cancel()
                    }
                }
            }

            await opendiscord.events.get("onTicketMove").emit([ticket,user,channel,reason])
            if (channel.isThread()){
                const targetPrefix = data.get("opendiscord:channel-prefix").value
                const channelSuffix = ticket.get("opendiscord:channel-suffix").value
                const pinEmoji = ticket.get("opendiscord:pinned").value ? generalConfig.data.system.pinEmoji : ""
                const priorityEmoji = opendiscord.priorities.getFromPriorityLevel(ticket.get("opendiscord:priority").value).channelEmoji ?? ""
                const newName = pinEmoji+priorityEmoji+utilities.trimEmojis(targetPrefix+channelSuffix)
                try{
                    await utilities.timedAwait(channel.setName(newName),2500,(err) => {
                        opendiscord.log("Failed to rename private-thread ticket on move","warning")
                    })
                }catch(err){
                    await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error").build("other",{guild,channel,user,error:PRIVATE_THREAD_ACCESS_WARNING,layout:"simple"})).message).catch(() => null)
                    return cancel()
                }
            }
            const previousOption = ticket.option
            ticket.option = data
            setTicketIntegrationProfileIdFromOption(ticket,ticket.option)
            setTicketAiAssistProfileIdFromOption(ticket,ticket.option)
            await applyTicketRoutingAssignment(ticket,guild,ticket.option)
            const permissionLoader = await import("../data/framework/permissionLoader.js")
            await permissionLoader.removeTicketPermissions(ticket,previousOption)
            await permissionLoader.addTicketPermissions(ticket)

            //update stats
            await opendiscord.stats.get("opendiscord:global").setStat("opendiscord:tickets-moved",1,"increase")
            await opendiscord.stats.get("opendiscord:user").setStat("opendiscord:tickets-moved",user.id,1,"increase")

            //get new channel properties
            const channelPrefix = ticket.option.get("opendiscord:channel-prefix").value
            const channelSuffix = ticket.get("opendiscord:channel-suffix").value
            const rawClaimCategory = ticket.option.get("opendiscord:channel-categories-claimed").value.find((c) => c.user == user.id)
            const claimCategory = (rawClaimCategory) ? rawClaimCategory.category : null
            const closeCategory = ticket.option.get("opendiscord:channel-category-closed").value
            const channelTopic = ticket.option.get("opendiscord:channel-topic").value

            //handle category
            let category: string|null = null
            let categoryMode: "normal"|"overflow"|"closed"|"claimed"|null = null
            if (channel.isThread()){
                category = null
                categoryMode = null
            }else if (claimCategory){
                //use claim category
                category = claimCategory
                categoryMode = "claimed"
            }else if (closeCategory != "" && ticket.get("opendiscord:closed").value){
                //use close category
                category = closeCategory
                categoryMode = "closed"
            }else if (openCategoryRoute?.ok){
                category = openCategoryRoute.categoryId
                categoryMode = openCategoryRoute.categoryMode
            }

            try {
                //only move category when not the same.
                if (!channel.isThread() && channel.parentId != category) await utilities.timedAwait(channel.setParent(category,{lockPermissions:false}),2500,(err) => {
                    opendiscord.log("Failed to change channel category on ticket move","error")
                })
                ticket.get("opendiscord:category-mode").value = categoryMode
                ticket.get("opendiscord:category").value = category
            }catch(e){
                opendiscord.log("Unable to move ticket to 'moved category'!","error",[
                    {key:"channel",value:"#"+channel.name},
                    {key:"channelid",value:channel.id,hidden:true},
                    {key:"categoryid",value:category ?? "/"}
                ])
                opendiscord.debugfile.writeErrorMessage(new api.ODError(e,"uncaughtException"))
            }

            //handle permissions
            const permissions: discord.OverwriteResolvable[] = [{
                type:discord.OverwriteType.Role,
                id:guild.roles.everyone.id,
                allow:[],
                deny:["ViewChannel","SendMessages","ReadMessageHistory"]
            }]
            const globalAdmins = opendiscord.configs.get("opendiscord:general").data.globalAdmins
            const optionAdmins = ticket.option.get("opendiscord:admins").value
            const readonlyAdmins = ticket.option.get("opendiscord:admins-readonly").value
            const supportTeamRoleIds = getTicketOptionSupportTeamRoleIds(ticket.option)

            globalAdmins.forEach((admin) => {
                permissions.push({
                    type:discord.OverwriteType.Role,
                    id:admin,
                    allow:["ViewChannel","SendMessages","AddReactions","AttachFiles","SendPolls","ReadMessageHistory","ManageMessages"],
                    deny:[]
                })
            })
            optionAdmins.forEach((admin) => {
                if (globalAdmins.includes(admin)) return
                permissions.push({
                    type:discord.OverwriteType.Role,
                    id:admin,
                    allow:["ViewChannel","SendMessages","AddReactions","AttachFiles","SendPolls","ReadMessageHistory","ManageMessages"],
                    deny:[]
                })
            })
            supportTeamRoleIds.forEach((admin) => {
                if (globalAdmins.includes(admin)) return
                if (optionAdmins.includes(admin)) return
                permissions.push({
                    type:discord.OverwriteType.Role,
                    id:admin,
                    allow:["ViewChannel","SendMessages","AddReactions","AttachFiles","SendPolls","ReadMessageHistory","ManageMessages"],
                    deny:[]
                })
            })
            readonlyAdmins.forEach((admin) => {
                if (globalAdmins.includes(admin)) return
                if (optionAdmins.includes(admin)) return
                if (supportTeamRoleIds.includes(admin)) return
                permissions.push({
                    type:discord.OverwriteType.Role,
                    id:admin,
                    allow:["ViewChannel","ReadMessageHistory"],
                    deny:["SendMessages","AddReactions","AttachFiles","SendPolls"]
                })
            })
            //transfer all old user-participants over to the new ticket (creator & participants)
            ticket.get("opendiscord:participants").value.forEach((p) => {
                if (p.type == "user") permissions.push({
                    type:discord.OverwriteType.Member,
                    id:p.id,
                    allow:["ViewChannel","SendMessages","AddReactions","AttachFiles","SendPolls","ReadMessageHistory"],
                    deny:[]
                })
            })
            if (!channel.isThread()){
                try{
                    await channel.permissionOverwrites.set(permissions)
                }catch{
                    opendiscord.log("Failed to reset channel permissions on ticket move!","error")
                }
            }

            //handle participants
            const participants: {type:"role"|"user",id:string}[] = []
            permissions.forEach((permission,index) => {
                if (index == 0) return //don't include @everyone
                const type = (permission.type == discord.OverwriteType.Role) ? "role" : "user"
                const id = permission.id as string
                participants.push({type,id})
            })
            ticket.get("opendiscord:participants").value = participants
            ticket.get("opendiscord:participants").refreshDatabase()

            //rename channel (and give error when crashed)
            const pinEmoji = ticket.get("opendiscord:pinned").value ? generalConfig.data.system.pinEmoji : ""
            const priorityEmoji = opendiscord.priorities.getFromPriorityLevel(ticket.get("opendiscord:priority").value).channelEmoji ?? ""
            
            if (!channel.isThread()){
                const originalName = channel.name
                const newName = pinEmoji+priorityEmoji+utilities.trimEmojis(channelPrefix+channelSuffix)
                try{
                    await utilities.timedAwait(channel.setName(newName),2500,(err) => {
                        opendiscord.log("Failed to rename channel on ticket move","error")
                    })
                }catch(err){
                    await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error-channel-rename").build("ticket-move",{guild,channel,user,originalName,newName:newName})).message)
                }
            }

            //update ticket message
            const ticketMessage = await opendiscord.tickets.getTicketMessage(ticket)
            if (ticketMessage){
                try{
                    ticketMessage.edit((await opendiscord.builders.messages.getSafe("opendiscord:ticket-message").build("other",{guild,channel,user,ticket})).message)
                }catch(e){
                    opendiscord.log("Unable to edit ticket message on ticket moving!","error",[
                        {key:"channel",value:"#"+channel.name},
                        {key:"channelid",value:channel.id,hidden:true},
                        {key:"messageid",value:ticketMessage.id},
                        {key:"option",value:ticket.option.id.value}
                    ])
                    opendiscord.debugfile.writeErrorMessage(new api.ODError(e,"uncaughtException"))
                }
            }

            //reply with new message
            if (params.sendMessage) await channel.send((await opendiscord.builders.messages.getSafe("opendiscord:move-message").build(source,{guild,channel,user,ticket,reason,data})).message)
            ticket.get("opendiscord:busy").value = false
            await opendiscord.events.get("afterTicketMoved").emit([ticket,user,channel,reason])

            //update channel topic
            await opendiscord.actions.get("opendiscord:update-ticket-topic").run("ticket-action",{guild,channel,user,ticket,sendMessage:false,newTopic:null})
        }),
        new api.ODWorker("opendiscord:discord-logs",1,async (instance,params,source,cancel) => {
            const {guild,channel,user,ticket,reason,data} = params

            //to logs
            if (generalConfig.data.system.logs.enabled && generalConfig.data.system.messages.moving.logs){
                const logChannel = opendiscord.posts.get("opendiscord:logs")
                if (logChannel) logChannel.send(await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-logs").build(source,{guild,channel,user,ticket,mode:"move",reason,additionalData:data}))
            }

            //to dm
            const creator = await opendiscord.tickets.getTicketUser(ticket,"creator")
            if (creator && generalConfig.data.system.messages.moving.dm) await opendiscord.client.sendUserDm(creator,await opendiscord.builders.messages.getSafe("opendiscord:ticket-action-dm").build(source,{guild,channel,user,ticket,mode:"move",reason,additionalData:data}))
        }),
        new api.ODWorker("opendiscord:logs",0,(instance,params,source,cancel) => {
            const {guild,channel,user,ticket} = params

            opendiscord.log(user.displayName+" moved a ticket!","info",[
                {key:"user",value:user.username},
                {key:"userid",value:user.id,hidden:true},
                {key:"channel",value:"#"+channel.name},
                {key:"channelid",value:channel.id,hidden:true},
                {key:"reason",value:params.reason ?? "/"},
                {key:"method",value:source}
            ])
        })
    ])
    opendiscord.actions.get("opendiscord:move-ticket").workers.backupWorker = new api.ODWorker("opendiscord:cancel-busy",0,(instance,params) => {
        //set busy to false in case of crash or cancel
        params.ticket.get("opendiscord:busy").value = false
    })
}
