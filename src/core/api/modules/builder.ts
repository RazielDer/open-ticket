///////////////////////////////////////
//BUILDER MODULE
///////////////////////////////////////
import { ODId, ODValidButtonColor, ODValidId, ODSystemError, ODInterfaceWithPartialProperty, ODManagerWithSafety, ODManagerData } from "./base"
import * as discord from "discord.js"
import { ODWorkerManager, ODWorkerCallback, ODWorker } from "./worker"
import { ODDebugger } from "./console"

function messageFlagsIncludeComponentsV2(flags: unknown): boolean {
    const componentsV2Flag = (discord.MessageFlags as unknown as Record<string, number>).IsComponentsV2
    if (typeof componentsV2Flag != "number") return false
    if (Array.isArray(flags)) return flags.includes(componentsV2Flag) || flags.includes("IsComponentsV2")
    if (typeof flags == "number") return (flags & componentsV2Flag) != 0
    if (typeof flags == "string") return flags == "IsComponentsV2"
    return false
}

function pruneComponentsV2CreatePayload(message: discord.MessageCreateOptions): void {
    const rawMessage = message as Record<string, unknown>
    if (!messageFlagsIncludeComponentsV2(rawMessage.flags)) return
    delete rawMessage.content
    delete rawMessage.embeds
    delete rawMessage.poll
    delete rawMessage.files
    delete rawMessage.attachments
    delete rawMessage.stickers
    delete rawMessage.sticker_ids
    delete rawMessage.shared_client_theme
}

/**## ODBuilderImplementation `class`
 * This is an Open Ticket builder implementation.
 * 
 * It is a basic implementation of the `ODWorkerManager` used by all `ODBuilder` classes.
 * 
 * This class can't be used stand-alone & needs to be extended from!
 */
export class ODBuilderImplementation<Instance,Source extends string,Params,BuildType extends {id:ODId}> extends ODManagerData {
    /**The manager that has all workers of this implementation */
    workers: ODWorkerManager<Instance,Source,Params>
    /**Cache a build or create it every time from scratch when this.build() gets executed. */
    allowCache: boolean = false
    /**Did the build already got created/cached? */
    didCache: boolean = false
    /**The cache of this build. */
    cache:BuildType|null = null

    constructor(id:ODValidId, callback?:ODWorkerCallback<Instance,Source,Params>, priority?:number, callbackId?:ODValidId){
        super(id)
        this.workers = new ODWorkerManager("ascending")
        if (callback) this.workers.add(new ODWorker(callbackId ? callbackId : id,priority ?? 0,callback))
    }

    /**Set if caching is allowed */
    setCacheMode(allowed:boolean){
        this.allowCache = allowed
        this.resetCache()
        return this
    }
    /**Reset the current cache */
    resetCache(){
        this.cache = null
        this.didCache = false
        return this
    }
    /**Execute all workers & return the result. */
    async build(source:Source, params:Params): Promise<BuildType> {
        throw new ODSystemError("Tried to build an unimplemented ODBuilderImplementation")
    }
}

/**## ODBuilderManager `class`
 * This is an Open Ticket builder manager.
 * 
 * It contains all Open Ticket builders. You can find messages, embeds, files & dropdowns, buttons & modals all here!
 * 
 * Using the Open Ticket builder system has a few advantages compared to vanilla discord.js:
 * - plugins can extend/edit messages
 * - automatically reply on error
 * - independent workers (with priority)
 * - fail-safe design using try-catch
 * - cache frequently used objects
 * - get to know the source of the build request for a specific message, button, etc
 * - And so much more!
 */
export class ODBuilderManager {
    /**The manager for all button builders */
    buttons: ODButtonManager
    /**The manager for all dropdown builders */
    dropdowns: ODDropdownManager
    /**The manager for all file/attachment builders */
    files: ODFileManager
    /**The manager for all embed builders */
    embeds: ODEmbedManager
    /**The manager for all message builders */
    messages: ODMessageManager
    /**The manager for all modal builders */
    modals: ODModalManager

    constructor(debug:ODDebugger){
        this.buttons = new ODButtonManager(debug)
        this.dropdowns = new ODDropdownManager(debug)
        this.files = new ODFileManager(debug)
        this.embeds = new ODEmbedManager(debug)
        this.messages = new ODMessageManager(debug)
        this.modals = new ODModalManager(debug)
    }
}

/**## ODComponentBuildResult `interface`
 * This interface contains the result from a built component (button/dropdown). This can be used in the `ODMessage` builder!
 */
export interface ODComponentBuildResult {
    /**The id of this component (button or dropdown) */
    id:ODId,
    /**The discord component or `\n` when it is a spacer between action rows */
    component:discord.MessageActionRowComponentBuilder|"\n"|null
}

/**## ODButtonManager `class`
 * This is an Open Ticket button manager.
 * 
 * It contains all Open Ticket button builders. Here, you can add your own buttons or edit existing ones!
 * 
 * It's recommended to use this system in combination with all the other Open Ticket builders!
 */
export class ODButtonManager extends ODManagerWithSafety<ODButton<string,any>> {
    constructor(debug:ODDebugger){
        super(() => {
            return new ODButton("opendiscord:unknown-button",(instance,params,source,cancel) => {
                instance.setCustomId("od:unknown-button")
                instance.setMode("button")
                instance.setColor("red")
                instance.setLabel("<ODError:Unknown Button>")
                instance.setEmoji("✖")
                instance.setDisabled(true)
                cancel()
            })
        },debug,"button")
    }

    /**Get a newline component for buttons & dropdowns! */
    getNewLine(id:ODValidId): ODComponentBuildResult {
        return {
            id:new ODId(id),
            component:"\n"
        }
    }
}

/**## ODButtonData `interface`
 * This interface contains the data to build a button.
 */
export interface ODButtonData {
    /**The custom id of this button */
    customId:string,
    /**The mode of this button */
    mode:"button"|"url",
    /**The url for when the mode is set to "url" */
    url:string|null,
    /**The button color */
    color:ODValidButtonColor|null,
    /**The button label */
    label:string|null,
    /**The button emoji */
    emoji:string|null,
    /**Is the button disabled? */
    disabled:boolean
}

/**## ODButtonInstance `class`
 * This is an Open Ticket button instance.
 * 
 * It contains all properties & functions to build a button!
 */
export class ODButtonInstance {
    /**The current data of this button */
    data: ODButtonData = {
        customId:"",
        mode:"button",
        url:null,
        color:null,
        label:null,
        emoji:null,
        disabled:false
    }

    /**Set the custom id of this button */
    setCustomId(id:ODButtonData["customId"]){
        this.data.customId = id
        return this
    }
    /**Set the mode of this button */
    setMode(mode:ODButtonData["mode"]){
        this.data.mode = mode
        return this
    }
    /**Set the url of this button */
    setUrl(url:ODButtonData["url"]){
        this.data.url = url
        return this
    }
    /**Set the color of this button */
    setColor(color:ODButtonData["color"]){
        this.data.color = color
        return this
    }
    /**Set the label of this button */
    setLabel(label:ODButtonData["label"]){
        this.data.label = label
        return this
    }
    /**Set the emoji of this button */
    setEmoji(emoji:ODButtonData["emoji"]){
        this.data.emoji = emoji
        return this
    }
    /**Disable this button */
    setDisabled(disabled:ODButtonData["disabled"]){
        this.data.disabled = disabled
        return this
    }
}

/**## ODButton `class`
 * This is an Open Ticket button builder.
 * 
 * With this class, you can create a button to use in a message.
 * The only difference with normal buttons is that this one can be edited by Open Ticket plugins!
 * 
 * This is possible by using "workers" or multiple functions that will be executed in priority order!
 */
export class ODButton<Source extends string,Params> extends ODBuilderImplementation<ODButtonInstance,Source,Params,ODComponentBuildResult> {
    /**Build this button & compile it for discord.js */
    async build(source:Source, params:Params): Promise<ODComponentBuildResult> {
        if (this.didCache && this.cache && this.allowCache) return this.cache
        
        try {
            //create instance
            const instance = new ODButtonInstance()

            //wait for workers to finish
            await this.workers.executeWorkers(instance,source,params)

            //create the discord.js button
            const button = new discord.ButtonBuilder()
            if (instance.data.mode == "button") button.setCustomId(instance.data.customId)
            if (instance.data.mode == "url") button.setStyle(discord.ButtonStyle.Link)
            else if (instance.data.color == "gray") button.setStyle(discord.ButtonStyle.Secondary)
            else if (instance.data.color == "blue") button.setStyle(discord.ButtonStyle.Primary)
            else if (instance.data.color == "green") button.setStyle(discord.ButtonStyle.Success)
            else if (instance.data.color == "red") button.setStyle(discord.ButtonStyle.Danger)
            if (instance.data.url) button.setURL(instance.data.url)
            if (instance.data.label) button.setLabel(instance.data.label)
            if (instance.data.emoji) button.setEmoji(instance.data.emoji)
            if (instance.data.disabled) button.setDisabled(instance.data.disabled)
            if (!instance.data.emoji && !instance.data.label) button.setLabel(instance.data.customId)

            this.cache = {id:this.id,component:button}
            this.didCache = true
            return {id:this.id,component:button}
        }catch(err){
            process.emit("uncaughtException",new ODSystemError("ODButton:build(\""+this.id.value+"\") => Major Error (see next error)"))
            process.emit("uncaughtException",err)
            return {id:this.id,component:null}
        }
    }
}

