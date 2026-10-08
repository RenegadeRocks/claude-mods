import { expect, mock, test } from 'claude-code/testing'

const cat = (name: string, tokens: number, kind: 'used' | 'free' | 'buffer') => ({
  name,
  tokens,
  color: 'promptBorder',
  isDeferred: false,
  kind,
})

const NOON_UTC = Date.UTC(2026, 9, 7, 12, 0)

let contextPercent = 42
let lastReply: unknown = null
let fiveHour: { percentUsed: number; resetsAt: string } = { percentUsed: 37, resetsAt: '2026-10-07T14:10:00Z' }
const toasts: string[] = []
const submitted: string[] = []
const commands: string[] = []
const processes: string[][] = []
let gpuUtil: number | null = null
let files: Record<string, { name: string; kind: 'file' | 'dir'; mtimeMs: number }[]> = {}

const usage = {
  startedAt: NOON_UTC - (2 * 60 + 14) * 60_000,
  get rateLimits() {
    return [
      { kind: 'five_hour', ...fiveHour },
      { kind: 'seven_day', percentUsed: 12, resetsAt: '2026-10-11T15:00:00Z' },
    ]
  },
  cost: { usd: 0.1 },
  context: {
    window: 200_000,
    breakdown: {
      categories: [
        cat('System prompt', 8000, 'used'),
        cat('System tools', 16_000, 'used'),
        cat('Messages', 60_000, 'used'),
        cat('Free space', 83_000, 'free'),
        cat('Autocompact buffer', 33_000, 'buffer'),
      ],
      totalTokens: 84_000,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      autocompactSource: 'auto',
      get percentage() {
        return contextPercent
      },
      gridRows: [],
      model: 'test',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      isAutoCompactEnabled: true,
      get apiUsage() {
        return lastReply
      },
    },
  },
}

const props = { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 120 }
const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const reply = (body: unknown) => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } }) as never

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<Body>[0]
type On = Parameters<Body>[1]

