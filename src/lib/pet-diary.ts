import type {
  PetDiaryActivityStats,
  PetDiaryConversationStats,
  PetDiaryEntry,
  PetDiaryGitStats,
  PetDiaryLedger,
  PetDiaryRawTurn
} from '../types/diary'
import {
  PET_DIARY_SCHEMA_VERSION,
  createDefaultDiaryConfig,
  createDefaultDiaryLedger
} from '../types/diary'
import type { EventMemory, PetData, PetLanguage } from '../types/pet'

/**
 * Diary ledger ops + day-rollup helpers. The ledger is the second
 * persistence layer (after pet.json) that holds the long-term "what
 * happened on this date" log: conversation stats, git activity, system
 * idle minutes, and an LLM/deterministic narrative.
 *
 * Append-only contract (mirrored on the Rust side):
 *   - Sealed days are immutable except for userNote.
 *   - Today's draft refreshes freely until midnight, then gets sealed by
 *     either an explicit close or the next day-boundary rollup.
 */

export const formatDateKey = (date: Date): string => {
  // Use the user's local date so "today" matches what they see on their
  // wall clock. ISO date strings would reflect UTC and confuse anyone
  // outside that zone -- the "what did I do today" view should never
  // straddle a 4 AM line for someone in PDT.
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const startOfDayLocal = (date: Date): Date => {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

const endOfDayLocal = (date: Date): Date => {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

export const dateRangeForKey = (dateKey: string): { since: Date; until: Date } => {
  const [y, m, d] = dateKey.split('-').map((part) => Number.parseInt(part, 10))
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
  return {
    since: start,
    until: endOfDayLocal(start)
  }
}

export const toIso = (date: Date): string => date.toISOString()

/**
 * Defensive normalisation for ledgers loaded from disk. The Rust side
 * already validates shape but we keep an extra layer here so a hand-edited
 * diary.json can't crash the renderer.
 */
export const normalizeLedger = (raw: unknown, now = Date.now()): PetDiaryLedger => {
  const fallback = createDefaultDiaryLedger(now)
  if (!raw || typeof raw !== 'object') return fallback

  const input = raw as Partial<PetDiaryLedger> & { entries?: unknown }
  const ledger: PetDiaryLedger = {
    schemaVersion: typeof input.schemaVersion === 'number' ? input.schemaVersion : PET_DIARY_SCHEMA_VERSION,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : fallback.createdAt,
    config: { ...createDefaultDiaryConfig(), ...(input.config ?? {}) },
    entries: {}
  }

  if (input.entries && typeof input.entries === 'object' && !Array.isArray(input.entries)) {
    for (const [key, value] of Object.entries(input.entries as Record<string, unknown>)) {
      const entry = normalizeEntry(key, value)
      if (entry) ledger.entries[entry.date] = entry
    }
  }

  // Hard cap on retained days so a multi-year run doesn't blow past a
  // sensible disk footprint. We keep the most recent 365 days.
  const sortedKeys = Object.keys(ledger.entries).sort().slice(-365)
  ledger.entries = Object.fromEntries(sortedKeys.map((key) => [key, ledger.entries[key]]))

  return ledger
}

const normalizeEntry = (key: string, raw: unknown): PetDiaryEntry | null => {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Partial<PetDiaryEntry>
  if (typeof input.date !== 'string' && !key) return null
  const date = typeof input.date === 'string' ? input.date : key
  return {
    date,
    refreshedAt: typeof input.refreshedAt === 'string' ? input.refreshedAt : new Date().toISOString(),
    sealed: Boolean(input.sealed),
    source: input.source === 'manual' ? 'manual' : 'auto',
    narrative: typeof input.narrative === 'string' ? input.narrative : '',
    narrativeSource: input.narrativeSource === 'model' ? 'model' : 'fallback',
    modelNarrativeAt: typeof input.modelNarrativeAt === 'string' ? input.modelNarrativeAt : undefined,
    modelNarrativeTurnCount: typeof input.modelNarrativeTurnCount === 'number' ? input.modelNarrativeTurnCount : undefined,
    modelNarrativeImportantEvents: typeof input.modelNarrativeImportantEvents === 'number' ? input.modelNarrativeImportantEvents : undefined,
    conversation: normalizeConversation(input.conversation),
    git: normalizeGit(input.git),
    activity: normalizeActivity(input.activity),
    userNote: typeof input.userNote === 'string' ? input.userNote : undefined,
    petDailySummary: typeof input.petDailySummary === 'string' ? input.petDailySummary : undefined,
    petDominantMood: typeof input.petDominantMood === 'string' ? input.petDominantMood : undefined,
    rawTurns: normalizeRawTurns((input as { rawTurns?: unknown }).rawTurns)
  }
}

const RAW_TURN_TEXT_CAP = 320
const RAW_TURN_PER_DAY_CAP = 800

const normalizeRawTurns = (raw: unknown): PetDiaryRawTurn[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const cleaned: PetDiaryRawTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<PetDiaryRawTurn>
    const text = typeof candidate.text === 'string' ? candidate.text.trim() : ''
    if (!text) continue
    const role = candidate.role === 'pet' ? 'pet' : 'user'
    const source = candidate.source === 'coding' ? 'coding' : 'chat'
    const ts = typeof candidate.ts === 'string' && candidate.ts ? candidate.ts : new Date().toISOString()
    cleaned.push({ ts, role, text: text.slice(0, RAW_TURN_TEXT_CAP), source })
  }
  if (cleaned.length === 0) return undefined
  return cleaned.slice(-RAW_TURN_PER_DAY_CAP)
}

const normalizeConversation = (raw: unknown): PetDiaryConversationStats => {
  const empty: PetDiaryConversationStats = {
    userMessages: 0,
    userCharacters: 0,
    petBubbles: 0,
    importantEvents: 0,
    memorableEvents: [],
    topCategories: []
  }
  if (!raw || typeof raw !== 'object') return empty
  const input = raw as Partial<PetDiaryConversationStats>
  const memorableEvents = Array.isArray(input.memorableEvents)
    ? input.memorableEvents.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const candidate = item as Partial<NonNullable<PetDiaryConversationStats['memorableEvents']>[number]>
        const summary = typeof candidate.summary === 'string' ? candidate.summary.trim() : ''
        if (!summary) return []
        const importance: 1 | 2 | 3 = candidate.importance === 3 ? 3 : candidate.importance === 1 ? 1 : 2
        return [{
          id: typeof candidate.id === 'string' && candidate.id ? candidate.id : crypto.randomUUID(),
          ts: typeof candidate.ts === 'string' && candidate.ts ? candidate.ts : new Date().toISOString(),
          type: typeof candidate.type === 'string' && candidate.type ? candidate.type : 'chat',
          summary: summary.slice(0, 160),
          importance,
          category: typeof candidate.category === 'string' ? candidate.category : undefined
        }]
      }).slice(0, 8)
    : []
  return {
    userMessages: Number(input.userMessages ?? 0) || 0,
    userCharacters: Number(input.userCharacters ?? 0) || 0,
    petBubbles: Number(input.petBubbles ?? 0) || 0,
    importantEvents: Number(input.importantEvents ?? memorableEvents.length) || 0,
    memorableEvents,
    topCategories: Array.isArray(input.topCategories)
      ? input.topCategories.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : []
  }
}

