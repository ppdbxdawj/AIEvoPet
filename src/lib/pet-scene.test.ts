import { describe, expect, it } from 'vitest'
import { createDefaultPet } from './default-pet'
import { resolvePetScene } from './pet-scene'

const createPet = () => {
  const base = createDefaultPet()
  return {
    ...base,
    state: {
      ...base.state,
      stage: 'baby' as const,
      hatchedAt: new Date(Date.now() - 2 * 86_400_000).toISOString()
    },
    ui: {
      ...base.ui,
      onboardingCompleted: true
    }
  }
}

describe('pet scene decider', () => {
  it('keeps medium active reminders as persistent active-reminder scenes', () => {
    const pet = createPet()
    const scene = resolvePetScene(pet, {
      reminderPhase: 'alert',
      activeReminderTitle: '喝水',
      activeReminderIntensity: 'medium',
      nearestReminderAt: new Date(Date.now() + 60_000).toISOString(),
      recentInteraction: null,
      now: Date.now()
    })

    expect(scene.id).toBe('reminder-alert')
    expect(scene.attentionMode).toBe('active-reminder')
    expect(scene.persistent).toBe(true)
    expect(scene.reason).toBe('active reminder is due')
  })

  it('keeps low reminders light and non-persistent', () => {
    const pet = createPet()
    const scene = resolvePetScene(pet, {
      reminderPhase: 'alert',
      activeReminderTitle: '喝水',
      activeReminderIntensity: 'low',
      nearestReminderAt: new Date(Date.now() + 60_000).toISOString(),
      recentInteraction: null,
      now: Date.now()
    })

    expect(scene.id).toBe('reminder-alert')
    expect(scene.attentionMode).toBe('light-nudge')
    expect(scene.persistent).toBe(false)
    expect(scene.reason).toBe('low-intensity reminder is due')
  })

  it('keeps high reminders persistent with high-intensity attention copy', () => {
    const pet = createPet()
    const scene = resolvePetScene(pet, {
      reminderPhase: 'alert',
      activeReminderTitle: '喝水',
      activeReminderIntensity: 'high',
      nearestReminderAt: new Date(Date.now() + 60_000).toISOString(),
      recentInteraction: null,
      now: Date.now()
    })

    expect(scene.id).toBe('reminder-alert')
    expect(scene.attentionMode).toBe('active-reminder')
    expect(scene.persistent).toBe(true)
    expect(scene.reason).toBe('high-intensity reminder is due')
  })

  it('uses do-not-disturb mode for quiet focus support', () => {
    const pet = createPet()
    pet.memory.companionPreferences.focusSupportStyle = 'quiet'
    pet.memory.profile.habits = ['写代码']
    pet.state.lastInteractionAt = new Date(Date.now() - 12 * 60_000).toISOString()

    const scene = resolvePetScene(pet, {
      reminderPhase: 'none',
      nearestReminderAt: null,
      recentInteraction: null,
      now: Date.now()
    })

    expect(scene.id).toBe('focus')
    expect(scene.attentionMode).toBe('do-not-disturb')
  })

  it('uses light nudges when the pet feels lonely', () => {
    const pet = createPet()
    pet.state.loneliness = 76
    pet.memory.companionPreferences.lowMoodSupportStyle = 'playful'

    const scene = resolvePetScene(pet, {
      reminderPhase: 'none',
      nearestReminderAt: null,
      recentInteraction: null,
      now: Date.now()
    })

    expect(scene.id).toBe('lonely')
    expect(scene.attentionMode).toBe('light-nudge')
  })

  it('uses do-not-disturb mode while vacation mode is enabled', () => {
    const pet = createPet()
    pet.ui.system.vacationMode = true
    pet.state.loneliness = 88
    pet.state.lastInteractionAt = new Date(Date.now() - 12 * 60_000).toISOString()

    const scene = resolvePetScene(pet, {
      reminderPhase: 'none',
      nearestReminderAt: null,
      recentInteraction: null,
      now: Date.now()
    })

    expect(scene.attentionMode).toBe('do-not-disturb')
    expect(scene.reason).toBe('vacation mode pauses proactive presence')
  })

  it('keeps the pet settled in nest mode', () => {
    const pet = createPet()
    pet.ui.system.nestModeEnabled = true

    const scene = resolvePetScene(pet, {
      reminderPhase: 'none',
      nearestReminderAt: null,
      recentInteraction: null,
      now: Date.now()
    })

    expect(scene.attentionMode).toBe('passive-visible')
    expect(scene.action).toBe('sleepy')
    expect(scene.reason).toBe('nest mode keeps pet visible but settled')
  })

  it('keeps the pet quiet in boss mode', () => {
    const pet = createPet()
    pet.ui.system.bossModeEnabled = true

    const scene = resolvePetScene(pet, {
      reminderPhase: 'none',
      nearestReminderAt: null,
      recentInteraction: null,
      now: Date.now()
    })

    expect(scene.id).toBe('focus')
    expect(scene.attentionMode).toBe('do-not-disturb')
    expect(scene.reason).toBe('boss mode suppresses visible interruptions')
  })
})
