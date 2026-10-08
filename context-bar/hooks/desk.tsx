// The desk's surface module: a cozy night desk drawn in pixels (see
// ./desk-art.ts), a notebook strip that holds this project's goal, and a
// drawer with the focus timer and the ambient sound. It animates on its own
// clock. Typing and clicks that change something outside it are posted to
// the hooks module.

import type { ClientModule } from 'claude-code'

import type { Ambient, DeskMessage, DeskProps } from '../types'
import { DESK_WIDTH, DRAWER_ROW, NOTE_ROW, paintScene, runs, skyFor } from './desk-art'

const FRAME_MS = 250
// the lamp, in cells: a click on it switches it off and on
const LAMP = { x0: 32, x1: 42, y0: 1, y1: 5 }
// the drawer's two controls, by column
const TIMER_END = 26
const SOUND_START = DESK_WIDTH - 16
// the notebook strip: its width inside the wood, the longest goal, and the hint shown while typing
const NOTE_WIDTH = DESK_WIDTH - 2
const MAX_GOAL = 120
const SAVE_HINT = ' enter saves '
// keys with a name rather than a character; none of them types into the note
const NAMED_KEYS = new Set(['up', 'down', 'left', 'right', 'tab', 'delete', 'pageup', 'pagedown', 'home', 'end', 'escape'])

const WOOD = '#5e3b28'
const PAPER = '#efe6d2'
const INK = '#2a2340'
const FADED_INK = '#8a8296'
const BRASS = '#f9e2af'
const TEAL = '#94e2d5'

const SOUND_NAMES: Record<Ambient, string> = { off: 'sounds off', rain: 'rain', fire: 'fireplace', focus: 'deep focus' }

type Local = { frame: number; baseNow: number; baseFrame: number; isEditing: boolean; draft: string; isLampOn: boolean }

function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const Desk: ClientModule<DeskProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const fresh: Local = { frame: 0, baseNow: props.now, baseFrame: 0, isEditing: false, draft: '', isLampOn: true }
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
      else surface.setState({ ...s, isEditing: true, draft: props.goal.trim() })
    } else if (e.y === DRAWER_ROW && e.x < TIMER_END) {
      post({ type: 'pomodoro' })
    } else if (e.y === DRAWER_ROW && e.x >= SOUND_START) {
      post({ type: 'ambient' })
    } else if (e.x >= LAMP.x0 && e.x <= LAMP.x1 && e.y >= LAMP.y0 && e.y <= LAMP.y1) {
      surface.setState({ ...s, isLampOn: !s.isLampOn })
    }
  })

  // while the note is open, typing goes into it: Enter saves, Backspace erases
  surface.onKey(e => {
    const s = surface.state
    if (!s?.isEditing || e.ctrl || e.meta) return
    if (e.key === 'return') saveGoal(s)
    else if (e.key === 'backspace') surface.setState({ ...s, draft: s.draft.slice(0, -1) })
    else if (!NAMED_KEYS.has(e.key)) {
      const typed = e.key === 'space' ? ' ' : e.key.replace(/[\r\n\t]+/g, ' ')
      surface.setState({ ...s, draft: (s.draft + typed).slice(0, MAX_GOAL) })
    }
  })

  // the window's sky follows the focus timer: dawn as you focus, morning on the break
  const scene = paintScene(local.frame, new Date(now), props.ambient, local.isLampOn, skyFor(props.pomodoro, now))

  // the drawer: the focus timer on the left, the ambient sound on the right
  const { phase, endsAt, rounds } = props.pomodoro
  const timer =
    phase === 'idle' || endsAt === null
      ? '◷ start a 25-min focus'
      : `${phase === 'focus' ? '◷' : '◌'} ${clockText(endsAt - now)} ${phase === 'focus' ? 'focus' : 'break'}  ${'●'.repeat(rounds % 4)}${'○'.repeat(4 - (rounds % 4))}`
  const sound = `♪ ${SOUND_NAMES[props.ambient]}`
  const drawer = ` ${timer}`.padEnd(SOUND_START).slice(0, SOUND_START) + sound.padStart(DESK_WIDTH - SOUND_START - 1) + ' '

  const goal = props.goal.trim()
  // while typing, the end of the draft stays in view, with a blinking caret
  const room = NOTE_WIDTH - 3 - 1 - SAVE_HINT.length
  const caret = local.frame % 4 < 2 ? '▏' : ' '
  const typing = ` ✎ ${local.draft.slice(-room)}${caret}`.padEnd(NOTE_WIDTH - SAVE_HINT.length)
  const note = ` ✎ ${goal || "click to write today's goal"}`.padEnd(NOTE_WIDTH).slice(0, NOTE_WIDTH)

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
              {SAVE_HINT}
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
          {drawer.slice(0, SOUND_START)}
        </Text>
        <Text backgroundColor={WOOD} color={TEAL}>
          {drawer.slice(SOUND_START)}
        </Text>
      </Text>
    </Box>
  )
}

export default Desk
