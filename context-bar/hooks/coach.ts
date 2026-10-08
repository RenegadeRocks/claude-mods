// Limit Coach: watches how fast the 5-hour window fills, warns before it runs
// out, and notices when a full window resets so the work can pick back up.

import type { Coach, Limit } from '../types'

export const NO_COACH: Coach = { samples: [], warned: 0, waitingFor: null, isReset: false }

// the pace is read over the last hour of readings
const WINDOW_MS = 60 * 60_000
// fewer minutes than this between readings is too little to read a pace from
const MIN_SPAN_MINUTES = 5
// a full window is one at or past this share
const FULL = 99

function minutes(text: number): string {
  return text >= 60 ? `${Math.floor(text / 60)}h ${text % 60}m` : `${text}m`
}

/**
 * Minutes until the 5-hour window fills at the last hour's pace, or null when
 * it will reset first (or there is no pace to read yet).
 */
export function minutesToFull(samples: [number, number][], now: number, lim: Limit | null): number | null {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (!lim || !first || !last) return null
  const span = (last[0] - first[0]) / 60_000
  const rise = last[1] - first[1]
  if (span < MIN_SPAN_MINUTES || rise <= 0) return null
  const eta = (100 - lim.percent) / (rise / span)
  const untilReset = lim.resetsAt ? (Date.parse(lim.resetsAt) - now) / 60_000 : Number.POSITIVE_INFINITY
  return eta < untilReset ? Math.max(1, Math.round(eta)) : null
}

export function etaText(eta: number): string {
  return `full in ~${minutes(eta)}`
}

/** One new reading of the 5-hour window: the coach's next state, and a toast when one is due. */
export function coachStep(c: Coach, now: number, lim: Limit | null): { next: Coach; toast: string | null } {
  if (!lim) return { next: c, toast: null }

  // a fresh window shows as a big drop: the old pace no longer applies
  const prior = c.samples[c.samples.length - 1]
  const isNewWindow = prior !== undefined && lim.percent < prior[1] - 5
  const samples: [number, number][] = [...(isNewWindow ? [] : c.samples), [now, lim.percent] as [number, number]].filter(
    ([t]) => now - t <= WINDOW_MS,
  )

  let warned = isNewWindow || lim.percent < 50 ? 0 : c.warned
  let toast: string | null = null
  const eta = minutesToFull(samples, now, lim)
  for (const level of [95, 80]) {
    if (lim.percent >= level && warned < level) {
      warned = level
      toast =
        `5-hour limit at ${Math.round(lim.percent)}%` +
        (eta ? `, ${etaText(eta)} at this pace` : '') +
        '. /effort medium or a lighter /model makes it last longer.'
      break
    }
  }

  const waitingFor = lim.percent >= FULL && lim.resetsAt ? lim.resetsAt : c.waitingFor
  return { next: { samples, warned, waitingFor, isReset: c.isReset }, toast }
}

/** On the clock: a full window whose reset time has passed is ready to go again. */
export function coachTick(c: Coach, now: number): Coach | null {
  return c.waitingFor && Date.parse(c.waitingFor) <= now ? { ...c, waitingFor: null, isReset: true } : null
}
