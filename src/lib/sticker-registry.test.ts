import { describe, expect, it, vi } from 'vitest'
import { isMorningHours, localDateKey, pickSticker, recordStickerShown } from './sticker-registry'
import type { PetSticker, PetStickerHistory } from '../types/sticker'

const baseSticker = (id: string, override: Partial<PetSticker> = {}): PetSticker => ({
  id,
  src: `/${id}.svg`,
  triggers: [{ kind: 'greeting', period: 'morning' }],
  mood: 'cozy',
  weight: 1,
  cooldownMs: 60_000,
  ...override
})

describe('pickSticker', () => {
  it('returns null when manifest is empty', () => {
    const result = pickSticker({ trigger: { kind: 'greeting', period: 'morning' } }, undefined, [])
    expect(result).toBeNull()
  })

  it('filters by trigger kind/discriminator', () => {
    const morning = baseSticker('m')
    const reminder = baseSticker('r', { triggers: [{ kind: 'reminder', phase: 'alert' }] })
    const result = pickSticker({ trigger: { kind: 'reminder', phase: 'alert' } }, undefined, [morning, reminder])
    expect(result?.id).toBe('r')
  })

  it('returns null if the only candidate is the most-recent shown', () => {
    const sticker = baseSticker('hot', { cooldownMs: 60_000 })
    const history: PetStickerHistory = {
      entries: [{ id: 'hot', shownAt: new Date(1_000_000).toISOString(), triggerKind: 'greeting' }]
    }
    const result = pickSticker(
      { trigger: { kind: 'greeting', period: 'morning' }, now: 1_010_000 },
      history,
      [sticker]
    )
    // Cooldown blocks it AND the most-recent dedup blocks it. We return
    // null rather than re-show the same image immediately.
    expect(result).toBeNull()
  })

  it('relaxes cooldown when no fresh candidate exists but a non-recent sibling is in cooldown', () => {
    // 'old' was shown earlier but isn't the most recent, and it's still in
    // cooldown. The relaxed fallback should ignore the cooldown so we still
    // get *something* matching.
    const old = baseSticker('old', { cooldownMs: 24 * 60 * 60 * 1000 })
    const recent = baseSticker('recent', { cooldownMs: 24 * 60 * 60 * 1000 })
    const history: PetStickerHistory = {
      entries: [
        { id: 'old', shownAt: new Date(1_000_000).toISOString(), triggerKind: 'greeting' },
        { id: 'recent', shownAt: new Date(2_000_000).toISOString(), triggerKind: 'greeting' }
      ]
    }
    const result = pickSticker(
      { trigger: { kind: 'greeting', period: 'morning' }, now: 2_010_000 },
      history,
      [old, recent]
    )
    expect(result?.id).toBe('old')
  })

  it('prefers an out-of-cooldown sibling over an in-cooldown one', () => {
    const hot = baseSticker('hot', { cooldownMs: 60_000 })
    const cold = baseSticker('cold', { cooldownMs: 60_000 })
    const history: PetStickerHistory = {
      entries: [{ id: 'hot', shownAt: new Date(1_000_000).toISOString(), triggerKind: 'greeting' }]
    }
    const result = pickSticker(
      { trigger: { kind: 'greeting', period: 'morning' }, now: 1_010_000 },
      history,
      [hot, cold]
    )
    expect(result?.id).toBe('cold')
  })

  it('excludes the most recently shown sticker even when not in cooldown', () => {
    const a = baseSticker('a', { cooldownMs: 0 })
    const b = baseSticker('b', { cooldownMs: 0 })
    const history: PetStickerHistory = {
      entries: [{ id: 'a', shownAt: new Date(1_000_000).toISOString(), triggerKind: 'greeting' }]
    }
    const result = pickSticker(
      { trigger: { kind: 'greeting', period: 'morning' }, now: 2_000_000 },
      history,
      [a, b]
    )
    expect(result?.id).toBe('b')
  })

  it('honors weight via deterministic mock', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.95)
    try {
      const a = baseSticker('a', { weight: 1, cooldownMs: 0 })
      const b = baseSticker('b', { weight: 9, cooldownMs: 0 })
      const result = pickSticker(
        { trigger: { kind: 'greeting', period: 'morning' } },
        undefined,
        [a, b]
      )
      // Heavy weight side wins given random near 1.
      expect(result?.id).toBe('b')
    } finally {
      random.mockRestore()
    }
  })
})

describe('recordStickerShown', () => {
  it('appends and caps history length', () => {
    let history: PetStickerHistory | undefined
    for (let i = 0; i < 12; i++) {
      const sticker = baseSticker(`s${i}`)
      history = recordStickerShown(history, sticker, { trigger: { kind: 'greeting', period: 'morning' }, now: i * 1000 })
    }
    expect(history?.entries.length).toBe(8)
    expect(history?.entries[history.entries.length - 1].id).toBe('s11')
    expect(history?.entries[0].id).toBe('s4')
  })

  it('preserves lastMorningGreetingAt', () => {
    const seed: PetStickerHistory = { entries: [], lastMorningGreetingAt: '2024-01-01' }
    const next = recordStickerShown(seed, baseSticker('x'), { trigger: { kind: 'greeting', period: 'morning' } })
    expect(next.lastMorningGreetingAt).toBe('2024-01-01')
  })
})

describe('localDateKey + isMorningHours', () => {
  it('formats local date as YYYY-MM-DD', () => {
    const key = localDateKey(new Date(2024, 5, 7, 9, 30))
    expect(key).toBe('2024-06-07')
  })

  it('treats 5am-noon as morning', () => {
    expect(isMorningHours(new Date(2024, 0, 1, 4, 59))).toBe(false)
    expect(isMorningHours(new Date(2024, 0, 1, 5, 0))).toBe(true)
    expect(isMorningHours(new Date(2024, 0, 1, 11, 59))).toBe(true)
    expect(isMorningHours(new Date(2024, 0, 1, 12, 0))).toBe(false)
  })
})
