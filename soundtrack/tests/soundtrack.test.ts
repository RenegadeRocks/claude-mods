import { expect, mock, test } from 'claude-code/testing'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<Body>[0]
type On = Parameters<Body>[1]

const played: string[] = []

function world(on: On, os: string | undefined = 'Windows_NT') {
  played.length = 0
  const clock = mock.clock(on, { now: 0 })
  mock.store(on, {})
  mock.env(on, os ? { OS: os } : {})
  on('session.start', () => ({ cwd: '/' }))
  on('command.register', () => ({ value: { command: 'soundtrack' } }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('process.run', (_, e) => {
    const script = e.argv[e.argv.length - 1] ?? ''
    played.push(/\\(\w+)\.wav/.exec(script)?.[1] ?? script)
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('audio.play', (_, e) => {
    const asset = (e.clip as { asset?: string }).asset ?? ''
    played.push(`mac:${/(\w+)\.wav/.exec(asset)?.[1] ?? asset}`)
    return { value: undefined } as never
  })
  return clock
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const turn = (reason: string, agentId?: string) =>
  ({ answer: '', durationMs: 1, isAborted: reason === 'aborted', turnId: 't1', reason, agentId }) as never
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'soundtrack', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } } as never)

test('a turn sounds: start, ticks while tools run, then done', async ($, on) => {
  const clock = world(on)
  await $.session.start(start)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/a' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/b' } as never)
  await clock.advance(3500)
  await $.tool.call({ tool: 'Read', file_path: '/c' } as never)
  await $.turn.complete(turn('answer'))
  await clock.settle()
  // the second call came too soon after the first for its own tick
  expect(played).toEqual(['start', 'tool', 'tool', 'done'])
})

test('an interrupted turn ends on the low notes; a subagent stays silent', async ($, on) => {
  const clock = world(on)
  await $.session.start(start)
  await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'sub' } as never)
  await $.turn.complete(turn('answer', 'sub'))
  await $.turn.complete(turn('aborted'))
  await clock.settle()
  expect(played).toEqual(['oops'])
})

test('/soundtrack off goes quiet and is remembered; test plays all four', async ($, on) => {
  const clock = world(on)
  await $.session.start(start)
  expect((await run($, 'off')).text).toMatch(/^Soundtrack off/)
  await $.session.start(start)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await clock.settle()
  expect(played).toEqual([])

  await run($, 'test')
  expect(played).toEqual(['start', 'tool', 'done', 'oops'])
})

test('on macOS the engine plays the clip itself', async ($, on) => {
  const clock = world(on, 'Darwin')
  await $.session.start(start)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await clock.settle()
  expect(played).toEqual(['mac:start'])
})