/**## ODQuickButton `class`
 * This is an Open Ticket quick button builder.
 * 
 * With this class, you can quickly create a button to use in a message.
 * This quick button can be used by Open Ticket plugins instead of the normal builders to speed up the process!
 * 
 * Because of the quick functionality, these buttons are less customisable by other plugins.
 */
export class ODQuickButton {
    /**The id of this button. */
    id: ODId
    /**The current data of this button */
    data: Partial<ODButtonData>

    constructor(id:ODValidId,data:Partial<ODButtonData>){
        this.id = new ODId(id)
        this.data = data
    }

    /**Build this button & compile it for discord.js */
    async build(): Promise<ODComponentBuildResult> {
        try {
            //create the discord.js button
            const button = new discord.ButtonBuilder()
            if (this.data.mode == "button" || (!this.data.mode && this.data.customId)) button.setCustomId(this.data.customId ?? "od:unknown-button")
            if (this.data.mode == "url") button.setStyle(discord.ButtonStyle.Link)
            else if (this.data.color == "gray") button.setStyle(discord.ButtonStyle.Secondary)
            else if (this.data.color == "blue") button.setStyle(discord.ButtonStyle.Primary)
            else if (this.data.color == "green") button.setStyle(discord.ButtonStyle.Success)
            else if (this.data.color == "red") button.setStyle(discord.ButtonStyle.Danger)
            else button.setStyle(discord.ButtonStyle.Secondary)
            if (this.data.url) button.setURL(this.data.url)
            if (this.data.label) button.setLabel(this.data.label)
            if (this.data.emoji) button.setEmoji(this.data.emoji)
            if (this.data.disabled) button.setDisabled(this.data.disabled)
            if (!this.data.emoji && !this.data.label) button.setLabel(this.data.customId ?? "od:unknown-button")

            return {id:this.id,component:button}
        }catch(err){
            process.emit("uncaughtException",new ODSystemError("ODQuickButton:build(\""+this.id.value+"\") => Major Error (see next error)"))
            process.emit("uncaughtException",err)
            return {id:this.id,component:null}
        }
    }
}

/**## ODDropdownManager `class`
 * This is an Open Ticket dropdown manager.
 * 
 * It contains all Open Ticket dropdown builders. Here, you can add your own dropdowns or edit existing ones!
 * 
 * It's recommended to use this system in combination with all the other Open Ticket builders!
 */
export class ODDropdownManager extends ODManagerWithSafety<ODDropdown<string,any>> {
    constructor(debug:ODDebugger){
        super(() => {
            return new ODDropdown("opendiscord:unknown-dropdown",(instance,params,source,cancel) => {
                instance.setCustomId("od:unknown-dropdown")
                instance.setType("string")
                instance.setPlaceholder("❌ <ODError:Unknown Dropdown>")
                instance.setDisabled(true)
                instance.setOptions([
                    {emoji:"❌",label:"<ODError:Unknown Dropdown>",value:"error"}
                ])
                cancel()
            })
        },debug,"dropdown")
    }

    /**Get a newline component for buttons & dropdowns! */
    getNewLine(id:ODValidId): ODComponentBuildResult {
        return {
            id:new ODId(id),
            component:"\n"
        }
    }
}

/**## ODDropdownData `interface`
 * This interface contains the data to build a dropdown.
 */
export interface ODDropdownData {
    /**The custom id of this dropdown */
    customId:string,
    /**The type of this dropdown */
    type:"string"|"role"|"channel"|"user"|"mentionable",
    /**The placeholder of this dropdown */
    placeholder:string|null,
    /**The minimum amount of items to be selected in this dropdown */
    minValues:number|null,
    /**The maximum amount of items to be selected in this dropdown */
    maxValues:number|null,
    /**Is this dropdown disabled? */
    disabled:boolean,
    /**Allowed channel types when the type is "channel" */
    channelTypes:discord.ChannelType[]

    /**The options when the type is "string" */
    options:discord.SelectMenuComponentOptionData[],
    /**The options when the type is "user" */
    users:discord.User[],
    /**The options when the type is "role" */
    roles:discord.Role[],
    /**The options when the type is "channel" */
    channels:discord.Channel[],
    /**The options when the type is "mentionable" */
    mentionables:(discord.User|discord.Role)[],
}

/**## ODDropdownInstance `class`
 * This is an Open Ticket dropdown instance.
 * 
 * It contains all properties & functions to build a dropdown!
 */
export class ODDropdownInstance {
    /**The current data of this dropdown */
    data: ODDropdownData = {
        customId:"",
        type:"string",
        placeholder:null,
        minValues:null,
        maxValues:null,
        disabled:false,
        channelTypes:[],

        options:[],
        users:[],
        roles:[],
        channels:[],
        mentionables:[]
    }

    /**Set the custom id of this dropdown */
    setCustomId(id:ODDropdownData["customId"]){
        this.data.customId = id
        return this
    }
    /**Set the type of this dropdown */
    setType(type:ODDropdownData["type"]){
        this.data.type = type
        return this
    }
    /**Set the placeholder of this dropdown */
    setPlaceholder(placeholder:ODDropdownData["placeholder"]){
        this.data.placeholder = placeholder
        return this
    }
    /**Set the minimum amount of values in this dropdown */
    setMinValues(minValues:ODDropdownData["minValues"]){
        this.data.minValues = minValues
        return this
    }
    /**Set the maximum amount of values ax this dropdown */
    setMaxValues(maxValues:ODDropdownData["maxValues"]){
        this.data.maxValues = maxValues
        return this
    }
    /**Set the disabled of this dropdown */
    setDisabled(disabled:ODDropdownData["disabled"]){
        this.data.disabled = disabled
        return this
    }
    /**Set the channel types of this dropdown */
    setChannelTypes(channelTypes:ODDropdownData["channelTypes"]){
        this.data.channelTypes = channelTypes
        return this
    }
    /**Set the options of this dropdown (when `type == "string"`) */
    setOptions(options:ODDropdownData["options"]){
        this.data.options = options
        return this
    }
    /**Set the users of this dropdown (when `type == "user"`) */
    setUsers(users:ODDropdownData["users"]){
        this.data.users = users
        return this
    }
    /**Set the roles of this dropdown (when `type == "role"`) */
    setRoles(roles:ODDropdownData["roles"]){
        this.data.roles = roles
        return this
    }
    /**Set the channels of this dropdown (when `type == "channel"`) */
    setChannels(channels:ODDropdownData["channels"]){
        this.data.channels = channels
        return this
    }
    /**Set the mentionables of this dropdown (when `type == "mentionable"`) */
    setMentionables(mentionables:ODDropdownData["mentionables"]){
        this.data.mentionables = mentionables
        return this
    }
}

/**## ODDropdown `class`
 * This is an Open Ticket dropdown builder.
 * 
 * With this class, you can create a dropdown to use in a message.
 * The only difference with normal dropdowns is that this one can be edited by Open Ticket plugins!
 * 
 * This is possible by using "workers" or multiple functions that will be executed in priority order!
 */
export class ODDropdown<Source extends string,Params> extends ODBuilderImplementation<ODDropdownInstance,Source,Params,ODComponentBuildResult> {
    /**Build this dropdown & compile it for discord.js */
    async build(source:Source, params:Params): Promise<ODComponentBuildResult> {
        if (this.didCache && this.cache && this.allowCache) return this.cache
        
        try{
            //create instance
            const instance = new ODDropdownInstance()

            //wait for workers to finish
            await this.workers.executeWorkers(instance,source,params)

            //create the discord.js dropdown
            if (instance.data.type == "string"){
                const dropdown = new discord.StringSelectMenuBuilder()
                dropdown.setCustomId(instance.data.customId)
                dropdown.setOptions(...instance.data.options)
                if (instance.data.placeholder) dropdown.setPlaceholder(instance.data.placeholder)
                if (instance.data.minValues) dropdown.setMinValues(instance.data.minValues)
                if (instance.data.maxValues) dropdown.setMaxValues(instance.data.maxValues)
                if (instance.data.disabled) dropdown.setDisabled(instance.data.disabled)
                
                this.cache = {id:this.id,component:dropdown}
                this.didCache = true
                return {id:this.id,component:dropdown}

            }else if (instance.data.type == "user"){
                const dropdown = new discord.UserSelectMenuBuilder()
                dropdown.setCustomId(instance.data.customId)
                if (instance.data.users.length > 0) dropdown.setDefaultUsers(...instance.data.users.map((u) => u.id))
                if (instance.data.placeholder) dropdown.setPlaceholder(instance.data.placeholder)
                if (instance.data.minValues) dropdown.setMinValues(instance.data.minValues)
                if (instance.data.maxValues) dropdown.setMaxValues(instance.data.maxValues)
                if (instance.data.disabled) dropdown.setDisabled(instance.data.disabled)
                
                this.cache = {id:this.id,component:dropdown}
                this.didCache = true
                return {id:this.id,component:dropdown}

            }else if (instance.data.type == "role"){
                const dropdown = new discord.RoleSelectMenuBuilder()
                dropdown.setCustomId(instance.data.customId)
                if (instance.data.roles.length > 0) dropdown.setDefaultRoles(...instance.data.roles.map((r) => r.id))
                if (instance.data.placeholder) dropdown.setPlaceholder(instance.data.placeholder)
                if (instance.data.minValues) dropdown.setMinValues(instance.data.minValues)
                if (instance.data.maxValues) dropdown.setMaxValues(instance.data.maxValues)
                if (instance.data.disabled) dropdown.setDisabled(instance.data.disabled)
                
                this.cache = {id:this.id,component:dropdown}
                this.didCache = true
                return {id:this.id,component:dropdown}

            }else if (instance.data.type == "channel"){
                const dropdown = new discord.ChannelSelectMenuBuilder()
                dropdown.setCustomId(instance.data.customId)
                if (instance.data.channels.length > 0) dropdown.setDefaultChannels(...instance.data.channels.map((c) => c.id))
                if (instance.data.placeholder) dropdown.setPlaceholder(instance.data.placeholder)
                if (instance.data.minValues) dropdown.setMinValues(instance.data.minValues)
                if (instance.data.maxValues) dropdown.setMaxValues(instance.data.maxValues)
                if (instance.data.disabled) dropdown.setDisabled(instance.data.disabled)
                
                this.cache = {id:this.id,component:dropdown}
                this.didCache = true
                return {id:this.id,component:dropdown}

            }else if (instance.data.type == "mentionable"){
                const dropdown = new discord.MentionableSelectMenuBuilder()

                const values: ({type:discord.SelectMenuDefaultValueType.User,id:string}|{type:discord.SelectMenuDefaultValueType.Role,id:string})[] = []
                instance.data.mentionables.forEach((m) => {
                    if (m instanceof discord.User){
                        values.push({type:discord.SelectMenuDefaultValueType.User,id:m.id})
                    }else{
                        values.push({type:discord.SelectMenuDefaultValueType.Role,id:m.id})
                    }
                })

                dropdown.setCustomId(instance.data.customId)
                if (instance.data.mentionables.length > 0) dropdown.setDefaultValues(...values)
                if (instance.data.placeholder) dropdown.setPlaceholder(instance.data.placeholder)
                if (instance.data.minValues) dropdown.setMinValues(instance.data.minValues)
                if (instance.data.maxValues) dropdown.setMaxValues(instance.data.maxValues)
                if (instance.data.disabled) dropdown.setDisabled(instance.data.disabled)
                
                this.cache = {id:this.id,component:dropdown}
                this.didCache = true
                return {id:this.id,component:dropdown}
            }else{
                throw new Error("Tried to build an ODDropdown with unknown type!")
            }
        }catch(err){
            process.emit("uncaughtException",new ODSystemError("ODDropdown:build(\""+this.id.value+"\") => Major Error (see next error)"))
            process.emit("uncaughtException",err)
            return {id:this.id,component:null}
        }
    }
}

