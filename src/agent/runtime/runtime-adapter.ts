import type { CreateReminderInput, EventMemory, ExecutableInteractionType, InteractionType, PetConversationStreamCallbacks, PetData, PetEventCategory, PetFactInput, PetFactRecord, PetGeneratedReply, PetMemoryUpdate, PetRecentInteraction, PetReminderIntensity, PetReminderPhase, PetSceneId, PetSceneState, PetSettingsUpdate } from '../../types/pet'
import { parsePetIntent } from '../../lib/pet-intent'
import { buildCareRefusalEventMemory, getCareInteractionChatRefusal } from '../../lib/pet-care-interaction'
import { addEventMemory } from '../../lib/pet-state'
import { resolveLanguage, t, type TranslationKey } from '../../lib/i18n'
import { extractMemorySignals, buildExtractedTags } from '../../lib/memory-extraction'
import { extractFactCandidates } from '../../lib/fact-extraction'
import { addFactRecord, normalizeFactKey } from '../../lib/pet-facts'
import type { PetAgentTurnResult } from './agent-types'
import { runPetAgentTurn } from './agent-loop'
import { executePetAgentToolCalls, type FactRecordResult, type SettingsApplyResult } from './tool-executor'
import { preparePetConversationTurn, preparePetSceneTurn } from './runtime-flow'

