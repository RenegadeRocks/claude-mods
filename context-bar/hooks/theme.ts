// Colours and colour rules, shared by the band and the fun column.
// A dark slate card in a soft pastel palette that reads on any terminal theme.

export const BG = '#1a1d29'
export const BORDER = '#3b4261'
export const TEXT = '#cdd6f4'
export const MUTED = '#8087a2'
export const TRACK = '#444b6a'
export const FREE = '#353b58'
export const BUFFER = '#6c4a5a'

export const BLUE = '#89b4fa'
export const MAUVE = '#cba6f7'
export const PINK = '#f5c2e7'
export const PEACH = '#fab387'
export const YELLOW = '#f9e2af'
export const GREEN = '#a6e3a1'
export const TEAL = '#94e2d5'
export const SKY = '#74c7ec'
export const LAVENDER = '#b4befe'
export const RED = '#f38ba8'

export const SIGNATURE_STOPS = [PINK, MAUVE, BLUE]

// the API $ bar's parts, light to dark gold: in, out, cache read, cache write, other
export const GOLDS = ['#fbe7b5', '#f0c674', '#d19a4e', '#a87642', '#6c6450'] as const

/** Green, then peach, then red as a share fills up. */
export function percentColor(percent: number): string {
  if (percent >= 85) return RED
  if (percent >= 65) return PEACH
  return GREEN
}

/** Cool blues to hot reds, by the temperature in Celsius. */
export function heatColor(temp: number, unit: 'C' | 'F'): string {
  const c = unit === 'F' ? ((temp - 32) * 5) / 9 : temp
  if (c < 10) return BLUE
  if (c < 20) return TEAL
  if (c < 30) return GREEN
  if (c < 36) return YELLOW
  if (c < 40) return PEACH
  return RED
}

export type Sky = { glyph: string; word: string; color: string }

/** An Open-Meteo weather code as a one-column glyph, a word and a colour. */
export function skyStyle(code: number, isDay: boolean): Sky {
  const cloudy = { glyph: '◐', word: 'Cloudy', color: '#a6adc8' }
  if (code === 0) return isDay ? { glyph: '☼', word: 'Clear', color: YELLOW } : { glyph: '☾', word: 'Clear', color: LAVENDER }
  if (code <= 3) return cloudy
  if (code === 45 || code === 48) return { glyph: '≡', word: 'Fog', color: '#9399b2' }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { glyph: '∴', word: 'Rain', color: SKY }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { glyph: '*', word: 'Snow', color: '#89dceb' }
  if (code >= 95) return { glyph: 'ϟ', word: 'Storm', color: PEACH }
  return cloudy
}

function lerpHex(a: string, b: string, t: number): string {
  const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const from = channels(a)
  const to = channels(b)
  return `#${from.map((v, k) => Math.round(v + ((to[k] ?? v) - v) * t).toString(16).padStart(2, '0')).join('')}`
}

export type Cell = { ch: string; color: string }

/** Each character of `text` coloured along the stops, left to right. */
export function gradient(text: string, stops: string[]): Cell[] {
  const span = Math.max(1, text.length - 1)
  return [...text].map((ch, i) => {
    const at = (i / span) * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(at))
    return { ch, color: lerpHex(stops[k] ?? '#ffffff', stops[k + 1] ?? '#ffffff', at - k) }
  })
}
