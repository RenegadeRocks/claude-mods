// The desk scene, painted as pixels: each character cell shows two stacked
// pixels with the half block '▀' (top pixel as its colour, bottom as its
// background), which doubles the height's detail. The wall clock is a small
// orange digital clock, its face a row of text so the time stays sharp. Pure: the same inputs paint the same
// scene, so the surface module just lays out what this returns.

import type { Ambient } from '../types'

export type DeskCell = { ch: string; fg: string; bg: string }

export const DESK_WIDTH = 44
// six rows of wall and one of desk top (14 pixels), then the notebook strip and the drawer
export const SCENE_ROWS = 7
export const NOTE_ROW = 7
export const DRAWER_ROW = 8

const PX_HEIGHT = SCENE_ROWS * 2
// the wall clock: a small rounded case (cells x0..x1, pixels y0..y1), its face one row of text
const CLOCK = { x0: 15, x1: 23, y0: 1, y1: 4, faceRow: 1 }
const CLOCK_CASE = '#3b3149'
const CLOCK_FACE = '#1a1220'
const CLOCK_DIGITS = '#ffa53d'
const CLOCK_GLOW = '#ff8c2a'
// the lamp's bulb, in pixels; its warm light falls around it
const BULB = { x: 36, y: 6 }

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
function paintPixels(frame: number, ambient: Ambient, isLampOn: boolean): string[][] {
  // the lamp breathes a little; by the fire it flickers
  const flicker = ambient === 'fire' ? 0.85 + 0.15 * Math.sin(frame * 1.7) * Math.sin(frame * 0.6) : 1
  const power = isLampOn ? 0.5 * flicker : 0
  const px: string[][] = []
  for (let x = 0; x < DESK_WIDTH; x++) {
    const column: string[] = []
    for (let y = 0; y < PX_HEIGHT; y++) {
      let c: string
      if (y < 12) c = mix('#1b1828', '#2a2340', y / 11)
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

  // the clock's orange glow on the wall, then its case with rounded corners
  for (let x = CLOCK.x0 - 4; x <= CLOCK.x1 + 4; x++) {
    for (let y = 0; y <= CLOCK.y1 + 3; y++) {
      const d = Math.hypot((x - (CLOCK.x0 + CLOCK.x1) / 2) / 7, (y - 2.5) / 3.2)
      const column = px[x]
      if (column && d < 1) column[y] = mix(column[y] ?? '#1b1828', CLOCK_GLOW, 0.22 * (1 - d) ** 1.5)
    }
  }
  for (let x = CLOCK.x0; x <= CLOCK.x1; x++) {
    for (let y = CLOCK.y0; y <= CLOCK.y1; y++) {
      const isCorner = (x === CLOCK.x0 || x === CLOCK.x1) && (y === CLOCK.y0 || y === CLOCK.y1)
      if (!isCorner) put(x, y, CLOCK_CASE, false)
    }
  }

  // the window: a frame, night sky, the moon, stars or rain, and a sill
  const raining = ambient === 'rain'
  for (let x = 1; x <= 12; x++) {
    for (let y = 1; y <= 10; y++) {
      const isFrame = x === 1 || x === 12 || y === 1 || y === 10 || x === 6 || y === 5
      put(x, y, isFrame ? '#3d3453' : mix(raining ? '#0b0f1f' : '#0d1430', raining ? '#18213a' : '#22345e', (y - 2) / 7), false)
    }
  }
  if (!raining) {
    put(9, 2, '#f9e2af', false)
    put(10, 2, '#f9e2af', false)
    put(9, 3, '#f4d58d', false)
    put(10, 3, '#fbe7b5', false)
    const stars: [number, number][] = [[3, 2], [4, 4], [8, 7], [3, 7], [10, 8], [7, 3], [4, 9]]
    stars.forEach(([x, y], i) => {
      const twinkle = (Math.floor(frame / 5) + i * 2) % 5
      if (twinkle !== 0) put(x, y, twinkle === 2 ? '#ffffff' : '#9aa6d6', false)
    })
  } else {
    for (let x = 2; x <= 11; x++) {
      if (x === 6) continue
      const drop = (frame + x * 5) % 9
      const y = 2 + drop
      if (y <= 9 && y !== 5) put(x, y, '#7aa2d8', false)
      if (y - 1 >= 2 && y - 1 <= 9 && y - 1 !== 5) put(x, y - 1, '#3c5a8c', false)
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

/** The clock's face: the time in 12-hour digits, the colon blinking each second. */
function clockFace(now: Date): string {
  const hours = now.getHours() % 12 || 12
  const colon = now.getSeconds() % 2 === 0 ? ':' : ' '
  return ` ${String(hours).padStart(2, ' ')}${colon}${String(now.getMinutes()).padStart(2, '0')} `
}

/** The scene's cells, top to bottom: six rows of wall, one of desk top. */
export function paintScene(frame: number, now: Date, ambient: Ambient, isLampOn: boolean): DeskCell[][] {
  const px = paintPixels(frame, ambient, isLampOn)
  const face = clockFace(now)
  const rows: DeskCell[][] = []
  for (let cy = 0; cy < SCENE_ROWS; cy++) {
    const row: DeskCell[] = []
    for (let cx = 0; cx < DESK_WIDTH; cx++) {
      const top = px[cx]?.[cy * 2] ?? '#1b1828'
      const bottom = px[cx]?.[cy * 2 + 1] ?? '#1b1828'
      if (cy === CLOCK.faceRow && cx > CLOCK.x0 && cx < CLOCK.x1) {
        row.push({ ch: face[cx - CLOCK.x0 - 1] ?? ' ', fg: CLOCK_DIGITS, bg: CLOCK_FACE })
      } else {
        row.push(top === bottom ? { ch: ' ', fg: top, bg: bottom } : { ch: '▀', fg: top, bg: bottom })
      }
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
    if (last && last.fg === cell.fg && last.bg === cell.bg) last.ch += cell.ch
    else out.push({ ...cell })
  }
  return out
}
