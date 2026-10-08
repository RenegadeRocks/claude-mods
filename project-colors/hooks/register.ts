// project-colors: each project folder keeps its own prompt-bar colour and a
// session name. A new folder gets a colour picked from its name; type /color
// or /rename yourself and that project remembers your choice from then on.

import type { EngineInterface, Register } from 'claude-code'

type Project = { color?: string; name?: string }
type Projects = Record<string, Project>

// what /color took as of Oct 2026; replaced by the list /color prints if it refuses one
const DEFAULT_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']

function keyOf(root: string): string {
  return root.replace(/[\\/]+$/, '').toLowerCase()
}

function folderName(root: string): string {
  return root.split(/[\\/]/).filter(Boolean).pop() ?? root
}

/** The same folder name always lands on the same colour. */
function pickColor(name: string, colors: string[]): string {
  let hash = 0
  for (const ch of name.toLowerCase()) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0
  return colors[hash % colors.length] ?? 'blue'
}

async function loadProjects($: EngineInterface): Promise<Projects> {
  const saved = await $.store.get('projects')
  return saved && typeof saved === 'object' ? (saved as Projects) : {}
}

async function thisProject($: EngineInterface): Promise<{ key: string; folder: string; projects: Projects }> {
  const root = await $.session.root()
  return { key: keyOf(root), folder: folderName(root), projects: await loadProjects($) }
}

async function remember($: EngineInterface, change: Project) {
  try {
    const { key, projects } = await thisProject($)
    await $.store.set('projects', { ...projects, [key]: { ...projects[key], ...change } })
  } catch {
    // forgetting a choice is harmless
  }
}

/** Whether `/project-colors off` is in force; read from the store each time, so it holds across sessions. */
async function isOff($: EngineInterface): Promise<boolean> {
  return (await $.store.get('isOn')) === false
}

/** The colours /color takes: the list it last printed, else the known ones. */
async function knownColors($: EngineInterface): Promise<string[]> {
  const saved = await $.store.get('colors')
  return Array.isArray(saved) && saved.length > 0 ? (saved as string[]) : DEFAULT_COLORS
}

/**
 * Sets the prompt bar to this project's colour, choosing and saving one for a
 * new project. A project you set to `default` yourself stays plain.
 */
async function applyColor($: EngineInterface) {
  try {
    if (await isOff($)) return
    const { key, folder, projects } = await thisProject($)
    if (projects[key]?.color === 'default') return
    const colors = await knownColors($)
    let color = projects[key]?.color ?? pickColor(folder, colors)
    const { text } = await $.command.run({ command: 'color', args: color } as never)
    // a colour /color no longer takes: learn the real list from its answer and pick again
    const listed = /Available colors:\s*(.+)$/im.exec(text ?? '')
    if (listed?.[1]) {
      const valid = listed[1]
        .split(/[,|\s]+/)
        .map(c => c.trim())
        .filter(c => c && c !== 'default')
      if (valid.length === 0) return
      await $.store.set('colors', valid)
      color = pickColor(folder, valid)
      await $.command.run({ command: 'color', args: color } as never)
    }
    if (projects[key]?.color !== color) await remember($, { color })
  } catch {
    // no colour this time; the default stays
  }
}

/** Names a fresh session after its project: the name you gave it before, else the folder's. */
async function applyName($: EngineInterface) {
  try {
    if (await isOff($)) return
    const { key, folder, projects } = await thisProject($)
    await $.command.run({ command: 'rename', args: projects[key]?.name ?? folder } as never)
  } catch {
    // unnamed is fine
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'project-colors',
      description: "Show this project's colour and name, forget them, or switch the mod off and on: /project-colors [reset|off|on]",
    })
    const result = await next(e)
    void applyColor($)
    return result
  })

  // the classic start event says whether the session is new and already named
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'startup' && !e.session_title) void applyName($)
    return result
  })

  // learn from what you choose yourself; this mod's own runs come from a plugin
  on('command.run', { command: 'color' }, async ($, e, next) => {
    const result = await next(e)
    // only a colour /color took; a typo it refused (it lists the colours then) is not remembered
    const color = e.args.trim().toLowerCase()
    const isRefused = /invalid|cannot|available colors/i.test(result.text ?? '')
    if (e.origin.kind === 'composer' && color && !isRefused) {
      void remember($, { color })
    }
    return result
  })

  on('command.run', { command: 'rename' }, async ($, e, next) => {
    const result = await next(e)
    const name = e.args.trim()
    if (e.origin.kind === 'composer' && name) void remember($, { name })
    return result
  })

  on('command.run', { command: 'project-colors' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on' || arg === 'toggle') {
      const isOn = arg === 'on' ? true : arg === 'off' ? false : await isOff($)
      await $.store.set('isOn', isOn)
      if (isOn) {
        void applyColor($)
        return { text: "Project colours on. This project's colour is back." }
      }
      // a command cannot run another from inside itself: reset the colour just after it ends
      $.clock.after(0, () => void $.command.run({ command: 'color', args: 'default' } as never).catch(() => {}))
      return { text: 'Project colours off, in every session until /project-colors on. Your saved colours and names are kept.' }
    }

    const { key, folder, projects } = await thisProject($)
    if (arg === 'reset') {
      const { [key]: _forgotten, ...rest } = projects
      await $.store.set('projects', rest)
      return { text: `Forgot ${folder}'s colour and name. The next session picks fresh ones.` }
    }
    const p = projects[key] ?? {}
    const state = (await isOff($)) ? ' Project colours are off; /project-colors on brings them back.' : ''
    return {
      text: `${folder}: colour ${p.color ?? 'not set yet'}, name ${p.name ?? `${folder} (from the folder)`}. Use /color or /rename to change them; this project remembers.${state}`,
    }
  })
}
