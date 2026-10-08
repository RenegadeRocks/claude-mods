// Rocky the cat and the phase animations: pure functions of a frame number,
// drawn by the fun column's surface module on its own frame clock.

import type { Phase } from '../types'
import { GREEN, LAVENDER, MAUVE, MUTED, PINK, SKY, TEAL, TRACK, YELLOW } from './theme'
import type { Cell } from './theme'

export const FRAME_MS = 140
export const PET_NAME = 'Rocky'

export type PetKind = 'cat' | 'dog'

// One entry per growth stage: [context percent it appears from, its title,
// lines]. {E} is its three-character face and ¤ its tail; every line of a
// stage has the same width, and both pets grow one row per stage.
const CAT: [number, string, string[]][] = [
  [0, 'tiny', ['=({E})=']],
  [10, 'kitten', ['  /\\_/\\  ', '=( {E} )=']],
  [25, 'pouncer', ['  /\\_/\\  ', '=( {E} )=', '  > ^ <  ']],
  [40, 'prowler', ['  /\\_/\\  ', '=( {E} )=', '  > ^ <  ', '(______)¤']],
  [55, 'hunter', ['   /\\_/\\    ', ' =( {E} )=  ', '   > ^ <    ', ' /|     |\\  ', '(_|_____|_)¤']],
  [70, 'alpha', ['    /\\___/\\     ', '   (  {E}  )    ', '  =(   ^   )=   ', '  /|       |\\   ', ' / |       | \\  ', '(__|_______|__)¤']],
  [85, 'legend', ["     ' ! '      ", '    /\\___/\\     ', '   (  {E}  )    ', '  =(   ^   )=   ', '  /|       |\\   ', ' / |       | \\  ', '(__|_______|__)¤']],
]

// The dog: floppy U ears, a snout, and a tail that wags.
const DOG: [number, string, string[]][] = [
  [0, 'tiny', ['U({E})U']],
  [10, 'puppy', [' .-----. ', 'U( {E} )U']],
  [25, 'pup', [' .-----. ', 'U( {E} )U', '  \\_w_/  ']],
  [40, 'buddy', [' .-----. ', 'U( {E} )U', '  \\_w_/  ', ' (_| |_)¤']],
  [55, 'good dog', [' .-------. ', 'U(  {E}  )U', '  \\__w__/  ', '  /     \\¤ ', ' (_|   |_) ']],
  [70, 'alpha', ['  .-------.  ', ' U(  {E}  )U ', '   \\__w__/   ', '   /     \\   ', '  /|     |\\¤ ', ' (_|_____|_) ']],
  [85, 'legend', ['    ! ! !    ', '  .-------.  ', ' U(  {E}  )U ', '   \\__w__/   ', '   /     \\   ', '  /|     |\\¤ ', ' (_|_____|_) ']],
]

export function petStage(kind: PetKind, percent: number): { title: string; lines: string[] } {
  const stages = kind === 'dog' ? DOG : CAT
  const stage = [...stages].reverse().find(([from]) => percent >= from) ?? stages[0]
  return { title: stage?.[1] ?? 'tiny', lines: stage?.[2] ?? [] }
}

/** The dots that ripple while the model thinks. */
export function thinkingCells(frame: number): Cell[] {
  const glyphs = ['·', '∙', '•', '●']
  const colors = ['#5b4a7a', '#8a6bbf', '#b48ef0', '#e0c8ff']
  return Array.from({ length: 8 }, (_, i) => {
    const level = Math.round(((Math.sin(frame * 0.55 - i * 0.8) + 1) / 2) * 3)
    return { ch: glyphs[level] ?? '·', color: colors[level] ?? '#5b4a7a' }
  })
}

/** The scanner that sweeps while a tool runs. */
export function workingCells(frame: number): Cell[] {
  const width = 8
  const period = 2 * (width - 1)
  const step = frame % period
  const pos = step < width ? step : period - step
  const looks: [string, string][] = [
    ['█', YELLOW],
    ['▓', '#c9b27f'],
    ['▒', '#7d6f4a'],
  ]
  return Array.from({ length: width }, (_, i) => {
    const [ch, color] = looks[Math.abs(i - pos)] ?? ['░', '#3a3f58']
    return { ch, color }
  })
}

/** What the cat is doing this frame: its face, the row above it, its tail, a lean and what it sits on. */
type Pose = { face: string; top: string; topColor: string; tail: string; shift: number; prop: string; propColor: string }

// idle poses move on every third frame, a calm pace
const BEAT = 3
const GROUND = '‾‾‾‾‾‾‾‾‾‾'
const CODE_FEED = '{ }  </>  ();  =>  [ ]  &&  ::  ++  '
const NAP = ['z', 'z Z', 'z Z z', 'Z z', ' z']

