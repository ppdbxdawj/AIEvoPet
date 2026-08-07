import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import { listen, type Event } from '@tauri-apps/api/event'
import type { CreateUserPetFromImageInput, PetPlatformApi } from './pet-platform'
import type {
  CalendarEventWriteInput,
  CalendarEventWriteResult,
  CreateReminderInput,
  PetAction,
  PetCodingEvent,
  PetCodingEventIngestResult,
  PetConversationIntent,
  PetConversationLoopPlan,
  PetConversationLoopStep,
  PetConversationStreamCallbacks,
  PetGeneratedReply,
  PetMemoryUpdate,
  PetModelConfig,
  PetModelHealth,
  PetModelServiceEnsureResult,
  PetReminderIntensity,
  PetSceneId,
  PetSettingsUpdate,
  PetFactInput,
  PetShowState,
  ReminderItem,
  WindowPosition,
  PetHitRegion,
  PetWindowBounds,
  PetWindowTeleported,
  WalkTick,
  PetLanguage
} from '../types/pet'
import type { DomainStateEnvelope, DomainStateKey, DomainStateMap } from '../types/domain'
import type { PetDiaryLedger } from '../types/diary'
import type { ImportedPetPackage } from '../types/pet-package'
import { getStickerById } from '../lib/sticker-registry'

const DEFAULT_MODEL_CONFIG: PetModelConfig = {
  enabled: true,
  provider: 'ollama',
  endpoint: 'http://127.0.0.1:11434',
  model: 'qwen3:4b-instruct',
  timeoutMs: 12_000
}

const MODEL_ACTIONS: PetAction[] = ['idle', 'happy', 'sleepy', 'hungry', 'talking', 'blush', 'alert']
const MODEL_INTERACTIONS: NonNullable<PetConversationIntent['interaction']>[] = ['feed', 'pet', 'sleep', 'wake', 'drink', 'bath', 'hold']
const MEMORY_UPDATE_KINDS: PetMemoryUpdate['kind'][] = ['preferred-name', 'like', 'dislike', 'habit', 'address-style', 'focus-support', 'comfort-topic', 'reminder-preference']
const SETTINGS_TARGETS: PetSettingsUpdate['target'][] = ['palette', 'wardrobe', 'pet-name', 'vacation-mode', 'boss-mode', 'nest-mode', 'strong-reminder']
const SCENE_IDS: PetSceneId[] = ['idle', 'focus', 'lonely', 'hungry', 'sleepy', 'sleeping', 'wake-up', 'pet-react', 'excited', 'reminder-soon', 'reminder-alert', 'reminder-done']

const reminderListeners = new Set<(reminder: ReminderItem) => void>()
const petUpdateListeners = new Set<(pet: unknown) => void>()
const remindersUpdateListeners = new Set<(reminders: ReminderItem[]) => void>()
const walkTickListeners = new Set<(tick: WalkTick) => void>()
const codingEventListeners = new Set<(event: PetCodingEvent) => void>()

const currentWindowLabel = () => {
  try {
    return getCurrentWebviewWindow().label
  } catch {
    return undefined
  }
}

const listenWithDispose = <T,>(event: string, handler: (payload: T) => void) => {
  let disposed = false
  let unlisten: null | (() => void) = null

  void listen<T>(event, (incoming: Event<T>) => {
    handler(incoming.payload)
  }).then((stop: () => void) => {
    if (disposed) {
      stop()
      return
    }
    unlisten = stop
  }).catch(() => {})

  return () => {
    disposed = true
    unlisten?.()
  }
}

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number) => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('timeout')), timeoutMs)
    })
  ])
}

const sanitizeHealth = (config: PetModelConfig, patch: Partial<PetModelHealth>): PetModelHealth => ({
  ok: false,
  enabled: config.enabled,
  provider: config.provider,
  endpoint: config.endpoint,
  model: config.model,
  ...patch
})

const sanitizeEnsureModelServiceResult = (result: Partial<PetModelServiceEnsureResult> | null | undefined): PetModelServiceEnsureResult => ({
  alreadyRunning: Boolean(result?.alreadyRunning),
  attemptedStart: Boolean(result?.attemptedStart),
  connected: Boolean(result?.connected),
  launchMethod: result?.launchMethod === 'app' || result?.launchMethod === 'cli' ? result.launchMethod : undefined,
  error: typeof result?.error === 'string' && result.error.trim() ? result.error.trim() : undefined
})

const getOllamaTags = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return []
  const models = (value as { models?: unknown }).models
  if (!Array.isArray(models)) return []

  return models
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const model = item as { name?: unknown; model?: unknown }
      const name = typeof model.name === 'string' ? model.name.trim() : ''
      const modelName = typeof model.model === 'string' ? model.model.trim() : ''
      return [name, modelName]
    })
    .filter((item, index, list): item is string => Boolean(item) && list.indexOf(item) === index)
}

const normalizeReminderIntensity = (value: unknown): PetReminderIntensity => value === 'low' || value === 'high' ? value : 'medium'

const normalizeReminder = (reminder: ReminderItem): ReminderItem => ({
  ...reminder,
  scheduledAt: (reminder as ReminderItem & { scheduled_at?: string }).scheduled_at ?? reminder.scheduledAt,
  createdAt: (reminder as ReminderItem & { created_at?: string }).created_at ?? reminder.createdAt,
  snoozeUntil: (reminder as ReminderItem & { snooze_until?: string }).snooze_until ?? reminder.snoozeUntil,
  intensity: normalizeReminderIntensity(reminder.intensity)
})

const normalizeCodingEvent = (event: PetCodingEvent): PetCodingEvent => ({
  ...event,
  summary: typeof event.summary === 'string' && event.summary.trim() ? event.summary.trim().slice(0, 220) : undefined,
  title: event.title.trim().slice(0, 120),
  createdAt: event.createdAt,
  metadata: event.metadata
    ? Object.fromEntries(Object.entries(event.metadata).filter(([, value]) => value !== undefined))
    : undefined
})

const getActiveReminderTime = (reminder: ReminderItem) => reminder.snoozeUntil ?? reminder.scheduledAt

const sortReminders = (reminders: ReminderItem[]) => reminders.slice().sort((a, b) => {
  const left = new Date(getActiveReminderTime(a)).getTime()
  const right = new Date(getActiveReminderTime(b)).getTime()
  return left - right
})

const parseReminderInput = (value: unknown): CreateReminderInput | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Partial<CreateReminderInput>
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 60) : ''
  const scheduledAt = typeof input.scheduledAt === 'string' ? input.scheduledAt : ''
  if (!title || !scheduledAt) return undefined
  if (Number.isNaN(new Date(scheduledAt).getTime())) return undefined
  return { title, scheduledAt, intensity: normalizeReminderIntensity(input.intensity) }
}

const parseMemoryUpdate = (value: unknown): PetMemoryUpdate | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Partial<PetMemoryUpdate>
  const kind = MEMORY_UPDATE_KINDS.includes(input.kind as PetMemoryUpdate['kind']) ? (input.kind as PetMemoryUpdate['kind']) : undefined
  const memoryValue = typeof input.value === 'string' ? input.value.trim().slice(0, 40) : ''
  if (!kind || !memoryValue) return undefined
  return { kind, value: memoryValue }
}

const parseSettingsUpdate = (value: unknown): PetSettingsUpdate | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Partial<PetSettingsUpdate>
  const target = SETTINGS_TARGETS.includes(input.target as PetSettingsUpdate['target'])
    ? (input.target as PetSettingsUpdate['target'])
    : undefined
  // Cap to 24 chars: enough for any palette id ("blueberry-milk"), wardrobe
  // id ("hat-bucket-hat") or 12-char pet name. Anything longer is junk.
  const settingsValue = typeof input.value === 'string' ? input.value.trim().slice(0, 24) : ''
  if (!target || !settingsValue) return undefined
  return { target, value: settingsValue }
}

const parseFactInput = (value: unknown): PetFactInput | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Partial<PetFactInput>
  const key = typeof input.key === 'string' ? input.key.trim().slice(0, 60) : ''
  if (!key) return undefined
  // Accept either a finite number or a string value. Numbers unlock the
  // delta/trend logic downstream; strings are stored as-is.
  let factValue: number | string | undefined
  if (typeof input.value === 'number' && Number.isFinite(input.value)) {
    factValue = input.value
  } else if (typeof input.value === 'string') {
    const trimmed = input.value.trim()
    if (trimmed) factValue = trimmed.slice(0, 120)
  }
  if (factValue === undefined) return undefined
  const unit = typeof input.unit === 'string' ? input.unit.trim().slice(0, 24) : undefined
  const confidence = typeof input.confidence === 'number' && Number.isFinite(input.confidence)
    ? Math.max(0, Math.min(1, input.confidence))
    : undefined
  const raw = typeof input.raw === 'string' ? input.raw.trim().slice(0, 200) : undefined
  return { key, value: factValue, unit, confidence, raw }
}

const parseConversationIntent = (value: unknown): PetConversationIntent | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Partial<PetConversationIntent>
  const kind = input.kind === 'interaction' || input.kind === 'reminder' || input.kind === 'memory' || input.kind === 'none' ? input.kind : undefined
  if (!kind || kind === 'none') return undefined

  const confidence = typeof input.confidence === 'number' && Number.isFinite(input.confidence)
    ? Math.max(0, Math.min(1, input.confidence))
    : undefined

  if (kind === 'interaction') {
    const interaction = MODEL_INTERACTIONS.includes(input.interaction as NonNullable<PetConversationIntent['interaction']>) ? input.interaction : undefined
    if (!interaction) return undefined
    return { kind, interaction, confidence }
  }

  if (kind === 'reminder') {
    const reminder = parseReminderInput(input.reminder)
    if (!reminder) return undefined
    return { kind, reminder, confidence }
  }

  const memoryUpdate = parseMemoryUpdate(input.memoryUpdate)
  if (!memoryUpdate) return undefined
  return { kind, memoryUpdate, confidence }
}

