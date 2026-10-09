// The desk's surface module: a cozy night desk drawn in pixels (see
// ./desk-art.ts), a notebook strip that holds this project's goal, and a
// drawer with the focus timer and the ambient sound. It animates on its own
// clock. Typing and clicks that change something outside it are posted to
// the hooks module.

import type { ClientModule } from 'claude-code'

import type { Ambient, DeskMessage, DeskProps } from '../types'
import { COMPACT_DESK_WIDTH, DESK_WIDTH, DRAWER_ROW, NOTE_ROW, paintScene, runs, skyFor } from './desk-art'

const FRAME_MS = 250
// the lamp, in cells: a click on it switches it off and on (the compact desk leaves it out)
const LAMP = { x0: 32, x1: 42, y0: 1, y1: 5 }
// the notebook strip: its width inside the wood, the longest goal, and the hint shown while typing
const MAX_GOAL = 120
const SAVE_HINT = ' enter saves '
const COMPACT_SAVE_HINT = ' ↵ save '
const PENCIL = ' ✎  '
// an open note with no typing for this many frames (30 s) saves itself: Escape
// hands the keyboard back without telling the desk
const IDLE_SAVE_FRAMES = 120

const WOOD = '#5e3b28'
const PAPER = '#ddd2ba'
const INK = '#2a2340'
const FADED_INK = '#7a7286'
const BRASS = '#f9e2af'
const TEAL = '#94e2d5'

const SOUND_NAMES: Record<Ambient, string> = { off: 'sounds off', rain: 'rain', storm: 'thunderstorm', fire: 'fireplace', focus: 'deep focus' }
const SHORT_SOUND_NAMES: Record<Ambient, string> = { off: 'off', rain: 'rain', storm: 'storm', fire: 'fire', focus: 'focus' }

type Local = {
  frame: number
  baseNow: number
  baseFrame: number
  isEditing: boolean
  draft: string
  /** The frame of the last key typed into the note. */
  typedAt: number
  isLampOn: boolean
}

// keys that arrive by name rather than as the character they type
const NAMED_KEYS = new Set([
  'up', 'down', 'left', 'right', 'tab', 'delete', 'insert', 'pageup', 'pagedown',
  'home', 'end', 'escape', 'return', 'backspace', 'clear', 'capslock',
])

/**
 * What a key types into the note: a character, a space, or a pasted run of
 * text; null for a named key such as 'pagedown' or 'f5'.
 */
function typedText(key: string): string | null {
  if (key === 'space') return ' '
  if (NAMED_KEYS.has(key) || /^f\d{1,2}$/.test(key)) return null
  return key.replace(/[\r\n\t]+/g, ' ')
}

/** How many terminal cells a character takes: two for wide East Asian scripts and emoji. */
function cellsOf(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  const isWide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  return isWide ? 2 : 1
}

/** As much of the text as fits in `width` cells, from its start or (`fromEnd`) its end, and the cells it takes. */
function fitCells(text: string, width: number, fromEnd = false): { text: string; cells: number } {
  const chars = [...text]
  if (fromEnd) chars.reverse()
  let used = 0
  const kept: string[] = []
  for (const ch of chars) {
    const w = cellsOf(ch)
    if (used + w > width) break
    kept.push(ch)
    used += w
  }
  if (fromEnd) kept.reverse()
  return { text: kept.join(''), cells: used }
}

