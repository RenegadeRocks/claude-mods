// context-bar: a card above the prompt. On the left, the fun column (drawn by
// ./fun-column.tsx on its own frame clock); on the right, the session's
// numbers: context, rate limits, cache, API cost, model, subagents and a quote.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  AgentChip,
  Ambient,
  ContextSnap,
  DeskMessage,
  DeskProps,
  FunMessage,
  FunProps,
  Limit,
  Output,
  Phase,
  Pomodoro,
  Spend,
  Weather,
} from '../types'
import { BREAK_MS, DESK_WIDTH, FOCUS_MS } from './desk-art'
import { NO_COACH, coachStep, coachTick, etaText, minutesToFull } from './coach'
import { NO_TRACK, gpuStep, parseSmi } from './gpu'
import { NO_WELLNESS, NUDGE_TOASTS, wellnessDone, wellnessTick } from './wellness'
import {
  allocate,
  colorFor,
  compact,
  money,
  prettyModel,
  ratesFor,
  resetsIn,
  sessionLength,
  shareCells,
  shortName,
} from './format'
import { QUOTES, nextQuote } from './quotes'
import {
  BG,
  BLUE,
  BORDER,
  GREEN,
  MAUVE,
  MUTED,
  PEACH,
  TEAL,
  TEXT,
  TRACK,
  YELLOW,
  heatColor,
  percentColor,
  skyStyle,
} from './theme'

const NO_SPEND: Spend = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  usdInput: 0,
  usdOutput: 0,
  usdRead: 0,
  usdWrite: 0,
  usdSaved: 0,
}

const snap = atom({ plugin: 'context-bar', key: 'snap' } as const, null)
const isOn = atom({ plugin: 'context-bar', key: 'isOn' } as const, true)
const phase = atom({ plugin: 'context-bar', key: 'phase' } as const, 'idle')
const weather = atom({ plugin: 'context-bar', key: 'weather' } as const, null)
const agents = atom({ plugin: 'context-bar', key: 'agents' } as const, [])
const quote = atom({ plugin: 'context-bar', key: 'quote' } as const, '')
const spend = atom({ plugin: 'context-bar', key: 'spend' } as const, NO_SPEND)
const pet = atom({ plugin: 'context-bar', key: 'pet' } as const, 'cat')
const coach = atom({ plugin: 'context-bar', key: 'coach' } as const, NO_COACH)
const gpu = atom({ plugin: 'context-bar', key: 'gpu' } as const, null)
const celebrate = atom({ plugin: 'context-bar', key: 'celebrate' } as const, null)
const wellness = atom({ plugin: 'context-bar', key: 'wellness' } as const, NO_WELLNESS)
const output = atom({ plugin: 'context-bar', key: 'output' } as const, null)
const effortChoice = atom({ plugin: 'context-bar', key: 'effortChoice' } as const, null)
const IDLE_POMODORO: Pomodoro = { phase: 'idle', endsAt: null, rounds: 0 }
const goal = atom({ plugin: 'context-bar', key: 'goal' } as const, '')
const pomodoro = atom({ plugin: 'context-bar', key: 'pomodoro' } as const, IDLE_POMODORO)
const ambient = atom({ plugin: 'context-bar', key: 'ambient' } as const, 'off')

// Layout, in terminal columns.
const COLUMN_GAP = 3
// below this the card drops the fun column and keeps the numbers
const MIN_COLUMNS_FOR_FUN = 48
// the pet sits beside its info rows from this terminal width, which saves rows
const MIN_COLUMNS_FOR_SIDE = 140
// the context label and numbers share the bar's row from this data width
const MIN_DATA_FOR_ONE_CONTEXT_ROW = 60
// the desk sits beside the rows under the context bar from this data width
const MIN_DATA_FOR_DESK = 118
const DESK_GAP = 2
// the two limits share a row from this data width, and stack below it
const MIN_DATA_FOR_ONE_LIMIT_ROW = 56
const MIN_CELLS = 12
const MAX_CELLS = 160
// every meter's label takes this many columns, so the meters line up
const LABEL = 6
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// Timing.
const SPINNER_MS = 280
const MINUTE_TICK_MS = 10_000
const GPU_POLL_MS = 5000
// an alert the pet is giving chimes again this often until it is clicked
const REMIND_MS = 5 * 60_000
// the order the desk's sound button steps through
const AMBIENTS: Ambient[] = ['off', 'rain', 'storm', 'fire', 'focus']
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']
// newest-output search: these kinds of file, this deep, skipping these folders
const MEDIA = /\.(png|jpe?g|webp|gif|mp4|mov|webm|mkv|avi)$/i
const OUTPUT_DEPTH = 4
const OUTPUT_MAX_DIRS = 300
const SKIP_DIRS = new Set(['node_modules', '.git', 'venv', '.venv', '__pycache__', '.cache', '.next'])
const WEATHER_REFRESH_MS = 15 * 60_000
// the Compact button shows from this context share
const COMPACT_FROM = 60

// One-click prompts for what Satbir asks for most: [key, label, prompt].
const ACTIONS: [key: string, label: string, prompt: string][] = [
  [
    'recap',
    'Recap',
    "Recap for me in a few short lines: what are we working on, what's done, what's in progress, " +
      "what's next, and is anything blocked or broken? Plain words, no code.",
  ],
  [
    'memory',
    'Update memory',
    'Update memory: save what future sessions should know from this one: decisions made, ' +
      'where the work stands, and the next step. Keep each note short.',
  ],
  ['keep-going', 'Keep going', 'Keep going where you left off.'],
  [
    'team',
    'Team update',
    'Write a short status update about this work that I can paste to my team: what changed, ' +
      "what's next, and anything they need to do. Plain words, 3 to 5 lines.",
  ],
]

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const AGENT_NAMES = [
  'Pip', 'Mochi', 'Biscuit', 'Waffles', 'Noodle', 'Pixel', 'Nova', 'Zippy', 'Boba', 'Sprout',
  'Maple', 'Cosmo', 'Tofu', 'Pogo', 'Comet', 'Ziggy', 'Fudge', 'Gizmo', 'Sunny', 'Bean',
]