const normalizeGit = (raw: unknown): PetDiaryGitStats => {
  const empty: PetDiaryGitStats = {
    totalCommits: 0,
    totalInsertions: 0,
    totalDeletions: 0,
    perRepo: []
  }
  if (!raw || typeof raw !== 'object') return empty
  const input = raw as Partial<PetDiaryGitStats>
  return {
    totalCommits: Number(input.totalCommits ?? 0) || 0,
    totalInsertions: Number(input.totalInsertions ?? 0) || 0,
    totalDeletions: Number(input.totalDeletions ?? 0) || 0,
    perRepo: Array.isArray(input.perRepo)
      ? input.perRepo.filter((entry): entry is PetDiaryGitStats['perRepo'][number] =>
          Boolean(entry && typeof (entry as { path?: unknown }).path === 'string'))
      : []
  }
}

const normalizeActivity = (raw: unknown): PetDiaryActivityStats => {
  const empty: PetDiaryActivityStats = {
    activeMinutes: -1,
    fullDayCoverage: false
  }
  if (!raw || typeof raw !== 'object') return empty
  const input = raw as Partial<PetDiaryActivityStats>
  return {
    activeMinutes: typeof input.activeMinutes === 'number' ? input.activeMinutes : -1,
    firstActiveAt: typeof input.firstActiveAt === 'string' ? input.firstActiveAt : undefined,
    lastActiveAt: typeof input.lastActiveAt === 'string' ? input.lastActiveAt : undefined,
    fullDayCoverage: Boolean(input.fullDayCoverage)
  }
}

