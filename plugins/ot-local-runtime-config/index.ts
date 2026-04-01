import {api, opendiscord, utilities} from "#opendiscord"

if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

const DEFAULT_SERVER_ID = "1433418426029834305"
const WHITELIST_OPTION_ID = "whitelist-application-ticket-81642e12"
const IMAGE_EXTENSIONS = [".png",".jpg",".jpeg",".webp",".gif"]

const DEFAULT_PERMISSIONS = {
    help:"everyone",
    panel:"admin",
    ticket:"none",
    close:"everyone",
    delete:"admin",
    reopen:"everyone",
    claim:"admin",
    unclaim:"admin",
    pin:"admin",
    unpin:"admin",
    move:"admin",
    rename:"admin",
    add:"admin",
    remove:"admin",
    blacklist:"admin",
    stats:"everyone",
    clear:"admin",
    autoclose:"admin",
    autodelete:"admin",
    transfer:"admin",
    topic:"admin",
    priority:"admin"
}

const createWhitelistOption = (): api.ODJsonConfig_DefaultOptionTicketType => ({
    id:WHITELIST_OPTION_ID,
    name:"Whitelist Application",
    description:"Open a whitelist application ticket.",
    type:"ticket",

    button:{
        emoji:"🎫",
        label:"Whitelist",
        color:"green"
    },

    ticketAdmins:[],
    readonlyAdmins:[],
    allowCreationByBlacklistedUsers:false,
    questions:[],

    channel:{
        prefix:"whitelist-",
        suffix:"user-name",
        category:"",
        closedCategory:"",
        backupCategory:"",
        claimedCategory:[],
        topic:""
    },

    dmMessage:{
        enabled:false,
        text:"",
        embed:{
            enabled:false,
            title:"",
            description:"",
            customColor:"",
            image:"",
            thumbnail:"",
            fields:[],
            timestamp:false
        }
    },
    ticketMessage:{
        enabled:true,
        text:"",
        embed:{
            enabled:true,
            title:"Whitelist Application for EOTFS",
            description:"Thank you for opening a whitelist application ticket with us. Staff will review it as soon as possible in the order they come in.",
            customColor:"",
            image:"",
            thumbnail:"",
            fields:[
                {
                    name:"Whitelist Review Steps",
                    value:"Please be sure to complete the form in this ticket located at the bottom. Staff will be sure to look over everything when taking the application into consideration.",
                    inline:false
                },
                {
                    name:"What Happens Next",
                    value:"Be sure to Complete the entire form. If anything is left unanswered that will be an automatic denial. Once completed wait for staff to review it, and if you have any questions you may ask them here in the ticket.",
                    inline:false
                }
            ],
            timestamp:false
        },
        ping:{
            "@here":false,
            "@everyone":false,
            custom:[]
        }
    },
    autoclose:{
        enableInactiveHours:false,
        inactiveHours:24,
        enableUserLeave:false,
        disableOnClaim:false
    },
    autodelete:{
        enableInactiveDays:false,
        inactiveDays:7,
        enableUserLeave:false,
        disableOnClaim:false
    },
    cooldown:{
        enabled:false,
        cooldownMinutes:10
    },
    limits:{
        enabled:false,
        globalMaximum:20,
        userMaximum:1
    },
    slowMode:{
        enabled:false,
        slowModeSeconds:20
    }
})

const createDefaultPanel = (): api.ODJsonConfig_DefaultPanelType => ({
    id:"whitelist-panel",
    name:"Whitelist Panel",
    dropdown:false,
    options:[WHITELIST_OPTION_ID],
    text:"",
    embed:{
        enabled:true,
        title:"Whitelist Applications",
        description:"Open a whitelist application using the button below.",
        customColor:"",
        url:"",
        image:"",
        thumbnail:"",
        footer:"",
        fields:[],
        timestamp:false
    },
    settings:{
        dropdownPlaceholder:"Open a ticket",
        enableMaxTicketsWarningInText:false,
        enableMaxTicketsWarningInEmbed:true,
        describeOptionsLayout:"simple",
        describeOptionsCustomTitle:"",
        describeOptionsInText:false,
        describeOptionsInEmbedFields:true,
        describeOptionsInEmbedDescription:false
    }
})

