// soundtrack: soft sounds for what Claude is doing. A rising chord when it
// starts on your prompt, a quiet tick as tools run, a chime when it's done,
// two low notes when a turn is cut short.

import type { EngineInterface, Register } from 'claude-code'

type Clip = 'start' | 'tool' | 'done' | 'oops'

// a burst of tool calls stays a soft patter: one tick per this many ms at most
const TICK_GAP_MS = 3000

let isOn = true
let lastTick = Number.NEGATIVE_INFINITY
let isWindows: boolean | null = null

/**
 * Plays one of the mod's clips without holding anything up. The engine's own
 * player only sounds on macOS, so on Windows PowerShell plays the file.
 */
async function play($: EngineInterface, clip: Clip) {
  if (!isOn) return
  try {
    if (isWindows === null) isWindows = (await $.env.get('OS')) === 'Windows_NT'
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

/** A tool's tick, unless one played within the last few seconds. */
async function tick($: EngineInterface) {
  try {
    const now = await $.clock.now()
    if (now - lastTick < TICK_GAP_MS) return
    lastTick = now
    await play($, 'tool')
  } catch {
    // skip this one
  }
}

export const register: Register = (on, options) => {
  const toolTicks = options.toolTicks !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'soundtrack',
      description: 'Turn the soundtrack on or off, remembered across sessions, or hear it: /soundtrack [on|off|test]',
    })
    isOn = (await $.store.get('isOn')) !== false
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    void play($, 'start')
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    // the main loop's tools only; a subagent's calls would drown it out
    if (toolTicks && !e.agentId) void tick($)
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (!e.agentId) void play($, e.reason === 'answer' ? 'done' : 'oops')
    return next(e)
  })

  on('command.run', { command: 'soundtrack' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'test') {
      const wasOn = isOn
      isOn = true
      for (const clip of ['start', 'tool', 'done', 'oops'] as const) await play($, clip)
      isOn = wasOn
      return { text: 'That was: start, tool, done, oops.' }
    }
    isOn = arg === 'on' ? true : arg === 'off' ? false : !isOn
    await $.store.set('isOn', isOn)
    return { text: isOn ? 'Soundtrack on.' : 'Soundtrack off, in every session until /soundtrack on.' }
  })
}