/**
 * Compute conversation stats from a today's raw transcript when available.
 * Returns null when the entry has no rawTurns (caller falls back to the
 * pet.memory.events path).
 */
export const computeConversationStatsFromRawTurns = (
  rawTurns: PetDiaryRawTurn[] | undefined
): PetDiaryConversationStats | null => {
  if (!rawTurns || rawTurns.length === 0) return null
  let userMessages = 0
  let userCharacters = 0
  let petBubbles = 0
  for (const turn of rawTurns) {
    if (turn.role === 'user') {
      userMessages += 1
      userCharacters += turn.text.length
    } else if (turn.role === 'pet') {
      petBubbles += 1
    }
  }
  return {
    userMessages,
    userCharacters,
    petBubbles,
    importantEvents: 0,
    memorableEvents: [],
    topCategories: []
  }
}

/**
 * Append one raw chat turn onto today's draft entry. Creates the entry if
 * it doesn't exist. Sealed days are immutable so we silently drop the
 * append (matches the contract elsewhere). Caps both per-message length
 * and total per-day count to keep diary.json bounded.
 */
export const appendDiaryRawTurn = (
  ledger: PetDiaryLedger,
  dateKey: string,
  turn: Omit<PetDiaryRawTurn, 'ts'> & { ts?: string },
  now = Date.now()
): PetDiaryLedger => {
  const text = turn.text.trim()
  if (!text) return ledger
  const existing = ledger.entries[dateKey]
  if (existing?.sealed) return ledger
  const nowIso = new Date(now).toISOString()
  const cleaned: PetDiaryRawTurn = {
    ts: turn.ts ?? nowIso,
    role: turn.role,
    source: turn.source,
    text: text.slice(0, RAW_TURN_TEXT_CAP)
  }
  const nextRawTurns = [...(existing?.rawTurns ?? []), cleaned].slice(-RAW_TURN_PER_DAY_CAP)
  const draft: PetDiaryEntry = existing
    ? { ...existing, refreshedAt: nowIso, rawTurns: nextRawTurns }
    : {
        date: dateKey,
        refreshedAt: nowIso,
        sealed: false,
        source: 'auto',
        narrative: '',
        narrativeSource: 'fallback',
        conversation: { userMessages: 0, userCharacters: 0, petBubbles: 0, importantEvents: 0, memorableEvents: [], topCategories: [] },
        git: { totalCommits: 0, totalInsertions: 0, totalDeletions: 0, perRepo: [] },
        activity: { activeMinutes: -1, fullDayCoverage: false },
        rawTurns: nextRawTurns
      }
  return upsertDiaryEntry(ledger, draft)
}

/**
 * Compute conversation stats for `dateKey` directly from pet.memory.events.
 * Cheap, deterministic, no LLM. Used both by today's rollup and by
 * back-filling the first day after install.
 */
