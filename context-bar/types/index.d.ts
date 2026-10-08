export type ContextRow = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

/** One rate-limit window: how much of it is used, and when it resets. */
export type Limit = { percent: number; resetsAt?: string }

/** Everything the band reads off the session, refreshed at each prompt and turn end. */
export type ContextSnap = {
  percent: number
  totalTokens: number
  maxTokens: number
  rows: ContextRow[]
  /** The five-hour window, null until a response has reported it. */
  fiveHour: Limit | null
  /** The seven-day window, null until a response has reported it. */
  sevenDay: Limit | null
  /** When the session began, in clock milliseconds. */
  startedAt: number
  /** The model in use, as '/model' names it: 'Sonnet 5.5'. */
  model: string
  /** The model's saved effort level, if it has one. */
  effort: string | null
  /** What the session has cost at API rates, as /cost totals it; null where unknown. */
  costUsd: number | null
  /** The last reply's input, split by how the prompt cache handled it; null before any reply. */
  lastReply: { input: number; cacheRead: number; cacheWrite: number } | null
}

/** Tokens and their API-rate cost, summed over every turn the mod has seen. */
export type Spend = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  usdInput: number
  usdOutput: number
  usdRead: number
  usdWrite: number
  /** What the cache reads would have cost at the full input rate, less what they did cost. */
  usdSaved: number
}

/** Limit Coach's memory of the 5-hour window. */
export type Coach = {
  /** [clock ms, percent] readings from the last hour, oldest first. */
  samples: [number, number][]
  /** The highest warning given in this window: 0, 80 or 95. */
  warned: number
  /** When a full window resets (its resetsAt), while waiting for it; else null. */
  waitingFor: string | null
  /** True once a full window has reset, until Continue or the next prompt. */
  isReset: boolean
}

/** A live subagent, under the fun name it was given. */
export type AgentChip = { id: string; name: string; type: string }

export type Phase = 'idle' | 'thinking' | 'working'

export type Weather = {
  place: string
  temp: number
  unit: 'C' | 'F'
  code: number
  isDay: boolean
}

/** What the fun column's surface module draws from; plain data. */
export type FunProps = {
  showTagline: boolean
  /** 'side': the pet beside its info rows (wide terminals); 'stack': the info rows above it. */
  layout: 'side' | 'stack'
  pet: 'cat' | 'dog'
  /** The model and its effort, shown under the weather: 'Opus 5.5', 'high' (null when none). */
  model: string
  effort: string | null
  session: string
  weather: { glyph: string; word: string; color: string; temp: string; tempColor: string; place: string } | null
  phase: Phase
  percent: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': {
      snap: ContextSnap | null
      isOn: boolean
      phase: Phase
      weather: Weather | null
      agents: AgentChip[]
      quote: string
      spend: Spend
      pet: 'cat' | 'dog'
      coach: Coach
    }
  }
}