/** '3m ago', '2h ago', 'just now'. */
function ago(now: number, then: number): string {
  const mins = Math.floor((now - then) / 60_000)
  if (mins < 1) return 'just now'
  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`
}

/**
 * The fun column's width: from 140 columns wide enough for the pet beside its
 * info rows; full from 100, compact from 70, smallest below, the pet stacked.
 */
function funColumns(columns: number): number {
  return columns >= MIN_COLUMNS_FOR_SIDE ? 56 : columns >= 100 ? 34 : columns >= 70 ? 26 : 20
}

// What the timers need, mirrored here because a timer cannot read atoms.
let isActive = false
let inFlight = 0
// numbers each phase change, so a write that lands late cannot undo a newer one
let phaseSeq = 0
let tick = 0
let hasAgents = false
let lastAgentsKey = ''
// render watch: failed reads in a row (no nvidia-smi here after a few), a read
// in flight, and the job being watched
const SMI_GIVE_UP = 3
let smiFailures = 0
let isSmiBusy = false
let gpuTrack = NO_TRACK
// wellness: activity seen since the last tick, and when it last was
let activitySeen = false
let lastActivity = 0
let isWindows: boolean | null = null
// when the pet last chimed for an alert still waiting for a click
let lastChime = 0
// the ambient loop playing now: a stop for macOS, the player's stream on
// Windows, and a count that moves on each change so an older loop ends itself
let stopMacAmbient: AbortController | null = null
let ambientStream: ReturnType<EngineInterface['process']['spawn']> | null = null
let ambientSeq = 0
const agentNames = new Map<string, string>()

/** A fun name per subagent, kept for as long as the session lives. */
function nameFor(id: string): string {
  let name = agentNames.get(id)
  if (!name) {
    name = AGENT_NAMES[agentNames.size % AGENT_NAMES.length] ?? 'Pip'
    agentNames.set(id, name)
  }
  return name
}

/** The model in use and its saved effort: this model's setting first, then the global one. */
async function readModelInfo($: EngineInterface): Promise<{ model: string; effort: string | null }> {
  let raw = ''
  let settings: Record<string, unknown> = {}
  try {
    raw = await $.session.model()
  } catch {
    // keep going without a model name
  }
  try {
    settings = (await $.settings.read()) as Record<string, unknown>
  } catch {
    // no settings, no effort
  }
  const model = prettyModel(raw)
  const perModel = settings.modelSettings as Record<string, { effortLevel?: unknown }> | undefined
  const own = perModel ? Object.entries(perModel).find(([k]) => prettyModel(k) === model)?.[1]?.effortLevel : undefined
  const level = own ?? settings.effortLevel
  return { model, effort: typeof level === 'string' ? level : null }
}

function limitOf(l: { percentUsed: number; resetsAt?: string } | undefined): Limit | null {
  return l ? { percent: l.percentUsed, resetsAt: l.resetsAt } : null
}

async function refresh($: EngineInterface) {
  try {
    const { context, rateLimits, startedAt, cost } = await $.session.usage({ breakdown: 'summary' })
    const b = context.breakdown
    if (!b) return
    const next: ContextSnap = {
      percent: Math.round(b.percentage),
      totalTokens: b.totalTokens,
      maxTokens: b.rawMaxTokens,
      rows: b.categories
        .filter(c => c.kind !== 'deferred')
        .map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
      fiveHour: limitOf(rateLimits.find(l => l.kind === 'five_hour')),
      sevenDay: limitOf(rateLimits.find(l => l.kind === 'seven_day')),
      startedAt,
      costUsd: cost?.usd ?? null,
      lastReply: b.apiUsage
        ? {
            input: b.apiUsage.input_tokens,
            cacheRead: b.apiUsage.cache_read_input_tokens,
            cacheWrite: b.apiUsage.cache_creation_input_tokens,
          }
        : null,
      ...(await readModelInfo($)),
    }
    await update($, snap, () => next)
    await coachReading($, next.fiveHour)
  } catch {
    // usage is unavailable before a session is bound; the card stays as it was
  }
}

/** One turn's tokens, priced at its model's rates, added to the session's tally. */
async function addSpend(
  $: EngineInterface,
  u: { model: string; input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number },
) {
  const [inRate, outRate, shortWriteRate, readRate] = ratesFor(u.model)
  try {
    // Claude Code keeps a subscription's cache for an hour, and an hour-long
    // write costs 2x input; with an API key it keeps 5 minutes, at 1.25x. A
    // reported 5-hour limit means a subscription.
    const isSubscription = (await read($, snap))?.fiveHour != null
    const writeRate = isSubscription ? inRate * 2 : shortWriteRate
    await update($, spend, s => ({
      input: s.input + u.input_tokens,
      output: s.output + u.output_tokens,
      cacheRead: s.cacheRead + u.cache_read_input_tokens,
      cacheWrite: s.cacheWrite + u.cache_creation_input_tokens,
      usdInput: s.usdInput + (u.input_tokens * inRate) / 1e6,
      usdOutput: s.usdOutput + (u.output_tokens * outRate) / 1e6,
      usdRead: s.usdRead + (u.cache_read_input_tokens * readRate) / 1e6,
      usdWrite: s.usdWrite + (u.cache_creation_input_tokens * writeRate) / 1e6,
      usdSaved: s.usdSaved + (u.cache_read_input_tokens * (inRate - readRate)) / 1e6,
    }))
  } catch {
    // the tally is cosmetic
  }
}

/** Limit Coach takes a new reading of the 5-hour window, and warns when one is due. */
async function coachReading($: EngineInterface, lim: Limit | null) {
  try {
    const now = await $.clock.now()
    let toast: string | null = null
    await update($, coach, c => {
      const step = coachStep(c, now, lim)
      toast = step.toast
      return step.next
    })
    if (toast) $.ui.toast(toast, { timeoutMs: 8000 })
  } catch {
    // the coach is advice; never let it break a refresh
  }
}

/** On the clock: notices when a full 5-hour window has reset. */
async function coachClock($: EngineInterface) {
  try {
    const now = await $.clock.now()
    // decided inside the update, so a reading that lands meanwhile isn't lost
    let isReset = false
    await update($, coach, c => {
      const ready = coachTick(c, now)
      isReset = ready !== null
      return ready ?? c
    })
    if (!isReset) return
    $.ui.toast('Your 5-hour limit has reset. Press Continue on the card to pick up where you left off.', {
      timeoutMs: 10_000,
    })
  } catch {
    // try again on the next tick
  }
}

/** Render watch: one GPU reading; a job that just ended gets a toast and a cheer from the pet. */
async function pollGpu($: EngineInterface) {
  if (smiFailures >= SMI_GIVE_UP || isSmiBusy) return
  isSmiBusy = true
  try {
    let result: { exitCode: number | null; stdout: string }
    try {
      result = await $.process.run(
        ['nvidia-smi', '--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
        { timeoutMs: 4000 },
      )
    } catch {
      // no NVIDIA GPU or no nvidia-smi gives up after a few tries; a slow
      // reading under a heavy render just waits for the next one
      smiFailures++
      return
    }
    smiFailures = 0
    const reading = result.exitCode === 0 ? parseSmi(result.stdout) : null
    if (!reading) return
    const step = gpuStep(gpuTrack, await $.clock.now(), reading)
    gpuTrack = step.track
    await update($, gpu, () => step.gpu)
    if (step.finishedMinutes !== null) {
      const minutes = step.finishedMinutes
      await update($, celebrate, () => minutes)
      $.ui.toast(`GPU job finished after ${minutes}m. Rocky is celebrating until you click him!`, { timeoutMs: 10_000 })
      lastChime = await $.clock.now()
      void playSound($, 'cheer')
    }
  } catch {
    // try again on the next reading
  } finally {
    isSmiBusy = false
  }
}

/** Wellness clock: counts active time and lets the pet nudge when a break is due. */
async function wellnessClock($: EngineInterface, eyesMs: number, waterMs: number) {
  try {
    const now = await $.clock.now()
    if (activitySeen || lastActivity === 0) lastActivity = now
    activitySeen = false
    // the reminder chime also covers a finished GPU job, so it runs with nudges off too
    if ((await $.store.get('nudges')) === false) return void remind($, now)
    let nudged: 'eyes' | 'water' | null = null
    await update($, wellness, w => {
      const step = wellnessTick(w, now - lastActivity, MINUTE_TICK_MS, eyesMs, waterMs)
      nudged = step.nudged
      return step.next
    })
    if (nudged) {
      $.ui.toast(NUDGE_TOASTS[nudged], { timeoutMs: 10_000 })
      lastChime = now
      void playSound($, 'nudge')
    }
    void remind($, now)
  } catch {
    // a missed tick changes little
  }
}

/**
 * Plays one of the pet's clips without holding anything up. The engine's own
 * player only sounds on macOS, so on Windows PowerShell plays the file.
 */
async function playSound($: EngineInterface, clip: 'nudge' | 'cheer' | 'bell') {
  try {
    if ((await $.store.get('sounds')) === false) return
    isWindows ??= (await $.env.get('OS')) === 'Windows_NT'
    if (isWindows) {
      const file = `${$.plugin.root}\\sounds\\${clip}.wav`.replace(/['‘’]/g, q => q + q)
      await $.process.run(
        ['powershell', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${file}').PlaySync()`],
        { timeoutMs: 10_000 },
      )
    } else {
      await $.audio.play({ asset: `sounds/${clip}.wav` })
    }
  } catch {
    // a sound that cannot play is skipped
  }
}

