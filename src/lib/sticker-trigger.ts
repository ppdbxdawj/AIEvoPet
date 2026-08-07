/**
 * Phase A trigger helpers. The controller uses these so the "should we
 * fire a sticker right now?" gating + bookkeeping all live in one tested
 * module instead of being inlined into the giant orchestrator.
 *
 * Each helper is pure: it takes the pet, computes whether a sticker
 * should fire, and returns both the picked sticker (if any) and the
 * mutated pet (so the caller can syncPet + setShowState in one shot).
 */

import { isMorningHours, localDateKey, pickSticker, recordStickerShown } from './sticker-registry'
import type { PetData } from '../types/pet'
import type { PetSticker, PetStickerHistory, PetStickerTrigger } from '../types/sticker'

const ensureHistory = (pet: PetData): PetStickerHistory => pet.ui.system.stickerHistory ?? { entries: [] }

const writeHistory = (pet: PetData, history: PetStickerHistory): PetData => ({
  ...pet,
  ui: {
    ...pet.ui,
    system: {
      ...pet.ui.system,
      stickerHistory: history
    }
  }
})

interface FireResult {
  sticker?: PetSticker
  pet: PetData
}

/**
 * Fires the morning greeting sticker at most once per local day, and
 * only during morning hours (5am-12pm). The "today" gate persists via
 * stickerHistory.lastMorningGreetingAt so reopens of the panel mid-day
 * don't re-trigger.
 */
export const fireMorningStickerIfDue = (pet: PetData, options: { now?: number } = {}): FireResult => {
  const now = options.now ?? Date.now()
  const date = new Date(now)
  if (!isMorningHours(date)) return { pet }
  const history = ensureHistory(pet)
  const today = localDateKey(date)
  if (history.lastMorningGreetingAt === today) return { pet }
  const trigger: PetStickerTrigger = { kind: 'greeting', period: 'morning' }
  const sticker = pickSticker({ trigger, now }, history)
  if (!sticker) {
    // Even if no sticker matched, persist that we tried today so we
    // don't churn through pickSticker on every panel open. Cheap and
    // keeps logs clean.
    return { pet: writeHistory(pet, { ...history, lastMorningGreetingAt: today }) }
  }
  const nextHistory: PetStickerHistory = {
    ...recordStickerShown(history, sticker, { trigger, now }),
    lastMorningGreetingAt: today
  }
  return { sticker, pet: writeHistory(pet, nextHistory) }
}

/**
 * Fires a reminder-due sticker. Caller decides timing — typically right
 * after the reminder-alert scene mounts. Cooldown lives in the manifest
 * so two reminders 10 minutes apart still both get a (different) sticker.
 */
export const fireReminderSticker = (pet: PetData, options: { now?: number } = {}): FireResult => {
  const now = options.now ?? Date.now()
  const history = ensureHistory(pet)
  const trigger: PetStickerTrigger = { kind: 'reminder', phase: 'alert' }
  const sticker = pickSticker({ trigger, now }, history)
  if (!sticker) return { pet }
  const nextHistory = recordStickerShown(history, sticker, { trigger, now })
  return { sticker, pet: writeHistory(pet, nextHistory) }
}

/**
 * B5: relationship-stage milestone sticker. Fires when the inferred stage
 * crosses a threshold (e.g. 'warming-up' → 'friend'). The controller
 * detects the transition by comparing prev/next pet snapshots and only
 * calls this on the *upgrade* edge — demotions never reach here. Manifest
 * has a 'celebrate' family with topic='milestone' that this hooks into.
 */
export const fireRelationshipMilestoneSticker = (pet: PetData, options: { now?: number } = {}): FireResult => {
  const now = options.now ?? Date.now()
  const history = ensureHistory(pet)
  const trigger: PetStickerTrigger = { kind: 'celebrate', topic: 'milestone' }
  const sticker = pickSticker({ trigger, now }, history)
  if (!sticker) return { pet }
  const nextHistory = recordStickerShown(history, sticker, { trigger, now })
  return { sticker, pet: writeHistory(pet, nextHistory) }
}
