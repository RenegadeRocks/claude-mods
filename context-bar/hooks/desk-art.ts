// The desk scene, painted as pixels: each character cell shows two stacked
// pixels with the half block '▀' (top pixel as its colour, bottom as its
// background), which doubles the height's detail. The wall clock is a small
// orange neon clock in a thin double-line frame, drawn as text so it stays sharp. Pure: the same inputs paint the same
// scene, so the surface module just lays out what this returns.

import type { Ambient, Pomodoro } from '../types'

export type DeskCell = { ch: string; fg: string; bg: string; bold?: boolean }

export const DESK_WIDTH = 44
// six rows of wall and one of desk top (14 pixels), then the notebook strip and the drawer
export const SCENE_ROWS = 7
export const NOTE_ROW = 7
export const DRAWER_ROW = 8

const PX_HEIGHT = SCENE_ROWS * 2
// the wall clock: a small rounded case (cells x0..x1, pixels y0..y1), its face one row of text
// the wall clock, in cells: a thin double-line frame around one row of orange neon digits
const CLOCK = { x0: 15, x1: 23, top: 0, bottom: 2 }
const CLOCK_FRAME = '#ffa04a'
const CLOCK_FACE = '#1f0f0a'
const CLOCK_DIGITS = '#ffc472'
const CLOCK_COLON_DIM = '#7a3d18'
const CLOCK_GLOW = '#ff7a1a'
// the lamp's bulb, in pixels; its warm light falls around it
const BULB = { x: 36, y: 6 }

// the focus timer's rounds; the window's sky follows them
export const FOCUS_MS = 25 * 60_000
export const BREAK_MS = 5 * 60_000
// the break's last stretch, when the morning sets back into night
const DUSK_MS = 90_000

// the sky's colours, top and bottom of the window, from night (0) through sunrise (1) to morning (1.3)
const SKY_STOPS: [number, string, string][] = [
  [0, '#0d1430', '#22345e'],
  [0.4, '#1c2252', '#4e3f78'],
  [0.7, '#34407e', '#d98aa0'],
  [1, '#5b86c9', '#ffc58a'],
  [1.3, '#86b3e3', '#ffe0a6'],
]
const MORNING = 1.3

/**
 * How far the day has come, from the focus timer: night while idle, night
 * to sunrise over a focus round, golden morning on the break, and back to
 * night as the break ends.
 */
export function skyFor(pomodoro: Pomodoro, now: number): number {
  const { phase, endsAt } = pomodoro
  if (phase === 'idle' || endsAt === null) return 0
  const left = Math.max(0, endsAt - now)
  if (phase === 'focus') return Math.min(1, Math.max(0, 1 - left / FOCUS_MS))
  return left < DUSK_MS ? (MORNING * left) / DUSK_MS : MORNING
}

function skyAt(sky: number, y: number): string {
  const i = SKY_STOPS.findIndex(([at]) => at >= sky)
  const hi = SKY_STOPS[Math.max(0, i === -1 ? SKY_STOPS.length - 1 : i)] ?? SKY_STOPS[0]!
  const lo = SKY_STOPS[Math.max(0, (i === -1 ? SKY_STOPS.length : i) - 1)] ?? hi
  const t = hi[0] === lo[0] ? 0 : (sky - lo[0]) / (hi[0] - lo[0])
  return mix(mix(lo[1], hi[1], t), mix(lo[2], hi[2], t), y)
}

/**
 * How bright the lightning is on this frame, 0 to 1: a strike every 18 s or
 * so with a fainter flicker after it, and a smaller one between them.
 */
function lightningAt(frame: number): number {
  const big = frame % 73
  if (big === 0) return 0.8
  if (big === 2) return 0.45
  const small = frame % 131
  return small === 0 ? 0.4 : 0
}

type Rgb = [number, number, number]

function rgb(hex: string): Rgb {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
}

function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)]
  return hex([0, 1, 2].map(i => (x[i] ?? 0) + ((y[i] ?? 0) - (x[i] ?? 0)) * Math.max(0, Math.min(1, t))) as Rgb)
}

