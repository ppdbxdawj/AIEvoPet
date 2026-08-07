import type {
  AchievementState,
  AuditLogEntry,
  DomainStateEnvelope,
  EconomyState,
  HomeState,
  InventoryState,
  JobState,
  ToolRegistryState
} from '../types/domain'
import type { PetData } from '../types/pet'

// Legacy "daily supplies" shelf. The user-facing shop card that sold
// these (snack-pack / cozy-blanket / star-lamp) was removed from the
// panel — the blind-box wardrobe in src/lib/wardrobe-shop.ts is the
// only remaining purchase surface. SHOP_ITEMS lives on as read-only
// metadata so that:
//   • inventory rows from old saves still render with proper names
//     and the right "feed" / "place in home" affordances (see
//     handleUseInventoryItem and inventoryItemMetaById);
//   • computeHomeComfort can still look up the comfort value of any
//     furniture entries the user already placed.
// Do not add new entries here without putting them somewhere
// purchasable, otherwise they'll be dead-letter metadata.
export const SHOP_ITEMS = [
  {
    id: 'snack-pack',
    title: '小零食包',
    titleEn: 'Snack pack',
    description: '补一点日常消耗，也能拿来当作陪伴奖励。',
    descriptionEn: 'Replenishes a bit of daily care and works as a small companion reward.',
    price: 12,
    kind: 'consumable' as const,
    grantQuantity: 1,
    source: 'shop'
  },
  {
    id: 'cozy-blanket',
    title: '软绒毯',
    titleEn: 'Soft blanket',
    description: '让它在桌边窝得更舒服一点。',
    descriptionEn: 'Makes its little desk-side nest more comfortable.',
    price: 38,
    kind: 'furniture' as const,
    comfort: 8,
    source: 'shop'
  },
  {
    id: 'star-lamp',
    title: '星星灯',
    titleEn: 'Star lamp',
    description: '给小窝加一点夜晚的光。',
    descriptionEn: 'Adds a little nighttime glow to its home.',
    price: 54,
    kind: 'furniture' as const,
    comfort: 14,
    source: 'shop'
  }
  // Wardrobe items moved entirely to the blind-box shop in
  // src/lib/wardrobe-shop.ts. The two CSS-only entries that used to
  // live here (`cloud-scarf`, `sun-hat`) had no manifest entry and no
  // PNG asset, so buying them produced zero visible change on the pet
  // — confusing for the user, dead weight in the daily-supply card.
] as const

export const JOB_OPTIONS = [
  {
    id: 'desk-greeter',
    title: '桌边招呼',
    titleEn: 'Desk greeter',
    description: '帮你盯一小段桌边节奏，回来时会带点零花钱。',
    descriptionEn: 'Keeps an eye on the desk rhythm for a short while and brings back pocket money.',
    durationMinutes: 10,
    reward: 18,
    unlockBond: 0
  },
  {
    id: 'focus-buddy',
    title: '专注陪跑',
    titleEn: 'Focus buddy',
    description: '安静陪你推进一段工作流。',
    descriptionEn: 'Quietly keeps you company while you move a workflow forward.',
    durationMinutes: 20,
    reward: 34,
    unlockBond: 45
  },
  {
    id: 'cozy-host',
    title: '窝窝看家',
    titleEn: 'Cozy host',
    description: '在桌边守着家园和提醒。',
    descriptionEn: 'Watches over the home and reminders by the desk.',
    durationMinutes: 30,
    reward: 52,
    unlockBond: 62
  }
] as const

export const TOOL_OPTIONS = [
  {
    id: 'reminder.create',
    title: '提醒工具',
    titleEn: 'Reminder tool',
    description: '从面板里快速塞一条待办提醒。',
    descriptionEn: 'Quickly add a todo reminder from the panel.'
  },
  {
    id: 'pomodoro.start',
    title: '番茄钟',
    titleEn: 'Pomodoro',
    description: '直接创建一条 25 分钟后的结束提醒。',
    descriptionEn: 'Creates a completion reminder 25 minutes from now.'
  },
  {
    id: 'pet.express',
    title: '陪伴快照',
    titleEn: 'Companion snapshot',
    description: '导出当前陪伴状态，方便分享或回顾。',
    descriptionEn: 'Exports the current companion state for sharing or review.'
  },
  {
    id: 'system.idle',
    title: '安静陪伴',
    titleEn: 'Quiet companion',
    description: '快速切换到更低打扰的待机模式。',
    descriptionEn: 'Quickly switches to a lower-interruption standby mode.'
  }
] as const