/**## ODQuickDropdown `class`
 * This is an Open Ticket quick dropdown builder.
 * 
 * With this class, you can quickly create a dropdown to use in a message.
 * This quick dropdown can be used by Open Ticket plugins instead of the normal builders to speed up the process!
 * 
 * Because of the quick functionality, these dropdowns are less customisable by other plugins.
 */
export class ODQuickDropdown {
    /**The id of this dropdown. */
    id: ODId
    /**The current data of this dropdown */
    data: Partial<ODDropdownData>

    constructor(id:ODValidId,data:Partial<ODDropdownData>){
        this.id = new ODId(id)
        this.data = data
    }

    /**Build this dropdown & compile it for discord.js */
    async build(): Promise<ODComponentBuildResult> {
        try{
            //create the discord.js dropdown
            if (this.data.type == "string"){
                if (!this.data.options) throw new ODSystemError("ODQuickDropdown:build(): "+this.id.value+" => Dropdown requires at least 1 option to be present.")
                const dropdown = new discord.StringSelectMenuBuilder()
                dropdown.setCustomId(this.data.customId ?? "od:unknown-dropdown")
                dropdown.setOptions(...this.data.options)
                if (this.data.placeholder) dropdown.setPlaceholder(this.data.placeholder)
                if (this.data.minValues) dropdown.setMinValues(this.data.minValues)
                if (this.data.maxValues) dropdown.setMaxValues(this.data.maxValues)
                if (this.data.disabled) dropdown.setDisabled(this.data.disabled)
                
                return {id:this.id,component:dropdown}

            }else if (this.data.type == "user"){
                if (!this.data.users) throw new ODSystemError("ODQuickDropdown:build(): "+this.id.value+" => Dropdown requires at least 1 user option to be present.")
                const dropdown = new discord.UserSelectMenuBuilder()
                dropdown.setCustomId(this.data.customId ?? "od:unknown-dropdown")
                if (this.data.users.length > 0) dropdown.setDefaultUsers(...this.data.users.map((u) => u.id))
                if (this.data.placeholder) dropdown.setPlaceholder(this.data.placeholder)
                if (this.data.minValues) dropdown.setMinValues(this.data.minValues)
                if (this.data.maxValues) dropdown.setMaxValues(this.data.maxValues)
                if (this.data.disabled) dropdown.setDisabled(this.data.disabled)
                
                return {id:this.id,component:dropdown}

            }else if (this.data.type == "role"){
                if (!this.data.roles) throw new ODSystemError("ODQuickDropdown:build(): "+this.id.value+" => Dropdown requires at least 1 role option to be present.")
                const dropdown = new discord.RoleSelectMenuBuilder()
                dropdown.setCustomId(this.data.customId ?? "od:unknown-dropdown")
                if (this.data.roles.length > 0) dropdown.setDefaultRoles(...this.data.roles.map((r) => r.id))
                if (this.data.placeholder) dropdown.setPlaceholder(this.data.placeholder)
                if (this.data.minValues) dropdown.setMinValues(this.data.minValues)
                if (this.data.maxValues) dropdown.setMaxValues(this.data.maxValues)
                if (this.data.disabled) dropdown.setDisabled(this.data.disabled)
                
                return {id:this.id,component:dropdown}

            }else if (this.data.type == "channel"){
                if (!this.data.channels) throw new ODSystemError("ODQuickDropdown:build(): "+this.id.value+" => Dropdown requires at least 1 channel option to be present.")
                const dropdown = new discord.ChannelSelectMenuBuilder()
                dropdown.setCustomId(this.data.customId ?? "od:unknown-dropdown")
                if (this.data.channels.length > 0) dropdown.setDefaultChannels(...this.data.channels.map((c) => c.id))
                if (this.data.placeholder) dropdown.setPlaceholder(this.data.placeholder)
                if (this.data.minValues) dropdown.setMinValues(this.data.minValues)
                if (this.data.maxValues) dropdown.setMaxValues(this.data.maxValues)
                if (this.data.disabled) dropdown.setDisabled(this.data.disabled)
                
                return {id:this.id,component:dropdown}

            }else if (this.data.type == "mentionable"){
                if (!this.data.mentionables) throw new ODSystemError("ODQuickDropdown:build(): "+this.id.value+" => Dropdown requires at least 1 mentionable option to be present.")
                const dropdown = new discord.MentionableSelectMenuBuilder()

                const values: ({type:discord.SelectMenuDefaultValueType.User,id:string}|{type:discord.SelectMenuDefaultValueType.Role,id:string})[] = []
                this.data.mentionables.forEach((m) => {
                    if (m instanceof discord.User){
                        values.push({type:discord.SelectMenuDefaultValueType.User,id:m.id})
                    }else{
                        values.push({type:discord.SelectMenuDefaultValueType.Role,id:m.id})
                    }
                })

                dropdown.setCustomId(this.data.customId ?? "od:unknown-dropdown")
                if (this.data.mentionables.length > 0) dropdown.setDefaultValues(...values)
                if (this.data.placeholder) dropdown.setPlaceholder(this.data.placeholder)
                if (this.data.minValues) dropdown.setMinValues(this.data.minValues)
                if (this.data.maxValues) dropdown.setMaxValues(this.data.maxValues)
                if (this.data.disabled) dropdown.setDisabled(this.data.disabled)
                
                return {id:this.id,component:dropdown}
            }else{
                throw new Error("Tried to build an ODQuickDropdown with unknown type!")
            }
        }catch(err){
            process.emit("uncaughtException",new ODSystemError("ODQuickDropdown:build(\""+this.id.value+"\") => Major Error (see next error)"))
            process.emit("uncaughtException",err)
            return {id:this.id,component:null}
        }
    }
}

/**## ODFileManager `class`
 * This is an Open Ticket file manager.
 * 
 * It contains all Open Ticket file builders. Here, you can add your own files or edit existing ones!
 * 
 * It's recommended to use this system in combination with all the other Open Ticket builders!
 */
export class ODFileManager extends ODManagerWithSafety<ODFile<string,any>> {
    constructor(debug:ODDebugger){
        super(() => {
            return new ODFile("opendiscord:unknown-file",(instance,params,source,cancel) => {
                instance.setName("openticket_unknown-file.txt")
                instance.setDescription("❌ <ODError:Unknown File>")
                instance.setContents("Couldn't find file in registery `opendiscord.builders.files`")
                cancel()
            })
        },debug,"file")
    }
}

/**## ODFileData `interface`
 * This interface contains the data to build a file.
 */
export interface ODFileData {
    /**The file buffer, string or raw data */
    file:discord.BufferResolvable
    /**The name of the file */
    name:string,
    /**The description of the file */
    description:string|null,
    /**Set the file to be a spoiler */
    spoiler:boolean
}

/**## ODFileBuildResult `interface`
 * This interface contains the result from a built file (attachment). This can be used in the `ODMessage` builder!
 */
export interface ODFileBuildResult {
    /**The id of this file */
    id:ODId,
    /**The discord file */
    file:discord.AttachmentBuilder|null
}