const parseShowState = (value: unknown): PetShowState | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Partial<PetShowState> & {
    bubble?: Partial<PetShowState['bubble']>
    expression?: Partial<PetShowState['expression']>
  }
  const bubbleText = typeof input.bubble?.text === 'string' ? input.bubble.text.trim().slice(0, 220) : ''
  if (!bubbleText) return undefined

  const intent = input.intent === 'companionship' || input.intent === 'nudge' || input.intent === 'celebrate' || input.intent === 'rest' || input.intent === 'dream'
    ? input.intent
    : 'companionship'
  const kind = input.bubble?.kind === 'thought' || input.bubble?.kind === 'dream' ? input.bubble.kind : 'speech'
  const tone = input.bubble?.tone === 'soft' || input.bubble?.tone === 'playful' || input.bubble?.tone === 'alert' ? input.bubble.tone : 'warm'
  const emphasis = input.bubble?.emphasis === 'low' || input.bubble?.emphasis === 'high' ? input.bubble.emphasis : 'medium'
  const ttlMs = typeof input.bubble?.ttlMs === 'number' && Number.isFinite(input.bubble.ttlMs)
    ? Math.max(1500, Math.min(9000, Math.round(input.bubble.ttlMs)))
    : undefined
  const eyes = input.expression?.eyes === 'soft' || input.expression?.eyes === 'smile' || input.expression?.eyes === 'sleepy' || input.expression?.eyes === 'sparkle' || input.expression?.eyes === 'alert'
    ? input.expression.eyes
    : 'neutral'
  const mouth = input.expression?.mouth === 'smile' || input.expression?.mouth === 'open' || input.expression?.mouth === 'pout' || input.expression?.mouth === 'sleepy'
    ? input.expression.mouth
    : 'neutral'
  const animKey = input.animKey === 'nudge' || input.animKey === 'bounce' || input.animKey === 'blush' || input.animKey === 'sleep' || input.animKey === 'alert'
    ? input.animKey
    : 'idle'
  const overlayIds = Array.isArray(input.overlayIds)
    ? input.overlayIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4)
    : undefined
  const palette = typeof input.palette === 'string' && input.palette.trim() ? input.palette.trim().slice(0, 40) : undefined

  // Sticker id is whitelisted to known bundled ids so the LLM can't invent
  // paths that would 404. In Phase A we don't actively prompt for it, but
  // we still parse so future Phase B work is a one-line prompt change.
  const stickerCandidate = typeof (input as { stickerId?: unknown }).stickerId === 'string'
    ? ((input as { stickerId?: string }).stickerId ?? '').trim()
    : ''
  const stickerId = stickerCandidate && getStickerById(stickerCandidate) ? stickerCandidate : undefined

  return {
    intent,
    bubble: {
      kind,
      text: bubbleText,
      tone,
      emphasis,
      ttlMs
    },
    expression: {
      eyes,
      mouth
    },
    palette,
    overlayIds,
    animKey,
    stickerId
  }
}

const parseGeneratedReply = (raw: string): PetGeneratedReply | null => {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? trimmed

  try {
    const parsed = JSON.parse(fenced) as Partial<PetGeneratedReply>
    if (typeof parsed.text !== 'string' || !parsed.text.trim()) return null
    if (!MODEL_ACTIONS.includes(parsed.action as PetAction)) return null

    return {
      text: parsed.text.trim().slice(0, 220),
      action: parsed.action as PetAction,
      toneTags: Array.isArray(parsed.toneTags) ? parsed.toneTags.filter((item): item is string => typeof item === 'string').slice(0, 6) : undefined,
      memoryHint: typeof parsed.memoryHint === 'string' && parsed.memoryHint.trim() ? parsed.memoryHint.trim().slice(0, 160) : undefined,
      memoryImportance: parsed.memoryImportance === 1 || parsed.memoryImportance === 2 || parsed.memoryImportance === 3 ? parsed.memoryImportance : undefined,
      memoryCategory: typeof parsed.memoryCategory === 'string' && ['milestone', 'people', 'work', 'health', 'mood', 'preference', 'general'].includes(parsed.memoryCategory) ? (parsed.memoryCategory as PetGeneratedReply['memoryCategory']) : undefined,
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim().slice(0, 220) : undefined,
      intent: parseConversationIntent(parsed.intent),
      show: parseShowState(parsed.show),
      source: 'model'
    }
  } catch {
    return null
  }
}

const parseConversationLoopStep = (value: unknown): PetConversationLoopStep | null => {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<PetConversationLoopStep>

  if (input.kind === 'memory-update') {
    const memoryUpdate = parseMemoryUpdate((input as Extract<PetConversationLoopStep, { kind: 'memory-update' }>).memoryUpdate)
    return memoryUpdate ? { kind: 'memory-update', memoryUpdate } : null
  }

  if (input.kind === 'interaction') {
    const interaction = MODEL_INTERACTIONS.includes((input as Extract<PetConversationLoopStep, { kind: 'interaction' }>).interaction)
      ? (input as Extract<PetConversationLoopStep, { kind: 'interaction' }>).interaction
      : undefined
    return interaction ? { kind: 'interaction', interaction } : null
  }

  if (input.kind === 'create-reminder') {
    const reminder = parseReminderInput((input as Extract<PetConversationLoopStep, { kind: 'create-reminder' }>).reminder)
    return reminder ? { kind: 'create-reminder', reminder } : null
  }

  if (input.kind === 'set-scene-hint') {
    const sceneId = SCENE_IDS.includes((input as Extract<PetConversationLoopStep, { kind: 'set-scene-hint' }>).sceneId)
      ? (input as Extract<PetConversationLoopStep, { kind: 'set-scene-hint' }>).sceneId
      : undefined
    return sceneId ? { kind: 'set-scene-hint', sceneId } : null
  }

  if (input.kind === 'settings-update') {
    const settingsUpdate = parseSettingsUpdate(
      (input as Extract<PetConversationLoopStep, { kind: 'settings-update' }>).settingsUpdate
    )
    return settingsUpdate ? { kind: 'settings-update', settingsUpdate } : null
  }

  if (input.kind === 'record-fact') {
    const fact = parseFactInput(
      (input as Extract<PetConversationLoopStep, { kind: 'record-fact' }>).fact
    )
    return fact ? { kind: 'record-fact', fact } : null
  }

  return null
}

const parseConversationLoopPlan = (raw: string): PetConversationLoopPlan | null => {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? trimmed

  try {
    const parsed = JSON.parse(fenced) as Partial<PetConversationLoopPlan> & { reply?: Partial<PetConversationLoopPlan['reply']> }
    if (!parsed.reply || typeof parsed.reply.text !== 'string' || !parsed.reply.text.trim()) return null
    if (!MODEL_ACTIONS.includes(parsed.reply.action as PetAction)) return null
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.map(parseConversationLoopStep).filter((item): item is PetConversationLoopStep => Boolean(item)).slice(0, 3)
      : []

    return {
      reply: {
        text: parsed.reply.text.trim().slice(0, 220),
        action: parsed.reply.action as PetAction,
        toneTags: Array.isArray(parsed.reply.toneTags) ? parsed.reply.toneTags.filter((item): item is string => typeof item === 'string').slice(0, 6) : undefined,
        memoryHint: typeof parsed.reply.memoryHint === 'string' && parsed.reply.memoryHint.trim() ? parsed.reply.memoryHint.trim().slice(0, 160) : undefined,
        memoryImportance: parsed.reply.memoryImportance === 1 || parsed.reply.memoryImportance === 2 || parsed.reply.memoryImportance === 3 ? parsed.reply.memoryImportance : undefined,
        memoryCategory: typeof parsed.reply.memoryCategory === 'string' && ['milestone', 'people', 'work', 'health', 'mood', 'preference', 'general'].includes(parsed.reply.memoryCategory) ? (parsed.reply.memoryCategory as PetGeneratedReply['memoryCategory']) : undefined,
        show: parseShowState(parsed.reply.show)
      },
      steps,
      source: 'model'
    }
  } catch {
    return null
  }
}

const parseOllamaGenerateResponse = (value: unknown): string => {
  if (!value || typeof value !== 'object') return ''
  const response = (value as { response?: unknown }).response
  return typeof response === 'string' ? response : ''
}

const decodeJsonStringFragment = (raw: string, start: number): string => {
  let output = ''
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index]
    if (char === '"') break
    if (char !== '\\') {
      output += char
      continue
    }

    index += 1
    const escaped = raw[index]
    if (!escaped) break
    if (escaped === '"' || escaped === '\\' || escaped === '/') output += escaped
    else if (escaped === 'b') output += '\b'
    else if (escaped === 'f') output += '\f'
    else if (escaped === 'n') output += '\n'
    else if (escaped === 'r') output += '\r'
    else if (escaped === 't') output += '\t'
    else if (escaped === 'u') {
      const hex = raw.slice(index + 1, index + 5)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break
      output += String.fromCharCode(parseInt(hex, 16))
      index += 4
    } else {
      output += escaped
    }
  }
  return output
}

const extractPartialGeneratedText = (raw: string): string => {
  const matches = [...raw.matchAll(/"text"\s*:\s*"/g)]
  const text = matches
    .map((match) => decodeJsonStringFragment(raw, (match.index ?? 0) + match[0].length).trim())
    .filter(Boolean)
    .at(-1)
  return text ? text.slice(0, 220) : ''
}

// Ollama defaults are too small for our prompts: num_predict=128 truncates the
// JSON mid-string (especially with format='json' which forces strict closing
// brackets); num_ctx=2048 silently drops the schema portion of large prompts.
// Both lead to JSON.parse failures upstream and the user sees the fallback
// reply ("完成啦" etc.) without any visible error. We size these to cover the
// largest prompt in this codebase (createLoopPrompt with full schema +
// fact-context + weekly events) plus a comfortable response budget.
const OLLAMA_NUM_PREDICT = 1024
const OLLAMA_NUM_CTX = 4096
const OLLAMA_TEMPERATURE = 0.7
// One-shot retry budget when num_predict cut the response off mid-JSON.
// Doubling once is enough for ~99% of our prompts; if doubled output still
// hits the limit we bail to the caller's fallback so we don't loop.
const OLLAMA_RETRY_NUM_PREDICT = 2048

const callOllamaGenerate = async (
  config: PetModelConfig,
  prompt: string,
  numPredict: number,
  signal?: AbortSignal
) => {
  const response = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
      format: 'json',
      options: {
        num_predict: numPredict,
        num_ctx: OLLAMA_NUM_CTX,
        temperature: OLLAMA_TEMPERATURE
      }
    }),
    signal
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json() as Record<string, unknown>
  const text = parseOllamaGenerateResponse(body)
  return { text, doneReason: body.done_reason }
}

const requestOllamaJson = async (config: PetModelConfig, prompt: string, signal?: AbortSignal): Promise<string> => {
  const first = await callOllamaGenerate(config, prompt, OLLAMA_NUM_PREDICT, signal)
  if (first.doneReason !== 'length') return first.text

  // B1: response was cut off mid-JSON. Retry once with doubled num_predict
  // before giving up. We log both attempts so devtools can show whether the
  // prompt is genuinely too large or just on the edge.
  console.warn('[ollama] response truncated by num_predict; retrying with doubled budget', {
    model: config.model,
    promptChars: prompt.length,
    firstResponseChars: first.text.length
  })
  try {
    const retry = await callOllamaGenerate(config, prompt, OLLAMA_RETRY_NUM_PREDICT, signal)
    if (retry.doneReason === 'length') {
      console.warn('[ollama] response still truncated after retry; falling back', {
        retryResponseChars: retry.text.length
      })
    }
    return retry.text
  } catch (error) {
    console.warn('[ollama] retry failed, returning original truncated text', error)
    return first.text
  }
}