export const ORACLE_DECKS = [
  {
    id: 'daily-glow',
    title: '今日小光',
    titleEn: 'Daily glow',
    summaries: ['今天先把最小的一步做掉，节奏就会顺起来。', '不用把所有事都一次想完，先挑一个最容易开始的。', '你的状态更适合稳一点地推进，不必硬冲。'],
    summariesEn: ['Finish the smallest step first today, and the rhythm will loosen up.', 'You do not need to think through everything at once; pick the easiest place to begin.', 'Your state suits steady progress better than forcing a sprint.']
  },
  {
    id: 'comfort-bloom',
    title: '安慰签',
    titleEn: 'Comfort bloom',
    summaries: ['现在先对自己温柔一点，别把所有压力都算成自己的错。', '你已经扛了很多，今天允许自己慢半拍。', '先把呼吸和节奏找回来，事情会比现在清楚。'],
    summariesEn: ['Be gentler with yourself for now; not every pressure is your fault.', 'You have carried a lot already, so you are allowed to move half a beat slower today.', 'Find your breath and rhythm first; things will become clearer than they feel now.']
  },
  {
    id: 'work-spark',
    title: '工作签',
    titleEn: 'Work spark',
    summaries: ['今天适合先清理卡住你的那一小块阻力。', '把最难的一步拆成 10 分钟任务，会更容易推进。', '如果一直在切任务，先把最重要的一件事护住。'],
    summariesEn: ['Today is good for clearing the small bit of resistance that is blocking you.', 'Split the hardest step into a 10-minute task and it will move more easily.', 'If you keep switching tasks, protect the single most important thing first.']
  }
] as const

const ACHIEVEMENT_DEFS = [
  { id: 'hatched', title: '正式破壳', titleEn: 'Officially hatched', test: (pet: PetData) => pet.ui.onboardingCompleted, reward: 18 },
  { id: 'first-memory', title: '被它记住', titleEn: 'Remembered by it', test: (pet: PetData) => pet.memory.preferences.length >= 1, reward: 10 },
  { id: 'first-reminder', title: '提醒有用', titleEn: 'Helpful reminder', test: (pet: PetData) => pet.memory.reminderStrategy.completionCount >= 1, reward: 12 },
  {
    id: 'first-job',
    title: '第一次兼职',
    titleEn: 'First part-time job',
    test: (
      _pet: PetData,
      _economy: DomainStateEnvelope<EconomyState>,
      _inventory: DomainStateEnvelope<InventoryState>,
      _home: DomainStateEnvelope<HomeState>,
      jobs: DomainStateEnvelope<JobState>
    ) => jobs.data.completedJobs >= 1,
    reward: 16
  },
  {
    id: 'cozy-home',
    title: '有自己的窝',
    titleEn: 'A home of its own',
    test: (
      _pet: PetData,
      _economy: DomainStateEnvelope<EconomyState>,
      _inventory: DomainStateEnvelope<InventoryState>,
      home: DomainStateEnvelope<HomeState>
    ) => home.data.comfort >= 20,
    reward: 20
  },
  {
    id: 'rich-paws',
    title: '爪币罐满满',
    titleEn: 'Full pawcoin jar',
    test: (_pet: PetData, economy: DomainStateEnvelope<EconomyState>) => economy.data.pawcoin >= 100,
    reward: 24
  }
] as const

export const getAchievementTitle = (id: string, language: PetData['ui']['language'] = 'zh-CN'): string => {
  const match = ACHIEVEMENT_DEFS.find((item) => item.id === id)
  return match ? (language === 'en-US' ? match.titleEn : match.title) : id
}

const nowIso = () => new Date().toISOString()

export const upsertInventoryItem = (
  inventory: DomainStateEnvelope<InventoryState>,
  itemId: string,
  quantity: number,
  source?: string
): DomainStateEnvelope<InventoryState> => {
  const existing = inventory.data.items.find((item) => item.itemId === itemId)
  const items = existing
    ? inventory.data.items.map((item) => item.itemId === itemId ? {
        ...item,
        quantity: item.quantity + quantity,
        source: source ?? item.source,
        unlockedAt: item.unlockedAt ?? nowIso()
      } : item)
    : [{ itemId, quantity, source, unlockedAt: nowIso() }, ...inventory.data.items]

  return {
    ...inventory,
    updatedAt: nowIso(),
    data: {
      ...inventory.data,
      items
    }
  }
}

export const getInventoryQuantity = (inventory: InventoryState, itemId: string): number =>
  inventory.items.find((item) => item.itemId === itemId)?.quantity ?? 0