/**## ODFileInstance `class`
 * This is an Open Ticket file instance.
 * 
 * It contains all properties & functions to build a file!
 */
export class ODFileInstance {
    /**The current data of this file */
    data: ODFileData = {
        file:"",
        name:"file.txt",
        description:null,
        spoiler:false
    }

    /**Set the file path of this attachment */
    setFile(file:string){
        this.data.file = file
        return this
    }
    /**Set the file contents of this attachment */
    setContents(contents:string|Buffer){
        this.data.file = (typeof contents == "string") ? Buffer.from(contents) : contents
        return this
    }
    /**Set the name of this attachment */
    setName(name:ODFileData["name"]){
        this.data.name = name
        return this
    }
    /**Set the description of this attachment */
    setDescription(description:ODFileData["description"]){
        this.data.description = description
        return this
    }
    /**Set this attachment to show as a spoiler */
    setSpoiler(spoiler:ODFileData["spoiler"]){
        this.data.spoiler = spoiler
        return this
    }
}

/**## ODFile `class`
 * This is an Open Ticket file builder.
 * 
 * With this class, you can create a file to use in a message.
 * The only difference with normal files is that this one can be edited by Open Ticket plugins!
 * 
 * This is possible by using "workers" or multiple functions that will be executed in priority order!
 */
export class ODFile<Source extends string,Params> extends ODBuilderImplementation<ODFileInstance,Source,Params,ODFileBuildResult> {
    /**Build this attachment & compile it for discord.js */
    async build(source:Source, params:Params): Promise<ODFileBuildResult> {
        if (this.didCache && this.cache && this.allowCache) return this.cache
        
        try{
            //create instance
            const instance = new ODFileInstance()

            //wait for workers to finish
            await this.workers.executeWorkers(instance,source,params)

            //create the discord.js attachment
            const file = new discord.AttachmentBuilder(instance.data.file)
            file.setName(instance.data.name ? instance.data.name : "file.txt")
            if (instance.data.description) file.setDescription(instance.data.description)
            if (instance.data.spoiler) file.setSpoiler(instance.data.spoiler)
            

            this.cache = {id:this.id,file}
            this.didCache = true
            return {id:this.id,file}
        }catch(err){
            process.emit("uncaughtException",new ODSystemError("ODFile:build(\""+this.id.value+"\") => Major Error (see next error)"))
            process.emit("uncaughtException",err)
            return {id:this.id,file:null}
        }
    }
}

/**## ODQuickFile `class`
 * This is an Open Ticket quick file builder.
 * 
 * With this class, you can quickly create a file to use in a message.
 * This quick file can be used by Open Ticket plugins instead of the normal builders to speed up the process!
 * 
 * Because of the quick functionality, these files are less customisable by other plugins.
 */
export class ODQuickFile {
    /**The id of this file. */
    id: ODId
    /**The current data of this file */
    data: Partial<ODFileData>

    constructor(id:ODValidId,data:Partial<ODFileData>){
        this.id = new ODId(id)
        this.data = data
    }

    /**Build this attachment & compile it for discord.js */
    async build(): Promise<ODFileBuildResult> {
        try{
            //create the discord.js attachment
            const file = new discord.AttachmentBuilder(this.data.file ?? "<empty-file>")
            file.setName(this.data.name ? this.data.name : "file.txt")
            if (this.data.description) file.setDescription(this.data.description)
            if (this.data.spoiler) file.setSpoiler(this.data.spoiler)
            
            return {id:this.id,file}
        }catch(err){
            process.emit("uncaughtException",new ODSystemError("ODQuickFile:build(\""+this.id.value+"\") => Major Error (see next error)"))
            process.emit("uncaughtException",err)
            return {id:this.id,file:null}
        }
    }
}

/**## ODEmbedManager `class`
 * This is an Open Ticket embed manager.
 * 
 * It contains all Open Ticket embed builders. Here, you can add your own embeds or edit existing ones!
 * 
 * It's recommended to use this system in combination with all the other Open Ticket builders!
 */
export class ODEmbedManager extends ODManagerWithSafety<ODEmbed<string,any>> {
    constructor(debug:ODDebugger){
        super(() => {
            return new ODEmbed("opendiscord:unknown-embed",(instance,params,source,cancel) => {
                instance.setFooter("opendiscord:unknown-embed")
                instance.setColor("#ff0000")
                instance.setTitle("❌ <ODError:Unknown Embed>")
                instance.setDescription("Couldn't find embed in registery `opendiscord.builders.embeds`")
                cancel()
            })
        },debug,"embed")
    }
}

/**## ODEmbedData `interface`
 * This interface contains the data to build an embed.
 */
export interface ODEmbedData {
    /**The title of the embed */
    title:string|null,
    /**The color of the embed */
    color:discord.ColorResolvable|string|null,
    /**The url of the embed */
    url:string|null,
    /**The description of the embed */
    description:string|null,
    /**The author text of the embed */
    authorText:string|null,
    /**The author image of the embed */
    authorImage:string|null,
    /**The author url of the embed */
    authorUrl:string|null,
    /**The footer text of the embed */
    footerText:string|null,
    /**The footer image of the embed */
    footerImage:string|null,
    /**The image of the embed */
    image:string|null,
    /**The thumbnail of the embed */
    thumbnail:string|null,
    /**The fields of the embed */
    fields:ODInterfaceWithPartialProperty<discord.EmbedField,"inline">[],
    /**The timestamp of the embed */
    timestamp:number|Date|null
}

/**## ODEmbedBuildResult `interface`
 * This interface contains the result from a built embed. This can be used in the `ODMessage` builder!
 */
export interface ODEmbedBuildResult {
    /**The id of this embed */
    id:ODId,
    /**The discord embed */
    embed:discord.EmbedBuilder|null
}

/**## ODEmbedInstance `class`
 * This is an Open Ticket embed instance.
 * 
 * It contains all properties & functions to build an embed!
 */
export class ODEmbedInstance {
    /**The current data of this embed */
    data: ODEmbedData = {
        title:null,
        color:null,
        url:null,
        description:null,
        authorText:null,
        authorImage:null,
        authorUrl:null,
        footerText:null,
        footerImage:null,
        image:null,
        thumbnail:null,
        fields:[],
        timestamp:null
    }

    /**Set the title of this embed */
    setTitle(title:ODEmbedData["title"]){
        this.data.title = title
        return this
    }
    /**Set the color of this embed */
    setColor(color:ODEmbedData["color"]){
        this.data.color = color
        return this
    }
    /**Set the url of this embed */
    setUrl(url:ODEmbedData["url"]){
        this.data.url = url
        return this
    }
    /**Set the description of this embed */
    setDescription(description:ODEmbedData["description"]){
        this.data.description = description
        return this
    }
    /**Set the author of this embed */
    setAuthor(text:ODEmbedData["authorText"], image?:ODEmbedData["authorImage"], url?:ODEmbedData["authorUrl"]){
        this.data.authorText = text
        this.data.authorImage = image ?? null
        this.data.authorUrl = url ?? null
        return this
    }
    /**Set the footer of this embed */
    setFooter(text:ODEmbedData["footerText"], image?:ODEmbedData["footerImage"]){
        this.data.footerText = text
        this.data.footerImage = image ?? null
        return this
    }
    /**Set the image of this embed */
    setImage(image:ODEmbedData["image"]){
        this.data.image = image
        return this
    }
    /**Set the thumbnail of this embed */
    setThumbnail(thumbnail:ODEmbedData["thumbnail"]){
        this.data.thumbnail = thumbnail
        return this
    }
    /**Set the fields of this embed */
    setFields(fields:ODEmbedData["fields"]){
        //TEMP CHECKS
        fields.forEach((field,index) => {
            if (field.value.length >= 1024) throw new ODSystemError("ODEmbed:setFields() => field "+index+" reached 1024 character limit!")
            if (field.name.length >= 256) throw new ODSystemError("ODEmbed:setFields() => field "+index+" reached 256 name character limit!")
        })

        this.data.fields = fields
        return this
    }
    /**Add fields to this embed */
    addFields(...fields:ODEmbedData["fields"]){
        //TEMP CHECKS
        fields.forEach((field,index) => {
            if (field.value.length >= 1024) throw new ODSystemError("ODEmbed:addFields() => field "+index+" reached 1024 character limit!")
            if (field.name.length >= 256) throw new ODSystemError("ODEmbed:addFields() => field "+index+" reached 256 name character limit!")
        })

        this.data.fields.push(...fields)
        return this
    }
    /**Clear all fields from this embed */
    clearFields(){
        this.data.fields = []
        return this
    }
    /**Set the timestamp of this embed */
    setTimestamp(timestamp:ODEmbedData["timestamp"]){
        this.data.timestamp = timestamp
        return this
    }
}

/**## ODEmbed `class`
 * This is an Open Ticket embed builder.
 * 
 * With this class, you can create a embed to use in a message.
 * The only difference with normal embeds is that this one can be edited by Open Ticket plugins!
 * 
 * This is possible by using "workers" or multiple functions that will be executed in priority order!
 */
