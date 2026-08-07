import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { petPlatform, type CreateUserPetFromImageInput } from '../platform/pet-platform'
import { preparePetInteractionState, resolveRuntimeSceneWithHint } from '../agent/runtime/runtime-flow'
import { getMockReply } from '../lib/pet-dialogue'
import { evaluateToolPolicy, getToolConfirmationKey } from '../agent/runtime/tool-policy'
import { runPreparedPetConversationTurn, runPreparedPetSceneTurn } from '../agent/runtime/runtime-adapter'
import { resolveRuntimePetAction } from '../agent/runtime/scene-context'
import { createDefaultPlacementsForAppearance, getAppearanceAsset, resolveAppearanceLabel, speciesOptions } from '../assets/pet/appearance-registry'
import { getGeneratedPetVariants } from '../assets/pet/generated-pet-registry'
import { getImportedPetSpeciesOptions, replaceImportedPetPackages } from '../assets/pet/imported-pet-registry'
import { settleToFloor } from '../pet-physics/gravity'
import { completeReminder, createReminder, loadPet, loadReminders, savePet, snoozeReminder, loadDomainState, saveDomainState } from '../lib/pet-memory'
import { loadModelConfig, saveModelConfig, checkModelHealth, ensureModelService, generateOracleReading, generatePetReply } from '../lib/pet-llm'
import type { PetRendererMode } from '../components/PetCanvas'
import type { CareTrayDragPayload } from '../components/CareTray'
import { getWardrobeItemById } from '../assets/wardrobe/manifest'
import { getBundledWardrobeVariants } from '../assets/wardrobe/variant-registry'
import { DEFAULT_PLACEMENT } from '../types/wardrobe'
import {
  JOB_OPTIONS,
  ORACLE_DECKS,
  SHOP_ITEMS,
  addPendingReward,
  claimPendingRewards,
  consumeInventoryItem,
  getInventoryQuantity,
  createAuditEntry,
  placeFurnitureFromInventory,
  reconcileAchievements,
  touchToolUsage,
  upsertInventoryItem
} from '../lib/pet-domains'
import { buildPetGenerationRequest } from '../lib/pet-prompt'
import { getNearestPendingReminder, getNearestReminderAt, getReminderPhase, normalizeReminderIntensity } from '../lib/pet-scene'
import { buildCareRefusalEventMemory, getCareInteractionRefusalKey, pointHitsAxisAlignedRect } from '../lib/pet-care-interaction'
import { addEventMemory } from '../lib/pet-state'
import { addFactRecord, removeFactKey, removeFactRecord, setFactKeyTracking } from '../lib/pet-facts'
import {
  addGitRepoPath,
  appendDiaryRawTurn,
  formatDateKey,
  listEntriesNewestFirst,
  normalizeLedger,
  removeGitRepoPath,
  sealDiaryEntry,
  setDiaryConfig,
  upsertDiaryEntry
} from '../lib/pet-diary'
import { composeDiaryNarrative, runDiaryRollup, shouldAutoComposeDiaryNarrative } from '../lib/diary-rollup'
import { createDefaultDiaryLedger } from '../types/diary'
import type { PetDiaryLedger } from '../types/diary'
import { consolidateWeeklyMemory, getCompanionPresenceText, getReminderSnoozeMinutes, isWeeklyConsolidationDue, recordReminderOutcome, syncCompanionMemory, applyStructuredMemoryUpdate, tryProactiveFactRecall } from '../lib/pet-companion'
import { fireMorningStickerIfDue, fireReminderSticker, fireRelationshipMilestoneSticker } from '../lib/sticker-trigger'
import { createCollapsedHoverChatState, createExpandedHoverChatState, getHoverChatDockSchedule, getHoverChatSubmitCompletionState } from '../lib/hover-chat'
import { formatCodingReminderQueueText, isQueueableCodingReminder, updateCodingReminderQueue, type CodingReminderQueueItem } from '../lib/coding-reminder-queue'
import { renderShareCardBlob, blobToUint8Array, tryWriteImageToClipboard } from '../lib/share-card'
import { getPaletteCssVars, paletteOptions } from '../lib/palettes'
import { formatDateTime, resolveLanguage, t, type TranslationKey } from '../lib/i18n'
import { applyPetSettingsUpdate } from '../lib/pet-settings'
import type { CreateReminderInput, EventMemory, ExecutableInteractionType, InteractionType, PetAction, PetBubbleContent, PetCodingEvent, PetCodingEventPresentation, PetCutoutPlacement, PetData, PetGeneratedReply, PetLanguage, PetLeanDirection, PetModelConfig, PetModelHealth, PetModelServiceEnsureResult, PetOnboardingStep, PetRecentInteraction, PetReminderIntensity, PetReminderPhase, PetResolvedVisualState, PetShowState, ReminderItem, WalkTick } from '../types/pet'
import type { AchievementState, AuditState, CalendarState, DomainStateEnvelope, EconomyState, HomeState, InventoryState, JobState, OracleState, PlannerState, ToolRegistryState } from '../types/domain'
import type { ImportedPetLoadStatus, ImportedPetPackage } from '../types/pet-package'
import { usePetWindowEffects, type FloatingWindowInsets, type PetStageCanvasState } from './usePetWindowEffects'
import { useWindowPlatformSubscriptions } from './useWindowPlatformSubscriptions'

const ACTION_RESET_MS = 3200
const SINGLE_CLICK_DELAY_MS = 220
const BUBBLE_HIDE_MS = 5200
const CONVERSATION_BUBBLE_HIDE_MS = 9200
const CODING_DONE_BUBBLE_TTL_MS = 20000
const CODING_ALERT_BUBBLE_TTL_MS = 22000
const CODING_PRESENTATION_HOLD_MS = 24_000
const THINKING_BUBBLE_DELAY_MS = 260
const PET_STAGE_SIZE = 272
const PET_MIN_VISIBLE_SIZE = 136
const FLOATING_BUBBLE_BLOCK_HEIGHT = 46
const FLOATING_DOCK_COLLAPSED_HEIGHT = 30
const FLOATING_DOCK_EXPANDED_HEIGHT = 56
const FLOATING_HOVER_FORM_RESERVE_HEIGHT = 82
const FLOATING_MEASURE_SETTLE_MS = 120
const FLOATING_BOTTOM_MARGIN = 8
const FLOATING_PET_HOVER_CAPTURE_PADDING = 16
const USER_PET_IMAGE_MAX_BYTES = 4 * 1024 * 1024
const USER_PET_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const PANEL_WINDOW_LABEL = 'panel'
const PET_WINDOW_LABEL = 'pet'
const CUTOUT_PLACEMENT_PREVIEW_CHANNEL = 'aievopet-cutout-placement-preview'

const formatWorkingMode = (mode: PetData['memory']['working']['currentMode'], language: PetLanguage = 'zh-CN') => {
  const labels: Record<PetData['memory']['working']['currentMode'], Record<PetLanguage, string>> = {
    focus: { 'zh-CN': '专注陪伴', 'en-US': 'Focus companion' },
    care: { 'zh-CN': '提醒陪伴', 'en-US': 'Reminder companion' },
    chat: { 'zh-CN': '聊天陪伴', 'en-US': 'Chat companion' },
    rest: { 'zh-CN': '放空陪伴', 'en-US': 'Resting companion' },
    sleep: { 'zh-CN': '睡眠中', 'en-US': 'Sleeping' },
    idle: { 'zh-CN': '轻陪伴', 'en-US': 'Light companion' }
  }
  return labels[mode][language]
}

const formatReminderTime = (value: string, language: PetLanguage = 'zh-CN') => formatDateTime(language, value)

const fileStem = (name: string) => {
  const trimmed = name.trim()
  const dotIndex = trimmed.lastIndexOf('.')
  return (dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed).trim() || 'Local pet'
}

const fileToBase64Payload = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : ''
    const encoded = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result
    encoded ? resolve(encoded) : reject(new Error('empty image data'))
  }
  reader.onerror = () => reject(reader.error ?? new Error('failed to read image'))
  reader.readAsDataURL(file)
})

const formatAttentionMode = (pet: PetData, hasActiveReminder: boolean) => {
  const language = pet.ui.language ?? 'zh-CN'
  if (hasActiveReminder || pet.memory.working.currentScene === 'reminder-alert') return language === 'en-US' ? 'Active reminder' : '认真提醒'
  if (pet.state.isSleeping || pet.memory.working.currentScene === 'sleeping' || pet.memory.working.currentScene === 'sleepy') return language === 'en-US' ? 'Do not disturb' : '免打扰'
  if (pet.memory.working.currentScene === 'focus') return language === 'en-US' ? 'Quietly visible' : '低打扰可见'
  if (pet.memory.working.currentScene === 'lonely' || pet.memory.working.currentScene === 'reminder-soon') return language === 'en-US' ? 'Light nudge' : '轻提醒'
  return language === 'en-US' ? 'Present without interrupting' : '陪着但不打断'
}

const toLocalDateTimeInput = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

const createDefaultReminderTime = () => {
  const next = new Date(Date.now() + 10 * 60_000)
  next.setSeconds(0, 0)
  return toLocalDateTimeInput(next.toISOString())
}

const mapActionToEmotion = (action: PetAction, loneliness: number) => {
  if (action === 'happy' || action === 'blush' || action === 'celebrating') return 'happy' as const
  if (action === 'sleepy' || action === 'thinking' || action === 'reviewing' || action === 'waiting') return 'calm' as const
  if (action === 'hungry' || action === 'failed') return 'sad' as const
  if (action === 'talking' || action === 'alert') return loneliness > 55 ? ('lonely' as const) : ('excited' as const)
  return loneliness > 55 ? ('lonely' as const) : ('calm' as const)
}

const createEvent = (type: InteractionType, summary: string, action: PetAction, loneliness: number, sceneId?: EventMemory['sceneId']): EventMemory => ({
  id: crypto.randomUUID(),
  ts: new Date().toISOString(),
  type,
  summary,
  petEmotion: mapActionToEmotion(action, loneliness),
  importance: type === 'idle' ? 1 : 2,
  sceneId,
  tags: sceneId ? [type, sceneId] : [type]
})

const createCodingEventMemory = (
  event: PetCodingEvent,
  action: PetAction,
  loneliness: number,
  sceneId?: EventMemory['sceneId']
): EventMemory => ({
  id: event.id,
  ts: event.createdAt,
  type: event.kind,
  summary: event.summary?.trim() || event.title,
  petEmotion: mapActionToEmotion(action, loneliness),
  importance: event.status === 'failed' || event.kind === 'commit-created' ? 3 : 2,
  sceneId,
  tags: [event.kind, event.source, event.status, ...(sceneId ? [sceneId] : [])]
})

const formatCodingEventSource = (source: PetCodingEvent['source']) => {
  if (source === 'claude-code') return 'Claude Code'
  if (source === 'cursor') return 'Cursor'
  if (source === 'vscode') return 'VS Code'
  if (source === 'codex') return 'Codex'
  if (source === 'skill') return '技能'
  return '任务'
}

const isGenericCodingEventText = (text: string) => {
  const normalized = text.trim()
  return !normalized
    || /^Agent has stopped/i.test(normalized)
    || /^Claude Code finished a turn/i.test(normalized)
    || /^Notification raised by the Claude Code agent/i.test(normalized)
    || /^Claude Code 已完成一个任务。?$/.test(normalized)
    || /^任务：未识别到具体说明。需要你：不用操作，已完成。?$/.test(normalized)
}

const getCodingEventMetadataText = (event: PetCodingEvent, key: string) => {
  const value = event.metadata?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

const extractCodingTaskText = (summary?: string) => {
  const text = summary?.trim() ?? ''
  const match = /^任务：(.+?)。需要你：不用操作，已完成。?$/.exec(text)
  return match?.[1]?.trim() ?? ''
}

const getCodingEventStatusText = (event: PetCodingEvent) => {
  if (event.kind === 'task-done' && event.status === 'succeeded') return '完成了任务'
  if (event.status === 'failed' || event.kind === 'task-failed' || event.kind === 'test-fail' || event.kind === 'build-fail') return '需要你操作'
  if (event.status === 'running' || event.kind === 'task-start') return '正在处理'
  return '收到事件'
}

const formatCodingEventNotificationTitle = (event: PetCodingEvent) => `${formatCodingEventSource(event.source)}｜${getCodingEventStatusText(event)}`

const isPermissionAttentionEvent = (event: PetCodingEvent) => {
  const hookEventName = getCodingEventMetadataText(event, 'hookEventName')
  const notificationType = getCodingEventMetadataText(event, 'notificationType')
  return hookEventName === 'PermissionRequest' || notificationType === 'permission_prompt'
}

const getCodingEventPrimaryText = (event: PetCodingEvent) => {
  const taskName = getCodingEventMetadataText(event, 'taskName') || extractCodingTaskText(event.summary)
  if (taskName) return `任务：${taskName}`

  const command = getCodingEventMetadataText(event, 'command')
  if (command) return command.length > 80 ? `${command.slice(0, 79)}…` : command

  const summary = event.summary?.trim() ?? ''
  if (!isGenericCodingEventText(summary)) return summary

  const title = event.title.trim()
  return isGenericCodingEventText(title) ? `${formatCodingEventSource(event.source)} 事件已收到` : title
}

const formatCodingEventText = (event: PetCodingEvent) => {
  const text = getCodingEventPrimaryText(event)
  if (event.kind === 'task-done' && event.status === 'succeeded') {
    return `【${formatCodingEventSource(event.source)}｜完成了任务】\n${text}`
  }
  if (event.status === 'failed' || event.kind === 'task-failed' || event.kind === 'test-fail' || event.kind === 'build-fail') {
    return `【${formatCodingEventSource(event.source)}｜需要你操作】\n${text}`
  }
  if (event.status === 'running' || event.kind === 'task-start') {
    return `【${formatCodingEventSource(event.source)}｜正在处理】\n${text}`
  }
  return `【${formatCodingEventSource(event.source)}｜收到事件】\n${text}`
}

const codingMemoryTypes = new Set<EventMemory['type']>(['task-done', 'task-failed', 'test-fail', 'build-fail'])

const latestRecentCodingMemory = (events: EventMemory[] | undefined, now = Date.now()) => (events ?? [])
  .filter((item) => codingMemoryTypes.has(item.type))
  .map((event) => ({ event, timestamp: new Date(event.ts).getTime() }))
  .filter(({ timestamp }) => Number.isFinite(timestamp) && timestamp - now <= 5000 && now - timestamp <= 60_000)
  .sort((a, b) => b.timestamp - a.timestamp)[0]?.event ?? null

const codingEventFromMemory = (memory: EventMemory): PetCodingEvent => {
  const source = memory.tags?.find((tag): tag is PetCodingEvent['source'] => ['claude-code', 'codex', 'cursor', 'vscode', 'skill', 'manual'].includes(tag)) ?? 'manual'
  const status = memory.tags?.includes('failed') ? 'failed' : memory.tags?.includes('running') ? 'running' : 'succeeded'
  return {
    id: memory.id,
    kind: memory.type as PetCodingEvent['kind'],
    source,
    title: memory.summary,
    summary: memory.summary,
    status,
    createdAt: memory.ts
  }
}

const formatCodingMemoryText = (event: EventMemory) => {
  const source = event.tags?.find((tag): tag is PetCodingEvent['source'] => ['claude-code', 'codex', 'cursor', 'vscode', 'skill', 'manual'].includes(tag)) ?? 'manual'
  const text = event.summary.trim()
  if (event.type === 'task-done') return `【${formatCodingEventSource(source)}｜完成了任务】\n${text}`
  if (event.type === 'task-failed' || event.type === 'test-fail' || event.type === 'build-fail' || event.tags?.includes('failed')) return `【${formatCodingEventSource(source)}｜需要你操作】\n${text}`
  if (event.type === 'task-start' || event.tags?.includes('running')) return `【${formatCodingEventSource(source)}｜正在处理】\n${text}`
  return `【${formatCodingEventSource(source)}｜收到事件】\n${text}`
}

const toCodingEventPresentation = (event: PetCodingEvent): PetCodingEventPresentation => {
  const text = formatCodingEventText(event)

  if (event.kind === 'commit-created') {
    return {
      reply: {
        text,
        action: 'celebrating',
        show: {
          intent: 'celebrate',
          bubble: createBubbleState(text, { tone: 'playful', ttlMs: 5600 }),
          expression: { eyes: 'sparkle', mouth: 'smile' },
          animKey: 'bounce'
        }
      },
      persistent: false,
      shouldRecordMemory: true
    }
  }

  if (event.status === 'failed' || event.kind === 'task-failed' || event.kind === 'test-fail' || event.kind === 'build-fail') {
    return {
      reply: {
        text,
        action: isPermissionAttentionEvent(event) ? 'waiting' : 'failed',
        show: {
          intent: 'nudge',
          bubble: createBubbleState(text, { kind: 'thought', tone: 'alert', emphasis: 'high', ttlMs: CODING_ALERT_BUBBLE_TTL_MS }),
          expression: { eyes: 'alert', mouth: 'open' },
          animKey: 'alert'
        }
      },
      persistent: false,
      shouldRecordMemory: true
    }
  }

  if (event.status === 'running' || event.kind === 'task-start') {
    return {
      reply: {
        text,
        action: 'thinking',
        show: {
          intent: 'companionship',
          bubble: createBubbleState(text, { tone: 'soft', ttlMs: 4200 }),
          expression: { eyes: 'soft', mouth: 'open' },
          animKey: 'nudge'
        }
      },
      persistent: false,
      shouldRecordMemory: false
    }
  }

  if (event.kind === 'task-done' && event.status === 'succeeded') {
    return {
      reply: {
        text,
        action: 'celebrating',
        show: {
          intent: 'celebrate',
          bubble: createBubbleState(text, { tone: 'playful', emphasis: 'high', ttlMs: CODING_DONE_BUBBLE_TTL_MS }),
          expression: { eyes: 'smile', mouth: 'smile' },
          animKey: 'bounce'
        }
      },
      persistent: false,
      shouldRecordMemory: true
    }
  }

  return {
    reply: {
      text,
      action: 'celebrating',
      show: {
        intent: 'celebrate',
        bubble: createBubbleState(text, { tone: 'warm', ttlMs: 5200 }),
        expression: { eyes: 'smile', mouth: 'smile' },
        animKey: 'bounce'
      }
    },
    persistent: false,
    shouldRecordMemory: true
  }
}

const shouldMuteCodingEvent = (pet: PetData, event: PetCodingEvent) => {
  if (pet.ui.system.vacationMode || pet.ui.system.bossModeEnabled) {
    return event.status === 'running'
  }

  return false
}

// "Strong reminder" gate. The user explicitly opted into having the pet
// teleport to the monitor under their cursor + fire a silent OS
// notification on the events below; everything else (task-start /
// running ticks / quiet kinds like commit-created which already have
// their own happy bubble) keeps the lightweight in-window bubble only.
//
// Vacation/boss mode also suppress strong reminders entirely so a user
// who muted the pet doesn't get yanked back into focus by a build
// failure.
const shouldFireStrongReminder = (pet: PetData, event: PetCodingEvent) => {
  if (pet.ui.system.vacationMode || pet.ui.system.bossModeEnabled || pet.ui.system.nestModeEnabled) {
    return false
  }
  // Strong-reminder mode widens the gate: any non-running coding event
  // earns the teleport + OS notification path. We still skip 'running'
  // status because tick-by-tick progress events would just be spam — the
  // user opted into "stronger", not "every keystroke".
  if (pet.ui.system.strongReminderEnabled) {
    return event.status !== 'running' && !isPermissionAttentionEvent(event)
  }
  if (event.kind === 'task-failed' || event.kind === 'build-fail' || event.kind === 'test-fail') {
    return !isPermissionAttentionEvent(event)
  }
  if (event.status === 'failed') {
    return !isPermissionAttentionEvent(event)
  }
  if (event.kind === 'task-done' && event.status === 'succeeded') {
    return true
  }
  return false
}

const getIdleInterval = (pet: PetData) => {
  if (pet.state.hunger > 72) return 22000
  if (pet.state.isSleeping || pet.state.energy < 28) return 70000
  if (pet.state.loneliness > 55) return 28000
  return 45000
}

const normalizeCutoutPlacements = (placements: PetCutoutPlacement[]) => {
  const referenceLeft = 250
  const referenceTop = 204
  const referenceWidth = 2049
  const referenceHeight = 2164
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

  return placements.map((placement, index) => {
    const width = clamp(Math.round(placement.width), 24, referenceWidth)
    const height = clamp(Math.round(placement.height), 24, referenceHeight)
    const x = clamp(Math.round(placement.x), referenceLeft, referenceLeft + referenceWidth - width)
    const y = clamp(Math.round(placement.y), referenceTop, referenceTop + referenceHeight - height)

    return {
      ...placement,
      x,
      y,
      width,
      height,
      zIndex: Number.isFinite(placement.zIndex) ? Math.round(placement.zIndex) : index + 2
    }
  })
}

const normalizeVisibleCutoutPlacements = (placements: PetCutoutPlacement[]) => normalizeCutoutPlacements(placements).map((placement) => ({
  ...placement,
  visible: true
}))

const createCutoutPlacementStorageKey = (
  species: PetData['personality']['species'] | PetData['memory']['profile']['chosenSpecies'] | undefined,
  stage: PetData['state']['stage'],
  variantKey?: string
) => `${getAppearanceAsset(species, stage, variantKey).key}:${variantKey ?? 'default'}`

const createDefaultVisiblePlacementsForAppearance = (
  species: PetData['personality']['species'] | PetData['memory']['profile']['chosenSpecies'] | undefined,
  stage: PetData['state']['stage']
) => normalizeVisibleCutoutPlacements(createDefaultPlacementsForAppearance(species, stage))

const inferLeanDirection = (position?: PetData['ui']['position']): PetLeanDirection | undefined => {
  const screenWidth = window.screen.availWidth || window.screen.width || window.innerWidth
  const x = position?.x ?? window.screenX
  if (x < 0) return 'left'
  if (x > screenWidth - PET_STAGE_SIZE) return 'right'
  return undefined
}

const formatStage = (stage: PetData['state']['stage'], language: PetLanguage = 'zh-CN') => {
  const labels: Record<PetData['state']['stage'], Record<PetLanguage, string>> = {
    egg: { 'zh-CN': '宠物蛋', 'en-US': 'Pet egg' },
    baby: { 'zh-CN': '幼年期', 'en-US': 'Baby' },
    child: { 'zh-CN': '成长期', 'en-US': 'Growing' },
    adult: { 'zh-CN': '成熟期', 'en-US': 'Adult' },
    elder: { 'zh-CN': '陪伴老友', 'en-US': 'Old companion' }
  }
  return labels[stage][language]
}

// paletteOptions and palette tokens now live in '../lib/palettes' so the UI
// chips, the CSS variables applied to the app root, and the pet aura/shadow
// all read from a single source of truth. as const

const defaultFloatingWindowInsets = (): FloatingWindowInsets => ({
  top: FLOATING_BUBBLE_BLOCK_HEIGHT + FLOATING_PET_HOVER_CAPTURE_PADDING,
  right: FLOATING_PET_HOVER_CAPTURE_PADDING,
  bottom: FLOATING_DOCK_COLLAPSED_HEIGHT + FLOATING_PET_HOVER_CAPTURE_PADDING,
  left: FLOATING_PET_HOVER_CAPTURE_PADDING
})

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))

const getScreenBounds = () => ({
  width: window.screen.availWidth || window.screen.width || window.innerWidth,
  height: window.screen.availHeight || window.screen.height || window.innerHeight
})

const getPetFloorY = (insets?: FloatingWindowInsets) => {
  const { height } = getScreenBounds()
  const reservedBelowPet = Math.max(FLOATING_DOCK_EXPANDED_HEIGHT, insets?.bottom ?? FLOATING_HOVER_FORM_RESERVE_HEIGHT + FLOATING_PET_HOVER_CAPTURE_PADDING) + FLOATING_BOTTOM_MARGIN
  return Math.max(24, height - PET_STAGE_SIZE - reservedBelowPet)
}

const clampStagePosition = (position: PetStageCanvasState) => {
  const { width, height } = getScreenBounds()
  return {
    x: clamp(position.x, 0, Math.max(0, width - PET_STAGE_SIZE)),
    y: clamp(position.y, 0, Math.max(0, height - PET_STAGE_SIZE))
  }
}

const clampFloatingStagePosition = (position: PetStageCanvasState, insets: FloatingWindowInsets) => {
  const { width, height } = getScreenBounds()
  // Keep enough room below the pet for the chat dock / expanded form so
  // it never falls below the screen edge.
  const reservedBelowPet = Math.max(FLOATING_DOCK_EXPANDED_HEIGHT, insets.bottom) + FLOATING_BOTTOM_MARGIN
  const minY = PET_MIN_VISIBLE_SIZE - PET_STAGE_SIZE
  const maxY = Math.max(minY, height - PET_STAGE_SIZE - reservedBelowPet)
  return {
    x: clamp(position.x, PET_MIN_VISIBLE_SIZE - PET_STAGE_SIZE, Math.max(PET_MIN_VISIBLE_SIZE - PET_STAGE_SIZE, width - PET_MIN_VISIBLE_SIZE)),
    y: clamp(position.y, minY, maxY)
  }
}

