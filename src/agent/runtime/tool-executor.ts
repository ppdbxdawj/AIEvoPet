import type { CreateReminderInput, InteractionType, PetData, PetFactInput, PetFactRecord, PetMemoryUpdate, PetSceneId, PetSettingsUpdate } from '../../types/pet'
import { getCareInteractionRefusalKey } from '../../lib/pet-care-interaction'
import { evaluateToolPolicy } from './tool-policy'
import type { PetAgentToolCall } from './agent-types'

export interface SettingsApplyResult {
  pet: PetData
  applied: boolean
  description: string
}

export interface FactRecordResult {
  pet: PetData
  // The actual record landed in the ledger (after normalisation). Undefined
  // when the fact was rejected (untracked key, invalid value, etc).
  record?: PetFactRecord
}

export interface ExecutePetAgentToolCallsInput {
  current: PetData
  toolCalls: PetAgentToolCall[]
  userMessage: string
  applyMemoryUpdate: (current: PetData, input: PetMemoryUpdate) => PetData
  applySettingsUpdate?: (current: PetData, input: PetSettingsUpdate) => SettingsApplyResult
  applyFactRecord?: (current: PetData, input: PetFactInput) => FactRecordResult
  createReminder: (input: CreateReminderInput) => Promise<void> | void
  runInteraction: (
    current: PetData,
    interaction: Exclude<InteractionType, 'idle' | 'chat'>,
    userMessage: string,
    sceneHint?: PetSceneId
  ) => Promise<PetData>
}

export interface PetAgentToolExecutionResult {
  next: PetData
  reminderCreated: boolean
  interactionRan: boolean
  /** Set when interaction.run was blocked by care guards (no pet mutation). */
  interactionRefusal?: {
    interaction: Exclude<InteractionType, 'idle' | 'chat'>
    refusalKey: string
  }
  sceneHint?: PetSceneId
  // Confirmation strings for any settings.update tools that succeeded. The
  // adapter appends these to the reply text so the user always knows when the
  // pet flipped a knob (palette, vacation mode, ...).
  settingsNotes: string[]
  // Fact records that actually made it into the ledger from this turn,
  // forwarded so the runtime adapter can short-circuit the deterministic
  // extractor (no double-recording when the LLM already covered it).
  factsRecorded: PetFactRecord[]
}

export const executePetAgentToolCalls = async ({
  current,
  toolCalls,
  userMessage,
  applyMemoryUpdate,
  applySettingsUpdate,
  applyFactRecord,
  createReminder,
  runInteraction
}: ExecutePetAgentToolCallsInput): Promise<PetAgentToolExecutionResult> => {
  let next = current
  let reminderCreated = false
  let interactionRan = false
  let interactionRefusal: PetAgentToolExecutionResult['interactionRefusal']
  let sceneHint: PetSceneId | undefined
  const settingsNotes: string[] = []
  const factsRecorded: PetFactRecord[] = []

  for (const toolCall of toolCalls) {
    try {
      const policy = evaluateToolPolicy(toolCall)
      if (!policy.allowed || policy.requiresConfirmation) {
        continue
      }

      if (toolCall.name === 'memory.update') {
        next = applyMemoryUpdate(next, toolCall.input)
        continue
      }

      if (toolCall.name === 'settings.update') {
        if (!applySettingsUpdate) continue
        const outcome = applySettingsUpdate(next, toolCall.input)
        next = outcome.pet
        // Only surface a note when the change actually landed -- skipped /
        // rejected updates would otherwise spam confirmations like "色板已经
        // 是xxx啦" on every chat turn.
        if (outcome.applied && outcome.description) {
          settingsNotes.push(outcome.description)
        }
        continue
      }

      if (toolCall.name === 'fact.record') {
        if (!applyFactRecord) continue
        const outcome = applyFactRecord(next, toolCall.input)
        next = outcome.pet
        if (outcome.record) factsRecorded.push(outcome.record)
        continue
      }

      if (toolCall.name === 'scene.hint') {
        sceneHint = toolCall.input.sceneId
        continue
      }

      if (toolCall.name === 'reminder.create' && !reminderCreated) {
        await createReminder(toolCall.input)
        reminderCreated = true
        continue
      }

      if (toolCall.name === 'interaction.run' && !interactionRan) {
        const refusalKey = getCareInteractionRefusalKey(next, toolCall.input.interaction)
        if (refusalKey) {
          interactionRefusal = { interaction: toolCall.input.interaction, refusalKey }
          // Mark slot consumed so runtime won't fall through to deterministic interaction.run again.
          interactionRan = true
          continue
        }
        next = await runInteraction(next, toolCall.input.interaction, userMessage, sceneHint)
        interactionRan = true
      }
    } catch {
      break
    }
  }

  return {
    next,
    reminderCreated,
    interactionRan,
    interactionRefusal,
    sceneHint,
    settingsNotes,
    factsRecorded
  }
}