export class ODEmbed<Source extends string,Params> extends ODBuilderImplementation<ODEmbedInstance,Source,Params,ODEmbedBuildResult> {
    /**Build this embed & compile it for discord.js */
    async build(source:Source, params:Params): Promise<ODEmbedBuildResult> {
        if (this.didCache && this.cache && this.allowCache) return this.cache
        
        try{
            //create instance
            const instance = new ODEmbedInstance()

            //wait for workers to finish
            await this.workers.executeWorkers(instance,source,params)

            //create the discord.js embed
            const embed = new discord.EmbedBuilder()
            if (instance.data.title) embed.setTitle(instance.data.title)
            if (instance.data.color) embed.setColor(instance.data.color as discord.ColorResolvable)
            if (instance.data.url) embed.setURL(instance.data.url)
            if (instance.data.description) embed.setDescription(instance.data.description)
            if (instance.data.authorText) embed.setAuthor({
                name:instance.data.authorText,
                iconURL:instance.data.authorImage ?? undefined,
                url:instance.data.authorUrl ?? undefined
            })
            if (instance.data.footerText) embed.setFooter({
                text:instance.data.footerText,
                iconURL:instance.data.footerImage ?? undefined,
            })
            if (instance.data.image) embed.setImage(instance.data.image)
            if (instance.data.thumbnail) embed.setThumbnail(instance.data.thumbnail)
            if (instance.data.timestamp) embed.setTimestamp(instance.data.timestamp)
            if (instance.data.fields.length > 0) embed.setFields(instance.data.fields)

            this.cache = {id:this.id,embed}
            this.didCache = true
            return {id:this.id,embed}
        }catch(err){
            process.emit("uncaughtException",new ODSystemError("ODEmbed:build(\""+this.id.value+"\") => Major Error (see next error)"))
            process.emit("uncaughtException",err)
            return {id:this.id,embed:null}
        }
    }
}

/**## ODQuickEmbed `class`
 * This is an Open Ticket quick embed builder.
 * 
 * With this class, you can quickly create a embed to use in a message.
 * This quick embed can be used by Open Ticket plugins instead of the normal builders to speed up the process!
 * 
 * Because of the quick functionality, these embeds are less customisable by other plugins.
 */
export class ODQuickEmbed {
    /**The id of this embed. */
    id: ODId
    /**The current data of this embed */
    data: Partial<ODEmbedData>

    constructor(id:ODValidId,data:Partial<ODEmbedData>){
        this.id = new ODId(id)
        this.data = data
    }

    /**Build this embed & compile it for discord.js */
    async build(): Promise<ODEmbedBuildResult> {
        try{
            //create the discord.js embed
            const embed = new discord.EmbedBuilder()
            if (this.data.title) embed.setTitle(this.data.title)
            if (this.data.color) embed.setColor(this.data.color as discord.ColorResolvable)
            if (this.data.url) embed.setURL(this.data.url)
            if (this.data.description) embed.setDescription(this.data.description)
            if (this.data.authorText) embed.setAuthor({
                name:this.data.authorText,
                iconURL:this.data.authorImage ?? undefined,
                url:this.data.authorUrl ?? undefined
            })
            if (this.data.footerText) embed.setFooter({
                text:this.data.footerText,
                iconURL:this.data.footerImage ?? undefined,
            })
            if (this.data.image) embed.setImage(this.data.image)
            if (this.data.thumbnail) embed.setThumbnail(this.data.thumbnail)
            if (this.data.timestamp) embed.setTimestamp(this.data.timestamp)
            if (this.data.fields && this.data.fields.length > 0) embed.setFields(this.data.fields)
            
            return {id:this.id,embed}
        }catch(err){
            process.emit("uncaughtException",new ODSystemError("ODQuickEmbed:build(\""+this.id.value+"\") => Major Error (see next error)"))
            process.emit("uncaughtException",err)
            return {id:this.id,embed:null}
        }
    }
}

/**## ODMessageManager `class`
 * This is an Open Ticket message manager.
 * 
 * It contains all Open Ticket message builders. Here, you can add your own messages or edit existing ones!
 * 
 * It's recommended to use this system in combination with all the other Open Ticket builders!
 */
export class ODMessageManager extends ODManagerWithSafety<ODMessage<string,any>> {
    constructor(debug:ODDebugger){
        super(() => {
            return new ODMessage("opendiscord:unknown-message",(instance,params,source,cancel) => {
                instance.setContent("**❌ <ODError:Unknown Message>**\nCouldn't find message in registery `opendiscord.builders.messages`")
                cancel()
            })
        },debug,"message")
    }
}

/**## ODMessageData `interface`
 * This interface contains the data to build a message.
 */
export interface ODMessageData {
    /**The content of this message. `null` when no content */
    content:string|null,
    /**Poll data for this message */
    poll:discord.PollData|null,
    /**Try to make this message ephemeral when available */
    ephemeral:boolean,

    /**Embeds from this message */
    embeds:ODEmbedBuildResult[],
    /**Components from this message */
    components:ODComponentBuildResult[],
    /**Files from this message */
    files:ODFileBuildResult[],

    /**Additional options that aren't covered by the Open Ticket api!*/
    additionalOptions:Omit<discord.MessageCreateOptions,"poll"|"content"|"embeds"|"components"|"files"|"flags">
}

/**## ODMessageBuildResult `interface`
 * This interface contains the result from a built message. This can be sent in a discord channel!
 */
export interface ODMessageBuildResult {
    /**The id of this message */
    id:ODId,
    /**The discord message */
    message:Omit<discord.MessageCreateOptions,"flags">,
    /**When enabled, the bot will try to send this as an ephemeral message */
    ephemeral:boolean
}

/**## ODMessageBuildSentResult `interface`
 * This interface contains the result from a sent built message. This can be used to edit, view & save the message that got created.
 */
export interface ODMessageBuildSentResult<InGuild extends boolean> {
    /**Did the message get sent successfully? */
    success:boolean,
    /**The message that got sent. */
    message:discord.Message<InGuild>|null
}

/**## ODMessageInstance `class`
 * This is an Open Ticket message instance.
 * 
 * It contains all properties & functions to build a message!
 */
export class ODMessageInstance {
    /**The current data of this message */
    data: ODMessageData = {
        content:null,
        poll:null,
        ephemeral:false,
        embeds:[],
        components:[],
        files:[],
        additionalOptions:{}
    }

    /**Set the content of this message */
    setContent(content:ODMessageData["content"]){
        this.data.content = content
        return this
    }
    /**Set the poll of this message */
    setPoll(poll:ODMessageData["poll"]){
        this.data.poll = poll
        return this
    }
    /**Make this message ephemeral when possible */
    setEphemeral(ephemeral:ODMessageData["ephemeral"]){
        this.data.ephemeral = ephemeral
        return this
    }
    /**Set the embeds of this message */
    setEmbeds(...embeds:ODEmbedBuildResult[]){
        this.data.embeds = embeds
        return this
    }
    /**Add an embed to this message! */
    addEmbed(embed:ODEmbedBuildResult){
        this.data.embeds.push(embed)
        return this
    }
    /**Remove an embed from this message */
    removeEmbed(id:ODValidId){
        const index = this.data.embeds.findIndex((embed) => embed.id.value === new ODId(id).value)
        if (index > -1) this.data.embeds.splice(index,1)
        return this
    }
    /**Get an embed from this message */
    getEmbed(id:ODValidId){
        const embed = this.data.embeds.find((embed) => embed.id.value === new ODId(id).value)
        if (embed) return embed.embed
        else return null
    }
    /**Set the components of this message */
    setComponents(...components:ODComponentBuildResult[]){
        this.data.components = components
        return this
    }
    /**Add a component to this message! */
    addComponent(component:ODComponentBuildResult){
        this.data.components.push(component)
        return this
    }
    /**Remove a component from this message */
    removeComponent(id:ODValidId){
        const index = this.data.components.findIndex((component) => component.id.value === new ODId(id).value)
        if (index > -1) this.data.components.splice(index,1)
        return this
    }
    /**Get a component from this message */
    getComponent(id:ODValidId){
        const component = this.data.components.find((component) => component.id.value === new ODId(id).value)
        if (component) return component.component
        else return null
    }
    /**Set the files of this message */
    setFiles(...files:ODFileBuildResult[]){
        this.data.files = files
        return this
    }
    /**Add a file to this message! */
    addFile(file:ODFileBuildResult){
        this.data.files.push(file)
        return this
    }
    /**Remove a file from this message */
    removeFile(id:ODValidId){
        const index = this.data.files.findIndex((file) => file.id.value === new ODId(id).value)
        if (index > -1) this.data.files.splice(index,1)
        return this
    }
    /**Get a file from this message */
    getFile(id:ODValidId){
        const file = this.data.files.find((file) => file.id.value === new ODId(id).value)
        if (file) return file.file
        else return null
    }
}

/**## ODMessage `class`
 * This is an Open Ticket message builder.
 * 
 * With this class, you can create a message to send in a discord channel.
 * The only difference with normal messages is that this one can be edited by Open Ticket plugins!
 * 
 * This is possible by using "workers" or multiple functions that will be executed in priority order!
 */