function world(on: On, options: { agents?: unknown[]; store?: Record<string, unknown> } = {}) {
  contextPercent = 42
  lastReply = null
  fiveHour = { percentUsed: 37, resetsAt: '2026-10-07T14:10:00Z' }
  toasts.length = 0
  submitted.length = 0
  commands.length = 0
  processes.length = 0
  gpuUtil = null
  files = {}
  const clock = mock.clock(on, { now: NOON_UTC })
  mock.store(on, options.store ?? {})
  on('session.usage', () => ({ value: usage }) as never)
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
  on(
    'settings.read',
    () =>
      ({
        value: { effortLevel: 'xhigh', modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'high' } } },
      }) as never,
  )
  on('agent.list', () => ({ value: options.agents ?? [] }) as never)
  on('session.start', () => ({ cwd: '/' }))
  on('command.register', () => ({ value: { command: 'context-bar' } }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text } as never
  })
  // commands the mod runs itself, like /compact; its own /context-bar it answers above this
  on('command.run', (_, e) => {
    commands.push(`/${e.command}${e.args ? ` ${e.args}` : ''}`)
    return { text: '' } as never
  })
  on('ui.message', () => ({}) as never)
  on('session.root', () => ({ value: '/proj' }) as never)
  // the engine hands the listing an absolute path: on Windows '/proj' arrives as 'C:\\proj'
  on('fs.list', (_, e) => {
    const key = e.path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
    return { value: (files[key] ?? []).map(f => ({ ...f, size: 1, isLink: false })) } as never
  })
  mock.env(on, { OS: 'Windows_NT' })
  on('process.run', (_, e) => {
    processes.push([...e.argv])
    if (e.argv[0] === 'nvidia-smi') {
      if (gpuUtil === null) return { value: { exitCode: 1, stdout: '', stderr: 'no gpu' } } as never
      return { value: { exitCode: 0, stdout: `${gpuUtil}, 18432, 32607
`, stderr: '' } } as never
    }
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('http.fetch', (_, e) => {
    if (e.url.includes('geocoding')) {
      return reply({ results: [{ name: 'Ludhiana', latitude: 30.9, longitude: 75.85 }] })
    }
    return reply({ current: { temperature_2m: 31.4, weather_code: 0, is_day: 1 } })
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine hint</Text>
  })
  return clock
}

/** Starts the session and lets the background reads (weather, agents) land. */
async function started($: Engine, clock: ReturnType<typeof world>) {
  await $.session.start(start)
  await clock.settle()
}

// the band's scroll and view props are the engine's; the mod never reads them
const mountBand = ($: Engine, p = props) =>
  $.ui.mount({ plugin: 'context-bar', surface: 'terminal', component: 'AbovePrompt', props: p as never })

type Band = Awaited<ReturnType<typeof mountBand>>

const textsOf = async (ui: Band) => (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
const funTextsOf = async (ui: Band) => (await ui.findAll({ type: 'Text', in: 'fun' })).map(t => t.text ?? '')
/** The cat's rows: its stage's lines, between the row above it and the two below. */
const petRows = async (ui: Band) => ((await ui.find({ type: 'Box', key: 'pet', in: 'fun' }))?.children.length ?? 3) - 3

// signature, session, weather, phase: the cat starts on the fifth row
const PET_ROW = 5

test('the numbers: context, legend, limits, model, effort and quote', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($)

  expect(await ui.find({ type: 'Text', text: /42%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /sys 8\.0k/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /msgs 60k/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Free space/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^5H/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /37%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /↻ 2h 10m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^WEEK/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /12%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /↻ 4d 3h/ })).toBeDefined()
  // the model and its effort sit in the fun column, under the weather
  const fun = await funTextsOf(ui)
  expect(fun).toContain('Sonnet 5.5')
  expect(fun).toContain(' ▰▰▰')
  expect(fun).toContain(' high')
  expect(await ui.find({ type: 'Text', text: /✦/ })).toBeDefined()
  await ui.unmount()
})

test('the fun column: signature, session length and Ludhiana weather, on the left', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($)

  const fun = await funTextsOf(ui)
  expect(fun).toContain('RenegadeRocks claude code')
  expect(fun.some(t => /2h 14m/.test(t))).toBe(true)
  expect(fun.some(t => /☼ Clear 31°C Ludhiana/.test(t))).toBe(true)
  // the fun column is the card's first child, the numbers its second
  const card = await ui.find({ type: 'Box' })
  expect(JSON.stringify(card?.children[0])).toContain('Client')
  await ui.unmount()
})

test('shows thinking, then working while a tool runs, then idle', async ($, on) => {
  const clock = world(on)
  let during: string[] = []
  let ui: Band | undefined
  on('tool.call', async () => {
    await clock.settle()
    during = ui ? await funTextsOf(ui) : []
    return { result: 'ok' } as never
  })

  await started($, clock)
  const quiet = await mountBand($, { ...props, isWorking: false })
  expect(await funTextsOf(quiet)).toContain('idle')
  await quiet.unmount()

  ui = await mountBand($)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await clock.settle()
  expect(await funTextsOf(ui)).toContain(' thinking')

  await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
  expect(during).toContain(' working')
  // typing on its laptop
  expect(during.some(t => /\[[▪▫]+\]/.test(t))).toBe(true)
  await clock.settle()
  expect(await funTextsOf(ui)).toContain(' thinking')
  await ui.unmount()
})

test('leaves the band alone before the first reading', async ($, on) => {
  mock.clock(on, { now: NOON_UTC })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine hint</Text>
  })

  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /%/ })).toBeUndefined()
  await ui.unmount()
})

test('/context-bar off hides the bar and on brings it back', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /42%/ })).toBeDefined()

  const run = (args: string) =>
    $.command.run({ command: 'context-bar', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } } as never)

  expect((await run('off')).text).toMatch(/^Context bar off/)
  expect(await ui.find({ type: 'Text', text: /42%/ })).toBeUndefined()

  expect((await run('toggle')).text).toBe('Context bar on.')
  expect(await ui.find({ type: 'Text', text: /42%/ })).toBeDefined()
  await ui.unmount()
})