export const computeConversationStats = (pet: PetData, dateKey: string): PetDiaryConversationStats => {
  const { since, until } = dateRangeForKey(dateKey)
  const sinceMs = since.getTime()
  const untilMs = until.getTime()
  const dayEvents: EventMemory[] = pet.memory.events.filter((event) => {
    const ts = new Date(event.ts).getTime()
    return Number.isFinite(ts) && ts >= sinceMs && ts <= untilMs
  })

  const userMessages = dayEvents.filter((event) => event.type === 'chat').length
  const userCharacters = dayEvents
    .filter((event) => event.type === 'chat')
    .reduce((sum, event) => sum + (event.summary?.length ?? 0), 0)
  const petBubbles = dayEvents.length
  const memorableEvents = dayEvents
    .filter((event) => (event.importance ?? 1) >= 2 && event.summary.trim())
    .sort((left, right) => {
      const importanceDelta = (right.importance ?? 1) - (left.importance ?? 1)
      if (importanceDelta !== 0) return importanceDelta
      return new Date(right.ts).getTime() - new Date(left.ts).getTime()
    })
    .slice(0, 8)
    .map((event) => ({
      id: event.id,
      ts: event.ts,
      type: event.type,
      summary: event.summary.trim().slice(0, 160),
      importance: event.importance,
      category: event.category
    }))
  const importantEvents = dayEvents.filter((event) => (event.importance ?? 1) >= 2).length

  const categoryCounts = new Map<string, number>()
  for (const event of dayEvents) {
    const cat = event.category ?? 'general'
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1)
  }
  const topCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key)

  return {
    userMessages,
    userCharacters,
    petBubbles,
    importantEvents,
    memorableEvents,
    topCategories
  }
}

/**
 * Walk pet.memory.daily for a matching date and lift its summary + mood
 * onto the diary entry so historical days survive even after that daily
 * entry rolls out of the 7-day pet.memory window.
 */
export const extractPetDailyFields = (pet: PetData, dateKey: string) => {
  const day = pet.memory.daily.find((entry) => entry.date === dateKey)
  if (!day) return { petDailySummary: undefined, petDominantMood: undefined }
  return {
    petDailySummary: day.summary,
    petDominantMood: day.dominantMood
  }
}

/**
 * Stitch the day's collected stats into a deterministic narrative. Used as
 * the fallback when the LLM is unavailable AND surfaced in tests so we know
 * non-empty days always render something readable.
 */
export const buildDeterministicNarrative = (
  entry: Pick<PetDiaryEntry, 'conversation' | 'git' | 'activity' | 'petDailySummary'>,
  language: PetLanguage = 'zh-CN'
): string => {
  const parts: string[] = []
  const { conversation, git, activity, petDailySummary } = entry
  const english = language === 'en-US'

  if (conversation.userMessages > 0) {
    parts.push(english
      ? `You chatted with it ${conversation.userMessages} time${conversation.userMessages === 1 ? '' : 's'} today${conversation.importantEvents > 0 ? `, with ${conversation.importantEvents} moment${conversation.importantEvents === 1 ? '' : 's'} worth remembering` : ''}`
      : `今天和它聊了 ${conversation.userMessages} 句${conversation.importantEvents > 0 ? `（其中 ${conversation.importantEvents} 件值得记下来）` : ''}`)
  }

  if (git.totalCommits > 0) {
    const repoCount = git.perRepo.filter((entry) => entry.commits > 0).length
    parts.push(english
      ? `You made ${git.totalCommits} commit${git.totalCommits === 1 ? '' : 's'} across ${repoCount} repositor${repoCount === 1 ? 'y' : 'ies'} (+${git.totalInsertions} / -${git.totalDeletions})`
      : `提交了 ${git.totalCommits} 个 commit，覆盖 ${repoCount} 个仓库（+${git.totalInsertions} / -${git.totalDeletions}）`)
  }

  if (activity.activeMinutes > 0) {
    const hours = Math.floor(activity.activeMinutes / 60)
    const minutes = activity.activeMinutes % 60
    const span = activity.firstActiveAt && activity.lastActiveAt
      ? `${activity.firstActiveAt}-${activity.lastActiveAt}`
      : ''
    const coverageHint = activity.fullDayCoverage ? '' : english ? ' (partial online coverage)' : '（部分时段在线）'
    const duration = english
      ? `${hours > 0 ? `${hours} hour${hours === 1 ? '' : 's'} ` : ''}${minutes} minute${minutes === 1 ? '' : 's'}`
      : `${hours > 0 ? `${hours} 小时 ` : ''}${minutes} 分钟`
    parts.push(english
      ? `You were active at the computer for ${duration}${span ? ` (${span})` : ''}${coverageHint}`
      : `电脑前活跃 ${duration}${span ? `（${span}）` : ''}${coverageHint}`)
  }

  if (petDailySummary) parts.push(petDailySummary)

  if (parts.length === 0) {
    return english ? 'Today was quiet, with nothing special recorded.' : '今天比较安静，没有特别记录的事情发生。'
  }

  return parts.join(english ? '; ' : '；') + (english ? '.' : '。')
}

