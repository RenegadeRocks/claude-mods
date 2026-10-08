// Numbers, names and shares as the band writes them.

import type { ContextRow } from '../types'
import { BLUE, BUFFER, FREE, GREEN, MAUVE, PEACH, PINK, TEAL, YELLOW } from './theme'

// Context categories by what their name contains: [match, short label, colour].
const CATEGORIES: [match: string, short: string, color: string][] = [
  ['system prompt', 'sys', BLUE],
  ['system tools', 'tools', MAUVE],
  ['mcp', 'mcp', PINK],
  ['agent', 'agents', PEACH],
  ['memory', 'memory', TEAL],
  ['skill', 'skills', YELLOW],
  ['message', 'msgs', GREEN],
]

export function shortName(name: string): string {
  const lower = name.toLowerCase()
  return CATEGORIES.find(([m]) => lower.includes(m))?.[1] ?? lower
}

export function colorFor(row: ContextRow): string {
  if (row.kind === 'free') return FREE
  if (row.kind === 'buffer') return BUFFER
  const lower = row.name.toLowerCase()
  return CATEGORIES.find(([m]) => lower.includes(m))?.[2] ?? row.color
}

/** 812, 8.0k, 84k, 1.2M. */
export function compact(tokens: number): string {
  // thresholds sit where rounding would carry: 999.5k shows as 1.0M, 9,950 as 10k
  if (tokens >= 999_500) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 9_950) return `${Math.round(tokens / 1000)}k`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return `${tokens}`
}

/** $0.10, <$0.01, $123. */
export function money(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01'
  return `$${usd < 99.995 ? usd.toFixed(2) : usd.toFixed(0)}`
}

/** '2h 14m' since `startedAt`; hours always shown, as a session is measured in them. */
export function sessionLength(now: number, startedAt: number): string {
  const mins = Math.max(0, Math.floor((now - startedAt) / 60_000))
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

/** '4d 3h', '2h 10m' or '12m' until `resetsAt`; '' once it has passed or when unknown. */
export function resetsIn(now: number, resetsAt: string | undefined): string {
  const ms = resetsAt ? Date.parse(resetsAt) - now : Number.NaN
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return '<1m'
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
}

/** `cells` split over `values` by share, largest remainder first. */
export function shareCells(values: number[], cells: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum <= 0) return values.map(() => 0)
  const exact = values.map(v => (v / sum) * cells)
  const out = exact.map(Math.floor)
  let left = cells - out.reduce((a, b) => a + b, 0)
  for (const [, i] of exact.map((x, k) => [x - Math.floor(x), k] as const).sort((a, b) => b[0] - a[0])) {
    if (left <= 0) break
    out[i] = (out[i] ?? 0) + 1
    left -= 1
  }
  return out
}

/** The context bar's cells per row, out of the window; a non-empty used row keeps at least one. */
export function allocate(rows: ContextRow[], max: number, cells: number): number[] {
  const out = rows.map(r => (max > 0 ? Math.floor((r.tokens / max) * cells) : 0))
  const exact = rows.map(r => (max > 0 ? (r.tokens / max) * cells : 0))
  let left = cells - out.reduce((a, b) => a + b, 0)
  for (const [, i] of exact.map((x, k) => [x - Math.floor(x), k] as const).sort((a, b) => b[0] - a[0])) {
    if (left <= 0) break
    out[i] = (out[i] ?? 0) + 1
    left -= 1
  }
  rows.forEach((r, i) => {
    if (r.kind === 'used' && r.tokens > 0 && out[i] === 0) {
      const donor = out.indexOf(Math.max(...out))
      out[donor] = (out[donor] ?? 1) - 1
      out[i] = 1
    }
  })
  // past a full window the rows add up to more than the bar: trim the widest,
  // a whole bar's worth at most so a wild reading can't spin here
  for (let guard = 0; out.reduce((a, b) => a + b, 0) > cells && guard < cells * 4; guard++) {
    const widest = out.indexOf(Math.max(...out))
    out[widest] = (out[widest] ?? 1) - 1
  }
  return out
}

/** 'claude-sonnet-5-5', 'Sonnet 5.5' or the older 'claude-3-5-sonnet-20241022' -> 'Sonnet 5.5' / 'Sonnet 3.5'. */
export function prettyModel(raw: string): string {
  // the version after the name, never the start of a date such as 20241022
  const after = /(opus|sonnet|haiku|fable)[-\s]?(\d{1,2})(?!\d)(?:[-.](\d)(?!\d))?/i.exec(raw)
  // older ids put the version first
  const before = /(\d)(?:[-.](\d))?[-.](opus|sonnet|haiku)/i.exec(raw)
  const [word, major, minor] = after ? [after[1], after[2], after[3]] : before ? [before[3], before[1], before[2]] : []
  if (!word || !major) return raw.replace(/^claude-/i, '')
  const name = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  return minor ? `${name} ${major}.${minor}` : `${name} ${major}`
}

// First-party API rates in dollars per million tokens: input, output,
// 5-minute cache write (1.25x input) and cache read. Checked 2026-09. An
// hour-long cache write, what Claude Code uses on a subscription, is 2x input.
const PRICES: [match: RegExp, rates: [number, number, number, number]][] = [
  [/fable-5-1|mythos-5-1/, [10, 50, 12.5, 0.25]],
  [/fable|mythos/, [10, 50, 12.5, 1]],
  [/opus-5-5/, [4, 20, 5, 0.2]],
  [/opus/, [5, 25, 6.25, 0.5]],
  [/sonnet-5/, [2, 10, 2.5, 0.2]],
  [/sonnet/, [3, 15, 3.75, 0.3]],
  [/haiku/, [1, 5, 1.25, 0.1]],
]

export function ratesFor(model: string): [number, number, number, number] {
  return PRICES.find(([match]) => match.test(model.toLowerCase()))?.[1] ?? [2, 10, 2.5, 0.2]
}
