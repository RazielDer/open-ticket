import test from "node:test"
import assert from "node:assert/strict"
import * as discord from "discord.js"

import {
    ODModal,
    getModalInputSupport
} from "../../../src/core/api/modules/builder.js"
import { ODModalResponderInstanceValues } from "../../../src/core/api/modules/responder.js"

async function withCapturedOTSystemErrors<T>(callback:() => Promise<T>): Promise<{ result:T, errors:unknown[] }> {
    const errors: unknown[] = []
    const emit = process.emit
    process.emit = function patchedEmit(event: string | symbol, ...args: any[]) {
        if (event == "uncaughtException"){
            errors.push(args[0])
            return true
        }
        return emit.call(this,event,...args)
    } as typeof process.emit

    try {
        return {result:await callback(),errors}
    } finally {
        process.emit = emit
    }
}

test("legacy text-question modals still compile through action-row text inputs", async () => {
    const modal = new ODModal("test:legacy-modal",(instance) => {
        instance.setCustomId("legacy-modal")
        instance.setTitle("Legacy Modal")
        instance.addQuestion({
            customId:"reason",
            label:"Reason",
            style:"paragraph",
            required:true,
            placeholder:"Tell us why"
        })
    })

    const result = await modal.build("test",{})
    const json = result.modal.toJSON()

    assert.equal(json.custom_id, "legacy-modal")
    assert.equal(json.title, "Legacy Modal")
    assert.equal(json.components.length, 1)
    assert.equal(json.components[0].type, discord.ComponentType.ActionRow)
    assert.equal(json.components[0].components[0].type, discord.ComponentType.TextInput)
    assert.equal(json.components[0].components[0].custom_id, "reason")
    assert.equal(json.components[0].components[0].style, discord.TextInputStyle.Paragraph)
})

test("current reason-style modals remain on the legacy question path", async () => {
    const modal = new ODModal("test:reason-modal",(instance) => {
        instance.setCustomId("od:close-ticket-reason_ticket-1_button")
        instance.setTitle("Close")
        instance.addQuestion({
            customId:"reason",
            label:"Reason",
            style:"paragraph",
            required:true
        })
    })

    const json = (await modal.build("button",{})).modal.toJSON()

    assert.equal(json.components.length, 1)
    assert.equal(json.components[0].type, discord.ComponentType.ActionRow)
    assert.equal(json.components[0].components[0].custom_id, "reason")
    assert.equal(json.components[0].components[0].type, discord.ComponentType.TextInput)
})

test("component-mode modals compile every stable top-level and label child family", async () => {
    const modal = new ODModal("test:component-modal",(instance) => {
        instance.setCustomId("component-modal")
        instance.setTitle("Component Modal")
        instance.addTextDisplayComponent("Use the inputs below.")
        instance.addLabelComponent("Text", {kind:"text-input", customId:"text", style:"short", required:true})
        instance.addLabelComponent("String", {
            kind:"string-select",
            customId:"string",
            minValues:1,
            maxValues:2,
            required:true,
            options:[
                {label:"One",value:"one"},
                {label:"Two",value:"two",description:"Second option"}
            ]
        })
        instance.addLabelComponent("User", {kind:"user-select", customId:"user", maxValues:1})
        instance.addLabelComponent("Role", {kind:"role-select", customId:"role", maxValues:1})
        instance.addLabelComponent("Channel", {
            kind:"channel-select",
            customId:"channel",
            channelTypes:[discord.ChannelType.GuildText]
        })
        instance.addLabelComponent("Mentionable", {kind:"mentionable-select", customId:"mentionable"})
        instance.addLabelComponent("Files", {
            kind:"file-upload",
            customId:"files",
            minFiles:0,
            maxFiles:2,
            required:false,
            attachmentPolicy:"later-slice-owned"
        })
    })

    const json = (await modal.build("test",{})).modal.toJSON()
    const components = json.components as any[]
    const topLevelTypes = components.map((component) => component.type)
    const childTypes = components
        .filter((component) => component.type == discord.ComponentType.Label)
        .map((component) => component.component.type)

    assert.deepEqual(topLevelTypes, [
        discord.ComponentType.TextDisplay,
        discord.ComponentType.Label,
        discord.ComponentType.Label,
        discord.ComponentType.Label,
        discord.ComponentType.Label,
        discord.ComponentType.Label,
        discord.ComponentType.Label,
        discord.ComponentType.Label
    ])
    assert.deepEqual(childTypes, [
        discord.ComponentType.TextInput,
        discord.ComponentType.StringSelect,
        discord.ComponentType.UserSelect,
        discord.ComponentType.RoleSelect,
        discord.ComponentType.ChannelSelect,
        discord.ComponentType.MentionableSelect,
        discord.ComponentType.FileUpload
    ])
    assert.equal(components[1].component.custom_id, "text")
    assert.equal(components[2].component.options[1].description, "Second option")
    assert.deepEqual(components[5].component.channel_types, [discord.ChannelType.GuildText])
    assert.equal(components[7].component.max_values, 2)
})

