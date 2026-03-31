import { api, opendiscord, utilities } from "#opendiscord"

export async function replaceTranscriptMentions(text: string): Promise<string> {
    const mainServer = opendiscord.client.mainServer
    if (!mainServer) throw new api.ODSystemError("Unknown mainServer! => Required for mention replacement in local HTML transcripts.")

    const userText = await utilities.asyncReplace(text, /<@([0-9]+)>/g, async (_match, id) => {
        const member = await opendiscord.client.fetchGuildMember(mainServer, id)
        return member ? "<@" + member.user.displayName.replace(/\s/g, "&nbsp;") + "> " : id
    })

    const channelText = await utilities.asyncReplace(userText, /<#([0-9]+)>/g, async (_match, id) => {
        const channel = await opendiscord.client.fetchGuildChannel(mainServer, id)
        return channel ? "<#" + channel.name.replace(/\s/g, "&nbsp;") + "> " : id
    })

    const roleText = await utilities.asyncReplace(channelText, /<@&([0-9]+)>/g, async (_match, id) => {
        const role = await opendiscord.client.fetchGuildRole(mainServer, id)
        const textName = role ? role.name.replace(/\s/g, "&nbsp;") : id
        const color = role ? (role.hexColor == "#000000" ? "regular" : role.hexColor) : "regular"
        return "<@&" + textName + "::" + color + "> "
    })

    return await utilities.asyncReplace(roleText, /@(everyone|here)/g, async (_match, id) => {
        return "<@&" + id + "::regular> "
    })
}
