import { describe, expect, it } from 'vitest'
import { createDefaultPet } from './default-pet'
import { getCareInteractionRefusalKey, pointHitsAxisAlignedRect, getCareInteractionChatRefusal } from './pet-care-interaction'

describe('pointHitsAxisAlignedRect', () => {
  it('returns true for interior points', () => {
    const rect = new DOMRect(100, 80, 40, 60)
    expect(pointHitsAxisAlignedRect(rect, 120, 100)).toBe(true)
  })

  it('returns false outside rect', () => {
    const rect = new DOMRect(100, 80, 40, 60)
    expect(pointHitsAxisAlignedRect(rect, 50, 100)).toBe(false)
    expect(pointHitsAxisAlignedRect(rect, 120, 200)).toBe(false)
  })

  it('returns false for null rect', () => {
    expect(pointHitsAxisAlignedRect(null, 0, 0)).toBe(false)
  })
})

describe('getCareInteractionRefusalKey', () => {
  it('refuses feed while sleeping', () => {
    const pet = createDefaultPet()
    pet.state.isSleeping = true
    expect(getCareInteractionRefusalKey(pet, 'feed')).toBe('interaction.refuse.sleeping')
  })

  it('allows wake while sleeping', () => {
    const pet = createDefaultPet()
    pet.state.isSleeping = true
    expect(getCareInteractionRefusalKey(pet, 'wake')).toBe(null)
  })

  it('refuses wake while awake', () => {
    const pet = createDefaultPet()
    pet.state.isSleeping = false
    expect(getCareInteractionRefusalKey(pet, 'wake')).toBe('interaction.refuse.awake.not_sleeping')
  })

  it('refuses feed when not hungry', () => {
    const pet = createDefaultPet()
    pet.state.isSleeping = false
    pet.state.hunger = 10
    expect(getCareInteractionRefusalKey(pet, 'feed')).toBe('interaction.refuse.feed.full')
  })

  it('refuses bath when already clean', () => {
    const pet = createDefaultPet()
    pet.state.isSleeping = false
    pet.state.cleanliness = 95
    expect(getCareInteractionRefusalKey(pet, 'bath')).toBe('interaction.refuse.bath.clean')
  })
})

describe('getCareInteractionChatRefusal', () => {
  it('returns refusal when chat maps to feed but pet is full', () => {
    const pet = createDefaultPet()
    pet.state.hunger = 10
    expect(getCareInteractionChatRefusal(pet, '喂我一口')).toEqual({
      interaction: 'feed',
      refusalKey: 'interaction.refuse.feed.full'
    })
  })

  it('returns null when chat does not map to an interaction', () => {
    const pet = createDefaultPet()
    pet.state.hunger = 10
    expect(getCareInteractionChatRefusal(pet, '今天天气真好')).toBe(null)
  })

  it('returns null when interaction is allowed', () => {
    const pet = createDefaultPet()
    pet.state.hunger = 40
    expect(getCareInteractionChatRefusal(pet, '喂我一口')).toBe(null)
  })
})
