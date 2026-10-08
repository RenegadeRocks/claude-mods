// The desk's surface module: a cozy night desk drawn in pixels (see
// ./desk-art.ts), a notebook strip that holds this project's goal, and a
// drawer with the focus timer and the ambient sound. It animates on its own
// clock. Typing and clicks that change something outside it are posted to
// the hooks module.

import type { ClientModule } from 'claude-code'

import type { Ambient, DeskMessage, DeskProps } from '../types'
import { DESK_WIDTH, DRAWER_ROW, NOTE_ROW, paintScene, runs } from './desk-art'

const FRAME_MS = 250
// the lamp, in cells: a click on it switches it off and on
const LAMP = { x0: 33, x1: 43, y0: 0, y1: 5 }
// the drawer's two controls, by column
const TIMER_END = 26
const SOUND_START = DESK_WIDTH - 16

const WOOD = '#5e3b28'
const PAPER = '#efe6d2'
const INK = '#2a2340'
const FADED_INK = '#8a8296'
const BRASS = '#f9e2af'
const TEAL = '#94e2d5'

const SOUND_NAMES: Record<Ambient, string> = { off: 'sounds off', rain: 'rain', fire: 'fireplace', focus: 'deep focus' }

type Local = { frame: number; baseNow: number; baseFrame: number; isEditing: boolean; isLampOn: boolean }

function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const Desk: ClientModule<DeskProps, Local> = (props, surface) => {
  const { Box, Input, Text } = surface.elements
  const fresh: Local = { frame: 0, baseNow: props.now, baseFrame: 0, isEditing: false, isLampOn: true }
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

  surface.onPointer(e => {
    const s = surface.state
    if (!s || e.type !== 'down' || e.button !== 'left') return
    if (e.y === NOTE_ROW) {
      surface.setState({ ...s, isEditing: true })
    } else if (e.y === DRAWER_ROW && e.x < TIMER_END) {
      post({ type: 'pomodoro' })
    } else if (e.y === DRAWER_ROW && e.x >= SOUND_START) {
      post({ type: 'ambient' })
    } else if (e.x >= LAMP.x0 && e.x <= LAMP.x1 && e.y >= LAMP.y0 && e.y <= LAMP.y1) {
      surface.setState({ ...s, isLampOn: !s.isLampOn })
    }
  })

  const scene = paintScene(local.frame, new Date(now), props.ambient, local.isLampOn)

  // the drawer: the focus timer on the left, the ambient sound on the right
  const { phase, endsAt, rounds } = props.pomodoro
  const timer =
    phase === 'idle' || endsAt === null
      ? '◷ start a 25-min focus'
      : `${phase === 'focus' ? '◷' : '◌'} ${clockText(endsAt - now)} ${phase === 'focus' ? 'focus' : 'break'}  ${'●'.repeat(rounds % 4)}${'○'.repeat(4 - (rounds % 4))}`
  const sound = `♪ ${SOUND_NAMES[props.ambient]}`
  const drawer = ` ${timer}`.padEnd(SOUND_START).slice(0, SOUND_START) + sound.padStart(DESK_WIDTH - SOUND_START - 1) + ' '

  const goal = props.goal.trim()
  const note = ` ✎ ${goal || "click to write today's goal"}`.padEnd(DESK_WIDTH - 2).slice(0, DESK_WIDTH - 2)

  return (
    <Box flexDirection="column" backgroundColor={WOOD}>
      {scene.map((row, y) => (
        <Text key={`r${y}`} backgroundColor={WOOD}>
          {runs(row).map((cell, i) => (
            <Text key={`c${i}`} color={cell.fg} backgroundColor={cell.bg}>
              {cell.ch}
            </Text>
          ))}
        </Text>
      ))}
      {local.isEditing ? (
        <Input
          key="goal"
          value={goal}
          placeholder="today's goal"
          submitLabel="save"
          autoFocus
          onSubmit={text => {
            post({ type: 'goal', text })
            const s = surface.state
            if (s) surface.setState({ ...s, isEditing: false })
          }}
        />
      ) : (
        <Text backgroundColor={WOOD}>
          <Text backgroundColor={WOOD}> </Text>
          <Text backgroundColor={PAPER} color={goal ? INK : FADED_INK} italic={!goal}>
            {note}
          </Text>
          <Text backgroundColor={WOOD}> </Text>
        </Text>
      )}
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