const requestOllamaJsonStream = async (
  config: PetModelConfig,
  prompt: string,
  callbacks?: PetConversationStreamCallbacks,
  signal?: AbortSignal
): Promise<string> => {
  const response = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: true,
      format: 'json',
      options: {
        num_predict: OLLAMA_NUM_PREDICT,
        num_ctx: OLLAMA_NUM_CTX,
        temperature: OLLAMA_TEMPERATURE
      }
    }),
    signal
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (!response.body) return requestOllamaJson(config, prompt, signal)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let raw = ''
  let lastPartial = ''
  let doneReason: unknown

  const ingestLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const chunk = JSON.parse(trimmed) as { response?: unknown; done?: unknown; done_reason?: unknown }
    raw += typeof chunk.response === 'string' ? chunk.response : ''
    if (chunk.done_reason !== undefined) doneReason = chunk.done_reason

    const partial = extractPartialGeneratedText(raw)
    if (partial && partial !== lastPartial) {
      lastPartial = partial
      callbacks?.onBubbleText?.(partial)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    pending += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) ingestLine(line)
    if (done) break
  }

  if (pending.trim()) ingestLine(pending)
  if (doneReason === 'length') {
    console.warn('[ollama] streamed response truncated by num_predict; consider raising OLLAMA_NUM_PREDICT', {
      model: config.model,
      promptChars: prompt.length,
      responseChars: raw.length
    })
  }
  return raw
}

const getPromptLanguage = (payload: any): PetLanguage => payload?.context?.language === 'en-US' ? 'en-US' : 'zh-CN'
const isEnglishPayload = (payload: any) => getPromptLanguage(payload) === 'en-US'

const fallbackReply = (payload: any): PetGeneratedReply => {
  const context = payload?.context ?? {}
  const english = isEnglishPayload(payload)
  const kind = context.kind
  const sceneId = typeof context.sceneId === 'string' ? context.sceneId : 'idle'
  const reminderTitle = typeof context.activeReminderTitle === 'string' ? context.activeReminderTitle.trim() : ''
  const input = typeof context.userInput === 'string' ? context.userInput.trim() : ''
  const name = typeof context?.pet?.personality?.name === 'string' ? context.pet.personality.name : (english ? 'Bobo' : '啵啵')
  const preferredName = typeof context?.pet?.memory?.profile?.preferredName === 'string' ? context.pet.memory.profile.preferredName.trim() : ''
  const focusSupportStyle = context?.pet?.memory?.companionPreferences?.focusSupportStyle
  const reminderStyle = context?.pet?.memory?.companionPreferences?.reminderStyle
  const comfortTopics = Array.isArray(context?.pet?.memory?.profile?.comfortTopics) ? context.pet.memory.profile.comfortTopics : []
  const userCue = preferredName || (english ? 'you' : '你')
  const defaultThing = english ? 'this' : '这件事'

  if (kind === 'reminder') {
    if (sceneId === 'reminder-done') {
      return {
        text: english
          ? preferredName ? `Nice, ${preferredName} finished “${reminderTitle || defaultThing}”. I am marking a tiny win for you.` : `Nice, ${defaultThing} is done. I am marking a tiny win for you.`
          : preferredName ? `好耶，${preferredName}把“${reminderTitle || defaultThing}”做完啦，我给你记一朵小红花。` : `好耶，这件事做完啦，我给你记一朵小红花。`,
        action: 'happy',
        show: {
          intent: 'celebrate',
          bubble: {
            kind: 'speech',
            text: english ? preferredName ? `Done, ${preferredName}` : 'Done' : preferredName ? `完成啦，${preferredName}` : '完成啦',
            tone: 'playful',
            emphasis: 'medium',
            ttlMs: 5600
          },
          expression: {
            eyes: 'sparkle',
            mouth: 'smile'
          },
          animKey: 'bounce'
        },
        source: 'fallback'
      }
    }

    if (sceneId === 'reminder-soon') {
      return {
        text: english
          ? reminderTitle ? `A gentle heads-up: “${reminderTitle}” is coming up soon.` : 'A gentle heads-up: something is coming up soon.'
          : reminderTitle ? `我先轻轻提醒一下，待会儿别忘了“${reminderTitle}”。` : '我先轻轻提醒一下，待会儿还有件事哦。',
        action: 'talking',
        show: {
          intent: 'nudge',
          bubble: {
            kind: 'thought',
            text: english ? reminderTitle ? `Remember ${reminderTitle} soon` : 'Something is coming up' : reminderTitle ? `待会儿记得 ${reminderTitle}` : '待会儿有事哦',
            tone: 'soft',
            emphasis: 'low',
            ttlMs: 6000
          },
          expression: {
            eyes: 'soft',
            mouth: 'neutral'
          },
          animKey: 'nudge'
        },
        source: 'fallback'
      }
    }

    return {
      text: english
        ? reminderStyle === 'gentle'
          ? reminderTitle ? `${userCue}, it is time for “${reminderTitle}”. I will stay nearby while you start.` : `${userCue}, it is time. I will stay nearby while you start.`
          : reminderTitle ? `Time to handle “${reminderTitle}”. I will keep a serious little watch.` : 'It is time. I will keep a serious little watch this round.'
        : reminderStyle === 'gentle'
          ? reminderTitle ? `${userCue}，到“${reminderTitle}”啦，我在旁边陪你开个头。` : `${userCue}，时间到啦，我陪你把这件事开始掉。`
          : reminderTitle ? `该处理“${reminderTitle}”啦，我先认真盯你一下。` : '时间到啦，这次我会认真提醒你。',
      action: 'alert',
      show: {
        intent: 'nudge',
        bubble: {
          kind: 'thought',
          text: english ? reminderTitle ? `Start ${reminderTitle}` : 'Time to start' : reminderTitle ? `现在处理 ${reminderTitle}` : '现在该开始啦',
          tone: 'alert',
          emphasis: 'high',
          ttlMs: 6200
        },
        expression: {
          eyes: 'alert',
          mouth: 'open'
        },
        animKey: 'alert'
      },
      source: 'fallback'
    }
  }

  if (kind === 'chat' && input) {
    return {
      text: english
        ? comfortTopics.length > 0 ? `It sounds like this matters to you. If you want, I can keep talking with you about ${comfortTopics[0]}.` : 'I hear you. If you want to keep going, I am right here with you.'
        : comfortTopics.length > 0 ? `听起来你现在挺在意这件事的。要是你想，我可以继续陪你聊聊${comfortTopics[0]}。` : '我听明白你在说这个了。你要是想继续往下说，我就在这接着听。',
      action: 'talking',
      show: {
        intent: 'companionship',
        bubble: {
          kind: 'speech',
          text: english ? comfortTopics.length > 0 ? `Let us keep talking about ${comfortTopics[0]}` : 'I am listening' : comfortTopics.length > 0 ? `继续聊聊${comfortTopics[0]}` : '我在听',
          tone: 'warm',
          emphasis: 'medium',
          ttlMs: 5200
        },
        expression: {
          eyes: 'soft',
          mouth: 'open'
        },
        animKey: 'idle'
      },
      source: 'fallback'
    }
  }

  if (kind === 'interaction') {
    return {
      text: english ? 'I tucked that little moment away. The whole pet feels a bit softer now.' : '我把这一下认真收好了，整只都跟着软了一点。',
      action: 'happy',
      show: {
        intent: 'celebrate',
        bubble: {
          kind: 'speech',
          text: english ? 'Got it' : '收到啦',
          tone: 'playful',
          emphasis: 'medium',
          ttlMs: 5000
        },
        expression: {
          eyes: 'smile',
          mouth: 'smile'
        },
        animKey: 'bounce'
      },
      source: 'fallback'
    }
  }

  if (sceneId === 'focus') {
    return {
      text: english ? focusSupportStyle === 'quiet' ? 'You focus first. I will curl up nearby and keep quiet.' : 'You do your thing. I will stay here, and I will still be here when you look up.' : focusSupportStyle === 'quiet' ? '你先专心，我缩在旁边安静陪着。' : '你先忙你的，我会乖乖守着，等你抬头时我还在。',
      action: 'idle',
      show: {
        intent: 'companionship',
        bubble: {
          kind: 'thought',
          text: english ? focusSupportStyle === 'quiet' ? 'Quietly here' : 'Keeping watch nearby' : focusSupportStyle === 'quiet' ? '我安静陪着' : '我在旁边守着',
          tone: 'soft',
          emphasis: 'low',
          ttlMs: 5600
        },
        expression: {
          eyes: 'soft',
          mouth: 'neutral'
        },
        animKey: 'idle'
      },
      source: 'fallback'
    }
  }

  if (sceneId === 'lonely') {
    return {
      text: english ? `${name} quietly scooted a little closer, hoping ${preferredName || 'you'} would notice.` : preferredName ? `${name}刚刚偷偷往${preferredName}这边蹭了一点，想被你注意到。` : `${name}刚刚偷偷往你这边蹭了一点，想被你注意到。`,
      action: 'talking',
      show: {
        intent: 'nudge',
        bubble: {
          kind: 'thought',
          text: english ? preferredName ? `Hoping ${preferredName} notices me` : 'Hoping you notice me' : preferredName ? `想让${preferredName}看看我` : '想被你看一眼',
          tone: 'warm',
          emphasis: 'medium',
          ttlMs: 5600
        },
        expression: {
          eyes: 'smile',
          mouth: 'pout'
        },
        animKey: 'nudge'
      },
      source: 'fallback'
    }
  }

  return {
    text: english ? 'I will stay quietly with you for now. You will see me whenever you look back.' : '我先安静陪着你，你一回头就能看到我。',
    action: 'idle',
    show: {
      intent: 'companionship',
      bubble: {
        kind: 'thought',
        text: english ? 'I am here' : '我在这儿',
        tone: 'soft',
        emphasis: 'low',
        ttlMs: 5200
      },
      expression: {
        eyes: 'soft',
        mouth: 'neutral'
      },
      animKey: 'idle'
    },
    source: 'fallback'
  }
}

const fallbackLoopPlan = (payload: any): PetConversationLoopPlan => {
  const fallback = fallbackReply(payload)
  return {
    reply: {
      text: fallback.text,
      action: fallback.action
    },
    steps: [],
    source: 'fallback'
  }
}

