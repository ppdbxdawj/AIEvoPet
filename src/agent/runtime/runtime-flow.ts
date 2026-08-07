import { learnFromUserMessage } from '../../lib/pet-companion'
import { createRecentInteraction } from '../../lib/pet-scene'
import { applyInteraction } from '../../lib/pet-state'
import type { InteractionType, PetData, PetGeneratedReply, PetRecentInteraction, PetReminderIntensity, PetReminderPhase, PetSceneId, PetSceneState } from '../../types/pet'
import { applySceneHint, resolveRuntimePetScene, type BuildPetSceneContextInput } from './scene-context'

export interface PetRuntimeSceneInput extends BuildPetSceneContextInput {
  reminderPhase: PetReminderPhase
}

export interface PreparePetInteractionStateInput {
  current: PetData
  type: InteractionType
  userInput?: string
  sceneHint?: PetSceneId
  reminderPhase: PetReminderPhase
  recentInteraction?: PetRecentInteraction | null
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  now?: number
}

export interface PreparePetInteractionStateResult {
  pet: PetData
  scene: PetSceneState
  recentInteraction: PetRecentInteraction
  at: number
}

export interface PreparePetConversationTurnInput {
  current: PetData
  message: string
  reminderPhase: PetReminderPhase
  recentInteraction?: PetRecentInteraction | null
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  now?: number
}

export interface PreparePetConversationTurnResult {
  pet: PetData
  scene: PetSceneState
  fallback: Pick<PetGeneratedReply, 'text' | 'action'>
  at: number
}

export interface PreparePetSceneTurnInput {
  pet: PetData
  reminderPhase: PetReminderPhase
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  recentInteraction?: PetRecentInteraction | null
  sceneHint?: PetSceneId
  now?: number
}

export interface PreparePetSceneTurnResult {
  scene: PetSceneState
  at: number
}

const createSceneInput = ({
  reminderPhase,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  recentInteraction,
  now
}: PetRuntimeSceneInput): BuildPetSceneContextInput => ({
  reminderPhase,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  recentInteraction,
  now
})

export const createConversationFallback = (message: string): Pick<PetGeneratedReply, 'text' | 'action'> => ({
  text: message.trim().length > 18
    ? '我听明白你在说这个了。你要是愿意，我陪你顺着往下聊。'
    : '嗯，我接住你这句了。你继续说，我在。',
  action: 'talking'
})

export const resolveRuntimeSceneWithHint = (
  pet: PetData,
  sceneHint: PetSceneId | undefined,
  input: PetRuntimeSceneInput
): PetSceneState => {
  const sceneInput = createSceneInput(input)
  return sceneHint
    ? applySceneHint(pet, sceneHint, sceneInput)
    : resolveRuntimePetScene(pet, sceneInput)
}

export const preparePetSceneTurn = ({
  pet,
  reminderPhase,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  recentInteraction,
  sceneHint,
  now
}: PreparePetSceneTurnInput): PreparePetSceneTurnResult => {
  const at = now ?? Date.now()

  return {
    scene: resolveRuntimeSceneWithHint(pet, sceneHint, {
      reminderPhase,
      activeReminderTitle,
      activeReminderIntensity,
      nearestReminderAt,
      nearestReminderIntensity,
      recentInteraction,
      now: at
    }),
    at
  }
}

export const preparePetInteractionState = ({
  current,
  type,
  userInput,
  sceneHint,
  reminderPhase,
  recentInteraction,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  now
}: PreparePetInteractionStateInput): PreparePetInteractionStateResult => {
  const at = now ?? Date.now()
  const nextRecentInteraction = createRecentInteraction(recentInteraction ?? null, type, at)

  let pet = applyInteraction(current, type)
  if (userInput?.trim()) {
    pet = learnFromUserMessage(pet, userInput, at)
  }

  const scene = resolveRuntimeSceneWithHint(pet, sceneHint, {
    reminderPhase,
    activeReminderTitle,
    activeReminderIntensity,
    nearestReminderAt,
    nearestReminderIntensity,
    recentInteraction: nextRecentInteraction,
    now: at
  })

  return {
    pet,
    scene,
    recentInteraction: nextRecentInteraction,
    at
  }
}

export const preparePetConversationTurn = ({
  current,
  message,
  reminderPhase,
  recentInteraction,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  now
}: PreparePetConversationTurnInput): PreparePetConversationTurnResult => {
  const at = now ?? Date.now()
  const pet = learnFromUserMessage(current, message, at)

  return {
    pet,
    scene: resolveRuntimePetScene(pet, {
      reminderPhase,
      activeReminderTitle,
      activeReminderIntensity,
      nearestReminderAt,
      nearestReminderIntensity,
      recentInteraction,
      now: at
    }),
    fallback: createConversationFallback(message),
    at
  }
}
