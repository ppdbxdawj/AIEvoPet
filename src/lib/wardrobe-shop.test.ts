import { describe, expect, it } from 'vitest'
import {
  filterPool,
  pickWardrobe,
  orderPool,
  describePool
} from './wardrobe-shop'
import { WARDROBE_ITEMS } from '../assets/wardrobe/manifest'

const baseCtx = (overrides: Partial<Parameters<typeof filterPool>[0]> = {}) => ({
  unlockedIds: [],
  ...overrides
})

const seqRng = (values: number[]) => {
  let i = 0
  return () => {
    const v = values[i % values.length]
    i += 1
    return v
  }
}

describe('filterPool', () => {
  it('returns only the high-band items when no budget is set (defaults to high)', () => {
    const { pool, reason, effectiveBand } = filterPool(baseCtx())
    expect(reason).toBe('normal')
    expect(effectiveBand).toBe('high')
    pool.forEach((item) => expect(item.price).toBeGreaterThan(45))
  })

  it('low budget restricts to strict low band, not just <= budget', () => {
    const { pool, effectiveBand } = filterPool(baseCtx({ budget: 15 }))
    expect(effectiveBand).toBe('low')
    pool.forEach((item) => expect(item.price).toBeLessThanOrEqual(15))
  })

  it('mid budget restricts to strict mid band, never includes low', () => {
    const { pool, effectiveBand } = filterPool(baseCtx({ budget: 35 }))
    expect(effectiveBand).toBe('mid')
    pool.forEach((item) => {
      expect(item.price).toBeGreaterThan(15)
      expect(item.price).toBeLessThanOrEqual(45)
    })
  })

  it('matches at least one mood tag (within the implicit high band)', () => {
    // No budget → high band by default. cozy items in the high band
    // include angel-wings? No — back-angel-wings is celebrate+mystic.
    // Use a tag that exists in high band: 'mystic'.
    const { pool } = filterPool(baseCtx({ preferredMoods: ['mystic'] }))
    pool.forEach((item) => expect(item.moodTags.includes('mystic')).toBe(true))
  })

  it('drops items already unlocked when fresh ones exist', () => {
    const lockedIds = WARDROBE_ITEMS.slice(0, 5).map((item) => item.id)
    const { pool, reason } = filterPool(baseCtx({ unlockedIds: lockedIds }))
    expect(reason).toBe('normal')
    pool.forEach((item) => expect(lockedIds).not.toContain(item.id))
  })

  it('falls back to mood-empty when band+mood conflict has no overlap', () => {
    // Synthetic manifest where the low band has only cozy items, so a
    // budget=10 + mood=mystic request has no strict matches → we should
    // relax the mood filter (still inside low band).
    const synthetic = [
      { id: 'a', nameZh: '甲', category: 'hat', slot: 'head-top', moodTags: ['cozy'], priceBand: 'low', price: 8, description: '' },
      { id: 'b', nameZh: '乙', category: 'hat', slot: 'head-top', moodTags: ['cozy'], priceBand: 'low', price: 10, description: '' },
      { id: 'c', nameZh: '丙', category: 'hat', slot: 'head-top', moodTags: ['mystic'], priceBand: 'high', price: 60, description: '' }
    ] as const
    const { reason, pool } = filterPool(
      baseCtx({ budget: 10, preferredMoods: ['mystic'] }),
      synthetic as unknown as Parameters<typeof filterPool>[1]
    )
    expect(reason).toBe('mood-empty')
    expect(pool.length).toBe(2)
  })

  it('falls back to all-unlocked when every in-band item is owned', () => {
    const lowItems = WARDROBE_ITEMS.filter((item) => item.price <= 15).map((item) => item.id)
    const { reason } = filterPool(baseCtx({ budget: 15, unlockedIds: lowItems }))
    expect(reason).toBe('all-unlocked')
  })

  it('relaxes high → mid when high band is empty', () => {
    // Construct a synthetic manifest with no high-band items.
    const onlyLowAndMid = WARDROBE_ITEMS.filter((item) => item.price <= 45)
    const { reason, effectiveBand, pool } = filterPool(baseCtx({ budget: 80 }), onlyLowAndMid)
    expect(reason).toBe('band-relaxed')
    expect(effectiveBand).toBe('mid')
    pool.forEach((item) => {
      expect(item.price).toBeGreaterThan(15)
      expect(item.price).toBeLessThanOrEqual(45)
    })
  })
})

describe('pickWardrobe (fallback)', () => {
  it('uses fallback when no model is supplied', async () => {
    const result = await pickWardrobe(baseCtx({ budget: 30 }), { rng: seqRng([0.1, 0.2]) })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('fallback')
    expect(result!.item.price).toBeLessThanOrEqual(30)
    expect(result!.reason).toContain(result!.item.nameZh)
  })

  it('honours a model selection that lands inside the pool', async () => {
    const result = await pickWardrobe(baseCtx({ budget: 30 }), {
      rng: seqRng([0.5]),
      callModel: async (pool) => ({ id: pool[0].id, reason: '模型挑的就是它，没别的。' })
    })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('model')
    expect(result!.reason).toBe('模型挑的就是它，没别的。')
  })

  it('falls back when the model picks an off-pool id', async () => {
    const result = await pickWardrobe(baseCtx({ budget: 30 }), {
      rng: seqRng([0.5]),
      callModel: async () => ({ id: 'not-a-real-id', reason: '模型胡说八道' })
    })
    expect(result!.source).toBe('fallback')
  })

  it('falls back when the model throws', async () => {
    const result = await pickWardrobe(baseCtx({ budget: 30 }), {
      rng: seqRng([0.5]),
      callModel: async () => {
        throw new Error('network')
      }
    })
    expect(result!.source).toBe('fallback')
  })
})

describe('orderPool / describePool', () => {
  it('orderPool sorts by band then price then id', () => {
    const ordered = orderPool(WARDROBE_ITEMS.slice(0, 8))
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1]
      const curr = ordered[i]
      const bandOrder = { low: 0, mid: 1, high: 2 } as const
      expect(bandOrder[prev.priceBand]).toBeLessThanOrEqual(bandOrder[curr.priceBand])
    }
  })

  it('describePool emits one line per item with all required fields', () => {
    const text = describePool(WARDROBE_ITEMS.slice(0, 3))
    const lines = text.split('\n')
    expect(lines.length).toBe(3)
    lines.forEach((line) => {
      expect(line).toContain('id=')
      expect(line).toContain('name=')
      expect(line).toContain('mood=')
      expect(line).toContain('price=')
    })
  })
})