/** How strongly the lamp lights the point (x, y), 0 to 1. */
function glowAt(x: number, y: number, power: number): number {
  const d = Math.hypot(x - BULB.x, (y - BULB.y) * 1.2)
  return power * Math.max(0, 1 - d / 17) ** 2.2
}

/**
 * Paints the wall, window, plant, mug and lamp into a pixel grid
 * [x][y] of DESK_WIDTH × PX_HEIGHT colours.
 */
function paintPixels(frame: number, ambient: Ambient, isLampOn: boolean, sky: number): string[][] {
  // the lamp breathes a little; by the fire it flickers
  const flicker = ambient === 'fire' ? 0.85 + 0.15 * Math.sin(frame * 1.7) * Math.sin(frame * 0.6) : 1
  // by morning the lamp matters less, and daylight warms the wall
  const daylight = Math.min(1, Math.max(0, (sky - 0.5) / 0.8))
  const power = isLampOn ? 0.5 * flicker * (1 - 0.5 * daylight) : 0
  const px: string[][] = []
  for (let x = 0; x < DESK_WIDTH; x++) {
    const column: string[] = []
    for (let y = 0; y < PX_HEIGHT; y++) {
      let c: string
      if (y < 12) c = mix(mix('#1b1828', '#2a2340', y / 11), '#5a4560', 0.4 * daylight)
      else if (y === 12) c = '#a8724c'
      else c = '#7d5136'
      // a soft grain along the desk top
      if (y === 13 && (x * 7 + 3) % 11 === 0) c = '#6e4630'
      column.push(mix(c, '#f6c177', glowAt(x, y, power)))
    }
    px.push(column)
  }
  const put = (x: number, y: number, c: string, lit = true) => {
    const column = px[x]
    if (column && y >= 0 && y < PX_HEIGHT) column[y] = lit ? mix(c, '#f6c177', glowAt(x, y, power) * 0.6) : c
  }

  // the neon clock's orange glow, spilling onto the wall around it
  for (let x = CLOCK.x0 - 6; x <= CLOCK.x1 + 6; x++) {
    for (let y = 0; y <= 9; y++) {
      const d = Math.hypot((x - (CLOCK.x0 + CLOCK.x1) / 2) / 10, (y - 2.5) / 5)
      const column = px[x]
      if (column && d < 1) column[y] = mix(column[y] ?? '#1b1828', CLOCK_GLOW, 0.55 * (1 - d) ** 1.3)
    }
  }

  // the window: a frame, night sky, the moon, stars or rain, and a sill
  const raining = ambient === 'rain' || ambient === 'storm'
  for (let x = 1; x <= 12; x++) {
    for (let y = 1; y <= 10; y++) {
      const isFrame = x === 1 || x === 12 || y === 1 || y === 10 || x === 6 || y === 5
      const clear = skyAt(sky, (y - 2) / 7)
      put(x, y, isFrame ? '#3d3453' : raining ? mix(clear, '#2a3146', 0.6) : clear, false)
    }
  }
  const isGlass = (x: number, y: number) => x >= 2 && x <= 11 && y >= 2 && y <= 9 && x !== 6 && y !== 5
  const glassAt = (x: number, y: number) => px[x]?.[y] ?? '#0d1430'
  if (!raining) {
    // the moon sinks and fades as the sky lightens; the stars go first
    const moonFade = Math.min(1, sky / 0.7)
    const moonDrop = Math.round(sky * 3)
    const moon: [number, number, string][] = [[9, 2, '#f9e2af'], [10, 2, '#f9e2af'], [9, 3, '#f4d58d'], [10, 3, '#fbe7b5']]
    for (const [x, y, c] of moon) {
      const my = y + moonDrop
      if (moonFade < 1 && isGlass(x, my)) put(x, my, mix(c, glassAt(x, my), moonFade), false)
    }
    const stars: [number, number][] = [[3, 2], [4, 4], [8, 7], [3, 7], [10, 8], [7, 3], [4, 9]]
    stars.forEach(([x, y], i) => {
      const twinkle = (Math.floor(frame / 5) + i * 2) % 5
      if (twinkle !== 0 && sky < 0.5) put(x, y, mix(twinkle === 2 ? '#ffffff' : '#9aa6d6', glassAt(x, y), sky / 0.5), false)
    })
    // the sun climbs from behind the sill, with a soft halo
    if (sky > 0.55) {
      const sunY = 10.5 - ((sky - 0.55) / (MORNING - 0.55)) * 7
      const sunX = 4.5
      for (let x = 2; x <= 11; x++) {
        for (let y = 2; y <= 9; y++) {
          if (!isGlass(x, y)) continue
          const d = Math.hypot(x - sunX, y - sunY)
          if (d <= 1.1) put(x, y, '#fff1c4', false)
          else if (d <= 3.2) put(x, y, mix(glassAt(x, y), '#ffd27a', 0.45 * (1 - (d - 1.1) / 2.1)), false)
        }
      }
    }
  } else {
    for (let x = 2; x <= 11; x++) {
      if (x === 6) continue
      const drop = (frame + x * 5) % 9
      const y = 2 + drop
      if (y <= 9 && y !== 5) put(x, y, '#7aa2d8', false)
      if (y - 1 >= 2 && y - 1 <= 9 && y - 1 !== 5) put(x, y - 1, '#3c5a8c', false)
    }
    // in a storm, lightning: a flash with a flicker after it, a bolt on the brightest frame
    const flash = ambient === 'storm' ? lightningAt(frame) : 0
    if (flash > 0) {
      for (let x = 2; x <= 11; x++) for (let y = 2; y <= 9; y++) if (isGlass(x, y)) put(x, y, mix(glassAt(x, y), '#dfe8ff', flash), false)
      if (flash > 0.6) for (const [x, y] of [[9, 2], [8, 3], [9, 4], [8, 6], [7, 7]] as [number, number][]) put(x, y, '#ffffff', false)
      // the room lights up for an instant too
      px.forEach((column, x) => {
        for (let y = 0; y < 12; y++) if (!isGlass(x, y)) column[y] = mix(column[y] ?? '#1b1828', '#c8d4ff', 0.18 * flash)
      })
    }
  }
  for (let x = 0; x <= 13; x++) put(x, 11, '#4b405f')

  // a short stack of books, spines out
  const books: [number, number, number, string, string][] = [
    [15, 22, 11, '#5b7fbf', '#89b4fa'],
    [16, 21, 10, '#b5527a', '#f5c2e7'],
    [15, 20, 9, '#4f8f6a', '#a6e3a1'],
  ]
  for (const [from, to, y, spine, edge] of books) for (let x = from; x <= to; x++) put(x, y, x === from || x === to ? edge : spine)

  // a little plant in a terracotta pot
  for (let x = 25; x <= 28; x++) put(x, 11, '#c46f4b')
  for (let x = 25; x <= 28; x++) put(x, 10, '#e08a62')
  const leaves: [number, number, string][] = [
    [26, 9, '#7fbf7a'], [27, 9, '#a6e3a1'], [25, 8, '#a6e3a1'], [28, 8, '#7fbf7a'],
    [26, 7, '#a6e3a1'], [27, 6, '#7fbf7a'], [24, 7, '#7fbf7a'], [29, 6, '#a6e3a1'], [27, 8, '#5f9e64'],
  ]
  leaves.forEach(([x, y, c]) => put(x, y, c))

  // a mug of something warm, steam curling up
  for (let x = 30; x <= 32; x++) for (let y = 9; y <= 11; y++) put(x, y, y === 9 ? '#e0c8ff' : '#cba6f7')
  put(33, 10, '#b48ef0')
  for (let y = 5; y <= 8; y++) {
    if ((y + Math.floor(frame / 3)) % 2 === 0) continue
    const x = 31 + Math.round(Math.sin(frame / 4 + y * 1.3))
    const base = px[x]?.[y] ?? '#2a2340'
    put(x, y, mix(base, '#e6e3ee', 0.06 + (8 - y) * 0.02), false)
  }

  // the lamp: a weighted base, a bent arm, a brass shade and, when on, its bulb
  for (let x = 37; x <= 41; x++) put(x, 11, '#6c7086')
  put(39, 10, '#8087a2')
  put(39, 9, '#8087a2')
  put(40, 8, '#8087a2')
  put(40, 7, '#8087a2')
  put(39, 6, '#8087a2')
  const shade: [number, number, number][] = [[3, 35, 37], [4, 34, 38], [5, 33, 39]]
  for (const [y, from, to] of shade) for (let x = from; x <= to; x++) put(x, y, y === 3 ? '#c98f2e' : '#e8b04b', false)
  if (isLampOn) {
    put(35, 6, '#fff3c4', false)
    put(36, 6, '#fffaf0', false)
    put(37, 6, '#fff3c4', false)
  }
  return px
}