test('the pet grows as the context fills', async ($, on) => {
  const clock = world(on)
  const heights: number[] = []
  for (const percent of [5, 30, 60, 90]) {
    contextPercent = percent
    await started($, clock)
    const ui = await mountBand($)
    heights.push(await petRows(ui))
    if (percent === 60) {
      const ears = '/BS_/BS'.replace(/BS/g, String.fromCharCode(92))
      expect((await funTextsOf(ui)).join(' ')).toContain(ears)
    }
    await ui.unmount()
  }
  expect(heights).toEqual([1, 3, 5, 7])
})

test('the pet is no Button, so the pointer never lights it up', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($)

  // the card's ASK row has Buttons; the pet's column has none
  expect(await ui.findAll({ type: 'Button', in: 'fun' })).toEqual([])
  // hovering only swaps the nameplate for a hint
  await ui.pointer({ type: 'move', x: 10, y: PET_ROW + 1 })
  expect((await funTextsOf(ui)).some(t => t.includes('♥ pet Rocky'))).toBe(true)
  await ui.pointer({ type: 'leave', x: 10, y: PET_ROW + 1 })
  expect((await funTextsOf(ui)).some(t => t.includes('♥ pet Rocky'))).toBe(false)
  await ui.unmount()
})

test('clicking the pet makes it react, a different way each time', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($)
  const reactions = /\^w\^|\^o\^|\^v\^|-w-|\*\.\*|@\.@/
  const face = async () => (await funTextsOf(ui)).find(t => reactions.test(t))?.match(reactions)?.[0]

  expect(await face()).toBeUndefined()
  await ui.pointer({ type: 'down', x: 10, y: PET_ROW + 1, button: 'left' })
  const first = await face()
  expect(first).toBeDefined()

  // the reaction runs its course on the column's own clock, then ends
  await ui.advance(3000)
  expect(await face()).toBeUndefined()

  await ui.pointer({ type: 'down', x: 10, y: PET_ROW + 1, button: 'left' })
  const second = await face()
  expect(second).toBeDefined()
  expect(second).not.toBe(first)

  // a click on the signature is no click on the cat
  await ui.advance(3000)
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left' })
  expect(await face()).toBeUndefined()
  await ui.unmount()
})

test('the idle cat keeps doing things on its own clock', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($, { ...props, isWorking: false })
  const looks = new Set<string>()
  for (let i = 0; i < 16; i++) {
    looks.add((await funTextsOf(ui)).join('|'))
    await ui.advance(1300)
  }
  expect(looks.size).toBeGreaterThanOrEqual(4)
  await ui.unmount()
})

test('live subagents show up under fun names', async ($, on) => {
  const clock = world(on, {
    agents: [
      { id: 'a1', description: 'look around', type: 'Explore', status: 'running' },
      { id: 'a2', description: 'plan it', type: 'Plan', status: 'running' },
      { id: 'a3', description: 'done already', type: 'general-purpose', status: 'completed' },
    ],
  })
  await started($, clock)
  const ui = await mountBand($)

  expect(await ui.find({ type: 'Text', text: /^AGENTS/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Pip$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Mochi$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Plan/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /general-purpose/ })).toBeUndefined()
  await ui.unmount()
})

test('the quote changes with every prompt', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const quoteOf = async (ui: Band) => (await textsOf(ui)).find(t => t.startsWith('✦') && t.length > 3) ?? ''

  let previous = ''
  for (let i = 0; i < 4; i++) {
    const ui = await mountBand($)
    const shown = await quoteOf(ui)
    expect(shown).toBeTruthy()
    expect(shown).not.toBe(previous)
    previous = shown
    await ui.unmount()
    await $.prompt.submit({ text: `prompt ${i}`, wait: false, origin: { kind: 'composer' } } as never)
    await clock.settle()
  }
})

