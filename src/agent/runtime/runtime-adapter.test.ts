import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultPet } from '../../lib/default-pet'
import type { PetAgentTurnResult } from './agent-types'

vi.mock('../../lib/pet-intent', () => ({
  parsePetIntent: vi.fn()
}))

vi.mock('../../lib/pet-state', () => ({
  addEventMemory: vi.fn((pet) => ({
    ...pet,
    memory: {
      ...pet.memory,
      working: {
        ...pet.memory.working,
        lastUserMessage: 'memory-hint-applied'
      }
    }
  }))
}))

vi.mock('./agent-loop', () => ({
  runPetAgentTurn: vi.fn()
}))

vi.mock('./runtime-flow', () => ({
  preparePetSceneTurn: vi.fn(),
  preparePetConversationTurn: vi.fn()
}))

vi.mock('./tool-executor', () => ({
  executePetAgentToolCalls: vi.fn()
}))

import { parsePetIntent } from '../../lib/pet-intent'
import { addEventMemory } from '../../lib/pet-state'
import { runPetAgentTurn } from './agent-loop'
import { executePetAgentToolCalls } from './tool-executor'
import { preparePetConversationTurn, preparePetSceneTurn } from './runtime-flow'
import { runPetConversationTurn, runPreparedPetConversationTurn, runPreparedPetSceneTurn, runPetSceneTurn } from './runtime-adapter'

const createScene = () => ({
  id: 'idle' as const,
  action: 'idle' as const,
  text: '我先安静陪着你。',
  attentionMode: 'passive-visible' as const,
  persistent: true
})

const turnResult: PetAgentTurnResult = {
  reply: { text: '好呀。', action: 'talking' },
  toolCalls: [],
  source: 'model',
  sceneHint: 'idle'
}

