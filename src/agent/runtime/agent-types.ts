import type {
  CreateReminderInput,
  InteractionType,
  PetConversationStreamCallbacks,
  PetGeneratedReply,
  PetRecentInteraction,
  PetReminderIntensity,
  PetReminderPhase,
  PetSceneId,
  PetSceneState,
  PetData,
  PetMemoryUpdate,
  PetSettingsUpdate,
  PetShowState,
  PetFactInput
} from '../../types/pet'

export type PetAgentTrigger =
  | { kind: 'user-message'; message: string }
  | { kind: 'interaction'; interactionType: InteractionType; userInput?: string }
  | { kind: 'idle-tick' }
  | { kind: 'reminder-due' }
  | { kind: 'scene-refresh' }

export type PetAgentToolCall =
  | { name: 'memory.update'; input: PetMemoryUpdate }
  | { name: 'settings.update'; input: PetSettingsUpdate }
  | { name: 'fact.record'; input: PetFactInput }
  | { name: 'interaction.run'; input: { interaction: Exclude<InteractionType, 'idle' | 'chat'> } }
  | { name: 'reminder.create'; input: CreateReminderInput }
  | { name: 'scene.hint'; input: { sceneId: PetSceneId } }
  | { name: 'show.set-intent'; input: { show: PetShowState } }
  | { name: 'planner.declare'; input: { declaration: string } }
  | { name: 'pomodoro.start'; input: { endsAt: string } }
  | { name: 'pet.express'; input: { kind: 'snapshot' | 'export-all' } }
  | { name: 'system.idle'; input: { vacationMode: boolean } }
  | { name: 'oracle.draw'; input: { deckId: string } }
  | { name: 'tool.toggle'; input: { toolId: string; enabled: boolean } }
  | { name: 'calendar.provider'; input: { provider: 'none' | 'eventkit' | 'ics' } }
  | { name: 'calendar.create'; input: { title: string; scheduledAt: string } }
  | { name: 'calendar.update'; input: { id: string; title?: string; scheduledAt?: string } }
  | { name: 'calendar.delete'; input: { id: string } }

export interface RunPetAgentTurnInput {
  trigger: PetAgentTrigger
  pet: PetData
  scene: PetSceneState
  reminderPhase: PetReminderPhase
  recentInteraction?: PetRecentInteraction | null
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  streamCallbacks?: PetConversationStreamCallbacks
}

export interface PetAgentTurnResult {
  reply: Pick<PetGeneratedReply, 'text' | 'action' | 'toneTags' | 'memoryHint' | 'memoryImportance' | 'memoryCategory' | 'show'>
  toolCalls: PetAgentToolCall[]
  source: 'model' | 'fallback'
  sceneHint?: PetSceneId
}
