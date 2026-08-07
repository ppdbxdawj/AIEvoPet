import { describe, expect, it } from 'vitest'
import { createDefaultPet } from '../../lib/default-pet'
import { createConversationFallback, preparePetConversationTurn, preparePetInteractionState, preparePetSceneTurn, resolveRuntimeSceneWithHint } from './runtime-flow'

describe('runtime-flow helpers', () => {
  it('prepares interaction state with learned input and recent interaction metadata', () => {
    const pet = createDefaultPet()

    const result = preparePetInteractionState({
      current: pet,
      type: 'pet',
      userInput: '我喜欢热牛奶',
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null,
      now: 123
    })

    expect(result.at).toBe(123)
    expect(result.recentInteraction).toEqual({
      type: 'pet',
      at: 123,
      streak: 1
    })
    expect(result.pet.memory.working.lastUserMessage).toBe('我喜欢热牛奶')
    expect(result.scene.id).toBeTruthy()
  })

  it('uses explicit scene hints when preparing interaction state', () => {
    const pet = createDefaultPet()

    const result = preparePetInteractionState({
      current: pet,
      type: 'feed',
      userInput: '给你零食',
      sceneHint: 'focus',
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null,
      now: 456
    })

    expect(result.scene.id).toBe('focus')
  })

  it('prepares scene turns from shared runtime scene inputs', () => {
    const pet = createDefaultPet()
    pet.state.loneliness = 80

    const result = preparePetSceneTurn({
      pet,
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null,
      now: 321
    })

    expect(result.at).toBe(321)
    expect(result.scene.id).toBe('lonely')
  })

  it('prepares conversation turns from a learned pet snapshot and base scene', () => {
    const pet = createDefaultPet()

    const result = preparePetConversationTurn({
      current: pet,
      message: '以后叫我阿江',
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null,
      now: 789
    })

    expect(result.at).toBe(789)
    expect(result.pet.memory.working.lastUserMessage).toBe('以后叫我阿江')
    expect(result.scene.id).toBeTruthy()
    expect(result.fallback.action).toBe('talking')
  })

  it('builds longer-message fallback copy for conversation flow', () => {
    expect(createConversationFallback('这是一个很长很长的输入消息，用来验证兜底文案')).toEqual({
      text: '我听明白你在说这个了。你要是愿意，我陪你顺着往下聊。',
      action: 'talking'
    })
  })

  it('resolves presentation scenes from optional hints', () => {
    const pet = createDefaultPet()
    const hinted = resolveRuntimeSceneWithHint(pet, 'reminder-alert', {
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null,
      now: 999
    })

    expect(hinted.id).toBe('reminder-alert')
    expect(hinted.persistent).toBe(true)
  })
})
