import { createDefaultPet } from './default-pet'
import { inferTimePeriod, inferWorkingMode } from './pet-companion'
import { petPlatform } from '../platform/pet-platform'
import type { CompanionPreferenceMemory, CreateReminderInput, PetCutoutPlacement, PetData, PetLanguage, PetModelConfig, PetModelHealth, PetOnboardingStep, ReminderItem, UserPreferenceMemory } from '../types/pet'
import type { DomainStateEnvelope, DomainStateKey, DomainStateMap } from '../types/domain'
import type { PetStickerHistory, PetStickerHistoryEntry } from '../types/sticker'
import { STICKER_HISTORY_LIMIT } from '../types/sticker'
import type { WardrobeDrawHistoryEntry, WardrobePlacement, WardrobePlacementMap } from '../types/wardrobe'
import { WARDROBE_DRAW_HISTORY_LIMIT } from '../types/wardrobe'
import { getWardrobeItemById } from '../assets/wardrobe/manifest'

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))

const migrateStickerHistory = (raw: unknown, fallback: PetStickerHistory | undefined): PetStickerHistory => {
  const base: PetStickerHistory = fallback ?? { entries: [] }
  if (!raw || typeof raw !== 'object') return base
  const value = raw as Partial<PetStickerHistory>
  const rawEntries = Array.isArray(value.entries) ? value.entries : []
  const entries: PetStickerHistoryEntry[] = rawEntries
    .filter((item: any): item is PetStickerHistoryEntry =>
      Boolean(item) && typeof item.id === 'string' && typeof item.shownAt === 'string' && typeof item.triggerKind === 'string'
    )
    .slice(-STICKER_HISTORY_LIMIT)
  return {
    entries,
    lastMorningGreetingAt: typeof value.lastMorningGreetingAt === 'string' ? value.lastMorningGreetingAt : undefined
  }
}

// Migrate the per-(species, item) placement map. We deliberately accept any
// finite numeric values (including negatives) for x/y so users who positioned
// items outside the default crop-box still see them after upgrade. Scale and
// rotate are clamped to sane ranges so a corrupted save can't render an item
// at scale=1e9 and crash WebGL/canvas backends.
const migrateWardrobePlacements = (raw: unknown): WardrobePlacementMap | undefined => {
  if (!raw || typeof raw !== 'object') return undefined
  const result: WardrobePlacementMap = {}
  for (const [speciesKey, itemMap] of Object.entries(raw as Record<string, unknown>)) {
    if (!itemMap || typeof itemMap !== 'object') continue
    const speciesEntry: Record<string, WardrobePlacement> = {}
    for (const [itemId, placement] of Object.entries(itemMap as Record<string, unknown>)) {
      if (!placement || typeof placement !== 'object') continue
      const p = placement as Partial<WardrobePlacement>
      const x = typeof p.x === 'number' && Number.isFinite(p.x) ? p.x : 0
      const y = typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : 0
      const scale = typeof p.scale === 'number' && Number.isFinite(p.scale)
        ? Math.max(0.2, Math.min(4, p.scale))
        : 1
      const rotate = typeof p.rotate === 'number' && Number.isFinite(p.rotate)
        ? ((p.rotate % 360) + 360) % 360
        : 0
      speciesEntry[itemId] = { x, y, scale, rotate }
    }
    if (Object.keys(speciesEntry).length > 0) result[speciesKey] = speciesEntry
  }
  return Object.keys(result).length > 0 ? result : undefined
}

