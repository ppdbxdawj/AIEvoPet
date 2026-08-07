/**
 * Sticker types. Stickers are pre-rendered PNG (or SVG placeholder) reactions
 * that the pet "holds up" at specific moments — morning hello, reminder due,
 * milestone, etc. They never replace the procedural sprite; they layer on
 * top via the existing PetShowState.overlay pipeline.
 *
 * Why types live in a dedicated file:
 *   - Manifest data + selector + renderer all need this shape, splitting
 *     across pet.ts would couple unrelated concerns.
 *   - We want zero-friction "add a sticker = add a JSON entry + drop a
 *     PNG into src/assets/stickers/", and a focused type file makes that
 *     contract obvious to anyone editing the manifest.
 */

export type PetStickerMood =
  | 'happy'
  | 'cozy'
  | 'shy'
  | 'concerned'
  | 'sleepy'
  | 'excited'
  | 'tender'

export type PetStickerGreetingPeriod = 'morning' | 'noon' | 'evening' | 'late-night'

// Reminder phase mapped from the existing PetReminderPhase. Restricted to
// the phases where a sticker actually adds value (alert / done) — soon and
// none would feel intrusive given they fire on a cadence.
export type PetStickerReminderPhase = 'soon' | 'alert' | 'done'

export type PetStickerStateCue = 'hungry' | 'sleepy' | 'lonely' | 'low-mood' | 'high-mood'
export type PetStickerGrowthStage = 'baby' | 'child' | 'adult' | 'elder'
export type PetStickerComfortTopic = 'sad' | 'tired' | 'angry'
export type PetStickerCelebrateTopic = 'milestone' | 'anniversary' | 'birthday'

// Discriminated union so adding a new trigger family is a one-liner change.
// Phase A only ships greeting + reminder, but the union is fully typed
// upfront so downstream code stays exhaustive.
export type PetStickerTrigger =
  | { kind: 'greeting'; period: PetStickerGreetingPeriod }
  | { kind: 'reminder'; phase: PetStickerReminderPhase }
  | { kind: 'state'; cue: PetStickerStateCue }
  | { kind: 'growth'; stage: PetStickerGrowthStage }
  | { kind: 'comfort'; topic: PetStickerComfortTopic }
  | { kind: 'celebrate'; topic: PetStickerCelebrateTopic }
  | { kind: 'tag'; tag: string }

export interface PetSticker {
  id: string
  // Bundle-relative path. Phase A keeps assets inside src/assets/stickers
  // so Vite handles them. The user-supplied directory pathway lives in
  // PetStickerExternalSource (Phase C).
  src: string
  triggers: PetStickerTrigger[]
  mood: PetStickerMood
  // Optional caption rendered beneath the sticker. Keep it short -- design
  // intent is "expression first, words second".
  caption?: string
  // Higher = more likely to be picked when several stickers match.
  // Defaults to 1.
  weight?: number
  // Per-sticker cooldown so the same image doesn't loop. Selector enforces
  // this against pet.ui.system.stickerHistory.
  cooldownMs?: number
  // Optional alt text for screen readers + tooltips.
  alt?: string
}

// Sticker selection context. The selector takes one of these and walks the
// manifest looking for matching triggers.
export interface PetStickerSelectionContext {
  trigger: PetStickerTrigger
  mood?: PetStickerMood
  excludeIds?: string[]
  now?: number
}

// Recently-shown bookkeeping. Persisted on pet.ui.system so cross-restart
// dedup works. We keep the last N entries (not last-shown timestamp per
// sticker) because that's enough for "don't repeat right away" without
// growing unbounded.
export interface PetStickerHistoryEntry {
  id: string
  // ISO timestamp the sticker was shown.
  shownAt: string
  // Trigger kind for inspection / future analytics. Stored as string to
  // keep the persistence layer stable when we add new trigger kinds.
  triggerKind: string
}

export interface PetStickerHistory {
  entries: PetStickerHistoryEntry[]
  // Optional last morning-greeting date (YYYY-MM-DD local) so the morning
  // sticker only fires once per day even if the user reopens the panel
  // many times.
  lastMorningGreetingAt?: string
}

export const STICKER_HISTORY_LIMIT = 8
