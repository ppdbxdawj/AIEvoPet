import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createDefaultPet } from '../../lib/default-pet'
import type { PetConversationLoopPlan, PetGeneratedReply, PetSceneState } from '../../types/pet'

vi.mock('../../lib/pet-llm', () => ({
  generateConversationLoop: vi.fn(),
  generatePetReply: vi.fn()
}))

import { generateConversationLoop, generatePetReply } from '../../lib/pet-llm'
import { runPetAgentTurn } from './agent-loop'

const createScene = (): PetSceneState => ({
  id: 'idle',
  action: 'idle',
  text: '我先安静陪着你。',
  attentionMode: 'passive-visible'
})

describe('runPetAgentTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps conversation-loop steps into runtime tool calls', async () => {
    const pet = createDefaultPet()
    vi.mocked(generateConversationLoop).mockResolvedValueOnce({
      reply: {
        text: '好呀，我记住了。',
        action: 'talking'
      },
      steps: [
        { kind: 'memory-update', memoryUpdate: { kind: 'preferred-name', value: '阿江' } },
        { kind: 'create-reminder', reminder: { title: '喝水', scheduledAt: '2026-04-24T10:00:00.000Z' } },
        { kind: 'set-scene-hint', sceneId: 'focus' }
      ],
      source: 'model'
    } satisfies PetConversationLoopPlan)

    const result = await runPetAgentTurn({
      trigger: { kind: 'user-message', message: '以后叫我阿江，十分钟后提醒我喝水' },
      pet,
      scene: createScene(),
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null
    })

    expect(result.reply.text).toBe('好呀，我记住了。')
    expect(result.source).toBe('model')
    expect(result.sceneHint).toBe('focus')
    expect(result.toolCalls).toEqual([
      { name: 'memory.update', input: { kind: 'preferred-name', value: '阿江' } },
      { name: 'reminder.create', input: { title: '喝水', scheduledAt: '2026-04-24T10:00:00.000Z' } },
      { name: 'scene.hint', input: { sceneId: 'focus' } }
    ])
  })

  it('adds deterministic reminder fallback when model returns no tool call', async () => {
    const pet = createDefaultPet()
    vi.mocked(generateConversationLoop).mockResolvedValueOnce({
      reply: {
        text: '我会帮你记着。',
        action: 'talking'
      },
      steps: [],
      source: 'fallback'
    } satisfies PetConversationLoopPlan)

    const result = await runPetAgentTurn({
      trigger: { kind: 'user-message', message: '10分钟后提醒我喝水' },
      pet,
      scene: createScene(),
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null
    })

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]).toMatchObject({
      name: 'reminder.create',
      input: { title: '喝水' }
    })
  })

  it('passes interaction triggers through scene dialogue path', async () => {
    const pet = createDefaultPet()
    vi.mocked(generatePetReply).mockResolvedValueOnce({
      text: '我被你摸得有点得意。',
      action: 'happy',
      source: 'model'
    } satisfies PetGeneratedReply)

    const result = await runPetAgentTurn({
      trigger: { kind: 'interaction', interactionType: 'pet', userInput: '摸摸' },
      pet,
      scene: createScene(),
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null
    })

    expect(result.reply).toMatchObject({
      text: '我被你摸得有点得意。',
      action: 'happy'
    })
    expect(result.toolCalls).toEqual([])
    expect(vi.mocked(generatePetReply)).toHaveBeenCalledTimes(1)
  })

  it('passes reminder-due triggers through scene dialogue path', async () => {
    const pet = createDefaultPet()
    vi.mocked(generatePetReply).mockResolvedValueOnce({
      text: '到喝水时间啦，我来认真提醒你。',
      action: 'alert',
      source: 'model'
    } satisfies PetGeneratedReply)

    const result = await runPetAgentTurn({
      trigger: { kind: 'reminder-due' },
      pet,
      scene: {
        ...createScene(),
        id: 'reminder-alert',
        action: 'alert'
      },
      reminderPhase: 'alert',
      recentInteraction: null,
      activeReminderTitle: '喝水',
      nearestReminderAt: null
    })

    expect(result.reply).toMatchObject({
      text: '到喝水时间啦，我来认真提醒你。',
      action: 'alert'
    })
    expect(result.toolCalls).toEqual([])
  })

  it('passes scene-refresh triggers through scene dialogue path', async () => {
    const pet = createDefaultPet()
    vi.mocked(generatePetReply).mockResolvedValueOnce({
      text: '我先轻轻陪着你，不打断。',
      action: 'idle',
      source: 'model'
    } satisfies PetGeneratedReply)

    const result = await runPetAgentTurn({
      trigger: { kind: 'scene-refresh' },
      pet,
      scene: createScene(),
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null
    })

    expect(result.reply).toMatchObject({
      text: '我先轻轻陪着你，不打断。',
      action: 'idle'
    })
    expect(result.toolCalls).toEqual([])
  })
})