/** An alert still waiting for a click chimes again every few minutes, so it isn't missed. */
async function remind($: EngineInterface, now: number) {
  try {
    if (now - lastChime < REMIND_MS) return
    const [party, w] = await Promise.all([read($, celebrate), read($, wellness)])
    if (party === null && w.due === null) return
    lastChime = now
    await playSound($, party !== null ? 'cheer' : 'nudge')
  } catch {
    // try again next tick
  }
}

/** A click in the fun column: an effort or model change, or a nudge or a party answered. */
async function funClicked($: EngineInterface, message: FunMessage) {
  try {
    if (message.type === 'nudge-done') {
      await update($, wellness, wellnessDone)
      return
    }
    if (message.type === 'celebrate-done') {
      await update($, celebrate, () => null)
      return
    }
    if (message.type === 'effort' && EFFORT_LEVELS.includes(message.level)) {
      const model = (await read($, snap))?.model ?? ''
      await update($, effortChoice, () => ({ model, level: message.level }))
      $.clock.after(0, () => void $.command.run({ command: 'effort', args: message.level } as never).catch(() => {}))
      return
    }
    if (message.type === 'model') {
      $.clock.after(0, () => void $.command.run({ command: 'model', args: message.alias } as never).catch(() => {}))
      // read the new model's name once the switch has landed
      $.clock.after(1500, () => void refresh($))
    }
  } catch {
    // a missed click is fine
  }
}

/** The newest image or video saved under the project since the session began. */
async function scanOutputs($: EngineInterface) {
  try {
    const root = await $.session.root()
    const since = (await read($, snap))?.startedAt ?? 0
    const sep = root.includes('\\') ? '\\' : '/'
    let newest: Output | null = null
    let queue: [string, number][] = [[root, 0]]
    let seen = 0
    while (queue.length > 0 && seen < OUTPUT_MAX_DIRS) {
      const [dir, depth] = queue.shift() ?? [root, 0]
      seen += 1
      const entries = await $.fs.list(dir).catch(() => [])
      for (const entry of entries) {
        const path = `${dir.replace(/[\\/]+$/, '')}${sep}${entry.name}`
        if (entry.kind === 'dir') {
          if (depth < OUTPUT_DEPTH && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) queue.push([path, depth + 1])
        } else if (MEDIA.test(entry.name) && entry.mtimeMs >= since && entry.mtimeMs > (newest?.mtimeMs ?? 0)) {
          newest = { path, name: entry.name, mtimeMs: entry.mtimeMs }
        }
      }
    }
    if (newest) await update($, output, () => newest)
  } catch {
    // no output row this time
  }
}

