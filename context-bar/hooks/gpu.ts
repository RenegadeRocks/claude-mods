// Render watch: reads the GPU's load from nvidia-smi and tells a job's start
// and end apart from a passing spike.

import type { Gpu } from '../types'

// the GPU counts as working from this load, and as quiet below the next
const BUSY = 40
const QUIET = 15
// a job is over once the GPU has been quiet this long
const QUIET_MS = 20_000
// and was a job worth mentioning if it ran at least this long
const JOB_MS = 60_000

export type GpuTrack = { busySince: number | null; quietSince: number | null }
export const NO_TRACK: GpuTrack = { busySince: null, quietSince: null }

/** `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits`. */
export function parseSmi(stdout: string): { util: number; memUsed: number; memTotal: number } | null {
  const [util, used, total] = (stdout.split(/\r?\n/)[0] ?? '').split(',').map(v => Number(v.trim()))
  if (![util, used, total].every(v => Number.isFinite(v))) return null
  return { util: util ?? 0, memUsed: (used ?? 0) / 1024, memTotal: (total ?? 0) / 1024 }
}

/**
 * One reading: the line to show (null while the GPU idles), and, when a job
 * just ended, how many minutes it ran.
 */
export function gpuStep(
  track: GpuTrack,
  now: number,
  reading: { util: number; memUsed: number; memTotal: number },
): { track: GpuTrack; gpu: Gpu | null; finishedMinutes: number | null } {
  let { busySince, quietSince } = track
  let finishedMinutes: number | null = null
  if (reading.util >= BUSY) {
    busySince ??= now
    quietSince = null
  } else if (reading.util < QUIET && busySince !== null) {
    quietSince ??= now
    if (now - quietSince >= QUIET_MS) {
      if (quietSince - busySince >= JOB_MS) finishedMinutes = Math.max(1, Math.round((quietSince - busySince) / 60_000))
      busySince = null
      quietSince = null
    }
  }
  const isShown = reading.util >= QUIET || busySince !== null
  const gpu = isShown
    ? {
        util: Math.round(reading.util),
        memUsed: Math.round(reading.memUsed),
        memTotal: Math.round(reading.memTotal),
        busyMinutes: busySince === null ? 0 : Math.floor((now - busySince) / 60_000),
      }
    : null
  return { track: { busySince, quietSince }, gpu, finishedMinutes }
}
