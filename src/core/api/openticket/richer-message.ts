///////////////////////////////////////
//OPENTICKET RICHER MESSAGE HELPERS
///////////////////////////////////////
import * as discord from "discord.js"
import { ODComponentBuildResult, ODEmbedBuildResult, ODMessageInstance } from "../modules/builder"

export const OD_RICHER_MESSAGE_LAYOUT_VERSION = "slice-013a-components-v2"
export const OD_RICHER_MESSAGE_DISABLE_ENV = "OPEN_TICKET_DISABLE_RICHER_MESSAGES"

const COMPONENT_TYPE_TEXT_DISPLAY = discord.ComponentType.TextDisplay
const COMPONENT_TYPE_SEPARATOR = discord.ComponentType.Separator
const COMPONENT_TYPE_CONTAINER = discord.ComponentType.Container
const MAX_TEXT_DISPLAY_LENGTH = 3900
const MAX_CONTAINER_COMPONENTS = 10

type MessageTopLevelComponent = NonNullable<discord.MessageCreateOptions["components"]>[number]

export interface ODRicherMessagePayloadInput {
    surfaceId: string
    content?: string|null
    embeds?: readonly discord.EmbedBuilder[]
    actionRows?: readonly discord.ActionRowBuilder<discord.MessageActionRowComponentBuilder>[]
    legacyComponents?: readonly ODComponentBuildResult[]
}

export interface ODRicherMessageSurfaceOptions {
    surfaceId: string
}

function hasComponentsV2Flag(flags: unknown): boolean {
    if (Array.isArray(flags)) {
        return flags.includes(discord.MessageFlags.IsComponentsV2) || flags.includes("IsComponentsV2")
    }
    if (typeof flags == "number") return (flags & discord.MessageFlags.IsComponentsV2) != 0
    if (typeof flags == "string") return flags == "IsComponentsV2"
    return false
}

function richerMessagesDisabled(): boolean {
    const value = process.env[OD_RICHER_MESSAGE_DISABLE_ENV]
    return value == "1" || value?.toLowerCase() == "true"
}

export function isRicherMessageSupported(): boolean {
    return !richerMessagesDisabled()
        && typeof discord.MessageFlags.IsComponentsV2 == "number"
        && typeof COMPONENT_TYPE_TEXT_DISPLAY == "number"
        && typeof COMPONENT_TYPE_SEPARATOR == "number"
        && typeof COMPONENT_TYPE_CONTAINER == "number"
}