describe('runtime-adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(runPetAgentTurn).mockResolvedValue(turnResult)
    vi.mocked(preparePetSceneTurn).mockReturnValue({
      scene: createScene(),
      at: 123
    })
    vi.mocked(preparePetConversationTurn).mockImplementation(({ current, message }) => ({
      pet: {
        ...current,
        memory: {
          ...current.memory,
          working: {
            ...current.memory.working,
            lastUserMessage: message
          }
        }
      },
      scene: createScene(),
      fallback: { text: '兜底回复', action: 'talking' },
      at: 456
    }))
    vi.mocked(executePetAgentToolCalls).mockImplementation(async ({ current }) => ({
      next: current,
      reminderCreated: false,
      interactionRan: false,
      interactionRefusal: undefined,
      sceneHint: 'idle',
      settingsNotes: [],
      factsRecorded: []
    }))
    vi.mocked(parsePetIntent).mockReturnValue({ kind: 'chat' })
  })

  it('builds a user-message runtime request for conversation turns', async () => {
    const pet = createDefaultPet()
    await runPetConversationTurn({
      pet,
      scene: createScene(),
      reminderPhase: 'none',
      recentInteraction: null,
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z'
    }, '以后叫我阿江')

    expect(runPetAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      trigger: { kind: 'user-message', message: '以后叫我阿江' },
      pet,
      reminderPhase: 'none',
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z'
    }))
  })

  it('returns care-refusal without calling the agent turn when chat maps to a blocked interaction', async () => {
    const pet = createDefaultPet()
    pet.state.hunger = 10
    vi.mocked(parsePetIntent).mockReturnValue({
      kind: 'interaction',
      interaction: 'feed'
    })

    const result = await runPreparedPetConversationTurn({
      current: pet,
      message: '喂我一口',
      reminderPhase: 'none',
      recentInteraction: null,
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z'
    }, {
      applyMemoryUpdate: (current) => current,
      createReminder: vi.fn(),
      runInteraction: vi.fn(async (current) => current)
    })

    expect(runPetAgentTurn).not.toHaveBeenCalled()
    expect(preparePetConversationTurn).not.toHaveBeenCalled()
    expect(executePetAgentToolCalls).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      kind: 'care-refusal',
      interaction: 'feed',
      refusalKey: 'interaction.refuse.feed.full'
    })
  })

  it('merges interaction.run refusal into reply text and records refusal memory', async () => {
    const pet = createDefaultPet()
    pet.state.hunger = 10
    vi.mocked(runPetAgentTurn).mockResolvedValue({
      ...turnResult,
      reply: { text: '好的，吃吃吃。', action: 'happy' },
      source: 'model'
    })
    vi.mocked(executePetAgentToolCalls).mockImplementation(async ({ current }) => ({
      next: current,
      reminderCreated: false,
      interactionRan: true,
      interactionRefusal: {
        interaction: 'feed',
        refusalKey: 'interaction.refuse.feed.full'
      },
      sceneHint: 'idle',
      settingsNotes: [],
      factsRecorded: []
    }))

    const result = await runPreparedPetConversationTurn({
      current: pet,
      message: '给我吃点零食',
      reminderPhase: 'none',
      recentInteraction: null,
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z'
    }, {
      applyMemoryUpdate: (current) => current,
      createReminder: vi.fn(),
      runInteraction: vi.fn(async (current) => current)
    })

    expect(result.kind).toBe('reply')
    if (result.kind !== 'reply') throw new Error('expected reply')
    expect(result.reply.text).toBe('我不饿。')
    expect(result.reply.action).toBe('alert')
    expect(result.reply.memoryHint).toBe('interaction.run refused: interaction.refuse.feed.full')
    expect(addEventMemory).toHaveBeenCalled()
  })

  it('builds reply results for prepared conversation turns', async () => {
    const pet = createDefaultPet()
    const applyMemoryUpdate = vi.fn((current) => current)
    const createReminder = vi.fn()
    const runInteraction = vi.fn(async (current) => current)

    const result = await runPreparedPetConversationTurn({
      current: pet,
      message: '以后叫我阿江',
      reminderPhase: 'none',
      recentInteraction: null,
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z'
    }, {
      applyMemoryUpdate,
      createReminder,
      runInteraction
    })

    expect(preparePetConversationTurn).toHaveBeenCalledWith({
      current: pet,
      message: '以后叫我阿江',
      reminderPhase: 'none',
      recentInteraction: null,
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z'
    })
    expect(executePetAgentToolCalls).toHaveBeenCalledWith({
      current: expect.objectContaining({
        memory: expect.objectContaining({
          working: expect.objectContaining({
            lastUserMessage: '以后叫我阿江'
          })
        })
      }),
      toolCalls: [],
      userMessage: '以后叫我阿江',
      applyMemoryUpdate,
      createReminder,
      runInteraction
    })
    expect(result).toEqual({
      kind: 'reply',
      next: expect.objectContaining({
        memory: expect.objectContaining({
          working: expect.objectContaining({
            lastUserMessage: '以后叫我阿江'
          })
        })
      }),
      reply: turnResult.reply,
      sceneHint: 'idle',
      shouldScheduleIdle: true,
      turn: turnResult
    })
    expect(addEventMemory).not.toHaveBeenCalled()
    expect(parsePetIntent).toHaveBeenCalledWith('以后叫我阿江')
  })

  it('applies memory hint events before returning reply results', async () => {
    const pet = createDefaultPet()
    vi.mocked(runPetAgentTurn).mockResolvedValue({
      ...turnResult,
      reply: {
        text: '记住这件事。',
        action: 'talking',
        memoryHint: '用户喜欢热牛奶'
      }
    })

    const result = await runPreparedPetConversationTurn({
      current: pet,
      message: '记住我喜欢热牛奶',
      reminderPhase: 'none',
      recentInteraction: null
    }, {
      applyMemoryUpdate: (current) => current,
      createReminder: vi.fn(),
      runInteraction: vi.fn(async (current) => current)
    })

    expect(addEventMemory).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      kind: 'reply',
      next: {
        memory: {
          working: {
            lastUserMessage: 'memory-hint-applied'
          }
        }
      }
    })
  })

  it('returns deterministic interaction fallbacks from prepared conversation turns', async () => {
    const pet = createDefaultPet()
    vi.mocked(runPetAgentTurn).mockResolvedValue({
      ...turnResult,
      source: 'fallback'
    })
    vi.mocked(parsePetIntent).mockReturnValue({
      kind: 'interaction',
      interaction: 'pet'
    })

    const result = await runPreparedPetConversationTurn({
      current: pet,
      message: '摸摸',
      reminderPhase: 'none',
      recentInteraction: null
    }, {
      applyMemoryUpdate: (current) => current,
      createReminder: vi.fn(),
      runInteraction: vi.fn(async (current) => current)
    })

    expect(parsePetIntent).toHaveBeenCalledWith('摸摸')
    expect(result).toEqual({
      kind: 'interaction',
      interaction: 'pet',
      turn: expect.objectContaining({ source: 'fallback' })
    })
  })

  it('returns deterministic reminder fallbacks from prepared conversation turns', async () => {
    const pet = createDefaultPet()
    vi.mocked(runPetAgentTurn).mockResolvedValue({
      ...turnResult,
      source: 'fallback'
    })
    const reminder = {
      title: '喝水',
      scheduledAt: '2026-04-24T10:00:00.000Z'
    }
    vi.mocked(parsePetIntent).mockReturnValue({
      kind: 'reminder',
      reminder
    })

    const result = await runPreparedPetConversationTurn({
      current: pet,
      message: '十分钟后提醒我喝水',
      reminderPhase: 'none',
      recentInteraction: null
    }, {
      applyMemoryUpdate: (current) => current,
      createReminder: vi.fn(),
      runInteraction: vi.fn(async (current) => current)
    })

    expect(result).toEqual({
      kind: 'reminder',
      reminder,
      turn: expect.objectContaining({ source: 'fallback' })
    })
  })

  it('builds scene-refresh requests for non-interaction scene turns', async () => {
    const pet = createDefaultPet()
    await runPetSceneTurn({
      pet,
      scene: createScene(),
      reminderPhase: 'none',
      recentInteraction: null
    }, 'scene-refresh')

    expect(runPetAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      trigger: { kind: 'scene-refresh' },
      pet,
      reminderPhase: 'none'
    }))
  })

  it('builds interaction requests when scene turns include an interaction type', async () => {
    const pet = createDefaultPet()
    await runPetSceneTurn({
      pet,
      scene: createScene(),
      reminderPhase: 'none',
      recentInteraction: null
    }, 'scene-refresh', {
      interactionType: 'pet',
      userInput: '摸摸'
    })

    expect(runPetAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      trigger: {
        kind: 'interaction',
        interactionType: 'pet',
        userInput: '摸摸'
      },
      pet,
      reminderPhase: 'none'
    }))
  })

  it('prepares and runs scene turns through the shared scene controller', async () => {
    const pet = createDefaultPet()

    const result = await runPreparedPetSceneTurn({
      pet,
      reminderPhase: 'soon',
      recentInteraction: null,
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z'
    }, 'reminder-due')

    expect(preparePetSceneTurn).toHaveBeenCalledWith({
      pet,
      reminderPhase: 'soon',
      recentInteraction: null,
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z',
      sceneHint: undefined
    })
    expect(runPetAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      trigger: { kind: 'reminder-due' },
      pet,
      scene: createScene(),
      reminderPhase: 'soon'
    }))
    expect(result).toEqual({
      scene: createScene(),
      turn: turnResult,
      persistent: true
    })
  })
})
