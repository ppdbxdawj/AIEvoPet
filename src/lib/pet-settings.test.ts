import { describe, expect, it } from 'vitest'
import { createDefaultPet } from './default-pet'
import { applyPetSettingsUpdate } from './pet-settings'

const baseHatchedPet = () => {
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
      onboardingCompleted: true,
      // Two real manifest items so the wardrobe-equip / wardrobe-block
      // assertions below have something the manifest actually knows.
      wardrobeUnlocked: ['hat-bucket-hat', 'neck-red-ribbon']
    }
  }
}

describe('applyPetSettingsUpdate', () => {
  it('switches the palette by canonical id', () => {
    const pet = baseHatchedPet()
    const outcome = applyPetSettingsUpdate(pet, { target: 'palette', value: 'blueberry-milk' })
    expect(outcome.applied).toBe(true)
    expect(outcome.pet.memory.profile.selectedPalette).toBe('blueberry-milk')
  })

  it('switches the palette by Chinese label so the LLM can echo "蓝莓奶"', () => {
    const pet = baseHatchedPet()
    const outcome = applyPetSettingsUpdate(pet, { target: 'palette', value: '蓝莓奶' })
    expect(outcome.applied).toBe(true)
    expect(outcome.pet.memory.profile.selectedPalette).toBe('blueberry-milk')
  })

  it('rejects unknown palette ids without mutating state', () => {
    const pet = baseHatchedPet()
    const outcome = applyPetSettingsUpdate(pet, { target: 'palette', value: 'rainbow-glitter' })
    expect(outcome.applied).toBe(false)
    expect(outcome.pet).toBe(pet)
  })

  it('only equips wardrobe items the pet has unlocked', () => {
    const pet = baseHatchedPet()
    const ok = applyPetSettingsUpdate(pet, { target: 'wardrobe', value: 'hat-bucket-hat' })
    expect(ok.applied).toBe(true)
    expect(ok.pet.ui.wardrobeSelection).toBe('hat-bucket-hat')

    const blocked = applyPetSettingsUpdate(pet, { target: 'wardrobe', value: 'crown-of-thorns' })
    expect(blocked.applied).toBe(false)
    expect(blocked.pet).toBe(pet)
  })

  it('treats empty/none/off as "take outfit off"', () => {
    const pet = { ...baseHatchedPet(), ui: { ...baseHatchedPet().ui, wardrobeSelection: 'hat-bucket-hat' } }
    const outcome = applyPetSettingsUpdate(pet, { target: 'wardrobe', value: 'none' })
    expect(outcome.applied).toBe(true)
    expect(outcome.pet.ui.wardrobeSelection).toBeUndefined()
  })

  it('renames the pet on both personality and profile when onboarding is done', () => {
    const pet = baseHatchedPet()
    const outcome = applyPetSettingsUpdate(pet, { target: 'pet-name', value: '棉花糖' })
    expect(outcome.applied).toBe(true)
    expect(outcome.pet.personality.name).toBe('棉花糖')
    expect(outcome.pet.memory.profile.petName).toBe('棉花糖')
  })

  it('rejects pet names longer than 12 characters', () => {
    const pet = baseHatchedPet()
    const outcome = applyPetSettingsUpdate(pet, { target: 'pet-name', value: '一二三四五六七八九十一二三' })
    expect(outcome.applied).toBe(false)
    expect(outcome.pet).toBe(pet)
  })

  it('flips vacation mode and clears the conflicting boss/nest flags', () => {
    const pet = {
      ...baseHatchedPet(),
      ui: {
        ...baseHatchedPet().ui,
        system: { vacationMode: false, bossModeEnabled: true, nestModeEnabled: true }
      }
    }
    const outcome = applyPetSettingsUpdate(pet, { target: 'vacation-mode', value: 'on' })
    expect(outcome.applied).toBe(true)
    expect(outcome.pet.ui.system.vacationMode).toBe(true)
    expect(outcome.pet.ui.system.bossModeEnabled).toBe(false)
    expect(outcome.pet.ui.system.nestModeEnabled).toBe(false)
  })

  it('accepts "关" as off for system modes', () => {
    const pet = {
      ...baseHatchedPet(),
      ui: { ...baseHatchedPet().ui, system: { vacationMode: true, bossModeEnabled: false, nestModeEnabled: false } }
    }
    const outcome = applyPetSettingsUpdate(pet, { target: 'vacation-mode', value: '关' })
    expect(outcome.applied).toBe(true)
    expect(outcome.pet.ui.system.vacationMode).toBe(false)
  })
})
