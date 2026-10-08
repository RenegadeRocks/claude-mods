// The desk scene, painted as pixels and drawn with sextant characters: each
// character cell holds a 2 × 3 block of pixels in two colours, three times
// the detail of plain cells. The clock is a neon digital sign. Pure: the same
// inputs paint the same scene, so the surface module just lays out what this
// returns.

import type { Ambient } from '../types'

export type DeskCell = { ch: string; fg: string; bg: string }

export const DESK_WIDTH = 44
// six rows of wall and one of desk top, then the notebook strip and the drawer
export const SCENE_ROWS = 7
export const NOTE_ROW = 7
export const DRAWER_ROW = 8

// each cell is 2 pixels wide and 3 tall
const W = DESK_WIDTH * 2
const H = SCENE_ROWS * 3
// a pixel is about 1.4 times taller than it is wide; round things are squashed to stay round
const ASPECT = 1.4
// the lamp's bulb, in pixels; its warm light falls around and below it
const BULB = { x: 70.5, y: 8 }
const LAMP_LIGHT = '#f6c177'
const FIRE_LIGHT = '#ff7b3a'

type Rgb = [number, number, number]

const parsed = new Map<string, Rgb>()
function rgb(hex: string): Rgb {
  let v = parsed.get(hex)
  if (!v) {
    v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb
    parsed.set(hex, v)
  }
  return v
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
}

function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a
  const [x, y] = [rgb(a), rgb(b)]
  const k = Math.min(1, t)
  return hex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k])
}

function distance(a: string, b: string): number {
  const [x, y] = [rgb(a), rgb(b)]
  return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2
}

/** A small fixed hash, so scattered details stay where they are between frames. */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

// The clock's digits are five pixels wide and nine tall, in seven segments:
// a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle.
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
}
/** The segments that light a digit's pixel (column c, row r); '' for its gaps. */
function segmentAt(c: number, r: number): string {
  if (r === 0) return c === 0 ? 'af' : c === 4 ? 'ab' : 'a'
  if (r === 8) return c === 0 ? 'de' : c === 4 ? 'cd' : 'd'
  if (r === 4) return c === 0 ? 'efg' : c === 4 ? 'bcg' : 'g'
  if (c === 4) return r < 4 ? 'b' : 'c'
  if (c === 0) return r < 4 ? 'f' : 'e'
  return ''
}
// four digits around a centred colon; edges sit on the 2 × 3 grid of a cell, and the glow spreads over this box
const DIGIT_X = [29, 36, 48, 55]
const DIGIT_Y = 3
const COLON_X = 44
const PLATE = { x0: 26, x1: 62, y0: 1, y1: 11 }
const NEON = '#ff92e8'
const NEON_GLOW = '#ff3fbf'
const COLON = '#8ff8ff'
const COLON_GLOW = '#2fd3ff'
const UNLIT = '#271530'

type Canvas = {
  px: string[][]
  /** Pixels that make their own light, or sit beyond the glass: the lamp does not light them. */
  unlit: boolean[][]
  /** Neon pixels and their glow colour. */
  tubes: [number, number, string][]
}

function blank(): Canvas {
  const px: string[][] = []
  const unlit: boolean[][] = []
  for (let y = 0; y < H; y++) {
    // the wall: deep plum, warming toward the desk
    const wall = mix('#15122a', '#2c2344', y / 16)
    px.push(Array.from({ length: W }, () => wall))
    unlit.push(Array.from({ length: W }, () => false))
  }
  return { px, unlit, tubes: [] }
}

function put(canvas: Canvas, x: number, y: number, c: string, isUnlit = false) {
  const row = canvas.px[y]
  if (!row || x < 0 || x >= W) return
  row[x] = c
  const mask = canvas.unlit[y]
  if (mask) mask[x] = isUnlit
}

function get(canvas: Canvas, x: number, y: number): string {
  return canvas.px[y]?.[x] ?? '#15122a'
}

function fill(canvas: Canvas, x0: number, x1: number, y0: number, y1: number, c: string, isUnlit = false) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(canvas, x, y, c, isUnlit)
}

function line(canvas: Canvas, x0: number, y0: number, x1: number, y1: number, c: string) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps
    put(canvas, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c)
  }
}

