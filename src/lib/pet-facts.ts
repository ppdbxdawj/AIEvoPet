import type { PetData, PetFactInput, PetFactLedger, PetFactRecord, PetPredefinedFactKey } from '../types/pet'

/**
 * Typed-fact ledger ops. The ledger is the bridge between three things:
 *   1. natural-language extraction of "I weigh 60kg" style facts
 *   2. comparison against past observations ("up 2kg vs 3 days ago")
 *   3. proactive recall of stale entries ("you haven't told me your weight
 *      in two weeks").
 *
 * Predefined keys carry a known unit + comparison policy. Open keys (anything
 * else the LLM chooses to record) are stored as-is and shown back on the UI
 * but skipped from numeric trend talk.
 */

// Per-key total cap. Older entries beyond this are dropped on insert. Picked
// to keep `pet.json` bounded even if you tell the pet your weight every day
// for a year.
const PER_KEY_LIMIT = 30
// Hard total cap across all keys. Acts as a safety net for absurd usage
// patterns (e.g. test loops dumping thousands of facts).
const TOTAL_LIMIT = 500

const PREDEFINED_FACT_KEYS: ReadonlyArray<PetPredefinedFactKey> = [
  'body.weight',
  'body.height',
  'health.sleepHours',
  'expense.amount',
  'work.hours',
  'mood.score'
]

// Unit + alias normalisation for predefined keys. Keeps ledger queries
// deterministic regardless of whether the user said "公斤" or "kg".
const PREDEFINED_KEY_META: Record<PetPredefinedFactKey, {
  defaultUnit: string
  // Aliases that the LLM might propose -- normalised to canonical key.
  aliases: ReadonlyArray<string>
}> = {
  'body.weight': {
    defaultUnit: 'kg',
    aliases: ['weight', '体重', 'bw', 'body_weight', 'body-weight']
  },
  'body.height': {
    defaultUnit: 'cm',
    aliases: ['height', '身高']
  },
  'health.sleepHours': {
    defaultUnit: 'h',
    aliases: ['sleep', 'sleep_hours', 'sleephours', '睡眠', '睡眠时长', '睡眠时间']
  },
  'expense.amount': {
    defaultUnit: 'CNY',
    aliases: ['expense', 'spending', '支出', '花销', '花费']
  },
  'work.hours': {
    defaultUnit: 'h',
    aliases: ['work', 'work_hours', '加班', '工时', '工作时长']
  },
  'mood.score': {
    defaultUnit: 'score',
    aliases: ['mood', '心情', '心情评分']
  }
}

const KEY_ALIAS_MAP: Record<string, PetPredefinedFactKey> = (() => {
  const map: Record<string, PetPredefinedFactKey> = {}
  for (const key of PREDEFINED_FACT_KEYS) {
    map[key.toLowerCase()] = key
    for (const alias of PREDEFINED_KEY_META[key].aliases) {
      map[alias.toLowerCase()] = key
    }
  }
  return map
})()

export const isPredefinedFactKey = (key: string): key is PetPredefinedFactKey =>
  (PREDEFINED_FACT_KEYS as ReadonlyArray<string>).includes(key)

/**
 * Normalises an LLM-proposed key against the alias table. Anything that
 * doesn't match a predefined alias is returned trimmed/lowercased so two
 * synonyms don't fragment the open-key namespace too aggressively.
 */
export const normalizeFactKey = (key: string): string => {
  const trimmed = key.trim()
  if (!trimmed) return ''
  const lower = trimmed.toLowerCase()
  return KEY_ALIAS_MAP[lower] ?? lower
}

export const getFactDefaultUnit = (key: string): string | undefined => {
  if (isPredefinedFactKey(key)) return PREDEFINED_KEY_META[key].defaultUnit
  return undefined
}