export class ODMessage<Source extends string,Params> extends ODBuilderImplementation<ODMessageInstance,Source,Params,ODMessageBuildResult> {
    /**Build this message & compile it for discord.js */
    async build(source:Source, params:Params){
        if (this.didCache && this.cache && this.allowCache) return this.cache
        
        //create instance
        const instance = new ODMessageInstance()

        //wait for workers to finish
        await this.workers.executeWorkers(instance,source,params)

        //create the discord.js message
        const componentArray: discord.ActionRowBuilder<discord.MessageActionRowComponentBuilder>[] = []
        let currentRow: discord.ActionRowBuilder<discord.MessageActionRowComponentBuilder> = new discord.ActionRowBuilder()
        instance.data.components.forEach((c) => {
            //return when component crashed
            if (c.component == null) return
            else if (c.component == "\n"){
                //create new current row when required
                if (currentRow.components.length > 0){
                    componentArray.push(currentRow)
                    currentRow = new discord.ActionRowBuilder()
                }
            }else if (c.component instanceof discord.BaseSelectMenuBuilder){
                //push current row when not empty
                if (currentRow.components.length > 0){
                    componentArray.push(currentRow)
                    currentRow = new discord.ActionRowBuilder()
                }
                currentRow.addComponents(c.component)
                //create new current row after dropdown
                componentArray.push(currentRow)
                currentRow = new discord.ActionRowBuilder()
            }else{
                //push button to current row
                currentRow.addComponents(c.component)
            }

            //create new row when 5 rows in length
            if (currentRow.components.length == 5){
                componentArray.push(currentRow)
                currentRow = new discord.ActionRowBuilder()
            }
        })
        //push final row to array
        if (currentRow.components.length > 0) componentArray.push(currentRow)

        const filteredEmbeds = instance.data.embeds.map((e) => e.embed).filter((e) => e instanceof discord.EmbedBuilder) as discord.EmbedBuilder[]
        const filteredFiles = instance.data.files.map((f) => f.file).filter((f) => f instanceof discord.AttachmentBuilder) as discord.AttachmentBuilder[]
        
        const message : discord.MessageCreateOptions = {
            content:instance.data.content ?? "",
            poll:instance.data.poll ?? undefined,
            embeds:filteredEmbeds,
            components:componentArray,
            files:filteredFiles
        }
        
        let result = {id:this.id,message,ephemeral:instance.data.ephemeral}

        Object.assign(result.message,instance.data.additionalOptions)
        pruneComponentsV2CreatePayload(result.message)

        this.cache = result
        this.didCache = true
        return result
    }
}

/**## ODQuickMessage `class`
 * This is an Open Ticket quick message builder.
 * 
 * With this class, you can quickly create a message to send in a discord channel.
 * This quick message can be used by Open Ticket plugins instead of the normal builders to speed up the process!
 * 
 * Because of the quick functionality, these messages are less customisable by other plugins.
 */
export class ODQuickMessage {
    /**The id of this message. */
    id: ODId
    /**The current data of this message. */
    data: Partial<ODMessageData>

    constructor(id:ODValidId,data:Partial<ODMessageData>){
        this.id = new ODId(id)
        this.data = data
    }

    /**Build this message & compile it for discord.js */
    async build(): Promise<ODMessageBuildResult> {
        //create the discord.js message
        const componentArray: discord.ActionRowBuilder<discord.MessageActionRowComponentBuilder>[] = []
        let currentRow: discord.ActionRowBuilder<discord.MessageActionRowComponentBuilder> = new discord.ActionRowBuilder()
        this.data.components?.forEach((c) => {
            //return when component crashed
            if (c.component == null) return
            else if (c.component == "\n"){
                //create new current row when required
                if (currentRow.components.length > 0){
                    componentArray.push(currentRow)
                    currentRow = new discord.ActionRowBuilder()
                }
            }else if (c.component instanceof discord.BaseSelectMenuBuilder){
                //push current row when not empty
                if (currentRow.components.length > 0){
                    componentArray.push(currentRow)
                    currentRow = new discord.ActionRowBuilder()
                }
                currentRow.addComponents(c.component)
                //create new current row after dropdown
                componentArray.push(currentRow)
                currentRow = new discord.ActionRowBuilder()
            }else{
                //push button to current row
                currentRow.addComponents(c.component)
            }

            //create new row when 5 rows in length
            if (currentRow.components.length == 5){
                componentArray.push(currentRow)
                currentRow = new discord.ActionRowBuilder()
            }
        })
        //push final row to array
        if (currentRow.components.length > 0) componentArray.push(currentRow)

        const filteredEmbeds = (this.data.embeds?.map((e) => e.embed).filter((e) => e instanceof discord.EmbedBuilder) as discord.EmbedBuilder[]) ?? [] 
        const filteredFiles = (this.data.files?.map((f) => f.file).filter((f) => f instanceof discord.AttachmentBuilder) as discord.AttachmentBuilder[]) ?? []
        
        const message : discord.MessageCreateOptions = {
            content:this.data.content ?? "",
            poll:this.data.poll ?? undefined,
            embeds:filteredEmbeds,
            components:componentArray,
            files:filteredFiles
        }
        
        let result = {id:this.id,message,ephemeral:this.data.ephemeral ?? false}

        Object.assign(result.message,this.data.additionalOptions)
        pruneComponentsV2CreatePayload(result.message)
        return result
    }
}

/**## ODModalManager `class`
 * This is an Open Ticket modal manager.
 * 
 * It contains all Open Ticket modal builders. Here, you can add your own modals or edit existing ones!
 * 
 * It's recommended to use this system in combination with all the other Open Ticket builders!
 */
export class ODModalManager extends ODManagerWithSafety<ODModal<string,any>> {
    constructor(debug:ODDebugger){
        super(() => {
            return new ODModal("opendiscord:unknown-modal",(instance,params,source,cancel) => {
                instance.setCustomId("od:unknown-modal")
                instance.setTitle("❌ <ODError:Unknown Modal>")
                instance.setQuestions(
                    {
                        style:"short",
                        customId:"error",
                        label:"error",
                        placeholder:"Contact the bot creator for more info!"
                    }
                )
                cancel()
            })
        },debug,"modal")
    }
}

/**## ODModalDataQuestion `interface`
 * This interface contains the data to build a modal question.
 */
export interface ODModalDataQuestion {
    /**The style of this modal question */
    style:"short"|"paragraph",
    /**The custom id of this modal question */
    customId:string
    /**The label of this modal question */
    label?:string,
    /**The min length of this modal question */
    minLength?:number,
    /**The max length of this modal question */
    maxLength?:number,
    /**Is this modal question required? */
    required?:boolean,
    /**The placeholder of this modal question */
    placeholder?:string,
    /**The initial value of this modal question */
    value?:string
}

/**## ODModalInputKind `type`
 * The fixed input families supported by the Open Ticket modal component foundation.
 */
export type ODModalInputKind =
    "text-input"|
    "string-select"|
    "user-select"|
    "role-select"|
    "channel-select"|
    "mentionable-select"|
    "file-upload"|
    "radio-group"|
    "checkbox-group"|
    "checkbox"

/**## ODModalInputSupport `interface`
 * The support status for a modal input family on the pinned Open Ticket Discord.js stack.
 */
export interface ODModalInputSupport {
    status:"stable"|"preview"|"unsupported",
    reason:string|null
}

/**## ODModalChoiceOptionData `interface`
 * Reusable option contract for modal string-select components.
 */
export interface ODModalChoiceOptionData {
    label:string,
    value:string,
    description?:string,
    emoji?:discord.ComponentEmojiResolvable,
    default?:boolean
}

/**## ODModalSelectionConstraintsData `interface`
 * Reusable min/max selection contract for modal inputs that expose selection counts.
 */
export interface ODModalSelectionConstraintsData {
    minValues?:number,
    maxValues?:number,
    required?:boolean
}

/**## ODModalFileUploadConfigData `interface`
 * Reusable file-upload contract. Attachment storage, transcript custody, and safety policy belong to later slices.
 */
export interface ODModalFileUploadConfigData {
    minFiles?:number,
    maxFiles?:number,
    required?:boolean,
    attachmentPolicy?:string|null
}

interface ODModalLabelChildBaseData {
    kind:ODModalInputKind,
    customId:string
}

export interface ODModalTextInputChildData extends ODModalLabelChildBaseData {
    kind:"text-input",
    style?:"short"|"paragraph",
    label?:string,
    minLength?:number,
    maxLength?:number,
    required?:boolean,
    placeholder?:string,
    value?:string
}

export interface ODModalStringSelectChildData extends ODModalLabelChildBaseData, ODModalSelectionConstraintsData {
    kind:"string-select",
    placeholder?:string,
    options:ODModalChoiceOptionData[]
}

export interface ODModalUserSelectChildData extends ODModalLabelChildBaseData, ODModalSelectionConstraintsData {
    kind:"user-select",
    placeholder?:string,
    defaultUsers?:discord.Snowflake[]
}

export interface ODModalRoleSelectChildData extends ODModalLabelChildBaseData, ODModalSelectionConstraintsData {
    kind:"role-select",
    placeholder?:string,
    defaultRoles?:discord.Snowflake[]
}

export interface ODModalChannelSelectChildData extends ODModalLabelChildBaseData, ODModalSelectionConstraintsData {
    kind:"channel-select",
    placeholder?:string,
    channelTypes?:discord.ChannelType[],
    defaultChannels?:discord.Snowflake[]
}

export interface ODModalMentionableSelectChildData extends ODModalLabelChildBaseData, ODModalSelectionConstraintsData {
    kind:"mentionable-select",
    placeholder?:string,
    defaultUsers?:discord.Snowflake[],
    defaultRoles?:discord.Snowflake[]
}

export interface ODModalFileUploadChildData extends ODModalLabelChildBaseData, ODModalFileUploadConfigData {
    kind:"file-upload"
}

export interface ODModalUnsupportedChildData extends ODModalLabelChildBaseData {
    kind:"radio-group"|"checkbox-group"|"checkbox"
}

