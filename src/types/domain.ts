export type DomainStateKey =
  | 'inventory'
  | 'economy'
  | 'home'
  | 'jobs'
  | 'achievements'
  | 'planner'
  | 'calendar'
  | 'tools'
  | 'oracle'
  | 'system'
  | 'audit'

export interface DomainStateEnvelope<T> {
  schemaVersion: number
  updatedAt: string
  data: T
}

export interface InventoryItemRecord {
  itemId: string
  quantity: number
  unlockedAt?: string
  expiresAt?: string
  source?: string
}

export interface InventoryState {
  items: InventoryItemRecord[]
  equippedWardrobeSlots: Record<string, string>
}

export interface EconomyState {
  pawcoin: number
  lifetimeEarned: number
  lifetimeSpent: number
  pendingRewards: Array<{
    id: string
    kind: 'job' | 'minigame' | 'achievement' | 'gift'
    amount: number
    createdAt: string
    note?: string
  }>
}

export interface HomeState {
  roomTier: 'starter' | 'bedroom' | 'living-room' | 'yard'
  comfort: number
  furniture: Array<{
    id: string
    itemId: string
    x: number
    y: number
    rotation?: number
  }>
}

export interface JobState {
  activeJob?: {
    id: string
    startedAt: string
    endsAt: string
  }
  unlockedJobs: string[]
  completedJobs: number
}

export interface AchievementState {
  unlocked: Array<{
    id: string
    unlockedAt: string
  }>
  exportedCards: number
}

export interface PlannerState {
  today?: {
    date: string
    declaration?: string
    slots: Array<{
      id: string
      title: string
      startsAt?: string
      endsAt?: string
      status: 'planned' | 'done' | 'skipped'
    }>
  }
}

export interface CalendarState {
  provider: 'none' | 'eventkit' | 'ics'
  permissions: {
    granted: boolean
    requestedAt?: string
  }
  blacklistedCalendars: string[]
  auditLockKeywords: string[]
}

export interface ToolRegistryState {
  enabledTools: string[]
  promptsRequiredFor: string[]
  lastUsedAtByTool: Record<string, string>
}

export interface OracleState {
  history: Array<{
    id: string
    deckId: string
    title: string
    createdAt: string
    summary?: string
  }>
}

export interface SystemState {
  vacationMode: {
    enabled: boolean
    until?: string
    reason?: string
  }
  doNotDisturb: {
    enabled: boolean
    startHour?: number
    endHour?: number
  }
  bossKeyEnabled: boolean
  autoLaunchEnabled: boolean
}

export interface AuditLogEntry {
  id: string
  at: string
  actor: 'user' | 'pet-agent' | 'system'
  domain: DomainStateKey | 'pet' | 'reminders' | 'model'
  action: string
  summary: string
  requiresConfirmation?: boolean
  metadata?: Record<string, string | number | boolean | null>
}

export interface AuditState {
  entries: AuditLogEntry[]
}

export interface DomainStateMap {
  inventory: InventoryState
  economy: EconomyState
  home: HomeState
  jobs: JobState
  achievements: AchievementState
  planner: PlannerState
  calendar: CalendarState
  tools: ToolRegistryState
  oracle: OracleState
  system: SystemState
  audit: AuditState
}
