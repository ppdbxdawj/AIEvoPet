/**
 * Care / drag-drop interaction guards. Centralises "pet refuses this right now"
 * checks so panel buttons, tray drags, and tests share one rule set.
 *
 * Hunger scale: higher = hungrier (see tickPetState). "我不饿" ⇒ hunger is low.
 */
import type { EventMemory, ExecutableInteractionType, PetData, PetSceneId } from '../types/pet'
import { parsePetIntent } from './pet-intent'

export const pointHitsAxisAlignedRect = (
  rect: DOMRectReadOnly | DOMRect | null | undefined,
  x: number,
  y: number
): boolean => {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/** Thresholds tuned so normal play rarely hits refusal; edge stats do. */
const NOT_HUNGRY_HUNGER_MAX = 22
const DRINK_SATISFIED_HUNGER_MAX = 14
const ALREADY_CLEAN_CLEANLINESS_MIN = 90
const TOO_ENERGIZED_FOR_SLEEP_MAX = 92

export const getCareInteractionRefusalKey = (
  pet: PetData,
  type: ExecutableInteractionType
): string | null => {
  const sleeping = pet.state.isSleeping

  if (sleeping) {
    if (type === 'wake') return null
    if (type === 'sleep') return 'interaction.refuse.sleep.already'
    if (type === 'feed' || type === 'drink' || type === 'bath' || type === 'pet' || type === 'hold') {
      return 'interaction.refuse.sleeping'
    }
    return null
  }

  if (type === 'wake') return 'interaction.refuse.awake.not_sleeping'

  if (type === 'feed' && pet.state.hunger < NOT_HUNGRY_HUNGER_MAX) {
    return 'interaction.refuse.feed.full'
  }
  if (type === 'drink' && pet.state.hunger < DRINK_SATISFIED_HUNGER_MAX) {
    return 'interaction.refuse.drink.full'
  }
  if (type === 'bath' && pet.state.cleanliness >= ALREADY_CLEAN_CLEANLINESS_MIN) {
    return 'interaction.refuse.bath.clean'
  }
  if (type === 'sleep' && pet.state.energy > TOO_ENERGIZED_FOR_SLEEP_MAX) {
    return 'interaction.refuse.sleep.not_tired'
  }

  return null
}

/** Deterministic chat phrases mapped to a care interaction + refusal, if any. */
export const getCareInteractionChatRefusal = (
  pet: PetData,
  message: string
): { interaction: ExecutableInteractionType; refusalKey: string } | null => {
  const intent = parsePetIntent(message)
  if (intent.kind !== 'interaction') return null
  const refusalKey = getCareInteractionRefusalKey(pet, intent.interaction)
  if (!refusalKey) return null
  return { interaction: intent.interaction, refusalKey }
}

export const buildCareRefusalEventMemory = (
  interaction: ExecutableInteractionType,
  refusalKey: string,
  summary: string,
  loneliness: number,
  sceneId?: PetSceneId
): EventMemory => ({
  id: crypto.randomUUID(),
  ts: new Date().toISOString(),
  type: interaction,
  summary,
  petEmotion: loneliness > 55 ? 'lonely' : 'excited',
  importance: 2,
  sceneId,
  tags: [interaction, 'care-refusal', refusalKey],
  category: 'general'
})