const migrateCutoutPlacementsByAppearance = (raw: unknown): Record<string, PetCutoutPlacement[]> => {
  if (!raw || typeof raw !== 'object') return {}
  const result: Record<string, PetCutoutPlacement[]> = {}
  for (const [appearanceKey, placements] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(placements)) continue
    const migrated = placements
      .filter((item): item is Partial<PetCutoutPlacement> => Boolean(item) && typeof item === 'object')
      .map((placement, index) => ({
        id: typeof placement.id === 'string' && placement.id ? placement.id : `part-${index}`,
        slotId: typeof placement.slotId === 'string' && placement.slotId ? placement.slotId : undefined,
        x: typeof placement.x === 'number' && Number.isFinite(placement.x) ? Math.round(placement.x) : 250,
        y: typeof placement.y === 'number' && Number.isFinite(placement.y) ? Math.round(placement.y) : 204,
        width: typeof placement.width === 'number' && Number.isFinite(placement.width) ? Math.max(24, Math.round(placement.width)) : 512,
        height: typeof placement.height === 'number' && Number.isFinite(placement.height) ? Math.max(24, Math.round(placement.height)) : 512,
        zIndex: typeof placement.zIndex === 'number' && Number.isFinite(placement.zIndex) ? Math.round(placement.zIndex) : index + 2,
        visible: placement.visible !== false
      }))
    if (migrated.length > 0) result[appearanceKey] = migrated
  }
  return result
}

// Migrate wardrobeEquipped from saved JSON. Two paths:
//  - explicit map already exists in save → keep, validating each value is a
//    string and slot is a known WardrobeSlot.
//  - only legacy `wardrobeSelection` exists → look the id up in the manifest
//    and seed the equipped map at the resolved slot. This is the upgrade
//    path for users who saved on the single-slot version.
const VALID_SLOTS: ReadonlyArray<import('../types/wardrobe').WardrobeSlot> = [
  'head-top', 'face', 'mouth', 'neck', 'chest', 'back', 'hand', 'floating'
]

const migrateWardrobeEquipped = (
  rawEquipped: unknown,
  legacySelection: unknown
): import('../types/wardrobe').WardrobeEquippedMap => {
  const slotSet = new Set(VALID_SLOTS as readonly string[])
  const result: import('../types/wardrobe').WardrobeEquippedMap = {}

  if (rawEquipped && typeof rawEquipped === 'object') {
    for (const [slot, value] of Object.entries(rawEquipped as Record<string, unknown>)) {
      if (!slotSet.has(slot)) continue
      if (typeof value !== 'string' || !value) continue
      result[slot as import('../types/wardrobe').WardrobeSlot] = value
    }
    if (Object.keys(result).length > 0) return result
  }

  if (typeof legacySelection === 'string' && legacySelection) {
    const meta = getWardrobeItemById(legacySelection)
    if (meta) result[meta.slot] = legacySelection
  }
  return result
}

const migrateWardrobeDrawHistory = (raw: unknown): WardrobeDrawHistoryEntry[] => {
  if (!Array.isArray(raw)) return []
  const filtered: WardrobeDrawHistoryEntry[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Partial<WardrobeDrawHistoryEntry>
    if (typeof e.itemId !== 'string' || typeof e.drawnAt !== 'string') continue
    const reason = typeof e.reason === 'string' ? e.reason : ''
    const source: WardrobeDrawHistoryEntry['source'] = e.source === 'model' ? 'model' : 'fallback'
    const pricePaid = typeof e.pricePaid === 'number' && Number.isFinite(e.pricePaid) && e.pricePaid >= 0 ? e.pricePaid : 0
    filtered.push({ itemId: e.itemId, drawnAt: e.drawnAt, reason, source, pricePaid })
  }
  return filtered.slice(-WARDROBE_DRAW_HISTORY_LIMIT)
}

const migrateWardrobeVariantByItem = (raw: unknown): Record<string, string> => {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key) continue
    if (typeof value !== 'string' || !value) continue
    out[key] = value
  }
  return out
}

const inferStage = (saved: any, fallback: PetData) => {
  const stage = saved?.state?.stage
  if (stage === 'egg' || stage === 'baby' || stage === 'child' || stage === 'adult' || stage === 'elder') return stage
  if (stage === 'pet') return 'child' as const
  return fallback.state.stage
}

const isImportedSpeciesId = (value: string) => /^petdex:[a-z0-9][a-z0-9._-]{1,63}$/.test(value)

const inferSpecies = (value: unknown): PetData['personality']['species'] => {
  if (value === 'puppy' || value === 'piglet') return value
  if (typeof value === 'string' && /^prompt-\d+$/.test(value)) return value as PetData['personality']['species']
  if (typeof value === 'string' && isImportedSpeciesId(value)) return value as PetData['personality']['species']
  // Legacy values ('blob' | 'cat' | 'ghost' | 'custom') and anything else fall
  // back to the default puppy sprite. 'custom' was the old hand-rigged pig
  // and is no longer shipped — pets that still have it stored migrate here.
  return 'puppy'
}