test('a narrower window keeps the cat and the fun column', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  for (const bodyColumns of [90, 70, 60, 50]) {
    const ui = await mountBand($, { ...props, bodyColumns })
    expect(await petRows(ui)).toBeGreaterThan(0)
    expect((await funTextsOf(ui)).some(t => /2h 14m/.test(t))).toBe(true)
    expect(await ui.find({ type: 'Text', text: /42%/ })).toBeDefined()
    // the limits stack rather than break when the numbers column is narrow
    expect(await ui.find({ type: 'Text', text: /^5H/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^WEEK/ })).toBeDefined()
    await ui.unmount()
  }
  const tiny = await mountBand($, { ...props, bodyColumns: 40 })
  expect(await tiny.find({ type: 'Client' })).toBeUndefined()
  expect(await tiny.find({ type: 'Text', text: /42%/ })).toBeDefined()
  await tiny.unmount()
})

test('the cache row says what the cache did, before and after the tally', async ($, on) => {
  const clock = world(on)
  await started($, clock)

  // nothing yet
  let ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /fills in after Claude's next reply/ })).toBeDefined()
  await ui.unmount()

  // a reply from before the mod was watching: its own share
  lastReply = { input_tokens: 500, output_tokens: 10, cache_read_input_tokens: 9000, cache_creation_input_tokens: 500 }
  await started($, clock)
  ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /^ 90% reused$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /on the last reply/ })).toBeDefined()
  await ui.unmount()
})

test('the cache savings and the API bill, itemized', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  await $.turn.complete({
    answer: '',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: {
      model: 'claude-sonnet-5-5',
      input_tokens: 1000,
      output_tokens: 2000,
      cache_read_input_tokens: 90_000,
      cache_creation_input_tokens: 9000,
    },
  } as never)
  await started($, clock)
  const ui = await mountBand($)

  // 90k of 100k input came from the cache: at Sonnet 5.5's $2 vs $0.20 that saved $0.16
  expect(await ui.find({ type: 'Text', text: /^ 90% reused$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\$0\.16$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /vs no cache/ })).toBeDefined()
  // /cost's $0.10 total; Sonnet 5.5 rates for the parts, the rest is other
  expect(await ui.find({ type: 'Text', text: /^ \$0\.10$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^in <\$0\.01$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^out \$0\.02$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^read \$0\.02$/ })).toBeDefined()
  // a subscription's cache lasts an hour, and an hour-long write costs 2x input
  expect(await ui.find({ type: 'Text', text: /^write \$0\.04$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^other \$0\.02$/ })).toBeDefined()
  await ui.unmount()
})

const aTurn = {
  answer: '',
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
  usage: {
    model: 'claude-sonnet-5-5',
    input_tokens: 1000,
    output_tokens: 2000,
    cache_read_input_tokens: 90_000,
    cache_creation_input_tokens: 9000,
  },
}

test('/clear starts the cache and cost tally over', async ($, on) => {
  const clock = world(on)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }) as never)
  await started($, clock)
  await $.turn.complete(aTurn as never)
  await clock.settle()
  let ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /vs no cache/ })).toBeDefined()
  await ui.unmount()

  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  await clock.settle()
  ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /vs no cache/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /fills in after Claude's next reply/ })).toBeDefined()
  await ui.unmount()
})

test("a subagent's tool calls leave the main phase alone", async ($, on) => {
  const clock = world(on)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await started($, clock)
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'bg-1' } as never)
  await clock.settle()
  const ui = await mountBand($, { ...props, isWorking: true })
  // still the turn's own phase: thinking, never flipped to working
  expect(await funTextsOf(ui)).not.toContain(' working')
  await ui.unmount()
})

test('the cost breakdown moves under the bar when it would not fit beside it', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  await $.turn.complete(aTurn as never)
  await clock.settle()

  // beside the bar it needs room: on a very wide window, with the desk on the right
  const wide = await mountBand($, { ...props, bodyColumns: 260 })
  const wideRow = (await textsOf(wide)).find(t => t.startsWith('API $'))
  expect(wideRow).toMatch(/other \$0\.02/)
  await wide.unmount()

  const narrow = await mountBand($, { ...props, bodyColumns: 100 })
  const texts = await textsOf(narrow)
  const row = texts.find(t => t.startsWith('API $'))
  expect(row).toMatch(/\$0\.10$/)
  expect(texts.some(t => /^\s+● in .*● other \$0\.02/.test(t))).toBe(true)
  await narrow.unmount()
})

