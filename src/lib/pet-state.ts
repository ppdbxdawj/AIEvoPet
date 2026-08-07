import type { EventMemory, InteractionType, PetData, PetSceneId } from '../types/pet'
import { buildEventTags, noteInteractionInDaily } from './pet-companion'

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))

const getBondAdjustments = (type: InteractionType) => ({
  closeness: type === 'pet' ? 5 : type === 'hold' ? 6 : type === 'chat' ? 3 : type === 'feed' || type === 'drink' ? 4 : 1,
  trust: type === 'chat' ? 2 : type === 'feed' || type === 'drink' ? 3 : type === 'bath' ? 2 : 1,
  reliance: type === 'sleep' ? 4 : type === 'wake' ? 3 : type === 'hold' ? 4 : 2,
  warmth: type === 'pet' ? 6 : type === 'hold' ? 7 : type === 'feed' || type === 'drink' ? 5 : 3,
  neglectedLevel: type === 'pet' || type === 'chat' || type === 'hold' ? 10 : 6,
  interactionMomentum: type === 'pet' || type === 'chat' || type === 'hold' ? 12 : 8,
  recentFeeling:
    type === 'sleep'
      ? '它蜷起来睡着了，安心地把时间交给你。'
      : type === 'wake'
        ? '它揉揉眼睛醒来了，第一眼就在找你。'
        : type === 'hold'
          ? '它被你抱住时整只都放松了下来。'
          : '它觉得你在认真陪它。'
})

// Per-interaction nudges to the five personality traits. Kept tiny on purpose
// -- a single interaction should move the bar by a fraction of a percent so
// it takes dozens of repeated actions to meaningfully shift a trait. Without
// this, the personality grid in the panel would never reflect what the user
// actually does with the pet (it used to drift only on bond.closeness).
export const getTraitAdjustments = (type: InteractionType) => {
  switch (type) {
    case 'feed':
      return { energy: 1.6, bond: 0.6, talkative: 0, playful: 0, routine: 0.6 }
    case 'drink':
      return { energy: 0.7, bond: 0.4, talkative: 0, playful: 0, routine: 0.5 }
    case 'bath':
      return { energy: 0.4, bond: 0.5, talkative: 0, playful: 0.5, routine: 1.4 }
    case 'pet':
      return { energy: 0, bond: 1.5, talkative: 0.4, playful: 0.6, routine: 0 }
    case 'hold':
      return { energy: 0.4, bond: 2, talkative: 0.3, playful: 0.6, routine: 0 }
    case 'chat':
      return { energy: 0, bond: 0.9, talkative: 1.6, playful: 0.4, routine: 0 }
    case 'sleep':
      return { energy: -0.4, bond: 0.4, talkative: 0, playful: -0.3, routine: 0.9 }
    case 'wake':
      return { energy: 1.4, bond: 0.4, talkative: 0.3, playful: 0.4, routine: 0.4 }
    default:
      return { energy: 0, bond: 0.3, talkative: 0, playful: 0, routine: 0 }
  }
}

const resolveStageByAge = (pet: PetData, ageDays: number): PetData['state']['stage'] => {
  if (pet.state.stage === 'egg' && !pet.state.hatchedAt) return 'egg'
  if (ageDays >= 30) return 'elder'
  if (ageDays >= 14) return 'adult'
  if (ageDays >= 3) return 'child'
  return 'baby'
}

export const tickPetState = (pet: PetData, now = Date.now()): PetData => {
  const last = new Date(pet.state.lastInteractionAt).getTime()
  const elapsedMinutes = Math.max(0, Math.floor((now - last) / 60000))

  if (elapsedMinutes === 0) return pet

  const hungerDelta = pet.state.isSleeping ? elapsedMinutes * 0.18 : elapsedMinutes * 0.42
  const energyDelta = pet.state.isSleeping ? elapsedMinutes * 0.32 : -elapsedMinutes * 0.28
  const lonelinessDelta = pet.state.isSleeping ? elapsedMinutes * 0.08 : elapsedMinutes * 0.22
  const cleanlinessDelta = pet.state.isSleeping ? -elapsedMinutes * 0.04 : -elapsedMinutes * 0.1
  const healthDelta = -Math.max(0, pet.state.hunger - 78) * 0.01 * elapsedMinutes - Math.max(0, 24 - pet.state.cleanliness) * 0.012 * elapsedMinutes
  const moodDelta = -elapsedMinutes * 0.16 - (pet.state.hunger > 70 ? elapsedMinutes * 0.08 : 0) - (pet.state.cleanliness < 28 ? elapsedMinutes * 0.05 : 0)
  const ageDays = Math.max(pet.state.ageDays, Math.floor((now - new Date(pet.state.hatchedAt ?? pet.state.lastInteractionAt).getTime()) / 86_400_000))

  return {
    ...pet,
    state: {
      ...pet.state,
      stage: resolveStageByAge(pet, ageDays),
      ageDays,
      hunger: clamp(pet.state.hunger + hungerDelta),
      energy: clamp(pet.state.energy + energyDelta),
      loneliness: clamp(pet.state.loneliness + lonelinessDelta),
      cleanliness: clamp(pet.state.cleanliness + cleanlinessDelta),
      health: clamp(pet.state.health + healthDelta),
      mood: clamp(pet.state.mood + moodDelta),
      lastInteractionAt: new Date(now).toISOString()
    }
  }
}