/** The window: night sky, a city skyline, the moon and stars, or rain on the glass. */
function paintWindow(canvas: Canvas, frame: number, raining: boolean) {
  fill(canvas, 0, 25, 0, 11, '#463b5e')
  const panes: [number, number, number, number][] = [
    [2, 11, 1, 5],
    [14, 23, 1, 5],
    [2, 11, 7, 11],
    [14, 23, 7, 11],
  ]
  // buildings, by column range and roof row; roofs sit on a cell's edge so they stay sharp
  const buildings: [number, number, number][] = [
    [2, 5, 9],
    [6, 9, 7],
    [10, 11, 9],
    [14, 17, 9],
    [18, 21, 7],
    [22, 23, 9],
  ]
  const roof = (x: number) => buildings.find(([a, b]) => x >= a && x <= b)?.[2] ?? 99
  for (const [x0, x1, y0, y1] of panes) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let c = raining ? mix('#0a0d1c', '#1b243e', (y - 1) / 10) : mix('#0a0f2c', '#283a6e', (y - 1) / 10)
        if (y >= roof(x)) {
          c = '#0d1129'
          // a lit window here and there, alone in its cell
          if (y === 10 && x % 2 === 0 && hash(x, y) > (raining ? 0.6 : 0.35)) {
            const isFlicker = hash(y, x) > 0.85 && Math.floor(frame / 12 + x) % 5 === 0
            c = isFlicker ? '#3a3346' : hash(x + 1, y) > 0.5 ? '#f9d27a' : '#ffb86b'
          }
        }
        put(canvas, x, y, c, true)
      }
    }
  }

  if (!raining) {
    // the moon
    fill(canvas, 5, 8, 2, 2, '#f8ecc4', true)
    fill(canvas, 4, 9, 3, 3, '#f8ecc4', true)
    fill(canvas, 5, 8, 4, 4, '#f8ecc4', true)
    const stars: [number, number][] = [
      [10, 1], [3, 5], [16, 2], [21, 4], [23, 1], [15, 5], [11, 4], [19, 1], [3, 8], [12, 8], [22, 7],
    ]
    stars.forEach(([x, y], i) => {
      if (y >= roof(x)) return
      const twinkle = (Math.floor(frame / 4) + i * 3) % 7
      if (twinkle === 0) return
      put(canvas, x, y, twinkle === 3 ? '#ffffff' : twinkle % 2 ? '#a8b4e6' : '#6f7fb8', true)
    })
  } else {
    // streaks running down the glass
    for (let x = 2; x <= 23; x++) {
      if (x === 12 || x === 13) continue
      const period = 10 + Math.floor(hash(x, 3) * 6)
      const head = Math.floor(frame * 1.5 + hash(x, 7) * period) % period
      for (let k = 0; k < 2; k++) {
        const y = 1 + head - k
        if (y < 1 || y > 11 || y === 6) continue
        put(canvas, x, y, '#7f9fd0', true)
      }
    }
  }

  // the sill, and the shadow it throws on the wall below
  fill(canvas, 0, 27, 12, 12, '#8a78a6')
  fill(canvas, 0, 27, 13, 14, '#66577f')
  fill(canvas, 0, 27, 15, 16, '#1a1526')
}

/** A little pothos in a terracotta pot on the sill, one vine trailing over it. */
function paintPlant(canvas: Canvas) {
  fill(canvas, 18, 23, 9, 9, '#ec9870')
  fill(canvas, 18, 23, 10, 11, '#c46f4b')
  const DARK = '#4f8a57'
  const LIGHT = '#9ad895'
  const leaves: [number, number, string][] = [
    [19, 8, DARK], [20, 8, LIGHT], [21, 8, DARK], [22, 8, LIGHT],
    [18, 7, LIGHT], [20, 7, DARK], [21, 7, LIGHT], [23, 7, DARK],
    [17, 6, DARK], [19, 6, LIGHT], [22, 6, LIGHT], [24, 6, DARK],
    [18, 5, LIGHT], [20, 5, LIGHT], [21, 5, DARK], [23, 5, LIGHT],
    [19, 4, DARK], [22, 4, DARK], [20, 3, LIGHT],
  ]
  for (const [x, y, c] of leaves) put(canvas, x, y, c)
  const vine: [number, number][] = [[24, 10], [24, 11], [25, 12]]
  for (const [x, y] of vine) put(canvas, x, y, y % 2 ? LIGHT : DARK)
}

