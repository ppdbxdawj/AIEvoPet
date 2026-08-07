import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createDefaultPet } from './default-pet'
import {
  addPendingReward,
  claimPendingRewards,
  computeHomeComfort,
  consumeInventoryItem,
  placeFurnitureFromInventory,
  reconcileAchievements,
  touchToolUsage,
  upsertInventoryItem
} from './pet-domains'
import type {
  AchievementState,
  DomainStateEnvelope,
  EconomyState,
  HomeState,
  InventoryState,
  JobState,
  ToolRegistryState
} from '../types/domain'

const makeInventory = (data?: Partial<InventoryState>): DomainStateEnvelope<InventoryState> => ({
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    items: [],
    equippedWardrobeSlots: {},
    ...data
  }
})

const makeEconomy = (data?: Partial<EconomyState>): DomainStateEnvelope<EconomyState> => ({
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    pawcoin: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    pendingRewards: [],
    ...data
  }
})

const makeHome = (data?: Partial<HomeState>): DomainStateEnvelope<HomeState> => ({
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    roomTier: 'starter',
    comfort: 0,
    furniture: [],
    ...data
  }
})

const makeJobs = (data?: Partial<JobState>): DomainStateEnvelope<JobState> => ({
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    unlockedJobs: [],
    completedJobs: 0,
    ...data
  }
})

const makeAchievements = (data?: Partial<AchievementState>): DomainStateEnvelope<AchievementState> => ({
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    unlocked: [],
    exportedCards: 0,
    ...data
  }
})

const makeTools = (data?: Partial<ToolRegistryState>): DomainStateEnvelope<ToolRegistryState> => ({
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    enabledTools: [],
    promptsRequiredFor: [],
    lastUsedAtByTool: {},
    ...data
  }
})

describe('pet-domains', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('upserts and consumes inventory items', () => {
    const inventory = makeInventory()
    const granted = upsertInventoryItem(inventory, 'snack-pack', 2, 'shop')
    expect(granted.data.items).toEqual([
      expect.objectContaining({
        itemId: 'snack-pack',
        quantity: 2,
        source: 'shop'
      })
    ])

    const consumed = consumeInventoryItem(granted, 'snack-pack', 1)
    expect(consumed.data.items).toEqual([
      expect.objectContaining({
        itemId: 'snack-pack',
        quantity: 1
      })
    ])
  })

  it('claims pending rewards into pawcoin and lifetime earned', () => {
    const economy = addPendingReward(
      addPendingReward(makeEconomy(), {
        id: 'job-1',
        kind: 'job',
        amount: 18,
        createdAt: '2026-04-28T11:00:00.000Z',
        note: '兼职完成'
      }),
      {
        id: 'mini-1',
        kind: 'minigame',
        amount: 9,
        createdAt: '2026-04-28T11:10:00.000Z',
        note: '小游戏奖励'
      }
    )

    const claimed = claimPendingRewards(economy)
    expect(claimed.amount).toBe(27)
    expect(claimed.envelope.data.pawcoin).toBe(27)
    expect(claimed.envelope.data.lifetimeEarned).toBe(27)
    expect(claimed.envelope.data.pendingRewards).toEqual([])
  })

  it('places furniture and recalculates home comfort from shop metadata', () => {
    const home = makeHome()
    const placedBlanket = placeFurnitureFromInventory(home, 'cozy-blanket')
    const placedLamp = placeFurnitureFromInventory(placedBlanket, 'star-lamp')

    expect(placedBlanket.data.comfort).toBe(8)
    expect(placedLamp.data.comfort).toBe(22)
    expect(computeHomeComfort(placedLamp)).toBe(22)
    expect(placedLamp.data.furniture).toHaveLength(2)
  })

  it('reconciles achievements and grants achievement rewards once', () => {
    const pet = createDefaultPet()
    pet.ui.onboardingCompleted = true
    pet.memory.preferences = [{
      id: 'pref-1',
      category: 'comfort',
      summary: '喜欢热牛奶',
      value: '热牛奶',
      confidence: 0.9,
      source: 'explicit',
      updatedAt: '2026-04-28T10:00:00.000Z'
    }]
    pet.memory.reminderStrategy.completionCount = 1

    const inventory = makeInventory()
    const economy = makeEconomy({ pawcoin: 100 })
    const home = makeHome({ comfort: 22 })
    const jobs = makeJobs({ completedJobs: 1 })
    const achievements = makeAchievements()

    const firstPass = reconcileAchievements(pet, economy, inventory, home, jobs, achievements)
    expect(firstPass.unlocked.map((item) => item.id)).toEqual([
      'hatched',
      'first-memory',
      'first-reminder',
      'first-job',
      'cozy-home',
      'rich-paws'
    ])
    expect(firstPass.economy.data.pendingRewards).toHaveLength(6)

    const secondPass = reconcileAchievements(pet, firstPass.economy, inventory, home, jobs, firstPass.achievements)
    expect(secondPass.unlocked).toEqual([])
    expect(secondPass.economy.data.pendingRewards).toHaveLength(6)
  })

  it('records tool usage timestamps', () => {
    const tools = makeTools()
    const touched = touchToolUsage(tools, 'pomodoro.start')
    expect(touched.data.lastUsedAtByTool['pomodoro.start']).toBe('2026-04-28T12:00:00.000Z')
  })
})
