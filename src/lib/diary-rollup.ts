import { petPlatform } from '../platform/pet-platform'
import type { PetData } from '../types/pet'
import type { PetDiaryConversationStats, PetDiaryEntry, PetDiaryLedger } from '../types/diary'
import {
  buildDeterministicNarrative,
  computeConversationStats,
  computeConversationStatsFromRawTurns,
  dateRangeForKey,
  detectDayBoundary,
  extractPetDailyFields,
  formatDateKey,
  sealDiaryEntry,
  toIso,
  upsertDiaryEntry
} from './pet-diary'

/**
 * Scheduler-facing roll-up. Pulls the day's stats from every collector
 * (conversation events, git, idle sampler) and writes a fresh draft entry
 * for the target date. The Rust merge layer enforces append-only on
 * sealed days; this function never tries to overwrite one.
 *
 * Intentionally pure-ish: it asks the platform for raw stats, then folds
 * them in via deterministic helpers. No LLM call here -- the narrative
 * regen lives in `composeDiaryNarrative` so the cheap path can run on a
 * timer without paying inference cost.
 */

export interface RollupResult {
  ledger: PetDiaryLedger
  entry: PetDiaryEntry
  // True when the entry actually changed (we recompute every tick but only
  // want the controller to commit when something is different). Compares
  // on stat values only, ignoring refreshedAt.
  changed: boolean
}

export const AUTO_MODEL_DIARY_MIN_INTERVAL_MS = 4 * 60 * 60 * 1000
export const AUTO_MODEL_DIARY_MIN_NEW_TURNS = 6

const sameMemorableEvents = (
  left: PetDiaryConversationStats['memorableEvents'],
  right: PetDiaryConversationStats['memorableEvents']
): boolean => JSON.stringify(left ?? []) === JSON.stringify(right ?? [])

export const shouldAutoComposeDiaryNarrative = (
  entry: PetDiaryEntry,
  previousEntry: PetDiaryEntry | undefined,
  now = Date.now()
): boolean => {
  if (entry.sealed) return false
  const rawTurnCount = entry.rawTurns?.length ?? 0
  const importantEvents = entry.conversation.importantEvents
  const hasMeaningfulContent = rawTurnCount > 0 || importantEvents > 0 || entry.git.totalCommits > 0 || entry.activity.activeMinutes > 0
  if (!hasMeaningfulContent) return false

  const lastModelAt = previousEntry?.modelNarrativeAt ?? entry.modelNarrativeAt
  if (lastModelAt) {
    const lastModelAtMs = new Date(lastModelAt).getTime()
    if (Number.isFinite(lastModelAtMs) && now - lastModelAtMs < AUTO_MODEL_DIARY_MIN_INTERVAL_MS) return false
  }

  const lastTurnCount = previousEntry?.modelNarrativeTurnCount ?? entry.modelNarrativeTurnCount ?? 0
  if (rawTurnCount - lastTurnCount >= AUTO_MODEL_DIARY_MIN_NEW_TURNS) return true

  const lastImportantEvents = previousEntry?.modelNarrativeImportantEvents ?? entry.modelNarrativeImportantEvents ?? 0
  if (importantEvents > lastImportantEvents) return true

  return !lastModelAt && hasMeaningfulContent
}

const sameStats = (a: PetDiaryEntry | undefined, b: PetDiaryEntry): boolean => {
  if (!a) return false
  if (a.sealed) return true
  return (
    a.conversation.userMessages === b.conversation.userMessages &&
    a.conversation.userCharacters === b.conversation.userCharacters &&
    a.conversation.petBubbles === b.conversation.petBubbles &&
    a.conversation.importantEvents === b.conversation.importantEvents &&
    sameMemorableEvents(a.conversation.memorableEvents, b.conversation.memorableEvents) &&
    a.git.totalCommits === b.git.totalCommits &&
    a.git.totalInsertions === b.git.totalInsertions &&
    a.git.totalDeletions === b.git.totalDeletions &&
    a.activity.activeMinutes === b.activity.activeMinutes &&
    a.petDailySummary === b.petDailySummary
  )
}