/** Opens a file in its default app, or shows it in its folder. */
async function openPath($: EngineInterface, path: string, isReveal: boolean) {
  try {
    isWindows ??= (await $.env.get('OS')) === 'Windows_NT'
    const argv = isWindows
      ? isReveal
        ? ['explorer', `/select,${path}`]
        : // Explorer opens a file in its default app; cmd's start would read & and ^ in a name
          ['explorer', path]
      : isReveal
        ? ['open', '-R', path]
        : ['open', path]
    await $.process.run(argv, { timeoutMs: 10_000 })
  } catch {
    // the file may have moved
  }
}

/** The project key the desk's goal is filed under: the session's root folder. */
async function projectKey($: EngineInterface): Promise<string> {
  return (await $.session.root()).replace(/[\\/]+$/, '').toLowerCase()
}

/** Reads this project's goal into the desk's notebook. */
async function loadGoal($: EngineInterface) {
  try {
    const goals = ((await $.store.get('goals')) ?? {}) as Record<string, string>
    const mine = goals[await projectKey($)] ?? ''
    await update($, goal, () => mine)
  } catch {
    // an empty notebook is fine
  }
}

/**
 * Stops whatever ambient loop is playing. Ending a spawned player's stream
 * ends the player; a loop also notices the count has moved and leaves.
 */
function stopAmbient() {
  ambientSeq++
  stopMacAmbient?.abort()
  stopMacAmbient = null
  const stream = ambientStream
  ambientStream = null
  try {
    // the value is what the loop would have ended with; nothing reads it
    void stream?.return(undefined as never).catch(() => undefined)
  } catch {
    // it may have ended on its own
  }
}

/**
 * Loops an ambient sound until stopped. On Windows a hidden PowerShell plays
 * it and ticks every half second; the loop reading those ticks is the
 * player's life, so leaving it (on a change, or with the session) ends the
 * sound. On macOS the engine plays it.
 */
