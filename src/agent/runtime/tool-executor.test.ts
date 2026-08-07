import { describe, expect, it, vi } from 'vitest'
import { createDefaultPet } from '../../lib/default-pet'
import type { PetMemoryUpdate } from '../../types/pet'
import { executePetAgentToolCalls } from './tool-executor'

describe('executePetAgentToolCalls', () => {
  it('applies memory updates and scene hints before running interaction tools', async () => {
    const pet = createDefaultPet()
    const applyMemoryUpdate = vi.fn((current, input: PetMemoryUpdate) => ({
      ...current,
      memory: {
        ...current.memory,
        profile: {
          ...current.memory.profile,
          preferredName: input.value
        }
      }
    }))
    const createReminder = vi.fn()
    const runInteraction = vi.fn(async (current, interaction, userMessage, sceneHint) => ({
      ...current,
      state: {
        ...current.state,
        affection: current.state.affection + (interaction === 'pet' ? 1 : 0)
      },
      ui: {
        ...current.ui,
        position: sceneHint === 'focus' && userMessage ? { x: 1, y: 2 } : current.ui.position
      }
    }))

    const result = await executePetAgentToolCalls({
      current: pet,
      toolCalls: [
        { name: 'memory.update', input: { kind: 'preferred-name', value: '阿江' } },
        { name: 'scene.hint', input: { sceneId: 'focus' } },
        { name: 'interaction.run', input: { interaction: 'pet' } }
      ],
      userMessage: '摸摸我',
      applyMemoryUpdate,
      createReminder,
      runInteraction
    })

    expect(applyMemoryUpdate).toHaveBeenCalledTimes(1)
    expect(createReminder).not.toHaveBeenCalled()
    expect(runInteraction).toHaveBeenCalledWith(expect.any(Object), 'pet', '摸摸我', 'focus')
    expect(result.sceneHint).toBe('focus')
    expect(result.interactionRan).toBe(true)
    expect(result.next.memory.profile.preferredName).toBe('阿江')
  })

  it('creates at most one reminder even if multiple reminder tools exist', async () => {
    const pet = createDefaultPet()
    const applyMemoryUpdate = vi.fn((current) => current)
    const createReminder = vi.fn(async () => {})
    const runInteraction = vi.fn(async (current) => current)

    const result = await executePetAgentToolCalls({
      current: pet,
      toolCalls: [
        { name: 'reminder.create', input: { title: '喝水', scheduledAt: '2026-04-24T10:00:00.000Z' } },
        { name: 'reminder.create', input: { title: '开会', scheduledAt: '2026-04-24T11:00:00.000Z' } }
      ],
      userMessage: '提醒我',
      applyMemoryUpdate,
      createReminder,
      runInteraction
    })

    expect(createReminder).toHaveBeenCalledTimes(1)
    expect(result.reminderCreated).toBe(true)
    expect(result.interactionRan).toBe(false)
  })

  it('runs settings.update through the supplied applier and forwards the confirmation note', async () => {
    const pet = createDefaultPet()
    const applyMemoryUpdate = vi.fn((current) => current)
    const applySettingsUpdate = vi.fn((current, input) => ({
      pet: {
        ...current,
        memory: {
          ...current.memory,
          profile: { ...current.memory.profile, selectedPalette: input.value }
        }
      },
      applied: true,
      description: `已经把面板换成${input.value}啦~`
    }))
    const createReminder = vi.fn(async () => {})
    const runInteraction = vi.fn(async (current) => current)

    const result = await executePetAgentToolCalls({
      current: pet,
      toolCalls: [
        { name: 'settings.update', input: { target: 'palette', value: 'blueberry-milk' } }
      ],
      userMessage: '换成蓝色',
      applyMemoryUpdate,
      applySettingsUpdate,
      createReminder,
      runInteraction
    })

    expect(applySettingsUpdate).toHaveBeenCalledTimes(1)
    expect(result.next.memory.profile.selectedPalette).toBe('blueberry-milk')
    expect(result.settingsNotes).toEqual(['已经把面板换成blueberry-milk啦~'])
  })

  it('skips settings.update silently when no applier is provided', async () => {
    const pet = createDefaultPet()
    const applyMemoryUpdate = vi.fn((current) => current)
    const createReminder = vi.fn(async () => {})
    const runInteraction = vi.fn(async (current) => current)

    const result = await executePetAgentToolCalls({
      current: pet,
      toolCalls: [
        { name: 'settings.update', input: { target: 'palette', value: 'blueberry-milk' } }
      ],
      userMessage: '换成蓝色',
      applyMemoryUpdate,
      createReminder,
      runInteraction
    })

    expect(result.next).toBe(pet)
    expect(result.settingsNotes).toEqual([])
  })

  it('does not push a confirmation note when the settings update is rejected', async () => {
    const pet = createDefaultPet()
    const applyMemoryUpdate = vi.fn((current) => current)
    const applySettingsUpdate = vi.fn((current) => ({
      pet: current,
      applied: false,
      description: '没听明白要开还是关，先没动安静陪伴。'
    }))
    const createReminder = vi.fn(async () => {})
    const runInteraction = vi.fn(async (current) => current)

    const result = await executePetAgentToolCalls({
      current: pet,
      toolCalls: [
        { name: 'settings.update', input: { target: 'vacation-mode', value: '什么' } }
      ],
      userMessage: '安静',
      applyMemoryUpdate,
      applySettingsUpdate,
      createReminder,
      runInteraction
    })

    expect(result.settingsNotes).toEqual([])
  })

  it('refuses interaction.run when care guards block without calling runInteraction', async () => {
    const pet = createDefaultPet()
    pet.state.hunger = 10
    const runInteraction = vi.fn(async (current) => current)

    const result = await executePetAgentToolCalls({
      current: pet,
      toolCalls: [{ name: 'interaction.run', input: { interaction: 'feed' } }],
      userMessage: '吃吃',
      applyMemoryUpdate: vi.fn((current) => current),
      createReminder: vi.fn(),
      runInteraction
    })

    expect(runInteraction).not.toHaveBeenCalled()
    expect(result.interactionRan).toBe(true)
    expect(result.interactionRefusal).toEqual({
      interaction: 'feed',
      refusalKey: 'interaction.refuse.feed.full'
    })
    expect(result.next).toBe(pet)
  })

  it('stops processing after a handler throws', async () => {
    const pet = createDefaultPet()
    const applyMemoryUpdate = vi.fn(() => {
      throw new Error('boom')
    })
    const createReminder = vi.fn(async () => {})
    const runInteraction = vi.fn(async (current) => current)

    const result = await executePetAgentToolCalls({
      current: pet,
      toolCalls: [
        { name: 'memory.update', input: { kind: 'preferred-name', value: '阿江' } },
        { name: 'interaction.run', input: { interaction: 'pet' } }
      ],
      userMessage: '摸摸我',
      applyMemoryUpdate,
      createReminder,
      runInteraction
    })

    expect(createReminder).not.toHaveBeenCalled()
    expect(runInteraction).not.toHaveBeenCalled()
    expect(result.next).toBe(pet)
    expect(result.interactionRan).toBe(false)
  })
})