/** The clock's face: the time in 12-hour digits, centred in the frame. */
function clockFace(now: Date): string {
  const hours = now.getHours() % 12 || 12
  const time = `${hours}:${String(now.getMinutes()).padStart(2, '0')}`
  const room = CLOCK.x1 - CLOCK.x0 - 1
  const left = Math.floor((room - time.length) / 2)
  return ' '.repeat(left) + time + ' '.repeat(room - left - time.length)
}

/** The clock's cell at (cx, cy), or null where the scene shows through. */
function clockCell(cx: number, cy: number, now: Date, wall: string): DeskCell | null {
  if (cx < CLOCK.x0 || cx > CLOCK.x1 || cy < CLOCK.top || cy > CLOCK.bottom) return null
  const isLeft = cx === CLOCK.x0
  const isRight = cx === CLOCK.x1
  if (cy === CLOCK.top) return { ch: isLeft ? '╔' : isRight ? '╗' : '═', fg: CLOCK_FRAME, bg: wall }
  if (cy === CLOCK.bottom) return { ch: isLeft ? '╚' : isRight ? '╝' : '═', fg: CLOCK_FRAME, bg: wall }
  if (isLeft || isRight) return { ch: '║', fg: CLOCK_FRAME, bg: wall }
  // the digits glow; the colon dims every other second
  const ch = clockFace(now)[cx - CLOCK.x0 - 1] ?? ' '
  const isDim = ch === ':' && now.getSeconds() % 2 === 1
  return { ch, fg: isDim ? CLOCK_COLON_DIM : CLOCK_DIGITS, bg: CLOCK_FACE, bold: true }
}

