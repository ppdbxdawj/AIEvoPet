import { generatePetDialogue } from '../../lib/pet-dialogue'
import { generateConversationLoop } from '../../lib/pet-llm'
import { parsePetIntent } from '../../lib/pet-intent'
import { PALETTES } from '../../lib/palettes'
import { buildPetGenerationRequest } from '../../lib/pet-prompt'
import type { PetConversationLoopPlan, PetData, PetSceneId } from '../../types/pet'
import type { PetAgentToolCall, PetAgentTurnResult, RunPetAgentTurnInput } from './agent-types'
import { normalizeAgentToolCalls, readSceneHint } from './tool-registry'

const createConversationFallback = (message: string) => ({
  text: message.trim().length > 18
    ? '我听明白你在说这个了。你要是愿意，我陪你顺着往下聊。'
    : '嗯，我接住你这句了。你继续说，我在。',
  action: 'talking' as const
})

const hasToolCall = (toolCalls: PetAgentToolCall[], name: PetAgentToolCall['name']) => toolCalls.some((toolCall) => toolCall.name === name)

const addDeterministicFallbackToolCalls = (
  message: string,
  source: 'model' | 'fallback',
  toolCalls: PetAgentToolCall[]
): PetAgentToolCall[] => {
  const deterministicIntent = parsePetIntent(message)

  if (deterministicIntent.kind === 'interaction' && (source === 'fallback' || !hasToolCall(toolCalls, 'interaction.run'))) {
    return [
      ...toolCalls,
      {
        name: 'interaction.run',
        input: { interaction: deterministicIntent.interaction }
      }
    ]
  }

  if (deterministicIntent.kind === 'reminder' && (source === 'fallback' || !hasToolCall(toolCalls, 'reminder.create'))) {
    return [
      ...toolCalls,
      {
        name: 'reminder.create',
        input: deterministicIntent.reminder
      }
    ]
  }

  if (deterministicIntent.kind === 'settings' && (source === 'fallback' || !hasToolCall(toolCalls, 'settings.update'))) {
    return [
      ...toolCalls,
      {
        name: 'settings.update',
        input: deterministicIntent.settings
      }
    ]
  }

  return toolCalls
}

const hasSettingsUpdateForTarget = (
  toolCalls: PetAgentToolCall[],
  target: 'palette' | 'wardrobe' | 'pet-name' | 'vacation-mode' | 'boss-mode' | 'nest-mode'
) => toolCalls.some((toolCall) => toolCall.name === 'settings.update' && toolCall.input?.target === target)

// When the LLM hints `reply.show.palette` we promote it to a real
// `settings.update` so the change actually persists and broadcasts to every
// Tauri window. Without this the chat dock (pet window) would flip to the new
// palette via the ephemeral show state while the companion panel stayed on
// the old persisted palette.
const synthesizePaletteUpdateFromShow = (
  pet: PetData,
  reply: PetConversationLoopPlan['reply'],
  toolCalls: PetAgentToolCall[]
): PetAgentToolCall[] => {
  const hint = reply.show?.palette?.trim()
  if (!hint) return toolCalls
  if (!PALETTES[hint]) return toolCalls
  if (hint === pet.memory.profile.selectedPalette) return toolCalls
  if (hasSettingsUpdateForTarget(toolCalls, 'palette')) return toolCalls
  return [
    ...toolCalls,
    {
      name: 'settings.update',
      input: { target: 'palette', value: hint }
    }
  ]
}

const runUserMessageTurn = async ({
  trigger,
  pet,
  scene,
  reminderPhase,
  recentInteraction,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  streamCallbacks
}: RunPetAgentTurnInput & { trigger: Extract<RunPetAgentTurnInput['trigger'], { kind: 'user-message' }> }): Promise<PetAgentTurnResult> => {
  const fallback = createConversationFallback(trigger.message)
  const plan = await generateConversationLoop(
    buildPetGenerationRequest({
      pet,
      scene,
      reminderPhase,
      interactionType: 'chat',
      userInput: trigger.message,
      recentInteraction,
      activeReminderTitle,
      activeReminderIntensity,
      nearestReminderAt,
      nearestReminderIntensity,
      kind: 'conversation-loop'
    }),
    fallback,
    streamCallbacks
  )

  const baseToolCalls = addDeterministicFallbackToolCalls(trigger.message, plan.source, normalizeAgentToolCalls(plan.steps))
  const toolCalls = synthesizePaletteUpdateFromShow(pet, plan.reply, baseToolCalls)
  const sceneHint = readSceneHint(toolCalls)

  return {
    reply: plan.reply,
    toolCalls,
    source: plan.source,
    sceneHint
  }
}

const resolveInteractionType = (input: RunPetAgentTurnInput) => {
  if (input.trigger.kind === 'interaction') return input.trigger.interactionType
  if (input.trigger.kind === 'idle-tick') return 'idle'
  return undefined
}

const runSceneTurn = async (input: RunPetAgentTurnInput): Promise<PetAgentTurnResult> => {
  const reply = await generatePetDialogue({
    pet: input.pet,
    scene: input.scene,
    reminderPhase: input.reminderPhase,
    interactionType: resolveInteractionType(input),
    userInput: input.trigger.kind === 'interaction' ? input.trigger.userInput : undefined,
    recentInteraction: input.recentInteraction,
    activeReminderTitle: input.activeReminderTitle,
    activeReminderIntensity: input.activeReminderIntensity,
    nearestReminderAt: input.nearestReminderAt,
    nearestReminderIntensity: input.nearestReminderIntensity
  })

  return {
    reply,
    toolCalls: [],
    source: reply.source,
    sceneHint: input.scene.id as PetSceneId
  }
}

export const runPetAgentTurn = async (input: RunPetAgentTurnInput): Promise<PetAgentTurnResult> => {
  if (input.trigger.kind === 'user-message') {
    return runUserMessageTurn({
      ...input,
      trigger: input.trigger
    })
  }

  return runSceneTurn(input)
}