async function playAmbient($: EngineInterface, kind: Ambient) {
  stopAmbient()
  const mine = ambientSeq
  if (kind === 'off') return
  try {
    isWindows ??= (await $.env.get('OS')) === 'Windows_NT'
    // a quicker click may have changed the sound while this one waited
    if (mine !== ambientSeq) return
    if (!isWindows) {
      const stop = new AbortController()
      stopMacAmbient = stop
      await $.audio.play({ asset: `sounds/ambient-${kind}.wav` }, { shouldLoop: true, signal: stop.signal })
      return
    }
    const file = `${$.plugin.root}\\sounds\\ambient-${kind}.wav`.replace(/['‘’]/g, q => q + q)
    // it also ends itself when nobody reads its ticks or Claude Code is gone,
    // so a hard-killed session can't leave a sound looping
    const script =
      `$parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId; ` +
      `$p = New-Object Media.SoundPlayer '${file}'; $p.PlayLooping(); ` +
      `try { while (Get-Process -Id $parent -ErrorAction SilentlyContinue) { ` +
      `[Console]::Out.WriteLine('.'); [Console]::Out.Flush(); Start-Sleep -Milliseconds 500 } } catch { }`
    const stream = $.process.spawn({ argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', script] })
    ambientStream = stream
    for await (const _tick of stream) {
      if (mine !== ambientSeq) break
    }
  } catch {
    // no sound this time
  }
}

/** The focus timer's clock: a finished focus starts a break, a finished break rests. */
async function pomodoroClock($: EngineInterface, now: number) {
  try {
    // decided inside the update, so a click on the timer meanwhile wins
    let ended: Pomodoro['phase'] = 'idle'
    await update($, pomodoro, (p): Pomodoro => {
      if (p.phase === 'idle' || p.endsAt === null || now < p.endsAt) return p
      ended = p.phase
      return p.phase === 'focus'
        ? { phase: 'break', endsAt: now + BREAK_MS, rounds: p.rounds + 1 }
        : { ...IDLE_POMODORO, rounds: p.rounds }
    })
    if (ended === 'idle') return
    $.ui.toast(
      ended === 'focus' ? 'Focus round done! Take a 5-minute break.' : 'Break over. Click the timer on the desk for another round.',
      { timeoutMs: 10_000 },
    )
    void playSound($, 'bell')
  } catch {
    // check again next tick
  }
}

/** A click or a typed goal on the desk. */
async function deskClicked($: EngineInterface, message: DeskMessage) {
  try {
    if (message.type === 'goal') {
      const text = message.text.trim().slice(0, 120)
      await update($, goal, () => text)
      const goals = ((await $.store.get('goals')) ?? {}) as Record<string, string>
      await $.store.set('goals', { ...goals, [await projectKey($)]: text })
      return
    }
    if (message.type === 'pomodoro') {
      const now = await $.clock.now()
      await update($, pomodoro, (p): Pomodoro =>
        p.phase === 'idle' ? { phase: 'focus', endsAt: now + FOCUS_MS, rounds: p.rounds } : { ...IDLE_POMODORO, rounds: p.rounds },
      )
      return
    }
    const current = await read($, ambient)
    const next = AMBIENTS[(AMBIENTS.indexOf(current) + 1) % AMBIENTS.length] ?? 'off'
    await update($, ambient, () => next)
    await $.store.set('ambient', next)
    void playAmbient($, next)
  } catch {
    // a missed click is fine
  }
}

async function sendPrompt($: EngineInterface, text: string) {
  try {
    await $.prompt.submit({ text } as never)
  } catch {
    // a missed press is fine; the prompt can still be typed
  }
}

/** The Compact button: the same as typing /compact. */
async function compactNow($: EngineInterface) {
  try {
    await $.command.run({ command: 'compact' } as never)
  } catch {
    // compaction can wait for the next press
  }
}

async function continueWork($: EngineInterface) {
  try {
    await update($, coach, c => ({ ...c, isReset: false }))
    await $.prompt.submit({ text: 'My 5-hour limit has reset. Please continue where you left off.' } as never)
  } catch {
    // a missed press is fine; typing continue still works
  }
}

async function rollQuote($: EngineInterface) {
  try {
    await update($, quote, nextQuote)
  } catch {
    // keep the quote that is showing
  }
}

async function refreshAgents($: EngineInterface) {
  try {
    const list = await $.agent.list()
    const live: AgentChip[] = list
      .filter(a => a.status === 'running' || a.status === 'waiting')
      .map(a => ({ id: a.id, name: nameFor(a.id), type: a.type }))
    hasAgents = live.length > 0
    const key = live.map(a => a.id).join(',')
    if (key === lastAgentsKey) return
    lastAgentsKey = key
    await update($, agents, () => live)
  } catch {
    // the roster is cosmetic
  }
}

/** Moves the phase without holding up the turn: the write lands in the background. */
async function setPhase($: EngineInterface, next: Phase) {
  isActive = next !== 'idle'
  const seq = ++phaseSeq
  try {
    await update($, phase, shown => (seq === phaseSeq ? next : shown))
  } catch {
    // the animation is cosmetic; never let it break a turn
  }
}

async function fetchWeather($: EngineInterface, city: string, unit: string) {
  try {
    let lat: number
    let lon: number
    let place: string
    if (city) {
      const g = await $.http.fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      )
      const hit = g.ok ? JSON.parse(g.text).results?.[0] : undefined
      if (!hit) return
      lat = Number(hit.latitude)
      lon = Number(hit.longitude)
      place = String(hit.name)
    } else {
      const g = await $.http.fetch('https://get.geojs.io/v1/ip/geo.json')
      if (!g.ok) return
      const here = JSON.parse(g.text)
      lat = Number(here.latitude)
      lon = Number(here.longitude)
      place = String(here.city || here.region || '')
    }
    const isF = unit === 'fahrenheit'
    const w = await $.http.fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,is_day&timezone=auto${isF ? '&temperature_unit=fahrenheit' : ''}`,
    )
    if (!w.ok) return
    const body = JSON.parse(w.text)
    const reading: Weather = {
      place,
      temp: Math.round(body.current.temperature_2m),
      unit: isF ? 'F' : 'C',
      code: Number(body.current.weather_code),
      isDay: body.current.is_day === 1,
    }
    await update($, weather, () => reading)
  } catch {
    // offline or a service hiccup: keep the last reading
  }
}

export const register: Register = (on, options) => {
  const city = String(options.city ?? 'Ludhiana').trim()
  const unit = String(options.unit ?? 'celsius')
  const petOption = options.pet === 'dog' ? 'dog' : 'cat'
  // wellness nudges, in minutes of active work; 0 turns one off
  const eyesMs = Math.max(0, Number(options.eyesMinutes ?? 20)) * 60_000
  const waterMs = Math.max(0, Number(options.waterMinutes ?? 60)) * 60_000

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Show or hide the context bar, or swap the pet: /context-bar [on|off|toggle|pet dog|pet cat]',
    })
    // `/context-bar off` sticks across sessions until it is turned back on
    if ((await $.store.get('isOn')) === false) await update($, isOn, () => false)
    // the pet: what /context-bar pet last chose, else the plugin's setting
    const chosen = await $.store.get('pet')
    const kind = chosen === 'dog' || chosen === 'cat' ? chosen : petOption
    await update($, pet, () => kind)
    // a `-p` run or the SDK draws no card: no timers, polling or ambient sound
    if (!e.isInteractive) return next(e)
    await refresh($)
    if (!(await read($, quote))) await rollQuote($)
    void fetchWeather($, city, unit)
    void refreshAgents($)
    // the cat animates itself; the band redraws for the agents' spinners,
    // and once in a while for the session length and the reset countdowns
    $.clock.every(SPINNER_MS, () => {
      tick += 1
      if (hasAgents) $.ui.invalidate('ui.render')
      if (isActive && tick % 4 === 0) void refreshAgents($)
    })
    $.clock.every(MINUTE_TICK_MS, () => {
      void refreshAgents($)
      void coachClock($)
      void wellnessClock($, eyesMs, waterMs)
      void $.clock.now().then(now => pomodoroClock($, now))
      $.ui.invalidate('ui.render')
    })
    $.clock.every(GPU_POLL_MS, () => void pollGpu($))
    void pollGpu($)
    void scanOutputs($)
    void loadGoal($)
    const sound = await $.store.get('ambient')
    if (sound === 'rain' || sound === 'storm' || sound === 'fire' || sound === 'focus') {
      await update($, ambient, () => sound)
      void playAmbient($, sound)
    }
    $.clock.every(WEATHER_REFRESH_MS, () => void fetchWeather($, city, unit))
    return next(e)
  })

  // None of these hold up the turn: the band's own work runs beside it.

  on('prompt.submit', ($, e, next) => {
    activitySeen = true
    void rollQuote($)
    void update($, coach, c => (c.isReset ? { ...c, isReset: false } : c)).catch(() => {})
    void refresh($)
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    activitySeen = true
    inFlight = 0
    void refreshAgents($)
    void setPhase($, 'thinking')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // a subagent's calls run under the main loop's Agent call, which already
    // reads as working; counting them would outlive the turn for one in the background
    if (e.agentId) return next(e)
    activitySeen = true
    inFlight += 1
    void setPhase($, 'working')
    try {
      return await next(e)
    } finally {
      inFlight = Math.max(0, inFlight - 1)
      if (inFlight === 0 && isActive) void setPhase($, 'thinking')
    }
  })

  on('turn.complete', ($, e, next) => {
    // every loop's turn counts toward the bill, subagents' included
    if (e.usage) void addSpend($, e.usage)
    if (!e.agentId) {
      activitySeen = true
      inFlight = 0
      void setPhase($, 'idle')
      void refresh($)
      void scanOutputs($)
    }
    return next(e)
  })

  // `/clear` starts a new conversation in the same process, with no
  // session.start: the tally and the names start over with it
  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear') return next(e)
    agentNames.clear()
    lastAgentsKey = ''
    void update($, spend, () => NO_SPEND).catch(() => {})
    void update($, agents, () => []).catch(() => {})
    void update($, output, () => null).catch(() => {})
    // read the fresh session once the clear has gone through, not the old one
    const ended = await next(e)
    void refresh($)
    return ended
  })

  on('ui.message', { element: 'fun' }, async ($, e, next) => {
    const message = e.data as FunMessage | undefined
    if (message && typeof message === 'object' && 'type' in message) void funClicked($, message)
    return next(e)
  })

  on('ui.message', { element: 'desk' }, async ($, e, next) => {
    const message = e.data as DeskMessage | undefined
    if (message && typeof message === 'object' && 'type' in message) void deskClicked($, message)
    return next(e)
  })

  // an effort typed by hand shows on the card too, for the model it was set on
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    const level = e.args.trim().toLowerCase()
    if (EFFORT_LEVELS.includes(level)) {
      const model = (await read($, snap))?.model ?? ''
      void update($, effortChoice, () => ({ model, level })).catch(() => {})
    }
    return result
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    void refresh($)
    return result
  })

  on('command.run', { command: 'context-bar' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    // `/context-bar pet dog`, `/context-bar pet cat`, or `/context-bar pet` to swap
    const words = arg.split(/\s+/)
    if (words[0] === 'sounds') {
      const isOn = words[1] !== 'off'
      await $.store.set('sounds', isOn)
      return { text: isOn ? "Rocky's sounds are on." : "Rocky is quiet now, until /context-bar sounds on." }
    }

    if (words[0] === 'nudges') {
      const isOn = words[1] !== 'off'
      await $.store.set('nudges', isOn)
      if (!isOn) await update($, wellness, w => ({ ...w, due: null }))
      return { text: isOn ? 'Rocky will remind you to rest your eyes and drink water.' : 'No more wellness nudges, until /context-bar nudges on.' }
    }

    if (words[0] === 'pet' || words[0] === 'dog' || words[0] === 'cat') {
      const asked = words[0] === 'pet' ? words[1] : words[0]
      const current = await read($, pet)
      const kind = asked === 'dog' || asked === 'cat' ? asked : current === 'cat' ? 'dog' : 'cat'
      await update($, pet, () => kind)
      await $.store.set('pet', kind)
      return { text: kind === 'dog' ? 'Rocky is a dog now. Woof!' : 'Rocky is a cat now. Meow.' }
    }

    // a word it doesn't know explains the command rather than flipping the bar
    if (arg !== '' && arg !== 'on' && arg !== 'off' && arg !== 'toggle') {
      return {
        text: 'Usage: /context-bar [on|off|toggle] · pet dog|cat · sounds on|off · nudges on|off. On its own it switches the bar off or on.',
      }
    }
    const was = await read($, isOn)
    const now = arg === 'on' ? true : arg === 'off' ? false : !was
    await update($, isOn, () => now)
    await $.store.set('isOn', now)
    if (now) await refresh($)

    return { text: now ? 'Context bar on.' : 'Context bar off, in every session until /context-bar on.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)
    // the band is raised on these two alone, both of which draw a Client
    const isCardSurface = e.surface === 'terminal' || e.surface === 'desktop'
    if (s === null || !isCardSurface || e.props.hasSurvey || !(await read($, isOn))) {
      return next(e)
    }

    const { Box, Button, Client, Text } = $.ui.resolve(e)
    const bg = { backgroundColor: BG } as const
    const t = (color: string, text: string, extra: { bold?: boolean; italic?: boolean } = {}) => (
      <Text {...bg} color={color} {...extra}>
        {text}
      </Text>
    )
    /** `share` of `cells` filled in `color`, the rest an empty track. */
    const meter = (share: number, color: string, cells: number) => {
      const n = Math.round(Math.min(1, Math.max(0, share)) * cells)
      return (
        <Text {...bg}>
          {t(color, '▰'.repeat(n))}
          {t(TRACK, '▱'.repeat(cells - n))}
        </Text>
      )
    }
    const label = (text: string) => t(MUTED, text.padEnd(LABEL))

    // Layout: the card's border and padding take two columns each side.
    const columns = e.props.bodyColumns
    const inner = columns - 4
    const showFun = columns >= MIN_COLUMNS_FOR_FUN
    const funWidth = funColumns(columns)
    const dataWidth = showFun ? inner - funWidth - COLUMN_GAP : inner
    // the desk takes the right of the rows under the context bar when it fits
    const showDesk = dataWidth >= MIN_DATA_FOR_DESK
    const rowsWidth = showDesk ? dataWidth - DESK_WIDTH - DESK_GAP : dataWidth
    const meterCells = rowsWidth >= 70 ? 10 : 6

    const now = await $.clock.now()
    const [wx, live, shownQuote, stored, sp] = await Promise.all([
      read($, weather),
      read($, agents),
      read($, quote),
      read($, phase),
      read($, spend),
    ])
    const current: Phase = e.props.isWorking ? (stored === 'idle' ? 'thinking' : stored) : 'idle'
    const mood = percentColor(s.percent)
    const desk: DeskProps = {
      goal: await read($, goal),
      pomodoro: await read($, pomodoro),
      ambient: await read($, ambient),
      now,
    }
    const [gpuNow, party, wellnessNow, chosenEffort, newest] = await Promise.all([
      read($, gpu),
      read($, celebrate),
      read($, wellness),
      read($, effortChoice),
      read($, output),
    ])

    // The fun column's data; it draws and animates itself.
    const sky = wx ? skyStyle(wx.code, wx.isDay) : null
    // an effort set from the card or typed wins, while the same model is in use
    const shownEffort = chosenEffort && chosenEffort.model === s.model ? chosenEffort.level : s.effort
    const fun: FunProps = {
      showTagline: funWidth >= 26,
      layout: columns >= MIN_COLUMNS_FOR_SIDE ? 'side' : 'stack',
      pet: await read($, pet),
      model: s.model,
      effort: shownEffort,
      session: sessionLength(now, s.startedAt),
      weather:
        wx && sky
          ? {
              ...sky,
              temp: `${wx.temp}°${wx.unit}`,
              tempColor: heatColor(wx.temp, wx.unit),
              place: funWidth >= 26 ? wx.place.slice(0, 12) : '',
            }
          : null,
      phase: current,
      percent: s.percent,
      gpu: gpuNow,
      nudge: wellnessNow.due,
      celebrate: party,
    }

    // Context: used rows, then the compaction buffer, then free space.
    const used = s.rows.filter(r => r.kind === 'used' && r.tokens > 0)
    const bar = [...used, ...s.rows.filter(r => r.kind === 'buffer'), ...s.rows.filter(r => r.kind === 'free')]
    // one row when there is room: the label and share, the bar, the token counts
    const contextHead = `CONTEXT  ${s.percent}%  `
    const contextTail = `  ${compact(s.totalTokens)} / ${compact(s.maxTokens)}`
    // beside the desk the bar ends where the desk begins, its totals right after it
    const contextWidth = showDesk ? rowsWidth : dataWidth
    const isOneContextRow = contextWidth >= MIN_DATA_FOR_ONE_CONTEXT_ROW
    const barWidth = isOneContextRow ? contextWidth - contextHead.length - contextTail.length : contextWidth
    const cells = allocate(bar, s.maxTokens, Math.min(MAX_CELLS, Math.max(MIN_CELLS, barWidth)))

    // Cache: the share of the input reused from the prompt cache, which is
    // billed at a fraction of the input rate. The session's turns when the
    // mod has seen some, else the last reply's (say, just after a restart).
    const inputSeen = sp.cacheRead + sp.cacheWrite + sp.input
    const last = s.lastReply
    const lastSeen = last ? last.cacheRead + last.cacheWrite + last.input : 0
    const hit = inputSeen > 0 ? sp.cacheRead / inputSeen : last && lastSeen > 0 ? last.cacheRead / lastSeen : null

    // Cost at API rates: /cost's total, itemized from the turns seen here;
    // 'other' is what /cost counts beyond them (background calls, turns before
    // the mod loaded).
    const itemized = sp.usdInput + sp.usdOutput + sp.usdRead + sp.usdWrite
    const total = Math.max(s.costUsd ?? 0, itemized)
    const other = total - itemized
    const costParts: [string, number, string][] = [
      ['in', sp.usdInput, BLUE],
      ['out', sp.usdOutput, GREEN],
      ['read', sp.usdRead, TEAL],
      ['write', sp.usdWrite, PEACH],
      ...(other >= 0.01 ? [['other', other, MUTED] as [string, number, string]] : []),
    ]
    const costCells = shareCells(
      costParts.map(([, usd]) => usd),
      meterCells,
    )
    // the parts so far, named in their bar colours; beside the total when they fit
    const shownParts = costParts.filter(([, usd]) => usd > 0)
    const legendWidth = shownParts.reduce((w, [name, usd]) => w + 5 + name.length + 1 + money(usd).length, 0)
    const legendBeside = LABEL + meterCells + 1 + money(total).length + legendWidth <= rowsWidth
    const costLegend = (
      <Text {...bg}>
        {shownParts.map(([name, usd, color]) => (
          <Text key={`v${name}`} {...bg}>
            {t(color, '   ● ')}
            {t(MUTED, `${name} ${money(usd)}`)}
          </Text>
        ))}
      </Text>
    )

    const effortLevel = EFFORTS.indexOf(shownEffort ?? '') + 1
    const spinFrame = Math.floor(now / SPINNER_MS)
    const shownAgents = live.slice(0, 4)

    // Limit Coach: the pace the 5-hour window fills at, when it would run out first
    const coached = await read($, coach)
    const eta = minutesToFull(coached.samples, now, s.fiveHour)

    const barCells = bar.map((r, i) => (
      <Text key={`c${i}`} {...bg} color={colorFor(r)}>
        {(r.kind === 'free' ? '░' : r.kind === 'buffer' ? '▒' : '█').repeat(cells[i] ?? 0)}
      </Text>
    ))

    const limit = (name: string, lim: Limit | null, warning: string | null = null) => (
      <Text {...bg}>
        {label(name)}
        {lim === null ? (
          t(MUTED, 'shows after the next reply')
        ) : (
          <Text {...bg}>
            {meter(lim.percent / 100, percentColor(lim.percent), meterCells)}
            {t(percentColor(lim.percent), ` ${Math.round(lim.percent)}%`, { bold: true })}
            {t(MUTED, resetsIn(now, lim.resetsAt) ? ` ↻ ${resetsIn(now, lim.resetsAt)}` : '')}
            {warning ? t(PEACH, ` ⚠ ${warning}`, { bold: true }) : null}
          </Text>
        )}
      </Text>
    )
    const fiveWarning = eta === null ? null : etaText(eta)

    const modelLine = (
      <Text {...bg} wrap="truncate-end">
        {t(BLUE, '◆ ')}
        {t(TEXT, s.model || 'Claude', { bold: true })}
        {shownEffort && (
          <Text {...bg}>
            {t(MUTED, '  effort ')}
            {meter(effortLevel / EFFORTS.length, MAUVE, EFFORTS.length)}
            {t(TEXT, ` ${shownEffort}`)}
          </Text>
        )}
      </Text>
    )

    return (
      <Box
        {...bg}
        width={columns}
        flexDirection="row"
        alignItems="center"
        paddingX={1}
        borderStyle="round"
        borderColor={BORDER}
      >
        {showFun && (
          <Box {...bg} width={funWidth} marginRight={COLUMN_GAP}>
            <Client key="fun" module="./fun-column.tsx" props={fun} width={funWidth} />
          </Box>
        )}
        <Box {...bg} flexDirection="column" flexGrow={1}>
          <Box {...bg} flexDirection="row">
            <Box {...bg} flexDirection="column" flexGrow={1}>
              {isOneContextRow ? (
                <Text {...bg} wrap="truncate-end">
                  {t(MUTED, 'CONTEXT  ')}
                  {t(mood, `${s.percent}%`, { bold: true })}
                  {t(MUTED, '  ')}
                  {barCells}
                  {t(MUTED, contextTail)}
                </Text>
              ) : (
                [
                  <Text key="head" {...bg} wrap="truncate-end">
                    {t(MUTED, 'CONTEXT  ')}
                    {t(mood, `${s.percent}%`, { bold: true })}
                    {t(MUTED, `   ${compact(s.totalTokens)} / ${compact(s.maxTokens)}`)}
                  </Text>,
                  <Text key="bar" {...bg}>
                    {barCells}
                  </Text>,
                ]
              )}
              <Text {...bg} wrap="truncate-end">
                {used.map((r, i) => (
                  <Text key={`l${i}`} {...bg}>
                    {t(colorFor(r), '● ')}
                    {t(MUTED, `${shortName(r.name)} ${compact(r.tokens)}${i < used.length - 1 ? '   ' : ''}`)}
                  </Text>
                ))}
              </Text>
              {rowsWidth >= MIN_DATA_FOR_ONE_LIMIT_ROW ? (
                <Text {...bg} wrap="truncate-end">
                  {limit('5H', s.fiveHour, fiveWarning)}
                  {t(MUTED, '     ')}
                  {limit('WEEK', s.sevenDay)}
                </Text>
              ) : (
                [
                  <Text key="five" {...bg} wrap="truncate-end">
                    {limit('5H', s.fiveHour, fiveWarning)}
                  </Text>,
                  <Text key="week" {...bg} wrap="truncate-end">
                    {limit('WEEK', s.sevenDay)}
                  </Text>,
                ]
              )}
              {coached.isReset && (
                <Box {...bg} flexDirection="row" alignItems="center">
                  {label('5H')}
                  {t(GREEN, 'reset!  ', { bold: true })}
                  <Button
                    key="continue"
                    variant="primary"
                    label="Continue where we left off"
                    onPress={() => void continueWork($)}
                  />
                </Box>
              )}
              <Text {...bg} wrap="truncate-end">
                {label('CACHE')}
                {hit === null ? (
                  t(MUTED, "fills in after Claude's next reply")
                ) : (
                  <Text {...bg}>
                    {meter(hit, TEAL, meterCells)}
                    {t(TEAL, ` ${Math.round(hit * 100)}% reused`, { bold: true })}
                    {inputSeen > 0
                      ? sp.usdSaved >= 0.005 && (
                          <Text {...bg}>
                            {t(MUTED, '   saved ')}
                            {t(GREEN, money(sp.usdSaved), { bold: true })}
                            {t(MUTED, ' vs no cache')}
                          </Text>
                        )
                      : t(MUTED, '   on the last reply')}
                  </Text>
                )}
              </Text>
              <Text {...bg} wrap="truncate-end">
                {label('API $')}
                {total > 0
                  ? costParts.map(([name, , color], i) => (
                      <Text key={`k${name}`} {...bg} color={color}>
                        {'▰'.repeat(costCells[i] ?? 0)}
                      </Text>
                    ))
                  : t(TRACK, '▱'.repeat(meterCells))}
                {t(TEXT, ` ${money(total)}`, { bold: true })}
                {total > 0 ? (legendBeside ? costLegend : null) : t(MUTED, '   at API rates')}
              </Text>
              {total > 0 && !legendBeside && (
                <Text {...bg} wrap="truncate-end">
                  {t(MUTED, ' '.repeat(LABEL - 3))}
                  {costLegend}
                </Text>
              )}
              {/* the model sits under the weather in the fun column; with no fun column, here */}
              {!showFun && modelLine}
              {newest && (
                <Box {...bg} flexDirection="row" alignItems="center">
                  {label('OUTPUT')}
                  {t(PEACH, '▣ ')}
                  {t(TEXT, newest.name.length > 40 ? `${newest.name.slice(0, 37)}...` : newest.name, { bold: true })}
                  {t(MUTED, `  ${ago(now, newest.mtimeMs)}  `)}
                  <Box {...bg} marginRight={1}>
                    <Button key="open-output" label="Open" onPress={() => void openPath($, newest.path, false)} />
                  </Box>
                  <Button key="open-folder" label="Folder" onPress={() => void openPath($, newest.path, true)} />
                </Box>
              )}
              <Box {...bg} flexDirection="row" flexWrap="wrap" alignItems="center">
                {label('ASK')}
                {ACTIONS.map(([key, name, prompt]) => (
                  <Box key={key} {...bg} marginRight={1}>
                    <Button key={key} label={name} onPress={() => void sendPrompt($, prompt)} />
                  </Box>
                ))}
                {/* compaction only earns its button once the context is getting full */}
                {s.percent >= COMPACT_FROM && (
                  <Box key="compact" {...bg} marginRight={1}>
                    <Button key="compact" label={`Compact · ${s.percent}%`} onPress={() => void compactNow($)} />
                  </Box>
                )}
              </Box>
              {shownAgents.length > 0 && (
                <Text {...bg} wrap="truncate-end">
                  {label('AGENTS')}
                  {shownAgents.map((a, i) => (
                    <Text key={a.id} {...bg}>
                      {t(YELLOW, `${SPINNER[(spinFrame + i * 3) % SPINNER.length]} `)}
                      {t(TEXT, a.name, { bold: true })}
                      {t(MUTED, ` ${a.type}${i < shownAgents.length - 1 ? '   ' : ''}`)}
                    </Text>
                  ))}
                  {live.length > shownAgents.length && t(MUTED, `   +${live.length - shownAgents.length}`)}
                </Text>
              )}
              <Text {...bg} wrap="wrap">
                {t(YELLOW, '✦ ')}
                {t(TEXT, shownQuote || (QUOTES[0] ?? ''), { italic: true })}
              </Text>
            </Box>
            {showDesk && (
              <Box {...bg} marginLeft={DESK_GAP}>
                <Client key="desk" module="./desk.tsx" props={desk} width={DESK_WIDTH} />
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    )
  })
}
