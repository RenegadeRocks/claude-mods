import { expect, mock, test } from 'claude-code/testing'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<Body>[0]
type On = Parameters<Body>[1]

const ran: string[] = []
let root = 'E:\\AI Data\\ClaudeCode\\Creative\\BlenderAnimation'
let validColors: string[] | null = null

function world(on: On, store: Record<string, unknown> = {}) {
  ran.length = 0
  validColors = null
  const clock = mock.clock(on, { now: 0 })
  mock.store(on, store)
  on('session.root', () => ({ value: root }) as never)
  on('session.start', () => ({ cwd: root }))
  on('command.register', () => ({ value: { command: 'project-colors' } }) as never)
  on('classic.SessionStart', () => ({}) as never)
  on('command.run', (_, e) => {
    ran.push(`/${e.command} ${e.args}`)
    if (e.command === 'color' && validColors && !validColors.includes(e.args)) {
      return { text: `Invalid color "${e.args}". Available colors: ${validColors.join(', ')}, default` } as never
    }
    return { text: 'ok' } as never
  })
  return clock
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const typed = ($: Engine, command: string, args: string) =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } } as never)

test('a project gets the same colour every time, and a fresh session its name', async ($, on) => {
  const clock = world(on)
  await $.session.start(start)
  await $.classic.SessionStart({ source: 'startup' } as never)
  await clock.settle()
  const first = ran.find(r => r.startsWith('/color '))
  expect(first).toMatch(/^\/color (red|blue|green|yellow|purple|orange|pink|cyan)$/)
  expect(ran).toContain('/rename BlenderAnimation')

  ran.length = 0
  await $.session.start(start)
  await clock.settle()
  expect(ran).toContain(first)
})

test('a resumed or already-named session keeps its name', async ($, on) => {
  const clock = world(on)
  await $.session.start(start)
  await $.classic.SessionStart({ source: 'resume' } as never)
  await $.classic.SessionStart({ source: 'startup', session_title: 'claude-mods' } as never)
  await clock.settle()
  expect(ran.some(r => r.startsWith('/rename'))).toBe(false)
})

test('your own /color and /rename are remembered for the project', async ($, on) => {
  const clock = world(on)
  await $.session.start(start)
  await clock.settle()
  await typed($, 'color', 'pink')
  await typed($, 'rename', 'Fairy mocap')
  await clock.settle()

  ran.length = 0
  await $.session.start(start)
  await $.classic.SessionStart({ source: 'startup' } as never)
  await clock.settle()
  expect(ran).toContain('/color pink')
  expect(ran).toContain('/rename Fairy mocap')
})

test('when /color refuses a colour, it learns the real list and picks again', async ($, on) => {
  const clock = world(on)
  validColors = ['magenta', 'teal']
  await $.session.start(start)
  await clock.settle()
  const colours = ran.filter(r => r.startsWith('/color '))
  expect(colours.length).toBe(2)
  expect(colours[1]).toMatch(/^\/color (magenta|teal)$/)
})

test('/project-colors shows the project and reset forgets it', async ($, on) => {
  const clock = world(on)
  await $.session.start(start)
  await clock.settle()
  expect((await typed($, 'project-colors', '')).text).toMatch(/^BlenderAnimation: colour \w+/)
  expect((await typed($, 'project-colors', 'reset')).text).toMatch(/^Forgot BlenderAnimation/)
  expect((await typed($, 'project-colors', '')).text).toMatch(/colour not set yet/)
})