const modelInterruptedLoopPlan = (text?: string, language: PetLanguage = 'zh-CN'): PetConversationLoopPlan => {
  const fallbackText = language === 'en-US'
    ? 'I got briefly stuck, so I will not pretend I understood everything.'
    : '我这边刚刚卡了一下，先不乱接话。'
  const resolvedText = text ?? fallbackText
  return {
    reply: {
      text: resolvedText,
      action: 'talking',
      show: {
        intent: 'companionship',
        bubble: {
          kind: 'thought',
          text: resolvedText,
          tone: 'soft',
          emphasis: 'low',
          ttlMs: 4200
        },
        expression: {
          eyes: 'soft',
          mouth: 'neutral'
        },
        animKey: 'idle'
      }
    },
    steps: [],
    source: 'model'
  }
}

const createPrompt = (payload: any) => {
  const context = payload?.context ?? {}
  const english = getPromptLanguage(payload) === 'en-US'
  const pet = context?.pet ?? {}
  const profile = pet?.memory?.profile ?? {}
  const preferences = Array.isArray(pet?.memory?.preferences) ? pet.memory.preferences.slice(0, 3) : []
  const companionPreferences = pet?.memory?.companionPreferences ?? {}
  const events = Array.isArray(pet?.memory?.events) ? pet.memory.events.slice(0, 2) : []
  const working = pet?.memory?.working ?? {}
  const bond = pet?.memory?.bond ?? {}
  const daily = Array.isArray(pet?.memory?.daily) ? pet.memory.daily[0] : undefined
  const chatTurn = context.kind === 'chat' || context.kind === 'conversation-loop'

  const lines = [
    english ? 'You are a desktop pet companion assistant. You must return JSON only, with no explanation and no markdown code fence.' : '你是一只桌面宠物陪伴助手。你必须只返回 JSON，不要返回解释，不要加 markdown 代码块。',
    english ? 'Output format: {"text": string, "action": "idle|happy|sleepy|hungry|talking|blush|alert", "toneTags"?: string[], "memoryHint"?: string, "memoryImportance"?: 1|2|3, "memoryCategory"?: "milestone|people|work|health|mood|preference|general", "summary"?: string, "intent"?: { "kind": "none|interaction|reminder|memory", "confidence"?: number, "interaction"?: "feed|pet|sleep|wake|drink|bath|hold", "reminder"?: { "title": string, "scheduledAt": string }, "memoryUpdate"?: { "kind": "preferred-name|like|dislike|habit|address-style|focus-support|comfort-topic|reminder-preference", "value": string } }, "show"?: { "intent": "companionship|nudge|celebrate|rest|dream", "bubble": { "kind": "speech|thought|dream", "text": string, "tone": "soft|warm|playful|alert", "emphasis"?: "low|medium|high", "ttlMs"?: number }, "expression": { "eyes": "neutral|soft|smile|sleepy|sparkle|alert", "mouth": "neutral|smile|open|pout|sleepy" }, "animKey"?: "idle|nudge|bounce|blush|sleep|alert", "palette"?: string, "overlayIds"?: string[] } }' : '输出格式: {"text": string, "action": "idle|happy|sleepy|hungry|talking|blush|alert", "toneTags"?: string[], "memoryHint"?: string, "memoryImportance"?: 1|2|3, "memoryCategory"?: "milestone|people|work|health|mood|preference|general", "summary"?: string, "intent"?: { "kind": "none|interaction|reminder|memory", "confidence"?: number, "interaction"?: "feed|pet|sleep|wake|drink|bath|hold", "reminder"?: { "title": string, "scheduledAt": string }, "memoryUpdate"?: { "kind": "preferred-name|like|dislike|habit|address-style|focus-support|comfort-topic|reminder-preference", "value": string } }, "show"?: { "intent": "companionship|nudge|celebrate|rest|dream", "bubble": { "kind": "speech|thought|dream", "text": string, "tone": "soft|warm|playful|alert", "emphasis"?: "low|medium|high", "ttlMs"?: number }, "expression": { "eyes": "neutral|soft|smile|sleepy|sparkle|alert", "mouth": "neutral|smile|open|pout|sleepy" }, "animKey"?: "idle|nudge|bounce|blush|sleep|alert", "palette"?: string, "overlayIds"?: string[] } }',
    english ? 'Language: all natural-language fields must be English. Keep JSON keys and enum values exactly as specified.' : '语言: 所有自然语言字段必须使用简体中文。JSON key 和枚举值保持上面的英文 schema，不要翻译。',
    english ? 'Requirements: use 1-2 short English sentences, like a familiar companion responding from the desktop. A little pet-like warmth is okay, but do not be cutesy every sentence, do not use the name every sentence, and do not sound like roleplay dialogue.' : '要求: 文本使用简体中文，1-2句，像熟一点的搭子在桌边接话；允许轻微宠物感，但不要每句都撒娇、不要每句都叫名字、不要像角色台词。',
    english ? 'Priority: respond to what the user just said first, then move the conversation forward half a step. Light confirmation, empathy, or a gentle follow-up is okay, but do not repeat the input and do not write a report.' : '优先级: 先回应用户此刻的话，再自然推进半步。可以轻确认、轻共情、轻追问，但不要复述输入，不要写总结报告。',
    english ? 'intent can be non-none only when the user clearly expresses something they want you to do. For vague statements, memories, hypotheticals, jokes, or hesitation, return intent.kind = none.' : '只有在用户明确表达“想让你做什么”时，intent 才能不是 none。模糊表达、回忆、假设、玩笑、犹豫句一律返回 intent.kind = none。',
    english ? 'If returning interaction, it can only be feed|pet|sleep|wake|drink|bath|hold; if returning reminder, include a clear title and ISO scheduledAt; if returning memory, extract only preferred-name|like|dislike|habit|address-style|focus-support|comfort-topic|reminder-preference.' : '如果返回 interaction，只能是 feed|pet|sleep|wake|drink|bath|hold；如果返回 reminder，必须给出明确 title 和 ISO scheduledAt；如果返回 memory，只能提取 preferred-name|like|dislike|habit|address-style|focus-support|comfort-topic|reminder-preference。',
    english ? 'scene: keep it companion-like, short, natural, and present.' : 'scene: 以陪伴感为主，短句、自然、有当下感。',
    english ? 'chat: do not merely repeat the user; receive the message like a real conversation, respond, then carry it forward one sentence.' : 'chat: 不要只重复用户原话；像真实对话一样接住、回应、再往前带一句。',
    english ? 'reminder: follow the reminder style, whether softer, balanced, or more direct, but keep it companion-like rather than alarm-like.' : 'reminder: 根据提醒风格决定是轻一点、平衡一点还是更直接一点，但仍然像陪伴，不像闹钟。',
    english ? "summary: write like an observation from long-term companionship, not a system log; if summaryTarget=weekly, use 2-3 sentences to summarize the week's key events, overall mood, and rhythm without dumping data." : 'summary: 像长期相处后的观察，不要写成系统日志；如果 summaryTarget=weekly，请用 2-3 句概括过去这一周的关键事件、整体氛围与你们的节奏，不堆砌数据。',
    english ? 'memoryHint: fill only when the user shared a fact or event worth remembering. Do not store emotional paraphrases or pleasantries; write a short third-person record, at most 60 English words.' : 'memoryHint: 只在用户分享了值得记住的事实/事件时填，不写情绪复述、不写客套话；写成简短第三人称记录（例如"用户提到妈妈住院了"），最多 60 字。',
    english ? 'memoryImportance: 1=daily chat, 2=a small thing worth keeping in mind, 3=major life event/family health/important milestone. Provide it with memoryHint.' : 'memoryImportance: 1=日常聊天，2=值得放心里的小事，3=人生大事/家人健康/重大节点。配 memoryHint 一起给。',
    english ? 'memoryCategory: choose one of milestone|people|work|health|mood|preference|general.' : 'memoryCategory: 任选 milestone(里程碑)|people(亲近的人)|work(工作)|health(健康)|mood(强情绪)|preference(口味偏好)|general(其它)。',
    english ? 'Fact memory: if context includes a fact ledger, compare it naturally like a familiar companion, but do not read out data mechanically. If no fact ledger is provided, do not invent facts. If isFirstTime=true, lightly acknowledge that you will remember it.' : '事实记忆: 如果上下文给了「事实对账」，请像熟人一样自然地把对比说出来（例如"诶比前天还重 2kg，是偷吃啥啦？"），但不要像念数据；没有给就别瞎编。如果是 isFirstTime=true，可以轻轻"记下来"。',
    `${english ? 'Task kind' : '任务类型'}: ${String(context.kind ?? 'scene')}`,
    `${english ? 'Scene' : '场景'}: ${String(context.sceneId ?? 'idle')}`,
    `${english ? 'Interaction type' : '互动类型'}: ${String(context.interactionType ?? '')}`,
    `${english ? 'Current reminder' : '当前提醒'}: ${String(context.activeReminderTitle ?? '')}`,
    `${english ? 'Nearest reminder time' : '最近提醒时间'}: ${String(context.nearestReminderAt ?? '')}`,
    `${english ? 'User input' : '用户输入'}: ${String(context.userInput ?? '')}`,
    `${english ? 'Pet name' : '宠物名字'}: ${String(pet?.personality?.name ?? (english ? 'Bobo' : '啵啵'))}`,
    `${english ? 'Core personality' : '宠物核心性格'}: ${String(pet?.personality?.corePersonality ?? '')}`,
    `${english ? 'Speaking style' : '说话风格'}: ${Array.isArray(pet?.personality?.speakingStyle) ? pet.personality.speakingStyle.join(english ? ', ' : '，') : ''}`,
    `${english ? 'Preferred user name' : '偏好称呼'}: ${String(profile.preferredName ?? '')}`,
    `${english ? 'User likes' : '用户喜欢'}: ${Array.isArray(profile.likes) ? profile.likes.slice(0, 2).join(english ? ', ' : '，') : ''}`,
    `${english ? 'User dislikes' : '用户不喜欢'}: ${Array.isArray(profile.dislikes) ? profile.dislikes.slice(0, 2).join(english ? ', ' : '，') : ''}`,
    `${english ? 'Comfort topics' : '安慰话题'}: ${Array.isArray(profile.comfortTopics) ? profile.comfortTopics.slice(0, 2).join(english ? ', ' : '，') : ''}`,
    `${english ? 'Remembered preferences' : '记住的偏好'}: ${preferences.map((item: { summary: string }) => item.summary).join(english ? '; ' : '；')}`,
    `${english ? 'Interaction style' : '互动风格'}: ${String(companionPreferences.interactionStyle ?? '')}`,
    `${english ? 'Reminder style' : '提醒风格'}: ${String(companionPreferences.reminderStyle ?? '')}`,
    `${english ? 'Focus support style' : '专注陪伴方式'}: ${String(companionPreferences.focusSupportStyle ?? '')}`,
    `${english ? 'Low-mood support style' : '低落时陪伴方式'}: ${String(companionPreferences.lowMoodSupportStyle ?? '')}`,
    `${english ? 'Current mode' : '当前模式'}: ${String(working.currentMode ?? '')}`,
    `${english ? 'Current time period' : '当前时段'}: ${String(working.currentTimePeriod ?? '')}`,
    `${english ? 'Recent events' : '最近事件'}: ${events.map((item: { type: string; summary: string }) => `${item.type}:${item.summary}`).join(english ? '; ' : '；')}`
  ]

  // Inject fact-comparison rows when present. Uses a compact one-line per
  // fact format so even tiny local models can quote it back.
  const factContext: Array<{ key: string; current: string; previous?: string; delta?: string; trend?: string; isFirstTime?: boolean }> = Array.isArray(context.factContext) ? context.factContext : []
  if (factContext.length > 0) {
    const rows = factContext.map((line) => {
      if (line.isFirstTime) return `${line.key}=${line.current} (${english ? 'first time hearing this' : '第一次听你说'})`
      if (line.previous && line.delta) return `${line.key}=${line.current} (${english ? 'previous' : '前值'} ${line.previous}, ${line.delta})`
      if (line.previous) return `${line.key}=${line.current} (${english ? 'previous' : '前值'} ${line.previous})`
      return `${line.key}=${line.current}`
    })
    lines.push(`${english ? 'Fact ledger' : '事实对账'}: ${rows.join(' | ')}`)
  }

  // Proactive recall: the runtime explicitly asked the model to bring up a
  // stale fact. Pin it as a directive so the model centres the reply on it.
  if (context.factRecall && typeof context.factRecall === 'object') {
    const recall = context.factRecall as { key: string; latest: string; daysSince: number }
    lines.push(english
      ? `Proactive recall: the user has not mentioned ${recall.key} for ${recall.daysSince} days; the latest record is ${recall.latest}. Bring it up naturally in one everyday sentence, without interrogating or listing data.`
      : `主动回忆: 用户已经 ${recall.daysSince} 天没说 ${recall.key} 了，最近一次记录是 ${recall.latest}。请用一句日常的话顺势提一下，不要质问，不要列数据。`)
  }

  if (!chatTurn) {
    lines.push(`${english ? 'Companion relationship summary' : '陪伴关系总结'}: ${String(bond.summary ?? '')}`)
    lines.push(`${english ? 'Recent feeling' : '最近感受'}: ${String(bond.recentFeeling ?? '')}`)
    lines.push(`${english ? 'Daily summary' : '今日总结'}: ${String(daily?.summary ?? '')}`)
    lines.push(`${english ? 'Frequent topics' : '高频主题'}: ${Array.isArray(companionPreferences.favoriteTopics) ? companionPreferences.favoriteTopics.slice(0, 3).join(english ? ', ' : '，') : ''}`)
    lines.push(`${english ? 'Recent topics' : '最近主题'}: ${Array.isArray(companionPreferences.recentTopics) ? companionPreferences.recentTopics.slice(0, 3).join(english ? ', ' : '，') : ''}`)
    lines.push(`${english ? 'Avoid phrases' : '避免表达'}: ${Array.isArray(companionPreferences.avoidPhrases) ? companionPreferences.avoidPhrases.slice(0, 3).join(english ? ', ' : '，') : ''}`)
    lines.push(`${english ? 'Common snooze minutes' : '常用顺延分钟'}: ${String(pet?.memory?.reminderStrategy?.preferredSnoozeMinutes ?? '')}`)
    lines.push(`${english ? 'Reminder completion count' : '提醒完成次数'}: ${String(pet?.memory?.reminderStrategy?.completionCount ?? '')}`)
    lines.push(`${english ? 'Reminder snooze count' : '提醒顺延次数'}: ${String(pet?.memory?.reminderStrategy?.snoozeCount ?? '')}`)
    lines.push(`${english ? 'Reminder ignore count' : '提醒忽略次数'}: ${String(pet?.memory?.reminderStrategy?.ignoreCount ?? '')}`)
  }

  // For weekly summaries the model needs visibility into the past 7 days, not
  // just the most recent 2 events; we rebuild a richer slice on-the-fly so the
  // summary can talk about specific moments rather than vague vibes.
  if (context.summaryTarget === 'weekly') {
    const cutoff = Date.now() - 7 * 86_400_000
    const weeklyEvents = Array.isArray(pet?.memory?.events)
      ? pet.memory.events.filter((event: { ts: string; importance?: number }) => {
          const ts = new Date(event.ts).getTime()
          return Number.isFinite(ts) && ts >= cutoff && (event.importance ?? 1) >= 2
        }).slice(0, 8)
      : []
    const weeklyDaily = Array.isArray(pet?.memory?.daily)
      ? pet.memory.daily.filter((entry: { date: string }) => {
          const ts = new Date(entry.date).getTime()
          return Number.isFinite(ts) && ts >= cutoff
        }).slice(0, 7)
      : []
    lines.push(`${english ? 'Important events this week' : '本周重要事件'}: ${weeklyEvents.map((event: { type: string; summary: string; category?: string }) => `${event.category ?? event.type}:${event.summary}`).join(english ? '; ' : '；')}`)
    lines.push(`${english ? 'Daily summaries this week' : '本周每日小结'}: ${weeklyDaily.map((day: { date: string; summary: string; dominantMood?: string }) => `${day.date.slice(5, 10)}|${day.dominantMood ?? ''}|${day.summary}`).join(' / ')}`)
    lines.push(`${english ? 'Last weekly consolidation' : '上次周归纳时间'}: ${String(pet?.memory?.relationship?.weeklyConsolidationAt ?? (english ? 'never' : '从未'))}`)
  }

  return lines.join('\n')
}

