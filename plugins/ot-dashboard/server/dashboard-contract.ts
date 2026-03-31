export const STATUS_TYPES = ["playing", "listening", "watching", "custom"] as const
export const STATUS_MODES = ["online", "idle", "dnd", "invisible"] as const
export const EMOJI_STYLES = ["before", "after", "double", "disabled"] as const

export const OPTION_TYPES = ["ticket", "website", "role"] as const
export const OPTION_BUTTON_COLORS = ["gray", "red", "green", "blue"] as const
export const OPTION_CHANNEL_SUFFIXES = [
  "user-name",
  "user-nickname",
  "user-id",
  "random-number",
  "random-hex",
  "counter-dynamic",
  "counter-fixed"
] as const
export const ROLE_MODES = ["add", "remove", "add&remove"] as const

export const PANEL_DESCRIBE_LAYOUTS = ["simple", "normal", "detailed"] as const
export const PANEL_DROPDOWN_OPTION_TYPE = "ticket"

export const QUESTION_TYPES = ["short", "paragraph"] as const
export const QUESTION_ID_PATTERN = "^[A-Za-z0-9-éèçàêâôûî]+$"
export const QUESTION_ID_REGEX = new RegExp(QUESTION_ID_PATTERN)
export const QUESTION_ID_MIN_LENGTH = 3
export const QUESTION_ID_MAX_LENGTH = 40
export const QUESTION_NAME_MIN_LENGTH = 3
export const QUESTION_NAME_MAX_LENGTH = 45
export const QUESTION_PLACEHOLDER_MAX_LENGTH = 100
export const QUESTION_LENGTH_MIN = 0
export const QUESTION_LENGTH_MAX = 1024

export const TRANSCRIPT_MODES = ["html", "text"] as const
export const TRANSCRIPT_TEXT_LAYOUTS = ["simple", "normal", "detailed"] as const
export const TRANSCRIPT_FILE_MODES = ["custom", "channel-name", "channel-id", "user-name", "user-id"] as const

export function isOneOf<T extends readonly string[]>(value: string, choices: T): value is T[number] {
  return choices.includes(value as T[number])
}

export function assertOneOf(value: string, choices: readonly string[], label: string): void {
  if (!choices.includes(value)) {
    throw new Error(`${label} must be one of: ${choices.join(", ")}`)
  }
}