const inferLanguage = (value: unknown, fallback: PetLanguage): PetLanguage => (
  value === 'en-US' || value === 'zh-CN' ? value : fallback
)

const parseOnboardingStep = (value: unknown): PetOnboardingStep | undefined => {
  if (value === 'language') return 'language'
  if (value === 'identity') return 'identity'
  if (value === 'appearance') return 'appearance'
  if (value === 'nostalgia' || value === 'brain') return 'brain'
  if (value === 'hatch') return 'hatch'
  return undefined
}

const inferOnboardingStep = (value: unknown, fallback: PetOnboardingStep): PetOnboardingStep => parseOnboardingStep(value) ?? fallback

const migrateOnboardingSteps = (value: unknown): PetOnboardingStep[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(parseOnboardingStep)
    .filter((item): item is PetOnboardingStep => Boolean(item))
    .slice(0, 5)
}

const migratePreferences = (saved: any): UserPreferenceMemory[] => {
  const raw = Array.isArray(saved?.memory?.preferences) ? saved.memory.preferences : []
  return raw
    .filter((item: any) => item && typeof item.summary === 'string' && typeof item.value === 'string')
    .map((item: any) => ({
      id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
      category:
        item.category === 'identity' ||
        item.category === 'reminder' ||
        item.category === 'interaction' ||
        item.category === 'schedule' ||
        item.category === 'work' ||
        item.category === 'comfort'
          ? item.category
          : 'interaction',
      summary: item.summary,
      value: item.value,
      confidence: clamp(typeof item.confidence === 'number' ? item.confidence : 0.6, 0, 1),
      source: item.source === 'behavior' ? 'behavior' : 'explicit',
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()
    }))
}

const migrateCompanionPreferences = (saved: any, fallback: CompanionPreferenceMemory): CompanionPreferenceMemory => {
  const raw = saved?.memory?.companionPreferences
  const favoriteTopics = Array.isArray(raw?.favoriteTopics) ? raw.favoriteTopics.filter((item: unknown): item is string => typeof item === 'string').slice(0, 4) : fallback.favoriteTopics
  const recentTopics = Array.isArray(raw?.recentTopics) ? raw.recentTopics.filter((item: unknown): item is string => typeof item === 'string').slice(0, 4) : fallback.recentTopics
  const avoidPhrases = Array.isArray(raw?.avoidPhrases) ? raw.avoidPhrases.filter((item: unknown): item is string => typeof item === 'string').slice(0, 4) : fallback.avoidPhrases
  const learnedSpeechStyle = Array.isArray(raw?.learnedSpeechStyle) ? raw.learnedSpeechStyle.filter((item: unknown): item is string => typeof item === 'string').slice(0, 4) : fallback.learnedSpeechStyle

  return {
    interactionStyle: raw?.interactionStyle === 'quiet' || raw?.interactionStyle === 'playful' || raw?.interactionStyle === 'warm' ? raw.interactionStyle : fallback.interactionStyle,
    reminderStyle: raw?.reminderStyle === 'gentle' || raw?.reminderStyle === 'balanced' || raw?.reminderStyle === 'direct' ? raw.reminderStyle : fallback.reminderStyle,
    addressStyle: raw?.addressStyle === 'plain' || raw?.addressStyle === 'name' || raw?.addressStyle === 'nickname' ? raw.addressStyle : fallback.addressStyle,
    focusSupportStyle: raw?.focusSupportStyle === 'quiet' || raw?.focusSupportStyle === 'check-in' || raw?.focusSupportStyle === 'encouraging' ? raw.focusSupportStyle : fallback.focusSupportStyle,
    lowMoodSupportStyle: raw?.lowMoodSupportStyle === 'gentle' || raw?.lowMoodSupportStyle === 'steady' || raw?.lowMoodSupportStyle === 'playful' ? raw.lowMoodSupportStyle : fallback.lowMoodSupportStyle,
    favoriteTopics,
    recentTopics,
    avoidPhrases,
    learnedSpeechStyle,
    summary: typeof raw?.summary === 'string' && raw.summary.trim() ? raw.summary : fallback.summary,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString()
  }
}

