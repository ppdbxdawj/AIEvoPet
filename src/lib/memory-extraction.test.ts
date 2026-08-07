import { describe, expect, it } from 'vitest'
import { buildExtractedTags, extractMemorySignals } from './memory-extraction'

describe('extractMemorySignals', () => {
  it('returns general/importance 1 for empty input', () => {
    const result = extractMemorySignals(undefined)
    expect(result).toEqual({ importance: 1, category: 'general', matchedCategories: [] })
  })

  it('returns general/importance 1 for plain chitchat', () => {
    const result = extractMemorySignals('今天天气不错，没啥特别的')
    expect(result.importance).toBe(1)
    expect(result.category).toBe('general')
    expect(result.matchedCategories).toEqual([])
  })

  it('flags milestone keywords as importance 3', () => {
    const result = extractMemorySignals('终于发版上线了')
    expect(result.importance).toBe(3)
    expect(result.matchedCategories).toContain('milestone')
  })

  it('combo bumps people + health to importance 3', () => {
    const result = extractMemorySignals('妈妈今天住院了')
    expect(result.importance).toBe(3)
    expect(result.matchedCategories).toEqual(expect.arrayContaining(['people', 'health']))
    // milestone wins category priority because "住院" is also a milestone
    // keyword. Either label is acceptable; what matters is the importance.
    expect(['milestone', 'people']).toContain(result.category)
  })

  it('first-time hint nudges importance up by one tier', () => {
    const result = extractMemorySignals('我今天第一次跑了五公里')
    expect(result.importance).toBeGreaterThanOrEqual(2)
  })

  it('gives mood-only messages importance 2', () => {
    const result = extractMemorySignals('好想哭，今天太累了')
    expect(result.importance).toBe(2)
    expect(result.matchedCategories).toContain('mood')
  })

  it('captures preference signals separately', () => {
    const result = extractMemorySignals('我喜欢喝热牛奶')
    expect(result.matchedCategories).toContain('preference')
    expect(result.category).toBe('preference')
  })
})

describe('buildExtractedTags', () => {
  it('combines matched categories with extras and dedupes', () => {
    const signals = extractMemorySignals('妈妈今天住院了')
    const tags = buildExtractedTags(signals, ['chat', 'pet-react', 'people'])
    expect(tags).toContain('people')
    expect(tags).toContain('chat')
    expect(tags).toContain('important')
    expect(tags.length).toBeLessThanOrEqual(5)
  })

  it('skips empty extras', () => {
    const signals = extractMemorySignals('上线了')
    const tags = buildExtractedTags(signals, [undefined, '', '  '])
    expect(tags).toContain('milestone')
    expect(tags).not.toContain('')
  })
})