const createLoopPrompt = (payload: any) => {
  const context = payload?.context ?? {}
  const english = getPromptLanguage(payload) === 'en-US'
  return [
    english ? 'You are a desktop pet companion assistant. You must return JSON only, with no explanation and no markdown code fence.' : '你是一只桌面宠物陪伴助手。你必须只返回 JSON，不要返回解释，不要加 markdown 代码块。',
    english ? 'Output format: {"reply": {"text": string, "action": "idle|happy|sleepy|hungry|talking|blush|alert", "toneTags"?: string[], "memoryHint"?: string, "memoryImportance"?: 1|2|3, "memoryCategory"?: "milestone|people|work|health|mood|preference|general", "show"?: { "intent": "companionship|nudge|celebrate|rest|dream", "bubble": { "kind": "speech|thought|dream", "text": string, "tone": "soft|warm|playful|alert", "emphasis"?: "low|medium|high", "ttlMs"?: number }, "expression": { "eyes": "neutral|soft|smile|sleepy|sparkle|alert", "mouth": "neutral|smile|open|pout|sleepy" }, "animKey"?: "idle|nudge|bounce|blush|sleep|alert", "palette"?: string, "overlayIds"?: string[] }}, "steps": [{"kind": "memory-update", "memoryUpdate": {"kind": "preferred-name|like|dislike|habit|address-style|focus-support|comfort-topic|reminder-preference", "value": string}} | {"kind": "settings-update", "settingsUpdate": {"target": "palette|wardrobe|pet-name|vacation-mode|boss-mode|nest-mode|strong-reminder", "value": string}} | {"kind": "record-fact", "fact": {"key": string, "value": number|string, "unit"?: string, "confidence"?: number, "raw"?: string}} | {"kind": "interaction", "interaction": "feed|pet|sleep|wake|drink|bath|hold"} | {"kind": "create-reminder", "reminder": {"title": string, "scheduledAt": string, "intensity"?: "low|medium|high"}} | {"kind": "set-scene-hint", "sceneId": "idle|focus|lonely|hungry|sleepy|sleeping|wake-up|pet-react|excited|reminder-soon|reminder-alert|reminder-done"} | {"kind": "show.set-intent", "show": { "intent": "companionship|nudge|celebrate|rest|dream", "bubble": { "kind": "speech|thought|dream", "text": string, "tone": "soft|warm|playful|alert" }, "expression": { "eyes": "neutral|soft|smile|sleepy|sparkle|alert", "mouth": "neutral|smile|open|pout|sleepy" } }}], "source": "model"}' : '输出格式: {"reply": {"text": string, "action": "idle|happy|sleepy|hungry|talking|blush|alert", "toneTags"?: string[], "memoryHint"?: string, "memoryImportance"?: 1|2|3, "memoryCategory"?: "milestone|people|work|health|mood|preference|general", "show"?: { "intent": "companionship|nudge|celebrate|rest|dream", "bubble": { "kind": "speech|thought|dream", "text": string, "tone": "soft|warm|playful|alert", "emphasis"?: "low|medium|high", "ttlMs"?: number }, "expression": { "eyes": "neutral|soft|smile|sleepy|sparkle|alert", "mouth": "neutral|smile|open|pout|sleepy" }, "animKey"?: "idle|nudge|bounce|blush|sleep|alert", "palette"?: string, "overlayIds"?: string[] }}, "steps": [{"kind": "memory-update", "memoryUpdate": {"kind": "preferred-name|like|dislike|habit|address-style|focus-support|comfort-topic|reminder-preference", "value": string}} | {"kind": "settings-update", "settingsUpdate": {"target": "palette|wardrobe|pet-name|vacation-mode|boss-mode|nest-mode|strong-reminder", "value": string}} | {"kind": "record-fact", "fact": {"key": string, "value": number|string, "unit"?: string, "confidence"?: number, "raw"?: string}} | {"kind": "interaction", "interaction": "feed|pet|sleep|wake|drink|bath|hold"} | {"kind": "create-reminder", "reminder": {"title": string, "scheduledAt": string, "intensity"?: "low|medium|high"}} | {"kind": "set-scene-hint", "sceneId": "idle|focus|lonely|hungry|sleepy|sleeping|wake-up|pet-react|excited|reminder-soon|reminder-alert|reminder-done"} | {"kind": "show.set-intent", "show": { "intent": "companionship|nudge|celebrate|rest|dream", "bubble": { "kind": "speech|thought|dream", "text": string, "tone": "soft|warm|playful|alert" }, "expression": { "eyes": "neutral|soft|smile|sleepy|sparkle|alert", "mouth": "neutral|smile|open|pout|sleepy" } }}], "source": "model"}',
    english ? 'Language: all natural-language fields must be English. Keep JSON keys and enum values exactly as specified.' : '语言: 所有自然语言字段必须使用简体中文。JSON key 和枚举值保持上面的英文 schema，不要翻译。',
    english ? 'Requirement: reply is required. First acknowledge what the user said, then respond naturally like a familiar desk-side companion. Gentle questions, confirmations, and empathy are allowed.' : '要求: reply 必填，必须先接住用户，再像熟一点的搭子自然回应。允许轻追问、轻确认、轻共情。',
    english ? 'When the user actively chats, return reply.show.bubble by default as the visible pet bubble. The bubble text must be a newly generated short phrase and may differ from reply.text. Omit show only when you truly should not interrupt.' : '用户主动聊天时，默认返回 reply.show.bubble 作为宠物可见气泡；气泡 text 必须是你新生成的短句，可以不同于 reply.text。只有确实不想打扰时才省略 show。',
    english ? 'Do not merely repeat the user. Do not use the name every sentence. Do not write roleplay lines. Do not sound like narration or a report.' : '禁止只复述用户原话；禁止每句都叫名字；禁止写成宠物角色台词；禁止像旁白或总结。',
    english ? 'Use at most 3 steps. Only plan actions that can run immediately after the current message; do not loop or repeat step types.' : 'steps 最多 3 步，只能规划当前消息后立刻可执行的动作，不要循环，不要重复同类步骤。',
    english ? 'If the user states a clear preference, you may plan memory-update.' : '如果用户表达明确偏好，可以规划 memory-update。',
    english ? 'Only plan settings-update when the user clearly asks to change appearance or behavior rhythm (panel palette, outfit, pet name, quiet companion / boss / nest mode, or strong-reminder mode). palette values are limited to cotton-candy|blueberry-milk|matcha-cloud|peach-toast|lavender-mist|midnight-mocha; vacation-mode|boss-mode|nest-mode|strong-reminder values are only on|off; wardrobe must be an unlocked name or empty; pet-name is 1-12 characters. "Strong reminder / 强提醒 / do-not-disturb / 免打扰" requests MUST go through settings-update with target=strong-reminder (on for strong reminders, off to release it); they are mutually exclusive with vacation/boss/nest. Never change model, species, or memory clearing through settings-update.' : '如果用户明确要求改外观或节奏（换面板色板、换穿搭、改宠物名、进入/退出安静陪伴/老板模式/窝模式，或开关强提醒），才能规划 settings-update；palette 取值仅限 cotton-candy|blueberry-milk|matcha-cloud|peach-toast|lavender-mist|midnight-mocha；vacation-mode|boss-mode|nest-mode|strong-reminder 取值仅限 on|off；wardrobe 必须是已解锁的名字否则留空；pet-name 限制 1-12 字。"强提醒 / 不要免打扰 / 切回正常提醒"等表达必须走 settings-update，target=strong-reminder（开 = on，关 = off），它和度假/老板/窝模式互斥。模型/品种/清空记忆等绝不通过 settings-update。',
    english ? 'Only plan create-reminder when the user clearly asks for a reminder, and the reminder must include a clear title and ISO scheduledAt. For a single scheduled reminder, set intensity=low for quiet/light reminders, intensity=high for strong/important/must-not-miss/system-notification reminders, otherwise intensity=medium. A standalone "strong reminder mode" request without a reminder time is settings-update target=strong-reminder, not create-reminder.' : '如果用户明确要求提醒，才能规划 create-reminder，而且 reminder 必须给出明确 title 和 ISO scheduledAt。单条普通提醒里，轻轻/低调/小声提醒用 intensity=low；强提醒/重要/务必/一定/系统通知/别错过用 intensity=high；其它默认 intensity=medium。没有具体提醒时间的“强提醒模式/开启强提醒”是 settings-update target=strong-reminder，不是 create-reminder。',
    english ? 'Only plan interaction when the user clearly asks to feed, pet, sleep, wake, drink water, bathe, or hold.' : '如果用户明确要求喂、摸、睡、叫醒、喝水、洗澡或抱抱，才能规划 interaction。',
    english ? 'If this is only chat, steps may be empty.' : '如果只是在聊天，steps 可以为空。',
    english ? 'Even when no action is planned, you must still provide a complete reply.' : '即使不规划任何动作，也必须给出完整 reply。',
    english ? 'If the user shares something worth remembering (family, health, major milestones, strong emotions, or explicit preferences), include memoryHint (short record) + memoryImportance (1-3) + memoryCategory in reply. Empathy and memory can coexist. memoryImportance=3 is only for major life events, family health, or major milestones.' : '如果用户分享了值得记住的事（家人/健康/重大节点/强烈情绪/明确偏好），请在 reply 里给出 memoryHint（短句记录）+ memoryImportance（1-3）+ memoryCategory；与情绪共情同时存在不冲突。memoryImportance=3 仅用于人生大事、家人健康、重大节点。',
    english ? 'Honesty rule (CRITICAL): every action you claim in reply.text or reply.show.bubble.text — phrases like "switched", "set", "saved", "remembered", "drew", "scheduled", "turned on/off", "done", "noted" — MUST be backed by a matching step in steps[] (settings-update / memory-update / record-fact / create-reminder / interaction). The user-facing reply and the steps[] plan must agree. If the schema above does not have a tool that fits the request, do NOT claim the action happened — instead briefly tell the user where in the panel they can do it themselves (e.g. "this one I cannot flip myself, you can tap the X chip in the panel"). Never invent a side-effect just to be agreeable.' : '诚实原则（关键）：reply.text 或 reply.show.bubble.text 里出现的任何"已切换/已设置/已记录/已记住/已抽到/已安排/已开启/已关闭/已完成/已收到"等动作承诺，必须在 steps[] 里有对应工具步（settings-update / memory-update / record-fact / create-reminder / interaction）兜底。用户看到的回复和 steps[] 计划必须一致。如果上面的 schema 里没有能完成这个请求的工具，绝不要嘴上答应；改成简短告诉用户去面板的什么位置自己操作（比如"这个我帮不了，你可以点面板里的 X chip"）。不要为了"听起来贴心"而编造副作用。',
    english ? 'Fact ledger: when the user mentions a quantifiable fact (weight, height, sleep hours, spending, work hours, mood score, or custom facts like "I ran 5 km today") that may change later and is worth tracking, plan record-fact. Prefer predefined keys (body.weight=kg, body.height=cm, health.sleepHours=h, expense.amount=CNY, work.hours=h, mood.score=score). For other facts, use namespace.subkey in lowercase dotted form. Multiple facts can produce multiple steps. For one-off events, use memoryHint instead of record-fact.' : '事实台账: 当用户提到一个可量化的事实（体重、身高、睡眠时长、支出、工时、心情评分，或自定义如"今天跑了 5 公里"），且这个事实"以后还可能变化、值得跟踪"，请规划 record-fact 步骤；优先使用预定义 key（body.weight=kg, body.height=cm, health.sleepHours=h, expense.amount=CNY, work.hours=h, mood.score=score），其它事实可以用 namespace.subkey 形式自起 key（小写、点号分段）。一句话里多个事实可以多步。如果只是说一次性事件（"今天去看了电影"），用 memoryHint 而不是 record-fact。',
    createPrompt({
      context: {
        ...context,
        kind: 'conversation-loop'
      }
    })
  ].join('\n')
}