const isLedgerKeyEnabled = (ledger: PetFactLedger, key: string): boolean => {
  // Default: tracking is on. Users explicitly disable a key by setting
  // trackable[key] = false.
  return ledger.trackable[key] !== false
}

export interface AddFactOptions {
  now?: number
}

/**
 * Returns a new PetData with the new fact appended (or skipped, if the user
 * has disabled tracking for that key). Caller is responsible for persisting
 * via commitPet/savePet -- this function is pure.
 */
export const addFactRecord = (
  pet: PetData,
  input: PetFactInput,
  source: PetFactRecord['source'] = 'user-said',
  options: AddFactOptions = {}
): { pet: PetData; record?: PetFactRecord; skipped?: 'untracked' | 'invalid' } => {
  const key = normalizeFactKey(input.key)
  if (!key) return { pet, skipped: 'invalid' }
  const value = input.value
  if (typeof value !== 'number' && typeof value !== 'string') return { pet, skipped: 'invalid' }
  if (typeof value === 'string' && !value.trim()) return { pet, skipped: 'invalid' }

  const ledger = pet.memory.facts ?? { records: [], trackable: {} }
  if (!isLedgerKeyEnabled(ledger, key)) return { pet, skipped: 'untracked' }

  const now = options.now ?? Date.now()
  const unit = input.unit?.trim() || getFactDefaultUnit(key)
  const normalizedValue = typeof value === 'string' ? value.trim().slice(0, 120) : value

  // B3: same-key + same-day → update the existing record, don't append a
  // duplicate. Without this, "今天 75 公斤" said twice fills the per-key
  // cap with redundant snapshots and the diff-vs-yesterday math breaks.
  // We keep the original record id so any UI references stay valid.
  const dateKey = new Date(now).toISOString().slice(0, 10)
  const existingTodaysRecord = ledger.records.find((entry) =>
    entry.key === key && entry.ts.slice(0, 10) === dateKey
  )

  const record: PetFactRecord = existingTodaysRecord
    ? {
        ...existingTodaysRecord,
        value: normalizedValue,
        unit,
        ts: new Date(now).toISOString(),
        source,
        confidence: typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : existingTodaysRecord.confidence,
        raw: input.raw?.trim().slice(0, 200) ?? existingTodaysRecord.raw
      }
    : {
        id: crypto.randomUUID(),
        key,
        value: normalizedValue,
        unit,
        ts: new Date(now).toISOString(),
        source,
        confidence: typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : undefined,
        raw: input.raw?.trim().slice(0, 200)
      }

  // Drop the stale same-day record (if any) before re-adding the merged one.
  const withoutStale = existingTodaysRecord
    ? ledger.records.filter((entry) => entry.id !== existingTodaysRecord.id)
    : ledger.records

  // Per-key cap then global cap. Newer entries first so stale ones drop off.
  const sameKeyKept = withoutStale.filter((entry) => entry.key === key).slice(0, PER_KEY_LIMIT - 1)
  const others = withoutStale.filter((entry) => entry.key !== key)
  const merged = [record, ...sameKeyKept, ...others]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, TOTAL_LIMIT)

  return {
    pet: {
      ...pet,
      memory: {
        ...pet.memory,
        facts: {
          ...ledger,
          records: merged
        }
      }
    },
    record
  }
}

export const removeFactRecord = (pet: PetData, recordId: string): PetData => ({
  ...pet,
  memory: {
    ...pet.memory,
    facts: {
      ...pet.memory.facts,
      records: pet.memory.facts.records.filter((entry) => entry.id !== recordId)
    }
  }
})

export const removeFactKey = (pet: PetData, key: string): PetData => ({
  ...pet,
  memory: {
    ...pet.memory,
    facts: {
      ...pet.memory.facts,
      records: pet.memory.facts.records.filter((entry) => entry.key !== normalizeFactKey(key))
    }
  }
})

