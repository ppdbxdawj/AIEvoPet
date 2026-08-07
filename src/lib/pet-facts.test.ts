import { describe, expect, it } from 'vitest'
import { createDefaultPet } from './default-pet'
import {
  addFactRecord,
  compareFactToHistory,
  getFactHistory,
  isPredefinedFactKey,
  normalizeFactKey,
  pickStaleFactKey,
  removeFactKey,
  removeFactRecord,
  setFactKeyTracking
} from './pet-facts'

const baseTime = Date.parse('2026-01-01T08:00:00Z')

describe('normalizeFactKey', () => {
  it('maps known aliases to predefined keys', () => {
    expect(normalizeFactKey('weight')).toBe('body.weight')
    expect(normalizeFactKey('体重')).toBe('body.weight')
    expect(normalizeFactKey('SLEEP_HOURS')).toBe('health.sleepHours')
    expect(normalizeFactKey(' 心情 ')).toBe('mood.score')
  })

  it('lowercases and trims unknown keys', () => {
    expect(normalizeFactKey('Custom.Coffee_Cups')).toBe('custom.coffee_cups')
  })

  it('returns empty string for blank input', () => {
    expect(normalizeFactKey('   ')).toBe('')
  })
})

describe('isPredefinedFactKey', () => {
  it('detects predefined keys', () => {
    expect(isPredefinedFactKey('body.weight')).toBe(true)
    expect(isPredefinedFactKey('custom.thing')).toBe(false)
  })
})

describe('addFactRecord', () => {
  it('appends a new record sorted by recency', () => {
    const base = createDefaultPet()
    const first = addFactRecord(base, { key: '体重', value: 60, unit: 'kg' }, 'user-said', { now: baseTime }).pet
    const second = addFactRecord(first, { key: 'body.weight', value: 62 }, 'user-said', { now: baseTime + 86_400_000 }).pet
    const records = second.memory.facts.records.filter((entry) => entry.key === 'body.weight')
    expect(records).toHaveLength(2)
    expect(records[0].value).toBe(62)
    expect(records[1].value).toBe(60)
    // Predefined default unit should fill in even when omitted on input.
    expect(records[0].unit).toBe('kg')
  })

  it('skips when the key is disabled in trackable map', () => {
    const base = setFactKeyTracking(createDefaultPet(), 'body.weight', false)
    const result = addFactRecord(base, { key: 'body.weight', value: 60 })
    expect(result.skipped).toBe('untracked')
    expect(result.pet.memory.facts.records.filter((entry) => entry.key === 'body.weight')).toHaveLength(0)
  })

  it('rejects malformed values', () => {
    const base = createDefaultPet()
    const blank = addFactRecord(base, { key: 'mood.score', value: '   ' as unknown as string })
    expect(blank.skipped).toBe('invalid')
    const noKey = addFactRecord(base, { key: '   ', value: 5 })
    expect(noKey.skipped).toBe('invalid')
  })

  it('respects per-key cap (across distinct days)', () => {
    // Same-day inserts now de-duplicate (B3), so we spread across distinct
    // calendar days to actually exercise the per-key cap.
    let pet = createDefaultPet()
    const dayMs = 86_400_000
    for (let i = 0; i < 35; i += 1) {
      pet = addFactRecord(pet, { key: 'body.weight', value: 60 + i * 0.1 }, 'user-said', { now: baseTime + i * dayMs }).pet
    }
    const weightRecords = pet.memory.facts.records.filter((entry) => entry.key === 'body.weight')
    expect(weightRecords.length).toBeLessThanOrEqual(30)
    expect(weightRecords[0].value).toBeCloseTo(60 + 34 * 0.1, 5)
  })

  it('B3: same-key + same-day update in place rather than appending', () => {
    let pet = createDefaultPet()
    // Use a small intra-day delta (3 hours) so we don't accidentally cross
    // midnight UTC, which would correctly count as separate days.
    const dayStart = Date.parse('2026-01-01T01:00:00Z')
    const morning = addFactRecord(pet, { key: 'body.weight', value: 75, raw: '今天 75 kg' }, 'user-said', { now: dayStart })
    pet = morning.pet
    const morningRecord = morning.record!

    const evening = addFactRecord(pet, { key: 'body.weight', value: 76, raw: '晚上又称了一次' }, 'user-said', { now: dayStart + 3 * 3600_000 })
    pet = evening.pet

    const weightRecords = pet.memory.facts.records.filter((entry) => entry.key === 'body.weight')
    expect(weightRecords).toHaveLength(1)
    expect(weightRecords[0].id).toBe(morningRecord.id)
    expect(weightRecords[0].value).toBe(76)
    expect(weightRecords[0].raw).toBe('晚上又称了一次')
  })
})