export const consumeInventoryItem = (
  inventory: DomainStateEnvelope<InventoryState>,
  itemId: string,
  quantity = 1
): DomainStateEnvelope<InventoryState> => ({
  ...inventory,
  updatedAt: nowIso(),
  data: {
    ...inventory.data,
    items: inventory.data.items
      .map((item) => item.itemId === itemId ? { ...item, quantity: item.quantity - quantity } : item)
      .filter((item) => item.quantity > 0)
  }
})

export const addPendingReward = (
  economy: DomainStateEnvelope<EconomyState>,
  reward: EconomyState['pendingRewards'][number]
): DomainStateEnvelope<EconomyState> => ({
  ...economy,
  updatedAt: nowIso(),
  data: {
    ...economy.data,
    pendingRewards: [reward, ...economy.data.pendingRewards].slice(0, 20)
  }
})

export const claimPendingRewards = (economy: DomainStateEnvelope<EconomyState>) => {
  const amount = economy.data.pendingRewards.reduce((sum, reward) => sum + reward.amount, 0)
  return {
    amount,
    envelope: {
      ...economy,
      updatedAt: nowIso(),
      data: {
        ...economy.data,
        pawcoin: economy.data.pawcoin + amount,
        lifetimeEarned: economy.data.lifetimeEarned + amount,
        pendingRewards: []
      }
    }
  }
}

export const computeHomeComfort = (home: DomainStateEnvelope<HomeState>) => {
  return home.data.furniture.reduce((sum, item) => {
    const shopItem = SHOP_ITEMS.find((entry) => entry.id === item.itemId)
    return sum + (shopItem?.kind === 'furniture' ? shopItem.comfort : 0)
  }, 0)
}

export const placeFurnitureFromInventory = (
  home: DomainStateEnvelope<HomeState>,
  itemId: string
): DomainStateEnvelope<HomeState> => {
  const nextFurniture = [
    ...home.data.furniture,
    {
      id: `${itemId}-${Date.now()}`,
      itemId,
      x: 24 + (home.data.furniture.length % 3) * 54,
      y: 32 + Math.floor(home.data.furniture.length / 3) * 48
    }
  ]
  const draft = {
    ...home,
    updatedAt: nowIso(),
    data: {
      ...home.data,
      furniture: nextFurniture
    }
  }

  return {
    ...draft,
    data: {
      ...draft.data,
      comfort: computeHomeComfort(draft)
    }
  }
}

export const createAuditEntry = (entry: Omit<AuditLogEntry, 'id' | 'at'>): AuditLogEntry => ({
  ...entry,
  id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  at: nowIso()
})

export const reconcileAchievements = (
  pet: PetData,
  economy: DomainStateEnvelope<EconomyState>,
  inventory: DomainStateEnvelope<InventoryState>,
  home: DomainStateEnvelope<HomeState>,
  jobs: DomainStateEnvelope<JobState>,
  achievements: DomainStateEnvelope<AchievementState>
) => {
  const unlocked = new Set(achievements.data.unlocked.map((item) => item.id))
  const fresh = ACHIEVEMENT_DEFS
    .filter((item) => !unlocked.has(item.id))
    .filter((item) => item.test(pet, economy, inventory, home, jobs))

  if (fresh.length === 0) {
    return {
      achievements,
      economy,
      unlocked: [] as typeof fresh
    }
  }

  const nextAchievements: DomainStateEnvelope<AchievementState> = {
    ...achievements,
    updatedAt: nowIso(),
    data: {
      ...achievements.data,
      unlocked: [
        ...fresh.map((item) => ({ id: item.id, unlockedAt: nowIso() })),
        ...achievements.data.unlocked
      ]
    }
  }

  const nextEconomy = fresh.reduce((current, item) => addPendingReward(current, {
    id: `achievement-${item.id}-${Date.now()}`,
    kind: 'achievement',
    amount: item.reward,
    createdAt: nowIso(),
    note: `解锁成就：${item.title}`
  }), economy)

  return {
    achievements: nextAchievements,
    economy: nextEconomy,
    unlocked: fresh
  }
}

export const touchToolUsage = (
  tools: DomainStateEnvelope<ToolRegistryState>,
  toolId: string
): DomainStateEnvelope<ToolRegistryState> => ({
  ...tools,
  updatedAt: nowIso(),
  data: {
    ...tools.data,
    lastUsedAtByTool: {
      ...tools.data.lastUsedAtByTool,
      [toolId]: nowIso()
    }
  }
})
