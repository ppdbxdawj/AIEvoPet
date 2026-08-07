import { describe, expect, it } from 'vitest'
import { createDefaultPet } from '../../lib/default-pet'
import type { PetRecentInteraction } from '../../types/pet'
import { applySceneHint, buildPetSceneContext, resolveRuntimePetAction, resolveRuntimePetScene } from './scene-context'

describe('scene-context helpers', () => {
  it('builds scene context with explicit overrides', () => {
    const recentInteraction: PetRecentInteraction = {
      type: 'pet',
      at: Date.now(),
      streak: 2
    }

    expect(buildPetSceneContext({
      reminderPhase: 'soon',
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z',
      recentInteraction,
      now: 123
    })).toEqual({
      reminderPhase: 'soon',
      activeReminderTitle: '喝水',
      nearestReminderAt: '2026-04-24T10:00:00.000Z',
      recentInteraction,
      now: 123
    })
  })

  it('resolves runtime scenes through the shared scene decider', () => {
    const pet = createDefaultPet()
    pet.state.loneliness = 80

    const scene = resolveRuntimePetScene(pet, {
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null,
      now: Date.now()
    })

    expect(scene.id).toBe('lonely')
  })

  it('resolves sleeping pets to sleepy actions without re-reading scene state in the app shell', () => {
    const pet = createDefaultPet()
    pet.state.isSleeping = true

    const action = resolveRuntimePetAction(pet, {
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null,
      now: Date.now()
    })

    expect(action).toBe('sleepy')
  })

  it('applies scene hints while preserving persistent reminder scenes', () => {
    const pet = createDefaultPet()

    const scene = applySceneHint(pet, 'reminder-alert', {
      reminderPhase: 'none',
      recentInteraction: null,
      nearestReminderAt: null,
      now: Date.now()
    })

    expect(scene.id).toBe('reminder-alert')
    expect(scene.persistent).toBe(true)
  })
})