/** The neon clock: the time in pink segments, the colon in cyan, blinking each second. */
function paintClock(canvas: Canvas, now: Date) {
  const hours = now.getHours() % 12 || 12
  const text = `${hours < 10 ? ' ' : '1'}${hours % 10}${String(now.getMinutes()).padStart(2, '0')}`
  ;[...text].forEach((ch, i) => {
    const lit = SEGMENTS[ch] ?? ''
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 5; c++) {
        const segments = segmentAt(c, r)
        if (!segments) continue
        const x = (DIGIT_X[i] ?? 0) + c
        const y = DIGIT_Y + r
        if ([...segments].some(s => lit.includes(s))) {
          put(canvas, x, y, NEON, true)
          canvas.tubes.push([x, y, NEON_GLOW])
        } else {
          put(canvas, x, y, UNLIT, true)
        }
      }
    }
  })
  if (now.getSeconds() % 2 === 0) {
    for (const y of [5, 9]) {
      put(canvas, COLON_X, y, COLON, true)
      canvas.tubes.push([COLON_X, y, COLON_GLOW])
    }
  }
}

/** Two books, a little cactus and a mug of something warm, steam curling up. */
function paintDeskThings(canvas: Canvas, frame: number) {
  // the top book, then the one under it; bands and page edges a whole cell wide
  fill(canvas, 30, 41, 12, 14, '#a8466e')
  fill(canvas, 32, 33, 12, 14, '#e6c06a')
  fill(canvas, 40, 41, 12, 14, '#efe6d2')
  fill(canvas, 28, 43, 15, 16, '#3f66a8')
  fill(canvas, 30, 31, 15, 16, '#e6c06a')
  fill(canvas, 38, 39, 15, 16, '#e6c06a')
  fill(canvas, 42, 43, 15, 16, '#efe6d2')

  // a cactus in a white pot
  fill(canvas, 48, 51, 15, 16, '#e8e2f0')
  fill(canvas, 49, 50, 12, 14, '#6fae6a')
  put(canvas, 51, 13, '#6fae6a')
  put(canvas, 48, 12, '#6fae6a')

  // the mug, with its coffee and handle
  fill(canvas, 62, 65, 12, 16, '#cba6f7')
  fill(canvas, 63, 64, 12, 12, '#5a3826')
  for (const y of [13, 14, 15]) put(canvas, 66, y, '#b591ea')

  // steam: wisps drifting up and fading
  for (let y = 8; y <= 11; y++) {
    if ((y + Math.floor(frame / 2)) % 3 === 0) continue
    const x = 63 + Math.round(0.8 * Math.sin(frame / 5 + y * 0.9))
    put(canvas, x, y, mix(get(canvas, x, y), '#ece8f4', 0.1 + (11 - y) * 0.03))
  }
}

/** The desk lamp: a weighted base, a jointed arm, a brass shade and, when on, its bulb. */
function paintLamp(canvas: Canvas, isLampOn: boolean) {
  fill(canvas, 74, 85, 15, 16, '#575b74')
  line(canvas, 80, 14, 83, 8, '#9298b0')
  line(canvas, 83, 8, 73, 2, '#9298b0')
  put(canvas, 83, 8, '#d0d6e8')
  fill(canvas, 70, 72, 2, 2, '#b98227')
  fill(canvas, 69, 73, 3, 3, '#e3a840')
  fill(canvas, 68, 74, 4, 4, '#e3a840')
  fill(canvas, 67, 75, 5, 5, '#e3a840')
  fill(canvas, 66, 76, 6, 6, '#e3a840')
  if (isLampOn) fill(canvas, 68, 73, 7, 8, '#fff3cc', true)
}

/** The desk top: a lit front edge, then the front of the desk. */
function paintDesk(canvas: Canvas) {
  fill(canvas, 0, W - 1, 17, 17, '#c48c5c')
  fill(canvas, 0, W - 1, 18, 19, '#9a6542')
  fill(canvas, 0, W - 1, 20, 20, '#5e3b28')
}

/** How strongly the lamp lights (x, y), 0 to 1: a soft glow, brightest in the cone below the shade. */
function lampLight(x: number, y: number): number {
  const dx = x - BULB.x
  const dy = (y - BULB.y) * ASPECT
  const d = Math.hypot(dx, dy)
  let light = 0.5 * Math.max(0, 1 - d / 40) ** 2
  if (y > BULB.y) {
    // the cone: faint on the wall behind, a bright pool where it meets the desk
    const spread = Math.abs(dx) / (dy + 4)
    const pool = y >= 17 ? 0.75 : 0.08
    if (spread < 1.8) light += pool * (1 - spread / 1.8) ** 1.5 * Math.max(0, 1 - d / 36)
  } else {
    light *= 0.7
  }
  return Math.min(1, light)
}

