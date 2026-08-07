// Wardrobe type definitions. Wardrobe items are deliberately decoupled from
// any specific pet species / IP — the same crown PNG renders on a pig, a dog
// and a cat with separate per-species placements.
//
// The data model has three layers:
//   1. WardrobeItem     — static metadata (id, asset url, mood, price). Lives in manifest.ts.
//   2. WardrobePlacement — per-species offset/scale/rotate, stored under
//                          pet.ui.wardrobePlacements[species][itemId].
//   3. WardrobeUnlocked  — per-pet inventory of which itemIds the user has paid
//                          for. Lives on pet.ui.wardrobeUnlocked (already exists).

export type WardrobeCategory = 'hat' | 'glasses' | 'mouth' | 'neck' | 'back' | 'hand' | 'special'

// Slot describes "where on the pet body this item naturally belongs". The
// alignment editor uses this as the initial nudge direction (e.g. hat slot
// items default to a small upward y-offset hint), but the user can always
// drag anywhere — slot is a soft hint, not a hard constraint.
export type WardrobeSlot =
  | 'head-top'   // crown, hat, headband
  | 'face'       // glasses, eyepatch
  | 'mouth'      // lollipop, leaf, mustache
  | 'neck'       // scarf, bowtie, collar
  | 'chest'      // bib (some neck items render closer to chest)
  | 'back'       // wings, cape, backpack
  | 'hand'       // mug, balloon, fishing rod
  | 'floating'   // floating special effects (zzz, sparkle, raindrops)

// Mood tags drive LLM-based selection: when the pet is e.g. focus-mode and
// the user asks for a wardrobe surprise, the shop filters the pool to items
// tagged 'focus' before letting the LLM pick.
export type WardrobeMoodTag =
  | 'cozy'
  | 'playful'
  | 'quiet'
  | 'focus'
  | 'sweet'
  | 'cool'
  | 'mystic'
  | 'celebrate'
  | 'melancholy'

import type { PetLanguage } from './pet'

export type WardrobePriceBand = 'low' | 'mid' | 'high'

export interface WardrobeItem {
  id: string
  nameZh: string
  nameEn?: string
  category: WardrobeCategory
  slot: WardrobeSlot
  moodTags: WardrobeMoodTag[]
  priceBand: WardrobePriceBand
  price: number
  // Asset url. Returns undefined when the PNG hasn't been generated yet.
  // Render layer falls back to a labelled placeholder so the rest of the
  // pipeline can still be exercised end-to-end before art lands.
  assetUrl?: string
  // Short prompt-derived hint shown next to the placeholder; also used by
  // the LLM as a description anchor when explaining why it picked this item.
  description: string
  descriptionEn?: string
}

// Per-(species, itemId) placement. x/y are pixel offsets from the pet sprite
// centre. scale is a multiplier on the original PNG size. rotate is degrees,
// clockwise positive.
//
// FIRST-TIME RULE: when an item is shown on a pet for the first time, it
// renders at DEFAULT_PLACEMENT (centre, original size, no rotation). The user
// uses WardrobeAlignmentEditor to nudge it into place, then we save into
// pet.ui.wardrobePlacements[species][itemId]. This means new species don't
// need pre-baked offsets and new items don't need per-species pre-tuning.
export interface WardrobePlacement {
  x: number
  y: number
  scale: number
  rotate: number
}

export const DEFAULT_PLACEMENT: WardrobePlacement = {
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0
}

// pet.ui.wardrobePlacements is keyed first by species ('pig' | 'dog' | ...)
// then by item id. Missing entries fall back to DEFAULT_PLACEMENT.
export type WardrobePlacementMap = Record<string, Record<string, WardrobePlacement | undefined> | undefined>

// Multi-slot equipment map. One item per slot maximum — equipping a new
// hat (slot=head-top) replaces the previous head-top item but leaves the
// back-equipped wings alone. Empty slots are simply absent from the map.
//
// Migration from the old single-string `wardrobeSelection`:
//   - if the old id resolves to a manifest entry, fill `wardrobeEquipped[slot] = id`
//   - ids that don't resolve in the manifest are stripped on load by
//     pet-memory.ts (LEGACY_GHOST_WARDROBE_IDS) so nothing dangles.
export type WardrobeEquippedMap = Partial<Record<WardrobeSlot, string>>

// Selection context fed to pickWardrobe. The shop builds this from the
// current pet snapshot; the function then filters the pool and either calls
// the LLM or runs the deterministic weighted-random fallback.
export interface WardrobeSelectionContext {
  // Filtering hints. budget = the user's intended pawcoin spend. mood is the
  // pet's currently inferred mood. Either may be undefined → no constraint.
  budget?: number
  preferredMoods?: WardrobeMoodTag[]
  // Items already paid for (and thus in the wardrobe). The shop avoids
  // re-picking these unless the filtered pool is empty.
  unlockedIds: string[]
  // Optional explanation hooks for the LLM
  petName?: string
  preferredName?: string
  weeklySummary?: string
  closeness?: number
  stage?: string
  language?: PetLanguage
}

export interface WardrobeSelectionResult {
  // The item the shop chose. Always defined unless the entire pool is empty
  // (which can't happen with a well-formed manifest).
  item: WardrobeItem
  // One-line companion-voiced explanation. Comes from the LLM when available;
  // falls back to a templated string from a small phrase pool.
  reason: string
  // Where the explanation came from. UI shows different chrome for fallback
  // (so the user knows the LLM wasn't actually consulted).
  source: 'model' | 'fallback'
}

// Recent draws are persisted on the pet so the panel can show "你最近抽到的"
// without scanning the entire wardrobeUnlocked list.
export interface WardrobeDrawHistoryEntry {
  itemId: string
  drawnAt: string  // ISO
  reason: string
  source: 'model' | 'fallback'
  pricePaid: number
}

export const WARDROBE_DRAW_HISTORY_LIMIT = 6
