import { buildPetGenerationRequest } from './pet-prompt'
import { petPlatform } from '../platform/pet-platform'
import type { PetAction, PetConversationLoopPlan, PetConversationStreamCallbacks, PetData, PetEventCategory, PetGeneratedReply, PetGenerationRequest, PetLanguage, PetModelConfig, PetModelHealth, PetModelServiceEnsureResult, PetSummaryTarget } from '../types/pet'

const FALLBACK_ACTIONS: PetAction[] = ['idle', 'happy', 'sleepy', 'hungry', 'talking', 'blush', 'alert']

const sanitizeAction = (action: PetAction | undefined, fallback: PetAction): PetAction => (action && FALLBACK_ACTIONS.includes(action) ? action : fallback)

const sanitizeText = (text: string | undefined, fallback: string) => {
  const trimmed = text?.trim()
  return trimmed ? trimmed.slice(0, 220) : fallback
}

const ALLOWED_MEMORY_CATEGORIES: PetEventCategory[] = ['milestone', 'people', 'work', 'health', 'mood', 'preference', 'general']

const getLanguage = (pet: PetData): PetLanguage => pet.ui.language === 'en-US' ? 'en-US' : 'zh-CN'

const sanitizeMemoryImportance = (value: unknown): 1 | 2 | 3 | undefined => {
  if (value === 1 || value === 2 || value === 3) return value
  return undefined
}

const sanitizeMemoryCategory = (value: unknown): PetEventCategory | undefined => (
  typeof value === 'string' && ALLOWED_MEMORY_CATEGORIES.includes(value as PetEventCategory)
    ? (value as PetEventCategory)
    : undefined
)

const sanitizeReply = (
  reply: Partial<Pick<PetGeneratedReply, 'text' | 'action' | 'toneTags' | 'memoryHint' | 'memoryImportance' | 'memoryCategory' | 'show'>> | undefined,
  fallback: Pick<PetGeneratedReply, 'text' | 'action'>
): Pick<PetGeneratedReply, 'text' | 'action' | 'toneTags' | 'memoryHint' | 'memoryImportance' | 'memoryCategory' | 'show'> => ({
  text: sanitizeText(reply?.text, fallback.text),
  action: sanitizeAction(reply?.action, fallback.action),
  toneTags: Array.isArray(reply?.toneTags) ? reply.toneTags.filter((item): item is string => typeof item === 'string').slice(0, 6) : undefined,
  memoryHint: typeof reply?.memoryHint === 'string' && reply.memoryHint.trim() ? reply.memoryHint.trim().slice(0, 160) : undefined,
  memoryImportance: sanitizeMemoryImportance(reply?.memoryImportance),
  memoryCategory: sanitizeMemoryCategory(reply?.memoryCategory),
  show: reply?.show
})

export const loadModelConfig = async (): Promise<PetModelConfig> => petPlatform.loadModelConfig()

export const saveModelConfig = async (config: PetModelConfig): Promise<PetModelConfig> => petPlatform.saveModelConfig(config)

export const checkModelHealth = async (): Promise<PetModelHealth> => petPlatform.checkModelHealth()

export const ensureModelService = async (config: PetModelConfig): Promise<PetModelServiceEnsureResult> => petPlatform.ensureModelService(config)

export const generatePetReply = async (
  request: PetGenerationRequest,
  fallback: Pick<PetGeneratedReply, 'text' | 'action'>
): Promise<PetGeneratedReply> => {
  try {
    const reply = await petPlatform.generatePetReply(request)
    return {
      ...reply,
      text: sanitizeText(reply.text, fallback.text),
      action: sanitizeAction(reply.action, fallback.action),
      source: reply.source === 'model' ? 'model' : 'fallback'
    }
  } catch {
    return {
      text: sanitizeText(undefined, fallback.text),
      action: sanitizeAction(undefined, fallback.action),
      source: 'fallback'
    }
  }
}