interface AgentRuntimeContext {
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

interface PreparedSceneTurnContext {
  pet: PetData
  reminderPhase: PetReminderPhase
  recentInteraction?: PetRecentInteraction | null
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  sceneHint?: PetSceneId
}

interface PreparedConversationTurnContext {
  current: PetData
  message: string
  reminderPhase: PetReminderPhase
  recentInteraction?: PetRecentInteraction | null
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  streamCallbacks?: PetConversationStreamCallbacks
}

interface PreparedConversationTurnHandlers {
  applyMemoryUpdate: (current: PetData, input: PetMemoryUpdate) => PetData
  // Optional so existing call sites that haven't opted into the settings
  // pathway keep compiling. When omitted, settings.update tools are silently
  // skipped by the executor.
  applySettingsUpdate?: (current: PetData, input: PetSettingsUpdate) => SettingsApplyResult
  // Same opt-in pattern for the fact ledger. Handlers that don't pass this
  // forfeit both LLM-driven `fact.record` tools AND the deterministic regex
  // fallback below.
  applyFactRecord?: (current: PetData, input: PetFactInput) => FactRecordResult
  createReminder: (input: CreateReminderInput) => Promise<void> | void
  runInteraction: (
    current: PetData,
    interaction: Exclude<InteractionType, 'idle' | 'chat'>,
    userMessage: string,
    sceneHint?: PetSceneId
  ) => Promise<PetData>
}

export interface PreparedSceneTurnResult {
  scene: PetSceneState
  turn: PetAgentTurnResult
  persistent: boolean
}

export type PreparedConversationTurnResult =
  | {
      kind: 'reply'
      next: PetData
      reply: Pick<PetGeneratedReply, 'text' | 'action' | 'toneTags' | 'memoryHint' | 'memoryImportance' | 'memoryCategory' | 'show'>
      sceneHint?: PetSceneId
      shouldScheduleIdle: boolean
      turn: PetAgentTurnResult
    }
  | {
      kind: 'interaction'
      interaction: Exclude<InteractionType, 'idle' | 'chat'>
      turn: PetAgentTurnResult
    }
  | {
      kind: 'reminder'
      reminder: CreateReminderInput
      turn: PetAgentTurnResult
    }
  | {
      kind: 'care-refusal'
      interaction: ExecutableInteractionType
      refusalKey: string
      turn: PetAgentTurnResult
    }

const mapActionToEmotion = (action: PetGeneratedReply['action'], loneliness: number) => {
  if (action === 'happy' || action === 'blush') return 'happy' as const
  if (action === 'sleepy') return 'calm' as const
  if (action === 'hungry') return 'sad' as const
  if (action === 'talking' || action === 'alert') return loneliness > 55 ? ('lonely' as const) : ('excited' as const)
  return loneliness > 55 ? ('lonely' as const) : ('calm' as const)
}

// Catches "我今天 60 公斤" / "睡了 4 小时" / "花了 80 块" patterns the LLM may
// have missed and writes them to the ledger via the same applier as the
// LLM tool path -- ledger normalisation/cap policies live in one place.
const applyDeterministicFactExtraction = (
  current: PetData,
  userMessage: string,
  alreadyRecorded: PetFactRecord[],
  applyFactRecord?: (current: PetData, input: PetFactInput) => FactRecordResult
): PetData => {
  if (!applyFactRecord) return current
  const message = userMessage?.trim()
  if (!message) return current
  const candidates = extractFactCandidates(message)
  if (candidates.length === 0) return current

  // Skip any key the LLM already volunteered this turn -- normalise both sides
  // through the same alias map so "weight" and "body.weight" don't slip past.
  const llmKeys = new Set(alreadyRecorded.map((record) => normalizeFactKey(record.key)))
  let next = current
  for (const candidate of candidates) {
    const key = normalizeFactKey(candidate.key)
    if (!key || llmKeys.has(key)) continue
    const outcome = applyFactRecord(next, { ...candidate, key })
    next = outcome.pet
  }
  return next
}

// Promotes a chat turn into an EventMemory whenever it crosses a "worth
// remembering" threshold. Two paths trigger a record:
//   1. The LLM volunteered a memoryHint (model decided this matters), or
//   2. Our deterministic extractor saw a milestone/people/health keyword in
//      the user's message (importance >= 2) -- this is the "even when the
//      model forgets" safety net.
//
// Plain chitchat ("哈哈那挺好的") returns the pet untouched, so the events
// list stays as a memory log rather than a chat log.
const applyReplyMemoryHintEvent = (
  current: PetData,
  reply: Pick<PetGeneratedReply, 'memoryHint' | 'action' | 'memoryImportance' | 'memoryCategory'>,
  userMessage?: string
): PetData => {
  const memoryHint = reply.memoryHint?.trim()
  const trimmedUser = userMessage?.trim()

  // Run the deterministic extractor on whichever signal is strongest. We only
  // pull the user message in as a fallback summary when its extracted
  // importance is high enough, so plain chat doesn't get spammed into events.
  const userSignals = extractMemorySignals(trimmedUser)
  const hintSignals = extractMemorySignals(memoryHint)
  const extracted = userSignals.importance >= hintSignals.importance ? userSignals : hintSignals

  // Gate: only record if the model flagged it OR keyword extraction caught a
  // milestone-class signal (importance >= 2).
  const shouldRecord = Boolean(memoryHint) || (reply.memoryImportance ?? 0) >= 2 || extracted.importance >= 2
  if (!shouldRecord) return current

  // Prefer the LLM's already-summarised hint; fall back to the user's words
  // when the keyword extractor was the one that flagged this turn.
  const summary = (memoryHint || trimmedUser || '').slice(0, 160)
  if (!summary) return current

  const importance = (Math.max(
    reply.memoryImportance ?? 1,
    extracted.importance,
    // A volunteered memoryHint is worth at least importance 2 -- it's the
    // model saying "this is more than smalltalk".
    memoryHint ? 2 : 1
  ) as 1 | 2 | 3)

  const category: PetEventCategory = reply.memoryCategory ?? extracted.category
  const sceneId = current.memory.working.currentScene
  const tags = buildExtractedTags(extracted, ['chat', sceneId, category])

  const event: EventMemory = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    type: 'chat',
    summary,
    petEmotion: mapActionToEmotion(reply.action, current.state.loneliness),
    importance,
    sceneId,
    tags,
    category
  }

  return addEventMemory(current, event)
}