/**
 * Append-only writer. For sealed days we silently keep the existing entry
 * (the on-disk merge enforces this too, but doing it client-side avoids
 * redundant round-trips). For unsealed days we replace the whole entry --
 * the rollup recomputes everything from scratch each time.
 */
export const upsertDiaryEntry = (
  ledger: PetDiaryLedger,
  entry: PetDiaryEntry
): PetDiaryLedger => {
  const existing = ledger.entries[entry.date]
  if (existing?.sealed) {
    // Honour the sealed contract: only userNote may be replaced.
    if (entry.userNote !== undefined && entry.userNote !== existing.userNote) {
      return {
        ...ledger,
        entries: {
          ...ledger.entries,
          [entry.date]: { ...existing, userNote: entry.userNote }
        }
      }
    }
    return ledger
  }
  return {
    ...ledger,
    entries: {
      ...ledger.entries,
      [entry.date]: entry
    }
  }
}

/**
 * Seal an entry. Idempotent. Used both by the day-boundary rollup and by
 * the explicit "归档今天" panel button when the user wants to lock things in.
 */
export const sealDiaryEntry = (ledger: PetDiaryLedger, dateKey: string, now = Date.now()): PetDiaryLedger => {
  const existing = ledger.entries[dateKey]
  if (!existing || existing.sealed) return ledger
  // Drop rawTurns at seal time. The narrative + conversation counters are
  // already on the entry, and we don't want every sealed day's full
  // transcript hanging around in diary.json forever.
  const { rawTurns: _drop, ...rest } = existing
  void _drop
  return {
    ...ledger,
    entries: {
      ...ledger.entries,
      [dateKey]: {
        ...rest,
        sealed: true,
        refreshedAt: new Date(now).toISOString()
      }
    }
  }
}

/**
 * Returns yesterday's key when crossed-into-today since the last refresh.
 * Used by the scheduler to know whether yesterday needs to be sealed.
 */
export const detectDayBoundary = (
  ledger: PetDiaryLedger,
  now = Date.now()
): { yesterdayKey?: string; todayKey: string } => {
  const todayKey = formatDateKey(new Date(now))
  // Yesterday's key is yesterday in local time.
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayKey = formatDateKey(yesterdayDate)
  const yesterdayEntry = ledger.entries[yesterdayKey]
  if (yesterdayEntry && !yesterdayEntry.sealed) {
    return { yesterdayKey, todayKey }
  }
  return { todayKey }
}

export const setDiaryConfig = (
  ledger: PetDiaryLedger,
  patch: Partial<PetDiaryLedger['config']>
): PetDiaryLedger => ({
  ...ledger,
  config: { ...ledger.config, ...patch }
})

export const addGitRepoPath = (ledger: PetDiaryLedger, rawPath: string): PetDiaryLedger => {
  const path = rawPath.trim()
  if (!path) return ledger
  if (ledger.config.gitRepoPaths.includes(path)) return ledger
  return setDiaryConfig(ledger, {
    gitRepoPaths: [...ledger.config.gitRepoPaths, path].slice(0, 25)
  })
}

export const removeGitRepoPath = (ledger: PetDiaryLedger, rawPath: string): PetDiaryLedger => {
  const path = rawPath.trim()
  return setDiaryConfig(ledger, {
    gitRepoPaths: ledger.config.gitRepoPaths.filter((entry) => entry !== path)
  })
}

/**
 * Convenience: pull the entries out as a date-sorted array suitable for
 * rendering a calendar grid. Newest first.
 */
export const listEntriesNewestFirst = (ledger: PetDiaryLedger): PetDiaryEntry[] => {
  return Object.values(ledger.entries).sort((a, b) => (a.date > b.date ? -1 : 1))
}