function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const Desk: ClientModule<DeskProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  // the full desk, or the compact one: the scene's left part and a shorter drawer
  const width = props.isCompact ? COMPACT_DESK_WIDTH : DESK_WIDTH
  const timerEnd = props.isCompact ? 18 : 26
  const soundStart = width - (props.isCompact ? 10 : 16)
  const noteWidth = width - 2
  const saveHint = props.isCompact ? COMPACT_SAVE_HINT : SAVE_HINT
  const fresh: Local = { frame: 0, baseNow: props.now, baseFrame: 0, isEditing: false, draft: '', typedAt: 0, isLampOn: true }
  if (surface.state === undefined) {
    surface.setState(fresh)
    surface.every(FRAME_MS, () => {
      const s = surface.state
      if (s) surface.setState({ ...s, frame: s.frame + 1 })
    })
  }
  const local = surface.state ?? fresh
  // the hooks hand a fresh time every few seconds; between them, count frames
  const isNewTime = props.now !== local.baseNow
  if (isNewTime) surface.setState({ ...local, baseNow: props.now, baseFrame: local.frame })
  const now = isNewTime ? props.now : props.now + (local.frame - local.baseFrame) * FRAME_MS

  const post = (message: DeskMessage) => surface.post(message)
  const saveGoal = (s: Local) => {
    post({ type: 'goal', text: s.draft })
    surface.setState({ ...s, isEditing: false })
  }

  surface.onPointer(e => {
    const s = surface.state
    if (!s || e.type !== 'down' || e.button !== 'left') return
    if (e.y === NOTE_ROW) {
      // the click gives the desk the keyboard; a second click saves
      if (s.isEditing) saveGoal(s)
      else surface.setState({ ...s, isEditing: true, draft: props.goal.trim(), typedAt: s.frame })
    } else if (e.y === DRAWER_ROW && e.x < timerEnd) {
      post({ type: 'pomodoro' })
    } else if (e.y === DRAWER_ROW && e.x >= soundStart) {
      post({ type: 'ambient' })
    } else if (!props.isCompact && e.x >= LAMP.x0 && e.x <= LAMP.x1 && e.y >= LAMP.y0 && e.y <= LAMP.y1) {
      surface.setState({ ...s, isLampOn: !s.isLampOn })
    }
  })

  // while the note is open, typing goes into it: Enter saves, Backspace erases
  surface.onKey(e => {
    const s = surface.state
    if (!s?.isEditing || e.ctrl || e.meta) return
    if (e.key === 'return') saveGoal(s)
    // by characters, not UTF-16 units, so an emoji is erased whole
    else if (e.key === 'backspace') surface.setState({ ...s, draft: [...s.draft].slice(0, -1).join(''), typedAt: s.frame })
    else {
      const typed = typedText(e.key)
      if (typed !== null) {
        surface.setState({ ...s, draft: [...(s.draft + typed)].slice(0, MAX_GOAL).join(''), typedAt: s.frame })
      }
    }
  })

  const latest = surface.state ?? local
  if (latest.isEditing && latest.frame - latest.typedAt > IDLE_SAVE_FRAMES) saveGoal(latest)

  // the window's sky follows the focus timer: dawn as you focus, morning on the break
  const full = paintScene(local.frame, new Date(now), props.ambient, local.isLampOn, skyFor(props.pomodoro, now), props.glow)
  const scene = props.isCompact ? full.map(row => row.slice(0, width)) : full

  // the drawer: the focus timer on the left, the ambient sound on the right
  const { phase, endsAt, rounds } = props.pomodoro
  const timer =
    phase === 'idle' || endsAt === null
      ? props.isCompact
        ? '◷ 25-min focus'
        : '◷ start a 25-min focus'
      : `${phase === 'focus' ? '◷' : '◌'} ${clockText(endsAt - now)} ${phase === 'focus' ? 'focus' : 'break'}${props.isCompact ? ' ' : '  '}${'●'.repeat(rounds % 4)}${'○'.repeat(4 - (rounds % 4))}`
  const sound = `♪ ${(props.isCompact ? SHORT_SOUND_NAMES : SOUND_NAMES)[props.ambient]}`
  const drawer = ` ${timer}`.padEnd(soundStart).slice(0, soundStart) + sound.padStart(width - soundStart - 1) + ' '

  const goal = props.goal.trim()
  // while typing, the end of the draft stays in view, with a blinking caret;
  // widths count terminal cells, so wide characters can't push the row out
  // the pencil draws two cells wide in some terminals, so two spaces follow it
  const room = noteWidth - PENCIL.length - 1 - saveHint.length
  const caret = local.frame % 4 < 2 ? '▏' : ' '
  const tail = fitCells(local.draft, room, true)
  const typing = `${PENCIL}${tail.text}${caret}${' '.repeat(room - tail.cells)}`
  const head = fitCells(`${PENCIL}${goal || (props.isCompact ? "today's goal" : "click to write today's goal")}`, noteWidth)
  const note = head.text + ' '.repeat(noteWidth - head.cells)

  return (
    <Box flexDirection="column" backgroundColor={WOOD}>
      {scene.map((row, y) => (
        <Text key={`r${y}`} backgroundColor={WOOD}>
          {runs(row).map((cell, i) => (
            <Text key={`c${i}`} color={cell.fg} backgroundColor={cell.bg} bold={cell.bold}>
              {cell.ch}
            </Text>
          ))}
        </Text>
      ))}
      <Text backgroundColor={WOOD}>
        <Text backgroundColor={WOOD}> </Text>
        {local.isEditing ? (
          <Text backgroundColor={PAPER}>
            <Text backgroundColor={PAPER} color={INK}>
              {typing}
            </Text>
            <Text backgroundColor={PAPER} color={FADED_INK} italic>
              {saveHint}
            </Text>
          </Text>
        ) : (
          <Text backgroundColor={PAPER} color={goal ? INK : FADED_INK} italic={!goal}>
            {note}
          </Text>
        )}
        <Text backgroundColor={WOOD}> </Text>
      </Text>
      <Text backgroundColor={WOOD}>
        <Text backgroundColor={WOOD} color={BRASS}>
          {drawer.slice(0, soundStart)}
        </Text>
        <Text backgroundColor={WOOD} color={TEAL}>
          {drawer.slice(soundStart)}
        </Text>
      </Text>
    </Box>
  )
}

export default Desk