test('/context-bar off is remembered by the next session', async ($, on) => {
  const clock = world(on, { store: { isOn: false } })
  await started($, clock)
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /42%/ })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ command: 'context-bar', args: 'on', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } } as never)
  const back = await mountBand($)
  expect(await back.find({ type: 'Text', text: /42%/ })).toBeDefined()
  await back.unmount()
})

test('/context-bar pet swaps Rocky between a cat and a dog, and remembers', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const run = (args: string) =>
    $.command.run({ command: 'context-bar', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } } as never)

  let ui = await mountBand($)
  expect((await funTextsOf(ui)).some(t => t.includes('=(') )).toBe(true)
  await ui.unmount()

  expect((await run('pet dog')).text).toMatch(/dog/)
  ui = await mountBand($)
  const dog = await funTextsOf(ui)
  expect(dog.some(t => t.includes('U( '))).toBe(true)
  expect(dog.some(t => /Rocky · buddy/.test(t))).toBe(true)
  await ui.unmount()

  // a new session keeps the dog
  await started($, clock)
  ui = await mountBand($)
  expect((await funTextsOf(ui)).some(t => t.includes('U( '))).toBe(true)
  await ui.unmount()

  expect((await run('pet')).text).toMatch(/cat/)
})

test('the plugin setting picks the dog when nothing was chosen yet', { options: { pet: 'dog' } }, async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($)
  expect((await funTextsOf(ui)).some(t => t.includes('U( '))).toBe(true)
  await ui.unmount()
})

test('Limit Coach warns before the 5-hour window fills, then offers Continue once it resets', async ($, on) => {
  const clock = world(on)

  // 60% at noon, 82% half an hour later: at that pace it fills in about 25 minutes
  fiveHour = { percentUsed: 60, resetsAt: new Date(NOON_UTC + 3 * 3_600_000).toISOString() }
  await started($, clock)
  await clock.advance(30 * 60_000)
  fiveHour = { ...fiveHour, percentUsed: 82 }
  await started($, clock)

  let ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /^ ⚠ full in ~\d+m$/ })).toBeDefined()
  expect(toasts.some(t => /5-hour limit at 82%, full in ~\d+m at this pace/.test(t))).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'continue' })).toBeUndefined()
  await ui.unmount()

  // it fills up, resetting ten minutes from now
  fiveHour = { percentUsed: 100, resetsAt: new Date(clock.now() + 10 * 60_000).toISOString() }
  await started($, clock)
  await clock.advance(11 * 60_000)
  expect(toasts.some(t => /has reset/.test(t))).toBe(true)

  ui = await mountBand($)
  expect(await ui.find({ type: 'Button', key: 'continue' })).toBeDefined()
  await ui.press({ key: 'continue' })
  await clock.settle()
  expect(submitted.some(t => /limit has reset\. Please continue/.test(t))).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'continue' })).toBeUndefined()
  await ui.unmount()
})

test('Limit Coach stays quiet when the window will reset before it fills', async ($, on) => {
  const clock = world(on)
  fiveHour = { percentUsed: 30, resetsAt: new Date(NOON_UTC + 20 * 60_000).toISOString() }
  await started($, clock)
  await clock.advance(10 * 60_000)
  fiveHour = { ...fiveHour, percentUsed: 34 }
  await started($, clock)
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /⚠/ })).toBeUndefined()
  expect(toasts).toEqual([])
  await ui.unmount()
})