/** The scene's cells, top to bottom: six rows of wall, one of desk top. */
export function paintScene(frame: number, now: Date, ambient: Ambient, isLampOn: boolean, sky = 0): DeskCell[][] {
  const px = paintPixels(frame, ambient, isLampOn, sky)
  const rows: DeskCell[][] = []
  for (let cy = 0; cy < SCENE_ROWS; cy++) {
    const row: DeskCell[] = []
    for (let cx = 0; cx < DESK_WIDTH; cx++) {
      const top = px[cx]?.[cy * 2] ?? '#1b1828'
      const bottom = px[cx]?.[cy * 2 + 1] ?? '#1b1828'
      const clock = clockCell(cx, cy, now, mix(top, bottom, 0.5))
      if (clock) row.push(clock)
      else row.push(top === bottom ? { ch: ' ', fg: top, bg: bottom } : { ch: '▀', fg: top, bg: bottom })
    }
    rows.push(row)
  }
  return rows
}

/** Runs of one look, so the row draws as a handful of texts rather than one per cell. */
export function runs(row: DeskCell[]): DeskCell[] {
  const out: DeskCell[] = []
  for (const cell of row) {
    const last = out[out.length - 1]
    if (last && last.fg === cell.fg && last.bg === cell.bg && last.bold === cell.bold) last.ch += cell.ch
    else out.push({ ...cell })
  }
  return out
}