function poseFor(phase: Phase, frame: number, stressed: boolean): Pose {
  const beat = Math.floor(frame / BEAT)
  let pose: Pose
  if (phase === 'working') {
    // typing on its laptop under a stream of code
    const bob = Math.floor(frame / 2) % 2
    const at = frame % CODE_FEED.length
    pose = {
      face: frame % 17 === 0 ? '-.-' : 'O.O',
      top: CODE_FEED.repeat(3).slice(at, at + 12),
      topColor: GREEN,
      tail: bob ? '≈' : '~',
      shift: bob,
      prop: bob ? '[▪▫▪▫▪▫▪]' : '[▫▪▫▪▫▪▫]',
      propColor: YELLOW,
    }
  } else if (phase === 'thinking') {
    // head tilting under a thought bubble
    pose = {
      face: ['o.o', 'o.O', 'o.o', 'O.o'][beat % 4] ?? 'o.o',
      top: ['( . )', '( . . )', '( . . . )', '( ? )'][beat % 4] ?? '',
      topColor: MAUVE,
      tail: beat % 2 ? '≈' : '~',
      shift: beat % 4 >= 2 ? 1 : 0,
      prop: GROUND,
      propColor: TRACK,
    }
  } else {
    // idle: sits and swishes, blinks, looks around, grooms, yawns, naps
    const i = beat % 48
    let face = '^.^'
    let top = ''
    let topColor = MUTED
    if (i === 12 || i === 27) face = '-.-'
    else if (i === 13) face = '<.<'
    else if (i === 14) face = '>.>'
    else if (i >= 15 && i <= 18) {
      face = '-.-'
      top = i % 2 ? 'lick lick' : 'lick'
      topColor = PINK
    } else if (i >= 19 && i <= 22) {
      face = '=O='
      top = 'yaaawn~'
      topColor = LAVENDER
    } else if (i >= 28) {
      face = 'u_u'
      top = NAP[(i - 28) % NAP.length] ?? 'z'
      topColor = LAVENDER
    }
    pose = {
      face,
      top,
      topColor,
      tail: i >= 28 ? '~' : Math.floor(i / 2) % 2 ? '≈' : '~',
      shift: 0,
      prop: GROUND,
      propColor: TRACK,
    }
  }
  if (stressed && pose.face !== 'u_u') pose.face = '>.<'
  return pose
}

export const REACTIONS = ['hearts', 'jump', 'dance', 'purr', 'sparkle', 'spin']
export const REACTION_FRAMES = 18

export type Row = { text: string; color: string }
export type PetView = { top: Row[]; pet: string[]; bottom: Row[] }

function centreIn(text: string, width: number): string {
  const left = Math.max(0, Math.floor((width - text.length) / 2))
  return (' '.repeat(left) + text).padEnd(width).slice(0, width)
}

function sprinkle(width: number, chars: string[], t: number, count: number, step: number): string {
  const row = Array.from({ length: width }, () => ' ')
  for (let i = 0; i < count; i++) {
    row[(t * step + i * 5) % width] = chars[(t + i) % chars.length] ?? ' '
  }
  return row.join('')
}

function shifted(line: string, by: number): string {
  if (by === 0) return line
  return by > 0 ? ' '.repeat(by) + line.slice(0, line.length - by) : line.slice(-by) + ' '.repeat(-by)
}

/**
 * The cat this frame: a row above it, the cat, then what it sits on and its
 * nameplate. A reaction `t` frames after a click takes over the face and the
 * row above. Every frame of a stage has the same rows, so nothing jumps.
 */
export function petView(
  template: string[],
  kind: PetKind,
  phase: Phase,
  frame: number,
  stressed: boolean,
  plate: Row,
  reaction: { kind: string; t: number } | null,
  nudge: 'eyes' | 'water' | null = null,
): PetView {
  const pose = poseFor(phase, frame, stressed)
  // a wellness nudge takes over the pose until the pet is clicked
  if (nudge === 'eyes') Object.assign(pose, { face: '-.-', top: 'rest your eyes', topColor: LAVENDER })
  if (nudge === 'water') {
    const sip = Math.floor(frame / BEAT) % 2
    Object.assign(pose, { face: sip ? '^o^' : '^.^', top: 'water break?', topColor: SKY, prop: 'c[_]', propColor: SKY })
  }
  const width = Math.max(14, ...template.map(l => l.length)) + 2
  const fit = (l: string) => centreIn(l, width)
  const row = (text: string, color: string): Row => ({ text: fit(text), color })
  const dress = (face: string, by: number) =>
    template.map(l => shifted(fit(l.replace('{E}', face).replace('¤', pose.tail)), by))
  const ground = row(pose.prop, pose.propColor)
  const name = row(plate.text, plate.color)
  const plain: PetView = { top: [row(pose.top, pose.topColor)], pet: dress(pose.face, pose.shift), bottom: [ground, name] }
  if (!reaction || reaction.t < 0 || reaction.t >= REACTION_FRAMES) return plain

  const t = reaction.t
  switch (reaction.kind) {
    case 'hearts':
      return { ...plain, top: [{ text: sprinkle(width, ['♥', '♡'], t, 3, 2), color: PINK }], pet: dress('^w^', 0) }
    case 'jump':
      // up in the air, its shadow left on the ground below
      return t % 4 < 2
        ? { top: [], pet: dress('^o^', 0), bottom: [row('', MUTED), row(GROUND, TRACK), name] }
        : { ...plain, top: [row('', MUTED)], pet: dress('^o^', 0) }
    case 'dance':
      return { ...plain, top: [row(t % 2 ? '♪ ♫' : '♫ ♪', LAVENDER)], pet: dress('^v^', [0, 1, 0, -1][t % 4] ?? 0) }
    case 'purr':
      return {
        ...plain,
        top: [row((kind === 'dog' ? ['woof!', 'wag wag', 'woof woof!'] : ['~ purr ~', '~~ purrr ~~', '~ purrrr ~'])[t % 3] ?? '', PINK)],
        pet: dress('-w-', 0),
      }
    case 'sparkle':
      return { ...plain, top: [{ text: sprinkle(width, ['✦', '✧', '·'], t, 4, 3), color: YELLOW }], pet: dress('*.*', 0) }
    default:
      return {
        ...plain,
        top: [row(['◜ ◝', '◝ ◞', '◞ ◟', '◟ ◜'][t % 4] ?? '', TEAL)],
        pet: dress(['@.@', 'o.<', 'o.o', '>.o'][t % 4] ?? 'o.o', 0),
      }
  }
}