test('a wide window puts the pet beside its info rows and the context on one row', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($, { ...props, bodyColumns: 190 })

  // side by side: the column's top box is a row, the pet first, the info rows beside it
  const column = await ui.find({ type: 'Box', in: 'fun' })
  expect(column?.props.flexDirection).toBe('row')
  const fun = await funTextsOf(ui)
  expect(fun).toContain('RenegadeRocks claude code')

  // a click on the pet's columns, on any row, is a click on the pet
  await ui.pointer({ type: 'down', x: 4, y: 1, button: 'left', in: 'fun' })
  expect((await funTextsOf(ui)).some(t => /\^w\^|\^o\^|\^v\^|-w-|\*\.\*|@\.@/.test(t))).toBe(true)

  // the label, the bar and the token counts share one row
  const texts = await textsOf(ui)
  expect(texts.some(t => /^CONTEXT {2}42% {2}█+.*░+ {2}84k \/ 200k$/.test(t))).toBe(true)
  await ui.unmount()
})

test('the ASK buttons send their prompts; Compact appears past 60% and runs /compact', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($)

  for (const key of ['recap', 'memory', 'keep-going', 'team']) {
    expect(await ui.find({ type: 'Button', key })).toBeDefined()
    await ui.press({ key })
  }
  await clock.settle()
  expect(submitted).toHaveLength(4)
  expect(submitted[0]).toMatch(/^Recap for me/)
  expect(submitted[1]).toMatch(/^Update memory:/)
  expect(submitted[2]).toBe('Keep going where you left off.')
  expect(submitted[3]).toMatch(/status update .* paste to my team/)

  // at 42% there is no Compact button yet
  expect(await ui.find({ type: 'Button', key: 'compact' })).toBeUndefined()
  await ui.unmount()

  // past 60% it appears, with how full the context is, and runs /compact
  contextPercent = 74
  await started($, clock)
  const full = await mountBand($)
  expect((await full.find({ type: 'Button', key: 'compact' }))?.text).toBe('Compact · 74%')
  await full.press({ key: 'compact' })
  await clock.settle()
  expect(commands).toContain('/compact')
  await full.unmount()
})

// stacked at 120 columns: signature, session, weather, then the model on row 3
const MODEL_ROW = 3
// "◆ " then "Sonnet 5.5", a space, then the five effort cells
const NAME_X = 2
const METER_X = NAME_X + 'Sonnet 5.5'.length + 1

test('clicking the effort meter sets that effort; clicking the model opens a picker', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($)

  // the second cell is medium
  await ui.pointer({ type: 'down', x: METER_X + 1, y: MODEL_ROW, button: 'left' })
  await clock.settle()
  expect(commands).toContain('/effort medium')
  await clock.settle()
  expect(await funTextsOf(ui)).toContain(' medium')

  // the model name opens the picker; Opus is right after "Sonnet" and two spaces
  await ui.pointer({ type: 'down', x: NAME_X + 1, y: MODEL_ROW, button: 'left' })
  expect((await funTextsOf(ui)).some(t => t.includes('Sonnet') && t.includes('Opus') && t.includes('Haiku'))).toBe(true)
  await ui.pointer({ type: 'down', x: NAME_X + 'Sonnet'.length + 2 + 1, y: MODEL_ROW + 1, button: 'left' })
  await clock.settle()
  expect(commands).toContain('/model opus')
  await ui.unmount()
})

