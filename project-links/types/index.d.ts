export type LinkItem = { title: string; url: string; note?: string }
export type LinkGroup = { title: string; items: LinkItem[] }

declare module 'claude-code' {
  interface PluginState {
    'project-links': { groups: LinkGroup[]; loadedAt: string; error: string; raw: string }
  }
}
