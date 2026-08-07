import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultPet } from './default-pet'
import { consolidateWeeklyMemory, isWeeklyConsolidationDue, tryProactiveFactRecall } from './pet-companion'
import { addFactRecord } from './pet-facts'
import type { EventMemory, PetData, PetSceneState } from '../types/pet'

vi.mock('./pet-llm', async () => {
  const actual = await vi.importActual<typeof import('./pet-llm')>('./pet-llm')
  return {
    ...actual,
    generateCompanionSummary: vi.fn(async () => '这一周你提了三次发版，节奏偏紧但有起色。')
  }
})

const generatePetDialogueMock = vi.fn(async () => ({
  text: '欸你最近都没说体重了，是不是不敢称（笑）',
  action: 'talking' as const,
  source: 'model' as const
}))

vi.mock('./pet-dialogue', () => ({
  generatePetDialogue: (...args: unknown[]) => generatePetDialogueMock(...args as Parameters<typeof generatePetDialogueMock>)
}))

const seedDailyEntries = (pet: PetData, count: number, now: number): PetData => ({
  ...pet,
  memory: {
    ...pet.memory,
    daily: Array.from({ length: count }, (_, index) => ({
      date: new Date(now - index * 86_400_000).toISOString().slice(0, 10),
      interactionCount: 6,
      reminderCompleted: 1,
      reminderSnoozed: 0,
      focusMinutes: 30,
      dominantMood: 'warm' as const,
      summary: `第 ${index + 1} 天的日记`
    }))
  }
})

const seedEvents = (pet: PetData, now: number): PetData => {
  const events: EventMemory[] = [
    {
      id: 'milestone-1',
      ts: new Date(now - 2 * 86_400_000).toISOString(),
      type: 'chat',
      summary: '上线了新版本',
      petEmotion: 'excited',
      importance: 3,
      sceneId: 'idle',
      tags: ['milestone'],
      category: 'milestone'
    },
    {
      id: 'mood-1',
      ts: new Date(now - 1 * 86_400_000).toISOString(),
      type: 'chat',
      summary: '今天好累',
      petEmotion: 'lonely',
      importance: 2,
      sceneId: 'idle',
      tags: ['mood'],
      category: 'mood'
    }
  ]
  return {
    ...pet,
    memory: {
      ...pet.memory,
      events
    }
  }
}

describe('weekly memory consolidation', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('refuses to consolidate before three daily entries on first run', () => {
    const pet = createDefaultPet()
    expect(isWeeklyConsolidationDue(pet)).toBe(false)
  })

  it('reports due once 3+ daily entries exist', () => {
    const now = Date.parse('2026-04-29T10:00:00.000Z')
    const pet = seedDailyEntries(createDefaultPet(), 4, now)
    expect(isWeeklyConsolidationDue(pet, now)).toBe(true)
  })

  it('skips with too-soon when within the 7 day window', () => {
    const now = Date.parse('2026-04-29T10:00:00.000Z')
    const pet: PetData = {
      ...seedDailyEntries(createDefaultPet(), 4, now),
      memory: {
        ...seedDailyEntries(createDefaultPet(), 4, now).memory,
        relationship: {
          ...createDefaultPet().memory.relationship,
          weeklyConsolidationAt: new Date(now - 86_400_000).toISOString()
        }
      }
    }
    expect(isWeeklyConsolidationDue(pet, now)).toBe(false)
  })

  it('writes summary + timestamp when forced and data is present', async () => {
    const now = Date.parse('2026-04-29T10:00:00.000Z')
    const pet = seedEvents(seedDailyEntries(createDefaultPet(), 5, now), now)

    const result = await consolidateWeeklyMemory(pet, { force: true, now })

    expect(result.refreshed).toBe(true)
    expect(result.pet.memory.relationship.weeklySummary).toBe('这一周你提了三次发版，节奏偏紧但有起色。')
    expect(result.pet.memory.relationship.weeklyConsolidationAt).toBe(new Date(now).toISOString())
  })

  it('returns no-data when there is nothing in the week', async () => {
    // Far-future "now" makes the default pet's seed event fall outside the
    // 7-day window, so we simulate a fresh start with no recent activity.
    const now = Date.parse('2030-04-29T10:00:00.000Z')
    const base = createDefaultPet()
    const pet: PetData = {
      ...base,
      memory: {
        ...base.memory,
        daily: []
      }
    }
    const result = await consolidateWeeklyMemory(pet, { force: true, now })
    expect(result.refreshed).toBe(false)
    expect(result.skippedReason).toBe('no-data')
  })
})

describe('tryProactiveFactRecall', () => {
  const baseScene: PetSceneState = {
    id: 'idle',
    text: '',
    action: 'idle',
    attentionMode: 'passive-visible',
    persistent: false
  }

  afterEach(() => {
    generatePetDialogueMock.mockClear()
  })

  it('skips silently when no fact is stale', async () => {
    const result = await tryProactiveFactRecall({
      pet: createDefaultPet(),
      scene: baseScene,
      reminderPhase: 'none',
      now: Date.parse('2026-04-29T10:00:00Z')
    })
    expect(result.bubble).toBeUndefined()
    expect(result.skippedReason).toBe('no-stale-fact')
    expect(generatePetDialogueMock).not.toHaveBeenCalled()
  })

  it('produces a bubble + stamps lastProactiveRecallAt when a fact is stale', async () => {
    const seedTime = Date.parse('2026-04-01T10:00:00Z')
    const now = Date.parse('2026-04-29T10:00:00Z')
    const seeded = addFactRecord(createDefaultPet(), { key: 'body.weight', value: 60, unit: 'kg' }, 'user-said', { now: seedTime }).pet

    const result = await tryProactiveFactRecall({
      pet: seeded,
      scene: baseScene,
      reminderPhase: 'none',
      now
    })

    expect(generatePetDialogueMock).toHaveBeenCalledTimes(1)
    expect(result.bubble).toContain('体重')
    expect(result.recalledKey).toBe('body.weight')
    expect(result.pet.memory.facts.lastProactiveRecallAt).toBe(new Date(now).toISOString())
  })

  it('honours the cooldown window', async () => {
    const seedTime = Date.parse('2026-04-01T10:00:00Z')
    const now = Date.parse('2026-04-29T10:00:00Z')
    const recall = new Date(now - 60 * 60 * 1000).toISOString()
    const seeded = addFactRecord(createDefaultPet(), { key: 'body.weight', value: 60, unit: 'kg' }, 'user-said', { now: seedTime }).pet
    const withCooldown: PetData = {
      ...seeded,
      memory: {
        ...seeded.memory,
        facts: {
          ...seeded.memory.facts,
          lastProactiveRecallAt: recall
        }
      }
    }

    const result = await tryProactiveFactRecall({
      pet: withCooldown,
      scene: baseScene,
      reminderPhase: 'none',
      now
    })

    expect(result.skippedReason).toBe('cooldown')
    expect(generatePetDialogueMock).not.toHaveBeenCalled()
  })
})
