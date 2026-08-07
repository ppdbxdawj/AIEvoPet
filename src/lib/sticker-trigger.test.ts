import { describe, expect, it } from 'vitest'
import { createDefaultPet } from './default-pet'
import { fireMorningStickerIfDue, fireReminderSticker } from './sticker-trigger'

const morningTimestamp = (year = 2024, month = 5, day = 7, hour = 8) =>
  new Date(year, month, day, hour, 0, 0).getTime()

describe('fireMorningStickerIfDue', () => {
  it('fires a sticker during morning hours when not yet seen today', () => {
    const pet = createDefaultPet()
    const now = morningTimestamp()
    const result = fireMorningStickerIfDue(pet, { now })
    expect(result.sticker).toBeDefined()
    expect(result.sticker?.id.startsWith('greeting-morning')).toBe(true)
    expect(result.pet.ui.system.stickerHistory?.lastMorningGreetingAt).toBe('2024-06-07')
    expect(result.pet.ui.system.stickerHistory?.entries.length).toBe(1)
  })

  it('skips when outside morning hours', () => {
    const pet = createDefaultPet()
    const now = new Date(2024, 5, 7, 14, 0, 0).getTime()
    const result = fireMorningStickerIfDue(pet, { now })
    expect(result.sticker).toBeUndefined()
    expect(result.pet).toBe(pet)
  })

  it('does not fire twice on the same local day', () => {
    const pet = createDefaultPet()
    const first = fireMorningStickerIfDue(pet, { now: morningTimestamp() })
    expect(first.sticker).toBeDefined()
    const second = fireMorningStickerIfDue(first.pet, { now: morningTimestamp(2024, 5, 7, 9) })
    expect(second.sticker).toBeUndefined()
    expect(second.pet.ui.system.stickerHistory?.entries.length).toBe(1)
  })

  it('fires again on the next day', () => {
    const pet = createDefaultPet()
    const day1 = fireMorningStickerIfDue(pet, { now: morningTimestamp(2024, 5, 7, 8) })
    expect(day1.sticker).toBeDefined()
    const day2 = fireMorningStickerIfDue(day1.pet, { now: morningTimestamp(2024, 5, 8, 8) })
    expect(day2.sticker).toBeDefined()
    expect(day2.pet.ui.system.stickerHistory?.lastMorningGreetingAt).toBe('2024-06-08')
  })
})

describe('fireReminderSticker', () => {
  it('fires a reminder-bucket sticker', () => {
    const pet = createDefaultPet()
    const result = fireReminderSticker(pet, { now: morningTimestamp(2024, 0, 1, 10) })
    expect(result.sticker).toBeDefined()
    expect(result.sticker?.triggers.some((t) => t.kind === 'reminder')).toBe(true)
    expect(result.pet.ui.system.stickerHistory?.entries.length).toBe(1)
  })

  it('rotates between reminder stickers across consecutive fires', () => {
    let pet = createDefaultPet()
    const seen = new Set<string>()
    for (let i = 0; i < 4; i++) {
      const result = fireReminderSticker(pet, { now: 1_000_000 + i * 60_000 })
      if (result.sticker) seen.add(result.sticker.id)
      pet = result.pet
    }
    // We bundle two reminder stickers; consecutive same-id is excluded
    // via the most-recent dedup, so we should see both ids over the run.
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })
})
