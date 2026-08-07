import type { InteractionType, PetData, PetFactContextLine, PetGeneratedReply, PetGenerationKind, PetGenerationRequest, PetPromptContext, PetRecentInteraction, PetReminderIntensity, PetReminderPhase, PetSceneState, PetSummaryTarget, UserPreferenceMemory, PetLanguage } from '../types/pet'
import { extractFactCandidates } from './fact-extraction'
import { compareFactToHistory, normalizeFactKey } from './pet-facts'

interface BuildPromptContextInput {
  pet: PetData
  scene: PetSceneState
  reminderPhase: PetReminderPhase
  userInput?: string
  interactionType?: InteractionType
  recentInteraction?: PetRecentInteraction | null
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  kind?: PetGenerationKind
  summaryTarget?: PetSummaryTarget
  // Set by the proactive-recall scheduler when it wants the model to nudge
  // the user about a stale fact. We stash it on the prompt context as-is and
  // the prompt builder converts it into a 1-line directive.
  factRecall?: { key: string; latest: string; daysSince: number }
}

const formatFactValue = (value: number | string, unit?: string): string => {
  if (typeof value === 'number') {
    const trimmed = Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '')
    return unit ? `${trimmed} ${unit}` : trimmed
  }
  return value
}

const formatDelta = (delta: number, unit?: string): string => {
  const sign = delta > 0 ? '+' : ''
  const trimmed = Number.isInteger(delta) ? delta.toString() : delta.toFixed(2).replace(/\.?0+$/, '')
  return unit ? `${sign}${trimmed} ${unit}` : `${sign}${trimmed}`
}

/**
 * Re-runs the deterministic extractor on the latest user message and turns
 * any keys we already have history for into compact one-line context the
 * model can quote ("比前天还重 2kg 哦"). Anything brand-new is forwarded as
 * `isFirstTime` so the model can acknowledge "first time you tell me X".
 *
 * We intentionally do NOT extract on assistant-side text -- only what the
 * user just said is fair game, otherwise the pet would self-loop on its own
 * speculations.
 */
const buildFactContextLines = (pet: PetData, userInput?: string, language: PetLanguage = 'zh-CN'): PetFactContextLine[] | undefined => {
  const message = userInput?.trim()
  if (!message) return undefined
  const candidates = extractFactCandidates(message)
  if (candidates.length === 0) return undefined

  const lines: PetFactContextLine[] = []
  for (const candidate of candidates) {
    const key = normalizeFactKey(candidate.key)
    if (!key) continue

    // Probe history BEFORE we'd hypothetically write the new value. If the
    // ledger is empty for this key, mark it as a first-time observation so
    // the model gets a "newly tracked" signal rather than blank context.
    const comparison = compareFactToHistory(pet, key)
    const projected = formatFactValue(candidate.value, candidate.unit)
    if (!comparison) {
      lines.push({ key, current: projected, isFirstTime: true })
      continue
    }

    const previous = comparison.current
    const previousLabel = (() => {
      const days = Math.max(0, Math.round((Date.now() - new Date(previous.ts).getTime()) / 86_400_000))
      const label = language === 'en-US'
        ? days === 0 ? 'earlier today' : `${days} day${days === 1 ? '' : 's'} ago`
        : days === 0 ? '今天稍早' : `${days} 天前`
      return `${formatFactValue(previous.value, previous.unit)}, ${label}`
    })()

    let deltaStr: string | undefined
    let trend: PetFactContextLine['trend']
    if (typeof candidate.value === 'number' && typeof previous.value === 'number') {
      const diff = Number((candidate.value - previous.value).toFixed(2))
      deltaStr = formatDelta(diff, candidate.unit ?? previous.unit)
      trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'
    }

    lines.push({
      key,
      current: projected,
      previous: previousLabel,
      delta: deltaStr,
      trend,
      isFirstTime: false
    })
  }

  return lines.length > 0 ? lines : undefined
}

const resolveKind = (
  reminderPhase: PetReminderPhase,
  interactionType?: InteractionType,
  userInput?: string,
  forcedKind?: PetGenerationKind
): PetPromptContext['kind'] => {
  if (forcedKind) return forcedKind
  if (reminderPhase === 'alert' || reminderPhase === 'done' || reminderPhase === 'soon') return 'reminder'
  if (interactionType && interactionType !== 'idle') return interactionType === 'chat' || Boolean(userInput?.trim()) ? 'chat' : 'interaction'
  return 'scene'
}

const sortPreferences = (items: UserPreferenceMemory[]) =>
  [...items].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

export const buildPetPromptContext = ({
  pet,
  scene,
  reminderPhase,
  userInput,
  interactionType,
  recentInteraction,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  kind,
  summaryTarget,
  factRecall
}: BuildPromptContextInput): PetPromptContext => {
  const language = pet.ui.language ?? 'zh-CN'
  return {
    kind: resolveKind(reminderPhase, interactionType, userInput, kind),
    language,
    sceneId: scene.id,
    interactionType,
    userInput,
    activeReminderTitle,
    activeReminderIntensity,
    nearestReminderAt,
    nearestReminderIntensity,
    recentInteraction,
    summaryTarget,
    factContext: buildFactContextLines(pet, userInput, language),
    factRecall,
    pet: {
      ...pet,
      memory: {
        ...pet.memory,
        preferences: sortPreferences(pet.memory.preferences).slice(0, 6),
        profile: {
          ...pet.memory.profile,
          likes: pet.memory.profile.likes.slice(0, 4),
          dislikes: pet.memory.profile.dislikes.slice(0, 4),
          habits: pet.memory.profile.habits.slice(0, 4),
          comfortTopics: pet.memory.profile.comfortTopics.slice(0, 4)
        },
        companionPreferences: {
          ...pet.memory.companionPreferences,
          favoriteTopics: pet.memory.companionPreferences.favoriteTopics.slice(0, 4),
          recentTopics: pet.memory.companionPreferences.recentTopics.slice(0, 4),
          avoidPhrases: pet.memory.companionPreferences.avoidPhrases.slice(0, 4),
          learnedSpeechStyle: pet.memory.companionPreferences.learnedSpeechStyle.slice(0, 4)
        },
        events: pet.memory.events.slice(0, 6)
      }
    }
  }
}

export const buildPetGenerationRequest = (input: BuildPromptContextInput): PetGenerationRequest => ({
  context: buildPetPromptContext(input)
})

export const toFallbackReply = (scene: PetSceneState): Pick<PetGeneratedReply, 'text' | 'action'> => ({
  text: scene.text,
  action: scene.action
})