const isSnowflake = (value:any) => (typeof value == "string" && /^\d{17,20}$/.test(value))
const isHexColor = (value:any) => (typeof value == "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value))
const isButtonColor = (value:any) => (typeof value == "string" && ["gray","red","green","blue"].includes(value))
const isTicketSuffix = (value:any) => (typeof value == "string" && ["user-name","user-nickname","user-id","random-number","random-hex","counter-dynamic","counter-fixed"].includes(value))
const isStatusType = (value:any) => (typeof value == "string" && ["listening","watching","playing","custom"].includes(value))
const isStatusMode = (value:any) => (typeof value == "string" && ["online","invisible","idle","dnd"].includes(value))
const isEmojiStyle = (value:any) => (typeof value == "string" && ["before","after","double","disabled"].includes(value))
const isRoleMode = (value:any) => (typeof value == "string" && ["add","remove","add&remove"].includes(value))
const isDescribeOptionsLayout = (value:any) => (typeof value == "string" && ["simple","normal","detailed"].includes(value))
const isTranscriptFileMode = (value:any) => (typeof value == "string" && ["custom","channel-name","channel-id","user-name","user-id"].includes(value))
const isTranscriptMode = (value:any) => (typeof value == "string" && ["html","text"].includes(value))
const isPermissionValue = (value:any) => (typeof value == "string" && (["admin","everyone","none"].includes(value) || isSnowflake(value)))
const isImageUrl = (value:any) => {
    if (typeof value != "string" || value.length < 1) return false
    try{
        const parsed = new URL(value)
        return parsed.protocol == "https:" && IMAGE_EXTENSIONS.some((ext) => parsed.pathname.toLowerCase().endsWith(ext))
    }catch{
        return false
    }
}
const trimEnv = (name:string) => {
    const value = opendiscord.env.getVariable(name)
    return (typeof value == "string") ? value.trim() : ""
}

const sanitizeEmbed = (embed:any, fallback:{title:string,description:string}) => {
    if (typeof embed != "object" || !embed) return {
        enabled:true,
        title:fallback.title,
        description:fallback.description,
        customColor:"",
        image:"",
        thumbnail:"",
        fields:[],
        timestamp:false
    }

    if (typeof embed.enabled != "boolean") embed.enabled = true
    if (typeof embed.title != "string") embed.title = fallback.title
    if (typeof embed.description != "string") embed.description = fallback.description
    if (!isHexColor(embed.customColor)) embed.customColor = ""
    if (!isImageUrl(embed.image)) embed.image = ""
    if (!isImageUrl(embed.thumbnail)) embed.thumbnail = ""
    if (!Array.isArray(embed.fields)) embed.fields = []
    else embed.fields = embed.fields.filter((field) => (
        typeof field == "object" &&
        field &&
        typeof field.name == "string" &&
        field.name.length > 0 &&
        typeof field.value == "string" &&
        field.value.length > 0 &&
        typeof field.inline == "boolean"
    ))
    if (typeof embed.timestamp != "boolean") embed.timestamp = false
    return embed
}

const sanitizeGeneralConfig = () => {
    const generalConfig = opendiscord.configs.get("opendiscord:general")
    if (!generalConfig || typeof generalConfig.data != "object" || !generalConfig.data) return

    const general = generalConfig.data
    const envToken = trimEnv("TOKEN")
    const envServerId = trimEnv("OT_SERVER_ID") || trimEnv("SERVER_ID")

    if (envToken.length > 0){
        general.token = envToken
        general.tokenFromENV = true
    }
    if (!isSnowflake(general.serverId)) general.serverId = (envServerId.length > 0) ? envServerId : DEFAULT_SERVER_ID
    if (!Array.isArray(general.globalAdmins)) general.globalAdmins = []
    else general.globalAdmins = general.globalAdmins.filter((value:any) => isSnowflake(value))

    if (!general.status || typeof general.status != "object") general.status = {enabled:true,type:"listening",mode:"online",text:"/help",state:""}
    if (typeof general.status.enabled != "boolean") general.status.enabled = true
    if (!isStatusType(general.status.type)) general.status.type = "listening"
    if (!isStatusMode(general.status.mode)) general.status.mode = "online"
    if (typeof general.status.text != "string" || general.status.text.length < 1) general.status.text = "/help"
    if (typeof general.status.state != "string") general.status.state = ""

    if (!general.system || typeof general.system != "object") return
    if (!isEmojiStyle(general.system.emojiStyle)) general.system.emojiStyle = "before"
    if (!general.system.permissions || typeof general.system.permissions != "object") general.system.permissions = {...DEFAULT_PERMISSIONS}

    Object.entries(DEFAULT_PERMISSIONS).forEach(([key,value]) => {
        if (!isPermissionValue(general.system.permissions[key])) general.system.permissions[key] = value
    })
}

const sanitizeOptionsConfig = () => {
    const optionsConfig = opendiscord.configs.get("opendiscord:options")
    if (!optionsConfig) return

    const whitelistOption = createWhitelistOption()
    const rawOptions: api.ODJsonConfig_DefaultOptionsData = Array.isArray(optionsConfig.data) ? optionsConfig.data : []
    const filteredOptions: api.ODJsonConfig_DefaultOptionsData = rawOptions.filter((option:any) => {
        if (!option || typeof option != "object") return false
        if (option.id == "example-website" || option.id == "example-role") return false
        return true
    })

    const stockTicketIndex = filteredOptions.findIndex((option:any) => option && option.id == "example-ticket")
    const whitelistIndex = filteredOptions.findIndex((option:any) => option && option.id == WHITELIST_OPTION_ID)

    if (whitelistIndex >= 0){
        filteredOptions[whitelistIndex] = whitelistOption
    }else if (stockTicketIndex >= 0){
        filteredOptions[stockTicketIndex] = whitelistOption
    }else{
        filteredOptions.unshift(whitelistOption)
    }

    optionsConfig.data = filteredOptions
}

const sanitizePanelsConfig = () => {
    const panelsConfig = opendiscord.configs.get("opendiscord:panels")
    if (!panelsConfig) return

    const panels: api.ODJsonConfig_DefaultPanelsData = Array.isArray(panelsConfig.data) ? panelsConfig.data : []
    if (panels.length < 1){
        panelsConfig.data = [createDefaultPanel()]
        return
    }

    const panel: api.ODJsonConfig_DefaultPanelType = (typeof panels[0] == "object" && panels[0]) ? panels[0] : createDefaultPanel()
    if (typeof panel.id != "string" || panel.id.length < 3) panel.id = "whitelist-panel"
    if (typeof panel.name != "string" || panel.name.length < 3) panel.name = "Whitelist Panel"
    if (typeof panel.dropdown != "boolean") panel.dropdown = false
    panel.options = [WHITELIST_OPTION_ID]
    if (typeof panel.text != "string") panel.text = ""

    if (typeof panel.embed != "object" || !panel.embed) panel.embed = createDefaultPanel().embed
    if (typeof panel.embed.enabled != "boolean") panel.embed.enabled = true
    if (typeof panel.embed.title != "string") panel.embed.title = "Whitelist Applications"
    if (typeof panel.embed.description != "string") panel.embed.description = "Open a whitelist application using the button below."
    if (!isHexColor(panel.embed.customColor)) panel.embed.customColor = ""
    if (typeof panel.embed.url != "string" || panel.embed.url.includes("(or leave empty)")) panel.embed.url = ""
    if (!isImageUrl(panel.embed.image)) panel.embed.image = ""
    if (!isImageUrl(panel.embed.thumbnail)) panel.embed.thumbnail = ""
    if (typeof panel.embed.footer != "string") panel.embed.footer = ""
    if (!Array.isArray(panel.embed.fields)) panel.embed.fields = []
    else panel.embed.fields = panel.embed.fields.filter((field:any) => (
        typeof field == "object" &&
        field &&
        typeof field.name == "string" &&
        field.name.length > 0 &&
        typeof field.value == "string" &&
        field.value.length > 0 &&
        typeof field.inline == "boolean"
    ))
    if (typeof panel.embed.timestamp != "boolean") panel.embed.timestamp = false

    if (!panel.settings || typeof panel.settings != "object") panel.settings = createDefaultPanel().settings
    if (typeof panel.settings.dropdownPlaceholder != "string") panel.settings.dropdownPlaceholder = "Open a ticket"
    if (typeof panel.settings.enableMaxTicketsWarningInText != "boolean") panel.settings.enableMaxTicketsWarningInText = false
    if (typeof panel.settings.enableMaxTicketsWarningInEmbed != "boolean") panel.settings.enableMaxTicketsWarningInEmbed = true
    if (!isDescribeOptionsLayout(panel.settings.describeOptionsLayout)) panel.settings.describeOptionsLayout = "simple"
    if (typeof panel.settings.describeOptionsCustomTitle != "string") panel.settings.describeOptionsCustomTitle = ""
    if (typeof panel.settings.describeOptionsInText != "boolean") panel.settings.describeOptionsInText = false
    if (typeof panel.settings.describeOptionsInEmbedFields != "boolean") panel.settings.describeOptionsInEmbedFields = true
    if (typeof panel.settings.describeOptionsInEmbedDescription != "boolean") panel.settings.describeOptionsInEmbedDescription = false

    panelsConfig.data = [panel]
}

const sanitizeTranscriptsConfig = () => {
    const transcriptsConfig = opendiscord.configs.get("opendiscord:transcripts")
    if (!transcriptsConfig || typeof transcriptsConfig.data != "object" || !transcriptsConfig.data) return

    const transcripts = transcriptsConfig.data
    if (!transcripts.embedSettings || typeof transcripts.embedSettings != "object") transcripts.embedSettings = {customColor:"",listAllParticipants:false,includeTicketStats:false}
    if (!isHexColor(transcripts.embedSettings.customColor)) transcripts.embedSettings.customColor = ""
    if (typeof transcripts.embedSettings.listAllParticipants != "boolean") transcripts.embedSettings.listAllParticipants = false
    if (typeof transcripts.embedSettings.includeTicketStats != "boolean") transcripts.embedSettings.includeTicketStats = false

    if (!transcripts.textTranscriptStyle || typeof transcripts.textTranscriptStyle != "object"){
        transcripts.textTranscriptStyle = {layout:"simple",includeStats:true,includeIds:false,includeEmbeds:true,includeFiles:true,includeBotMessages:true,fileMode:"channel-name",customFileName:""}
    }
    if (!isDescribeOptionsLayout(transcripts.textTranscriptStyle.layout)) transcripts.textTranscriptStyle.layout = "simple"
    if (!isTranscriptFileMode(transcripts.textTranscriptStyle.fileMode)) transcripts.textTranscriptStyle.fileMode = "channel-name"
    if (typeof transcripts.textTranscriptStyle.customFileName != "string") transcripts.textTranscriptStyle.customFileName = ""

    if (!transcripts.general || typeof transcripts.general != "object") transcripts.general = {enabled:false,enableChannel:false,enableCreatorDM:false,enableParticipantDM:false,enableActiveAdminDM:false,enableEveryAdminDM:false,channel:"",mode:"html"}
    if (!isTranscriptMode(transcripts.general.mode)) transcripts.general.mode = "html"
}

opendiscord.events.get("afterConfigsInitiated").listen(() => {
    sanitizeGeneralConfig()
    sanitizeOptionsConfig()
    sanitizePanelsConfig()
    sanitizeTranscriptsConfig()
    opendiscord.log("Applied local runtime config overrides.","plugin")
})