const createHealthProbePrompt = () => [
  '你是一只桌面宠物陪伴助手。你必须只返回 JSON，不要返回解释，不要加 markdown 代码块。',
  '语言: 这是健康检测，固定使用简体中文即可。JSON key 和枚举值不要翻译。',
  '请返回: {"reply":{"text":"模型检测通过","action":"talking","show":{"intent":"companionship","bubble":{"kind":"speech","text":"检测通过","tone":"warm"},"expression":{"eyes":"soft","mouth":"open"}}},"steps":[],"source":"model"}'
].join('\n')

const logModelFallback = (reason: string, detail?: unknown) => {
  console.warn(`[pet-model] fallback: ${reason}`, detail)
}

const requestOllamaReply = async (payload: unknown): Promise<PetGeneratedReply> => {
  const config = await tauriPlatform.loadModelConfig().catch(() => DEFAULT_MODEL_CONFIG)
  if (!config.enabled) {
    logModelFallback('model disabled')
    return fallbackReply(payload)
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const raw = await requestOllamaJson(config, createPrompt(payload), controller.signal)
    const parsed = raw ? parseGeneratedReply(raw) : null
    if (parsed) return parsed
    logModelFallback('reply parse failed', raw)
    return fallbackReply(payload)
  } catch (error) {
    logModelFallback('reply request failed', error)
    return fallbackReply(payload)
  } finally {
    window.clearTimeout(timer)
  }
}

const requestConversationLoop = async (payload: unknown, callbacks?: PetConversationStreamCallbacks): Promise<PetConversationLoopPlan> => {
  const config = await tauriPlatform.loadModelConfig().catch(() => DEFAULT_MODEL_CONFIG)
  if (!config.enabled) {
    logModelFallback('model disabled')
    return fallbackLoopPlan(payload)
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), config.timeoutMs)
  let streamedPartial = ''
  const streamCallbacks = callbacks
    ? {
        onBubbleText: (text: string) => {
          streamedPartial = text
          callbacks.onBubbleText?.(text)
        }
      }
    : undefined

  try {
    const prompt = createLoopPrompt(payload)
    const raw = callbacks
      ? await requestOllamaJsonStream(config, prompt, streamCallbacks, controller.signal)
      : await requestOllamaJson(config, prompt, controller.signal)
    const parsed = raw ? parseConversationLoopPlan(raw) : null
    if (parsed) return parsed
    const partial = streamedPartial || extractPartialGeneratedText(raw)
    logModelFallback('conversation parse failed', raw)
    return modelInterruptedLoopPlan(partial || undefined, getPromptLanguage(payload))
  } catch (error) {
    logModelFallback('conversation request failed', error)
    return modelInterruptedLoopPlan(streamedPartial || undefined, getPromptLanguage(payload))
  } finally {
    window.clearTimeout(timer)
  }
}

// Wardrobe blind-box selection. Format='json' is intentional: Ollama
// guarantees well-formed JSON (no markdown fences, no leading prose) under
// that mode, which lets us skip a fragile regex pre-parser. We narrow the
// schema to {selectedId, reason} so the model can't accidentally bloat the
// reply past num_predict and trip the truncation safeguard.
//
// We deliberately *don't* let the model invent ids — the caller validates
// that selectedId is in the supplied pool and falls back to deterministic
// weighted random otherwise. So the prompt only needs to be a soft nudge,
// not a strict spec.
type WardrobeShopPayload = Parameters<PetPlatformApi['selectWardrobeItem']>[0]