// Old default starter ids that never had a manifest entry. They live on
// disk for any pet created before the empty-starter migration; surfacing
// them in the panel made the user click an item that produced zero
// visible effect ("怎么没用上"). Wherever we touch `wardrobeUnlocked` or
// `wardrobeSelection` on load, we strip these out.
const LEGACY_GHOST_WARDROBE_IDS = new Set(['classic-bow', 'cloud-scarf', 'sun-hat'])

const migrateWardrobeSelection = (saved: any, fallback: PetData) => {
  const selection = typeof saved?.ui?.wardrobeSelection === 'string' ? saved.ui.wardrobeSelection : fallback.ui.wardrobeSelection
  if (typeof selection === 'string' && LEGACY_GHOST_WARDROBE_IDS.has(selection)) return undefined
  return selection
}

const migratePet = (saved: PetData | null): PetData => {
  const fallback = createDefaultPet()
  if (!saved) return fallback

  const rawSaved = saved as any
  const rawMemory = rawSaved.memory ?? {}
  const rawProfile = rawMemory.profile ?? {}
  const now = Date.now()
  const currentScene = rawMemory.working?.currentScene ?? 'idle'
  const daily = Array.isArray(rawMemory.daily) && rawMemory.daily.length > 0
    ? rawMemory.daily
    : fallback.memory.daily

  const mergedPet = {
    ...fallback,
    ...saved,
    personality: {
      ...fallback.personality,
      ...saved.personality,
      species: inferSpecies(saved.personality?.species ?? rawProfile.chosenSpecies),
      name: rawProfile.petName ?? saved.personality?.name ?? fallback.personality.name
    },
    state: {
      ...fallback.state,
      ...saved.state,
      stage: inferStage(rawSaved, fallback),
      ageDays: typeof rawSaved.state?.ageDays === 'number' ? rawSaved.state.ageDays : fallback.state.ageDays,
      cleanliness: clamp(typeof rawSaved.state?.cleanliness === 'number' ? rawSaved.state.cleanliness : fallback.state.cleanliness),
      health: clamp(typeof rawSaved.state?.health === 'number' ? rawSaved.state.health : fallback.state.health),
      lastCareAt: typeof rawSaved.state?.lastCareAt === 'string' ? rawSaved.state.lastCareAt : rawSaved.state?.lastInteractionAt ?? fallback.state.lastCareAt,
      hatchedAt: typeof rawSaved.state?.hatchedAt === 'string' ? rawSaved.state.hatchedAt : fallback.state.hatchedAt
    },
    memory: {
      ...fallback.memory,
      ...rawMemory,
      profile: {
        ...fallback.memory.profile,
        // userName was retired -- if a legacy archive only has userName,
        // promote it to preferredName so the pet keeps calling the user the
        // same thing instead of forgetting the address overnight.
        preferredName: typeof rawProfile.preferredName === 'string'
          ? rawProfile.preferredName
          : (typeof rawProfile.userName === 'string' ? rawProfile.userName : fallback.memory.profile.preferredName),
        petName: typeof rawProfile.petName === 'string' ? rawProfile.petName : fallback.memory.profile.petName,
        userAddress: typeof rawProfile.userAddress === 'string' ? rawProfile.userAddress : fallback.memory.profile.userAddress,
        chosenSpecies: inferSpecies(rawProfile.chosenSpecies ?? saved.personality?.species),
        selectedPalette: typeof rawProfile.selectedPalette === 'string' ? rawProfile.selectedPalette : fallback.memory.profile.selectedPalette,
        selectedGender: rawProfile.selectedGender === 'boy' || rawProfile.selectedGender === 'girl' ? rawProfile.selectedGender : fallback.memory.profile.selectedGender,
        likes: Array.isArray(rawProfile.likes)
          ? rawProfile.likes.filter((item: unknown): item is string => typeof item === 'string').slice(0, 8)
          : fallback.memory.profile.likes,
        dislikes: Array.isArray(rawProfile.dislikes)
          ? rawProfile.dislikes.filter((item: unknown): item is string => typeof item === 'string').slice(0, 8)
          : fallback.memory.profile.dislikes,
        habits: Array.isArray(rawProfile.habits)
          ? rawProfile.habits.filter((item: unknown): item is string => typeof item === 'string').slice(0, 8)
          : fallback.memory.profile.habits,
        comfortTopics: Array.isArray(rawProfile.comfortTopics)
          ? rawProfile.comfortTopics.filter((item: unknown): item is string => typeof item === 'string').slice(0, 8)
          : fallback.memory.profile.comfortTopics
      },
      preferences: migratePreferences(saved),
      working: {
        ...fallback.memory.working,
        ...rawMemory.working,
        currentScene,
        currentMode: inferWorkingMode({ ...fallback, ...saved, memory: { ...fallback.memory, ...rawMemory } }, currentScene, now),
        currentTimePeriod: inferTimePeriod(now),
        lastObservedAt: new Date(now).toISOString()
      },
      daily: daily.slice(0, 7),
      bond: {
        ...fallback.memory.bond,
        ...rawMemory.bond,
        reliance: rawMemory.bond?.reliance ?? fallback.memory.bond.reliance,
        warmth: rawMemory.bond?.warmth ?? fallback.memory.bond.warmth,
        neglectedLevel: rawMemory.bond?.neglectedLevel ?? fallback.memory.bond.neglectedLevel,
        interactionMomentum: rawMemory.bond?.interactionMomentum ?? fallback.memory.bond.interactionMomentum
      },
      reminderStrategy: {
        ...fallback.memory.reminderStrategy,
        ...rawMemory.reminderStrategy
      },
      relationship: {
        ...fallback.memory.relationship,
        ...rawMemory.relationship,
        stage:
          rawMemory.relationship?.stage === 'stranger' ||
          rawMemory.relationship?.stage === 'warming-up' ||
          rawMemory.relationship?.stage === 'friend' ||
          rawMemory.relationship?.stage === 'close' ||
          rawMemory.relationship?.stage === 'soulmate'
            ? rawMemory.relationship.stage
            : fallback.memory.relationship.stage,
        dayMilestones: Array.isArray(rawMemory.relationship?.dayMilestones)
          ? rawMemory.relationship.dayMilestones.filter((item: unknown): item is number => typeof item === 'number').slice(0, 8)
          : fallback.memory.relationship.dayMilestones,
        summary: typeof rawMemory.relationship?.summary === 'string' && rawMemory.relationship.summary.trim()
          ? rawMemory.relationship.summary
          : fallback.memory.relationship.summary,
        weeklySummary: typeof rawMemory.relationship?.weeklySummary === 'string' && rawMemory.relationship.weeklySummary.trim()
          ? rawMemory.relationship.weeklySummary.trim().slice(0, 400)
          : undefined,
        weeklyConsolidationAt: typeof rawMemory.relationship?.weeklyConsolidationAt === 'string'
          ? rawMemory.relationship.weeklyConsolidationAt
          : undefined
      },
      companionPreferences: migrateCompanionPreferences(saved, fallback.memory.companionPreferences),
      aiSetup: {
        ...fallback.memory.aiSetup,
        ...rawMemory.aiSetup,
        status:
          rawMemory.aiSetup?.status === 'needs-setup' ||
          rawMemory.aiSetup?.status === 'checking' ||
          rawMemory.aiSetup?.status === 'ready' ||
          rawMemory.aiSetup?.status === 'fallback'
            ? rawMemory.aiSetup.status
            : fallback.memory.aiSetup.status,
        provider: rawMemory.aiSetup?.provider === 'fallback' ? 'fallback' : 'ollama',
        desiredModel: typeof rawMemory.aiSetup?.desiredModel === 'string' && rawMemory.aiSetup.desiredModel.trim()
          ? rawMemory.aiSetup.desiredModel
          : fallback.memory.aiSetup.desiredModel,
        endpoint: typeof rawMemory.aiSetup?.endpoint === 'string' && rawMemory.aiSetup.endpoint.trim()
          ? rawMemory.aiSetup.endpoint
          : fallback.memory.aiSetup.endpoint,
        note: typeof rawMemory.aiSetup?.note === 'string' ? rawMemory.aiSetup.note : fallback.memory.aiSetup.note
      },
      events: Array.isArray(rawMemory.events)
        ? rawMemory.events.slice(0, 40).map((event: any) => ({
            ...event,
            sceneId: event?.sceneId,
            tags: Array.isArray(event?.tags) ? event.tags : [],
            category: typeof event?.category === 'string' && ['milestone', 'people', 'work', 'health', 'mood', 'preference', 'general'].includes(event.category)
              ? event.category
              : undefined
          }))
        : fallback.memory.events,
      facts: (() => {
        const rawFacts = rawMemory.facts ?? {}
        const rawRecords = Array.isArray(rawFacts.records) ? rawFacts.records : []
        // Drop entries that don't carry the minimum needed for comparison or
        // display. We keep both numeric and string values; only the shape is
        // validated, not the meaning.
        const records = rawRecords
          .map((entry: any) => {
            if (!entry || typeof entry !== 'object') return null
            if (typeof entry.key !== 'string' || !entry.key.trim()) return null
            const value = typeof entry.value === 'number' || typeof entry.value === 'string' ? entry.value : null
            if (value === null) return null
            const ts = typeof entry.ts === 'string' ? entry.ts : new Date().toISOString()
            return {
              id: typeof entry.id === 'string' && entry.id ? entry.id : crypto.randomUUID(),
              key: entry.key,
              value,
              unit: typeof entry.unit === 'string' ? entry.unit : undefined,
              ts,
              source: ['user-said', 'inferred', 'pet-asked'].includes(entry.source) ? entry.source : 'user-said',
              confidence: typeof entry.confidence === 'number' ? entry.confidence : undefined,
              raw: typeof entry.raw === 'string' ? entry.raw.slice(0, 200) : undefined
            }
          })
          .filter((entry: unknown): entry is NonNullable<typeof entry> => entry !== null)
          .slice(0, 500)
        const trackable = rawFacts.trackable && typeof rawFacts.trackable === 'object' && !Array.isArray(rawFacts.trackable)
          ? Object.fromEntries(
              Object.entries(rawFacts.trackable as Record<string, unknown>)
                .filter(([key, value]) => typeof key === 'string' && typeof value === 'boolean')
            )
          : {}
        const lastProactiveRecallAt = typeof rawFacts.lastProactiveRecallAt === 'string'
          ? rawFacts.lastProactiveRecallAt
          : undefined
        return { records, trackable, lastProactiveRecallAt }
      })(),
      traits: {
        ...fallback.memory.traits,
        ...rawMemory.traits
      }
    },
    ui: {
      ...fallback.ui,
      ...saved.ui,
      language: inferLanguage(saved.ui?.language, 'zh-CN'),
      onboardingCompleted: typeof saved.ui?.onboardingCompleted === 'boolean' ? saved.ui.onboardingCompleted : fallback.ui.onboardingCompleted,
      onboarding: {
        ...fallback.ui.onboarding,
        currentStep: inferOnboardingStep(saved.ui?.onboarding?.currentStep, fallback.ui.onboarding.currentStep),
        completedSteps: Array.isArray(saved.ui?.onboarding?.completedSteps)
          ? migrateOnboardingSteps(saved.ui.onboarding.completedSteps)
          : fallback.ui.onboarding.completedSteps,
        finishedAt: typeof saved.ui?.onboarding?.finishedAt === 'string' ? saved.ui.onboarding.finishedAt : fallback.ui.onboarding.finishedAt
      },
      companionSurfaces: {
        ...fallback.ui.companionSurfaces,
        ...saved.ui?.companionSurfaces,
        activeTab:
          saved.ui?.companionSurfaces?.activeTab === 'overview'
            ? 'care'
            : saved.ui?.companionSurfaces?.activeTab === 'reminders' ||
              saved.ui?.companionSurfaces?.activeTab === 'care' ||
              saved.ui?.companionSurfaces?.activeTab === 'grow' ||
              saved.ui?.companionSurfaces?.activeTab === 'diary' ||
              saved.ui?.companionSurfaces?.activeTab === 'settings'
              ? saved.ui.companionSurfaces.activeTab
              : fallback.ui.companionSurfaces.activeTab
      },
      system: {
        ...fallback.ui.system,
        ...saved.ui?.system,
        vacationMode: typeof saved.ui?.system?.vacationMode === 'boolean' ? saved.ui.system.vacationMode : fallback.ui.system.vacationMode,
        bossModeEnabled: typeof saved.ui?.system?.bossModeEnabled === 'boolean' ? saved.ui.system.bossModeEnabled : fallback.ui.system.bossModeEnabled,
        nestModeEnabled: typeof saved.ui?.system?.nestModeEnabled === 'boolean' ? saved.ui.system.nestModeEnabled : fallback.ui.system.nestModeEnabled,
        strongReminderEnabled: typeof saved.ui?.system?.strongReminderEnabled === 'boolean' ? saved.ui.system.strongReminderEnabled : false,
        stickerHistory: migrateStickerHistory(saved.ui?.system?.stickerHistory, fallback.ui.system.stickerHistory),
        developerModeEnabled: typeof saved.ui?.system?.developerModeEnabled === 'boolean' ? saved.ui.system.developerModeEnabled : false
      },
      wardrobeSelection: migrateWardrobeSelection(saved, fallback),
      wardrobeUnlocked: Array.isArray(saved.ui?.wardrobeUnlocked)
        ? saved.ui.wardrobeUnlocked
            .filter((item): item is string => typeof item === 'string')
            .filter((item) => !LEGACY_GHOST_WARDROBE_IDS.has(item))
            .slice(0, 64)
        : fallback.ui.wardrobeUnlocked,
      wardrobeEquipped: migrateWardrobeEquipped(saved.ui?.wardrobeEquipped, saved.ui?.wardrobeSelection),
      wardrobeVariantByItem: migrateWardrobeVariantByItem(saved.ui?.wardrobeVariantByItem),
      wardrobePlacements: migrateWardrobePlacements(saved.ui?.wardrobePlacements) ?? fallback.ui.wardrobePlacements ?? {},
      cutoutPlacementsByAppearance: migrateCutoutPlacementsByAppearance(saved.ui?.cutoutPlacementsByAppearance),
      wardrobeDrawHistory: migrateWardrobeDrawHistory(saved.ui?.wardrobeDrawHistory),
      showMemoryEditor: typeof saved.ui?.showMemoryEditor === 'boolean' ? saved.ui.showMemoryEditor : fallback.ui.showMemoryEditor
    }
  }

  return mergedPet
}