export const setFactKeyTracking = (pet: PetData, key: string, enabled: boolean): PetData => {
  const normalised = normalizeFactKey(key)
  if (!normalised) return pet
  return {
    ...pet,
    memory: {
      ...pet.memory,
      facts: {
        ...pet.memory.facts,
        trackable: {
          ...pet.memory.facts.trackable,
          [normalised]: enabled
        }
      }
    }
  }
}

export const stampProactiveRecall = (pet: PetData, now = Date.now()): PetData => ({
  ...pet,
  memory: {
    ...pet.memory,
    facts: {
      ...pet.memory.facts,
      lastProactiveRecallAt: new Date(now).toISOString()
    }
  }
})

export const getFactHistory = (pet: PetData, key: string, limit = 10): PetFactRecord[] => {
  const normalised = normalizeFactKey(key)
  return pet.memory.facts.records
    .filter((entry) => entry.key === normalised)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, limit)
}

export const getAllFactKeys = (pet: PetData): string[] => {
  const seen = new Set<string>()
  for (const entry of pet.memory.facts.records) seen.add(entry.key)
  return Array.from(seen)
}

export interface FactComparison {
  key: string
  current: PetFactRecord
  previous?: PetFactRecord
  // For numeric values: current.value - previous.value, otherwise undefined.
  delta?: number
  daysSince?: number
  trend?: 'up' | 'down' | 'same'
  // Whether this is the first time we've seen this key (no previous record).
  isFirstTime: boolean
}

const dayDelta = (a: string, b: string) => {
  const aTs = new Date(a).getTime()
  const bTs = new Date(b).getTime()
  if (!Number.isFinite(aTs) || !Number.isFinite(bTs)) return undefined
  return Math.max(0, Math.round((aTs - bTs) / 86_400_000))
}

/**
 * Compares the most recent record for a key against the one before it.
 * Returns undefined when the key has never been seen (caller is expected to
 * treat that as "first observation, no comparison to surface").
 */
export const compareFactToHistory = (pet: PetData, key: string): FactComparison | undefined => {
  const history = getFactHistory(pet, key, 5)
  const current = history[0]
  if (!current) return undefined
  const previous = history[1]
  if (!previous) {
    return { key: current.key, current, isFirstTime: true }
  }

  const days = dayDelta(current.ts, previous.ts)
  let delta: number | undefined
  let trend: FactComparison['trend']
  if (typeof current.value === 'number' && typeof previous.value === 'number') {
    delta = Number((current.value - previous.value).toFixed(2))
    trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'
  } else if (current.value === previous.value) {
    trend = 'same'
  } else {
    trend = undefined
  }

  return {
    key: current.key,
    current,
    previous,
    delta,
    daysSince: days,
    trend,
    isFirstTime: false
  }
}

/**
 * Picks one fact key that hasn't been mentioned recently, used by the
 * proactive recall pipeline. Returns undefined when there's nothing stale
 * worth surfacing.
 */
export const pickStaleFactKey = (
  pet: PetData,
  options: { staleAfterDays?: number; now?: number } = {}
): { key: string; daysSince: number; latest: PetFactRecord } | undefined => {
  const staleAfter = options.staleAfterDays ?? 5
  const now = options.now ?? Date.now()

  const latestByKey = new Map<string, PetFactRecord>()
  for (const record of pet.memory.facts.records) {
    const existing = latestByKey.get(record.key)
    if (!existing || new Date(record.ts).getTime() > new Date(existing.ts).getTime()) {
      latestByKey.set(record.key, record)
    }
  }

  let best: { key: string; daysSince: number; latest: PetFactRecord } | undefined
  for (const [key, latest] of latestByKey.entries()) {
    if (!isLedgerKeyEnabled(pet.memory.facts, key)) continue
    const days = Math.round((now - new Date(latest.ts).getTime()) / 86_400_000)
    if (days < staleAfter) continue
    if (!best || days > best.daysSince) best = { key, daysSince: days, latest }
  }
  return best
}
