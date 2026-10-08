// The fun column's surface module: signature, session, weather, the model and
// its effort (both clickable), the GPU while it works, the phase animation and
// the pet. It runs on the surface's own frame clock, so the pet moves without
// the band redrawing, and it takes clicks itself: no Button, so nothing lights
// up under the pointer. What a click changes outside the column it posts to
// the hooks module.

import type { ClientModule } from 'claude-code'

import type { FunMessage, FunProps } from '../types'
import { FRAME_MS, PET_NAME, REACTION_FRAMES, REACTIONS, petStage, petView, thinkingCells, workingCells } from './pet'
import {
  BG,
  BLUE,
  LAVENDER,
  MAUVE,
  MUTED,
  PINK,
  SIGNATURE_STOPS,
  TEAL,
  TEXT,
  TRACK,
  YELLOW,
  gradient,
  percentColor,
} from './theme'

const SIGNATURE = 'RenegadeRocks'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
// the picker under the model name: [label, the /model alias it sends]
const MODELS: [string, string][] = [
  ['Sonnet', 'sonnet'],
  ['Opus', 'opus'],
  ['Fable', 'fable'],
  ['Haiku', 'haiku'],
]
// the gap between the pet and its info rows, side by side
const SIDE_GAP = 3
// a full-ish pet explains itself this many frames (5 s), then not again for a minute
const EXPLAIN_FRAMES = 36
const EXPLAIN_REST_FRAMES = 430
// the pet's colour turns peach from this context share, pink from the next
const WARM = 65
const FULL = 85

type Local = {
  frame: number
  reaction: { kind: string; at: number } | null
  last: string
  isHovered: boolean
  isPicking: boolean
  /** The frame the pet last said why it is peach or pink; null before. */
  explainedAt: number | null
}

const FRESH: Local = { frame: 0, reaction: null, last: '', isHovered: false, isPicking: false, explainedAt: null }