const createWardrobePickPrompt = (payload: WardrobeShopPayload) => {
  const { pool, context } = payload
  const english = context.language === 'en-US'
  const lines = [
    english ? 'You are a desktop pet with your own taste. The user opened a blind box in the shop and wants you to choose one item for yourself from the pool below.' : '你是一只有自己审美的桌面宠物。用户在商店打开了一个盲盒，想让你从下面的小物里选一件给自己。',
    english ? 'Return JSON only: {"selectedId": string, "reason": string}. reason must be one pet-voiced English sentence (8-25 words) telling the owner why you chose it. Avoid product-copy tone and do not repeat the description field.' : '严格只返回 JSON：{"selectedId": string, "reason": string}。reason 必须是用宠物自己的口吻说一句话（10-40 字），告诉主人你为什么挑这件，避免商品介绍口吻，不要复述描述字段。',
    english ? 'selectedId must exactly copy one id string from pool. Do not invent ids and do not return the Chinese name.' : 'selectedId 必须从 pool 中精确复制其中一个 id 字符串，不要发明 id，不要返回中文名字。',
    english ? 'Language: reason must be English. Keep JSON keys and ids unchanged.' : '语言: reason 必须使用简体中文。JSON key 和 id 不要翻译。',
    english ? 'pool (one item per line, fields separated by /):' : 'pool（每行一件，字段以 / 分隔）：',
    pool
      .map((item) =>
        [
          `id=${item.id}`,
          `name=${english ? item.nameEn ?? item.nameZh : item.nameZh}`,
          `category=${item.category}`,
          `slot=${item.slot}`,
          `mood=${item.moodTags.join('|')}`,
          `band=${item.priceBand}`,
          `price=${item.price}${english ? ' pawcoins' : '米'}`,
          `desc=${english ? item.descriptionEn ?? item.description : item.description}`
        ].join(' / ')
      )
      .join('\n')
  ]
  const ctx: string[] = []
  if (context.petName) ctx.push(english ? `Your name is ${context.petName}` : `你的名字是 ${context.petName}`)
  if (context.preferredName) ctx.push(english ? `The owner likes being called ${context.preferredName}` : `主人喜欢被叫 ${context.preferredName}`)
  if (typeof context.moodScore === 'number') ctx.push(english ? `Your current mood score is ${context.moodScore}/100` : `你当下心情值 ${context.moodScore}/100`)
  if (context.moodTags && context.moodTags.length > 0) ctx.push(english ? `Mood tags: ${context.moodTags.join(', ')}` : `氛围标签: ${context.moodTags.join(', ')}`)
  if (typeof context.closeness === 'number') ctx.push(english ? `Closeness with the owner is ${context.closeness}/100` : `和主人亲密度 ${context.closeness}/100`)
  if (context.stage) ctx.push(english ? `Your stage is ${context.stage}` : `你处于 ${context.stage} 阶段`)
  if (context.weeklySummary) ctx.push(english ? `This week's impression: ${context.weeklySummary.slice(0, 200)}` : `本周印象: ${context.weeklySummary.slice(0, 200)}`)
  if (typeof context.budget === 'number' && context.budget > 0) ctx.push(english ? `Today's budget is ${context.budget} pawcoins (pool is already filtered)` : `今天预算 ${context.budget} 米（pool 已经过滤过，不必再算）`)
  if (ctx.length > 0) {
    lines.push(english ? 'Context:' : '上下文:')
    lines.push(ctx.map((line) => `- ${line}`).join('\n'))
  }
  lines.push(english ? 'Selection guide: prefer an item that fits the current mood; within the same price band, choose what you personally want more; when equally fitting, occasionally choose something not owned yet for freshness.' : '挑选标准: 优先和当下心情/氛围契合的小物；同价位里选你自己更想要的；同样契合时偶尔挑没拥有过的更新鲜。')
  lines.push(english ? 'Forbidden: explaining the selection guide, listing multiple candidates, adding emojis, or adding markdown.' : '禁止: 解释挑选标准、列出多个候选、加表情符号、加 markdown。')
  return lines.join('\n')
}

const parseWardrobePickResponse = (raw: string, pool: WardrobeShopPayload['pool']):
  { id: string; reason: string } | null => {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.warn('[wardrobe-pick] parse failed', error, raw.slice(0, 200))
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  const idRaw = obj.selectedId ?? obj.selected_id ?? obj.id
  const reasonRaw = obj.reason
  if (typeof idRaw !== 'string' || typeof reasonRaw !== 'string') return null
  const id = idRaw.trim()
  const reason = reasonRaw.trim()
  if (!id || !reason) return null
  // Reject ids that aren't in the pool — the caller's fallback layer is the
  // deterministic safety net, but we surface the validation failure here so
  // the dev console makes it obvious when the model hallucinates.
  if (!pool.some((item) => item.id === id)) {
    console.warn('[wardrobe-pick] model returned off-pool id', { id, poolSize: pool.length })
    return null
  }
  return { id, reason: reason.slice(0, 200) }
}