// Tier-aware retention so milestone events ("妈妈住院"，"上线了") survive
// hundreds of low-importance chat turns. Without this the naive 40-slot ring
// buffer means the pet "forgets" big moments after a busy week.
//
// Slots are allotted to the three importance tiers, then the kept events are
// sorted newest-first for the events list / weekly rollup. Total cap stays at
// 40 to keep the prompt size bounded.
const EVENT_TIER_LIMITS = { tier3: 12, tier2: 24, tier1: 4 } as const
const EVENT_TOTAL_LIMIT = EVENT_TIER_LIMITS.tier3 + EVENT_TIER_LIMITS.tier2 + EVENT_TIER_LIMITS.tier1

const sortByTimestampDesc = (events: EventMemory[]) =>
  [...events].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

export const addEventMemory = (pet: PetData, event: EventMemory): PetData => {
  const enriched: EventMemory = {
    ...event,
    tags: event.tags && event.tags.length > 0 ? event.tags : buildEventTags(event)
  }
  const candidates = sortByTimestampDesc([enriched, ...pet.memory.events])
  const tier3 = candidates.filter((item) => item.importance === 3).slice(0, EVENT_TIER_LIMITS.tier3)
  const tier2 = candidates.filter((item) => item.importance === 2).slice(0, EVENT_TIER_LIMITS.tier2)
  const tier1 = candidates.filter((item) => item.importance === 1).slice(0, EVENT_TIER_LIMITS.tier1)
  const events = sortByTimestampDesc([...tier3, ...tier2, ...tier1]).slice(0, EVENT_TOTAL_LIMIT)

  return {
    ...pet,
    memory: {
      ...pet.memory,
      events
    }
  }
}

export const applyInteraction = (pet: PetData, type: InteractionType): PetData => {
  const nowIso = new Date().toISOString()
  const state = { ...pet.state, lastInteractionAt: nowIso, lastCareAt: nowIso }

  if (type === 'feed') {
    state.hunger = clamp(state.hunger - 28)
    state.mood = clamp(state.mood + 10)
    state.health = clamp(state.health + 4)
    state.affection = clamp(state.affection + 5)
    state.loneliness = clamp(state.loneliness - 8)
  }

  if (type === 'drink') {
    state.hunger = clamp(state.hunger - 10)
    state.cleanliness = clamp(state.cleanliness + 2)
    state.health = clamp(state.health + 6)
    state.mood = clamp(state.mood + 6)
    state.affection = clamp(state.affection + 3)
    state.loneliness = clamp(state.loneliness - 6)
  }

  if (type === 'bath') {
    state.cleanliness = clamp(state.cleanliness + 32)
    state.health = clamp(state.health + 8)
    state.mood = clamp(state.mood + 4)
    state.affection = clamp(state.affection + 2)
    state.loneliness = clamp(state.loneliness - 4)
  }

  if (type === 'pet') {
    state.mood = clamp(state.mood + 12)
    state.affection = clamp(state.affection + 6)
    state.loneliness = clamp(state.loneliness - 10)
  }

  if (type === 'hold') {
    state.mood = clamp(state.mood + 14)
    state.energy = clamp(state.energy + 4)
    state.affection = clamp(state.affection + 8)
    state.loneliness = clamp(state.loneliness - 14)
  }

  if (type === 'sleep') {
    state.isSleeping = true
    state.mood = clamp(state.mood + 4)
  }

  if (type === 'wake') {
    state.isSleeping = false
    state.energy = clamp(state.energy + 12)
  }

  if (type === 'chat') {
    state.mood = clamp(state.mood + 6)
    state.affection = clamp(state.affection + 3)
    state.loneliness = clamp(state.loneliness - 6)
  }

  const bondAdjustments = getBondAdjustments(type)
  const traitAdjustments = getTraitAdjustments(type)
  const next = noteInteractionInDaily(
    {
      ...pet,
      state,
      memory: {
        ...pet.memory,
        bond: {
          ...pet.memory.bond,
          closeness: clamp(pet.memory.bond.closeness + bondAdjustments.closeness),
          trust: clamp(pet.memory.bond.trust + bondAdjustments.trust),
          reliance: clamp(pet.memory.bond.reliance + bondAdjustments.reliance),
          warmth: clamp(pet.memory.bond.warmth + bondAdjustments.warmth),
          neglectedLevel: clamp(Math.max(0, pet.memory.bond.neglectedLevel - bondAdjustments.neglectedLevel)),
          interactionMomentum: clamp(pet.memory.bond.interactionMomentum + bondAdjustments.interactionMomentum),
          recentFeeling: bondAdjustments.recentFeeling
        },
        traits: {
          ...pet.memory.traits,
          energy: clamp(pet.memory.traits.energy + traitAdjustments.energy),
          bond: clamp(pet.memory.traits.bond + traitAdjustments.bond),
          talkative: clamp(pet.memory.traits.talkative + traitAdjustments.talkative),
          playful: clamp(pet.memory.traits.playful + traitAdjustments.playful),
          routine: clamp(pet.memory.traits.routine + traitAdjustments.routine)
        }
      }
    },
    Date.now()
  )

  return next
}

export const attachSceneToEvent = (event: EventMemory, sceneId: PetSceneId): EventMemory => ({
  ...event,
  sceneId,
  tags: buildEventTags({ ...event, sceneId })
})