// Deterministic weekly summary used when the LLM is unavailable or returns
// junk. Picks the most important events from the past 7 days plus the most
// common dominant mood, then stitches them together. Quiet enough to feel
// like a soft observation rather than a system log.
const buildDeterministicWeeklySummary = (pet: PetData, now: number): string => {
  const english = getLanguage(pet) === 'en-US'
  const cutoff = now - 7 * 86_400_000
  const recentEvents = pet.memory.events
    .filter((event) => new Date(event.ts).getTime() >= cutoff)
    .filter((event) => event.importance >= 2 && event.summary?.trim())
    .slice(0, 4)

  const recentDailies = pet.memory.daily.filter((entry) => {
    const date = new Date(entry.date).getTime()
    return Number.isFinite(date) && date >= cutoff
  })

  const moodCounts = new Map<string, number>()
  for (const day of recentDailies) {
    if (!day.dominantMood) continue
    moodCounts.set(day.dominantMood, (moodCounts.get(day.dominantMood) ?? 0) + 1)
  }
  const dominant = [...moodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const moodLine = dominant
    ? english
      ? `This week felt mostly ${dominant === 'playful' ? 'playful' : dominant === 'lonely' ? 'quietly longing' : dominant === 'sleepy' ? 'tired' : dominant === 'steady' ? 'steady' : 'warm'}.`
      : `这一周的氛围更偏${dominant === 'playful' ? '活泼' : dominant === 'lonely' ? '安静思念' : dominant === 'sleepy' ? '疲倦' : dominant === 'steady' ? '稳' : '温柔'}。`
    : english ? 'This week was mostly steady, without any big swings.' : '这一周大致是稳的，没有特别大的起伏。'
  const eventLine = recentEvents.length > 0
    ? english
      ? `It remembers you mentioning: ${recentEvents.map((event) => event.summary).join('; ').slice(0, 140)}.`
      : `它记得你提过：${recentEvents.map((event) => event.summary).join('；').slice(0, 140)}。`
    : english ? 'There was nothing especially new, mostly quiet daily time together.' : '没有特别新鲜的事，更多是你们一起的安静日常。'
  const interactionTotal = recentDailies.reduce((sum, day) => sum + (day.interactionCount ?? 0), 0)
  const cadenceLine = interactionTotal > 35
    ? english ? 'You talked quite a lot this week, so it feels more confident responding to you.' : '你们这一周聊得不少，它会更有底气接你的话。'
    : interactionTotal > 12
      ? english ? 'Your rhythm this week was easygoing, and it is slowly learning your pace.' : '你们这一周的节奏算是不紧不松，它在慢慢摸到你的节拍。'
      : english ? 'You did not talk much this week, and it kept waiting quietly for you.' : '这一周你们的对话不多，它一直安静等着你。'

  return `${moodLine}${eventLine}${cadenceLine}`
}

const createSummaryFallback = (pet: PetData, target: PetSummaryTarget) => {
  if (target === 'bond') return pet.memory.bond.summary
  if (target === 'recent-feeling') return pet.memory.bond.recentFeeling
  if (target === 'weekly') return pet.memory.relationship.weeklySummary?.trim() || buildDeterministicWeeklySummary(pet, Date.now())
  return pet.memory.daily[0]?.summary ?? (getLanguage(pet) === 'en-US' ? 'Today it is still learning your rhythm.' : '今天它还在继续熟悉你的节奏。')
}

export const generateCompanionSummary = async (pet: PetData, target: PetSummaryTarget) => {
  const fallback = createSummaryFallback(pet, target)
  const scene = {
    id: pet.memory.working.currentScene,
    action: 'idle' as const,
    text: fallback,
    attentionMode: 'passive-visible' as const
  }

  const reply = await generatePetReply(
    buildPetGenerationRequest({
      pet,
      scene,
      reminderPhase: 'none',
      kind: 'summary',
      summaryTarget: target
    }),
    {
      text: fallback,
      action: 'idle'
    }
  )

  return sanitizeText(reply.summary ?? reply.text, fallback)
}

export interface OracleDeckPrompt {
  id: string
  title: string
  titleEn: string
  // Preset summaries from the deck. Used as both the LLM seed (to anchor the
  // reading in the deck's intended theme) and as deterministic fallback if
  // the model is unavailable / returns junk.
  summaries: readonly string[]
  summariesEn: readonly string[]
}

const pickFallbackOracleSummary = (deck: OracleDeckPrompt, history: number, language: PetLanguage): string => {
  const list = language === 'en-US' ? deck.summariesEn : deck.summaries
  if (list.length === 0) return language === 'en-US' ? 'Stay with what you can do this hour.' : '先做这一小时能做的事。'
  return list[(history + list.length) % list.length]
}

// Oracle reading: a one-shot LLM-grounded "draw" from a themed deck. The deck
// preset acts as both the seed for the model (so the reading stays on theme)
// and the deterministic fallback when the model is offline. We treat it as a
// summary-style prompt because the tone we want is contemplative and short,
// not a chat back-and-forth.
export const generateOracleReading = async (
  pet: PetData,
  deck: OracleDeckPrompt,
  options?: { historyCount?: number }
): Promise<{ text: string; source: 'model' | 'fallback' }> => {
  const language = getLanguage(pet)
  const seed = pickFallbackOracleSummary(deck, options?.historyCount ?? 0, language)
  const deckTitle = language === 'en-US' ? deck.titleEn : deck.title
  const userInput = language === 'en-US'
    ? `Draw a single oracle reading from the "${deckTitle}" deck. Keep it to 1-2 short sentences, present-tense, and personal. Tone seed (do not quote verbatim, just match the vibe): ${seed}`
    : `给我从「${deckTitle}」这副签里抽一支，1-2 句短话、当下感、对我个人说。氛围参考（不要原样照抄，只要保持调性）：${seed}`

  const reply = await generatePetReply(
    buildPetGenerationRequest({
      pet,
      scene: {
        id: pet.memory.working.currentScene,
        action: 'idle',
        text: seed,
        attentionMode: 'passive-visible'
      },
      reminderPhase: 'none',
      kind: 'summary',
      summaryTarget: 'recent-feeling',
      userInput
    }),
    { text: seed, action: 'idle' }
  )

  const text = sanitizeText(reply.summary ?? reply.text, seed)
  return { text, source: reply.source === 'model' ? 'model' : 'fallback' }
}

export const generateConversationCommand = async (pet: PetData, userInput: string): Promise<PetGeneratedReply> => {
  const english = getLanguage(pet) === 'en-US'
  const fallback = {
    text: english ? `I am listening carefully to “${userInput.trim()}”. I will keep staying with you.` : `我有在认真听你说“${userInput.trim()}”。我会继续陪着你。`,
    action: 'talking' as const
  }

  return generatePetReply(
    buildPetGenerationRequest({
      pet,
      scene: {
        id: pet.memory.working.currentScene,
        action: 'talking',
        text: fallback.text,
        attentionMode: 'passive-visible'
      },
      reminderPhase: 'none',
      interactionType: 'chat',
      userInput,
      recentInteraction: null,
      kind: 'conversation-command'
    }),
    fallback
  )
}

const sanitizeLoopStep = (step: PetConversationLoopPlan['steps'][number]): PetConversationLoopPlan['steps'][number] => {
  if (step.kind === 'memory-update') return { kind: 'memory-update', memoryUpdate: step.memoryUpdate }
  if (step.kind === 'interaction') return { kind: 'interaction', interaction: step.interaction }
  if (step.kind === 'create-reminder') return { kind: 'create-reminder', reminder: step.reminder }
  if (step.kind === 'show.set-intent') return { kind: 'show.set-intent', show: step.show }
  if (step.kind === 'settings-update') return { kind: 'settings-update', settingsUpdate: step.settingsUpdate }
  if (step.kind === 'record-fact') return { kind: 'record-fact', fact: step.fact }
  if (step.kind === 'set-scene-hint') return { kind: 'set-scene-hint', sceneId: step.sceneId }
  return step
}

export const generateConversationLoop = async (
  request: PetGenerationRequest,
  fallback: Pick<PetGeneratedReply, 'text' | 'action'>,
  callbacks?: PetConversationStreamCallbacks
): Promise<PetConversationLoopPlan> => {
  try {
    const plan = await petPlatform.generateConversationLoop(request, callbacks)
    return {
      reply: sanitizeReply(plan?.reply, fallback),
      steps: Array.isArray(plan?.steps) ? plan.steps.slice(0, 3).map((step) => sanitizeLoopStep(step as PetConversationLoopPlan['steps'][number])) : [],
      source: plan?.source === 'model' ? 'model' : 'fallback'
    }
  } catch {
    return {
      reply: sanitizeReply(undefined, fallback),
      steps: [],
      source: 'fallback'
    }
  }
}