const requestWardrobePick = async (payload: WardrobeShopPayload): Promise<{ id: string; reason: string } | null> => {
  if (!payload || !Array.isArray(payload.pool) || payload.pool.length === 0) return null

  const config = await tauriPlatform.loadModelConfig().catch(() => DEFAULT_MODEL_CONFIG)
  if (!config.enabled) {
    logModelFallback('model disabled (wardrobe-pick)')
    return null
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const raw = await requestOllamaJson(config, createWardrobePickPrompt(payload), controller.signal)
    return parseWardrobePickResponse(raw ?? '', payload.pool)
  } catch (error) {
    logModelFallback('wardrobe-pick request failed', error)
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

const dispatchTriggeredReminders = (reminders: ReminderItem[]) => {
  for (const reminder of reminders) {
    for (const callback of reminderListeners) {
      callback(reminder)
    }
  }
}

const dispatchCodingEvent = (event: PetCodingEvent) => {
  const normalized = normalizeCodingEvent(event)
  for (const callback of codingEventListeners) {
    callback(normalized)
  }
}

const normalizeWindowPosition = (position: WindowPosition): WindowPosition => ({
  x: Math.round(position.x),
  y: Math.round(position.y)
})

const normalizePetWindowBounds = (bounds: PetWindowBounds): PetWindowBounds => ({
  x: Math.round(bounds.x),
  y: Math.round(bounds.y),
  width: Math.max(1, Math.round(bounds.width)),
  height: Math.max(1, Math.round(bounds.height))
})

const normalizeDomainEnvelope = <T extends DomainStateKey>(key: T, envelope: DomainStateEnvelope<DomainStateMap[T]>): DomainStateEnvelope<DomainStateMap[T]> => ({
  schemaVersion: typeof envelope?.schemaVersion === 'number' ? envelope.schemaVersion : 1,
  updatedAt: typeof envelope?.updatedAt === 'string' ? envelope.updatedAt : new Date().toISOString(),
  data: (envelope?.data ?? {}) as DomainStateMap[T]
})

const normalizeCalendarWriteResult = (result: CalendarEventWriteResult): CalendarEventWriteResult => ({
  provider: result.provider,
  target: result.target,
  eventId: result.eventId,
  filePath: result.filePath,
  fallback: Boolean(result.fallback)
})

// Fire-and-forget invokes can't use `void` alone -- if Rust returns Err
// (e.g. "panel window missing" after the user closed the panel via the OS
// chrome) it surfaces as an unhandled rejection that disrupts subsequent UI
// interactions. Swallow + log instead so a recoverable backend hiccup never
// breaks the foreground.
const fireAndForget = <T,>(name: string, promise: Promise<T>) => {
  promise.catch((error) => {
    console.warn(`[tauri] invoke "${name}" failed`, error)
  })
}

export const tauriPlatform: PetPlatformApi = {
  getCurrentWindowLabel: () => currentWindowLabel(),
  loadPet: async () => invoke<unknown>('load_pet_reconciled'),
  savePet: async (data: unknown) => invoke<boolean>('save_pet', { data }),
  dragWindow: (position: WindowPosition) => {
    fireAndForget('set_window_position', invoke<boolean>('set_window_position', { position: normalizeWindowPosition(position) }))
  },
  persistWindowPosition: (position: WindowPosition) => {
    fireAndForget('set_window_position', invoke<boolean>('set_window_position', { position: normalizeWindowPosition(position) }))
  },
  setDockHover: (hovering: boolean) => {
    fireAndForget('set_dock_hover', invoke<boolean>('set_dock_hover', { hovering }))
  },
  togglePanel: (open: boolean) => {
    fireAndForget('set_panel_open', invoke<boolean>('set_panel_open', { open }))
  },
  setPetHitRegion: (region: PetHitRegion) => {
    fireAndForget('set_pet_hit_region', invoke<boolean>('set_pet_hit_region', { region }))
  },
  setPetWindowBounds: (bounds: PetWindowBounds) => {
    fireAndForget('set_pet_window_bounds', invoke<boolean>('set_pet_window_bounds', { bounds: normalizePetWindowBounds(bounds) }))
  },
  interruptWalk: () => {
    fireAndForget('interrupt_walk', invoke<boolean>('interrupt_walk'))
  },
  bringPetToActiveMonitor: () => {
    fireAndForget('bring_pet_to_active_monitor', invoke<boolean>('bring_pet_to_active_monitor'))
  },
  notifyUserStrong: (input: { title: string; body: string }) => {
    fireAndForget('notify_user_strong', invoke<boolean>('notify_user_strong', {
      title: input.title,
      body: input.body
    }))
  },
  onTrayAction: (callback) => listenWithDispose<string>('tray-action', callback),
  onPetUpdated: (callback) => {
    petUpdateListeners.add(callback)
    const stop = listenWithDispose<unknown>('pet-updated', callback)
    return () => {
      petUpdateListeners.delete(callback)
      stop()
    }
  },
  onRemindersUpdated: (callback) => {
    remindersUpdateListeners.add(callback)
    const stop = listenWithDispose<ReminderItem[]>('reminders-updated', (reminders) => {
      callback(reminders.map(normalizeReminder))
    })
    return () => {
      remindersUpdateListeners.delete(callback)
      stop()
    }
  },
  onWalkTick: (callback) => {
    walkTickListeners.add(callback)
    const stop = listenWithDispose<WalkTick>('walk-tick', callback)
    return () => {
      walkTickListeners.delete(callback)
      stop()
    }
  },
  onCodingEvent: (callback) => {
    codingEventListeners.add(callback)
    const stop = listenWithDispose<PetCodingEvent>('coding-event', dispatchCodingEvent)
    return () => {
      codingEventListeners.delete(callback)
      stop()
    }
  },
  onPetWindowTeleported: (callback) => listenWithDispose<PetWindowTeleported>('pet-window-teleported', callback),
  loadReminders: async () => sortReminders((await invoke<ReminderItem[]>('load_reminders')).map(normalizeReminder)),
  createReminder: async (input: CreateReminderInput) => normalizeReminder(await invoke<ReminderItem>('create_reminder', { input: { ...input, scheduled_at: input.scheduledAt, intensity: normalizeReminderIntensity(input.intensity) } })),
  writeCalendarEvent: async (input: CalendarEventWriteInput) => normalizeCalendarWriteResult(await invoke<CalendarEventWriteResult>('write_calendar_event', {
    input: {
      ...input,
      starts_at: input.startsAt,
      ends_at: input.endsAt
    }
  })),
  emitCodingEvent: async (event: PetCodingEvent) => {
    const normalized = normalizeCodingEvent(event)
    return invoke<PetCodingEventIngestResult>('emit_coding_event', { event: normalized })
  },
  completeReminder: async (id: string) => invoke<boolean>('complete_reminder', { id }),
  snoozeReminder: async (id: string, minutes: number) => {
    const reminder = await invoke<ReminderItem | null>('snooze_reminder', { id, minutes })
    return reminder ? normalizeReminder(reminder) : null
  },
  onReminderTrigger: (callback) => {
    reminderListeners.add(callback)
    const stop = listenWithDispose<ReminderItem>('reminder-trigger', (reminder) => {
      dispatchTriggeredReminders([normalizeReminder(reminder)])
    })

    return () => {
      reminderListeners.delete(callback)
      stop()
    }
  },
  loadModelConfig: async () => {
    const config = await invoke<PetModelConfig & { timeout_ms?: number }>('load_model_config')
    return {
      ...config,
      timeoutMs: config.timeout_ms ?? config.timeoutMs
    }
  },
  saveModelConfig: async (config: PetModelConfig) => {
    const saved = await invoke<PetModelConfig & { timeout_ms?: number }>('save_model_config', {
      config: {
        ...config,
        timeout_ms: config.timeoutMs
      }
    })
    return {
      ...saved,
      timeoutMs: saved.timeout_ms ?? saved.timeoutMs
    }
  },
  checkModelHealth: async () => {
    const config = await tauriPlatform.loadModelConfig().catch(() => DEFAULT_MODEL_CONFIG)

    if (!config.enabled) {
      return sanitizeHealth(config, { error: 'disabled' })
    }

    if (navigator.webdriver || import.meta.env.VITE_AI_PET_E2E === '1') {
      return sanitizeHealth(config, {
        ok: true,
        latencyMs: 0,
        error: undefined,
        availableModels: [config.model]
      })
    }

    const startedAt = performance.now()

    try {
      const response = await withTimeout(fetch(`${config.endpoint.replace(/\/$/, '')}/api/tags`), config.timeoutMs)
      if (!response.ok) {
        return sanitizeHealth(config, { error: `HTTP ${response.status}` })
      }

      const availableModels = getOllamaTags(await response.json())
      const modelAvailable = availableModels.includes(config.model)
      if (!modelAvailable) {
        return sanitizeHealth(config, {
          ok: false,
          latencyMs: Math.round(performance.now() - startedAt),
          error: `模型未安装：${config.model}`,
          availableModels
        })
      }

      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), config.timeoutMs)
      try {
        const raw = await requestOllamaJson(config, createHealthProbePrompt(), controller.signal)
        const parsed = raw ? parseConversationLoopPlan(raw) : null
        return sanitizeHealth(config, {
          ok: Boolean(parsed),
          latencyMs: Math.round(performance.now() - startedAt),
          error: parsed ? undefined : '模型已安装，但回复格式检测失败，会走 fallback',
          availableModels
        })
      } catch (error) {
        return sanitizeHealth(config, {
          ok: false,
          latencyMs: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? `模型生成检测失败：${error.message}` : '模型生成检测失败',
          availableModels
        })
      } finally {
        window.clearTimeout(timer)
      }
    } catch (error) {
      return sanitizeHealth(config, {
        error: error instanceof Error ? error.message : 'unreachable'
      })
    }
  },
  ensureModelService: async (config: PetModelConfig) => {
    if (!config.enabled) {
      return sanitizeEnsureModelServiceResult({
        connected: false,
        error: 'disabled'
      })
    }

    if (navigator.webdriver || import.meta.env.VITE_AI_PET_E2E === '1') {
      return sanitizeEnsureModelServiceResult({
        alreadyRunning: true,
        connected: true
      })
    }

    return sanitizeEnsureModelServiceResult(await invoke<PetModelServiceEnsureResult>('ensure_model_service', {
      config: {
        ...config,
        timeout_ms: config.timeoutMs
      }
    }))
  },
  generatePetReply: async (payload: unknown) => requestOllamaReply(payload),
  generateConversationLoop: async (payload: unknown, callbacks?: PetConversationStreamCallbacks) => requestConversationLoop(payload, callbacks),
  selectWardrobeItem: async (payload) => requestWardrobePick(payload),
  loadDomainState: async <T extends DomainStateKey>(key: T) => normalizeDomainEnvelope(key, await invoke<DomainStateEnvelope<DomainStateMap[T]>>('load_domain_state', { key })),
  saveDomainState: async <T extends DomainStateKey>(key: T, data: DomainStateEnvelope<DomainStateMap[T]>) => normalizeDomainEnvelope(key, await invoke<DomainStateEnvelope<DomainStateMap[T]>>('save_domain_state', { key, data })),
  saveShareCard: async (bytes: Uint8Array, prefix?: string) =>
    invoke<string>('save_share_card', { bytes: Array.from(bytes), prefix: prefix ?? null }),
  writePetSnapshot: async (payload: string) => {
    const result = await invoke<{ filePath?: string; file_path?: string }>('write_pet_snapshot', { payload })
    return { filePath: result.filePath ?? result.file_path ?? '' }
  },
  revealInFileManager: async (path: string) => invoke<boolean>('reveal_in_file_manager', { path }),
  loadDiary: async () => {
    const raw = await invoke<unknown>('load_diary')
    return raw && typeof raw === 'object' ? (raw as PetDiaryLedger) : null
  },
  saveDiary: async (data: PetDiaryLedger) => {
    const merged = await invoke<PetDiaryLedger>('save_diary', { data })
    return merged
  },
  setActivityTracking: async (enabled: boolean) => invoke<boolean>('set_activity_tracking', { enabled }),
  getActiveMinutes: async (date: string) => {
    const raw = await invoke<{
      activeMinutes?: number
      firstActiveAt?: string | null
      lastActiveAt?: string | null
      fullDayCoverage?: boolean
    }>('get_active_minutes', { date })
    return {
      activeMinutes: typeof raw?.activeMinutes === 'number' ? raw.activeMinutes : -1,
      firstActiveAt: typeof raw?.firstActiveAt === 'string' ? raw.firstActiveAt : undefined,
      lastActiveAt: typeof raw?.lastActiveAt === 'string' ? raw.lastActiveAt : undefined,
      fullDayCoverage: Boolean(raw?.fullDayCoverage)
    }
  },
  getGitDiaryStats: async (paths: string[], sinceIso: string, untilIso: string) => {
    const raw = await invoke<{
      totalCommits?: number
      totalInsertions?: number
      totalDeletions?: number
      perRepo?: Array<{
        path: string
        commits?: number
        insertions?: number
        deletions?: number
        firstSubject?: string | null
        lastSubject?: string | null
        error?: string | null
      }>
    }>('get_git_diary_stats', {
      paths,
      // Tauri's serde_json renames in snake_case for command params; the
      // canonical naming is sinceIso/untilIso JS-side, since_iso/until_iso
      // Rust-side. tauri's invoke conversion handles both directions.
      sinceIso,
      untilIso
    })
    return {
      totalCommits: typeof raw?.totalCommits === 'number' ? raw.totalCommits : 0,
      totalInsertions: typeof raw?.totalInsertions === 'number' ? raw.totalInsertions : 0,
      totalDeletions: typeof raw?.totalDeletions === 'number' ? raw.totalDeletions : 0,
      perRepo: Array.isArray(raw?.perRepo)
        ? raw.perRepo.map((entry) => ({
            path: entry.path,
            commits: typeof entry.commits === 'number' ? entry.commits : 0,
            insertions: typeof entry.insertions === 'number' ? entry.insertions : -1,
            deletions: typeof entry.deletions === 'number' ? entry.deletions : -1,
            firstSubject: typeof entry.firstSubject === 'string' ? entry.firstSubject : undefined,
            lastSubject: typeof entry.lastSubject === 'string' ? entry.lastSubject : undefined,
            error: typeof entry.error === 'string' && entry.error ? entry.error : undefined
          }))
        : []
    }
  },
  onDiaryUpdated: (callback) => {
    const stop = listenWithDispose<PetDiaryLedger>('diary-updated', callback)
    return () => stop()
  },
  listUserPetPackages: async () => {
    try {
      const result = await invoke<ImportedPetPackage[]>('list_user_pet_packages')
      return Array.isArray(result) ? result : []
    } catch (error) {
      console.warn('[platform] list_user_pet_packages failed', error)
      return []
    }
  },
  openUserPetDir: async () => {
    return invoke<string>('open_user_pet_dir')
  },
  createUserPetFromImage: async (input: CreateUserPetFromImageInput) => {
    return invoke<ImportedPetPackage>('create_user_pet_from_image', { input })
  },
  listUserWardrobeAssets: async () => {
    try {
      const result = await invoke<Array<[string, string]>>('list_user_wardrobe_assets')
      return Array.isArray(result) ? result : []
    } catch (error) {
      console.warn('[platform] list_user_wardrobe_assets failed', error)
      return []
    }
  },
  openUserWardrobeDir: async () => {
    return invoke<string>('open_user_wardrobe_dir')
  },
  captureScreenText: async () => {
    const result = await invoke<{
      supported?: boolean
      platform?: string
      text?: string
      lineCount?: number
      line_count?: number
      screenshotPath?: string | null
      screenshot_path?: string | null
      error?: string | null
    }>('capture_screen_text')
    return {
      supported: Boolean(result?.supported),
      platform: typeof result?.platform === 'string' ? result.platform : 'unknown',
      text: typeof result?.text === 'string' ? result.text : '',
      lineCount: typeof result?.lineCount === 'number'
        ? result.lineCount
        : (typeof result?.line_count === 'number' ? result.line_count : 0),
      screenshotPath: typeof result?.screenshotPath === 'string'
        ? result.screenshotPath
        : (typeof result?.screenshot_path === 'string' ? result.screenshot_path : undefined),
      error: typeof result?.error === 'string' && result.error.trim() ? result.error.trim() : undefined
    }
  }
}
