import { describe, expect, it } from 'vitest'
import { extractFactCandidates } from './fact-extraction'

describe('extractFactCandidates', () => {
  it('extracts weight in kg / 公斤', () => {
    const a = extractFactCandidates('我今天 60 kg')
    expect(a[0]?.key).toBe('body.weight')
    expect(a[0]?.value).toBe(60)
    expect(a[0]?.unit).toBe('kg')

    const b = extractFactCandidates('我体重60公斤了')
    expect(b[0]?.value).toBe(60)
  })

  it('converts 斤 to kg', () => {
    const result = extractFactCandidates('称了下120斤')
    expect(result[0]?.key).toBe('body.weight')
    expect(result[0]?.value).toBe(60)
  })

  it('extracts sleep hours', () => {
    const result = extractFactCandidates('昨晚只睡了4个小时')
    expect(result[0]?.key).toBe('health.sleepHours')
    expect(result[0]?.value).toBe(4)
  })

  it('extracts spending only with explicit verb + currency', () => {
    expect(extractFactCandidates('今天花了 88 块').some((entry) => entry.key === 'expense.amount')).toBe(true)
    // Pure numbers in chat shouldn't trigger.
    expect(extractFactCandidates('我有 88 个朋友').some((entry) => entry.key === 'expense.amount')).toBe(false)
  })

  it('extracts mood score', () => {
    const result = extractFactCandidates('心情 6 分吧')
    expect(result[0]?.key).toBe('mood.score')
    expect(result[0]?.value).toBe(6)
  })

  it('extracts height in 米 with sane bounds', () => {
    const ok = extractFactCandidates('我身高 1.78 米')
    expect(ok[0]?.key).toBe('body.height')
    expect(ok[0]?.value).toBe(178)
    expect(ok[0]?.unit).toBe('cm')
    // 5米 should be rejected (well outside 0.4..2.5 m range).
    expect(extractFactCandidates('跑了 5米').some((entry) => entry.key === 'body.height')).toBe(false)
  })

  it('returns at most one match per key', () => {
    const result = extractFactCandidates('今天 60 公斤, 又 60kg')
    const weights = result.filter((entry) => entry.key === 'body.weight')
    expect(weights).toHaveLength(1)
  })

  it('returns empty for chitchat', () => {
    expect(extractFactCandidates('哈哈那挺好的')).toEqual([])
    expect(extractFactCandidates('')).toEqual([])
  })

  it('drops out-of-range numeric matches', () => {
    // 500kg weight is implausible, gets filtered by sanity bounds.
    expect(extractFactCandidates('500 kg').length).toBe(0)
  })
})