export const collectDiaryEntry = async (
  pet: PetData,
  ledger: PetDiaryLedger,
  dateKey: string,
  now = Date.now()
): Promise<PetDiaryEntry> => {
  const { since, until } = dateRangeForKey(dateKey)
  const existingEntry = ledger.entries[dateKey]
  const existingConversation = existingEntry?.conversation
  // Prefer today's full transcript when we have it -- that's the source of
  // truth, not the "worth remembering" event ring buffer. Fall back to the
  // event-derived stats only when rawTurns is missing (e.g. older entries
  // saved before we started capturing them).
  const fromRaw = computeConversationStatsFromRawTurns(existingEntry?.rawTurns)
  const fromEvents = computeConversationStats(pet, dateKey)
  const baseConversation = fromRaw ?? fromEvents
  const memorableEvents = fromEvents.memorableEvents && fromEvents.memorableEvents.length > 0
    ? fromEvents.memorableEvents
    : (existingConversation?.memorableEvents ?? [])
  const conversation: PetDiaryConversationStats = {
    userMessages: Math.max(baseConversation.userMessages, existingConversation?.userMessages ?? 0),
    userCharacters: Math.max(baseConversation.userCharacters, existingConversation?.userCharacters ?? 0),
    petBubbles: Math.max(baseConversation.petBubbles, existingConversation?.petBubbles ?? 0),
    // importantEvents still comes from the curated event log -- raw turns
    // don't carry importance flags themselves.
    importantEvents: Math.max(fromEvents.importantEvents, existingConversation?.importantEvents ?? 0, memorableEvents.length),
    memorableEvents,
    topCategories: fromEvents.topCategories.length > 0
      ? fromEvents.topCategories
      : (existingConversation?.topCategories ?? [])
  }
  const dailyFields = extractPetDailyFields(pet, dateKey)

  // Git stats: only call when the user has paths configured. Skipping the
  // call when paths are empty avoids a needless `git` shell-out + lets the
  // unit tests run without mocking the platform.
  let git = ledger.entries[dateKey]?.git ?? {
    totalCommits: 0,
    totalInsertions: 0,
    totalDeletions: 0,
    perRepo: []
  }
  if (ledger.config.gitRepoPaths.length > 0) {
    try {
      git = await petPlatform.getGitDiaryStats(
        ledger.config.gitRepoPaths,
        toIso(since),
        toIso(until)
      )
    } catch (error) {
      console.warn('[diary] git stats failed', error)
    }
  }

  let activity = ledger.entries[dateKey]?.activity ?? {
    activeMinutes: -1,
    fullDayCoverage: false
  }
  if (ledger.config.activityTrackingEnabled) {
    try {
      activity = await petPlatform.getActiveMinutes(dateKey)
    } catch (error) {
      console.warn('[diary] activity sampler failed', error)
    }
  }

  const draftEntry: PetDiaryEntry = {
    date: dateKey,
    refreshedAt: new Date(now).toISOString(),
    sealed: false,
    source: 'auto',
    narrative: '',
    narrativeSource: 'fallback',
    conversation,
    git,
    activity,
    userNote: ledger.entries[dateKey]?.userNote,
    modelNarrativeAt: existingEntry?.modelNarrativeAt,
    modelNarrativeTurnCount: existingEntry?.modelNarrativeTurnCount,
    modelNarrativeImportantEvents: existingEntry?.modelNarrativeImportantEvents,
    petDailySummary: dailyFields.petDailySummary,
    petDominantMood: dailyFields.petDominantMood,
    // Preserve the raw transcript across rollups -- it gets dropped only
    // when the day is sealed.
    rawTurns: existingEntry?.rawTurns
  }

  // Always have *some* narrative on disk so the calendar never renders an
  // empty card. If composeDiaryNarrative succeeds later the controller will
  // do a second commit with the model-sourced text.
  draftEntry.narrative = buildDeterministicNarrative(draftEntry, pet.ui.language ?? 'zh-CN')

  return draftEntry
}

export const runDiaryRollup = async (
  pet: PetData,
  ledger: PetDiaryLedger,
  options: { now?: number; dateKey?: string } = {}
): Promise<RollupResult> => {
  const now = options.now ?? Date.now()
  const targetKey = options.dateKey ?? formatDateKey(new Date(now))

  // First: if the day boundary just crossed, seal yesterday before
  // overwriting today.
  let nextLedger = ledger
  const boundary = detectDayBoundary(nextLedger, now)
  if (boundary.yesterdayKey) {
    nextLedger = sealDiaryEntry(nextLedger, boundary.yesterdayKey, now)
  }

  const draft = await collectDiaryEntry(pet, nextLedger, targetKey, now)
  const previousEntry = nextLedger.entries[targetKey]
  const changed = !sameStats(previousEntry, draft) || boundary.yesterdayKey !== undefined

  nextLedger = upsertDiaryEntry(nextLedger, draft)

  return { ledger: nextLedger, entry: draft, changed }
}

/**
 * Optional second pass: ask the LLM for a narrative. Call sites can decide
 * whether to invoke this (e.g. only on user-visible refreshes, or only
 * once per day). The pet-llm summary path already supports a "diary"
 * target which we'll add support for in a future iteration; for now we
 * use a special prompt context ourselves.
 */