export type ODModalLabelChildData =
    ODModalTextInputChildData|
    ODModalStringSelectChildData|
    ODModalUserSelectChildData|
    ODModalRoleSelectChildData|
    ODModalChannelSelectChildData|
    ODModalMentionableSelectChildData|
    ODModalFileUploadChildData|
    ODModalUnsupportedChildData

export interface ODModalLabelComponentData {
    type:"label",
    label:string,
    description?:string,
    component:ODModalLabelChildData
}

export interface ODModalTextDisplayComponentData {
    type:"text-display",
    content:string
}

export type ODModalTopLevelComponentData = ODModalLabelComponentData|ODModalTextDisplayComponentData

const ODModalUnsupportedInputReasons: Record<"radio-group"|"checkbox-group"|"checkbox",string> = {
    "radio-group":"Radio groups are not exposed as stable modal inputs on the pinned Discord.js modal stack.",
    "checkbox-group":"Checkbox groups are not exposed as stable modal inputs on the pinned Discord.js modal stack.",
    "checkbox":"Checkboxes are not exposed as stable modal inputs on the pinned Discord.js modal stack."
}

/**Get support status for a modal input kind on the pinned Open Ticket Discord.js stack. */
export const getModalInputSupport = (kind:ODModalInputKind): ODModalInputSupport => {
    if (
        kind == "text-input" ||
        kind == "string-select" ||
        kind == "user-select" ||
        kind == "role-select" ||
        kind == "channel-select" ||
        kind == "mentionable-select" ||
        kind == "file-upload"
    ) return {status:"stable",reason:null}

    if (kind == "radio-group" || kind == "checkbox-group" || kind == "checkbox"){
        return {status:"unsupported",reason:ODModalUnsupportedInputReasons[kind]}
    }

    return {status:"unsupported",reason:"Unknown modal input kind."}
}

type ODDiscordComponentBuilder = { toJSON():unknown }
type ODDiscordSelectBuilder = ODDiscordComponentBuilder & {
    setCustomId(customId:string): ODDiscordSelectBuilder,
    setPlaceholder(placeholder:string): ODDiscordSelectBuilder,
    setMinValues(minValues:number): ODDiscordSelectBuilder,
    setMaxValues(maxValues:number): ODDiscordSelectBuilder,
    setRequired(required?:boolean): ODDiscordSelectBuilder
}
type ODDiscordLabelBuilder = ODDiscordComponentBuilder & {
    setLabel(label:string): ODDiscordLabelBuilder,
    setDescription(description:string): ODDiscordLabelBuilder,
    setTextInputComponent(component:discord.TextInputBuilder): ODDiscordLabelBuilder,
    setStringSelectMenuComponent(component:discord.StringSelectMenuBuilder): ODDiscordLabelBuilder,
    setUserSelectMenuComponent(component:discord.UserSelectMenuBuilder): ODDiscordLabelBuilder,
    setRoleSelectMenuComponent(component:discord.RoleSelectMenuBuilder): ODDiscordLabelBuilder,
    setChannelSelectMenuComponent(component:discord.ChannelSelectMenuBuilder): ODDiscordLabelBuilder,
    setMentionableSelectMenuComponent(component:discord.MentionableSelectMenuBuilder): ODDiscordLabelBuilder,
    setFileUploadComponent(component:unknown): ODDiscordLabelBuilder
}
type ODDiscordTextDisplayBuilder = ODDiscordComponentBuilder & {
    setContent(content:string): ODDiscordTextDisplayBuilder
}
type ODDiscordFileUploadBuilder = ODDiscordComponentBuilder & {
    setCustomId(customId:string): ODDiscordFileUploadBuilder,
    setMinValues(minValues:number): ODDiscordFileUploadBuilder,
    setMaxValues(maxValues:number): ODDiscordFileUploadBuilder,
    setRequired(required?:boolean): ODDiscordFileUploadBuilder
}
type ODDiscordModalComponentConstructors = {
    LabelBuilder: new () => ODDiscordLabelBuilder,
    TextDisplayBuilder: new () => ODDiscordTextDisplayBuilder,
    FileUploadBuilder: new () => ODDiscordFileUploadBuilder
}
type ODDiscordModalBuilderWithComponents = discord.ModalBuilder & {
    addLabelComponents(...components:ODDiscordLabelBuilder[]): discord.ModalBuilder,
    addTextDisplayComponents(...components:ODDiscordTextDisplayBuilder[]): discord.ModalBuilder
}

const getDiscordModalComponentConstructors = (): ODDiscordModalComponentConstructors => {
    const constructors = discord as unknown as ODDiscordModalComponentConstructors
    if (!constructors.LabelBuilder || !constructors.TextDisplayBuilder || !constructors.FileUploadBuilder){
        throw new ODSystemError("ODModal:build() => installed Discord.js modal component builders are unavailable!")
    }
    return constructors
}

const buildUnknownModalFallbackResult = (id:ODId): ODModalBuildResult => {
    const modal = new discord.ModalBuilder()
    modal.setCustomId("od:unknown-modal")
    modal.setTitle("❌ <ODError:Unknown Modal>")
    modal.addComponents(
        new discord.ActionRowBuilder<discord.ModalActionRowComponentBuilder>()
            .addComponents(
                new discord.TextInputBuilder()
                    .setStyle(discord.TextInputStyle.Short)
                    .setCustomId("error")
                    .setLabel("error")
                    .setRequired(false)
                    .setPlaceholder("Contact the bot creator for more info!")
            )
    )
    return {id,modal}
}

const assertModalInputStable = (kind:ODModalInputKind): void => {
    const support = getModalInputSupport(kind)
    if (support.status != "stable"){
        throw new ODSystemError("ODModal:build() => modal input kind \""+kind+"\" is "+support.status+": "+(support.reason ?? "No reason provided."))
    }
}

const applyModalSelectionConstraints = <Builder extends ODDiscordSelectBuilder>(builder:Builder, data:ODModalSelectionConstraintsData): Builder => {
    if (data.minValues !== undefined) builder.setMinValues(data.minValues)
    if (data.maxValues !== undefined) builder.setMaxValues(data.maxValues)
    if (data.required !== undefined) builder.setRequired(data.required)
    return builder
}

const buildModalTextInputChild = (component:ODModalTextInputChildData, fallbackLabel:string): discord.TextInputBuilder => {
    const input = new discord.TextInputBuilder()
        .setStyle(component.style == "paragraph" ? discord.TextInputStyle.Paragraph : discord.TextInputStyle.Short)
        .setCustomId(component.customId)
        .setLabel(component.label ?? fallbackLabel)
        .setRequired(component.required ? true : false)

    if (component.minLength !== undefined) input.setMinLength(component.minLength)
    if (component.maxLength !== undefined) input.setMaxLength(component.maxLength)
    if (component.value !== undefined) input.setValue(component.value)
    if (component.placeholder !== undefined) input.setPlaceholder(component.placeholder)

    return input
}

const buildModalStringSelectChild = (component:ODModalStringSelectChildData): discord.StringSelectMenuBuilder => {
    const select = applyModalSelectionConstraints(new discord.StringSelectMenuBuilder().setCustomId(component.customId) as unknown as ODDiscordSelectBuilder, component) as unknown as discord.StringSelectMenuBuilder
    if (component.placeholder !== undefined) select.setPlaceholder(component.placeholder)
    select.setOptions(...component.options.map((option) => ({
        label:option.label,
        value:option.value,
        description:option.description,
        emoji:option.emoji,
        default:option.default
    })))
    return select
}

const buildModalUserSelectChild = (component:ODModalUserSelectChildData): discord.UserSelectMenuBuilder => {
    const select = applyModalSelectionConstraints(new discord.UserSelectMenuBuilder().setCustomId(component.customId) as unknown as ODDiscordSelectBuilder, component) as unknown as discord.UserSelectMenuBuilder
    if (component.placeholder !== undefined) select.setPlaceholder(component.placeholder)
    if (component.defaultUsers) select.setDefaultUsers(...component.defaultUsers)
    return select
}

const buildModalRoleSelectChild = (component:ODModalRoleSelectChildData): discord.RoleSelectMenuBuilder => {
    const select = applyModalSelectionConstraints(new discord.RoleSelectMenuBuilder().setCustomId(component.customId) as unknown as ODDiscordSelectBuilder, component) as unknown as discord.RoleSelectMenuBuilder
    if (component.placeholder !== undefined) select.setPlaceholder(component.placeholder)
    if (component.defaultRoles) select.setDefaultRoles(...component.defaultRoles)
    return select
}

const buildModalChannelSelectChild = (component:ODModalChannelSelectChildData): discord.ChannelSelectMenuBuilder => {
    const select = applyModalSelectionConstraints(new discord.ChannelSelectMenuBuilder().setCustomId(component.customId) as unknown as ODDiscordSelectBuilder, component) as unknown as discord.ChannelSelectMenuBuilder
    if (component.placeholder !== undefined) select.setPlaceholder(component.placeholder)
    if (component.channelTypes) select.setChannelTypes(...component.channelTypes)
    if (component.defaultChannels) select.setDefaultChannels(...component.defaultChannels)
    return select
}