const readStoredStagePosition = (pet: PetData | null): PetStageCanvasState => {
  const saved = pet?.ui.position
  if (!saved) return defaultPetStagePosition()
  return clampStagePosition({
    x: Number(saved.x ?? 0),
    y: Number(saved.y ?? 0)
  })
}

const defaultPetStagePosition = (): PetStageCanvasState => ({
  x: 72,
  y: getPetFloorY()
})

const onboardingSteps: PetOnboardingStep[] = ['language', 'identity', 'appearance', 'brain', 'hatch']

const getOnboardingStepIndex = (step: PetOnboardingStep) => onboardingSteps.indexOf(step)

const getNextOnboardingStep = (step: PetOnboardingStep): PetOnboardingStep => onboardingSteps[Math.min(onboardingSteps.length - 1, getOnboardingStepIndex(step) + 1)]

const completeOnboardingStep = (current: PetData, step: PetOnboardingStep, nextStep?: PetOnboardingStep): PetData['ui']['onboarding'] => ({
  ...current.ui.onboarding,
  completedSteps: Array.from(new Set([...current.ui.onboarding.completedSteps, step])),
  currentStep: nextStep ?? current.ui.onboarding.currentStep
})

const resolveRelationshipStage = (days: number, closeness: number): PetData['memory']['relationship']['stage'] => {
  if (days >= 365 || closeness >= 92) return 'soulmate'
  if (days >= 100 || closeness >= 82) return 'close'
  if (days >= 30 || closeness >= 64) return 'friend'
  if (days >= 7 || closeness >= 48) return 'warming-up'
  return 'stranger'
}

const formatRelationshipStage = (stage: PetData['memory']['relationship']['stage'], language: PetLanguage = 'zh-CN') => {
  const english = language === 'en-US'
  if (stage === 'warming-up') return english ? 'Getting closer' : '试着靠近'
  if (stage === 'friend') return english ? 'Already friends' : '已经是朋友'
  if (stage === 'close') return english ? 'Very close' : '很熟很黏'
  if (stage === 'soulmate') return english ? 'Understands you best' : '最懂你的搭子'
  return english ? 'Just met' : '刚认识'
}

const getBrainSetupHint = (health: PetModelHealth | null, draft: PetModelConfig | null, ensureResult: PetModelServiceEnsureResult | null, language: PetLanguage = 'zh-CN') => {
  const english = language === 'en-US'
  if (health?.ok) return english ? 'The local model passed generation checks, so it can chat naturally after hatching.' : '本地模型已通过生成检测，破壳后就能直接自然聊天。'
  if (ensureResult?.attemptedStart && ensureResult.connected) return english ? 'Ollama was started automatically. Checking whether the model can generate valid replies.' : '已自动拉起 Ollama，正在检测模型是否能生成有效回复。'
  if (ensureResult?.error) return english ? `Failed to start the local model automatically: ${ensureResult.error}` : `自动启动本地模型失败：${ensureResult.error}`
  if (draft?.enabled) return english ? 'Saving will try to start the local model automatically. Hatch after it connects.' : '保存时会尝试自动启动本地模型，确认连通后再破壳。'
  return english ? 'Connecting a local model is recommended; without it, the pet will start with fallback replies.' : '建议先接上本地模型；如果暂时没有，也可以先用 fallback 语气陪伴。'
}

const modelConfigToAiSetup = (config: PetModelConfig, health: PetModelHealth | null, ensureResult?: PetModelServiceEnsureResult | null, language: PetLanguage = 'zh-CN'): PetData['memory']['aiSetup'] => {
  const english = language === 'en-US'
  return {
    status: health?.ok ? 'ready' : config.enabled ? 'checking' : 'fallback',
    provider: config.enabled ? 'ollama' : 'fallback',
    desiredModel: config.model,
    endpoint: config.endpoint,
    lastCheckedAt: new Date().toISOString(),
    note: health?.ok
      ? (english ? `Passed generation check: ${health.model}` : `已通过生成检测：${health.model}`)
      : config.enabled
        ? (ensureResult?.error
          ? (english ? `Auto-start failed: ${ensureResult.error}` : `自动启动失败：${ensureResult.error}`)
          : ensureResult?.attemptedStart
            ? (english ? 'Tried to start the local model automatically; waiting for connection.' : '已尝试自动启动本地模型，等待连通结果。')
            : (health?.error ? (english ? `Waiting for model connection: ${health.error}` : `等待模型连通：${health.error}`) : (english ? 'Waiting to check local model status.' : '等待检测本地模型状态。')))
        : (english ? 'Currently using fallback copy.' : '当前会走 fallback 文案。')
  }
}

const getWalkAction = (tick: WalkTick, pet: PetData): PetAction => {
  if (pet.ui.system.nestModeEnabled) return 'sleepy'
  if (pet.ui.system.bossModeEnabled || pet.ui.system.vacationMode) return 'idle'
  return tick.action
}

const getWalkLeanAmount = (pet: PetData): 'still' | 'soft' | 'active' => {
  if (pet.ui.system.bossModeEnabled) return 'still'
  if (pet.ui.system.nestModeEnabled) return 'soft'
  return 'active'
}

const updateEnvelope = <T,>(envelope: DomainStateEnvelope<T>, data: T): DomainStateEnvelope<T> => ({
  ...envelope,
  updatedAt: new Date().toISOString(),
  data
})

const resolveVisualState = (
  pet: PetData | null,
  action: PetAction,
  reply?: Pick<PetGeneratedReply, 'show' | 'action'>
): PetResolvedVisualState => {
  const show = reply?.show
  // Palette and wardrobe overlays are app-wide identity that lives on multiple
  // Tauri windows. They MUST come from the persisted pet (which is broadcast
  // via the `pet-updated` event) so the panel and pet windows agree. The
  // ephemeral `show.palette` / `show.overlayIds` from a single LLM reply only
  // reach whichever window ran the conversation, so honoring them here used to
  // desync the chat dock from the companion panel. The agent loop now turns
  // any palette hint into a real `settings.update` so persistence is the
  // single source of truth.
  const basePalette = pet?.memory.profile.selectedPalette ?? 'cotton-candy'
  const baseOverlayIds = pet?.ui.wardrobeSelection ? [pet.ui.wardrobeSelection] : []

  return {
    palette: basePalette,
    overlayIds: baseOverlayIds,
    expression: show?.expression ?? (
      action === 'sleepy'
        ? { eyes: 'sleepy', mouth: 'sleepy' }
        : action === 'alert' || action === 'failed'
          ? { eyes: 'alert', mouth: action === 'failed' ? 'pout' : 'open' }
          : action === 'happy' || action === 'celebrating'
            ? { eyes: 'sparkle', mouth: 'smile' }
            : action === 'blush'
              ? { eyes: 'smile', mouth: 'pout' }
              : action === 'talking' || action === 'thinking' || action === 'reviewing' || action === 'waiting'
                ? { eyes: 'soft', mouth: action === 'waiting' ? 'neutral' : 'open' }
                : { eyes: 'neutral', mouth: 'neutral' }
    ),
    animKey: show?.animKey ?? (
      action === 'alert' || action === 'failed'
        ? 'alert'
        : action === 'happy' || action === 'celebrating'
          ? 'bounce'
          : action === 'blush'
            ? 'blush'
            : action === 'sleepy'
              ? 'sleep'
              : action === 'talking' || action === 'thinking' || action === 'reviewing' || action === 'waiting'
                ? 'nudge'
                : 'idle'
    )
  }
}

const createBubbleState = (text: string, overrides?: Partial<Omit<PetBubbleContent, 'text'>>): PetBubbleContent => ({
  kind: overrides?.kind ?? 'speech',
  text,
  tone: overrides?.tone ?? 'warm',
  emphasis: overrides?.emphasis,
  ttlMs: overrides?.ttlMs,
  loading: overrides?.loading,
  typing: overrides?.typing
})

const bubbleFromReply = (
  reply: Pick<PetGeneratedReply, 'text' | 'action' | 'show'>,
  fallbackPalette?: string,
  fallbackOverlayIds?: string[]
): PetBubbleContent => {
  const show = reply.show
  if (show?.bubble?.text?.trim()) {
    return {
      ...show.bubble,
      text: show.bubble.text.trim().slice(0, 220)
    }
  }

  if (reply.action === 'sleepy') {
    return createBubbleState(reply.text, { kind: 'dream', tone: 'soft', ttlMs: 6800 })
  }

  if (reply.action === 'alert' || show?.intent === 'nudge') {
    return createBubbleState(reply.text, { kind: 'thought', tone: 'alert', emphasis: 'high', ttlMs: 6000 })
  }

  if (reply.action === 'happy' || reply.action === 'blush' || show?.intent === 'celebrate') {
    return createBubbleState(reply.text, { kind: 'speech', tone: 'playful', ttlMs: 5600 })
  }

  if (show?.palette && show.palette !== fallbackPalette) {
    return createBubbleState(reply.text, { kind: 'thought', tone: 'soft', ttlMs: 5600 })
  }

  if (show?.overlayIds?.length && JSON.stringify(show.overlayIds) !== JSON.stringify(fallbackOverlayIds ?? [])) {
    return createBubbleState(reply.text, { kind: 'speech', tone: 'playful', ttlMs: 5600 })
  }

  return createBubbleState(reply.text, { kind: 'speech', tone: 'warm', ttlMs: 5200 })
}

const withReplySource = <T extends Pick<PetGeneratedReply, 'text' | 'action'> & Partial<Pick<PetGeneratedReply, 'show' | 'source'>>>(
  reply: T,
  source: 'model' | 'fallback' = 'fallback'
): Pick<PetGeneratedReply, 'text' | 'action' | 'show' | 'source'> => ({
  text: reply.text,
  action: reply.action,
  show: reply.show,
  source: reply.source ?? source
})

interface CutoutPlacementPreviewMessage {
  key: string
  placements: PetCutoutPlacement[]
}

