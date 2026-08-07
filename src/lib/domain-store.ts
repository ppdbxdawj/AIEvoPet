import type {
  AchievementState,
  AuditLogEntry,
  AuditState,
  CalendarState,
  DomainStateEnvelope,
  DomainStateKey,
  DomainStateMap,
  EconomyState,
  HomeState,
  InventoryState,
  JobState,
  OracleState,
  PlannerState,
  SystemState,
  ToolRegistryState
} from '../types/domain'

const nowIso = () => new Date().toISOString()
const DOMAIN_SCHEMA_VERSION = 1

const createInventoryState = (): InventoryState => ({
  items: [],
  equippedWardrobeSlots: {}
})

const createEconomyState = (): EconomyState => ({
  pawcoin: 0,
  lifetimeEarned: 0,
  lifetimeSpent: 0,
  pendingRewards: []
})

const createHomeState = (): HomeState => ({
  roomTier: 'starter',
  comfort: 0,
  furniture: []
})

const createJobState = (): JobState => ({
  unlockedJobs: [],
  completedJobs: 0
})

const createAchievementState = (): AchievementState => ({
  unlocked: [],
  exportedCards: 0
})

const createPlannerState = (): PlannerState => ({})

const createCalendarState = (): CalendarState => ({
  provider: 'none',
  permissions: {
    granted: false
  },
  blacklistedCalendars: [],
  auditLockKeywords: []
})

const createToolRegistryState = (): ToolRegistryState => ({
  enabledTools: ['reminder.create', 'memory.update', 'interaction.run', 'scene.hint'],
  promptsRequiredFor: [],
  lastUsedAtByTool: {}
})

const createOracleState = (): OracleState => ({
  history: []
})

const createSystemState = (): SystemState => ({
  vacationMode: {
    enabled: false
  },
  doNotDisturb: {
    enabled: false
  },
  bossKeyEnabled: false,
  autoLaunchEnabled: false
})

const createAuditState = (): AuditState => ({
  entries: []
})

export const createDefaultDomainData = <T extends DomainStateKey>(key: T): DomainStateMap[T] => {
  switch (key) {
    case 'inventory':
      return createInventoryState() as DomainStateMap[T]
    case 'economy':
      return createEconomyState() as DomainStateMap[T]
    case 'home':
      return createHomeState() as DomainStateMap[T]
    case 'jobs':
      return createJobState() as DomainStateMap[T]
    case 'achievements':
      return createAchievementState() as DomainStateMap[T]
    case 'planner':
      return createPlannerState() as DomainStateMap[T]
    case 'calendar':
      return createCalendarState() as DomainStateMap[T]
    case 'tools':
      return createToolRegistryState() as DomainStateMap[T]
    case 'oracle':
      return createOracleState() as DomainStateMap[T]
    case 'system':
      return createSystemState() as DomainStateMap[T]
    case 'audit':
      return createAuditState() as DomainStateMap[T]
  }
}

export const createDefaultDomainEnvelope = <T extends DomainStateKey>(key: T): DomainStateEnvelope<DomainStateMap[T]> => ({
  schemaVersion: DOMAIN_SCHEMA_VERSION,
  updatedAt: nowIso(),
  data: createDefaultDomainData(key)
})

export const normalizeDomainEnvelope = <T extends DomainStateKey>(
  key: T,
  value: unknown
): DomainStateEnvelope<DomainStateMap[T]> => {
  const fallback = createDefaultDomainEnvelope(key)
  if (!value || typeof value !== 'object') return fallback

  const raw = value as Partial<DomainStateEnvelope<DomainStateMap[T]>>
  return {
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : fallback.schemaVersion,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
    data: (raw.data && typeof raw.data === 'object' ? raw.data : fallback.data) as DomainStateMap[T]
  }
}

export const appendAuditEntry = (
  audit: DomainStateEnvelope<AuditState>,
  entry: AuditLogEntry
): DomainStateEnvelope<AuditState> => ({
  ...audit,
  updatedAt: nowIso(),
  data: {
    entries: [entry, ...audit.data.entries].slice(0, 200)
  }
})