export const loadPet = async (): Promise<PetData> => {
  const saved = await petPlatform.loadPet()
  return migratePet((saved as PetData | null) ?? null)
}

export const savePet = async (pet: PetData) => {
  await petPlatform.savePet(pet)
}

export const loadReminders = async (): Promise<ReminderItem[]> => petPlatform.loadReminders()

export const createReminder = async (input: CreateReminderInput): Promise<ReminderItem> => petPlatform.createReminder(input)

export const completeReminder = async (id: string) => petPlatform.completeReminder(id)

export const snoozeReminder = async (id: string, minutes: number) => petPlatform.snoozeReminder(id, minutes)

export const loadModelConfig = async (): Promise<PetModelConfig> => petPlatform.loadModelConfig()

export const saveModelConfig = async (config: PetModelConfig): Promise<PetModelConfig> => petPlatform.saveModelConfig(config)

export const checkModelHealth = async (): Promise<PetModelHealth> => petPlatform.checkModelHealth()

export const loadDomainState = async <T extends DomainStateKey>(key: T): Promise<DomainStateEnvelope<DomainStateMap[T]>> => petPlatform.loadDomainState(key)

export const saveDomainState = async <T extends DomainStateKey>(key: T, data: DomainStateEnvelope<DomainStateMap[T]>) => petPlatform.saveDomainState(key, data)