function normalizeText(value: unknown): string|null {
    if (typeof value != "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function splitTextDisplayContent(content: string): string[] {
    const final: string[] = []
    let remaining = content.trim()
    while (remaining.length > MAX_TEXT_DISPLAY_LENGTH) {
        const preferredBreak = remaining.lastIndexOf("\n", MAX_TEXT_DISPLAY_LENGTH)
        const splitAt = preferredBreak > 0 ? preferredBreak : MAX_TEXT_DISPLAY_LENGTH
        final.push(remaining.slice(0, splitAt).trim())
        remaining = remaining.slice(splitAt).trim()
    }
    if (remaining.length > 0) final.push(remaining)
    return final
}

function serializeEmbed(embed: discord.EmbedBuilder): { text: string, color: number|null }|null {
    const data = embed.toJSON()
    if (data.image || data.thumbnail) return null

    const parts: string[] = []
    const author = normalizeText(data.author?.name)
    const title = normalizeText(data.title)
    const description = normalizeText(data.description)
    const footer = normalizeText(data.footer?.text)

    if (author) parts.push(`**${author}**`)
    if (title) parts.push(`## ${title}`)
    if (description) parts.push(description)
    for (const field of data.fields ?? []) {
        const name = normalizeText(field.name)
        const value = normalizeText(field.value)
        if (name && value) parts.push(`**${name}**\n${value}`)
        else if (value) parts.push(value)
    }
    if (footer) parts.push(`_${footer}_`)

    const text = parts.join("\n\n").trim()
    if (text.length < 1) return null
    return {
        text,
        color: typeof data.color == "number" ? data.color : null
    }
}

function buildTextComponents(input: ODRicherMessagePayloadInput): { components: MessageTopLevelComponent[], accentColor: number|null }|null {
    const sections: string[] = []
    let accentColor: number|null = null
    const content = normalizeText(input.content)
    if (content) sections.push(content)

    for (const embed of input.embeds ?? []) {
        const serialized = serializeEmbed(embed)
        if (!serialized) return null
        sections.push(serialized.text)
        if (accentColor == null && serialized.color != null) accentColor = serialized.color
    }

    if (sections.length < 1) return null

    const textComponents: MessageTopLevelComponent[] = []
    for (const section of sections) {
        for (const chunk of splitTextDisplayContent(section)) {
            textComponents.push({
                type: COMPONENT_TYPE_TEXT_DISPLAY,
                content: chunk
            } as MessageTopLevelComponent)
        }
    }
    if (textComponents.length < 1 || textComponents.length > MAX_CONTAINER_COMPONENTS) return null

    return { components: textComponents, accentColor }
}

function compileLegacyComponents(components: readonly ODComponentBuildResult[]): discord.ActionRowBuilder<discord.MessageActionRowComponentBuilder>[]|null {
    const componentArray: discord.ActionRowBuilder<discord.MessageActionRowComponentBuilder>[] = []
    let currentRow: discord.ActionRowBuilder<discord.MessageActionRowComponentBuilder> = new discord.ActionRowBuilder()

    for (const componentResult of components) {
        const component = componentResult.component
        if (component == null) continue
        if (component == "\n") {
            if (currentRow.components.length > 0) {
                componentArray.push(currentRow)
                currentRow = new discord.ActionRowBuilder()
            }
        } else if (component instanceof discord.BaseSelectMenuBuilder) {
            if (currentRow.components.length > 0) {
                componentArray.push(currentRow)
                currentRow = new discord.ActionRowBuilder()
            }
            currentRow.addComponents(component)
            componentArray.push(currentRow)
            currentRow = new discord.ActionRowBuilder()
        } else {
            currentRow.addComponents(component)
        }

        if (currentRow.components.length == 5) {
            componentArray.push(currentRow)
            currentRow = new discord.ActionRowBuilder()
        }
    }

    if (currentRow.components.length > 0) componentArray.push(currentRow)
    return componentArray
}

function buildActionRowComponents(input: ODRicherMessagePayloadInput): MessageTopLevelComponent[]|null {
    const actionRows = [
        ...(input.actionRows ?? []),
        ...(input.legacyComponents ? compileLegacyComponents(input.legacyComponents) ?? [] : [])
    ]
    const final: MessageTopLevelComponent[] = []
    for (const row of actionRows) {
        if (row.components.length < 1) continue
        final.push(row.toJSON() as MessageTopLevelComponent)
    }
    return final
}

export function buildRicherMessagePayload(input: ODRicherMessagePayloadInput): discord.MessageCreateOptions|null {
    if (!isRicherMessageSupported()) return null

    try {
        const text = buildTextComponents(input)
        if (!text) return null
        const actionRows = buildActionRowComponents(input)
        if (!actionRows) return null

        const container = {
            type: COMPONENT_TYPE_CONTAINER,
            accent_color: text.accentColor,
            components: text.components
        } as MessageTopLevelComponent

        return {
            components: [container, ...actionRows],
            flags: [discord.MessageFlags.IsComponentsV2]
        }
    } catch {
        return null
    }
}

export function toRicherMessageEditPayload(payload: discord.MessageCreateOptions): discord.MessageEditOptions {
    if (!hasComponentsV2Flag(payload.flags)) return payload as discord.MessageEditOptions
    return {
        ...payload,
        content: null,
        embeds: []
    } as discord.MessageEditOptions
}

export function applyRicherMessageSurface(
    instance: ODMessageInstance,
    options: ODRicherMessageSurfaceOptions
): boolean {
    const embeds = instance.data.embeds
        .map((embed: ODEmbedBuildResult) => embed.embed)
        .filter((embed): embed is discord.EmbedBuilder => embed instanceof discord.EmbedBuilder)
    const payload = buildRicherMessagePayload({
        surfaceId: options.surfaceId,
        content: instance.data.content,
        embeds,
        legacyComponents: instance.data.components
    })
    if (!payload) return false

    instance.data.content = null
    instance.data.embeds = []
    instance.data.components = []
    Object.assign(instance.data.additionalOptions as discord.MessageCreateOptions, payload)
    return true
}
