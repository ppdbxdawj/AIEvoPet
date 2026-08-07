/**
 * Sticker registry + selector. Phase A keeps it deterministic on purpose:
 * a trigger comes in, we filter the manifest to entries matching that
 * trigger, drop anything in cooldown or recently shown, then weighted-
 * random pick. The LLM does not see this layer in Phase A — it can only
 * indirectly cause stickers via existing scenes (reminder-alert, morning
 * companion arc) so we can debug the pipeline in isolation.
 *
 * Persistence story: the recently-shown list lives on
 * `pet.ui.system.stickerHistory` and survives restarts. That's enough to
 * keep the morning sticker fresh across sessions and to throttle reminder
 * stickers without growing the JSON unboundedly.
 */

import { BUNDLED_STICKERS, BUNDLED_STICKERS_BY_ID } from '../assets/stickers/manifest'
import {
  STICKER_HISTORY_LIMIT,
  type PetSticker,
  type PetStickerHistory,
  type PetStickerSelectionContext,
  type PetStickerTrigger
} from '../types/sticker'

const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 6h

const matchesTrigger = (sticker: PetSticker, trigger: PetStickerTrigger): boolean => {
  return sticker.triggers.some((entry) => {
    if (entry.kind !== trigger.kind) return false
    switch (entry.kind) {
      case 'greeting':
        return trigger.kind === 'greeting' && entry.period === trigger.period
      case 'reminder':
        return trigger.kind === 'reminder' && entry.phase === trigger.phase
      case 'state':
        return trigger.kind === 'state' && entry.cue === trigger.cue
      case 'growth':
        return trigger.kind === 'growth' && entry.stage === trigger.stage
      case 'comfort':
        return trigger.kind === 'comfort' && entry.topic === trigger.topic
      case 'celebrate':
        return trigger.kind === 'celebrate' && entry.topic === trigger.topic
      case 'tag':
        return trigger.kind === 'tag' && entry.tag === trigger.tag
      default:
        return false
    }
  })
}

// Cooldown is checked against the last time *this specific id* was shown.
// We only look back as far as the persisted history window (default 8) —
// that's plenty given DEFAULT_COOLDOWN_MS = 6h.
const isInCooldown = (sticker: PetSticker, history: PetStickerHistory | undefined, now: number): boolean => {
  const cooldownMs = sticker.cooldownMs ?? DEFAULT_COOLDOWN_MS
  if (cooldownMs <= 0) return false
  if (!history?.entries.length) return false
  const lastShown = history.entries
    .filter((entry) => entry.id === sticker.id)
    .map((entry) => Date.parse(entry.shownAt))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => b - a)[0]
  if (!lastShown) return false
  return now - lastShown < cooldownMs
}

const weightedPick = (candidates: PetSticker[]): PetSticker | null => {
  if (!candidates.length) return null
  const totalWeight = candidates.reduce((sum, s) => sum + Math.max(0, s.weight ?? 1), 0)
  if (totalWeight <= 0) return candidates[0] ?? null
  const roll = Math.random() * totalWeight
  let acc = 0
  for (const sticker of candidates) {
    acc += Math.max(0, sticker.weight ?? 1)
    if (roll < acc) return sticker
  }
  return candidates[candidates.length - 1] ?? null
}

export const pickSticker = (
  context: PetStickerSelectionContext,
  history?: PetStickerHistory,
  manifest: PetSticker[] = BUNDLED_STICKERS
): PetSticker | null => {
  const now = context.now ?? Date.now()
  const excludeIds = new Set(context.excludeIds ?? [])
  // Always exclude the most recent sticker regardless of bucket — same image
  // back-to-back kills the magic faster than anything.
  if (history?.entries.length) {
    excludeIds.add(history.entries[history.entries.length - 1].id)
  }
  const candidates = manifest.filter((sticker) =>
    matchesTrigger(sticker, context.trigger) &&
    !excludeIds.has(sticker.id) &&
    !isInCooldown(sticker, history, now)
  )

  if (candidates.length) return weightedPick(candidates)

  // Fallback: ignore cooldown so we always show *something* once any
  // matching sticker exists. Without this the very first reminder of the
  // day after install would hit cooldown logic with empty history and
  // pick nothing in some edge cases.
  const relaxed = manifest.filter((sticker) => matchesTrigger(sticker, context.trigger) && !excludeIds.has(sticker.id))
  return weightedPick(relaxed)
}

// Returns a *new* history with the sticker recorded. Pure; the caller is
// responsible for committing back to PetData.
export const recordStickerShown = (
  history: PetStickerHistory | undefined,
  sticker: PetSticker,
  context: { now?: number; trigger: PetStickerTrigger }
): PetStickerHistory => {
  const now = context.now ?? Date.now()
  const base: PetStickerHistory = history ?? { entries: [] }
  const nextEntries = [...base.entries, { id: sticker.id, shownAt: new Date(now).toISOString(), triggerKind: context.trigger.kind }]
  // Keep only the latest STICKER_HISTORY_LIMIT entries.
  const trimmed = nextEntries.length > STICKER_HISTORY_LIMIT
    ? nextEntries.slice(nextEntries.length - STICKER_HISTORY_LIMIT)
    : nextEntries

  return {
    ...base,
    entries: trimmed
  }
}

// Helper for the renderer when it has only an id from PetShowState.
export const getStickerById = (id: string): PetSticker | undefined => BUNDLED_STICKERS_BY_ID[id]

// Local YYYY-MM-DD bucket key for "fired today" gating. Kept in this module
// so the morning-greeting trigger callsite has one canonical implementation.
export const localDateKey = (date = new Date()): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const isMorningHours = (date = new Date()): boolean => {
  const hours = date.getHours()
  // 5am..11am inclusive — the "morning" bucket consistent with
  // PetTimePeriod 'morning'. After 11 we drop into noon and the morning
  // sticker stops firing for the day.
  return hours >= 5 && hours < 12
}