describe('removeFactRecord / removeFactKey', () => {
  it('removes individual records and whole keys', () => {
    let pet = createDefaultPet()
    pet = addFactRecord(pet, { key: 'body.weight', value: 60 }, 'user-said', { now: baseTime }).pet
    pet = addFactRecord(pet, { key: 'body.weight', value: 62 }, 'user-said', { now: baseTime + 86_400_000 }).pet
    pet = addFactRecord(pet, { key: 'health.sleepHours', value: 6 }, 'user-said', { now: baseTime }).pet
    const recordToRemove = pet.memory.facts.records.find((entry) => entry.key === 'body.weight' && entry.value === 60)!
    pet = removeFactRecord(pet, recordToRemove.id)
    expect(pet.memory.facts.records.filter((entry) => entry.key === 'body.weight')).toHaveLength(1)
    pet = removeFactKey(pet, 'body.weight')
    expect(pet.memory.facts.records.some((entry) => entry.key === 'body.weight')).toBe(false)
    // Other keys untouched.
    expect(pet.memory.facts.records.some((entry) => entry.key === 'health.sleepHours')).toBe(true)
  })
})

describe('compareFactToHistory', () => {
  it('returns isFirstTime when no prior record', () => {
    const pet = addFactRecord(createDefaultPet(), { key: 'body.weight', value: 60 }, 'user-said', { now: baseTime }).pet
    const result = compareFactToHistory(pet, 'body.weight')
    expect(result?.isFirstTime).toBe(true)
    expect(result?.previous).toBeUndefined()
  })

  it('computes numeric delta and trend', () => {
    let pet = createDefaultPet()
    pet = addFactRecord(pet, { key: 'body.weight', value: 60, unit: 'kg' }, 'user-said', { now: baseTime }).pet
    pet = addFactRecord(pet, { key: 'body.weight', value: 62, unit: 'kg' }, 'user-said', { now: baseTime + 3 * 86_400_000 }).pet
    const result = compareFactToHistory(pet, 'body.weight')
    expect(result?.isFirstTime).toBe(false)
    expect(result?.delta).toBe(2)
    expect(result?.trend).toBe('up')
    expect(result?.daysSince).toBe(3)
  })

  it('handles string values gracefully', () => {
    let pet = createDefaultPet()
    pet = addFactRecord(pet, { key: 'pet.coat-color', value: 'cream' }, 'user-said', { now: baseTime }).pet
    pet = addFactRecord(pet, { key: 'pet.coat-color', value: 'cream' }, 'user-said', { now: baseTime + 86_400_000 }).pet
    const result = compareFactToHistory(pet, 'pet.coat-color')
    expect(result?.delta).toBeUndefined()
    expect(result?.trend).toBe('same')
  })
})

describe('getFactHistory', () => {
  it('returns history sorted newest first', () => {
    let pet = createDefaultPet()
    pet = addFactRecord(pet, { key: 'body.weight', value: 60 }, 'user-said', { now: baseTime }).pet
    pet = addFactRecord(pet, { key: 'body.weight', value: 61 }, 'user-said', { now: baseTime + 86_400_000 }).pet
    pet = addFactRecord(pet, { key: 'body.weight', value: 62 }, 'user-said', { now: baseTime + 2 * 86_400_000 }).pet
    const history = getFactHistory(pet, 'body.weight', 5)
    expect(history.map((entry) => entry.value)).toEqual([62, 61, 60])
  })
})

describe('pickStaleFactKey', () => {
  it('returns nothing when all keys are recent', () => {
    let pet = createDefaultPet()
    const now = baseTime + 86_400_000
    pet = addFactRecord(pet, { key: 'body.weight', value: 60 }, 'user-said', { now }).pet
    expect(pickStaleFactKey(pet, { staleAfterDays: 5, now: now + 86_400_000 })).toBeUndefined()
  })

  it('returns the most stale key past the threshold', () => {
    let pet = createDefaultPet()
    pet = addFactRecord(pet, { key: 'body.weight', value: 60 }, 'user-said', { now: baseTime }).pet
    pet = addFactRecord(pet, { key: 'health.sleepHours', value: 6 }, 'user-said', { now: baseTime + 4 * 86_400_000 }).pet
    const result = pickStaleFactKey(pet, { staleAfterDays: 5, now: baseTime + 10 * 86_400_000 })
    expect(result?.key).toBe('body.weight')
    expect(result?.daysSince).toBe(10)
  })

  it('skips disabled keys', () => {
    let pet = createDefaultPet()
    pet = addFactRecord(pet, { key: 'body.weight', value: 60 }, 'user-said', { now: baseTime }).pet
    pet = setFactKeyTracking(pet, 'body.weight', false)
    expect(pickStaleFactKey(pet, { staleAfterDays: 1, now: baseTime + 100 * 86_400_000 })).toBeUndefined()
  })
})