/** Lights the scene: the lamp, the fire off to the left, and the neon's glow. */
function light(canvas: Canvas, frame: number, ambient: Ambient, isLampOn: boolean) {
  const isFire = ambient === 'fire'
  const flicker = isFire ? 0.82 + 0.18 * Math.sin(frame * 1.7) * Math.sin(frame * 0.6 + 1) : 1
  const lamp = isLampOn ? 0.62 * flicker : 0
  const fire = isFire ? 0.3 * (0.75 + 0.25 * Math.sin(frame * 1.1) * Math.cos(frame * 0.37)) : 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (canvas.unlit[y]?.[x]) continue
      let c = get(canvas, x, y)
      if (lamp > 0) c = mix(c, LAMP_LIGHT, lamp * lampLight(x, y))
      if (fire > 0) c = mix(c, FIRE_LIGHT, fire * Math.max(0, 1 - Math.hypot(x + 8, (y - 20) * ASPECT) / 52) ** 1.6)
      put(canvas, x, y, c)
    }
  }
  // the neon glow spills onto the wall and the plate around the tubes
  const isTube = new Set(canvas.tubes.map(([x, y]) => y * W + x))
  for (let y = 0; y <= PLATE.y1 + 3; y++) {
    for (let x = PLATE.x0 - 3; x <= PLATE.x1 + 3; x++) {
      if (x < 0 || x >= W || isTube.has(y * W + x)) continue
      const base = get(canvas, x, y)
      if (base === UNLIT) continue
      let weight = 0
      const sum: Rgb = [0, 0, 0]
      for (const [tx, ty, glow] of canvas.tubes) {
        const d = Math.hypot(x - tx, (y - ty) * ASPECT)
        if (d > 4) continue
        const w = (1 - d / 4) ** 2
        const g = rgb(glow)
        sum[0] += g[0] * w
        sum[1] += g[1] * w
        sum[2] += g[2] * w
        weight += w
      }
      if (weight > 0) {
        const glow = hex([sum[0] / weight, sum[1] / weight, sum[2] / weight])
        put(canvas, x, y, mix(base, glow, Math.min(0.45, weight * 0.1)), canvas.unlit[y]?.[x] ?? false)
      }
    }
  }
}

/** The sextant character whose filled sixths are the set bits, 1 2 / 3 4 / 5 6. */
function sextant(bits: number): string {
  if (bits === 21) return '▌'
  if (bits === 42) return '▐'
  return String.fromCodePoint(0x1fb00 + bits - 1 - (bits > 21 ? 1 : 0) - (bits > 42 ? 1 : 0))
}

/** One cell from its six pixels: the two colours that fit them best, and the sextant between them. */
function encodeCell(pixels: string[]): DeskCell {
  const colours = [...new Set(pixels)]
  const only = colours[0] ?? '#15122a'
  if (colours.length === 1) return { ch: ' ', fg: only, bg: only }
  let best: [string, string] = [only, colours[1] ?? only]
  if (colours.length > 2) {
    let bestError = Infinity
    for (let i = 0; i < colours.length; i++) {
      for (let j = i + 1; j < colours.length; j++) {
        const a = colours[i] ?? only
        const b = colours[j] ?? only
        const error = pixels.reduce((sum, p) => sum + Math.min(distance(p, a), distance(p, b)), 0)
        if (error < bestError) {
          bestError = error
          best = [a, b]
        }
      }
    }
  }
  const [bg, fg] = best
  let bits = 0
  pixels.forEach((p, i) => {
    if (distance(p, fg) < distance(p, bg)) bits |= 1 << i
  })
  if (bits === 0) return { ch: ' ', fg: bg, bg }
  if (bits === 63) return { ch: ' ', fg, bg: fg }
  return { ch: sextant(bits), fg, bg }
}

/** The scene's pixels, before they are packed into cells; rows of colours. */
export function paintPixels(frame: number, now: Date, ambient: Ambient, isLampOn: boolean): string[][] {
  const canvas = blank()
  paintWindow(canvas, frame, ambient === 'rain')
  paintPlant(canvas)
  paintClock(canvas, now)
  paintDesk(canvas)
  paintDeskThings(canvas, frame)
  paintLamp(canvas, isLampOn)
  light(canvas, frame, ambient, isLampOn)
  return canvas.px
}

/** The scene's cells, top to bottom: six rows of wall, one of desk top. */
export function paintScene(frame: number, now: Date, ambient: Ambient, isLampOn: boolean): DeskCell[][] {
  const px = paintPixels(frame, now, ambient, isLampOn)
  const rows: DeskCell[][] = []
  for (let cy = 0; cy < SCENE_ROWS; cy++) {
    const row: DeskCell[] = []
    for (let cx = 0; cx < DESK_WIDTH; cx++) {
      const pixels: string[] = []
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) pixels.push(px[cy * 3 + dy]?.[cx * 2 + dx] ?? '#15122a')
      row.push(encodeCell(pixels))
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