const buildModalMentionableSelectChild = (component:ODModalMentionableSelectChildData): discord.MentionableSelectMenuBuilder => {
    const select = applyModalSelectionConstraints(new discord.MentionableSelectMenuBuilder().setCustomId(component.customId) as unknown as ODDiscordSelectBuilder, component) as unknown as discord.MentionableSelectMenuBuilder
    if (component.placeholder !== undefined) select.setPlaceholder(component.placeholder)
    const defaultValues: ({type:discord.SelectMenuDefaultValueType.User,id:string}|{type:discord.SelectMenuDefaultValueType.Role,id:string})[] = []
    if (component.defaultUsers) defaultValues.push(...component.defaultUsers.map((id) => ({id,type:discord.SelectMenuDefaultValueType.User as discord.SelectMenuDefaultValueType.User})))
    if (component.defaultRoles) defaultValues.push(...component.defaultRoles.map((id) => ({id,type:discord.SelectMenuDefaultValueType.Role as discord.SelectMenuDefaultValueType.Role})))
    if (defaultValues.length > 0) select.setDefaultValues(...defaultValues)
    return select
}

const buildModalFileUploadChild = (component:ODModalFileUploadChildData): ODDiscordFileUploadBuilder => {
    const constructors = getDiscordModalComponentConstructors()
    const input = new constructors.FileUploadBuilder().setCustomId(component.customId)
    if (component.minFiles !== undefined) input.setMinValues(component.minFiles)
    if (component.maxFiles !== undefined) input.setMaxValues(component.maxFiles)
    if (component.required !== undefined) input.setRequired(component.required)
    return input
}

const buildModalLabelChild = (component:ODModalLabelChildData, fallbackLabel:string): ODDiscordComponentBuilder => {
    assertModalInputStable(component.kind)

    if (component.kind == "text-input") return buildModalTextInputChild(component,fallbackLabel)
    else if (component.kind == "string-select") return buildModalStringSelectChild(component)
    else if (component.kind == "user-select") return buildModalUserSelectChild(component)
    else if (component.kind == "role-select") return buildModalRoleSelectChild(component)
    else if (component.kind == "channel-select") return buildModalChannelSelectChild(component)
    else if (component.kind == "mentionable-select") return buildModalMentionableSelectChild(component)
    else if (component.kind == "file-upload") return buildModalFileUploadChild(component)

    throw new ODSystemError("ODModal:build() => unsupported modal input kind \""+component.kind+"\"!")
}

const buildModalLabelComponent = (component:ODModalLabelComponentData): ODDiscordLabelBuilder => {
    const constructors = getDiscordModalComponentConstructors()
    const label = new constructors.LabelBuilder().setLabel(component.label)
    if (component.description !== undefined) label.setDescription(component.description)

    const child = buildModalLabelChild(component.component,component.label)
    if (component.component.kind == "text-input") label.setTextInputComponent(child as discord.TextInputBuilder)
    else if (component.component.kind == "string-select") label.setStringSelectMenuComponent(child as discord.StringSelectMenuBuilder)
    else if (component.component.kind == "user-select") label.setUserSelectMenuComponent(child as discord.UserSelectMenuBuilder)
    else if (component.component.kind == "role-select") label.setRoleSelectMenuComponent(child as discord.RoleSelectMenuBuilder)
    else if (component.component.kind == "channel-select") label.setChannelSelectMenuComponent(child as discord.ChannelSelectMenuBuilder)
    else if (component.component.kind == "mentionable-select") label.setMentionableSelectMenuComponent(child as discord.MentionableSelectMenuBuilder)
    else if (component.component.kind == "file-upload") label.setFileUploadComponent(child)

    return label
}

const buildModalTextDisplayComponent = (component:ODModalTextDisplayComponentData): ODDiscordTextDisplayBuilder => {
    const constructors = getDiscordModalComponentConstructors()
    return new constructors.TextDisplayBuilder().setContent(component.content)
}

/**## ODModalData `interface`
 * This interface contains the data to build a modal.
 */
export interface ODModalData {
    /**The custom id of this modal */
    customId:string,
    /**The title of this modal */
    title:string|null,
    /**The collection of questions in this modal */
    questions:ODModalDataQuestion[],
    /**The collection of modal components in this modal */
    components:ODModalTopLevelComponentData[],
}

/**## ODModalBuildResult `interface`
 * This interface contains the result from a built modal (form). This can be used in the `ODMessage` builder!
 */
export interface ODModalBuildResult {
    /**The id of this modal */
    id:ODId,
    /**The discord modal */
    modal:discord.ModalBuilder
}

/**## ODModalInstance `class`
 * This is an Open Ticket modal instance.
 * 
 * It contains all properties & functions to build a modal!
 */
export class ODModalInstance {
    /**The current data of this modal */
    data: ODModalData = {
        customId:"",
        title:null,
        questions:[],
        components:[]
    }

    /**Set the custom id of this modal */
    setCustomId(customId:ODModalData["customId"]){
        this.data.customId = customId
        return this
    }
    /**Set the title of this modal */
    setTitle(title:ODModalData["title"]){
        this.data.title = title
        return this
    }
    /**Set the questions of this modal */
    setQuestions(...questions:ODModalData["questions"]){
        this.data.questions = questions
        return this
    }
    /**Add a question to this modal! */
    addQuestion(question:ODModalDataQuestion){
        this.data.questions.push(question)
        return this
    }
    /**Set the components of this modal */
    setComponents(...components:ODModalData["components"]){
        this.data.components = components
        return this
    }
    /**Add a component to this modal! */
    addComponent(component:ODModalTopLevelComponentData){
        this.data.components.push(component)
        return this
    }
    /**Add a label-wrapped input component to this modal! */
    addLabelComponent(component:ODModalLabelComponentData): this
    addLabelComponent(label:string, component:ODModalLabelChildData, description?:string): this
    addLabelComponent(labelOrComponent:string|ODModalLabelComponentData, component?:ODModalLabelChildData, description?:string){
        if (typeof labelOrComponent == "string"){
            if (!component) throw new ODSystemError("ODModalInstance:addLabelComponent() => missing label child component!")
            this.data.components.push({type:"label",label:labelOrComponent,description,component})
        }else this.data.components.push(labelOrComponent)
        return this
    }
    /**Add helper text to this modal. This component never yields a submitted value. */
    addTextDisplayComponent(component:ODModalTextDisplayComponentData): this
    addTextDisplayComponent(content:string): this
    addTextDisplayComponent(contentOrComponent:string|ODModalTextDisplayComponentData){
        if (typeof contentOrComponent == "string") this.data.components.push({type:"text-display",content:contentOrComponent})
        else this.data.components.push(contentOrComponent)
        return this
    }
    /**Remove a question from this modal */
    removeQuestion(customId:string){
        const index = this.data.questions.findIndex((question) => question.customId === customId)
        if (index > -1) this.data.questions.splice(index,1)
        return this
    }
    /**Get a question from this modal */
    getQuestion(customId:string){
        const question = this.data.questions.find((question) => question.customId === customId)
        if (question) return question
        else return null
    }
}

/**## ODModal `class`
 * This is an Open Ticket modal builder.
 * 
 * With this class, you can create a modal to use as response in interactions.
 * The only difference with normal modals is that this one can be edited by Open Ticket plugins!
 * 
 * This is possible by using "workers" or multiple functions that will be executed in priority order!
 */
export class ODModal<Source extends string,Params> extends ODBuilderImplementation<ODModalInstance,Source,Params,ODModalBuildResult> {
    /**Build this modal & compile it for discord.js */
    async build(source:Source, params:Params){
        if (this.didCache && this.cache && this.allowCache) return this.cache

        try{
            //create instance
            const instance = new ODModalInstance()

            //wait for workers to finish
            await this.workers.executeWorkers(instance,source,params)

            const hasQuestions = instance.data.questions.length > 0
            const hasComponents = instance.data.components.length > 0
            if (hasQuestions && hasComponents) throw new ODSystemError("ODModal:build(\""+this.id.value+"\") => mixed legacy questions and modal components are forbidden!")

            //create the discord.js modal
            const modal = new discord.ModalBuilder()
            modal.setCustomId(instance.data.customId)
            if (instance.data.title) modal.setTitle(instance.data.title)
            else modal.setTitle(instance.data.customId)
            
            instance.data.questions.forEach((question) => {
                const input = new discord.TextInputBuilder()
                    .setStyle(question.style == "paragraph" ? discord.TextInputStyle.Paragraph : discord.TextInputStyle.Short)
                    .setCustomId(question.customId)
                    .setLabel(question.label ? question.label : question.customId)
                    .setRequired(question.required ? true : false)
                
                if (question.minLength) input.setMinLength(question.minLength)
                if (question.maxLength) input.setMaxLength(question.maxLength)
                if (question.value) input.setValue(question.value)
                if (question.placeholder) input.setPlaceholder(question.placeholder)

                modal.addComponents(
                    new discord.ActionRowBuilder<discord.ModalActionRowComponentBuilder>()
                        .addComponents(input)
                )
            })

            if (hasComponents){
                const componentModal = modal as ODDiscordModalBuilderWithComponents
                instance.data.components.forEach((component) => {
                    if (component.type == "label") componentModal.addLabelComponents(buildModalLabelComponent(component))
                    else if (component.type == "text-display") componentModal.addTextDisplayComponents(buildModalTextDisplayComponent(component))
                    else throw new ODSystemError("ODModal:build(\""+this.id.value+"\") => unsupported top-level modal component!")
                })
            }

            this.cache = {id:this.id,modal}
            this.didCache = true
            return {id:this.id,modal}
        }catch(err){
            process.emit("uncaughtException",new ODSystemError("ODModal:build(\""+this.id.value+"\") => Major Error (see next error)"))
            process.emit("uncaughtException",err)
            return buildUnknownModalFallbackResult(this.id)
        }
    }
}