export const runPetConversationTurn = async (
  context: AgentRuntimeContext,
  message: string
): Promise<PetAgentTurnResult> => {
  return runPetAgentTurn({
    trigger: { kind: 'user-message', message },
    pet: context.pet,
    scene: context.scene,
    reminderPhase: context.reminderPhase,
    recentInteraction: context.recentInteraction,
    activeReminderTitle: context.activeReminderTitle,
    activeReminderIntensity: context.activeReminderIntensity,
    nearestReminderAt: context.nearestReminderAt,
    nearestReminderIntensity: context.nearestReminderIntensity,
    streamCallbacks: context.streamCallbacks
  })
}

export const runPreparedPetConversationTurn = async (
  context: PreparedConversationTurnContext,
  handlers: PreparedConversationTurnHandlers
): Promise<PreparedConversationTurnResult> => {
  const chatCareRefusal = getCareInteractionChatRefusal(context.current, context.message)
  if (chatCareRefusal) {
    return {
      kind: 'care-refusal',
      interaction: chatCareRefusal.interaction,
      refusalKey: chatCareRefusal.refusalKey,
      turn: {
        reply: { text: '', action: 'alert' },
        toolCalls: [],
        source: 'fallback',
        sceneHint: context.current.memory.working.currentScene
      }
    }
  }

  const prepared = preparePetConversationTurn({
    current: context.current,
    message: context.message,
    reminderPhase: context.reminderPhase,
    recentInteraction: context.recentInteraction,
    activeReminderTitle: context.activeReminderTitle,
    activeReminderIntensity: context.activeReminderIntensity,
    nearestReminderAt: context.nearestReminderAt,
    nearestReminderIntensity: context.nearestReminderIntensity
  })

  const turn = await runPetConversationTurn({
    pet: prepared.pet,
    scene: prepared.scene,
    reminderPhase: context.reminderPhase,
    recentInteraction: context.recentInteraction,
    activeReminderTitle: context.activeReminderTitle,
    activeReminderIntensity: context.activeReminderIntensity,
    nearestReminderAt: context.nearestReminderAt,
    nearestReminderIntensity: context.nearestReminderIntensity,
    streamCallbacks: context.streamCallbacks
  }, context.message)

  const { next: afterTools, reminderCreated, interactionRan, interactionRefusal, sceneHint, settingsNotes, factsRecorded } = await executePetAgentToolCalls({
    current: prepared.pet,
    toolCalls: turn.toolCalls,
    userMessage: context.message,
    applyMemoryUpdate: handlers.applyMemoryUpdate,
    applySettingsUpdate: handlers.applySettingsUpdate,
    applyFactRecord: handlers.applyFactRecord,
    createReminder: handlers.createReminder,
    runInteraction: handlers.runInteraction
  })

  // Deterministic fact safety net: if the LLM didn't volunteer a `fact.record`
  // tool for a key the regex extractor caught, lay it down ourselves. We
  // dedupe against the keys the LLM already covered to avoid double-recording.
  let afterFacts = applyDeterministicFactExtraction(
    afterTools,
    context.message,
    factsRecorded,
    handlers.applyFactRecord
  )

  if (interactionRefusal) {
    const lang = resolveLanguage(afterFacts.ui.language)
    const refusalText = t(lang, interactionRefusal.refusalKey as TranslationKey)
    afterFacts = addEventMemory(
      afterFacts,
      buildCareRefusalEventMemory(
        interactionRefusal.interaction,
        interactionRefusal.refusalKey,
        refusalText,
        afterFacts.state.loneliness,
        afterFacts.memory.working.currentScene
      )
    )
  }

  const next = applyReplyMemoryHintEvent(afterFacts, turn.reply, context.message)
  // Append a tiny confirmation tail to the LLM's reply for any settings the
  // pet just changed on the user's behalf. Done this way (vs a separate
  // bubble) because the chat surface only renders one bubble at a time, and
  // it keeps the acknowledgement glued to the action.
  let replyWithSettingsNotes = settingsNotes && settingsNotes.length > 0
    ? { ...turn.reply, text: `${turn.reply.text} ${settingsNotes.join(' ')}`.trim() }
    : turn.reply

  if (interactionRefusal) {
    const lang = resolveLanguage(next.ui.language)
    const refusalText = t(lang, interactionRefusal.refusalKey as TranslationKey)
    replyWithSettingsNotes = {
      ...replyWithSettingsNotes,
      text: refusalText,
      action: 'alert',
      memoryHint: `interaction.run refused: ${interactionRefusal.refusalKey}`
    }
  }

  if (!interactionRan && turn.source === 'fallback') {
    const deterministicIntent = parsePetIntent(context.message)
    if (deterministicIntent.kind === 'interaction') {
      return {
        kind: 'interaction',
        interaction: deterministicIntent.interaction,
        turn
      }
    }

    if (deterministicIntent.kind === 'reminder') {
      return {
        kind: 'reminder',
        reminder: deterministicIntent.reminder,
        turn
      }
    }
  }

  return {
    kind: 'reply',
    next,
    reply: replyWithSettingsNotes ?? prepared.fallback,
    sceneHint,
    shouldScheduleIdle: !reminderCreated || interactionRan || turn.source !== 'fallback',
    turn
  }
}

