import type { PetFactInput, PetPredefinedFactKey } from '../types/pet'

/**
 * Deterministic fact extractor. Used as the safety-net path: when the LLM is
 * offline OR forgets to emit a `record-fact` step, the local regex layer
 * still picks up "我今天 60 公斤" / "睡了 4 小时" / "花了 80 块" patterns and
 * lays them down on the ledger. Pure function, side-effect free.
 *
 * Scope on purpose: only the six predefined keys. Open-namespace facts (e.g.
 * "我妈住在广州") are intentionally NOT extracted here because their key
 * naming requires LLM-grade understanding -- letting regex guess open keys
 * leads to garbage like `addr.mom`/`location.mother`/`妈妈在广州`.
 */

interface ExtractorPattern {
  key: PetPredefinedFactKey
  unit: string
  // The pattern must capture the numeric value as group 1.
  pattern: RegExp
  // Optional value transform (e.g. 斤 -> kg means value * 0.5).
  transform?: (value: number) => number
  // Sanity bounds; values outside this range are dropped as unlikely. Helps
  // when a chat like "我喝了 500 杯水" happens to match a unit pattern.
  min: number
  max: number
}

const PATTERNS: ReadonlyArray<ExtractorPattern> = [
  // Body weight: kg / 公斤 / 斤 (斤 = 0.5 kg in mainland CN usage)
  {
    key: 'body.weight',
    unit: 'kg',
    pattern: /(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)/i,
    min: 20,
    max: 250
  },
  {
    key: 'body.weight',
    unit: 'kg',
    pattern: /(\d+(?:\.\d+)?)\s*斤/,
    transform: (value) => Number((value * 0.5).toFixed(2)),
    min: 40,
    max: 500
  },
  // Body height: cm / 厘米 / 米
  {
    key: 'body.height',
    unit: 'cm',
    pattern: /(\d+(?:\.\d+)?)\s*(?:cm|厘米)/i,
    min: 50,
    max: 250
  },
  {
    key: 'body.height',
    unit: 'cm',
    // Match "1.78 米" / "1.5米" but not "5米" (too loose). Anchor on a
    // reasonable adult-height range when the unit is meters.
    pattern: /(\d+\.\d+)\s*米/,
    transform: (value) => Math.round(value * 100),
    min: 0.4,
    max: 2.5
  },
  // Sleep hours
  {
    key: 'health.sleepHours',
    unit: 'h',
    pattern: /睡(?:了|得)?\s*(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:小时|h|hr|hours?)/i,
    min: 0,
    max: 24
  },
  // Spending. Keep this conservative -- only fire on explicit verbs like
  // 花了 / 用了 + amount + currency, otherwise normal numbers in chat get
  // misread as expenses.
  {
    key: 'expense.amount',
    unit: 'CNY',
    pattern: /(?:花|用|付|花了|用了|付了|消费)\s*(\d+(?:\.\d+)?)\s*(?:块|元|RMB|人民币|cny)/i,
    min: 1,
    max: 1_000_000
  },
  // Work hours, including overtime mentions.
  {
    key: 'work.hours',
    unit: 'h',
    pattern: /(?:工作|上班|加班|搬砖|码|coding|coded|worked)\s*(?:了)?\s*(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:小时|h|hr|hours?)/i,
    min: 0,
    max: 24
  },
  // Mood self-rating on 1-10 scale, e.g. "心情 6 分" / "今天打 3 分"
  {
    key: 'mood.score',
    unit: 'score',
    pattern: /(?:心情|状态|今天)?\s*(?:打|评)?\s*(\d+(?:\.\d+)?)\s*(?:分|\/\s*10)/,
    min: 1,
    max: 10
  }
]

export interface ExtractedFactCandidate extends PetFactInput {
  // Index into the source string where the match started, useful for testing
  // and for letting the UI highlight what the pet "noticed".
  matchedAt?: number
  // Pattern key that fired, for debug / dedup.
  patternKey: PetPredefinedFactKey
}

/**
 * Scan a free-form user message for any predefined fact mentions. A given
 * key is reported at most once (the first/strongest match wins) so a single
 * message saying "今天 60kg, 又 60 公斤" doesn't double-record.
 */
export const extractFactCandidates = (input: string | undefined): ExtractedFactCandidate[] => {
  const text = (input ?? '').trim()
  if (!text) return []

  const seenKeys = new Set<string>()
  const results: ExtractedFactCandidate[] = []
  for (const pattern of PATTERNS) {
    if (seenKeys.has(pattern.key)) continue
    const match = pattern.pattern.exec(text)
    if (!match) continue
    const raw = Number(match[1])
    if (!Number.isFinite(raw)) continue
    if (raw < pattern.min || raw > pattern.max) continue
    const value = pattern.transform ? pattern.transform(raw) : raw
    seenKeys.add(pattern.key)
    results.push({
      key: pattern.key,
      value,
      unit: pattern.unit,
      raw: match[0],
      matchedAt: match.index,
      patternKey: pattern.key,
      confidence: 0.7
    })
  }
  return results
}