test('after 20 active minutes Rocky asks you to rest your eyes; a click answers him', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  // keep working: a prompt every four minutes for 21 minutes
  for (let i = 0; i < 6; i++) {
    await $.prompt.submit({ text: `p${i}`, wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(4 * 60_000)
  }
  expect(toasts.some(t => /rest your eyes/.test(t))).toBe(true)
  const chimes = () => processes.filter(p => p.join(' ').includes('nudge.wav')).length
  expect(chimes()).toBe(1)
  await clock.advance(5 * 60_000 + 10_000)
  expect(chimes()).toBe(2)
  const ui = await mountBand($)
  expect((await funTextsOf(ui)).some(t => /rest your eyes/.test(t))).toBe(true)
  expect((await funTextsOf(ui)).some(t => /click when done/.test(t))).toBe(true)

  // the pet sits under the five info rows
  await ui.pointer({ type: 'down', x: 10, y: 7, button: 'left' })
  await clock.settle()
  expect((await funTextsOf(ui)).some(t => /rest your eyes/.test(t))).toBe(false)
  await ui.unmount()
})

test('a long break resets the nudges, and /context-bar nudges off silences them', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  await $.command.run({ command: 'context-bar', args: 'nudges off', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } } as never)
  for (let i = 0; i < 8; i++) {
    await $.prompt.submit({ text: `p${i}`, wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(4 * 60_000)
  }
  expect(toasts.some(t => /Rocky says/.test(t))).toBe(false)
})

test('render watch shows the GPU while it works and cheers when a job ends', async ($, on) => {
  const clock = world(on)
  gpuUtil = 92
  await started($, clock)
  await clock.advance(2 * 60_000)
  let ui = await mountBand($)
  expect((await funTextsOf(ui)).some(t => /▦ GPU 92% 18\/32 GB · busy 2m/.test(t))).toBe(true)
  await ui.unmount()

  gpuUtil = 3
  await clock.advance(30_000)
  expect(toasts.some(t => /GPU job finished after 2m/.test(t))).toBe(true)
  expect(processes.some(p => p.join(' ').includes('cheer.wav'))).toBe(true)
  ui = await mountBand($)
  expect((await funTextsOf(ui)).some(t => /GPU/.test(t))).toBe(false)
  // the pet keeps celebrating, reaction after reaction, until clicked
  expect((await funTextsOf(ui)).some(t => /job done! click/.test(t))).toBe(true)
  await ui.advance(20_000)
  expect((await funTextsOf(ui)).some(t => /job done! click/.test(t))).toBe(true)
  await ui.pointer({ type: 'down', x: 10, y: 7, button: 'left' })
  await clock.settle()
  expect((await funTextsOf(ui)).some(t => /job done! click/.test(t))).toBe(false)
  await ui.unmount()
})

test('the newest image or video saved this session shows, with Open and Folder', async ($, on) => {
  const clock = world(on)
  files = {
    '/proj': [
      { name: 'renders', kind: 'dir', mtimeMs: 0 },
      { name: 'old.png', kind: 'file', mtimeMs: NOON_UTC - 5 * 3_600_000 },
    ],
    '/proj/renders': [
      { name: 'before.png', kind: 'file', mtimeMs: NOON_UTC - 60_000 },
      { name: 'after_v3.mp4', kind: 'file', mtimeMs: NOON_UTC - 30_000 },
    ],
  }
  await started($, clock)
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /^after_v3\.mp4$/ })).toBeDefined()
  await ui.press({ key: 'open-output' })
  await ui.press({ key: 'open-folder' })
  await clock.settle()
  expect(processes).toContainEqual(['cmd', '/c', 'start', '', '/proj/renders/after_v3.mp4'])
  expect(processes).toContainEqual(['explorer', '/select,/proj/renders/after_v3.mp4'])
  await ui.unmount()
})

test('/context-bar sounds off keeps Rocky quiet', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  await $.command.run({ command: 'context-bar', args: 'sounds off', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } } as never)
  for (let i = 0; i < 6; i++) {
    await $.prompt.submit({ text: `p${i}`, wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(4 * 60_000)
  }
  expect(toasts.some(t => /rest your eyes/.test(t))).toBe(true)
  expect(processes.some(p => p.join(' ').includes('.wav'))).toBe(false)
})

test('a pink pet says why when clicked, then goes back to its tricks', async ($, on) => {
  const clock = world(on)
  contextPercent = 88
  await started($, clock)
  const ui = await mountBand($, { ...props, isWorking: false })
  const said = async () => (await funTextsOf(ui)).join('|')

  await ui.pointer({ type: 'move', x: 10, y: 7 })
  expect(await said()).toContain('88% full · click')

  await ui.pointer({ type: 'down', x: 10, y: 7, button: 'left' })
  expect(await said()).toContain("I'm 88% full!")
  await ui.advance(12 * 140)
  expect(await said()).toContain('Compact helps')

  // after it has said its piece, a click is a trick again
  await ui.advance(6000)
  await ui.pointer({ type: 'down', x: 10, y: 7, button: 'left' })
  expect(await said()).not.toContain('full!')
  expect(/\^w\^|\^o\^|\^v\^|-w-|\*\.\*|@\.@/.test(await said())).toBe(true)
  await ui.unmount()
})