export const composeDiaryNarrative = async (
  pet: PetData,
  entry: PetDiaryEntry,
  modelGenerate?: (prompt: string) => Promise<string>
): Promise<{ narrative: string; source: 'model' | 'fallback' }> => {
  const language = pet.ui.language ?? 'zh-CN'
  const english = language === 'en-US'
  if (!modelGenerate) {
    return { narrative: buildDeterministicNarrative(entry, language), source: 'fallback' }
  }

  // Today's transcript fed in as compact dialogue lines so the model can
  // talk about the actual content. We cap at the most recent 30 turns so
  // the prompt never balloons; that's enough to capture conversation arc
  // for a casual diary entry.
  const recentTurns = (entry.rawTurns ?? []).slice(-30)
  const transcriptLines = recentTurns.map((turn) => {
    const speaker = turn.role === 'user'
      ? (english ? 'You' : '你')
      : (english ? 'Pet' : '它')
    const time = turn.ts ? new Date(turn.ts).toTimeString().slice(0, 5) : ''
    const prefix = time ? `[${time}] ${speaker}` : speaker
    return `${prefix}: ${turn.text}`.slice(0, 220)
  })
  const transcriptHeader = english
    ? `Today's chat transcript (${recentTurns.length} most recent turns):`
    : `今天的对话节选（最近 ${recentTurns.length} 句）：`
  const transcriptBlock = recentTurns.length > 0
    ? [transcriptHeader, ...transcriptLines]
    : []
  const memorableLines = (entry.conversation.memorableEvents ?? []).slice(0, 8).map((event) => {
    const time = event.ts ? new Date(event.ts).toTimeString().slice(0, 5) : ''
    const label = time ? `[${time}]` : '-'
    return `${label} ${event.summary}`.slice(0, 190)
  })
  const memorableBlock = memorableLines.length > 0
    ? [english ? 'Memorable event details:' : '值得记下来的具体事件：', ...memorableLines]
    : []

  // Bullet-point input keeps even tiny local models on-task.
  const prompt = english ? [
    'You are a desktop companion pet helping the user write a small diary entry about what happened today.',
    'Use 2-3 natural, warm English sentences. Do not write a data list.',
    'If a metric is 0 or missing, skip it. Do not say "no data".',
    'When a chat transcript is provided, ground the diary in what was actually said.',
    `Date: ${entry.date}`,
    `User chat messages: ${entry.conversation.userMessages}`,
    `Memorable events: ${entry.conversation.importantEvents}`,
    ...memorableBlock,
    `Git commits: ${entry.git.totalCommits} commits, +${entry.git.totalInsertions} / -${entry.git.totalDeletions}`,
    entry.activity.activeMinutes >= 0
      ? `Computer activity: ${entry.activity.activeMinutes} minutes${entry.activity.firstActiveAt && entry.activity.lastActiveAt ? `, span ${entry.activity.firstActiveAt}-${entry.activity.lastActiveAt}` : ''}`
      : 'Computer activity: not tracked',
    entry.petDailySummary ? `Pet-side daily summary: ${entry.petDailySummary}` : '',
    ...transcriptBlock
  ].filter(Boolean).join('\n') : [
    '你是一只桌面陪伴宠物，正在帮主人写"今天发生了什么"的小日记。',
    '用 2-3 句简体中文，自然亲切，不要写成数据列表。',
    '如果某项数据是 0 或缺失，就别提它，不要说"没有数据"。',
    '如果给了对话节选，请基于真实聊到的内容来写。',
    `日期：${entry.date}`,
    `用户聊天数：${entry.conversation.userMessages} 句`,
    `值得记下来的事件：${entry.conversation.importantEvents} 件`,
    ...memorableBlock,
    `Git 提交：${entry.git.totalCommits} 个 commit, +${entry.git.totalInsertions} / -${entry.git.totalDeletions}`,
    entry.activity.activeMinutes >= 0
      ? `电脑活跃：${entry.activity.activeMinutes} 分钟${entry.activity.firstActiveAt && entry.activity.lastActiveAt ? `，时间段 ${entry.activity.firstActiveAt}-${entry.activity.lastActiveAt}` : ''}`
      : '电脑活跃：未追踪',
    entry.petDailySummary ? `宠物视角的当日小结：${entry.petDailySummary}` : '',
    ...transcriptBlock
  ].filter(Boolean).join('\n')

  try {
    const raw = await modelGenerate(prompt)
    const trimmed = raw.trim().slice(0, 320)
    if (trimmed) return { narrative: trimmed, source: 'model' }
  } catch (error) {
    console.warn('[diary] narrative generation failed', error)
  }
  return { narrative: buildDeterministicNarrative(entry, language), source: 'fallback' }
}
