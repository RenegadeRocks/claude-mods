// The fun column's surface module: signature, session, weather, the phase
// animation and Rocky. It runs on the surface's own frame clock, so the cat
// moves without the band redrawing, and it takes clicks itself: no Button,
// so nothing lights up under the pointer.

import type { ClientModule } from 'claude-code'

import type { FunProps } from '../types'
import { FRAME_MS, PET_NAME, REACTION_FRAMES, REACTIONS, petStage, petView, thinkingCells, workingCells } from './pet'
import { BG, BLUE, MAUVE, MUTED, PINK, SIGNATURE_STOPS, TEAL, TEXT, TRACK, YELLOW, gradient, percentColor } from './theme'

const SIGNATURE = 'RenegadeRocks'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

type Local = {
  frame: number
  reaction: { kind: string; at: number } | null
  last: string
  isHovered: boolean
}

const FunColumn: ClientModule<FunProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ frame: 0, reaction: null, last: '', isHovered: false })
    surface.every(FRAME_MS, () => {
      const s = surface.state
      if (s) surface.setState({ ...s, frame: s.frame + 1 })
    })
  }
  const local = surface.state ?? { frame: 0, reaction: null, last: '', isHovered: false }
  const { frame } = local

  const mood = percentColor(props.percent)
  const stage = petStage(props.pet, props.percent)
  const reaction = local.reaction ? { kind: local.reaction.kind, t: frame - local.reaction.at } : null
  const plate = local.isHovered
    ? { text: `♥ pet ${PET_NAME}`, color: PINK }
    : { text: `${PET_NAME} · ${stage.title}`, color: mood }
  const view = petView(stage.lines, props.pet, props.phase, frame, props.percent >= 85, plate, reaction)
  const effortLevel = EFFORTS.indexOf(props.effort ?? '') + 1
  const anim = props.phase === 'thinking' ? thinkingCells(frame) : props.phase === 'working' ? workingCells(frame) : []
  const label = props.phase
  const labelColor = props.phase === 'thinking' ? MAUVE : props.phase === 'working' ? YELLOW : MUTED

  // rows above the pet: signature, session, weather (when known), model, animation
  const petTop = props.weather ? 5 : 4
  surface.onPointer(e => {
    const s = surface.state
    if (!s) return
    const isOverPet = e.y >= petTop && e.type !== 'leave'
    if (e.type === 'down' && e.button === 'left' && isOverPet) {
      let kind = s.last
      while (kind === s.last) kind = REACTIONS[Math.floor(Math.random() * REACTIONS.length)] ?? 'hearts'
      surface.setState({ ...s, reaction: { kind, at: s.frame }, last: kind })
    } else if (isOverPet !== s.isHovered) {
      surface.setState({ ...s, isHovered: isOverPet })
    }
  })
  // a finished reaction is dropped, so the next click starts clean
  if (local.reaction && frame - local.reaction.at >= REACTION_FRAMES) {
    surface.setState({ ...local, reaction: null })
  }

  const t = (color: string, text: string, extra: { bold?: boolean; italic?: boolean } = {}) => (
    <Text backgroundColor={BG} color={color} {...extra}>
      {text}
    </Text>
  )

  return (
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
          {props.weather.place ? t('#b4befe', ` ${props.weather.place}`, { italic: true }) : null}
        </Text>
      )}
      <Text backgroundColor={BG} wrap="truncate-end">
        {t(BLUE, '◆ ')}
        {t(TEXT, props.model || 'Claude', { bold: true })}
        {props.effort && props.showTagline && (
          <Text backgroundColor={BG}>
            {t(MAUVE, ` ${'▰'.repeat(effortLevel)}`)}
            {t(TRACK, '▱'.repeat(EFFORTS.length - effortLevel))}
          </Text>
        )}
        {props.effort ? t(MUTED, ` ${props.effort}`) : null}
      </Text>
      <Text backgroundColor={BG}>
        {anim.map((c, i) => (
          <Text key={`a${i}`} backgroundColor={BG} color={c.color}>
            {c.ch}
          </Text>
        ))}
        {t(labelColor, `${anim.length > 0 ? ' ' : ''}${label}`)}
      </Text>
      <Box key="pet" flexDirection="column" alignSelf="center" backgroundColor={BG}>
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
    </Box>
  )
}

export default FunColumn