const deskTexts = async (ui: Band) => (await ui.findAll({ type: 'Text', in: 'desk' })).map(t => t.text ?? '')
// the desk's rows: seven of scene, then the notebook strip, then the drawer
const NOTE = 7
const DRAWER = 8

test('a wide window gets the desk: a drawn scene, a notebook and a drawer', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($, { ...props, bodyColumns: 190 })
  const desk = await deskTexts(ui)
  expect(desk.some(t => /[\u{1FB00}-\u{1FB3B}]/u.test(t))).toBe(true)
  expect(desk.some(t => /click to write today's goal/.test(t))).toBe(true)
  expect(desk.some(t => /◷ start a 25-min focus/.test(t))).toBe(true)
  expect(desk.some(t => /♪ sounds off/.test(t))).toBe(true)
  await ui.unmount()

  // a narrower window keeps its rows and leaves the desk out
  const narrow = await mountBand($, { ...props, bodyColumns: 150 })
  expect(await narrow.find({ type: 'Client', key: 'desk' })).toBeUndefined()
  await narrow.unmount()
})

test("the notebook holds this project's goal, typed in place", async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($, { ...props, bodyColumns: 190 })

  await ui.pointer({ type: 'down', x: 10, y: NOTE, button: 'left', in: 'desk' })
  expect(await ui.find({ type: 'Input', in: 'desk' })).toBeDefined()

  await ui.input({ key: 'goal', text: 'fix the fairy feet' })
  await clock.settle()
  expect((await deskTexts(ui)).some(t => /✎ fix the fairy feet/.test(t))).toBe(true)
  await ui.unmount()

  // a new session in the same project opens the notebook where it was left
  await started($, clock)
  const back = await mountBand($, { ...props, bodyColumns: 190 })
  expect((await deskTexts(back)).some(t => /✎ fix the fairy feet/.test(t))).toBe(true)
  await back.unmount()
})

test('the focus timer runs 25 minutes, rings, then a 5-minute break', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($, { ...props, bodyColumns: 190 })

  await ui.pointer({ type: 'down', x: 3, y: DRAWER, button: 'left', in: 'desk' })
  await clock.settle()
  expect((await deskTexts(ui)).some(t => /◷ 25:00 focus {2}○○○○/.test(t))).toBe(true)

  await clock.advance(25 * 60_000 + 10_000)
  expect(toasts.some(t => /Focus round done/.test(t))).toBe(true)
  expect(processes.some(p => p.join(' ').includes('bell.wav'))).toBe(true)
  await ui.unmount()
  const rest = await mountBand($, { ...props, bodyColumns: 190 })
  expect((await deskTexts(rest)).some(t => /◌ \d:\d\d break {2}●○○○/.test(t))).toBe(true)
  await rest.unmount()
})

test('the sound button steps through rain, fireplace and deep focus, and plays them', async ($, on) => {
  const clock = world(on)
  await started($, clock)
  const ui = await mountBand($, { ...props, bodyColumns: 190 })
  const click = () => ui.pointer({ type: 'down', x: 40, y: DRAWER, button: 'left', in: 'desk' })

  await click()
  await clock.settle()
  expect((await deskTexts(ui)).some(t => /♪ rain/.test(t))).toBe(true)

  await click()
  await clock.settle()
  expect((await deskTexts(ui)).some(t => /♪ fireplace/.test(t))).toBe(true)
  await click()
  await click()
  await clock.settle()
  expect((await deskTexts(ui)).some(t => /♪ sounds off/.test(t))).toBe(true)

  // the choice is remembered: a new session starts the same sound
  await click()
  await clock.settle()
  await ui.unmount()
  await started($, clock)
  const back = await mountBand($, { ...props, bodyColumns: 190 })
  expect((await deskTexts(back)).some(t => /♪ rain/.test(t))).toBe(true)
  await back.unmount()
})
