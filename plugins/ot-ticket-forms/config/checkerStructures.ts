import { api } from "#opendiscord";

const sharedModalSelectChildren = (idPrefix: string) => [
    {key:"position",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-position",{min:1,floatAllowed:false,negativeAllowed:false})},
    {key:"question",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question",{minLength:1,maxLength:45})},
    {key:"optional",optional:false,priority:0,checker:new api.ODCheckerBooleanStructure("ot-ticket-forms:question-optional",{})},
    {key:"placeholder",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question-placeholder",{maxLength:100})},
    {key:"minAnswerChoices",optional:false,priority:0,checker:new api.ODCheckerNumberStructure(`${idPrefix}:question-min-choices`,{min:0,max:25,floatAllowed:false,negativeAllowed:false})},
    {key:"maxAnswerChoices",optional:false,priority:0,checker:new api.ODCheckerNumberStructure(`${idPrefix}:question-max-choices`,{min:1,max:25,floatAllowed:false,negativeAllowed:false})}
]

const unsupportedQuestionChecker = (questionType: "radio_group" | "checkbox_group" | "checkbox") => new api.ODCheckerObjectStructure(`ot-ticket-forms:${questionType}-question`,{
    children:[
        {key:"type",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:unsupported-question-type",{choices:[questionType]})}
    ],
    custom:(checker,value,locationTrace,id,docs) => {
        const lt = checker.locationTraceDeref(locationTrace)
        checker.createMessage(
            "ot-ticket-forms:unsupported-question-type",
            "error",
            `Question type "${questionType}" is not supported by the current ticket forms modal runtime.`,
            lt,
            null,
            [questionType],
            id,
            docs
        )
        void value
        return false
    }
})

export const formsConfigStructure = new api.ODCheckerArrayStructure("ot-ticket-forms:forms",{allowedTypes:["object"],propertyChecker:new api.ODCheckerObjectStructure("ot-ticket-forms:forms",{children:[
    //FORM STRUCTURE
    {key:"id",optional:false,priority:0,checker:new api.ODCheckerCustomStructure_UniqueId("ot-ticket-forms:form-id","ot-ticket-forms","form-id",{regex:/^[A-Za-z0-9-éèçàêâôûîñ]+$/,minLength:3,maxLength:40})},
    {key:"name",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:form-name",{minLength:1,maxLength:45})},
    {key:"description",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:form-description",{maxLength:4096})},
    {key:"color",optional:false,priority:0,checker:new api.ODCheckerCustomStructure_HexColor("ot-ticket-forms:form-color",true,false)},

    {key:"answerTarget",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:answer-target",{choices:["response_channel","ticket_managed_record"]})},
    {key:"responseChannel",optional:false,priority:0,checker:new api.ODCheckerCustomStructure_DiscordId("ot-ticket-forms:responses-channel","channel",true,[],{})}, // Empty allowed
    {key:"autoSendOptionIds",optional:false,priority:0,checker:new api.ODCheckerCustomStructure_UniqueIdArray("ot-ticket-forms:auto-send-ticket","openticket","option-ids","option-ids-used",{allowDoubles:false,maxLength:25})},

    //QUESTION STRUCTURE
    {key:"questions",optional:false,priority:0,checker:new api.ODCheckerArrayStructure("ot-ticket-forms:questions",{allowedTypes:["object"],minLength:1,propertyChecker:new api.ODCheckerObjectSwitchStructure("ot-ticket-forms:question-switch",{objects:[
        //SHORT QUESTION STRUCTURE
        {name:"short",priority:0,properties:[{key:"type",value:"short"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:short-question",{children:[
            {key:"position",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-position",{min:1,floatAllowed:false,negativeAllowed:false})},
            {key:"question",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question",{minLength:1,maxLength:45})},
            {key:"optional",optional:false,priority:0,checker:new api.ODCheckerBooleanStructure("ot-ticket-forms:question-optional",{})},
            {key:"placeholder",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question-placeholder",{maxLength:100})},
            {key:"maxLength",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-maxlength",{min:1,max:1023,floatAllowed:false,negativeAllowed:false})},

        ]})},
        //PARAGRAPH QUESTION STRUCTURE
        {name:"paragraph",priority:0,properties:[{key:"type",value:"paragraph"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:paragraph-question",{children:[
            {key:"position",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-position",{min:1,floatAllowed:false,negativeAllowed:false})},
            {key:"question",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question",{minLength:1,maxLength:45})},
            {key:"optional",optional:false,priority:0,checker:new api.ODCheckerBooleanStructure("ot-ticket-forms:question-optional",{})},
            {key:"placeholder",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question-placeholder",{maxLength:100})},
            {key:"maxLength",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-maxlength",{min:1,max:1023,floatAllowed:false,negativeAllowed:false})},
        ]})},
        //STRING SELECT QUESTION STRUCTURE
        {name:"string_select",priority:0,properties:[{key:"type",value:"string_select"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:string-select-question",{children:[
            ...sharedModalSelectChildren("ot-ticket-forms:string-select"),
            {key:"choices",optional:false,priority:0,checker:new api.ODCheckerArrayStructure("ot-ticket-forms:string-select-question-choices",{allowedTypes:["object"],minLength:1,maxLength:25,propertyChecker:new api.ODCheckerObjectStructure("ot-ticket-forms:string-select-question-choice",{children:[
                {key:"label",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:string-select-choice-label",{minLength:1,maxLength:100})},
                {key:"value",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:string-select-choice-value",{minLength:1,maxLength:100})},
                {key:"description",optional:true,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:string-select-choice-description",{maxLength:100})},
                {key:"emoji",optional:true,priority:0,checker:new api.ODCheckerCustomStructure_EmojiString("forms:string-select-choice-emoji",0,1,true)},
            ]})})}
        ]})},
        //USER SELECT QUESTION STRUCTURE
        {name:"user_select",priority:0,properties:[{key:"type",value:"user_select"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:user-select-question",{children:[
            ...sharedModalSelectChildren("ot-ticket-forms:user-select")
        ]})},
        //ROLE SELECT QUESTION STRUCTURE
        {name:"role_select",priority:0,properties:[{key:"type",value:"role_select"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:role-select-question",{children:[
            ...sharedModalSelectChildren("ot-ticket-forms:role-select")
        ]})},
        //CHANNEL SELECT QUESTION STRUCTURE
        {name:"channel_select",priority:0,properties:[{key:"type",value:"channel_select"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:channel-select-question",{children:[
            ...sharedModalSelectChildren("ot-ticket-forms:channel-select"),
            {key:"channelTypes",optional:true,priority:0,checker:new api.ODCheckerArrayStructure("ot-ticket-forms:channel-select-channel-types",{allowedTypes:["number"],minLength:1,maxLength:25,propertyChecker:new api.ODCheckerNumberStructure("ot-ticket-forms:channel-select-channel-type",{min:0,max:99,floatAllowed:false,negativeAllowed:false})})},
        ]})},
        //MENTIONABLE SELECT QUESTION STRUCTURE
        {name:"mentionable_select",priority:0,properties:[{key:"type",value:"mentionable_select"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:mentionable-select-question",{children:[
            ...sharedModalSelectChildren("ot-ticket-forms:mentionable-select")
        ]})},
        //FILE UPLOAD QUESTION STRUCTURE
        {name:"file_upload",priority:0,properties:[{key:"type",value:"file_upload"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:file-upload-question",{children:[
            {key:"position",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-position",{min:1,floatAllowed:false,negativeAllowed:false})},
            {key:"question",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question",{minLength:1,maxLength:45})},
            {key:"optional",optional:false,priority:0,checker:new api.ODCheckerBooleanStructure("ot-ticket-forms:question-optional",{})},
            {key:"minFiles",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:file-upload-min-files",{min:0,max:10,floatAllowed:false,negativeAllowed:false})},
            {key:"maxFiles",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:file-upload-max-files",{min:1,max:10,floatAllowed:false,negativeAllowed:false})},
            {key:"allowExecutables",optional:false,priority:0,checker:new api.ODCheckerBooleanStructure("ot-ticket-forms:file-upload-allow-executables",{})},
            {key:"allowZipFiles",optional:false,priority:0,checker:new api.ODCheckerBooleanStructure("ot-ticket-forms:file-upload-allow-zip",{})},
        ]})},
        //EXPLICITLY UNSUPPORTED FUTURE MODAL FAMILIES
        {name:"radio_group",priority:0,properties:[{key:"type",value:"radio_group"}],checker:unsupportedQuestionChecker("radio_group")},
        {name:"checkbox_group",priority:0,properties:[{key:"type",value:"checkbox_group"}],checker:unsupportedQuestionChecker("checkbox_group")},
        {name:"checkbox",priority:0,properties:[{key:"type",value:"checkbox"}],checker:unsupportedQuestionChecker("checkbox")},
        //DROPDOWN QUESTION STRUCTURE
        {name:"dropdown",priority:0,properties:[{key:"type",value:"dropdown"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:dropdown-question",{children:[
            {key:"position",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-position",{min:1,floatAllowed:false,negativeAllowed:false})},
            {key:"question",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question",{minLength:1,maxLength:4096})},
            {key:"placeholder",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question-placeholder",{maxLength:150})},
            {key:"minAnswerChoices",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-min-choices",{min:0,max:25,floatAllowed:false,negativeAllowed:false})},
            {key:"maxAnswerChoices",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-max-choices",{min:1,max:25,floatAllowed:false,negativeAllowed:false})},
            
            //CHOICES STRUCTURE
            {key:"choices",optional:false,priority:0,checker:new api.ODCheckerArrayStructure("ot-ticket-forms:question-choices",{allowedTypes:["object"],minLength:1,maxLength:25,propertyChecker:new api.ODCheckerObjectStructure("ot-ticket-forms:question-choice",{children:[
                {key:"name",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question-name",{minLength:1,maxLength:100})},
                {key:"emoji",optional:false,priority:0,checker:new api.ODCheckerCustomStructure_EmojiString("forms:question-choice-emoji",0,1,true)},
                {key:"description",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question-choice-description",{maxLength:100})},
            ]})})}
        ]})},
        //BUTTON QUESTION STRUCTURE
        {name:"button",priority:0,properties:[{key:"type",value:"button"}],checker:new api.ODCheckerObjectStructure("ot-ticket-forms:button-question",{children:[
            {key:"position",optional:false,priority:0,checker:new api.ODCheckerNumberStructure("ot-ticket-forms:question-position",{min:1,floatAllowed:false,negativeAllowed:false})},
            {key:"question",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question",{minLength:1,maxLength:4096})},
            // CHOICES STRUCTURE
            {key:"choices",optional:false,priority:0,checker:new api.ODCheckerArrayStructure("ot-ticket-forms:question-choices",{allowedTypes:["object"],minLength:1,maxLength:25,propertyChecker:new api.ODCheckerObjectStructure("ot-ticket-forms:question-choice",{children:[
                {key:"name",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question-name",{minLength:1,maxLength:40})},
                {key:"emoji",optional:false,priority:0,checker:new api.ODCheckerCustomStructure_EmojiString("forms:question-choice-emoji",0,1,true)},
                {key:"color",optional:false,priority:0,checker:new api.ODCheckerStringStructure("ot-ticket-forms:question-choice-color",{choices:["gray","red","green","blue"]})},
            ]})})},
        ]})}
    ]})})}
]})})
