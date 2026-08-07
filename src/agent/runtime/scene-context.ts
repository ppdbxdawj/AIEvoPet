import { resolvePetScene } from '../../lib/pet-scene'
import type { PetAction, PetData, PetRecentInteraction, PetReminderIntensity, PetReminderPhase, PetSceneContext, PetSceneId, PetSceneState } from '../../types/pet'

export interface BuildPetSceneContextInput {
  reminderPhase: PetReminderPhase
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  recentInteraction?: PetRecentInteraction | null
  now?: number
}

export const buildPetSceneContext = ({
  reminderPhase,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  recentInteraction,
  now
}: BuildPetSceneContextInput): PetSceneContext => ({
  reminderPhase,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  recentInteraction: recentInteraction ?? null,
  now
})

export const resolveRuntimePetScene = (
  pet: PetData,
  input: BuildPetSceneContextInput
): PetSceneState => resolvePetScene(pet, buildPetSceneContext(input))

export const resolveRuntimePetAction = (
  pet: PetData,
  input: BuildPetSceneContextInput
): PetAction => {
  if (pet.state.isSleeping) return 'sleepy'
  return resolveRuntimePetScene(pet, input).action
}

export const applySceneHint = (
  pet: PetData,
  sceneId: PetSceneId,
  input: BuildPetSceneContextInput
): PetSceneState => {
  const resolved = resolveRuntimePetScene(pet, input)
  return {
    ...resolved,
    id: sceneId,
    persistent: resolved.persistent || sceneId === 'sleeping' || sceneId === 'reminder-alert'
  }
}