test("modal support guard exposes the locked stable and unsupported input families", () => {
    for (const kind of ["text-input","string-select","user-select","role-select","channel-select","mentionable-select","file-upload"] as const) {
        assert.deepEqual(getModalInputSupport(kind), {status:"stable",reason:null})
    }

    for (const kind of ["radio-group","checkbox-group","checkbox"] as const) {
        const support = getModalInputSupport(kind)
        assert.equal(support.status, "unsupported")
        assert.equal(typeof support.reason, "string")
    }
})

test("mixed legacy-plus-component modals fail closed through the unknown modal fallback", async () => {
    const modal = new ODModal("test:mixed-modal",(instance) => {
        instance.setCustomId("mixed-modal")
        instance.setTitle("Mixed Modal")
        instance.addQuestion({customId:"legacy",label:"Legacy",style:"short"})
        instance.addTextDisplayComponent("Component mode")
    })

    const {result,errors} = await withCapturedOTSystemErrors(() => modal.build("test",{}))
    const json = result.modal.toJSON()

    assert.equal(json.custom_id, "od:unknown-modal")
    assert.equal(json.components.length, 1)
    assert.equal(json.components[0].type, discord.ComponentType.ActionRow)
    assert.equal(json.components[0].components[0].custom_id, "error")
    assert.equal(errors.length, 2)
    assert.match(String(errors[1]), /mixed legacy questions/)
})

test("unsupported component input kinds refuse to build silently", async () => {
    const modal = new ODModal("test:unsupported-modal",(instance) => {
        instance.setCustomId("unsupported-modal")
        instance.setTitle("Unsupported Modal")
        instance.addLabelComponent("Future", {kind:"checkbox", customId:"future-checkbox"})
    })

    const {result,errors} = await withCapturedOTSystemErrors(() => modal.build("test",{}))
    const json = result.modal.toJSON()
    const components = json.components as any[]

    assert.equal(json.custom_id, "od:unknown-modal")
    assert.equal(components[0].components[0].custom_id, "error")
    assert.equal(errors.length, 2)
    assert.match(String(errors[1]), /checkbox/)
})

test("modal submit values expose typed getters for supported component families", () => {
    const users = new discord.Collection<string, any>([["user-1",{id:"user-1"}]])
    const roles = new discord.Collection<string, any>([["role-1",{id:"role-1"}]])
    const channels = new discord.Collection<string, any>([["channel-1",{id:"channel-1",type:discord.ChannelType.GuildText}]])
    const attachments = new discord.Collection<string, any>([["file-1",{id:"file-1",name:"proof.png"}]])
    const members = new discord.Collection<string, any>()

    const fields = {
        fields:new discord.Collection<string, discord.ModalData>([
            ["text",{id:1,type:discord.ComponentType.TextInput,customId:"text",value:"hello"}],
            ["string",{id:2,type:discord.ComponentType.StringSelect,customId:"string",values:["one","two"]}],
            ["user",{id:3,type:discord.ComponentType.UserSelect,customId:"user",values:["user-1"],users}],
            ["role",{id:4,type:discord.ComponentType.RoleSelect,customId:"role",values:["role-1"],roles}],
            ["channel",{id:5,type:discord.ComponentType.ChannelSelect,customId:"channel",values:["channel-1"],channels}],
            ["mentionable",{id:6,type:discord.ComponentType.MentionableSelect,customId:"mentionable",values:["user-1","role-1"],users,roles,members}],
            ["files",{id:7,type:discord.ComponentType.FileUpload,customId:"files",values:["file-1"],attachments}]
        ]),
        getSelectedUsers:() => users,
        getSelectedRoles:() => roles,
        getSelectedChannels:() => channels,
        getSelectedMentionables:() => ({users,roles,members}),
        getUploadedFiles:() => attachments
    }
    const values = new ODModalResponderInstanceValues({fields} as any)

    assert.equal(values.getTextField("text", true), "hello")
    assert.deepEqual(values.getStringSelectValues("string", true), ["one","two"])
    assert.equal(values.getField("text", true).type, discord.ComponentType.TextInput)
    assert.equal(values.getSelectedUsers("user", true).get("user-1")?.id, "user-1")
    assert.equal(values.getSelectedRoles("role", true).get("role-1")?.id, "role-1")
    assert.equal(values.getSelectedChannels("channel", true).get("channel-1")?.id, "channel-1")
    assert.equal(values.getSelectedMentionables("mentionable", true).roles.get("role-1")?.id, "role-1")
    assert.equal(values.getUploadedFiles("files", true).get("file-1")?.name, "proof.png")
})

test("modal submit getters fail closed on missing required values and family mismatches", () => {
    const fields = {
        fields:new discord.Collection<string, discord.ModalData>([
            ["text",{id:1,type:discord.ComponentType.TextInput,customId:"text",value:"hello"}]
        ]),
        getSelectedUsers:() => null,
        getSelectedRoles:() => null,
        getSelectedChannels:() => null,
        getSelectedMentionables:() => null,
        getUploadedFiles:() => null
    }
    const values = new ODModalResponderInstanceValues({fields} as any)

    assert.equal(values.getTextField("missing", false), null)
    assert.throws(() => values.getTextField("missing", true), /field not found/)
    assert.throws(() => values.getStringSelectValues("text", true), /field not found/)
    assert.throws(() => values.getUploadedFiles("text", true), /field not found/)
})