export const runPreparedPetSceneTurn = async (
  context: PreparedSceneTurnContext,
  trigger: 'idle-tick' | 'scene-refresh' | 'reminder-due',
  options?: {
    interactionType?: InteractionType
    userInput?: string
  }
): Promise<PreparedSceneTurnResult> => {
  const prepared = preparePetSceneTurn({
    pet: context.pet,
    reminderPhase: context.reminderPhase,
    recentInteraction: context.recentInteraction,
    activeReminderTitle: context.activeReminderTitle,
    activeReminderIntensity: context.activeReminderIntensity,
    nearestReminderAt: context.nearestReminderAt,
    nearestReminderIntensity: context.nearestReminderIntensity,
    sceneHint: context.sceneHint
  })

  const turn = await runPetSceneTurn({
    pet: context.pet,
    scene: prepared.scene,
    reminderPhase: context.reminderPhase,
    recentInteraction: context.recentInteraction,
    activeReminderTitle: context.activeReminderTitle,
    activeReminderIntensity: context.activeReminderIntensity,
    nearestReminderAt: context.nearestReminderAt,
    nearestReminderIntensity: context.nearestReminderIntensity
  }, trigger, options)

  return {
    scene: prepared.scene,
    turn,
    persistent: Boolean(prepared.scene.persistent)
  }
}

export const runPetSceneTurn = async (
  context: AgentRuntimeContext,
  trigger: 'idle-tick' | 'scene-refresh' | 'reminder-due',
  options?: {
    interactionType?: InteractionType
    userInput?: string
  }
): Promise<PetAgentTurnResult> => {
  if (options?.interactionType) {
    return runPetAgentTurn({
      trigger: {
        kind: 'interaction',
        interactionType: options.interactionType,
        userInput: options.userInput
      },
      pet: context.pet,
      scene: context.scene,
      reminderPhase: context.reminderPhase,
      recentInteraction: context.recentInteraction,
      activeReminderTitle: context.activeReminderTitle,
      activeReminderIntensity: context.activeReminderIntensity,
      nearestReminderAt: context.nearestReminderAt,
      nearestReminderIntensity: context.nearestReminderIntensity
    })
  }

  return runPetAgentTurn({
    trigger: { kind: trigger },
    pet: context.pet,
    scene: context.scene,
    reminderPhase: context.reminderPhase,
    recentInteraction: context.recentInteraction,
    activeReminderTitle: context.activeReminderTitle,
    activeReminderIntensity: context.activeReminderIntensity,
    nearestReminderAt: context.nearestReminderAt,
    nearestReminderIntensity: context.nearestReminderIntensity
  })
}
