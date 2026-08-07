import { describe, expect, it, vi } from 'vitest'
import { createDefaultPet } from './default-pet'
import { addEventMemory, applyInteraction, tickPetState } from './pet-state'
import { learnFromUserMessage } from './pet-companion'
import { loadPet } from './pet-memory'
import { petPlatform } from '../platform/pet-platform'
import type { EventMemory, PetData } from '../types/pet'

const createHatchedPet = () => {
  const base = createDefaultPet()
  return {
    ...base,
    state: {
      ...base.state,
      stage: 'baby' as const,
      hatchedAt: new Date().toISOString()
    },
    ui: {
      ...base.ui,
      onboardingCompleted: true
    }
  }
}

describe('pet state and companion memory', () => {
  it('preserves valid imported Petdex species during load migration', async () => {
    const saved = createDefaultPet()
    const loadPetMock = vi.spyOn(petPlatform, 'loadPet').mockResolvedValue({
      ...saved,
      personality: {
        ...saved.personality,
        species: 'petdex:moon-cat'
      },
      memory: {
        ...saved.memory,
        profile: {
          ...saved.memory.profile,
          chosenSpecies: 'petdex:moon-cat'
        }
      }
    } as any)

    const loaded = await loadPet()

    expect(loaded.personality.species).toBe('petdex:moon-cat')
    expect(loaded.memory.profile.chosenSpecies).toBe('petdex:moon-cat')

    loadPetMock.mockRestore()
  })

  it('rejects invalid imported Petdex species during load migration', async () => {
    const saved = createDefaultPet()
    const loadPetMock = vi.spyOn(petPlatform, 'loadPet').mockResolvedValue({
      ...saved,
      personality: {
        ...saved.personality,
        species: 'petdex:../bad'
      },
      memory: {
        ...saved.memory,
        profile: {
          ...saved.memory.profile,
          chosenSpecies: 'petdex:https://example.com/cat'
        }
      }
    } as any)

    const loaded = await loadPet()

    expect(loaded.personality.species).toBe('puppy')
    expect(loaded.memory.profile.chosenSpecies).toBe('puppy')

    loadPetMock.mockRestore()
  })

  it('migrates legacy nostalgia onboarding saves to the brain step', async () => {
    const loadPetMock = vi.spyOn(petPlatform, 'loadPet').mockResolvedValue({
      ...createDefaultPet(),
      ui: {
        ...createDefaultPet().ui,
        onboarding: {
          currentStep: 'nostalgia',
          completedSteps: ['identity', 'appearance', 'nostalgia'],
          nostalgicUnlocked: true
        }
      },
      memory: {
        ...createDefaultPet().memory,
        profile: {
          ...createDefaultPet().memory.profile,
          nostalgicProfile: {
            enabled: true,
            legacyName: 'Q 宝'
          }
        }
      }
    } as any)

    const loaded = await loadPet()

    expect(loaded.ui.onboarding.currentStep).toBe('brain')
    expect(loaded.ui.onboarding.completedSteps).toEqual(['identity', 'appearance', 'brain'])
    expect('nostalgicUnlocked' in loaded.ui.onboarding).toBe(false)
    expect('nostalgicProfile' in loaded.memory.profile).toBe(false)

    loadPetMock.mockRestore()
  })

  it('applies expanded care interactions to visible state', () => {
    const base = createHatchedPet()
    const fed = applyInteraction(base, 'feed')
    const hydrated = applyInteraction(base, 'drink')
    const bathed = applyInteraction(base, 'bath')
    const held = applyInteraction(base, 'hold')

    expect(fed.state.hunger).toBeLessThan(base.state.hunger)
    expect(hydrated.state.health).toBeGreaterThan(base.state.health)
    expect(bathed.state.cleanliness).toBeGreaterThan(base.state.cleanliness)
    expect(held.state.loneliness).toBeLessThan(base.state.loneliness)
    expect(held.memory.bond.warmth).toBeGreaterThan(base.memory.bond.warmth)
  })

  it('nudges personality traits based on the interaction kind', () => {
    const base = createHatchedPet()
    const chatted = applyInteraction(base, 'chat')
    const fed = applyInteraction(base, 'feed')
    const cuddled = applyInteraction(base, 'hold')
    const bathed = applyInteraction(base, 'bath')

    expect(chatted.memory.traits.talkative).toBeGreaterThan(base.memory.traits.talkative)
    expect(fed.memory.traits.energy).toBeGreaterThan(base.memory.traits.energy)
    expect(cuddled.memory.traits.bond).toBeGreaterThan(base.memory.traits.bond)
    expect(bathed.memory.traits.routine).toBeGreaterThan(base.memory.traits.routine)
    // Trait deltas should be small per interaction so nothing pegs to 100 on
    // the first action -- this guards against an accidental order-of-magnitude
    // bump in `getTraitAdjustments`.
    expect(chatted.memory.traits.talkative - base.memory.traits.talkative).toBeLessThan(5)
  })

  it('learns explicit preferences and habits from conversation', () => {
    const base = createHatchedPet()
    const renamed = learnFromUserMessage(base, '以后叫我阿江', Date.now())
    const liked = learnFromUserMessage(renamed, '我喜欢热牛奶', Date.now())
    const disliked = learnFromUserMessage(liked, '我不喜欢太吵的提醒', Date.now())
    const focused = learnFromUserMessage(disliked, '我忙的时候轻一点', Date.now())
    const comforted = learnFromUserMessage(focused, '我压力大的时候聊聊散步', Date.now())
    const learned = learnFromUserMessage(comforted, '最近总在写代码', Date.now())

    expect(learned.memory.profile.preferredName).toBe('阿江')
    expect(learned.memory.profile.likes).toContain('热牛奶')
    expect(learned.memory.profile.dislikes.some((item) => item.includes('太吵'))).toBe(true)
    expect(learned.memory.profile.comfortTopics).toContain('散步')
    expect(learned.memory.profile.habits).toContain('写代码')
    expect(learned.memory.preferences.length).toBeGreaterThan(0)
  })

  it('keeps reconciled pet state unchanged when tick is paused in persisted data', async () => {
    const now = Date.now()
    const pet = {
      ...createHatchedPet(),
      state: {
        ...createHatchedPet().state,
        stage: 'baby' as const,
        hatchedAt: new Date(now - 5 * 86_400_000).toISOString(),
        lastInteractionAt: new Date(now - 3 * 60 * 60_000).toISOString(),
        hunger: 22,
        energy: 74,
        cleanliness: 81,
        health: 93,
        mood: 79,
        ageDays: 2
      },
      pauseTick: true
    }

    const loadPetMock = vi.spyOn(petPlatform, 'loadPet').mockResolvedValue(pet as never)

    const loaded = await loadPet()

    expect(loaded.state.hunger).toBe(22)
    expect(loaded.state.energy).toBe(74)
    expect(loaded.state.cleanliness).toBe(81)
    expect(loaded.state.health).toBe(93)
    expect(loaded.state.ageDays).toBe(2)
    expect(loaded.state.lastInteractionAt).toBe(pet.state.lastInteractionAt)

    loadPetMock.mockRestore()
  })

  it('advances lifecycle stages as age increases after hatching', () => {
    const now = Date.now()
    const hatched = {
      ...createHatchedPet(),
      state: {
        ...createHatchedPet().state,
        stage: 'baby' as const,
        hatchedAt: new Date(now - 16 * 86_400_000).toISOString(),
        lastInteractionAt: new Date(now - 120 * 60_000).toISOString(),
        ageDays: 0
      }
    }

    const progressed = tickPetState(hatched, now)
    expect(progressed.state.stage).toBe('adult')
    expect(progressed.state.ageDays).toBeGreaterThanOrEqual(16)
  })

  it('keeps importance-3 events when many low-importance events are added later', () => {
    const baseTime = Date.parse('2026-04-01T10:00:00.000Z')
    const makeEvent = (offset: number, importance: 1 | 2 | 3, summary: string): EventMemory => ({
      id: `${offset}-${importance}`,
      ts: new Date(baseTime + offset).toISOString(),
      type: 'chat',
      summary,
      petEmotion: 'calm',
      importance,
      sceneId: 'idle',
      tags: ['chat']
    })

    const milestone = makeEvent(0, 3, '妈妈住院了')
    let pet: PetData = {
      ...createDefaultPet(),
      memory: {
        ...createDefaultPet().memory,
        events: [milestone]
      }
    }

    // Push 60 importance-1 chatter events on top.
    for (let i = 1; i <= 60; i += 1) {
      pet = addEventMemory(pet, makeEvent(i * 60_000, 1, `日常聊天 ${i}`))
    }

    const ids = pet.memory.events.map((event) => event.id)
    expect(ids).toContain(milestone.id)
    // Eviction policy caps importance-1 events at 4 -- this is the trade-off
    // that keeps the milestone visible.
    const tier1Count = pet.memory.events.filter((event) => event.importance === 1).length
    expect(tier1Count).toBeLessThanOrEqual(4)
    // Total cap remains <= 40 so the prompt size stays bounded.
    expect(pet.memory.events.length).toBeLessThanOrEqual(40)
  })

  it('does not advance an unhatched egg stage', () => {
    const now = Date.now()
    const egg = {
      ...createDefaultPet(),
      state: {
        ...createDefaultPet().state,
        stage: 'egg' as const,
        ageDays: 0,
        hatchedAt: undefined,
        lastInteractionAt: new Date(now - 6 * 60 * 60_000).toISOString()
      }
    }

    const progressed = tickPetState(egg, now)
    expect(progressed.state.stage).toBe('egg')
    expect(progressed.state.ageDays).toBe(0)
    expect(progressed.state.hunger).toBeGreaterThan(egg.state.hunger)
  })
})
