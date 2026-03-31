export const TRANSCRIPT_PLUGIN_ID = "ot-html-transcripts" as const
export const TRANSCRIPT_PLUGIN_CONFIG_ID = "ot-html-transcripts:config" as const
export const TRANSCRIPT_PLUGIN_OPTIONS_CHECKER_ID = "ot-html-transcripts:options" as const
export const TRANSCRIPT_PLUGIN_SERVICE_ID = "ot-html-transcripts:service" as const
export const TRANSCRIPT_COMMAND_ID = "ot-html-transcripts:transcript" as const
export const TRANSCRIPT_STATUS_MESSAGE_ID = "ot-html-transcripts:command-status" as const
export const TRANSCRIPT_STATUS_EMBED_ID = "ot-html-transcripts:command-status" as const

export const TRANSCRIPT_COMMAND_ACTIONS = ["get", "revoke", "reissue", "delete"] as const
export const TRANSCRIPT_ACCESS_MODES = ["public", "private-discord"] as const

export const TRANSCRIPT_STATUSES = ["building", "active", "partial", "revoked", "deleted", "failed"] as const
export const TRANSCRIPT_LINK_STATUSES = ["active", "revoked", "superseded", "deleted", "expired"] as const
export const TRANSCRIPT_ASSET_STATUSES = ["mirrored", "failed", "skipped"] as const
export const TRANSCRIPT_ACTION_RESULT_STATUSES = ["ok", "not-ready", "error"] as const
export const TRANSCRIPT_OPERATIONAL_SORTS = ["created-desc", "created-asc", "updated-desc", "updated-asc"] as const
