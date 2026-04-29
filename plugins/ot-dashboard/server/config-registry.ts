export type ManagedConfigId = "general" | "options" | "panels" | "questions" | "support-teams" | "integration-profiles" | "ai-assist-profiles" | "knowledge-sources" | "transcripts"

export interface ManagedConfigDefinition {
  id: ManagedConfigId
  fileName: string
  visualPath: string
  rawPath: string
  titleKey: string
  descriptionKey: string
  icon: string
  kind: "object" | "array"
}

export const MANAGED_CONFIGS: ManagedConfigDefinition[] = [
  {
    id: "general",
    fileName: "general.json",
    visualPath: "/visual/general",
    rawPath: "/config/general",
    titleKey: "admin.cards.general.title",
    descriptionKey: "admin.cards.general.description",
    icon: "settings",
    kind: "object"
  },
  {
    id: "options",
    fileName: "options.json",
    visualPath: "/visual/options",
    rawPath: "/config/options",
    titleKey: "admin.cards.options.title",
    descriptionKey: "admin.cards.options.description",
    icon: "layers",
    kind: "array"
  },
  {
    id: "panels",
    fileName: "panels.json",
    visualPath: "/visual/panels",
    rawPath: "/config/panels",
    titleKey: "admin.cards.panels.title",
    descriptionKey: "admin.cards.panels.description",
    icon: "layout",
    kind: "array"
  },
  {
    id: "questions",
    fileName: "questions.json",
    visualPath: "/visual/questions",
    rawPath: "/config/questions",
    titleKey: "admin.cards.questions.title",
    descriptionKey: "admin.cards.questions.description",
    icon: "help",
    kind: "array"
  },
  {
    id: "support-teams",
    fileName: "support-teams.json",
    visualPath: "/visual/support-teams",
    rawPath: "/config/support-teams",
    titleKey: "admin.cards.supportTeams.title",
    descriptionKey: "admin.cards.supportTeams.description",
    icon: "users",
    kind: "array"
  },
  {
    id: "integration-profiles",
    fileName: "integration-profiles.json",
    visualPath: "/config/integration-profiles",
    rawPath: "/config/integration-profiles",
    titleKey: "admin.cards.integrationProfiles.title",
    descriptionKey: "admin.cards.integrationProfiles.description",
    icon: "plug",
    kind: "array"
  },
  {
    id: "ai-assist-profiles",
    fileName: "ai-assist-profiles.json",
    visualPath: "/config/ai-assist-profiles",
    rawPath: "/config/ai-assist-profiles",
    titleKey: "admin.cards.aiAssistProfiles.title",
    descriptionKey: "admin.cards.aiAssistProfiles.description",
    icon: "sparkles",
    kind: "array"
  },
  {
    id: "knowledge-sources",
    fileName: "knowledge-sources.json",
    visualPath: "/config/knowledge-sources",
    rawPath: "/config/knowledge-sources",
    titleKey: "admin.cards.knowledgeSources.title",
    descriptionKey: "admin.cards.knowledgeSources.description",
    icon: "book-open",
    kind: "array"
  },
  {
    id: "transcripts",
    fileName: "transcripts.json",
    visualPath: "/visual/transcripts",
    rawPath: "/config/transcripts",
    titleKey: "admin.cards.transcripts.title",
    descriptionKey: "admin.cards.transcripts.description",
    icon: "file",
    kind: "object"
  }
]

export function getManagedConfig(id: string): ManagedConfigDefinition | undefined {
  return MANAGED_CONFIGS.find((item) => item.id === id)
}