export function usePetAppController({ forcedWindowLabel }: { forcedWindowLabel?: string } = {}) {
  const [pet, setPet] = useState<PetData | null>(null)
  const [bubble, setBubble] = useState<PetBubbleContent>(createBubbleState(''))
  const [action, setAction] = useState<PetAction>('idle')
  const [showState, setShowState] = useState<PetGeneratedReply['show']>()
  const [teleportEffectKey, setTeleportEffectKey] = useState(0)
  const [activeStickerId, setActiveStickerId] = useState<string | undefined>()
  const [draft, setDraft] = useState('')
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [lastReplySource, setLastReplySource] = useState<'model' | 'fallback'>('fallback')
  const [hoverChatVisible, setHoverChatVisible] = useState(false)
  const [hoverChatExpanded, setHoverChatExpanded] = useState(false)
  const [reminders, setReminders] = useState<ReminderItem[]>([])
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderTime, setReminderTime] = useState(createDefaultReminderTime)
  const [reminderIntensity, setReminderIntensity] = useState<PetReminderIntensity>('medium')
  const [activeReminder, setActiveReminder] = useState<ReminderItem | null>(null)
  const [recentInteraction, setRecentInteraction] = useState<PetRecentInteraction | null>(null)
  const [reminderPhase, setReminderPhase] = useState<PetReminderPhase>('none')
  const [rendererMode, setRendererMode] = useState<PetRendererMode>('mesh')
  const [showMeshDebug, setShowMeshDebug] = useState(false)
  const [modelConfig, setModelConfig] = useState<PetModelConfig | null>(null)
  const [modelDraft, setModelDraft] = useState<PetModelConfig | null>(null)
  const [modelSaving, setModelSaving] = useState(false)
  const [modelHealth, setModelHealth] = useState<PetModelHealth | null>(null)
  const [modelServiceEnsureResult, setModelServiceEnsureResult] = useState<PetModelServiceEnsureResult | null>(null)
  const [modelConfigMessage, setModelConfigMessage] = useState('')
  const [screenAwarenessStatus, setScreenAwarenessStatus] = useState<{
    state: 'idle' | 'capturing' | 'ready' | 'error' | 'unsupported'
    preview?: string
    lineCount?: number
    message?: string
  }>({ state: 'idle' })
  const [inventoryEnvelope, setInventoryEnvelope] = useState<DomainStateEnvelope<InventoryState> | null>(null)
  const [economyEnvelope, setEconomyEnvelope] = useState<DomainStateEnvelope<EconomyState> | null>(null)
  const [homeEnvelope, setHomeEnvelope] = useState<DomainStateEnvelope<HomeState> | null>(null)
  const [jobEnvelope, setJobEnvelope] = useState<DomainStateEnvelope<JobState> | null>(null)
  const [achievementEnvelope, setAchievementEnvelope] = useState<DomainStateEnvelope<AchievementState> | null>(null)
  const [shareCardStatus, setShareCardStatus] = useState<{
    state: 'idle' | 'exporting' | 'ready' | 'error'
    savedPath?: string
    fileName?: string
    clipboardCopied?: boolean
    message?: string
    kind?: 'manual' | 'growth'
    stage?: PetData['state']['stage']
  }>({ state: 'idle' })
  const [weeklySummaryStatus, setWeeklySummaryStatus] = useState<{
    state: 'idle' | 'refreshing' | 'ready' | 'skipped' | 'error'
    message?: string
  }>({ state: 'idle' })
  // Hides the auto-trigger from re-firing on every render. Cleared via a ref
  // so the controller stays a single hook even when the pet object identity
  // changes from event listeners.
  const weeklyConsolidationInFlightRef = useRef(false)
  // Diary ledger lives outside pet.json so it can grow without bloating the
  // commit pipeline. Initialised lazily from disk on mount; null until the
  // first load completes so the UI can show a "loading" hint.
  const [diaryLedger, setDiaryLedger] = useState<PetDiaryLedger | null>(null)
  const diaryLedgerRef = useRef<PetDiaryLedger | null>(null)
  const diaryRollupInFlightRef = useRef(false)
  const [diarySelectedDate, setDiarySelectedDate] = useState<string>(formatDateKey(new Date()))
  const [diaryStatus, setDiaryStatus] = useState<{
    state: 'idle' | 'refreshing' | 'ready' | 'error'
    message?: string
  }>({ state: 'idle' })
  const [plannerEnvelope, setPlannerEnvelope] = useState<DomainStateEnvelope<PlannerState> | null>(null)
  const [calendarEnvelope, setCalendarEnvelope] = useState<DomainStateEnvelope<CalendarState> | null>(null)
  const [toolEnvelope, setToolEnvelope] = useState<DomainStateEnvelope<ToolRegistryState> | null>(null)
  const [oracleEnvelope, setOracleEnvelope] = useState<DomainStateEnvelope<OracleState> | null>(null)
  const [auditEnvelope, setAuditEnvelope] = useState<DomainStateEnvelope<AuditState> | null>(null)
  const [showAlignmentEditor, setShowAlignmentEditor] = useState(false)
  const [dockLeanDirection, setDockLeanDirection] = useState<PetLeanDirection | undefined>(undefined)
  const [dockLeanAmount, setDockLeanAmount] = useState<'still' | 'soft' | 'active'>('still')
  const [stagePosition, setStagePosition] = useState<PetStageCanvasState>({ x: 72, y: 72 })
  const [walkTarget, setWalkTarget] = useState<PetStageCanvasState | null>(null)
  const [currentWindowLabel, setCurrentWindowLabel] = useState<string | undefined>(() => forcedWindowLabel ?? petPlatform.getCurrentWindowLabel())
  const currentWindowLabelRef = useRef<string | undefined>(forcedWindowLabel ?? petPlatform.getCurrentWindowLabel())
  const [appliedCutoutPlacements, setAppliedCutoutPlacements] = useState<PetCutoutPlacement[]>(createDefaultVisiblePlacementsForAppearance('puppy', 'egg'))
  const [cutoutPlacements, setCutoutPlacements] = useState<PetCutoutPlacement[]>(createDefaultVisiblePlacementsForAppearance('puppy', 'egg'))
  // Live wardrobe placement preview while the user is mid-drag in the
  // alignment editor. Keeps the overlay (in BOTH the panel preview and
  // the floating pet window) following the pointer without round-tripping
  // through commitPet → savePet → disk on every pointermove. Cleared on
  // pointerup, when the editor commits via onUpdateWardrobePlacement, or
  // when the user equips a different item.
  const [wardrobePlacementPreview, setWardrobePlacementPreview] = useState<{ itemId: string; placement: import('../types/wardrobe').WardrobePlacement } | null>(null)
  // A6: user-supplied wardrobe overrides. Populated once on mount from
  // <data_dir>/wardrobe/<id>.png; the data URLs override the bundled
  // assetUrl when the renderer composes overlays. Empty Map until the
  // platform call resolves, which is fine — we just render bundled art
  // until then, and the second render swaps in user art.
  const [userWardrobeAssets, setUserWardrobeAssets] = useState<Map<string, string>>(() => new Map())
  const [importedPetLoadStatus, setImportedPetLoadStatus] = useState<ImportedPetLoadStatus>({ state: 'idle', count: 0 })
  const [userPetImageImportStatus, setUserPetImageImportStatus] = useState<{ state: 'idle' | 'creating' | 'ready' | 'error'; message?: string }>({ state: 'idle' })
  const [importedSpeciesOptions, setImportedSpeciesOptions] = useState<readonly { value: PetData['personality']['species']; label: string; labelEn?: string }[]>([])
  const combinedSpeciesOptions = useMemo(() => [...speciesOptions, ...importedSpeciesOptions], [importedSpeciesOptions])
  const [floatingWindowInsets, setFloatingWindowInsets] = useState<FloatingWindowInsets>(defaultFloatingWindowInsets)
  const [floatingWindowMeasured, setFloatingWindowMeasured] = useState(false)
  const thinkingBubbleTimerRef = useRef<number | null>(null)

  const petRef = useRef<PetData | null>(null)
  const auditEnvelopeRef = useRef<DomainStateEnvelope<AuditState> | null>(null)
  const petStageRef = useRef<HTMLElement | null>(null)
  const petAnchorRef = useRef<HTMLDivElement | null>(null)
  const dragPositionRef = useRef<PetStageCanvasState | null>(null)
  const isDraggingRef = useRef(false)
  const actionTimerRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const idleTimerRef = useRef<number | null>(null)
  const panelToggleTimerRef = useRef<number | null>(null)
  const bubbleHideTimerRef = useRef<number | null>(null)
  const cutoutPlacementSaveTimerRef = useRef<number | null>(null)
  const hoverChatShowTimerRef = useRef<number | null>(null)
  const hoverChatHideTimerRef = useRef<number | null>(null)
  const hoverChatHoveringRef = useRef(false)
  const chatSubmitInFlightRef = useRef(false)
  const lastPresentedCodingMemoryIdRef = useRef<string | null>(null)
  const pendingCodingEventsRef = useRef<PetCodingEvent[]>([])
  const codingEventReadyRef = useRef(false)
  const codingPresentationHoldUntilRef = useRef(0)
  const codingReminderQueueRef = useRef<CodingReminderQueueItem[]>([])
  const attemptedModelAutostartRef = useRef(false)
  const modelAutostartInFlightRef = useRef(false)
  // Tracks the most recently observed lifecycle stage so we can fire a
  // celebration when the pet ages up (baby -> child / child -> adult / ...).
  // Initialised lazily on the first pet load so existing saves don't replay
  // every prior transition the moment the app boots.
  const lastObservedStageRef = useRef<PetData['state']['stage'] | undefined>(undefined)
  const isCelebratingStageRef = useRef(false)
  const careTrayPayloadRef = useRef<{ interaction: ExecutableInteractionType; inventoryItemId?: string } | null>(null)
  /** Synchronous guard: React state from drag lags one frame; dock hover must not fight tray drag. */
  const careTrayDraggingRef = useRef(false)

  const inventoryState = inventoryEnvelope?.data ?? { items: [], equippedWardrobeSlots: {} }
  const snackInventoryCount = useMemo(() => getInventoryQuantity(inventoryState, 'snack-pack'), [inventoryState])
  const economyState = economyEnvelope?.data ?? { pawcoin: 0, lifetimeEarned: 0, lifetimeSpent: 0, pendingRewards: [] }
  const homeState = homeEnvelope?.data ?? { roomTier: 'starter', comfort: 0, furniture: [] }
  const jobState = jobEnvelope?.data ?? { unlockedJobs: [], completedJobs: 0 }
  const achievementState = achievementEnvelope?.data ?? { unlocked: [], exportedCards: 0 }
  // Always advertise 'ics' provider externally so the UI prompt copy ("导出
  // .ics") is honest. The 'none' / 'eventkit' values are still legal in the
  // type so prior persisted state loads cleanly, but new permissions /
  // exports always settle on 'ics'.
  const oracleState = oracleEnvelope?.data ?? { history: [] }
  const auditState = auditEnvelope?.data ?? { entries: [] }

  const shouldShowFloatingBubble = Boolean(bubbleVisible && bubble.text.trim())
  useEffect(() => {
    if (!import.meta.env.VITE_AI_PET_E2E) return
    ;(window as typeof window & { __AI_PET_DEBUG__?: unknown }).__AI_PET_DEBUG__ = {
      pet,
      bubble,
      bubbleVisible,
      showState,
      currentWindowLabel,
      codingEventReady: codingEventReadyRef.current,
      pendingCodingEventIds: pendingCodingEventsRef.current.map((event) => event.id)
    }
  }, [bubble, bubbleVisible, currentWindowLabel, pet, showState])
  const shouldShowFocusPill = Boolean(pet?.memory.working.currentMode === 'focus' && !pet?.ui.panelOpen)
  // Tick once per minute so the active-job head cue countdown ("打工 5'")
  // refreshes without blowing up render. The minute-grain matches what the
  // user reads on a clock; finer ticks would just be wasted work.
  const [headCueTick, setHeadCueTick] = useState(0)
  const [careTrayDrag, setCareTrayDrag] = useState<{ emoji: string; clientX: number; clientY: number } | null>(null)
  useEffect(() => {
    if (!jobState.activeJob) return
    const interval = window.setInterval(() => setHeadCueTick((value) => value + 1), 30 * 1000)
    return () => window.clearInterval(interval)
  }, [jobState.activeJob])

  // Mixed symbolic head cues (single cue at a time):
  //   Zzz / 饿|Hungry / 打工 N'|Work N' / $? / $!
  // Priority keeps the signal readable; only the most urgent cue is shown.
  const headCue = useMemo(() => {
    if (!pet) return undefined
    const isZh = (pet.ui.language ?? 'zh-CN') === 'zh-CN'
    const sleeping = pet.state.isSleeping || pet.memory.working.currentScene === 'sleeping' || pet.memory.working.currentScene === 'sleepy' || pet.state.energy < 24
    if (sleeping) return { kind: 'sleepy' as const, label: 'Zzz' }
    if (pet.state.hunger >= 68) return { kind: 'hungry' as const, label: isZh ? '饿' : 'Hungry' }

    const activeJob = jobState.activeJob
    const inQuietMode = pet.ui.system.vacationMode || pet.ui.system.bossModeEnabled
    if (activeJob) {
      const endsAtMs = new Date(activeJob.endsAt).getTime()
      const minutesLeft = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 60_000))
      const baseLabel = isZh ? '打工' : 'Work'
      // Once the timer hits 0 we display "OK" so the user immediately sees
      // the job has matured even if the auto-claim is still mid-flight.
      const trailingLabel = minutesLeft <= 0 ? (isZh ? 'OK' : 'OK') : `${minutesLeft}'`
      return { kind: 'work' as const, label: `${baseLabel} ${trailingLabel}` }
    }

    if (!inQuietMode && economyState.pawcoin <= 18) return { kind: 'earn' as const, label: '$?' }
    if (!inQuietMode && economyState.pawcoin >= 120) return { kind: 'spend' as const, label: '$!' }

    const minUnlockBond = Math.min(...JOB_OPTIONS.map((job) => job.unlockBond))
    if (!inQuietMode && !activeJob && pet.memory.bond.closeness >= minUnlockBond && economyState.pawcoin < 70) {
      return { kind: 'work' as const, label: isZh ? '打工' : 'Work' }
    }
    return undefined
    // headCueTick deliberately included so the countdown re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet, jobState.activeJob, economyState.pawcoin, headCueTick])

  const latestCodingMemory = useMemo(() => latestRecentCodingMemory(pet?.memory.events), [pet?.memory.events])
  const petFloatingHeadCue = useMemo(() => {
    if (latestCodingMemory) return undefined
    if (careTrayDrag) return { kind: 'hint' as const, label: '?' }
    return headCue
  }, [careTrayDrag, headCue, latestCodingMemory])
  const effectiveStagePosition = useMemo(
    () => currentWindowLabel === PET_WINDOW_LABEL
      ? clampFloatingStagePosition(stagePosition, floatingWindowInsets)
      : stagePosition,
    [currentWindowLabel, floatingWindowInsets, stagePosition]
  )
  const floatingWindowBounds = useMemo(() => ({
    x: Math.round(effectiveStagePosition.x - floatingWindowInsets.left),
    y: Math.max(0, Math.round(effectiveStagePosition.y - floatingWindowInsets.top)),
    width: Math.round(PET_STAGE_SIZE + floatingWindowInsets.left + floatingWindowInsets.right),
    height: Math.round(PET_STAGE_SIZE + floatingWindowInsets.top + floatingWindowInsets.bottom)
  }), [effectiveStagePosition.x, effectiveStagePosition.y, floatingWindowInsets.bottom, floatingWindowInsets.left, floatingWindowInsets.right, floatingWindowInsets.top])
  const floatingWindowAnchorStyle = useMemo<CSSProperties | undefined>(() => {
    if (currentWindowLabel !== PET_WINDOW_LABEL) return undefined
    return {
      '--floating-anchor-left': `${Math.round(floatingWindowInsets.left)}px`,
      '--floating-anchor-top': `${Math.round(floatingWindowInsets.top)}px`
    } as CSSProperties
  }, [currentWindowLabel, floatingWindowInsets.left, floatingWindowInsets.top])

  const pendingReminders = useMemo(
    () => reminders.filter((item) => item.status === 'pending').sort((a, b) => new Date((a.snoozeUntil ?? a.scheduledAt)).getTime() - new Date((b.snoozeUntil ?? b.scheduledAt)).getTime()),
    [reminders]
  )
  const visualState = useMemo(
    () => resolveVisualState(
      pet,
      action,
      showState ? { action, show: showState } : undefined
    ),
    [action, pet, showState]
  )
  const currentSpecies = pet?.memory.profile.chosenSpecies ?? pet?.personality.species ?? 'puppy'
  const currentSpeciesVariantKey = pet?.ui.speciesVariantBySpecies?.[currentSpecies]
  const appearanceRefreshKey = pet?.ui.speciesChangedAt
  const currentAppearanceAsset = useMemo(
    () => getAppearanceAsset(currentSpecies, pet?.state.stage ?? 'egg', currentSpeciesVariantKey),
    [currentSpecies, currentSpeciesVariantKey, pet?.state.stage, appearanceRefreshKey, importedSpeciesOptions]
  )

  // Wardrobe overlays passed to PetCanvas. Every equipped slot is looked
  // up in the manifest; the result drives both the overlay sprite and
  // the alignment editor preview.
  //
  // Preview override: while the user is dragging in the alignment editor,
  // wardrobePlacementPreview holds the live (uncommitted) placement and
  // we use it instead of the saved value so the overlay tracks the
  // pointer in real time without writing to disk on every pointermove.
  //
  // Slot ordering drives z-index for overlapping items: 'back' renders
  // behind 'neck', which renders behind 'head-top', etc. — handled by
  // iteration order (earlier = lower z).
  const wardrobeOverlays = useMemo(() => {
    if (!pet) return []
    const equipped = pet.ui.wardrobeEquipped ?? {}
    const species = pet.memory.profile.chosenSpecies ?? pet.personality.species
    const placements = pet.ui.wardrobePlacements?.[species] ?? {}
    const slotOrder: import('../types/wardrobe').WardrobeSlot[] = ['back', 'chest', 'neck', 'mouth', 'face', 'head-top', 'hand', 'floating']
    const overlays: { item: import('../types/wardrobe').WardrobeItem; placement: import('../types/wardrobe').WardrobePlacement }[] = []
    for (const slot of slotOrder) {
      const itemId = equipped[slot]
      if (!itemId) continue
      const baseItem = getWardrobeItemById(itemId)
      if (!baseItem) continue
      // A6 + variant draw:
      // 1) user override from data dir (single explicit file) wins
      // 2) otherwise use persisted bundled variant key for this item
      // 3) fallback to first bundled variant, then manifest assetUrl
      const userAsset = userWardrobeAssets.get(itemId)
      const chosenVariantKey = pet.ui.wardrobeVariantByItem?.[itemId]
      const bundledVariants = getBundledWardrobeVariants(itemId)
      const bundledVariant = chosenVariantKey
        ? bundledVariants.find((variant) => variant.key === chosenVariantKey)
        : bundledVariants[0]
      const item = userAsset
        ? { ...baseItem, assetUrl: userAsset }
        : bundledVariant
          ? { ...baseItem, assetUrl: bundledVariant.url }
          : baseItem
      const savedPlacement = placements[item.id] ?? DEFAULT_PLACEMENT
      const placement = wardrobePlacementPreview?.itemId === item.id
        ? wardrobePlacementPreview.placement
        : savedPlacement
      overlays.push({ item, placement })
    }
    return overlays
  }, [pet?.ui.wardrobeEquipped, pet?.ui.wardrobeVariantByItem, pet?.ui.wardrobePlacements, pet?.memory.profile.chosenSpecies, pet?.personality.species, wardrobePlacementPreview, userWardrobeAssets])

  // Memoise the active palette as a CSS-variable bag. Spread on the app
  // root so the panel surface, chat bubble, dock, accent buttons and the
  // pet's aura all read from one source.
  const paletteStyle = useMemo<CSSProperties>(
    () => getPaletteCssVars(visualState.palette) as CSSProperties,
    [visualState.palette]
  )
  const nearestReminder = useMemo(() => getNearestPendingReminder(reminders), [reminders])
  const nearestReminderAt = nearestReminder ? (nearestReminder.snoozeUntil ?? nearestReminder.scheduledAt) : null
  const nearestReminderIntensity = normalizeReminderIntensity(nearestReminder?.intensity)
  const hasModelDraftChanges = useMemo(() => {
    if (!modelConfig || !modelDraft) return false
    return JSON.stringify(modelConfig) !== JSON.stringify(modelDraft)
  }, [modelConfig, modelDraft])
  const language = pet?.ui.language ?? 'zh-CN'
  const localized = (zh: string, en: string) => language === 'en-US' ? en : zh
  const shopItemTitle = (item: (typeof SHOP_ITEMS)[number]) => language === 'en-US' ? item.titleEn : item.title
  const jobTitle = (job: (typeof JOB_OPTIONS)[number]) => language === 'en-US' ? job.titleEn : job.title
  const wardrobeItemName = (item: { nameZh: string; nameEn?: string }) => language === 'en-US' ? item.nameEn ?? item.nameZh : item.nameZh
  const onboardingStep = pet?.ui.onboarding.currentStep ?? 'language'
  const onboardingStepIndex = getOnboardingStepIndex(onboardingStep)
  const onboardingProgress = `${Math.max(1, onboardingStepIndex + 1)}/${onboardingSteps.length}`
  const aiSetupReady = Boolean(modelHealth?.ok)
  const brainSetupHint = getBrainSetupHint(modelHealth, modelDraft, modelServiceEnsureResult, language)
  useEffect(() => {
    auditEnvelopeRef.current = auditEnvelope
  }, [auditEnvelope])

  useEffect(() => {
    const nextLabel = forcedWindowLabel ?? petPlatform.getCurrentWindowLabel()
    currentWindowLabelRef.current = nextLabel
    setCurrentWindowLabel(nextLabel)
  }, [forcedWindowLabel])

  // Reset placements synchronously when species/stage changes so the cutout
  // ids always line up with the active appearance's part definitions.
  // Using useLayoutEffect avoids a one-frame mismatch right after hatching
  // (stage='baby' but placements still id='egg'), which would otherwise leave
  // the pet rendered empty until the next paint.
  useLayoutEffect(() => {
    if (!pet) return
    const storageKey = createCutoutPlacementStorageKey(
      pet.memory.profile.chosenSpecies ?? pet.personality.species,
      pet.state.stage,
      currentSpeciesVariantKey
    )
    const placements = pet.ui.cutoutPlacementsByAppearance?.[storageKey]
      ? normalizeVisibleCutoutPlacements(pet.ui.cutoutPlacementsByAppearance[storageKey])
      : createDefaultVisiblePlacementsForAppearance(pet.memory.profile.chosenSpecies ?? pet.personality.species, pet.state.stage)
    setCutoutPlacements(placements)
    setAppliedCutoutPlacements(placements)
  }, [currentSpeciesVariantKey, pet?.memory.profile.chosenSpecies, pet?.personality.species, pet?.state.stage, pet?.ui.cutoutPlacementsByAppearance])

  useEffect(() => {
    if (!pet) return
    const channel = new BroadcastChannel(CUTOUT_PLACEMENT_PREVIEW_CHANNEL)
    const handleMessage = (event: MessageEvent<CutoutPlacementPreviewMessage>) => {
      if (currentWindowLabelRef.current === PANEL_WINDOW_LABEL) return
      const key = createCutoutPlacementStorageKey(
        petRef.current?.memory.profile.chosenSpecies ?? petRef.current?.personality.species,
        petRef.current?.state.stage ?? 'egg',
        petRef.current?.ui.speciesVariantBySpecies?.[petRef.current?.memory.profile.chosenSpecies ?? petRef.current?.personality.species ?? 'puppy']
      )
      if (event.data?.key !== key || !Array.isArray(event.data.placements)) return
      const placements = normalizeVisibleCutoutPlacements(event.data.placements)
      setCutoutPlacements(placements)
      setAppliedCutoutPlacements(placements)
    }
    channel.addEventListener('message', handleMessage)
    return () => channel.close()
  }, [pet])

  const syncPet = (next: PetData) => {
    petRef.current = next
    setPet(next)
  }

  const syncExternalPet = (next: PetData) => {
    const previous = petRef.current
    const latestMemory = currentWindowLabel === PET_WINDOW_LABEL ? latestRecentCodingMemory(next.memory.events) : null
    syncPet(next)

    if (currentWindowLabel === PET_WINDOW_LABEL) {
      setWalkTarget(null)
      if (
        previous?.state.stage !== next.state.stage ||
        previous?.personality.species !== next.personality.species ||
        previous?.memory.profile.chosenSpecies !== next.memory.profile.chosenSpecies ||
        previous?.ui.speciesVariantBySpecies !== next.ui.speciesVariantBySpecies ||
        previous?.ui.speciesChangedAt !== next.ui.speciesChangedAt ||
        previous?.ui.wardrobeSelection !== next.ui.wardrobeSelection
      ) {
        setShowState(undefined)
      }
      if (latestMemory && lastPresentedCodingMemoryIdRef.current !== latestMemory.id) {
        lastPresentedCodingMemoryIdRef.current = latestMemory.id
        presentCodingEvent(next, codingEventFromMemory(latestMemory), { skipMemory: true })
      }
    }
  }

  useEffect(() => {
    if (currentWindowLabel !== PET_WINDOW_LABEL) return
    let cancelled = false
    const refreshCodingMemoryFromDisk = async () => {
      if (!codingEventReadyRef.current) return
      const next = await loadPet()
      const latestMemory = latestRecentCodingMemory(next.memory.events)
      if (!latestMemory || lastPresentedCodingMemoryIdRef.current === latestMemory.id) return
      if (!cancelled) syncExternalPet(next)
    }
    const interval = window.setInterval(() => {
      void refreshCodingMemoryFromDisk().catch((error) => console.warn('[coding-event] failed to refresh pet memory', error))
    }, 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [currentWindowLabel])

  const updatePet = (updater: (current: PetData) => PetData) => {
    const current = petRef.current
    if (!current) return null
    const next = updater(current)
    syncPet(next)
    return next
  }

  const commitPet = async (next: PetData | null) => {
    if (!next) return
    await savePet(next)
  }

  const refreshModelHealth = async (configOverride?: PetModelConfig, ensureResult?: PetModelServiceEnsureResult | null) => {
    const effectiveConfig = configOverride ?? modelDraft ?? modelConfig ?? {
      enabled: false,
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      model: 'qwen3:4b-instruct',
      timeoutMs: 12000
    }
    const health = await checkModelHealth()
    setModelHealth(health)
    if (ensureResult !== undefined) {
      setModelServiceEnsureResult(ensureResult)
    }
    setPet((current) => current ? {
      ...current,
      memory: {
        ...current.memory,
        aiSetup: modelConfigToAiSetup(effectiveConfig, health, ensureResult === undefined ? modelServiceEnsureResult : ensureResult, petRef.current?.ui.language ?? language)
      }
    } : current)
    return health
  }

  const maybeEnsureModelService = async (config: PetModelConfig, force = false) => {
    if (!config.enabled) {
      setModelServiceEnsureResult(null)
      return null
    }
    if (!force && attemptedModelAutostartRef.current) {
      return modelServiceEnsureResult
    }
    attemptedModelAutostartRef.current = true
    const result = await ensureModelService(config)
    setModelServiceEnsureResult(result)
    return result
  }

  // Keep trying to auto-start the local model in the background while:
  //   1) model is enabled, and
  //   2) health check still says "not connected".
  // Previous behaviour only attempted once on startup; if Ollama booted
  // slowly or was closed, the app stayed on fallback forever until the user
  // manually re-saved settings. This loop makes startup feel "sync-start".
  useEffect(() => {
    if (!modelConfig?.enabled) return
    if (modelHealth?.ok) return

    let cancelled = false
    const run = async () => {
      if (cancelled || modelAutostartInFlightRef.current) return
      modelAutostartInFlightRef.current = true
      try {
        const result = await maybeEnsureModelService(modelConfig, true)
        await refreshModelHealth(modelConfig, result)
      } catch (error) {
        console.warn('[model] background autostart retry failed', error)
      } finally {
        modelAutostartInFlightRef.current = false
      }
    }

    // Try immediately, then retry every 45s until health flips to ok.
    void run()
    const timer = window.setInterval(() => { void run() }, 45_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    modelConfig?.enabled,
    modelConfig?.endpoint,
    modelConfig?.model,
    modelConfig?.timeoutMs,
    modelHealth?.ok
  ])

  const syncPetWithScene = async (next: PetData, sceneId: Parameters<typeof syncCompanionMemory>[1], now = Date.now()) => {
    const synced = await syncCompanionMemory(next, sceneId, now)
    // B5: relationship-stage upgrades fire a one-shot milestone sticker.
    // We compare the pre-sync stage (from `next`) against the post-sync
    // stage (`synced`) so the comparison is always against the freshest
    // truth. Demotions are impossible (the helper is monotonic), so any
    // difference here is a genuine upgrade worth celebrating.
    const previousStage = next.memory.relationship.stage
    const nextStage = synced.memory.relationship.stage
    if (previousStage !== nextStage) {
      const milestone = fireRelationshipMilestoneSticker(synced, { now })
      if (milestone.sticker) {
        syncPet(milestone.pet)
        setActiveStickerId(milestone.sticker.id)
        return milestone.pet
      }
    }
    syncPet(synced)
    return synced
  }

  const persistAudit = async (entry: ReturnType<typeof createAuditEntry>) => {
    const current = auditEnvelopeRef.current
    if (!current) return
    const next = updateEnvelope(current, {
      entries: [entry, ...current.data.entries].slice(0, 200)
    })
    auditEnvelopeRef.current = next
    setAuditEnvelope(next)
    await saveDomainState('audit', next)
  }

  const saveEnvelope = async <T,>(
    key: 'inventory' | 'economy' | 'home' | 'jobs' | 'achievements' | 'planner' | 'calendar' | 'tools' | 'oracle' | 'audit',
    envelope: DomainStateEnvelope<T>,
    setter: (value: DomainStateEnvelope<T>) => void
  ) => {
    setter(envelope)
    await saveDomainState(key as never, envelope as never)
  }

  const reconcileDomainProgress = async (currentPet: PetData) => {
    if (!inventoryEnvelope || !economyEnvelope || !homeEnvelope || !jobEnvelope || !achievementEnvelope) return

    const rewardReconciliation = reconcileAchievements(currentPet, economyEnvelope, inventoryEnvelope, homeEnvelope, jobEnvelope, achievementEnvelope)
    if (rewardReconciliation.unlocked.length === 0) return

    setAchievementEnvelope(rewardReconciliation.achievements)
    setEconomyEnvelope(rewardReconciliation.economy)
    await Promise.all([
      saveDomainState('achievements', rewardReconciliation.achievements),
      saveDomainState('economy', rewardReconciliation.economy)
    ])

    await Promise.all(rewardReconciliation.unlocked.map((achievement) => persistAudit(createAuditEntry({
      actor: 'system',
      domain: 'achievements',
      action: 'achievement.unlocked',
      summary: localized(`解锁成就：${achievement.title}`, `Unlocked achievement: ${achievement.titleEn}`),
      metadata: {
        achievementId: achievement.id,
        reward: achievement.reward
      }
    }))))
  }

  const ensureToolEnvelope = () => toolEnvelope ?? {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    data: {
      enabledTools: [],
      promptsRequiredFor: [],
      lastUsedAtByTool: {}
    }
  }

  const updateToolRegistry = async (
    updater: (current: DomainStateEnvelope<ToolRegistryState>) => DomainStateEnvelope<ToolRegistryState>
  ) => {
    const current = ensureToolEnvelope()
    const next = updater(current)
    setToolEnvelope(next)
    await saveDomainState('tools', next)
    return next
  }

  const syncToolPromptRequirement = async (toolCall: import('../agent/runtime/agent-types').PetAgentToolCall) => {
    const confirmationKey = getToolConfirmationKey(toolCall)
    const decision = evaluateToolPolicy(toolCall)

    if (!decision.requiresConfirmation) {
      if (!toolEnvelope?.data.promptsRequiredFor.includes(confirmationKey)) return
      await updateToolRegistry((current) => updateEnvelope(current, {
        ...current.data,
        promptsRequiredFor: current.data.promptsRequiredFor.filter((item) => item !== confirmationKey)
      }))
      return
    }

    await updateToolRegistry((current) => current.data.promptsRequiredFor.includes(confirmationKey)
      ? current
      : updateEnvelope(current, {
          ...current.data,
          promptsRequiredFor: [...current.data.promptsRequiredFor, confirmationKey]
        }))
  }

  const runTrackedTool = async (
    toolCall: import('../agent/runtime/agent-types').PetAgentToolCall,
    options: {
      domain: AuditState['entries'][number]['domain']
      action?: string
      summary: string
      actor?: AuditState['entries'][number]['actor']
      metadata?: Record<string, string | number | boolean | null>
      touchToolId?: string
      run: () => Promise<void>
    }
  ) => {
    const decision = evaluateToolPolicy(toolCall)
    await syncToolPromptRequirement(toolCall)
    await options.run()

    if (options.touchToolId) {
      await updateToolRegistry((current) => touchToolUsage(current, options.touchToolId!))
    }

    await persistAudit(createAuditEntry({
      actor: options.actor ?? 'user',
      domain: options.domain,
      action: options.action ?? toolCall.name,
      summary: options.summary,
      requiresConfirmation: decision.requiresConfirmation,
      metadata: {
        ...(decision.reason ? { policyReason: decision.reason } : {}),
        ...(options.metadata ?? {})
      }
    }))
  }

  const clearThinkingBubbleTimer = () => {
    if (thinkingBubbleTimerRef.current) {
      window.clearTimeout(thinkingBubbleTimerRef.current)
      thinkingBubbleTimerRef.current = null
    }
  }

  const showBubble = (nextBubble: string | PetBubbleContent, persistent = false) => {
    if (bubbleHideTimerRef.current) window.clearTimeout(bubbleHideTimerRef.current)
    const resolvedBubble = typeof nextBubble === 'string' ? createBubbleState(nextBubble) : nextBubble
    setBubble(resolvedBubble)
    setBubbleVisible(true)

    const ttlMs = resolvedBubble.ttlMs ?? BUBBLE_HIDE_MS
    if (persistent || resolvedBubble.loading || resolvedBubble.typing) return

    bubbleHideTimerRef.current = window.setTimeout(() => {
      const current = petRef.current
      if (!current?.ui.panelOpen) {
        setBubbleVisible(false)
        setShowState(undefined)
      }
    }, ttlMs)
  }

  const hideFloatingBubble = () => {
    if (bubbleHideTimerRef.current) {
      window.clearTimeout(bubbleHideTimerRef.current)
      bubbleHideTimerRef.current = null
    }
    setBubbleVisible(false)
    setShowState(undefined)
  }

  const collapseFloatingSurfaces = () => {
    if (hoverChatShowTimerRef.current) {
      window.clearTimeout(hoverChatShowTimerRef.current)
      hoverChatShowTimerRef.current = null
    }
    if (hoverChatHideTimerRef.current) {
      window.clearTimeout(hoverChatHideTimerRef.current)
      hoverChatHideTimerRef.current = null
    }
    hoverChatHoveringRef.current = false
    setHoverChatExpanded(false)
    setHoverChatVisible(false)
    hideFloatingBubble()
  }

  const collapseHoverChatOnly = () => {
    if (hoverChatShowTimerRef.current) {
      window.clearTimeout(hoverChatShowTimerRef.current)
      hoverChatShowTimerRef.current = null
    }
    if (hoverChatHideTimerRef.current) {
      window.clearTimeout(hoverChatHideTimerRef.current)
      hoverChatHideTimerRef.current = null
    }
    hoverChatHoveringRef.current = false
    setHoverChatExpanded(false)
    setHoverChatVisible(false)
  }

  const scheduleBubbleHide = (ttlMs: number) => {
    if (bubbleHideTimerRef.current) window.clearTimeout(bubbleHideTimerRef.current)
    bubbleHideTimerRef.current = window.setTimeout(() => {
      const current = petRef.current
      if (!current?.ui.panelOpen) {
        hideFloatingBubble()
      }
    }, ttlMs)
  }

  const syncPanelPosition = (position: PetStageCanvasState) => {
    if (currentWindowLabel !== PANEL_WINDOW_LABEL) return
    petPlatform.persistWindowPosition({ x: Math.round(position.x), y: Math.round(position.y) })
  }

  const updateStagePosition = (position: PetStageCanvasState, options?: { syncPanel?: boolean; persistPet?: boolean }) => {
    const next = currentWindowLabel === PET_WINDOW_LABEL
      ? clampFloatingStagePosition(position, floatingWindowInsets)
      : clampStagePosition(position)
    dragPositionRef.current = next
    setStagePosition(next)
    if (options?.syncPanel) syncPanelPosition(next)
    if (options?.persistPet) {
      void commitPet(updatePet((current) => ({
        ...current,
        ui: {
          ...current.ui,
          position: {
            x: Math.round(next.x),
            y: Math.round(next.y)
          }
        }
      })))
    }
    return next
  }

  // Rust-side strong reminders can teleport the native pet window directly.
  // Without syncing React's stagePosition, the hit-region reporter may push
  // stale coordinates back and visually "undo" that teleport. Mirror the
  // native window move into stage state (and persisted UI position) so both
  // layers agree on the same location.
  useEffect(() => {
    const stop = petPlatform.onPetWindowTeleported((payload) => {
      if (currentWindowLabel !== PET_WINDOW_LABEL) return
      const next = updateStagePosition({
        x: payload.x + floatingWindowInsets.left,
        y: payload.y + floatingWindowInsets.top
      }, { persistPet: true })
      dragPositionRef.current = next
      setWalkTarget(null)

      // Cute entrance: replace the old Dock critical bounce with a pet-side
      // bounce + context-aware bubble so the user notices the teleport
      // without the OS-level "attention" interruption.
      const reason = payload.reason || 'manual'
      let text = '我来啦！'
      let action: PetAction = 'celebrating'
      let intent: PetShowState['intent'] = 'celebrate'
      let bubbleOpts: Partial<Omit<PetBubbleContent, 'text'>> = { tone: 'playful', ttlMs: 4600 }
      let expression: PetShowState['expression'] = { eyes: 'sparkle', mouth: 'smile' }
      let animKey: PetShowState['animKey'] = 'bounce'

      if (reason === 'task-done' || reason === 'commit-created') {
        text = payload.displayText?.trim() || payload.summary?.trim() || payload.title?.trim() || '完成啦！看到了吗～'
        if (!payload.displayText && reason === 'task-done' && payload.source) {
          text = `【${formatCodingEventSource(payload.source)}｜完成了任务】\n${text}`
        }
        bubbleOpts = { tone: 'playful', emphasis: 'high', ttlMs: CODING_DONE_BUBBLE_TTL_MS }
        action = 'celebrating'
      } else if (reason === 'task-failed' || reason === 'build-fail' || reason === 'test-fail') {
        text = payload.displayText?.trim() || payload.summary?.trim() || payload.title?.trim() || '需要你处理一下'
        if (!payload.displayText && payload.source) {
          text = `【${formatCodingEventSource(payload.source)}｜需要你操作】\n${text}`
        }
        action = 'failed'
        intent = 'nudge'
        bubbleOpts = { kind: 'thought', tone: 'alert', emphasis: 'high', ttlMs: CODING_ALERT_BUBBLE_TTL_MS }
        expression = { eyes: 'alert', mouth: 'open' }
        animKey = 'alert'
      } else if (reason === 'reminder') {
        text = '时间到啦～'
        action = 'talking'
        intent = 'companionship'
        bubbleOpts = { tone: 'warm', ttlMs: 4600 }
        expression = { eyes: 'soft', mouth: 'open' }
        animKey = 'nudge'
      }

      const isSleeping = petRef.current?.state.isSleeping ?? false
      setTeleportEffectKey((value) => value + 1)
      playAction(action, isSleeping)
      setShowState({
        intent,
        bubble: createBubbleState(text, bubbleOpts),
        expression,
        animKey
      })
      showBubble(createBubbleState(text, bubbleOpts))
    })
    return () => {
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWindowLabel, floatingWindowInsets.left, floatingWindowInsets.top])

  const handlePetDragStart = (event: PointerEvent) => {
    if (panelToggleTimerRef.current) {
      window.clearTimeout(panelToggleTimerRef.current)
      panelToggleTimerRef.current = null
    }

    isDraggingRef.current = true
    setHoverChatExpanded(false)

    const startPosition = dragPositionRef.current ?? stagePosition
    const pointerStart = { x: event.screenX, y: event.screenY }
    let moved = false

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.screenX - pointerStart.x
      const deltaY = moveEvent.screenY - pointerStart.y
      if (!moved && Math.abs(deltaX) + Math.abs(deltaY) < 6) return
      moved = true
      setWalkTarget(null)
      petPlatform.interruptWalk()
      updateStagePosition({
        x: startPosition.x + deltaX,
        y: startPosition.y + deltaY
      }, { syncPanel: true })
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      isDraggingRef.current = false
      if (!moved) return
      suppressClickRef.current = true
      const currentPosition = dragPositionRef.current ?? startPosition
      const settled = updateStagePosition({
        x: currentPosition.x,
        y: settleToFloor(currentPosition.y, getPetFloorY(floatingWindowInsets))
      }, { syncPanel: true, persistPet: true })
      syncPanelPosition(settled)
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const petStageStyle: CSSProperties | undefined = currentWindowLabel === PET_WINDOW_LABEL
    ? {
        position: 'fixed',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
      }
    : undefined

  const playAction = (nextAction: PetAction, isSleeping: boolean) => {
    if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current)
    setAction(nextAction)

    if (nextAction === 'sleepy' || isSleeping) return

    actionTimerRef.current = window.setTimeout(() => {
      const current = petRef.current
      const resolvedAction = current
        ? resolveRuntimePetAction(current, {
            reminderPhase,
            activeReminderTitle: activeReminder?.title ?? undefined,
            activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
            nearestReminderAt,
            nearestReminderIntensity,
            recentInteraction,
            now: Date.now()
          })
        : 'idle'
      setAction(resolvedAction)
    }, nextAction === 'alert' || nextAction === 'failed' || nextAction === 'waiting' ? 5000 : ACTION_RESET_MS)
  }

  const applyGeneratedPresentation = (
    currentPet: PetData,
    reply: Pick<PetGeneratedReply, 'text' | 'action' | 'show' | 'source'>,
    persistent = false
  ) => {
    const shouldRenderBubble = reply.source !== 'model' || Boolean(reply.show?.bubble?.text?.trim())
    clearThinkingBubbleTimer()
    setChatLoading(false)
    setShowState(reply.show)
    setLastReplySource(reply.source)
    if (shouldRenderBubble) {
      const nextBubble = bubbleFromReply(reply, currentPet.memory.profile.selectedPalette, currentPet.ui.wardrobeSelection ? [currentPet.ui.wardrobeSelection] : [])
      showBubble({ ...nextBubble, typing: false }, persistent)
    } else {
      if (bubbleHideTimerRef.current) window.clearTimeout(bubbleHideTimerRef.current)
      setBubbleVisible(false)
    }
    playAction(reply.action, currentPet.state.isSleeping)
  }

  const applyPreparedSceneResult = (
    currentPet: PetData,
    result: {
      turn: Pick<Awaited<ReturnType<typeof runPreparedPetSceneTurn>>, 'turn'>['turn']
      persistent: boolean
    },
    options?: {
      persistent?: boolean
      reply?: Pick<PetGeneratedReply, 'text' | 'action' | 'show' | 'source'>
    }
  ) => {
    applyGeneratedPresentation(currentPet, options?.reply ?? withReplySource(result.turn.reply, result.turn.source), options?.persistent || result.persistent)
  }

  const visibleConversationReply = (
    reply: Pick<PetGeneratedReply, 'text' | 'action' | 'show' | 'source'>
  ): Pick<PetGeneratedReply, 'text' | 'action' | 'show' | 'source'> => reply.show?.bubble?.text?.trim()
    ? {
        ...reply,
        show: {
          ...reply.show,
          bubble: {
            ...reply.show.bubble,
            ttlMs: Math.max(reply.show.bubble.ttlMs ?? 0, CONVERSATION_BUBBLE_HIDE_MS)
          }
        }
      }
    : {
        ...reply,
        show: {
          ...reply.show,
          intent: reply.show?.intent ?? 'companionship',
          expression: reply.show?.expression ?? { eyes: 'soft', mouth: 'open' },
          bubble: createBubbleState(reply.text, { tone: 'warm', ttlMs: CONVERSATION_BUBBLE_HIDE_MS })
        }
      }

  const applyConversationPresentation = async (
    nextPet: PetData,
    reply: Pick<PetGeneratedReply, 'text' | 'action' | 'show' | 'source'>,
    sceneHint?: EventMemory['sceneId']
  ) => {
    const presentationNow = Date.now()
    const presentationScene = resolveRuntimeSceneWithHint(nextPet, sceneHint, {
      reminderPhase,
      activeReminderTitle: activeReminder?.title ?? undefined,
      activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
      nearestReminderAt,
      nearestReminderIntensity,
      recentInteraction,
      now: presentationNow
    })
    const synced = await syncPetWithScene(nextPet, presentationScene.id, presentationNow)
    applyPreparedSceneResult(synced, { turn: { reply, toolCalls: [], source: reply.source }, persistent: Boolean(presentationScene.persistent) }, { persistent: Boolean(presentationScene.persistent), reply })
    return {
      synced,
      persistent: Boolean(presentationScene.persistent)
    }
  }

  const applyScenePresentation = async (
    currentPet: PetData,
    nextReminderPhase = reminderPhase,
    overrides?: {
      persistent?: boolean
      activeReminderTitle?: string
      activeReminderIntensity?: PetReminderIntensity
      recentInteraction?: PetRecentInteraction | null
      nearestReminderAt?: string | null
      nearestReminderIntensity?: PetReminderIntensity
      interactionType?: InteractionType
      userInput?: string
      triggerKind?: 'interaction' | 'scene-refresh' | 'reminder-due'
    }
  ) => {
    const { scene, ...result } = await runPreparedPetSceneTurn({
      pet: currentPet,
      reminderPhase: nextReminderPhase,
      recentInteraction: overrides?.recentInteraction ?? recentInteraction,
      activeReminderTitle: overrides?.activeReminderTitle ?? activeReminder?.title ?? undefined,
      activeReminderIntensity: normalizeReminderIntensity(overrides?.activeReminderIntensity ?? activeReminder?.intensity),
      nearestReminderAt: overrides?.nearestReminderAt ?? nearestReminderAt,
      nearestReminderIntensity: normalizeReminderIntensity(overrides?.nearestReminderIntensity ?? nearestReminderIntensity)
    }, overrides?.triggerKind === 'reminder-due' ? 'reminder-due' : 'scene-refresh', overrides?.triggerKind === 'interaction'
      ? {
          interactionType: overrides.interactionType,
          userInput: overrides.userInput
        }
      : undefined)

    applyPreparedSceneResult(currentPet, result, { persistent: overrides?.persistent })
    return { scene, reply: result.turn.reply }
  }

  const scheduleIdle = (sourcePet?: PetData) => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    if (currentWindowLabel !== PET_WINDOW_LABEL) return
    const current = sourcePet ?? petRef.current
    if (!current) return

    idleTimerRef.current = window.setTimeout(() => {
      void (async () => {
        const latest = petRef.current
        if (!latest || activeReminder) return
        const { scene, ...result } = await runPreparedPetSceneTurn({
          pet: latest,
          reminderPhase,
          recentInteraction,
          activeReminderTitle: undefined,
          activeReminderIntensity: undefined,
          nearestReminderAt,
          nearestReminderIntensity
        }, 'idle-tick')
        const next = await syncPetWithScene(addEventMemory(latest, createEvent('idle', result.turn.reply.text, result.turn.reply.action, latest.state.loneliness, scene.id)), scene.id)
        applyPreparedSceneResult(next, result)
        scheduleIdle(next)
      })()
    }, getIdleInterval(current))
  }

  const updatePanelState = (open: boolean) => {
    const current = petRef.current
    if (!current) return
    const next = {
      ...current,
      ui: {
        ...current.ui,
        panelOpen: open
      }
    }
    syncPet(next)
    setDockLeanDirection(open ? undefined : dockLeanDirection)
    setDockLeanAmount(open ? 'still' : dockLeanAmount)
    if (open) {
      setShowState(undefined)
    }
    petPlatform.togglePanel(open)
  }

  const runInteraction = async (type: InteractionType, userInput?: string) => {
    const current = petRef.current
    if (!current) return

    const executableCare = new Set<InteractionType>(['feed', 'pet', 'sleep', 'wake', 'drink', 'bath', 'hold'])
    if (executableCare.has(type)) {
      const refusalKey = getCareInteractionRefusalKey(current, type as ExecutableInteractionType)
      if (refusalKey) {
        showBubble(t(resolveLanguage(current.ui.language), refusalKey as TranslationKey), true)
        playAction('alert', current.state.isSleeping)
        return
      }
    }

    const prepared = preparePetInteractionState({
      current,
      type,
      userInput,
      reminderPhase,
      recentInteraction,
      activeReminderTitle: activeReminder?.title ?? undefined,
      activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
      nearestReminderAt,
      nearestReminderIntensity
    })
    setRecentInteraction(prepared.recentInteraction)

    let next = prepared.pet
    if (type !== 'chat') {
      const reply = getMockReply(next, type, userInput)
      next = addEventMemory(next, createEvent(type, reply.text, reply.action, next.state.loneliness, prepared.scene.id))
      const synced = await syncPetWithScene(next, prepared.scene.id, prepared.at)
      applyGeneratedPresentation(synced, withReplySource({ text: reply.text, action: reply.action }, 'fallback'))
      scheduleIdle(synced)
      return
    }

    const { turn, persistent } = await runPreparedPetSceneTurn({
      pet: next,
      reminderPhase,
      recentInteraction: prepared.recentInteraction,
      activeReminderTitle: activeReminder?.title ?? undefined,
      activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
      nearestReminderAt,
      nearestReminderIntensity,
      sceneHint: prepared.scene.id
    }, 'scene-refresh', {
      interactionType: type,
      userInput
    })

    next = addEventMemory(next, createEvent(type, turn.reply.text, turn.reply.action, next.state.loneliness, prepared.scene.id))

    const synced = await syncPetWithScene(next, prepared.scene.id, prepared.at)
    applyPreparedSceneResult(synced, { turn, persistent })
    scheduleIdle(synced)

    if (type === 'chat') setDraft('')
  }

  const performCareTrayAction = (payload: Pick<CareTrayDragPayload, 'interaction' | 'inventoryItemId'>) => {
    void (async () => {
      const livePet = petRef.current
      if (!livePet) return

      const refusalKey = getCareInteractionRefusalKey(livePet, payload.interaction)
      if (refusalKey) {
        showBubble(t(resolveLanguage(livePet.ui.language), refusalKey as TranslationKey), true)
        playAction('alert', livePet.state.isSleeping)
        return
      }

      if (payload.inventoryItemId && inventoryEnvelope) {
        const qty = getInventoryQuantity(inventoryEnvelope.data, payload.inventoryItemId)
        if (qty > 0) {
          const nextInv = consumeInventoryItem(inventoryEnvelope, payload.inventoryItemId, 1)
          await saveEnvelope('inventory', nextInv, setInventoryEnvelope)
        }
      }

      await runInteraction(payload.interaction)
    })()
  }

  const handleCareTrayDragStart = (payload: CareTrayDragPayload) => {
    careTrayDraggingRef.current = true
    careTrayPayloadRef.current = {
      interaction: payload.interaction,
      inventoryItemId: payload.inventoryItemId
    }
    setCareTrayDrag({
      emoji: payload.ghostEmoji,
      clientX: payload.clientX,
      clientY: payload.clientY
    })
    const anchor = petAnchorRef.current
    const petBody = anchor?.querySelector<HTMLElement>('[data-testid="pet-body"]')
    const rect = petBody?.getBoundingClientRect()
    if (rect) {
      const mid = rect.left + rect.width / 2
      setDockLeanDirection(payload.clientX < mid ? 'left' : 'right')
      setDockLeanAmount('active')
    }
  }

  const handleCareTrayDragMove = (clientX: number, clientY: number) => {
    setCareTrayDrag((prev) => (prev ? { ...prev, clientX, clientY } : null))
    const anchor = petAnchorRef.current
    const petBody = anchor?.querySelector<HTMLElement>('[data-testid="pet-body"]')
    const rect = petBody?.getBoundingClientRect()
    if (rect) {
      const mid = rect.left + rect.width / 2
      setDockLeanDirection(clientX < mid ? 'left' : 'right')
      setDockLeanAmount('active')
    }
  }

  const handleCareTrayDragEnd = (clientX: number, clientY: number) => {
    const payload = careTrayPayloadRef.current
    careTrayPayloadRef.current = null
    careTrayDraggingRef.current = false
    setCareTrayDrag(null)

    const latestPet = petRef.current
    if (latestPet && !latestPet.ui.panelOpen) {
      setDockLeanDirection(inferLeanDirection(latestPet.ui.position))
      setDockLeanAmount('still')
    }

    if (!payload || clientX < 0 || clientY < 0) return

    const anchor = petAnchorRef.current
    const petBody = anchor?.querySelector<HTMLElement>('[data-testid="pet-body"]')
    const rect = petBody?.getBoundingClientRect()
    if (!pointHitsAxisAlignedRect(rect, clientX, clientY)) return

    performCareTrayAction(payload)
  }

  const refreshReminders = () => {
    void loadReminders().then((nextReminders) => {
      setReminders(nextReminders)
      setReminderPhase(getReminderPhase(nextReminders, activeReminder, Date.now()))
    })
  }

  const triggerReminder = async (reminder: ReminderItem) => {
    const current = petRef.current
    const intensity = normalizeReminderIntensity(reminder.intensity)
    if (current && intensity !== 'low' && !current.ui.panelOpen) updatePanelState(true)
    setActiveReminder(reminder)
    setReminderPhase('alert')
    if (current) {
      const alerted = await syncPetWithScene(current, 'reminder-alert')
      void applyScenePresentation(alerted, 'alert', {
        persistent: intensity !== 'low',
        activeReminderTitle: reminder.title,
        activeReminderIntensity: intensity,
        triggerKind: 'reminder-due'
      })
      // Phase A sticker: pop a reminder-bucket sticker alongside the alert
      // scene. Done after applyScenePresentation kicks off (it's async via
      // void) so the sprite + bubble are already animating in.
      const stickerOutcome = fireReminderSticker(petRef.current ?? alerted)
      if (stickerOutcome.pet !== (petRef.current ?? alerted)) syncPet(stickerOutcome.pet)
      if (stickerOutcome.sticker) setActiveStickerId(stickerOutcome.sticker.id)
      if (currentWindowLabel === PET_WINDOW_LABEL && intensity === 'high') {
        petPlatform.bringPetToActiveMonitor()
        petPlatform.notifyUserStrong({
          title: reminder.title.trim() || localized('提醒时间到', 'Reminder due'),
          body: localized(`强提醒：${reminder.title}`, `Strong reminder: ${reminder.title}`)
        })
      }
    }
    refreshReminders()
  }

  const createReminderFromInput = async (input: CreateReminderInput, options?: { silent?: boolean }) => {
    const created = await createReminder(input)
    const nextReminderList = [...reminders, created].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    setReminders(nextReminderList)
    setReminderPhase(getReminderPhase(nextReminderList, activeReminder, Date.now()))
    setReminderTitle('')
    setReminderTime(createDefaultReminderTime())
    setReminderIntensity('medium')
    const current = petRef.current
    const reminderLanguage = current?.ui.language ?? language
    const preferredName = current?.memory.profile.preferredName
    const fallbackText = reminderLanguage === 'en-US'
      ? `Okay${preferredName ? `, ${preferredName}` : ''}, I will remind you at ${formatReminderTime(created.scheduledAt, reminderLanguage)}: ${created.title}`
      : `好呀${preferredName ? `，${preferredName}` : ''}，我会在 ${formatReminderTime(created.scheduledAt, reminderLanguage)} 提醒你：${created.title}`
    if (options?.silent) return created
    if (current) {
      await applyScenePresentation(current, 'soon', {
        interactionType: 'chat',
        userInput: input.title,
        recentInteraction,
        activeReminderTitle: created.title,
        activeReminderIntensity: normalizeReminderIntensity(created.intensity),
        nearestReminderAt: created.scheduledAt,
        nearestReminderIntensity: normalizeReminderIntensity(created.intensity),
        triggerKind: 'scene-refresh'
      })
      return created
    }
    showBubble(fallbackText)
    playAction('happy', false)
    return created
  }

  const executeLoopInteraction = async (current: PetData, type: Extract<InteractionType, 'feed' | 'pet' | 'sleep' | 'wake' | 'drink' | 'bath' | 'hold'>, userInput: string, sceneHint?: EventMemory['sceneId']) => {
    const prepared = preparePetInteractionState({
      current,
      type,
      userInput,
      sceneHint,
      reminderPhase,
      recentInteraction,
      activeReminderTitle: activeReminder?.title ?? undefined,
      activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
      nearestReminderAt,
      nearestReminderIntensity
    })
    setRecentInteraction(prepared.recentInteraction)

    const next = addEventMemory(prepared.pet, createEvent(type, userInput, prepared.scene.action, prepared.pet.state.loneliness, prepared.scene.id))
    return syncPetWithScene(next, prepared.scene.id, prepared.at)
  }

  const applyStreamingConversationBubble = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    clearThinkingBubbleTimer()
    setChatLoading(false)
    setLastReplySource('model')
    setShowState({
      intent: 'companionship',
      bubble: createBubbleState(trimmed, { tone: 'warm', ttlMs: CONVERSATION_BUBBLE_HIDE_MS, typing: true }),
      expression: { eyes: 'soft', mouth: 'open' },
      animKey: 'nudge'
    })
    showBubble(createBubbleState(trimmed, { tone: 'warm', ttlMs: CONVERSATION_BUBBLE_HIDE_MS, typing: true }), true)
    playAction('talking', petRef.current?.state.isSleeping ?? false)
  }

  const presentChatCareRefusal = async (interaction: ExecutableInteractionType, refusalKey: TranslationKey) => {
    const livePet = petRef.current
    if (!livePet) return
    clearThinkingBubbleTimer()
    const refusalText = t(resolveLanguage(livePet.ui.language), refusalKey)
    const sceneId = livePet.memory.working.currentScene
    const withMemory = addEventMemory(
      livePet,
      buildCareRefusalEventMemory(interaction, refusalKey, refusalText, livePet.state.loneliness, sceneId)
    )
    const synced = await syncPetWithScene(withMemory, sceneId)
    applyGeneratedPresentation(
      synced,
      visibleConversationReply(withReplySource({ text: refusalText, action: 'alert' }, 'fallback'))
    )
    void recordDiaryTurn('pet', refusalText, 'chat')
    setDraft('')
  }

  const runConversationLoop = async (message: string) => {
    const current = petRef.current
    if (!current) return

    const result = await runPreparedPetConversationTurn({
      current,
      message,
      reminderPhase,
      recentInteraction,
      activeReminderTitle: activeReminder?.title ?? undefined,
      activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
      nearestReminderAt,
      nearestReminderIntensity,
      streamCallbacks: {
        onBubbleText: applyStreamingConversationBubble
      }
    }, {
      applyMemoryUpdate: (current, input) => applyStructuredMemoryUpdate(current, input),
      applySettingsUpdate: (current, input) => applyPetSettingsUpdate(current, input),
      applyFactRecord: (current, input) => {
        // The ledger applier is pure; we hand back both the new pet snapshot
        // and the actual record (or undefined when rejected) so the runtime
        // can dedupe between LLM-provided and regex-provided facts.
        const outcome = addFactRecord(current, input)
        return { pet: outcome.pet, record: outcome.record }
      },
      createReminder: async (input) => {
        await createReminderFromInput(input, { silent: true })
      },
      runInteraction: async (current, interaction, userMessage, sceneHint) => executeLoopInteraction(current, interaction, userMessage, sceneHint)
    })

    if (result.kind === 'care-refusal') {
      await presentChatCareRefusal(result.interaction, result.refusalKey as TranslationKey)
      return
    }

    if (result.kind === 'interaction') {
      const live = petRef.current ?? current
      const blockedKey = getCareInteractionRefusalKey(live, result.interaction)
      if (blockedKey) {
        await presentChatCareRefusal(result.interaction, blockedKey as TranslationKey)
        return
      }
      const synced = await executeLoopInteraction(live, result.interaction, message)
      applyGeneratedPresentation(synced, visibleConversationReply(withReplySource(result.turn.reply, result.turn.source)))
      void recordDiaryTurn('pet', result.turn.reply.text, 'chat')
      setDraft('')
      return
    }

    if (result.kind === 'reminder') {
      const created = await createReminderFromInput(result.reminder, { silent: true })
      const latest = petRef.current
      if (latest) {
        const next = await syncPetWithScene(latest, 'reminder-soon')
        applyGeneratedPresentation(next, visibleConversationReply(withReplySource(result.turn.reply, result.turn.source)))
      } else {
        setChatLoading(false)
        setLastReplySource(result.turn.source)
      }
      void recordDiaryTurn('pet', result.turn.reply.text, 'chat')
      setDraft('')
      return
    }

    const reply = withReplySource(result.reply, result.turn.source)
    const visibleReply = visibleConversationReply(reply)
    const { synced } = await applyConversationPresentation(result.next, visibleReply, result.sceneHint)
    void recordDiaryTurn('pet', visibleReply.text, 'chat')
    setDraft('')
    if (result.shouldScheduleIdle) {
      scheduleIdle(synced)
    }
  }

  const applyConversationCommand = async (message: string) => {
    await runConversationLoop(message)
  }

  const handleWalkTick = (tick: WalkTick) => {
    const current = petRef.current
    if (!current || currentWindowLabel !== PET_WINDOW_LABEL || isDraggingRef.current) return

    if (current.ui.panelOpen) return
    if (activeReminder) return
    if (current.ui.system.vacationMode) return
    if (codingPresentationHoldUntilRef.current > Date.now()) return

    const nextTarget = clampFloatingStagePosition({
      x: tick.x,
      y: tick.y
    }, floatingWindowInsets)

    setWalkTarget(nextTarget)
    setDockLeanDirection(tick.facing)
    setDockLeanAmount(getWalkLeanAmount(current))
    if (current.ui.system.bossModeEnabled) setBubbleVisible(false)
    playAction(getWalkAction(tick, current), current.state.isSleeping)
  }

  const handleSystemModeToggle = async (field: keyof PetData['ui']['system']) => {
    const next = updatePet((current) => {
      const enabled = !current.ui.system[field]
      const nextSystem = {
        ...current.ui.system,
        [field]: enabled
      }

      // Strong-reminder is the explicit inverse of the three quiet modes,
      // so flipping any quiet mode ON must also turn off the
      // strong-reminder flag — otherwise the panel would show two
      // contradictory chips lit at the same time. Flipping a quiet mode
      // OFF does not auto-enable strong reminder; the user has to ask
      // for that explicitly via the strong-reminder chip.
      const enforceMutexOnQuiet = (system: typeof nextSystem) => ({
        ...system,
        strongReminderEnabled: false
      })

      return {
        ...current,
        ui: {
          ...current.ui,
          system: field === 'strongReminderEnabled' && enabled
            ? {
                ...nextSystem,
                vacationMode: false,
                bossModeEnabled: false,
                nestModeEnabled: false
              }
            : field === 'vacationMode' && enabled
              ? enforceMutexOnQuiet({
                  ...nextSystem,
                  bossModeEnabled: false,
                  nestModeEnabled: false
                })
              : field === 'bossModeEnabled' && enabled
                ? enforceMutexOnQuiet({
                    ...nextSystem,
                    vacationMode: false
                  })
                : field === 'nestModeEnabled' && enabled
                  ? enforceMutexOnQuiet({
                      ...nextSystem,
                      vacationMode: false
                    })
                  : nextSystem
        }
      }
    })

    if (!next) return

    if (field === 'developerModeEnabled' && !next.ui.system.developerModeEnabled) {
      setShowAlignmentEditor(false)
      setShowMeshDebug(false)
    }

    if (next.ui.system.vacationMode) {
      setWalkTarget(null)
      setDockLeanAmount('still')
      setDockLeanDirection(undefined)
      setBubbleVisible(false)
      playAction('idle', next.state.isSleeping)
    } else if (next.ui.system.bossModeEnabled) {
      setWalkTarget(null)
      setDockLeanAmount('still')
      setBubbleVisible(false)
      playAction('idle', next.state.isSleeping)
    } else if (next.ui.system.nestModeEnabled) {
      setWalkTarget(readStoredStagePosition(next))
      setDockLeanAmount('soft')
      setBubbleVisible(false)
      playAction('sleepy', next.state.isSleeping)
    } else {
      setDockLeanAmount('still')
      setBubbleVisible(false)
      playAction(resolveRuntimePetAction(next, {
        reminderPhase,
        activeReminderTitle: activeReminder?.title ?? undefined,
        activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
        nearestReminderAt,
        nearestReminderIntensity,
        recentInteraction,
        now: Date.now()
      }), next.state.isSleeping)
    }

    await commitPet(next)
    void applyScenePresentation(next)
  }

  const presentCodingEvent = (current: PetData, event: PetCodingEvent, options?: { skipMemory?: boolean }) => {
    if (shouldMuteCodingEvent(current, event)) return { nextPet: current, presentation: null }
    const presentation = toCodingEventPresentation(event)
    let reply = presentation.reply
    if (isQueueableCodingReminder(event)) {
      const nowMs = Date.now()
      codingReminderQueueRef.current = updateCodingReminderQueue({
        current: codingReminderQueueRef.current,
        next: {
          id: event.id,
          text: presentation.reply.show?.bubble?.text ?? presentation.reply.text,
          createdAtMs: nowMs
        },
        nowMs
      })
      const queuedText = formatCodingReminderQueueText(codingReminderQueueRef.current)
      if (queuedText && presentation.reply.show?.bubble) {
        reply = {
          ...presentation.reply,
          text: queuedText,
          show: {
            ...presentation.reply.show,
            bubble: {
              ...presentation.reply.show.bubble,
              text: queuedText
            }
          }
        }
      }
    }
    const currentScene = current.memory.working.currentScene
    const nextPet = presentation.shouldRecordMemory && !options?.skipMemory
      ? addEventMemory(current, createCodingEventMemory(event, presentation.reply.action, current.state.loneliness, currentScene))
      : current
    applyGeneratedPresentation(nextPet, withReplySource(reply), true)
    return { nextPet, presentation }
  }

  const presentReadyCodingEvent = async (current: PetData, event: PetCodingEvent) => {
    const { nextPet, presentation } = presentCodingEvent(current, event)
    if (!presentation) return false
    lastPresentedCodingMemoryIdRef.current = event.id
    codingPresentationHoldUntilRef.current = Date.now() + CODING_PRESENTATION_HOLD_MS
    setWalkTarget(null)
    petPlatform.interruptWalk()

    syncPet(nextPet)
    await commitPet(nextPet)
    await persistAudit(createAuditEntry({
      actor: 'system',
      domain: 'tools',
      action: `coding.${event.kind}`,
      summary: `${getCodingEventStatusText(event)}：${getCodingEventPrimaryText(event)}`,
      metadata: {
        source: event.source,
        status: event.status,
        statusText: getCodingEventStatusText(event),
        eventId: event.id,
        ...(event.metadata ?? {})
      }
    }))

    if (currentWindowLabel === PET_WINDOW_LABEL && shouldFireStrongReminder(nextPet, event)) {
      petPlatform.notifyUserStrong({
        title: formatCodingEventNotificationTitle(event),
        body: formatCodingEventText(event)
      })
    }
    return true
  }

  const queueCodingEvent = (event: PetCodingEvent) => {
    if (pendingCodingEventsRef.current.some((item) => item.id === event.id)) return
    pendingCodingEventsRef.current = [...pendingCodingEventsRef.current, event]
  }

  const flushPendingCodingEvents = () => {
    if (!codingEventReadyRef.current || pendingCodingEventsRef.current.length === 0) return
    const pendingEvents = pendingCodingEventsRef.current
    pendingCodingEventsRef.current = []
    void pendingEvents.reduce<Promise<void>>(async (previous, event) => {
      await previous
      const current = petRef.current
      if (!current) {
        queueCodingEvent(event)
        return
      }
      await presentReadyCodingEvent(current, event)
    }, Promise.resolve())
  }

  const handleCodingEvent = async (event: PetCodingEvent) => {
    const current = petRef.current
    if (!current || !codingEventReadyRef.current) {
      queueCodingEvent(event)
      return
    }

    await presentReadyCodingEvent(current, event)
  }

  useEffect(() => {
    const stop = petPlatform.onCodingEvent((event) => {
      void handleCodingEvent(event)
    })

    return () => {
      stop()
    }
  }, [auditEnvelope, nearestReminderAt, recentInteraction, reminderPhase, currentWindowLabel])

  useEffect(() => {
    if (currentWindowLabel !== PET_WINDOW_LABEL || !pet || !latestCodingMemory) return
    if (lastPresentedCodingMemoryIdRef.current === latestCodingMemory.id) return
    lastPresentedCodingMemoryIdRef.current = latestCodingMemory.id
    presentCodingEvent(pet, codingEventFromMemory(latestCodingMemory), { skipMemory: true })
  }, [currentWindowLabel, latestCodingMemory, pet])

  useEffect(() => {
    let active = true

    void Promise.all([
      loadPet(),
      loadReminders(),
      loadModelConfig(),
      loadDomainState('inventory'),
      loadDomainState('economy'),
      loadDomainState('home'),
      loadDomainState('jobs'),
      loadDomainState('achievements'),
      loadDomainState('planner'),
      loadDomainState('calendar'),
      loadDomainState('tools'),
      loadDomainState('oracle'),
      loadDomainState('audit')
    ]).then(async ([
      savedPet,
      savedReminders,
      savedModelConfig,
      savedInventory,
      savedEconomy,
      savedHome,
      savedJobs,
      savedAchievements,
      savedPlanner,
      savedCalendar,
      savedTools,
      savedOracle,
      savedAudit
    ]) => {
      if (!active) return
      setModelConfig(savedModelConfig)
      setModelDraft(savedModelConfig)
      let ensureResult: PetModelServiceEnsureResult | null = null
      let health = await checkModelHealth()
      if (savedModelConfig.enabled && !health.ok) {
        ensureResult = await maybeEnsureModelService(savedModelConfig)
        health = await refreshModelHealth(savedModelConfig, ensureResult)
      } else {
        setModelServiceEnsureResult(null)
        health = await refreshModelHealth(savedModelConfig, null)
      }
      if (!active) return
      setInventoryEnvelope(savedInventory)
      setEconomyEnvelope(savedEconomy)
      setHomeEnvelope(savedHome)
      setJobEnvelope(savedJobs)
      setAchievementEnvelope(savedAchievements)
      setPlannerEnvelope(savedPlanner)
      setCalendarEnvelope(savedCalendar)
      setToolEnvelope(savedTools)
      setOracleEnvelope(savedOracle)
      setAuditEnvelope(savedAudit)
      const next = savedPet
      setReminders(savedReminders)
      const nextReminderPhase = getReminderPhase(savedReminders, null, Date.now())
      setReminderPhase(nextReminderPhase)
      const { scene, turn } = await runPreparedPetSceneTurn({
        pet: next,
        reminderPhase: nextReminderPhase,
        nearestReminderAt: getNearestReminderAt(savedReminders),
        recentInteraction: null
      }, 'scene-refresh')
      const synced = await syncPetWithScene(next, scene.id)
      const storedPosition = readStoredStagePosition(synced)
      setStagePosition(storedPosition)
      applyPreparedSceneResult(synced, { turn, persistent: synced.ui.panelOpen })
      petPlatform.togglePanel(synced.ui.panelOpen)
      scheduleIdle(synced)
      await commitPet(synced)
      if (!active) return
      codingEventReadyRef.current = true
      if (import.meta.env.VITE_AI_PET_E2E) {
        ;(window as typeof window & { __AI_PET_CODING_EVENT_READY__?: boolean }).__AI_PET_CODING_EVENT_READY__ = true
      }
      flushPendingCodingEvents()
      if (savedJobs.data.activeJob && new Date(savedJobs.data.activeJob.endsAt).getTime() <= Date.now()) {
        const maturedJobs = updateEnvelope(savedJobs, {
          ...savedJobs.data,
          activeJob: savedJobs.data.activeJob,
          unlockedJobs: savedJobs.data.unlockedJobs.includes(savedJobs.data.activeJob.id)
            ? savedJobs.data.unlockedJobs
            : [...savedJobs.data.unlockedJobs, savedJobs.data.activeJob.id]
        })
        setJobEnvelope(maturedJobs)
      }
      await reconcileDomainProgress(synced)
    })

    return () => {
      active = false
      codingEventReadyRef.current = false
      if (import.meta.env.VITE_AI_PET_E2E) {
        ;(window as typeof window & { __AI_PET_CODING_EVENT_READY__?: boolean }).__AI_PET_CODING_EVENT_READY__ = false
      }
      if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      if (panelToggleTimerRef.current) window.clearTimeout(panelToggleTimerRef.current)
      if (bubbleHideTimerRef.current) window.clearTimeout(bubbleHideTimerRef.current)
      if (cutoutPlacementSaveTimerRef.current) window.clearTimeout(cutoutPlacementSaveTimerRef.current)
      if (hoverChatShowTimerRef.current) window.clearTimeout(hoverChatShowTimerRef.current)
      if (hoverChatHideTimerRef.current) window.clearTimeout(hoverChatHideTimerRef.current)
    }
  }, [])

  const refreshImportedPetPackages = async () => {
    setImportedPetLoadStatus((current) => ({ ...current, state: 'loading' }))
    try {
      const packages = await petPlatform.listUserPetPackages()
      replaceImportedPetPackages(packages)
      const options = getImportedPetSpeciesOptions()
      setImportedSpeciesOptions(options)
      setImportedPetLoadStatus({
        state: 'ready',
        count: options.length,
        message: options.length > 0
          ? localized(`已导入 ${options.length} 个本地宠物`, `${options.length} local pet${options.length === 1 ? '' : 's'} imported`)
          : localized('还没有本地宠物包', 'No local pet packages yet')
      })
    } catch (error) {
      console.warn('[petdex] failed to load pet packages', error)
      setImportedPetLoadStatus({
        state: 'error',
        count: 0,
        message: localized('本地宠物扫描失败', 'Local pet scan failed')
      })
    }
  }

  const handleCreateUserPetFromImage = async (file: File): Promise<ImportedPetPackage | null> => {
    if (!USER_PET_IMAGE_TYPES.has(file.type)) {
      setUserPetImageImportStatus({ state: 'error', message: localized('请选择 PNG、JPG 或 WEBP 图片', 'Choose a PNG, JPG, or WEBP image') })
      return null
    }
    if (file.size > USER_PET_IMAGE_MAX_BYTES) {
      setUserPetImageImportStatus({ state: 'error', message: localized('图片不能超过 4 MB', 'Image must be 4 MB or smaller') })
      return null
    }

    setUserPetImageImportStatus({ state: 'creating', message: localized('正在创建动态宠物…', 'Creating animated pet…') })
    try {
      const input: CreateUserPetFromImageInput = {
        name: fileStem(file.name),
        fileName: file.name,
        imageBase64: await fileToBase64Payload(file)
      }
      const created = await petPlatform.createUserPetFromImage(input)
      await refreshImportedPetPackages()
      setUserPetImageImportStatus({ state: 'ready', message: localized('已创建本地动态宠物，可在下方选择。', 'Local animated pet created. Select it below.') })
      if (!petRef.current?.ui.onboardingCompleted) {
        await handleSpeciesChange(created.speciesId as PetData['personality']['species'])
      }
      return created
    } catch (error) {
      console.warn('[petdex] create image pet failed', error)
      setUserPetImageImportStatus({ state: 'error', message: localized('用图片创建宠物失败', 'Could not create pet from image') })
      return null
    }
  }

  useEffect(() => {
    void refreshImportedPetPackages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A6: load user-supplied wardrobe overrides once on mount. We don't
  // poll because the dir only changes when the user explicitly drops
  // files in via the panel button; we'd rather they hit "重新扫描" than
  // pay the disk-scan cost on every state tick.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const entries = await petPlatform.listUserWardrobeAssets()
        if (cancelled) return
        setUserWardrobeAssets(new Map(entries))
      } catch (error) {
        console.warn('[wardrobe] failed to load user assets', error)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  // B2: model health probing with exponential backoff. When the user's
  // local model is offline (laptop just woke, ollama crashed, etc.) the
  // old 15-second fixed interval would spam the network and devtools log.
  // We now back off 15s → 30s → 60s → 120s → 240s on consecutive failures
  // and snap back to 15s the moment a probe returns ok=true.
  useEffect(() => {
    const HEALTHY_INTERVAL = 15_000
    const MAX_BACKOFF = 240_000
    let timer: number | null = null
    let consecutiveFailures = 0
    let cancelled = false

    const schedule = (delay: number) => {
      timer = window.setTimeout(async () => {
        if (cancelled) return
        const health = await refreshModelHealth()
        if (cancelled) return
        if (health.ok) {
          consecutiveFailures = 0
          schedule(HEALTHY_INTERVAL)
        } else {
          consecutiveFailures += 1
          const next = Math.min(MAX_BACKOFF, HEALTHY_INTERVAL * 2 ** Math.max(0, consecutiveFailures - 1))
          schedule(next)
        }
      }, delay)
    }

    schedule(HEALTHY_INTERVAL)

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  usePetWindowEffects({
    currentWindowLabel,
    petWindowLabel: PET_WINDOW_LABEL,
    pet,
    walkTarget,
    stagePosition,
    setStagePosition,
    clampStagePosition,
    clampFloatingStagePosition,
    floatingWindowInsets,
    floatingWindowMeasured,
    setFloatingWindowInsets,
    setFloatingWindowMeasured,
    floatingWindowBounds,
    hoverChatExpanded,
    hoverChatVisible,
    shouldShowFloatingBubble,
    shouldShowFocusPill,
    bubbleText: bubble.text,
    draft,
    action,
    petStageRef,
    petAnchorRef,
    dragPositionRef,
    isDraggingRef,
    floatingMeasureSettleMs: FLOATING_MEASURE_SETTLE_MS,
    hoverCapturePadding: FLOATING_PET_HOVER_CAPTURE_PADDING,
    careTrayDragging: Boolean(careTrayDrag)
  })

  useEffect(() => {
    if (!activeReminder) return
    const reminderState = reminders.find((item) => item.id === activeReminder.id)
    if (reminderState?.status !== 'missed') return

    const current = petRef.current
    setActiveReminder(null)
    const nextPhase = getReminderPhase(reminders, null, Date.now())
    setReminderPhase(nextPhase)

    if (!current) return

    void (async () => {
      const ignored = await syncPetWithScene(recordReminderOutcome(current, 'ignore'), 'reminder-soon')
      await applyScenePresentation(ignored, nextPhase, {
        interactionType: 'idle',
        recentInteraction,
        activeReminderTitle: activeReminder.title,
        activeReminderIntensity: normalizeReminderIntensity(activeReminder.intensity),
        nearestReminderAt,
        nearestReminderIntensity,
        triggerKind: 'scene-refresh'
      })
    })()
  }, [activeReminder, nearestReminderAt, recentInteraction, reminders])

  useWindowPlatformSubscriptions({
    currentWindowLabel,
    petRef,
    runInteraction,
    updatePanelState,
    triggerReminder,
    syncPet: syncExternalPet,
    handleWalkTick,
    setReminders,
    setDockLeanDirection,
    setDockLeanAmount,
    setBubbleVisible,
    collapseFloatingSurfaces,
    collapseHoverChatOnly,
    inferLeanDirection
  })

  const handleTogglePanel = () => {
    if (suppressClickRef.current) return
    const current = petRef.current
    if (!current) return

    if (panelToggleTimerRef.current) window.clearTimeout(panelToggleTimerRef.current)
    panelToggleTimerRef.current = window.setTimeout(() => {
      const latest = petRef.current
      if (!latest || suppressClickRef.current) return
      updatePanelState(!latest.ui.panelOpen)
    }, SINGLE_CLICK_DELAY_MS)
  }

  const handlePetDoubleClick = () => {
    if (panelToggleTimerRef.current) {
      window.clearTimeout(panelToggleTimerRef.current)
      panelToggleTimerRef.current = null
    }
    const current = petRef.current
    if (!current) return
    void runInteraction(current.state.isSleeping ? 'wake' : 'pet')
  }

  const handleHoverChatExpand = () => {
    if (hoverChatHideTimerRef.current) {
      window.clearTimeout(hoverChatHideTimerRef.current)
      hoverChatHideTimerRef.current = null
    }
    const nextState = createExpandedHoverChatState()
    setHoverChatVisible(nextState.visible)
    setHoverChatExpanded(nextState.expanded)
  }

  const handleHoverChatCollapse = () => {
    if (petRef.current?.ui.panelOpen) {
      setHoverChatExpanded(false)
      return
    }
    collapseHoverChatOnly()
  }

  const handleDockHoverChange = (hovering: boolean) => {
    hoverChatHoveringRef.current = hovering
    if (careTrayDraggingRef.current) return
    const current = petRef.current
    if (current && !current.ui.panelOpen) {
      setDockLeanDirection(inferLeanDirection(current.ui.position))
      setDockLeanAmount(hovering ? 'soft' : dockLeanDirection ? 'active' : 'still')
    }
    if (hoverChatShowTimerRef.current) window.clearTimeout(hoverChatShowTimerRef.current)
    if (hoverChatHideTimerRef.current) window.clearTimeout(hoverChatHideTimerRef.current)

    const schedule = getHoverChatDockSchedule({
      hovering,
      panelOpen: Boolean(current?.ui.panelOpen),
      hasDraft: hovering && Boolean(draft.trim())
    })

    if (schedule?.kind === 'show') {
      hoverChatShowTimerRef.current = window.setTimeout(() => {
        if (!hoverChatHoveringRef.current) return
        setHoverChatVisible(schedule.nextState.visible)
        setHoverChatExpanded(schedule.nextState.expanded)
      }, schedule.delayMs)
    }

    if (schedule?.kind === 'hide') {
      setHoverChatExpanded(schedule.nextState.expanded)
      if (hoverChatVisible || hoverChatExpanded) {
        hoverChatHideTimerRef.current = window.setTimeout(() => {
          collapseHoverChatOnly()
        }, schedule.delayMs)
      }
    } else if (!hovering && !current?.ui.panelOpen && (hoverChatVisible || hoverChatExpanded)) {
      collapseHoverChatOnly()
    }

    petPlatform.setDockHover(hovering)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (chatSubmitInFlightRef.current) return
    const message = draft.trim()
    if (!message) return

    chatSubmitInFlightRef.current = true
    setHoverChatVisible(true)
    setHoverChatExpanded(true)
    setDraft('')
    setChatLoading(true)
    setLastReplySource('fallback')
    clearThinkingBubbleTimer()
    thinkingBubbleTimerRef.current = window.setTimeout(() => {
      const thinkingText = language === 'en-US' ? 'Let me think…' : '让我想一下…'
      setShowState({
        intent: 'companionship',
        bubble: createBubbleState(thinkingText, { kind: 'thought', tone: 'soft', loading: true }),
        expression: { eyes: 'soft', mouth: 'neutral' },
        animKey: 'nudge'
      })
      showBubble(createBubbleState(thinkingText, { kind: 'thought', tone: 'soft', loading: true }), true)
    }, THINKING_BUBBLE_DELAY_MS)
    playAction('talking', petRef.current?.state.isSleeping ?? false)
    // Persist the raw user turn into today's diary draft right away. The
    // pet reply gets appended downstream once the conversation loop returns.
    void recordDiaryTurn('user', message, 'chat')
    try {
      await applyConversationCommand(message)
    } finally {
      chatSubmitInFlightRef.current = false
      clearThinkingBubbleTimer()
      setChatLoading(false)
      const nextHoverChatState = getHoverChatSubmitCompletionState({
        hovering: hoverChatHoveringRef.current,
        panelOpen: Boolean(petRef.current?.ui.panelOpen)
      })
      setHoverChatVisible(nextHoverChatState.visible)
      setHoverChatExpanded(nextHoverChatState.expanded)
    }
  }

  const handleAdvanceOnboarding = async () => {
    const next = updatePet((current) => {
      const step = current.ui.onboarding.currentStep
      if (step === 'brain' && !aiSetupReady) return {
        ...current,
        memory: {
          ...current.memory,
          aiSetup: {
            ...current.memory.aiSetup,
            status: current.memory.aiSetup.provider === 'fallback' ? 'fallback' : 'checking',
            note: brainSetupHint,
            lastCheckedAt: new Date().toISOString()
          }
        }
      }

      const nextStep = getNextOnboardingStep(step)
      return {
        ...current,
        ui: {
          ...current.ui,
          onboarding: completeOnboardingStep(current, step, nextStep)
        }
      }
    })
    await commitPet(next)
  }

  const handleLanguageChange = async (nextLanguage: PetLanguage) => {
    const next = updatePet((current) => ({
      ...current,
      ui: {
        ...current.ui,
        language: nextLanguage
      }
    }))
    await commitPet(next)
  }

  const handleOnboardingStepSelect = async (step: PetOnboardingStep) => {
    const next = updatePet((current) => ({
      ...current,
      ui: {
        ...current.ui,
        onboarding: {
          ...current.ui.onboarding,
          currentStep: step
        }
      }
    }))
    await commitPet(next)
  }

  const handleCompanionTabChange = async (tab: PetData['ui']['companionSurfaces']['activeTab']) => {
    const next = updatePet((current) => ({
      ...current,
      ui: {
        ...current.ui,
        companionSurfaces: {
          ...current.ui.companionSurfaces,
          activeTab: tab
        }
      }
    }))
    await commitPet(next)
  }

  const handleHatchPet = async () => {
    const current = petRef.current
    if (!current) return
    if (current.ui.onboarding.currentStep !== 'hatch') {
      await handleOnboardingStepSelect('hatch')
      return
    }

    const next = updatePet((current) => {
      const hatchName = current.memory.profile.petName?.trim() || current.personality.name
      const hatchedAt = current.state.hatchedAt ?? new Date().toISOString()
      const relationshipStage = resolveRelationshipStage(0, current.memory.bond.closeness + 6)
      const hatchLanguage = current.ui.language ?? 'zh-CN'
      const hatchEnglish = hatchLanguage === 'en-US'

      return {
        ...current,
        personality: {
          ...current.personality,
          name: hatchName,
          species: current.memory.profile.chosenSpecies ?? current.personality.species
        },
        state: {
          ...current.state,
          stage: 'baby',
          hatchedAt,
          ageDays: 0,
          hunger: clamp(current.state.hunger, 16, 40),
          mood: clamp(current.state.mood + 8),
          cleanliness: clamp(current.state.cleanliness, 72, 100),
          health: clamp(current.state.health, 80, 100),
          energy: clamp(current.state.energy, 68, 100),
          affection: clamp(current.state.affection + 12),
          loneliness: clamp(current.state.loneliness - 8),
          lastCareAt: new Date().toISOString()
        },
        memory: {
          ...current.memory,
          profile: {
            ...current.memory.profile,
            petName: hatchName
          },
          bond: {
            ...current.memory.bond,
            summary: hatchEnglish ? 'It finally hatched and met you, and is trying hard to remember your voice and rhythm.' : '它终于破壳见到你了，正在努力记住你的声音和气味。',
            recentFeeling: hatchEnglish ? 'Freshly hatched, it feels a little nervous but wants to stay close to you.' : '刚刚孵化出来的它有点紧张，但更想贴近你。'
          },
          relationship: {
            ...current.memory.relationship,
            stage: relationshipStage,
            anniversaryStartedAt: hatchedAt,
            lastGrowthAt: hatchedAt,
            summary: hatchEnglish ? `You have just officially met; your relationship is “${formatRelationshipStage(relationshipStage, hatchLanguage)}”.` : `你们刚正式认识，现在是“${formatRelationshipStage(relationshipStage, hatchLanguage)}”。`
          },
          aiSetup: modelConfigToAiSetup(modelDraft ?? modelConfig ?? {
            enabled: false,
            provider: 'ollama',
            endpoint: 'http://127.0.0.1:11434',
            model: 'qwen3:4b-instruct',
            timeoutMs: 12000
          }, modelHealth, undefined, current.ui.language ?? 'zh-CN'),
          daily: [
            {
              ...current.memory.daily[0],
              summary: hatchEnglish ? `${hatchName} finally hatched today and is learning how to stay by your side.` : `${hatchName}今天终于破壳，开始学着贴在你身边陪你。`
            },
            ...current.memory.daily.slice(1)
          ],
          events: [
            createEvent(
              'chat',
              hatchEnglish ? `${hatchName} hatched and met you.` : `${hatchName}破壳见到你了。`,
              'happy',
              Math.max(0, current.state.loneliness - 8),
              'excited'
            ),
            ...current.memory.events
          ].slice(0, 40),
          traits: {
            ...current.memory.traits,
            playful: clamp(current.memory.traits.playful + 3),
            talkative: clamp(current.memory.traits.talkative + 2),
            bond: clamp(current.memory.traits.bond + 4)
          }
        },
        ui: {
          ...current.ui,
          onboardingCompleted: true,
          onboarding: {
            ...completeOnboardingStep(current, 'hatch', 'hatch'),
            finishedAt: new Date().toISOString()
          },
          panelOpen: true,
          position: {
            x: Math.round(stagePosition.x),
            y: Math.round(stagePosition.y)
          }
        }
      }
    })

    await commitPet(next)
    if (!next) return
    setShowState(undefined)
    showBubble({
      kind: 'speech',
      text: next.ui.language === 'en-US'
        ? `${next.personality.name} hatched. It will keep you company by the desk from now on.`
        : `${next.personality.name}破壳啦。以后它就会一直在桌边陪着你。`,
      tone: 'playful',
      emphasis: 'high',
      ttlMs: 7200
    }, true)
    playAction('happy', false)
  }

  const handleProfileField = async (field: 'petName' | 'preferredName', value: string) => {
    const next = updatePet((current) => ({
      ...current,
      personality: field === 'petName' && current.ui.onboardingCompleted ? { ...current.personality, name: value.trim() || current.personality.name } : current.personality,
      memory: {
        ...current.memory,
        profile: {
          ...current.memory.profile,
          [field]: value
        }
      },
      ui: {
        ...current.ui,
        onboarding: field === 'petName' || field === 'preferredName'
          ? completeOnboardingStep(current, 'identity', current.ui.onboarding.currentStep)
          : current.ui.onboarding
      }
    }))
    await commitPet(next)
  }

  const handleSpeciesChange = async (value: PetData['personality']['species']) => {
    const previousSpecies = petRef.current?.memory.profile.chosenSpecies ?? petRef.current?.personality.species
    const changedAt = new Date().toISOString()
    const next = updatePet((current) => {
      const variants = getGeneratedPetVariants(value)
      const speciesVariantBySpecies = { ...(current.ui.speciesVariantBySpecies ?? {}) }
      if (variants.length > 0 && !speciesVariantBySpecies[value]) {
        speciesVariantBySpecies[value] = variants[Math.floor(Math.random() * variants.length)]?.key ?? variants[0].key
      }

      return {
        ...current,
        personality: { ...current.personality, species: value },
        memory: {
          ...current.memory,
          profile: {
            ...current.memory.profile,
            chosenSpecies: value
          }
        },
        ui: {
          ...current.ui,
          speciesVariantBySpecies,
          speciesChangedAt: changedAt,
          onboarding: completeOnboardingStep(current, 'appearance', current.ui.onboarding.currentStep)
        }
      }
    })
    if (next && previousSpecies !== value) {
      const defaults = createDefaultVisiblePlacementsForAppearance(value, next.state.stage)
      setShowState(undefined)
      setWalkTarget(null)
      setCutoutPlacements(defaults)
      setAppliedCutoutPlacements(defaults)
      playAction('happy', false)
    }
    await commitPet(next)
  }

  const handlePaletteChange = async (value: string) => {
    const next = updatePet((current) => ({
      ...current,
      memory: {
        ...current.memory,
        profile: {
          ...current.memory.profile,
          selectedPalette: value
        }
      },
      ui: {
        ...current.ui,
        onboarding: completeOnboardingStep(current, 'appearance', current.ui.onboarding.currentStep)
      }
    }))
    await commitPet(next)
  }

  const handleGenderChange = async (value: 'boy' | 'girl') => {
    const next = updatePet((current) => ({
      ...current,
      memory: {
        ...current.memory,
        profile: {
          ...current.memory.profile,
          selectedGender: value
        }
      }
    }))
    await commitPet(next)
  }

  // A3: Equipping is now multi-slot aware.
  //  - wardrobeSelection becomes "the focused item id" (drives the
  //    alignment editor and which chip looks active).
  //  - wardrobeEquipped[meta.slot] is the actually-rendered item for that
  //    slot. Selecting a hat replaces the previous hat without disturbing
  //    a back-equipped item.
  const pickRandomBundledVariantKey = (itemId: string): string | undefined => {
    const variants = getBundledWardrobeVariants(itemId)
    if (variants.length === 0) return undefined
    return variants[Math.floor(Math.random() * variants.length)]?.key
  }

  const handleWardrobeSelect = async (value: string) => {
    const meta = getWardrobeItemById(value)
    const next = updatePet((current) => {
      const equipped = { ...(current.ui.wardrobeEquipped ?? {}) }
      const variantByItem = { ...(current.ui.wardrobeVariantByItem ?? {}) }
      if (meta) equipped[meta.slot] = value
      if (meta && !variantByItem[value]) {
        const randomKey = pickRandomBundledVariantKey(value)
        if (randomKey) variantByItem[value] = randomKey
      }
      return {
        ...current,
        ui: {
          ...current.ui,
          wardrobeSelection: value,
          wardrobeEquipped: equipped,
          wardrobeVariantByItem: variantByItem,
          wardrobeUnlocked: current.ui.wardrobeUnlocked?.includes(value) ? current.ui.wardrobeUnlocked : [...(current.ui.wardrobeUnlocked ?? []), value]
        }
      }
    })
    await commitPet(next)
  }

  // Unequip the *focused* item. Kept as the all-purpose 'take it off'
  // affordance the panel button uses. If the item is in the manifest, we
  // also drop it from the relevant slot in wardrobeEquipped so the overlay
  // disappears. Other slots stay equipped — only the selected one comes off.
  const handleWardrobeUnequip = async () => {
    setWardrobePlacementPreview(null)
    const next = updatePet((current) => {
      const focusedId = current.ui.wardrobeSelection
      const equipped = { ...(current.ui.wardrobeEquipped ?? {}) }
      if (focusedId) {
        const meta = getWardrobeItemById(focusedId)
        if (meta && equipped[meta.slot] === focusedId) {
          delete equipped[meta.slot]
        }
      }
      // After dropping, fall back to focusing whichever slot is still
      // equipped (so the editor stays useful) — pick a deterministic order.
      const fallbackId = (['head-top', 'face', 'mouth', 'neck', 'chest', 'back', 'hand', 'floating'] as const)
        .map((slot) => equipped[slot])
        .find((id): id is string => Boolean(id))
      return {
        ...current,
        ui: {
          ...current.ui,
          wardrobeSelection: fallbackId,
          wardrobeEquipped: equipped
        }
      }
    })
    await commitPet(next)
  }

  // Live preview of an in-flight placement edit. Drives the overlay during
  // pointer-drag without persisting; the alignment editor calls this on
  // every onChange and clears it on pointerup via onCommit. Pure UI state,
  // never written to disk.
  const handlePreviewWardrobePlacement = (itemId: string, placement: import('../types/wardrobe').WardrobePlacement) => {
    setWardrobePlacementPreview({ itemId, placement })
  }

  // Per-(species, item) placement updates from the alignment editor. We
  // namespace by species id (not by stage) because the user usually wants
  // a hat to keep its position as the pet ages — only the species silhouette
  // changes the natural attachment point. Switching species can introduce a
  // brand-new entry; the editor falls back to DEFAULT_PLACEMENT until the
  // user nudges it.
  const handleUpdateWardrobePlacement = async (itemId: string, placement: import('../types/wardrobe').WardrobePlacement) => {
    setWardrobePlacementPreview(null)
    const next = updatePet((current) => {
      const species = current.memory.profile.chosenSpecies ?? current.personality.species
      const placements = current.ui.wardrobePlacements ?? {}
      const speciesEntry = placements[species] ?? {}
      return {
        ...current,
        ui: {
          ...current.ui,
          wardrobePlacements: {
            ...placements,
            [species]: {
              ...speciesEntry,
              [itemId]: placement
            }
          }
        }
      }
    })
    await commitPet(next)
  }

  const handleResetWardrobePlacement = async (itemId: string) => {
    setWardrobePlacementPreview(null)
    const next = updatePet((current) => {
      const species = current.memory.profile.chosenSpecies ?? current.personality.species
      const placements = current.ui.wardrobePlacements ?? {}
      const speciesEntry = placements[species]
      if (!speciesEntry || !(itemId in speciesEntry)) return current
      const { [itemId]: _removed, ...rest } = speciesEntry
      void _removed
      return {
        ...current,
        ui: {
          ...current.ui,
          wardrobePlacements: {
            ...placements,
            [species]: rest
          }
        }
      }
    })
    await commitPet(next)
  }

  const handleMemoryEditorToggle = async () => {
    const next = updatePet((current) => ({
      ...current,
      ui: {
        ...current.ui,
        showMemoryEditor: !current.ui.showMemoryEditor
      }
    }))
    await commitPet(next)
  }

  const handleRemovePreference = async (id: string) => {
    const next = updatePet((current) => ({
      ...current,
      memory: {
        ...current.memory,
        preferences: current.memory.preferences.filter((item) => item.id !== id)
      }
    }))
    await commitPet(next)
  }

  const handleClearMemories = async (options: { alsoWeeklySummary: boolean } = { alsoWeeklySummary: false }) => {
    const next = updatePet((current) => ({
      ...current,
      memory: {
        ...current.memory,
        preferences: [],
        events: current.memory.events.slice(0, 1),
        // Optional second-level destruction. Without this branch the user
        // hits "清空偏好" expecting a clean slate but the weekly narrative
        // (which embeds preference references) lingers and surprises them.
        relationship: options.alsoWeeklySummary
          ? {
              ...current.memory.relationship,
              weeklySummary: undefined,
              weeklyConsolidationAt: undefined
            }
          : current.memory.relationship
      }
    }))
    await commitPet(next)
  }

  const handleRemoveFactRecord = async (recordId: string) => {
    const next = updatePet((current) => removeFactRecord(current, recordId))
    await commitPet(next)
  }

  const handleRemoveFactKey = async (key: string) => {
    const next = updatePet((current) => removeFactKey(current, key))
    await commitPet(next)
  }

  const handleToggleFactKeyTracking = async (key: string, enabled: boolean) => {
    const next = updatePet((current) => setFactKeyTracking(current, key, enabled))
    await commitPet(next)
  }

  // Single export entry point. Combines pet memory + every domain envelope
  // + the diary ledger into one JSON snapshot and writes it to disk via
  // Tauri's export dir. Replaces the old "导出记忆" + "导出快照" pair, which
  // shipped overlapping subsets to clipboard and confused users about what
  // was actually being saved.
  const handleExportAll = async () => {
    const current = petRef.current
    if (!current) return
    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      pet: current,
      diary: diaryLedgerRef.current,
      domains: {
        economy: economyEnvelope?.data,
        inventory: inventoryEnvelope?.data,
        home: homeEnvelope?.data,
        job: jobEnvelope?.data,
        achievement: achievementEnvelope?.data,
        planner: plannerEnvelope?.data,
        calendar: calendarEnvelope?.data,
        oracle: oracleEnvelope?.data,
        audit: auditEnvelope?.data,
        tools: toolEnvelope?.data
      }
    }

    await runTrackedTool({ name: 'pet.express', input: { kind: 'export-all' } }, {
      domain: 'tools',
      summary: localized('导出全部状态到磁盘', 'Exported all state to disk'),
      touchToolId: 'pet.express',
      run: async () => {
        try {
          const result = await petPlatform.writePetSnapshot(JSON.stringify(payload, null, 2))
          showBubble(localized(`已导出到 ${result.filePath}`, `Exported to ${result.filePath}`), true)
        } catch (error) {
          // Clipboard is the fallback path -- if disk write fails (sandboxed
          // browser preview, future packaging issue, etc.) we still want the
          // user to walk away with their data.
          await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
          showBubble(localized('磁盘写入失败，已复制到剪贴板。', 'Disk write failed, so I copied it to the clipboard.'), true)
          console.warn('[export-all] disk write failed, fell back to clipboard', error)
        }
      }
    })
  }

  const handleSaveModelConfig = async () => {
    if (!modelDraft || modelSaving) return
    setModelSaving(true)
    setModelConfigMessage('')

    try {
      const saved = await saveModelConfig(modelDraft)
      setModelConfig(saved)
      setModelDraft(saved)
      attemptedModelAutostartRef.current = false
      const ensureResult = await maybeEnsureModelService(saved, true)
      const health = await refreshModelHealth(saved, ensureResult)
      setModelConfigMessage(health.ok
        ? localized(
            ensureResult?.attemptedStart ? '模型设置已保存，已自动启动并通过生成检测。' : '模型设置已保存，并已通过生成检测。',
            ensureResult?.attemptedStart ? 'Model settings saved. It auto-started and passed the generation check.' : 'Model settings saved and the generation check passed.'
          )
        : health.enabled
          ? localized(
              `模型设置已保存，当前仍在 fallback。${ensureResult?.error ? `（自动启动失败：${ensureResult.error}）` : health.error ? `（${health.error}）` : ''}`,
              `Model settings saved, but it is still using fallback.${ensureResult?.error ? ` (Auto-start failed: ${ensureResult.error})` : health.error ? ` (${health.error})` : ''}`
            )
          : localized('模型设置已保存，当前已关闭本地模型。', 'Model settings saved. Local model is currently off.'))
      const next = updatePet((current) => ({
        ...current,
        memory: {
          ...current.memory,
          aiSetup: modelConfigToAiSetup(saved, health, ensureResult, current.ui.language ?? 'zh-CN')
        },
        ui: {
          ...current.ui,
          onboarding: completeOnboardingStep(current, 'brain', health.ok ? 'hatch' : current.ui.onboarding.currentStep)
        }
      }))
      await commitPet(next)
    } finally {
      setModelSaving(false)
    }
  }

  const handleResetModelDraft = () => {
    if (!modelConfig || modelSaving) return
    setModelDraft(modelConfig)
    setModelConfigMessage(localized('已还原为当前保存的模型设置。', 'Restored the currently saved model settings.'))
  }

  const handleCaptureScreenAwareness = async () => {
    if (screenAwarenessStatus.state === 'capturing') return
    setScreenAwarenessStatus({ state: 'capturing' })
    setChatLoading(true)
    const inspectingText = localized('我先看一眼你现在屏幕上的内容…', 'Let me take a quick look at what is on your screen…')
    setShowState({
      intent: 'companionship',
      bubble: createBubbleState(inspectingText, { kind: 'thought', tone: 'soft', loading: true }),
      expression: { eyes: 'soft', mouth: 'neutral' },
      animKey: 'nudge'
    })
    showBubble(createBubbleState(inspectingText, { kind: 'thought', tone: 'soft', loading: true }), true)
    playAction('talking', petRef.current?.state.isSleeping ?? false)
    try {
      const result = await petPlatform.captureScreenText()
      if (!result.supported) {
        const message = result.error ?? localized('当前平台暂不支持屏幕感知。', 'Screen awareness is not supported on this platform yet.')
        setScreenAwarenessStatus({
          state: 'unsupported',
          message
        })
        showBubble(message, true)
        return
      }
      if (result.error) {
        setScreenAwarenessStatus({
          state: 'error',
          message: result.error
        })
        showBubble(localized('屏幕读取失败，请检查系统权限。', 'Screen capture failed. Please check system permissions.'), true)
        return
      }
      const current = petRef.current
      if (!current) return
      const text = result.text.trim()
      if (!text) {
        const message = localized('这次没有识别到明显文字。', 'No readable text was detected this time.')
        setScreenAwarenessStatus({
          state: 'ready',
          lineCount: 0,
          message
        })
        showBubble(message, true)
        return
      }

      const ocrSnippet = text.length > 2400 ? `${text.slice(0, 2400)}…` : text
      const ocrPrompt = language === 'en-US'
        ? `I tapped screen awareness. Here is OCR text from my current screen:\n${ocrSnippet}\nPlease give me one short companion-style response: first acknowledge what I may be doing, then offer one gentle next step. Keep it natural and concise. Do not claim you can operate the IDE, and do not ask me to copy/paste.`
        : `我刚点了“屏幕感知”。下面是我当前屏幕 OCR 到的文本：\n${ocrSnippet}\n请给我一句简短陪伴回复：先接住我可能正在做的事，再给一个温和的下一步建议。语气自然，不要假装你能直接操作 IDE，也不要让我复制粘贴。`

      const scene = resolveRuntimeSceneWithHint(current, undefined, {
        reminderPhase,
        activeReminderTitle: activeReminder?.title ?? undefined,
        activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
        nearestReminderAt,
        nearestReminderIntensity,
        recentInteraction,
        now: Date.now()
      })

      const generated = await generatePetReply(
        buildPetGenerationRequest({
          pet: current,
          scene,
          reminderPhase,
          interactionType: 'chat',
          userInput: ocrPrompt,
          recentInteraction,
          activeReminderTitle: activeReminder?.title ?? undefined,
          activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
          nearestReminderAt,
          nearestReminderIntensity,
          kind: 'chat'
        }),
        {
          text: localized('看起来你在专注处理屏幕上的内容。我在这儿，先从最小的一步开始就好。', 'Looks like you are focused on what is on screen. I am here with you—start with the smallest next step.'),
          action: 'talking'
        }
      )

      const visibleReply = visibleConversationReply(withReplySource(generated, generated.source ?? 'fallback'))
      const { synced } = await applyConversationPresentation(current, visibleReply)
      void recordDiaryTurn('pet', visibleReply.text, 'chat')
      scheduleIdle(synced)

      const preview = text.length > 1600 ? `${text.slice(0, 1600)}…` : text
      setScreenAwarenessStatus({
        state: 'ready',
        preview,
        lineCount: result.lineCount,
        message: localized(`已读取 ${result.lineCount} 行屏幕文字，并生成了当前陪伴回复。`, `Read ${result.lineCount} lines from your screen and generated a companion reply.`)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : localized('屏幕读取失败。', 'Screen capture failed.')
      setScreenAwarenessStatus({
        state: 'error',
        message
      })
      showBubble(localized('屏幕读取失败，请稍后再试。', 'Screen capture failed, please try again.'), true)
    } finally {
      setChatLoading(false)
    }
  }

  const handleReminderSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = reminderTitle.trim()
    if (!title || !reminderTime) return

    const input: CreateReminderInput = {
      title,
      scheduledAt: new Date(reminderTime).toISOString(),
      intensity: reminderIntensity
    }

    await runTrackedTool({ name: 'reminder.create', input }, {
      domain: 'tools',
      summary: localized(`新增提醒：${title}`, `Created reminder: ${title}`),
      metadata: {
        title,
        scheduledAt: input.scheduledAt,
        intensity: input.intensity ?? null
      },
      touchToolId: 'reminder.create',
      run: async () => {
        await createReminderFromInput(input)
      }
    })
  }

  const handleClaimRewards = async () => {
    if (!economyEnvelope) return
    const claimed = claimPendingRewards(economyEnvelope)
    if (claimed.amount <= 0) return
    await saveEnvelope('economy', claimed.envelope, setEconomyEnvelope)
    showBubble(localized(`已把 ${claimed.amount} Pawcoin 装进小金库。`, `${claimed.amount} Pawcoin moved into the little savings jar.`), true)
    await persistAudit(createAuditEntry({
      actor: 'user',
      domain: 'economy',
      action: 'economy.claimRewards',
      summary: localized(`领取了 ${claimed.amount} Pawcoin`, `Claimed ${claimed.amount} Pawcoin`),
      metadata: {
        amount: claimed.amount
      }
    }))
    if (petRef.current) {
      void reconcileDomainProgress(petRef.current)
    }
  }

  // The fixed "daily supplies" shop (snack-pack / cozy-blanket /
  // star-lamp) was removed at the user's request — the blind-box
  // wardrobe is the only remaining purchase surface. The handler is
  // gone too; SHOP_ITEMS still lives in pet-domains.ts as read-only
  // metadata so legacy inventory items from old saves still display
  // and behave correctly via handleUseInventoryItem.

  // Wardrobe blind-box draw. The user picks a price band (low/mid/high), the
  // shop filters the manifest and asks the LLM (or fallback) to pick one
  // item that "the pet would want today". We only deduct pawcoin for the
  // single item that actually got drawn — the user pays for outcome, not
  // attempts. If the model is offline / off-pool / silent, we fall back to
  // weighted-random selection with a templated reason and tag the history
  // entry with source='fallback' so the panel UI can show that distinction.
  const handleDrawWardrobe = async (band: 'low' | 'mid' | 'high'): Promise<void> => {
    if (!economyEnvelope || !inventoryEnvelope || !petRef.current) return

    const { BLIND_BOX_BUDGETS, inferMoodTagsFromScore, pickWardrobe } = await import('../lib/wardrobe-shop')
    const budget = BLIND_BOX_BUDGETS[band]
    if (economyEnvelope.data.pawcoin < budget) {
      showBubble(localized(`今天的米还差一点，攒到${budget}米再来盲盒。`, `You need a little more Pawcoin today. Save up to ${budget} before opening this blind box.`), true)
      return
    }

    const pet = petRef.current
    const moodTags = inferMoodTagsFromScore(pet.state.mood)
    const ctx = {
      budget,
      preferredMoods: moodTags,
      unlockedIds: pet.ui.wardrobeUnlocked ?? [],
      petName: pet.personality.name,
      preferredName: pet.memory.profile.preferredName,
      weeklySummary: pet.memory.relationship.weeklySummary,
      closeness: pet.memory.bond.closeness,
      stage: pet.state.stage,
      language: pet.ui.language
    }

    const result = await pickWardrobe(ctx, {
      callModel: async (pool, selectionCtx) =>
        petPlatform.selectWardrobeItem({
          pool: pool.map((item) => ({
            id: item.id,
            nameZh: item.nameZh,
            nameEn: item.nameEn,
            category: item.category,
            slot: item.slot,
            moodTags: item.moodTags,
            priceBand: item.priceBand,
            price: item.price,
            description: item.description,
            descriptionEn: item.descriptionEn
          })),
          context: {
            petName: selectionCtx.petName,
            preferredName: selectionCtx.preferredName,
            moodScore: pet.state.mood,
            moodTags: selectionCtx.preferredMoods,
            closeness: selectionCtx.closeness,
            stage: selectionCtx.stage,
            weeklySummary: selectionCtx.weeklySummary,
            budget: selectionCtx.budget,
            unlockedIds: selectionCtx.unlockedIds,
            language: pet.ui.language
          }
        })
    })

    if (!result) {
      showBubble(localized('盲盒今天没看上的，米先给你留着。', 'Nothing in the blind box caught its eye today, so the Pawcoin stays with you.'), true)
      return
    }
    if (economyEnvelope.data.pawcoin < result.item.price) {
      // Edge case: filterPool relaxed unlocked filter and surfaced a more
      // expensive item. Don't silently overspend — refuse and let the user
      // try a smaller band.
      showBubble(localized(`这件 ${result.item.nameZh} 要 ${result.item.price} 米，今天先攒攒。`, `${wardrobeItemName(result.item)} costs ${result.item.price} Pawcoin, so save up a little more today.`), true)
      return
    }

    // A4: when filterPool ran out of fresh items and surfaced one the user
    // already owns, refund half the price. This caps the "hey you gave me
    // the bow tie again" frustration without making duplicates entirely
    // free (which would let the user grind low-band rolls for refund
    // exploits — half-back keeps it lossy enough to discourage).
    const isDuplicate = (pet.ui.wardrobeUnlocked ?? []).includes(result.item.id)
    const effectivePrice = isDuplicate ? Math.ceil(result.item.price / 2) : result.item.price

    const nextEconomy = updateEnvelope(economyEnvelope, {
      ...economyEnvelope.data,
      pawcoin: economyEnvelope.data.pawcoin - effectivePrice,
      lifetimeSpent: economyEnvelope.data.lifetimeSpent + effectivePrice
    })
    const nextInventory = upsertInventoryItem(inventoryEnvelope, result.item.id, 1, 'shop')

    const drawnAtIso = new Date().toISOString()
    const drawEntry = {
      itemId: result.item.id,
      drawnAt: drawnAtIso,
      reason: isDuplicate ? localized(`${result.reason}（重复，退一半）`, `${result.reason} (duplicate, half refunded)`) : result.reason,
      source: result.source,
      pricePaid: effectivePrice
    }

    await Promise.all([
      saveEnvelope('economy', nextEconomy, setEconomyEnvelope),
      saveEnvelope('inventory', nextInventory, setInventoryEnvelope)
    ])

    // B6: persist the gift moment as an EventMemory so the weekly summary
    // and future LLM context can refer to it ("上周它送了你一顶草帽，因为
    // 看你那天闷闷的"). Importance=2 (notable but not life-changing) keeps
    // the tier-3 slot for actual milestones.
    const eventSummary = localized(`挑了 ${result.item.nameZh} 给你：${result.reason}`, `Picked ${wardrobeItemName(result.item)} for you: ${result.reason}`).slice(0, 240)
    const giftEvent = {
      id: `wardrobe-gift-${drawnAtIso}-${result.item.id}`,
      ts: drawnAtIso,
      type: 'chat' as const,
      summary: eventSummary,
      petEmotion: 'happy' as const,
      importance: 2 as const,
      tags: ['wardrobe', 'gift', `band-${band}`, result.source]
    }

    const nextPet = updatePet((current) => {
      const existingUnlocked = current.ui.wardrobeUnlocked ?? []
      const existingHistory = current.ui.wardrobeDrawHistory ?? []
      const existingVariantByItem = current.ui.wardrobeVariantByItem ?? {}
      const nextHistory = [...existingHistory, drawEntry].slice(-6)
      const withMemory = addEventMemory(current, giftEvent)
      const randomVariantKey = pickRandomBundledVariantKey(result.item.id)
      return {
        ...withMemory,
        ui: {
          ...withMemory.ui,
          wardrobeUnlocked: existingUnlocked.includes(result.item.id)
            ? existingUnlocked
            : [...existingUnlocked, result.item.id],
          wardrobeVariantByItem: randomVariantKey
            ? {
                ...existingVariantByItem,
                [result.item.id]: randomVariantKey
              }
            : existingVariantByItem,
          wardrobeDrawHistory: nextHistory
        }
      }
    })
    await commitPet(nextPet)

    // Blind-box bubbles are special: the pet just "gave" the user
    // something. Use a playful tone, a longer hold (12s) and persistent=true
    // so the user has time to read and the bubble doesn't auto-hide before
    // they look at the new chip in the panel. Generic bubbles are warm/5.2s.
    showBubble(createBubbleState(result.reason, {
      tone: 'playful',
      emphasis: 'high',
      ttlMs: 12000
    }), true)
    await persistAudit(createAuditEntry({
      actor: 'user',
      domain: 'economy',
      action: 'shop.wardrobe-draw',
      summary: localized(`盲盒抽到 ${result.item.nameZh}`, `Blind box drew ${wardrobeItemName(result.item)}`),
      metadata: {
        itemId: result.item.id,
        price: result.item.price,
        band,
        source: result.source
      }
    }))
    await reconcileDomainProgress(petRef.current)
  }

  const handleUseInventoryItem = async (itemId: string) => {
    if (!inventoryEnvelope || !homeEnvelope || !economyEnvelope || !petRef.current) return
    const item = SHOP_ITEMS.find((entry) => entry.id === itemId)
    if (!item) return

    let nextInventory = inventoryEnvelope
    let nextHome = homeEnvelope
    let nextPet = petRef.current

    if (item.kind === 'furniture') {
      nextInventory = consumeInventoryItem(inventoryEnvelope, itemId, 1)
      nextHome = placeFurnitureFromInventory(homeEnvelope, itemId)
      await Promise.all([
        saveEnvelope('inventory', nextInventory, setInventoryEnvelope),
        saveEnvelope('home', nextHome, setHomeEnvelope)
      ])
      showBubble(localized(`${item.title} 已经摆进小窝，舒适度上升了。`, `${shopItemTitle(item)} was placed in its home, and comfort went up.`), true)
    } else if (item.kind === 'consumable') {
      const refusalKey = getCareInteractionRefusalKey(nextPet, 'feed')
      if (refusalKey) {
        showBubble(t(resolveLanguage(nextPet.ui.language), refusalKey as TranslationKey), true)
        playAction('alert', nextPet.state.isSleeping)
        return
      }
      nextInventory = consumeInventoryItem(inventoryEnvelope, itemId, 1)
      await saveEnvelope('inventory', nextInventory, setInventoryEnvelope)
      await runInteraction('feed')
      nextPet = petRef.current ?? nextPet
      showBubble(localized(`${item.title} 已经喂给它了。`, `${shopItemTitle(item)} was fed to it.`), true)
    }

    await persistAudit(createAuditEntry({
      actor: 'user',
      domain: item.kind === 'furniture' ? 'home' : 'inventory',
      action: 'inventory.use',
      summary: localized(`使用 ${item.title}`, `Used ${shopItemTitle(item)}`),
      metadata: {
        itemId,
        kind: item.kind
      }
    }))
    await reconcileDomainProgress(nextPet)
  }

  const launchJob = async (jobId: string, options?: { replaceExisting?: boolean }) => {
    if (!jobEnvelope || !petRef.current) {
      showBubble(localized('兼职系统还在加载，稍等一秒再点。', 'Part-time jobs are still loading. Try again in a second.'), true)
      return
    }
    const job = JOB_OPTIONS.find((entry) => entry.id === jobId)
    if (!job) {
      showBubble(localized('这个兼职档位暂时不可用。', 'That part-time job option is unavailable right now.'), true)
      return
    }
    if (jobEnvelope.data.activeJob && !options?.replaceExisting) {
      const current = JOB_OPTIONS.find((entry) => entry.id === jobEnvelope.data.activeJob?.id)
      showBubble(
        localized(
          `它正在忙「${current?.title ?? jobEnvelope.data.activeJob.id}」，做完会自动入账。`,
          `It is already busy with "${current ? jobTitle(current) : jobEnvelope.data.activeJob.id}". Coins will auto-land when it finishes.`
        ),
        true
      )
      return
    }
    if (petRef.current.memory.bond.closeness < job.unlockBond) {
      showBubble(
        localized(
          `亲密度还不够，达到 ${job.unlockBond} 再解锁「${job.title}」。`,
          `Bond is not high enough yet. Reach ${job.unlockBond} to unlock "${jobTitle(job)}".`
        ),
        true
      )
      return
    }

    const startedAt = new Date().toISOString()
    const endsAt = new Date(Date.now() + job.durationMinutes * 60_000).toISOString()
    const unlockedJobs = jobEnvelope.data.unlockedJobs.includes(job.id)
      ? jobEnvelope.data.unlockedJobs
      : [...jobEnvelope.data.unlockedJobs, job.id]
    const nextJobs = updateEnvelope(jobEnvelope, {
      ...jobEnvelope.data,
      unlockedJobs,
      activeJob: {
        id: job.id,
        startedAt,
        endsAt
      }
    })
    await saveEnvelope('jobs', nextJobs, setJobEnvelope)
    // Immediate visible feedback so "出发" never feels like a dead click.
    setShowState({
      intent: 'nudge',
      bubble: createBubbleState(
        localized(`出发做「${job.title}」啦！`, `Heading out for "${jobTitle(job)}"!`),
        { kind: 'thought', tone: 'playful', ttlMs: 5600 }
      ),
      expression: { eyes: 'sparkle', mouth: 'open' },
      animKey: 'nudge'
    })
    playAction('talking', petRef.current?.state.isSleeping ?? false)
    showBubble(
      localized(
        `它去做「${job.title}」了，${job.durationMinutes} 分钟后会自动回来给你 ${job.reward} 米。`,
        `It went to do "${jobTitle(job)}" and will be back with ${job.reward} pawcoin in ${job.durationMinutes} minutes.`
      ),
      true
    )
    await persistAudit(createAuditEntry({
      actor: 'user',
      domain: 'jobs',
      action: 'job.start',
      summary: localized(`开始兼职：${job.title}`, `Started part-time job: ${jobTitle(job)}`),
      metadata: {
        jobId,
        endsAt,
        replaced: Boolean(options?.replaceExisting)
      }
    }))
  }

  const handleStartJob = async (jobId: string) => {
    await launchJob(jobId)
  }

  const handleSwitchJob = async (jobId: string) => {
    if (!jobEnvelope) return
    if (!jobEnvelope.data.activeJob) {
      await launchJob(jobId)
      return
    }
    const current = JOB_OPTIONS.find((entry) => entry.id === jobEnvelope.data.activeJob?.id)
    await persistAudit(createAuditEntry({
      actor: 'user',
      domain: 'jobs',
      action: 'job.switch',
      summary: localized(
        `切换兼职：${current?.title ?? jobEnvelope.data.activeJob.id} → ${JOB_OPTIONS.find((entry) => entry.id === jobId)?.title ?? jobId}`,
        `Switched part-time job: ${current ? jobTitle(current) : jobEnvelope.data.activeJob.id} -> ${JOB_OPTIONS.find((entry) => entry.id === jobId)?.titleEn ?? jobId}`
      ),
      metadata: {
        fromJobId: jobEnvelope.data.activeJob.id,
        toJobId: jobId
      }
    }))
    showBubble(
      localized(
        `已改成「${JOB_OPTIONS.find((entry) => entry.id === jobId)?.title ?? jobId}」，现在就出发。`,
        `Switched to "${JOB_OPTIONS.find((entry) => entry.id === jobId)?.titleEn ?? jobId}" and heading out now.`
      ),
      true
    )
    await launchJob(jobId, { replaceExisting: true })
  }

  const handleCancelJob = async () => {
    if (!jobEnvelope) return
    const activeJob = jobEnvelope.data.activeJob
    if (!activeJob) return
    const activeMeta = JOB_OPTIONS.find((entry) => entry.id === activeJob.id)
    const nextJobs = updateEnvelope(jobEnvelope, {
      ...jobEnvelope.data,
      activeJob: undefined
    })
    await saveEnvelope('jobs', nextJobs, setJobEnvelope)
    showBubble(
      localized(
        `已取消「${activeMeta?.title ?? activeJob.id}」。`,
        `Cancelled "${activeMeta ? jobTitle(activeMeta) : activeJob.id}".`
      ),
      true
    )
    await persistAudit(createAuditEntry({
      actor: 'user',
      domain: 'jobs',
      action: 'job.cancel',
      summary: localized(`取消兼职：${activeMeta?.title ?? activeJob.id}`, `Cancelled part-time job: ${activeMeta ? jobTitle(activeMeta) : activeJob.id}`),
      metadata: {
        jobId: activeJob.id
      }
    }))
  }

  // Claim flow used by both the manual "可领取" button AND the auto-claim
  // timer below. We deliberately skip the addPendingReward intermediate
  // step (used by reminder gifts and other batch-claim sources): jobs are
  // a "wait N minutes, get coins" mechanic and forcing the user to find
  // and click "领取奖励" afterwards was the main complaint behind
  // "兼职没看到在干啥". So coins go directly to pawcoin + lifetimeEarned,
  // and the strong-reminder helpers (teleport + silent OS notification)
  // pull the user's eyes back to the pet on the active monitor.
  const handleClaimJob = async () => {
    if (!jobEnvelope || !economyEnvelope || !petRef.current) return
    const activeJob = jobEnvelope.data.activeJob
    if (!activeJob) return
    const job = JOB_OPTIONS.find((entry) => entry.id === activeJob.id)
    if (!job) return
    if (new Date(activeJob.endsAt).getTime() > Date.now()) return

    const nextJobs = updateEnvelope(jobEnvelope, {
      ...jobEnvelope.data,
      activeJob: undefined,
      completedJobs: jobEnvelope.data.completedJobs + 1,
      unlockedJobs: jobEnvelope.data.unlockedJobs.includes(job.id)
        ? jobEnvelope.data.unlockedJobs
        : [...jobEnvelope.data.unlockedJobs, job.id]
    })
    const nextEconomy = updateEnvelope(economyEnvelope, {
      ...economyEnvelope.data,
      pawcoin: economyEnvelope.data.pawcoin + job.reward,
      lifetimeEarned: economyEnvelope.data.lifetimeEarned + job.reward
    })

    await Promise.all([
      saveEnvelope('jobs', nextJobs, setJobEnvelope),
      saveEnvelope('economy', nextEconomy, setEconomyEnvelope)
    ])
    const completionText = localized(
      `${job.title} 做完啦，到账 ${job.reward} 米。`,
      `${jobTitle(job)} is done. Earned ${job.reward} pawcoin.`
    )
    showBubble(completionText, true)
    await persistAudit(createAuditEntry({
      actor: 'system',
      domain: 'jobs',
      action: 'job.complete',
      summary: localized(`完成兼职：${job.title}`, `Completed part-time job: ${jobTitle(job)}`),
      metadata: {
        jobId: job.id,
        reward: job.reward
      }
    }))
    // Strong reminder so multi-monitor / focused-on-editor users don't
    // miss the completion. Reuses the same helpers wired up for coding
    // events; pet window only so we don't double-fire from the panel.
    if (currentWindowLabel === PET_WINDOW_LABEL) {
      petPlatform.bringPetToActiveMonitor()
      petPlatform.notifyUserStrong({
        title: localized('兼职完成', 'Part-time job done'),
        body: completionText
      })
    }
    await reconcileDomainProgress(petRef.current)
  }

  // Stash the latest claim handler in a ref so the auto-claim timer below
  // doesn't capture a stale closure (it has to reference whatever
  // jobEnvelope / economyEnvelope are at fire time, not at mount time).
  const handleClaimJobRef = useRef(handleClaimJob)
  useEffect(() => {
    handleClaimJobRef.current = handleClaimJob
  })

  // Auto-claim a matured job: when the active job's endsAt is in the
  // past (or about to be), fire the claim handler — which adds coins +
  // pings the user via teleport + silent OS notification. Pet window
  // only so the panel window doesn't double-fire it.
  useEffect(() => {
    if (currentWindowLabel !== PET_WINDOW_LABEL) return
    const activeJob = jobState.activeJob
    if (!activeJob) return
    const remaining = new Date(activeJob.endsAt).getTime() - Date.now()
    // Already matured (e.g. job finished while the app was closed): fire
    // immediately on next tick so the rest of mount finishes first.
    if (remaining <= 0) {
      const timer = window.setTimeout(() => {
        void handleClaimJobRef.current()
      }, 0)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      void handleClaimJobRef.current()
    }, remaining + 200)
    return () => window.clearTimeout(timer)
  }, [currentWindowLabel, jobState.activeJob])

  // Periodic in-job presence bubble. Without this the pet looks identical
  // for the whole 10/20/30-minute job duration, which is what made the
  // user say "兼职没看到在干啥". Every 5 minutes (and once 6 seconds in,
  // so the first one feels prompt) we emit a soft "still working" bubble
  // with how many minutes are left. Pet window only.
  useEffect(() => {
    if (currentWindowLabel !== PET_WINDOW_LABEL) return
    const activeJob = jobState.activeJob
    if (!activeJob) return
    const job = JOB_OPTIONS.find((entry) => entry.id === activeJob.id)
    if (!job) return
    const isZh = (petRef.current?.ui.language ?? 'zh-CN') === 'zh-CN'

    const fire = () => {
      const minutesLeft = Math.max(0, Math.ceil((new Date(activeJob.endsAt).getTime() - Date.now()) / 60_000))
      if (minutesLeft <= 0) return
      const text = isZh
        ? `还在帮你做「${job.title}」… 还剩 ${minutesLeft} 分钟。`
        : `Still on "${jobTitle(job)}"… ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} left.`
      showBubble(text, false)
    }

    const initialTimer = window.setTimeout(fire, 6_000)
    const interval = window.setInterval(fire, 5 * 60 * 1000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWindowLabel, jobState.activeJob])

  const handleExportAchievementCard = async () => {
    const currentPet = petRef.current
    if (!achievementEnvelope || !economyEnvelope || !homeEnvelope || !currentPet) {
      setShareCardStatus({ state: 'error', message: localized('陪伴档案还没准备好，稍后再试。', 'Companion profile is not ready yet. Try again later.') })
      return
    }
    if (shareCardStatus.state === 'exporting') return

    setShareCardStatus({ state: 'exporting' })

    try {
      const blob = await renderShareCardBlob({
        pet: currentPet,
        achievements: achievementEnvelope.data,
        economy: economyEnvelope.data,
        home: homeEnvelope.data
      })
      const bytes = await blobToUint8Array(blob)
      const savedPath = await petPlatform.saveShareCard(bytes)
      const clipboardCopied = await tryWriteImageToClipboard(blob)

      const nextAchievements = updateEnvelope(achievementEnvelope, {
        ...achievementEnvelope.data,
        exportedCards: achievementEnvelope.data.exportedCards + 1
      })
      await saveEnvelope('achievements', nextAchievements, setAchievementEnvelope)

      const fileName = savedPath.split(/[\\/]/).pop() ?? 'share-card.png'
      setShareCardStatus({
        state: 'ready',
        savedPath,
        fileName,
        clipboardCopied,
        message: clipboardCopied ? localized('已保存并复制到剪贴板。', 'Saved and copied to clipboard.') : localized('已保存到本地。', 'Saved locally.'),
        kind: 'manual',
        stage: currentPet.state.stage
      })
      showBubble(
        clipboardCopied
          ? localized('陪伴卡已经复制到剪贴板，也存了一份到本地。', 'Companion card was copied to the clipboard and saved locally too.')
          : localized('陪伴卡已经保存到本地，可以从面板里直接打开。', 'Companion card was saved locally and can be opened from the panel.'),
        true
      )
      await persistAudit(createAuditEntry({
        actor: 'user',
        domain: 'achievements',
        action: 'achievement.exportCard',
        summary: localized('导出了陪伴档案卡', 'Exported companion profile card'),
        metadata: { savedPath, clipboardCopied }
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : localized('未知错误', 'unknown error')
      setShareCardStatus({ state: 'error', message: localized(`导出失败：${message}`, `Export failed: ${message}`) })
      showBubble(localized(`陪伴卡这次没存上，等下再试一次。（${message}）`, `The companion card was not saved this time. Try again later. (${message})`), true)
    }
  }

  const handleRevealShareCard = async () => {
    if (shareCardStatus.state !== 'ready' || !shareCardStatus.savedPath) return
    try {
      await petPlatform.revealInFileManager(shareCardStatus.savedPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : localized('未知错误', 'unknown error')
      setShareCardStatus((current) => ({ ...current, message: localized(`打开文件失败：${message}`, `Failed to open file: ${message}`) }))
    }
  }

  // Triggered both by the panel's "再总结一次" button and by the periodic
  // background scheduler below. The button passes force=true so the user can
  // always retry; the scheduler defers to isWeeklyConsolidationDue so we
  // don't burn LLM calls more than once per week.
  const refreshWeeklySummary = async (options: { force?: boolean } = {}) => {
    if (weeklyConsolidationInFlightRef.current) return
    const currentPet = petRef.current
    if (!currentPet) return

    weeklyConsolidationInFlightRef.current = true
    if (options.force) {
      setWeeklySummaryStatus({ state: 'refreshing' })
    }
    try {
      const result = await consolidateWeeklyMemory(currentPet, { force: options.force })
      if (result.refreshed) {
        await commitPet(updatePet(() => result.pet))
        setWeeklySummaryStatus({ state: 'ready', message: currentPet.ui.language === 'en-US' ? 'This week’s companionship memory was updated.' : '本周陪伴已更新' })
      } else if (options.force) {
        const message = result.skippedReason === 'no-data'
          ? (currentPet.ui.language === 'en-US' ? 'There are not enough recent events yet. Chat a bit more, then look back together.' : '最近还没有足够事件，先陪你聊一会儿再回看吧。')
          : (currentPet.ui.language === 'en-US' ? 'It was summarized recently, and this week has not gathered enough new moments yet.' : '刚刚才总结过，这一周还没攒满新内容。')
        setWeeklySummaryStatus({ state: 'skipped', message })
      }
    } catch (error) {
      if (options.force) {
        const message = error instanceof Error ? error.message : (currentPet.ui.language === 'en-US' ? 'Unknown error' : '未知错误')
        setWeeklySummaryStatus({ state: 'error', message: currentPet.ui.language === 'en-US' ? `Weekly consolidation failed: ${message}` : `周归纳失败：${message}` })
      }
    } finally {
      weeklyConsolidationInFlightRef.current = false
    }
  }

  const handleConsolidateWeeklyMemory = async () => {
    await refreshWeeklySummary({ force: true })
  }

  // Background cadence: fire once on mount when due, then re-check every six
  // hours. Six hours is short enough that a long-running session still rolls
  // up promptly when the 7-day mark crosses, but rare enough that we don't
  // spin LLM calls.
  useEffect(() => {
    if (!pet) return
    if (isWeeklyConsolidationDue(pet)) {
      void refreshWeeklySummary()
    }
    const interval = window.setInterval(() => {
      const currentPet = petRef.current
      if (currentPet && isWeeklyConsolidationDue(currentPet)) {
        void refreshWeeklySummary()
      }
    }, 6 * 60 * 60 * 1000)
    return () => window.clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet?.memory.relationship.anniversaryStartedAt])

  // Proactive fact recall: scan the ledger every 30 minutes for keys the user
  // has gone quiet on (last mention >= 5 days). The function itself enforces
  // the "at most once per 4 hours" cooldown via lastProactiveRecallAt, so a
  // tight polling interval here is safe -- it just gives us responsiveness
  // without burning LLM calls.
  const proactiveRecallInFlightRef = useRef(false)
  const tryRunProactiveRecall = async () => {
    if (proactiveRecallInFlightRef.current) return
    const currentPet = petRef.current
    if (!currentPet) return
    // Bail out when the user is mid-conversation -- we don't want a recall
    // bubble overwriting a fresh chat reply.
    const lastMessageAt = currentPet.memory.working.lastUserMessageAt ? new Date(currentPet.memory.working.lastUserMessageAt).getTime() : 0
    if (lastMessageAt && Date.now() - lastMessageAt < 60_000) return
    if (currentPet.state.isSleeping) return

    proactiveRecallInFlightRef.current = true
    try {
      const scene = resolveRuntimeSceneWithHint(currentPet, undefined, {
        reminderPhase,
        activeReminderTitle: activeReminder?.title ?? undefined,
        activeReminderIntensity: normalizeReminderIntensity(activeReminder?.intensity),
        nearestReminderAt,
        nearestReminderIntensity,
        recentInteraction,
        now: Date.now()
      })
      const result = await tryProactiveFactRecall({
        pet: currentPet,
        scene,
        reminderPhase
      })
      if (result.pet !== currentPet) {
        // Stamp lastProactiveRecallAt regardless of whether a bubble actually
        // showed -- the function returns the cooldown-stamped pet whenever it
        // tried (success or model-empty).
        await commitPet(updatePet(() => result.pet))
      }
      if (result.bubble) {
        applyGeneratedPresentation(result.pet, {
          text: result.bubble,
          action: 'talking',
          source: 'model'
        })
      }
    } catch (error) {
      console.warn('[proactive-recall] failed', error)
    } finally {
      proactiveRecallInFlightRef.current = false
    }
  }

  useEffect(() => {
    if (!pet) return
    // Don't fire immediately on mount -- give the controller a beat to settle
    // and avoid racing the initial scene render.
    const startTimer = window.setTimeout(() => { void tryRunProactiveRecall() }, 90_000)
    const interval = window.setInterval(() => { void tryRunProactiveRecall() }, 30 * 60 * 1000)
    return () => {
      window.clearTimeout(startTimer)
      window.clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet?.memory.relationship.anniversaryStartedAt])

  // Phase A sticker trigger: morning greeting. Idempotent per local day,
  // gated on morning hours (5am-12pm). We poll every 30 minutes so a long-
  // running session catches the next morning crossover without needing a
  // dedicated midnight scheduler. Only the floating pet window fires --
  // panel-only windows wouldn't have anywhere to render the overlay.
  useEffect(() => {
    if (currentWindowLabel !== PET_WINDOW_LABEL) return
    if (!pet) return
    const tryFire = () => {
      const current = petRef.current
      if (!current) return
      const result = fireMorningStickerIfDue(current)
      if (result.pet !== current) syncPet(result.pet)
      if (result.sticker) setActiveStickerId(result.sticker.id)
    }
    tryFire()
    const interval = window.setInterval(tryFire, 30 * 60 * 1000)
    return () => window.clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWindowLabel, pet?.memory.relationship.anniversaryStartedAt])

  // Diary ledger lifecycle. Three responsibilities:
  //   1. Initial load from disk on mount, normalise, populate state.
  //   2. Re-enable the system idle sampler whenever config.activityTrackingEnabled
  //      flips on (covers the cold-start case where Tauri restarts and forgets).
  //   3. Run an auto-rollup on mount + every config-controlled interval so
  //      today's draft stays fresh while the user is around.
  const commitDiaryLedger = async (next: PetDiaryLedger) => {
    diaryLedgerRef.current = next
    setDiaryLedger(next)
    try {
      const merged = await petPlatform.saveDiary(next)
      diaryLedgerRef.current = merged
      setDiaryLedger(merged)
    } catch (error) {
      console.warn('[diary] save failed', error)
      setDiaryStatus({ state: 'error', message: error instanceof Error ? error.message : localized('保存日记失败', 'Failed to save diary') })
    }
  }

  // Short-term diary log: every chat turn (user + pet) is appended here as
  // raw text. The day's transcript stays on disk only until the seal step
  // runs, which summarises into `narrative` and then drops the raw turns.
  // This way the diary always reflects what actually got said today, not
  // just the curated event-memory ring buffer.
  const recordDiaryTurn = async (
    role: 'user' | 'pet',
    text: string,
    source: 'chat' | 'coding' = 'chat'
  ) => {
    const current = diaryLedgerRef.current
    if (!current) return
    const trimmed = text.trim()
    if (!trimmed) return
    const dateKey = formatDateKey(new Date())
    await commitDiaryLedger(appendDiaryRawTurn(current, dateKey, { role, text: trimmed, source }))
  }

  const tryRunDiaryRollup = async (options: { force?: boolean; useModel?: boolean } = {}) => {
    if (diaryRollupInFlightRef.current && !options.force) return
    const currentPet = petRef.current
    const currentLedger = diaryLedgerRef.current
    if (!currentPet || !currentLedger) return

    diaryRollupInFlightRef.current = true
    if (options.force) setDiaryStatus({ state: 'refreshing' })
    try {
      const previousEntry = currentLedger.entries[formatDateKey(new Date())]
      const { ledger: rolledLedger, entry, changed } = await runDiaryRollup(currentPet, currentLedger)
      let nextLedger = rolledLedger
      const now = Date.now()
      const useAutomaticModel = !options.useModel && changed && shouldAutoComposeDiaryNarrative(entry, previousEntry, now)
      const shouldUseModel = Boolean(options.useModel || useAutomaticModel)

      if (shouldUseModel) {
        if (useAutomaticModel && modelConfig?.enabled) {
          await maybeEnsureModelService(modelConfig).catch((error) => console.warn('[diary] model autostart failed', error))
        }
        const { narrative, source } = await composeDiaryNarrative(currentPet, entry, async (prompt) => {
          const reply = await generatePetReply(
            buildPetGenerationRequest({
              pet: currentPet,
              scene: {
                id: currentPet.memory.working.currentScene,
                action: 'talking',
                text: prompt,
                attentionMode: 'passive-visible'
              },
              reminderPhase,
              userInput: prompt,
              kind: 'summary',
              summaryTarget: 'daily'
            }),
            { text: '', action: 'talking' }
          )
          if (reply.source !== 'model') throw new Error('model unavailable')
          return reply.summary ?? reply.text
        })
        if (narrative) {
          const modelSucceeded = source === 'model'
          const enriched = {
            ...entry,
            narrative,
            narrativeSource: source,
            ...(modelSucceeded
              ? {
                  modelNarrativeAt: new Date(now).toISOString(),
                  modelNarrativeTurnCount: entry.rawTurns?.length ?? 0,
                  modelNarrativeImportantEvents: entry.conversation.importantEvents
                }
              : {})
          }
          nextLedger = upsertDiaryEntry(nextLedger, enriched)
        }
      }

      if (changed || options.force || shouldUseModel) {
        await commitDiaryLedger(nextLedger)
      }
      if (options.force) setDiaryStatus({ state: 'ready', message: currentPet.ui.language === 'en-US' ? 'Today’s diary was updated.' : '今天的日记已经更新' })
    } catch (error) {
      console.warn('[diary] rollup failed', error)
      if (options.force) setDiaryStatus({ state: 'error', message: error instanceof Error ? error.message : (currentPet.ui.language === 'en-US' ? 'Diary update failed' : '日记更新失败') })
    } finally {
      diaryRollupInFlightRef.current = false
    }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const raw = await petPlatform.loadDiary()
        const ledger = raw ? normalizeLedger(raw) : createDefaultDiaryLedger()
        if (cancelled) return
        diaryLedgerRef.current = ledger
        setDiaryLedger(ledger)
        if (ledger.config.activityTrackingEnabled) {
          // Resume sampler after relaunch. Best-effort: failure here just
          // means the next opt-in toggle will surface the error.
          await petPlatform.setActivityTracking(true).catch((error) => {
            console.warn('[diary] activity sampler resume failed', error)
          })
        }
      } catch (error) {
        console.warn('[diary] load failed', error)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  // Auto-rollup loop. Runs once shortly after diary loads, then on the
  // user-configured interval (default 60 minutes, minimum 10).
  useEffect(() => {
    if (!diaryLedger || !pet) return
    const intervalMinutes = Math.max(10, diaryLedger.config.todayRollupIntervalMinutes ?? 60)
    const startTimer = window.setTimeout(() => { void tryRunDiaryRollup() }, 8_000)
    const tick = window.setInterval(() => { void tryRunDiaryRollup() }, intervalMinutes * 60 * 1000)
    return () => {
      window.clearTimeout(startTimer)
      window.clearInterval(tick)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaryLedger?.config.todayRollupIntervalMinutes, Boolean(pet)])

  const handleRefreshDiaryToday = async () => {
    await tryRunDiaryRollup({ force: true, useModel: true })
  }

  const handleAddGitRepoPath = async (path: string) => {
    const current = diaryLedgerRef.current
    if (!current) return
    await commitDiaryLedger(addGitRepoPath(current, path))
  }

  const handleRemoveGitRepoPath = async (path: string) => {
    const current = diaryLedgerRef.current
    if (!current) return
    await commitDiaryLedger(removeGitRepoPath(current, path))
  }

  const handleToggleActivityTracking = async (enabled: boolean) => {
    const current = diaryLedgerRef.current
    if (!current) return
    try {
      await petPlatform.setActivityTracking(enabled)
    } catch (error) {
      console.warn('[diary] activity toggle failed', error)
      const message = error instanceof Error ? error.message : localized('未知错误', 'Unknown error')
      setDiaryStatus({ state: 'error', message: localized(`系统活跃追踪开启失败：${message}`, `System activity tracking failed to start: ${message}`) })
      return
    }
    await commitDiaryLedger(setDiaryConfig(current, { activityTrackingEnabled: enabled }))
  }

  const handleDiaryDateSelect = (dateKey: string) => {
    setDiarySelectedDate(dateKey)
  }

  const handleSealDiaryDate = async (dateKey: string) => {
    const current = diaryLedgerRef.current
    if (!current) return
    await commitDiaryLedger(sealDiaryEntry(current, dateKey))
  }

  const handleAppendDiaryNote = async (dateKey: string, note: string) => {
    const current = diaryLedgerRef.current
    if (!current) return
    const existing = current.entries[dateKey]
    if (!existing) return
    // userNote is the only field allowed to mutate sealed entries; we re-use
    // upsertDiaryEntry so the sealed-entry branch handles the carve-out.
    await commitDiaryLedger(
      upsertDiaryEntry(current, { ...existing, userNote: note.slice(0, 400) })
    )
  }

  // Fired exactly once per stage transition (excluding the initial hatch
  // baby->egg, which already has its own ceremony in handleHatchPet). Renders
  // a commemorative growth card and surfaces it through the same share-card
  // status panel so the user can re-export or open it in Finder.
  const runStageGrowthCelebration = async (
    previousStage: PetData['state']['stage'],
    nextStage: PetData['state']['stage']
  ) => {
    if (isCelebratingStageRef.current) return
    const currentPet = petRef.current
    if (!currentPet || !achievementEnvelope || !economyEnvelope || !homeEnvelope) return

    isCelebratingStageRef.current = true
    setShareCardStatus({ state: 'exporting', kind: 'growth', stage: nextStage })

    const growthLanguage = currentPet.ui.language ?? 'zh-CN'
    const growthEnglish = growthLanguage === 'en-US'
    const stageLabel = formatStage(nextStage, growthLanguage)
    const previousLabel = formatStage(previousStage, growthLanguage)
    const petName = currentPet.memory.profile.petName?.trim() || currentPet.personality.name || (growthEnglish ? 'it' : '它')
    const eyebrow = growthEnglish ? `Growth journal · Day ${currentPet.state.ageDays + 1}` : `成长记 · 第 ${currentPet.state.ageDays + 1} 天`
    const headline = growthEnglish ? `${petName} · Grew into ${stageLabel}` : `${petName} · 长成${stageLabel}了`

    try {
      const blob = await renderShareCardBlob({
        pet: currentPet,
        achievements: achievementEnvelope.data,
        economy: economyEnvelope.data,
        home: homeEnvelope.data,
        eyebrow,
        headline
      })
      const bytes = await blobToUint8Array(blob)
      const savedPath = await petPlatform.saveShareCard(bytes, 'growth-card-')
      const clipboardCopied = await tryWriteImageToClipboard(blob)
      const fileName = savedPath.split(/[\\/]/).pop() ?? 'growth-card.png'

      setShareCardStatus({
        state: 'ready',
        savedPath,
        fileName,
        clipboardCopied,
        message: clipboardCopied
          ? (growthEnglish
              ? `${stageLabel} growth card was saved locally and copied to the clipboard.`
              : `${stageLabel}的成长卡已存到本地，也复制到了剪贴板。`)
          : (growthEnglish
              ? `${stageLabel} growth card was saved locally.`
              : `${stageLabel}的成长卡已存到本地。`),
        kind: 'growth',
        stage: nextStage
      })

      showBubble(
        growthEnglish
          ? `${petName} grew from ${previousLabel} to ${stageLabel}. I quietly saved a growth card for you.`
          : `${petName}从${previousLabel}长成${stageLabel}啦，刚才悄悄给你存了一张成长卡。`,
        true
      )
      playAction('happy', false)

      // Stamp the relationship memory so other surfaces (analytics, audit,
      // future timeline UI) can answer "when did the pet last grow up".
      const nowIso = new Date().toISOString()
      await syncPet({
        ...currentPet,
        memory: {
          ...currentPet.memory,
          relationship: {
            ...currentPet.memory.relationship,
            lastGrowthAt: nowIso
          }
        }
      })

      await persistAudit(createAuditEntry({
        actor: 'system',
        domain: 'achievements',
        action: 'growth.stageAdvance',
        summary: growthEnglish ? `${petName} advanced from ${previousLabel} to ${stageLabel}` : `${petName} 从 ${previousLabel} 进入 ${stageLabel}`,
        metadata: { previousStage, nextStage, savedPath, clipboardCopied, ageDays: currentPet.state.ageDays }
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : (growthEnglish ? 'Unknown error' : '未知错误')
      setShareCardStatus({
        state: 'error',
        message: growthEnglish ? `Growth card save failed: ${message}` : `成长卡保存失败：${message}`,
        kind: 'growth',
        stage: nextStage
      })
      showBubble(growthEnglish ? `${petName} grew up, but the growth card was not saved this time: ${message}` : `${petName}长大了，但成长卡这次没存上：${message}`, true)
    } finally {
      isCelebratingStageRef.current = false
    }
  }

  useEffect(() => {
    const stage = pet?.state.stage
    if (!stage) return

    const previous = lastObservedStageRef.current
    lastObservedStageRef.current = stage

    // First pet load doesn't count as a transition -- otherwise relaunching
    // an already-grown pet would replay the celebration on every boot.
    if (previous === undefined) return
    if (previous === stage) return

    // Egg -> baby is the hatch ceremony, which already plays its own bubble +
    // happy animation in handleHatchPet. Skip so we don't double-fire.
    if (previous === 'egg' && stage === 'baby') return
    if (stage === 'egg') return

    void runStageGrowthCelebration(previous, stage)
    // The celebration handler reads several envelopes/refs imperatively, so
    // we deliberately don't list them as deps -- adding them would re-fire
    // the celebration whenever achievements/economy/home update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet?.state.stage])

  const handlePomodoro = async () => {
    const endsAt = new Date(Date.now() + 25 * 60_000).toISOString()
    await runTrackedTool({ name: 'pomodoro.start', input: { endsAt } }, {
      domain: 'tools',
      summary: localized('启动了 25 分钟番茄钟', 'Started a 25-minute Pomodoro'),
      metadata: {
        endsAt
      },
      touchToolId: 'pomodoro.start',
      run: async () => {
        await createReminderFromInput({ title: localized('番茄钟结束，起来活动一下', 'Pomodoro finished. Stand up and move a little.'), scheduledAt: endsAt })
      }
    })
  }

  const handleOracleDraw = async (deckId: string) => {
    if (!oracleEnvelope) return
    const deck = ORACLE_DECKS.find((item) => item.id === deckId)
    if (!deck) return
    const currentPet = petRef.current
    if (!currentPet) return

    await runTrackedTool({ name: 'oracle.draw', input: { deckId } }, {
      domain: 'oracle',
      summary: localized(`抽取了 ${deck.title}`, `Drew ${deck.titleEn}`),
      metadata: {
        deckId
      },
      touchToolId: 'oracle.draw',
      run: async () => {
        // The deck preset acts as both the LLM seed (so the reading stays on
        // theme) and the offline fallback. generateOracleReading degrades to
        // the seed if the model is unavailable, so this never blocks the UI.
        const reading = await generateOracleReading(currentPet, deck, {
          historyCount: oracleEnvelope.data.history.length
        })
        const nextOracle = updateEnvelope(oracleEnvelope, {
          history: [
            {
              id: `oracle-${Date.now()}`,
              deckId,
              title: localized(deck.title, deck.titleEn),
              createdAt: new Date().toISOString(),
              summary: reading.text
            },
            ...oracleEnvelope.data.history
          ].slice(0, 20)
        })
        await saveEnvelope('oracle', nextOracle, setOracleEnvelope)
        showBubble(reading.text, true)
      }
    })
  }

  const handleCompleteReminder = async (id: string) => {
    const current = petRef.current
    const completedReminder = reminders.find((item) => item.id === id) ?? activeReminder
    const success = await completeReminder(id)
    if (!success) return
    const nextReminders = reminders.map<ReminderItem>((item) => (item.id === id ? { ...item, status: 'done', snoozeUntil: undefined } : item))
    setReminders(nextReminders)
    setActiveReminder(null)
    setReminderPhase('done')
    if (current) {
      const rewarded = await syncPetWithScene(recordReminderOutcome(current, 'done'), 'reminder-done')
      if (economyEnvelope) {
        const nextEconomy = addPendingReward(economyEnvelope, {
          id: `reminder-done-${Date.now()}`,
          kind: 'gift',
          amount: 6,
          createdAt: new Date().toISOString(),
          note: localized(`完成提醒：${completedReminder?.title ?? '提醒事项'}`, `Completed reminder: ${completedReminder?.title ?? 'Reminder'}`)
        })
        await saveEnvelope('economy', nextEconomy, setEconomyEnvelope)
      }
      const nextReminder = getNearestPendingReminder(nextReminders)
      await applyScenePresentation(rewarded, 'done', {
        activeReminderTitle: completedReminder?.title,
        activeReminderIntensity: normalizeReminderIntensity(completedReminder?.intensity),
        nearestReminderAt: nextReminder ? (nextReminder.snoozeUntil ?? nextReminder.scheduledAt) : null,
        nearestReminderIntensity: normalizeReminderIntensity(nextReminder?.intensity)
      })
      await reconcileDomainProgress(rewarded)
    }
  }

  const handleSnoozeReminder = async (id: string) => {
    const current = petRef.current
    const snoozeMinutes = current ? getReminderSnoozeMinutes(current) : 5
    const next = await snoozeReminder(id, snoozeMinutes)
    if (!next) return
    const nextReminders = reminders.map((item) => (item.id === id ? next : item))
    setReminders(nextReminders)
    setActiveReminder(null)
    const nextPhase = getReminderPhase(nextReminders, null, Date.now())
    setReminderPhase(nextPhase)
    if (current) {
      const rewarded = await syncPetWithScene(recordReminderOutcome(current, 'snooze'), 'reminder-soon')
      const nextPendingReminder = getNearestPendingReminder(nextReminders)
      await applyScenePresentation(rewarded, nextPhase, {
        interactionType: 'idle',
        recentInteraction,
        activeReminderTitle: next.title,
        activeReminderIntensity: normalizeReminderIntensity(next.intensity),
        nearestReminderAt: nextPendingReminder ? (nextPendingReminder.snoozeUntil ?? nextPendingReminder.scheduledAt) : null,
        nearestReminderIntensity: normalizeReminderIntensity(nextPendingReminder?.intensity),
        triggerKind: 'scene-refresh'
      })
      return
    }
    showBubble(localized(`那我 ${snoozeMinutes} 分钟后再提醒你：${next.title}`, `I will remind you again in ${snoozeMinutes} minute${snoozeMinutes === 1 ? '' : 's'}: ${next.title}`))
    playAction('talking', false)
  }

  useEffect(() => {
    const current = petRef.current
    if (!current) return
    void savePet(current)
  }, [pet])

  const getCurrentCutoutPlacementStorageKey = (current: PetData) => {
    const species = current.memory.profile.chosenSpecies ?? current.personality.species
    return createCutoutPlacementStorageKey(
      species,
      current.state.stage,
      current.ui.speciesVariantBySpecies?.[species]
    )
  }

  const saveCutoutPlacements = (placements: PetCutoutPlacement[]) => {
    const current = petRef.current
    if (!current) return
    const storageKey = getCurrentCutoutPlacementStorageKey(current)
    const next = updatePet((petData) => ({
      ...petData,
      ui: {
        ...petData.ui,
        cutoutPlacementsByAppearance: {
          ...(petData.ui.cutoutPlacementsByAppearance ?? {}),
          [storageKey]: placements
        }
      }
    }))
    void commitPet(next)
  }

  const applyCutoutPlacements = (next: PetCutoutPlacement[], persist: 'debounced' | 'immediate') => {
    const normalized = normalizeVisibleCutoutPlacements(next)
    setCutoutPlacements(normalized)
    setAppliedCutoutPlacements(normalized)

    const current = petRef.current
    if (current) {
      const channel = new BroadcastChannel(CUTOUT_PLACEMENT_PREVIEW_CHANNEL)
      channel.postMessage({ key: getCurrentCutoutPlacementStorageKey(current), placements: normalized } satisfies CutoutPlacementPreviewMessage)
      channel.close()
    }

    if (cutoutPlacementSaveTimerRef.current) {
      window.clearTimeout(cutoutPlacementSaveTimerRef.current)
      cutoutPlacementSaveTimerRef.current = null
    }

    if (persist === 'immediate') {
      saveCutoutPlacements(normalized)
      return
    }

    cutoutPlacementSaveTimerRef.current = window.setTimeout(() => {
      cutoutPlacementSaveTimerRef.current = null
      saveCutoutPlacements(normalized)
    }, 160)
  }

  const isPanelWindow = currentWindowLabel === PANEL_WINDOW_LABEL
  const isPetWindow = currentWindowLabel === PET_WINDOW_LABEL
  const panelVisible = isPanelWindow || pet?.ui.panelOpen

  const petWindowProps = pet ? {
    pet,
    bubble,
    action,
    visualState,
    paletteStyle,
    draft,
    chatLoading,
    hoverChatVisible,
    hoverChatExpanded,
    showMeshDebug,
    showAlignmentEditor,
    rendererMode,
    currentAppearanceAsset,
    appearanceVariantKey: currentSpeciesVariantKey,
    appearanceResetKey: appearanceRefreshKey,
    cutoutPlacements,
    appliedCutoutPlacements,
    dockLeanDirection,
    dockLeanAmount,
    shouldShowFloatingBubble,
    shouldShowFocusPill,
    floatingWindowAnchorStyle,
    petStageStyle,
    teleportEffectKey,
    petStageRef,
    petAnchorRef,
    stickerId: activeStickerId,
    headCue: petFloatingHeadCue,
    wardrobeOverlays,
    careTray: {
      snackInventoryCount,
      ghost: careTrayDrag,
      onAction: performCareTrayAction,
      onDragStart: handleCareTrayDragStart,
      onDragMove: handleCareTrayDragMove,
      onDragEnd: handleCareTrayDragEnd
    },
    onStickerExpire: () => setActiveStickerId(undefined),
    onPet: handlePetDoubleClick,
    onTogglePanel: handleTogglePanel,
    onPetDragStart: handlePetDragStart,
    onDockHoverChange: handleDockHoverChange,
    onDraftChange: setDraft,
    onSubmit: (event: FormEvent<HTMLFormElement>) => void handleSubmit(event),
    onExpand: handleHoverChatExpand,
    onCollapse: handleHoverChatCollapse
  } : null

  const panelWindowProps = pet ? {
    pet,
    isPanelWindow,
    panelVisible: Boolean(panelVisible),
    bubble,
    bubbleVisible,
    action,
    visualState,
    headCue,
    paletteStyle,
    currentAppearanceLabel: resolveAppearanceLabel(pet.memory.profile.chosenSpecies ?? pet.personality.species, pet.ui.language ?? 'zh-CN'),
    draft,
    chatLoading,
    hoverChatVisible,
    hoverChatExpanded,
    reminderTitle,
    reminderTime,
    reminderIntensity,
    activeReminder,
    pendingReminders,
    rendererMode,
    showMeshDebug,
    showAlignmentEditor,
    currentAppearanceAsset,
    appliedCutoutPlacements,
    cutoutPlacements,
    dockLeanDirection,
    dockLeanAmount,
    modelDraft,
    modelHealth,
    lastReplySource,
    modelSaving,
    modelConfigMessage,
    screenAwarenessStatus,
    hasModelDraftChanges,
    inventoryState,
    economyState,
    homeState,
    jobState,
    achievementState,
    oracleState,
    auditState,
    toolState: ensureToolEnvelope().data,
    formatStage,
    formatWorkingMode,
    formatAttentionMode,
    formatReminderTime,
    getCompanionPresenceText,
    getReminderSnoozeMinutes,
    onboardingStep,
    onboardingProgress,
    aiSetupReady,
    brainSetupHint,
    importedPetLoadStatus,
    userPetImageImportStatus,
    onCreateUserPetFromImage: handleCreateUserPetFromImage,
    onOpenUserPetDir: async () => {
      try {
        await petPlatform.openUserPetDir()
        await refreshImportedPetPackages()
      } catch (error) {
        console.warn('[petdex] open dir failed', error)
        setImportedPetLoadStatus({ state: 'error', count: importedSpeciesOptions.length, message: localized('打开本地宠物文件夹失败', 'Failed to open local pet folder') })
      }
    },
    onRescanUserPetPackages: refreshImportedPetPackages,
    onAdvanceOnboarding: handleAdvanceOnboarding,
    onSelectOnboardingStep: handleOnboardingStepSelect,
    onLanguageChange: handleLanguageChange,
    onCompanionTabChange: handleCompanionTabChange,
    paletteOptions,
    speciesOptions: combinedSpeciesOptions,
    onPet: handlePetDoubleClick,
    onTogglePanel: handleTogglePanel,
    onPetDragStart: handlePetDragStart,
    onDockHoverChange: handleDockHoverChange,
    onDraftChange: setDraft,
    onSubmit: (event: FormEvent<HTMLFormElement>) => void handleSubmit(event),
    onExpand: handleHoverChatExpand,
    onCollapse: handleHoverChatCollapse,
    onClosePanel: () => updatePanelState(false),
    onToggleMemoryEditor: handleMemoryEditorToggle,
    onProfileFieldChange: handleProfileField,
    onSpeciesChange: handleSpeciesChange,
    onPaletteChange: handlePaletteChange,
    onGenderChange: handleGenderChange,
    onHatchPet: handleHatchPet,
    onReminderTitleChange: setReminderTitle,
    onReminderTimeChange: setReminderTime,
    onReminderIntensityChange: setReminderIntensity,
    onReminderSubmit: (event: FormEvent<HTMLFormElement>) => void handleReminderSubmit(event),
    onCompleteReminder: handleCompleteReminder,
    onSnoozeReminder: handleSnoozeReminder,
    onWardrobeSelect: handleWardrobeSelect,
    onWardrobeUnequip: handleWardrobeUnequip,
    // A6: open the user wardrobe dir + rescan for fresh PNGs. We pop the
    // file manager *and* refresh the asset map in one motion so the user
    // can drop an image in, click "查看自定义素材", drop the image, click
    // again, and see it apply — without restarting the app.
    onOpenUserWardrobeDir: async () => {
      try {
        await petPlatform.openUserWardrobeDir()
        const entries = await petPlatform.listUserWardrobeAssets()
        setUserWardrobeAssets(new Map(entries))
      } catch (error) {
        console.warn('[wardrobe] open dir failed', error)
      }
    },
    onPreviewWardrobePlacement: handlePreviewWardrobePlacement,
    onUpdateWardrobePlacement: handleUpdateWardrobePlacement,
    onResetWardrobePlacement: handleResetWardrobePlacement,
    wardrobeOverlays,
    onExportAll: handleExportAll,
    onClearMemories: handleClearMemories,
    onRemovePreference: handleRemovePreference,
    onRemoveFactRecord: handleRemoveFactRecord,
    onRemoveFactKey: handleRemoveFactKey,
    onToggleFactKeyTracking: handleToggleFactKeyTracking,
    onClaimRewards: handleClaimRewards,
    onDrawWardrobe: handleDrawWardrobe,
    onUseInventoryItem: handleUseInventoryItem,
    onStartJob: handleStartJob,
    onSwitchJob: handleSwitchJob,
    onCancelJob: handleCancelJob,
    onClaimJob: handleClaimJob,
    onExportAchievementCard: handleExportAchievementCard,
    onRevealShareCard: handleRevealShareCard,
    shareCardStatus,
    onConsolidateWeeklyMemory: handleConsolidateWeeklyMemory,
    weeklySummaryStatus,
    diaryEntries: diaryLedger ? listEntriesNewestFirst(diaryLedger) : [],
    diaryConfig: diaryLedger ? diaryLedger.config : null,
    diarySelectedDate,
    diaryStatus,
    onDiarySelectDate: handleDiaryDateSelect,
    onRefreshDiaryToday: handleRefreshDiaryToday,
    onSealDiaryDate: handleSealDiaryDate,
    onAppendDiaryNote: handleAppendDiaryNote,
    onAddGitRepoPath: handleAddGitRepoPath,
    onRemoveGitRepoPath: handleRemoveGitRepoPath,
    onToggleActivityTracking: handleToggleActivityTracking,
    onPomodoroStart: handlePomodoro,
    onDrawOracle: handleOracleDraw,
    onToggleSystemMode: handleSystemModeToggle,
    onToggleRendererMode: () => setRendererMode((current) => current === 'mesh' ? 'cutout' : 'mesh'),
    onToggleAlignmentEditor: () => {
      setShowAlignmentEditor((current) => {
        if (current) applyCutoutPlacements(cutoutPlacements, 'immediate')
        return !current
      })
    },
    onToggleMeshDebug: () => setShowMeshDebug((current) => !current),
    onCutoutPlacementsChange: (next: PetCutoutPlacement[]) => applyCutoutPlacements(next, 'debounced'),
    onResetCutoutPlacements: () => {
      const current = petRef.current
      const normalizedDefaults = createDefaultVisiblePlacementsForAppearance(
        current?.memory.profile.chosenSpecies ?? current?.personality.species ?? 'puppy',
        current?.state.stage ?? 'egg'
      )
      applyCutoutPlacements(normalizedDefaults, 'immediate')
    },
    onModelDraftEnabledChange: (enabled: boolean) => {
      setModelDraft((current) => (current ? { ...current, enabled } : current))
      setModelConfigMessage('')
    },
    onModelDraftEndpointChange: (value: string) => {
      setModelDraft((current) => (current ? { ...current, endpoint: value } : current))
      setModelConfigMessage('')
    },
    onModelDraftNameChange: (value: string) => {
      setModelDraft((current) => (current ? { ...current, model: value } : current))
      setModelConfigMessage('')
    },
    onModelDraftTimeoutChange: (value: number) => {
      setModelDraft((current) => (current ? { ...current, timeoutMs: Number.isFinite(value) ? value : current.timeoutMs } : current))
      setModelConfigMessage('')
    },
    onSaveModelConfig: handleSaveModelConfig,
    onCaptureScreenAwareness: handleCaptureScreenAwareness,
    onResetModelDraft: handleResetModelDraft
  } : null

  return {
    pet,
    isPetWindow,
    petWindowProps,
    panelWindowProps
  }
}