const FunColumn: ClientModule<FunProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ ...FRESH })
    surface.every(FRAME_MS, () => {
      const s = surface.state
      if (s) surface.setState({ ...s, frame: s.frame + 1 })
    })
  }
  const local = surface.state ?? { ...FRESH }
  const { frame } = local
  const isPartying = props.celebrate !== null

  const mood = percentColor(props.percent)
  const stage = petStage(props.pet, props.percent)
  const reaction = local.reaction ? { kind: local.reaction.kind, t: frame - local.reaction.at } : null
  const plate = isPartying
    ? { text: 'job done! click', color: PINK }
    : props.nudge
      ? { text: 'click when done', color: PINK }
      : local.isHovered
        ? { text: props.percent >= WARM ? `${props.percent}% full · click` : `♥ pet ${PET_NAME}`, color: PINK }
        : { text: `${PET_NAME} · ${stage.title}`, color: mood }
  const view = petView(stage.lines, props.pet, props.phase, frame, props.percent >= 85, plate, reaction, props.nudge)
  // saying why it is peach or pink: two short lines, a few seconds each
  const isExplaining = local.explainedAt !== null && frame - local.explainedAt < EXPLAIN_FRAMES
  if (isExplaining) {
    const width = view.pet[0]?.length ?? 16
    const said =
      Math.floor((frame - (local.explainedAt ?? frame)) / 12) % 2 === 0
        ? props.percent >= FULL
          ? `I'm ${props.percent}% full!`
          : `getting full ${props.percent}%`
        : props.percent >= FULL
          ? 'Compact helps'
          : 'Compact soon'
    const left = Math.max(0, Math.floor((width - said.length) / 2))
    view.top = [{ text: (' '.repeat(left) + said).padEnd(width).slice(0, width), color: PINK }]
  }
  const effortLevel = EFFORTS.indexOf(props.effort ?? '') + 1
  const anim = props.phase === 'thinking' ? thinkingCells(frame) : props.phase === 'working' ? workingCells(frame) : []
  const labelColor = props.phase === 'thinking' ? MAUVE : props.phase === 'working' ? YELLOW : MUTED
  const model = props.model || 'Claude'
  const showMeter = Boolean(props.effort) && props.showTagline

  // Where things sit, for the pointer. Side by side the info rows start right
  // of the pet at the top; stacked they start at the column's top-left and the
  // pet sits under them.
  const isSide = props.layout === 'side'
  const petWidth = view.pet[0]?.length ?? 16
  const infoLeft = isSide ? petWidth + SIDE_GAP : 0
  const modelRow = props.weather ? 3 : 2
  const infoRows = modelRow + 1 + (local.isPicking ? 1 : 0) + (props.gpu ? 1 : 0) + 1
  const nameStart = infoLeft + 2
  const meterStart = nameStart + model.length + 1
  const pickerSpots = MODELS.map(([name, alias], i) => {
    const start = nameStart + MODELS.slice(0, i).reduce((w, [n]) => w + n.length + 2, 0)
    return { start, end: start + name.length, alias }
  })

  const post = (message: FunMessage) => surface.post(message)

  surface.onPointer(e => {
    const s = surface.state
    if (!s) return
    const isOverPet = e.type !== 'leave' && (isSide ? e.x < petWidth : e.y >= infoRows)
    if (e.type === 'down' && e.button === 'left') {
      if (isOverPet) {
        if (isPartying) {
          post({ type: 'celebrate-done' })
          surface.setState({ ...s, reaction: { kind: 'hearts', at: s.frame }, last: 'hearts' })
          return
        }
        if (props.nudge) {
          post({ type: 'nudge-done' })
          surface.setState({ ...s, reaction: { kind: 'hearts', at: s.frame }, last: 'hearts' })
          return
        }
        // peach or pink: the first click says why, in its speech row
        const isWarm = props.percent >= WARM
        if (isWarm && (s.explainedAt === null || s.frame - s.explainedAt > EXPLAIN_REST_FRAMES)) {
          surface.setState({ ...s, explainedAt: s.frame, reaction: null })
          return
        }
        let kind = s.last
        while (kind === s.last) kind = REACTIONS[Math.floor(Math.random() * REACTIONS.length)] ?? 'hearts'
        surface.setState({ ...s, reaction: { kind, at: s.frame }, last: kind })
        return
      }
      if (e.y === modelRow && e.x >= nameStart && e.x < nameStart + model.length) {
        surface.setState({ ...s, isPicking: !s.isPicking })
        return
      }
      if (e.y === modelRow && showMeter && e.x >= meterStart && e.x < meterStart + EFFORTS.length) {
        post({ type: 'effort', level: EFFORTS[e.x - meterStart] ?? 'high' })
        return
      }
      if (e.y === modelRow && props.effort && !showMeter && e.x >= meterStart) {
        // no meter in a narrow column: the effort word steps to the next level
        post({ type: 'effort', level: EFFORTS[(EFFORTS.indexOf(props.effort) + 1) % EFFORTS.length] ?? 'high' })
        return
      }
      const spot = s.isPicking && e.y === modelRow + 1 ? pickerSpots.find(p => e.x >= p.start && e.x < p.end) : undefined
      if (spot) {
        post({ type: 'model', alias: spot.alias })
        surface.setState({ ...s, isPicking: false })
      }
      return
    }
    if (isOverPet !== s.isHovered) surface.setState({ ...s, isHovered: isOverPet })
  })
  // a finished reaction is dropped, so the next click starts clean; while a
  // GPU job's party waits for a click, one dance or sparkle follows another
  const isReactionOver = !local.reaction || frame - local.reaction.at >= REACTION_FRAMES
  if (isPartying && isReactionOver) {
    const kind = local.last === 'sparkle' ? 'dance' : 'sparkle'
    surface.setState({ ...local, reaction: { kind, at: frame }, last: kind })
  } else if (local.reaction && isReactionOver) {
    surface.setState({ ...local, reaction: null })
  }

  const t = (color: string, text: string, extra: { bold?: boolean; italic?: boolean } = {}) => (
    <Text backgroundColor={BG} color={color} {...extra}>
      {text}
    </Text>
  )
  const isCurrent = (alias: string) => model.toLowerCase().startsWith(alias)

  const info = (
    <Box flexDirection="column" backgroundColor={BG}>
      <Text backgroundColor={BG} wrap="truncate-end">
        {gradient(SIGNATURE, SIGNATURE_STOPS).map((c, i) => (
          <Text key={`s${i}`} backgroundColor={BG} color={c.color} bold>
            {c.ch}
          </Text>
        ))}
        {props.showTagline && t(MUTED, ' claude code', { italic: true })}
      </Text>
      <Text backgroundColor={BG} wrap="truncate-end">
        {t(TEAL, '◷ ')}
        {t(TEXT, props.session, { bold: true })}
        {t(MUTED, ' session')}
      </Text>
      {props.weather && (
        <Text backgroundColor={BG} wrap="truncate-end">
          {t(props.weather.color, `${props.weather.glyph} ${props.weather.word}`)}
          {t(props.weather.tempColor, ` ${props.weather.temp}`, { bold: true })}
          {props.weather.place ? t(LAVENDER, ` ${props.weather.place}`, { italic: true }) : null}
        </Text>
      )}
      <Text backgroundColor={BG} wrap="truncate-end">
        {t(BLUE, '◆ ')}
        {t(TEXT, model, { bold: true })}
        {showMeter && (
          <Text backgroundColor={BG}>
            {t(MAUVE, ` ${'▰'.repeat(effortLevel)}`)}
            {t(TRACK, '▱'.repeat(EFFORTS.length - effortLevel))}
          </Text>
        )}
        {props.effort ? t(MUTED, ` ${props.effort}`) : null}
      </Text>
      {local.isPicking && (
        <Text backgroundColor={BG} wrap="truncate-end">
          {t(MUTED, '  ')}
          {MODELS.map(([name, alias], i) => (
            <Text key={alias} backgroundColor={BG} color={isCurrent(alias) ? BLUE : MUTED} bold={isCurrent(alias)}>
              {name}
              {i < MODELS.length - 1 ? '  ' : ''}
            </Text>
          ))}
        </Text>
      )}
      {props.gpu && (
        <Text backgroundColor={BG} wrap="truncate-end">
          {t(YELLOW, '▦ GPU ')}
          {t(percentColor(props.gpu.util), `${props.gpu.util}%`, { bold: true })}
          {t(MUTED, ` ${props.gpu.memUsed}/${props.gpu.memTotal} GB`)}
          {props.gpu.busyMinutes > 0 ? t(MUTED, ` · busy ${props.gpu.busyMinutes}m`) : null}
        </Text>
      )}
      <Text backgroundColor={BG}>
        {anim.map((c, i) => (
          <Text key={`a${i}`} backgroundColor={BG} color={c.color}>
            {c.ch}
          </Text>
        ))}
        {t(labelColor, `${anim.length > 0 ? ' ' : ''}${props.phase}`)}
      </Text>
    </Box>
  )

  const pet = (
    <Box key="pet" flexDirection="column" alignSelf={isSide ? 'flex-start' : 'center'} backgroundColor={BG}>
      {view.top.map((r, i) => (
        <Text key={`pt${i}`} backgroundColor={BG} color={r.color}>
          {r.text}
        </Text>
      ))}
      {view.pet.map((line, i) => (
        <Text key={`pet-${i}`} backgroundColor={BG} color={mood}>
          {line}
        </Text>
      ))}
      {view.bottom.map((r, i) => (
        <Text key={`pb${i}`} backgroundColor={BG} color={r.color}>
          {r.text}
        </Text>
      ))}
    </Box>
  )

  return isSide ? (
    <Box flexDirection="row" alignItems="flex-start" backgroundColor={BG}>
      {pet}
      <Box marginLeft={SIDE_GAP} backgroundColor={BG}>
        {info}
      </Box>
    </Box>
  ) : (
    <Box flexDirection="column" backgroundColor={BG}>
      {info}
      {pet}
    </Box>
  )
}

export default FunColumn
