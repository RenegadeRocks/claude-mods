// Wellness nudges: Rocky asks you to rest your eyes and drink water, counted
// in time you actually work, so sessions that run for days don't matter.

import type { Nudge, Wellness } from '../types'

export const NO_WELLNESS: Wellness = { activeMs: 0, eyesAt: 0, waterAt: 0, due: null }

// you count as working within this long of your last prompt or Claude's last step
const ACTIVE_WITHIN_MS = 5 * 60_000
// and as having taken a break once you have been away this long
const BREAK_MS = 15 * 60_000

export const NUDGE_TOASTS: Record<Nudge, string> = {
  eyes: 'Rocky says: rest your eyes. Look at something far away for 20 seconds, then click him.',
  water: 'Rocky says: water break! Have a glass, then click him.',
}

/**
 * One clock tick of `tickMs`: adds active time, resets after a real break, and
 * makes a nudge due when its time comes (eyes first). `nudged` is a nudge that
 * just became due, for a toast; intervals of 0 turn that nudge off.
 */
export function wellnessTick(
  w: Wellness,
  awayMs: number,
  tickMs: number,
  eyesMs: number,
  waterMs: number,
): { next: Wellness; nudged: Nudge | null } {
  if (awayMs >= BREAK_MS) {
    return { next: { ...w, eyesAt: w.activeMs, waterAt: w.activeMs, due: null }, nudged: null }
  }
  const activeMs = awayMs < ACTIVE_WITHIN_MS ? w.activeMs + tickMs : w.activeMs
  let due = w.due
  let nudged: Nudge | null = null
  if (due === null) {
    if (eyesMs > 0 && activeMs - w.eyesAt >= eyesMs) due = 'eyes'
    else if (waterMs > 0 && activeMs - w.waterAt >= waterMs) due = 'water'
    nudged = due
  }
  return { next: { ...w, activeMs, due }, nudged }
}

/** The pet was clicked: the nudge showing is done, and its clock starts over. */
export function wellnessDone(w: Wellness): Wellness {
  if (w.due === 'eyes') return { ...w, eyesAt: w.activeMs, due: null }
  if (w.due === 'water') return { ...w, waterAt: w.activeMs, due: null }
  return w
}
