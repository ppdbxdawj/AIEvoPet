import { describe, expect, it } from 'vitest'
import { createDefaultPet } from './default-pet'
import {
  addGitRepoPath,
  appendDiaryRawTurn,
  buildDeterministicNarrative,
  computeConversationStats,
  computeConversationStatsFromRawTurns,
  detectDayBoundary,
  formatDateKey,
  normalizeLedger,
  removeGitRepoPath,
  sealDiaryEntry,
  upsertDiaryEntry
} from './pet-diary'
import { AUTO_MODEL_DIARY_MIN_INTERVAL_MS, shouldAutoComposeDiaryNarrative } from './diary-rollup'
import { createDefaultDiaryLedger } from '../types/diary'
import type { PetDiaryEntry } from '../types/diary'

const makeEntry = (overrides: Partial<PetDiaryEntry> = {}): PetDiaryEntry => ({
  date: overrides.date ?? '2026-04-29',
  refreshedAt: overrides.refreshedAt ?? '2026-04-29T10:00:00.000Z',
  sealed: overrides.sealed ?? false,
  source: overrides.source ?? 'auto',
  narrative: overrides.narrative ?? '',
  narrativeSource: overrides.narrativeSource ?? 'fallback',
  modelNarrativeAt: overrides.modelNarrativeAt,
  modelNarrativeTurnCount: overrides.modelNarrativeTurnCount,
  modelNarrativeImportantEvents: overrides.modelNarrativeImportantEvents,
  conversation: overrides.conversation ?? {
    userMessages: 0,
    userCharacters: 0,
    petBubbles: 0,
    importantEvents: 0,
    memorableEvents: [],
    topCategories: []
  },
  git: overrides.git ?? { totalCommits: 0, totalInsertions: 0, totalDeletions: 0, perRepo: [] },
  activity: overrides.activity ?? { activeMinutes: -1, fullDayCoverage: false },
  userNote: overrides.userNote,
  petDailySummary: overrides.petDailySummary,
  petDominantMood: overrides.petDominantMood,
  rawTurns: overrides.rawTurns
})

describe('formatDateKey', () => {
  it('formats local-time YYYY-MM-DD', () => {
    const date = new Date(2026, 3, 5)
    expect(formatDateKey(date)).toBe('2026-04-05')
  })
})

describe('computeConversationStats', () => {
  it('aggregates events for the target date', () => {
    const pet = createDefaultPet()
    const today = formatDateKey(new Date())
    const ts = new Date()
    ts.setHours(12, 0, 0, 0)
    pet.memory.events = [
      {
        id: 'a',
        ts: ts.toISOString(),
        type: 'chat',
        summary: '哈哈',
        petEmotion: 'excited',
        importance: 1,
        sceneId: 'idle',
        tags: ['chat'],
        category: 'general'
      },
      {
        id: 'b',
        ts: ts.toISOString(),
        type: 'chat',
        summary: '今天上线了新版本',
        petEmotion: 'happy',
        importance: 3,
        sceneId: 'idle',
        tags: ['milestone'],
        category: 'milestone'
      }
    ]
    const result = computeConversationStats(pet, today)
    expect(result.userMessages).toBe(2)
    expect(result.importantEvents).toBe(1)
    expect(result.memorableEvents).toEqual([
      expect.objectContaining({ id: 'b', summary: '今天上线了新版本', importance: 3 })
    ])
    expect(result.topCategories).toContain('milestone')
  })
})

describe('upsertDiaryEntry', () => {
  it('replaces unsealed entries in place', () => {
    const ledger = createDefaultDiaryLedger()
    const entry = makeEntry({ narrative: 'first' })
    const after = upsertDiaryEntry(ledger, entry)
    expect(after.entries['2026-04-29'].narrative).toBe('first')

    const updated = upsertDiaryEntry(after, makeEntry({ narrative: 'second' }))
    expect(updated.entries['2026-04-29'].narrative).toBe('second')
  })

  it('refuses to overwrite sealed entries except for userNote', () => {
    const ledger = createDefaultDiaryLedger()
    const sealed = makeEntry({ narrative: 'sealed', sealed: true })
    const after = upsertDiaryEntry(ledger, sealed)

    // Trying to mutate narrative should be silently ignored.
    const overwritten = upsertDiaryEntry(after, makeEntry({ narrative: 'new', sealed: false }))
    expect(overwritten.entries['2026-04-29'].narrative).toBe('sealed')
    expect(overwritten.entries['2026-04-29'].sealed).toBe(true)

    // But userNote IS allowed to mutate.
    const noted = upsertDiaryEntry(after, makeEntry({ sealed: true, userNote: '这天睡得很差' }))
    expect(noted.entries['2026-04-29'].userNote).toBe('这天睡得很差')
  })
})

describe('sealDiaryEntry', () => {
  it('flips sealed flag and is idempotent', () => {
    let ledger = createDefaultDiaryLedger()
    ledger = upsertDiaryEntry(ledger, makeEntry({ narrative: 'today' }))
    const sealed = sealDiaryEntry(ledger, '2026-04-29')
    expect(sealed.entries['2026-04-29'].sealed).toBe(true)
    const sealedAgain = sealDiaryEntry(sealed, '2026-04-29')
    expect(sealedAgain).toBe(sealed)
  })
})

describe('detectDayBoundary', () => {
  it('returns yesterdayKey when an unsealed entry from yesterday exists', () => {
    const now = new Date(2026, 3, 29, 10, 0, 0)
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayKey = formatDateKey(yesterday)
    const ledger = upsertDiaryEntry(createDefaultDiaryLedger(now.getTime()), makeEntry({ date: yesterdayKey }))
    const result = detectDayBoundary(ledger, now.getTime())
    expect(result.yesterdayKey).toBe(yesterdayKey)
    expect(result.todayKey).toBe(formatDateKey(now))
  })
})

describe('addGitRepoPath / removeGitRepoPath', () => {
  it('avoids duplicates and trims whitespace', () => {
    let ledger = createDefaultDiaryLedger()
    ledger = addGitRepoPath(ledger, '  /tmp/foo  ')
    ledger = addGitRepoPath(ledger, '/tmp/foo')
    expect(ledger.config.gitRepoPaths).toEqual(['/tmp/foo'])
    ledger = removeGitRepoPath(ledger, '/tmp/foo')
    expect(ledger.config.gitRepoPaths).toEqual([])
  })

  it('caps at 25 paths', () => {
    let ledger = createDefaultDiaryLedger()
    for (let i = 0; i < 30; i += 1) {
      ledger = addGitRepoPath(ledger, `/repo/${i}`)
    }
    expect(ledger.config.gitRepoPaths.length).toBeLessThanOrEqual(25)
  })
})

describe('buildDeterministicNarrative', () => {
  it('returns a quiet-day fallback when nothing happened', () => {
    const text = buildDeterministicNarrative(makeEntry())
    expect(text).toContain('今天')
  })

  it('includes commit count when present', () => {
    const text = buildDeterministicNarrative(makeEntry({
      git: {
        totalCommits: 3,
        totalInsertions: 50,
        totalDeletions: 10,
        perRepo: [
          { path: '/x', commits: 3, insertions: 50, deletions: 10 }
        ]
      }
    }))
    expect(text).toContain('3 个 commit')
  })
})

describe('normalizeLedger', () => {
  it('returns default ledger for null input', () => {
    const ledger = normalizeLedger(null)
    expect(ledger.entries).toEqual({})
    expect(ledger.config.gitRepoPaths).toEqual([])
  })

  it('preserves valid entries and drops malformed ones', () => {
    const ledger = normalizeLedger({
      schemaVersion: 1,
      createdAt: '2026-04-01T00:00:00.000Z',
      config: { gitRepoPaths: ['/x'], activityTrackingEnabled: true, todayRollupIntervalMinutes: 30 },
      entries: {
        '2026-04-29': makeEntry({ narrative: 'kept' }),
        '': { narrative: 'no key' }
      }
    })
    expect(ledger.entries['2026-04-29'].narrative).toBe('kept')
    expect(Object.keys(ledger.entries)).toEqual(['2026-04-29'])
    expect(ledger.config.activityTrackingEnabled).toBe(true)
  })

  it('normalizes memorable event details and model narrative metadata', () => {
    const ledger = normalizeLedger({
      entries: {
        '2026-04-29': makeEntry({
          modelNarrativeAt: '2026-04-29T10:00:00.000Z',
          modelNarrativeTurnCount: 6,
          modelNarrativeImportantEvents: 1,
          conversation: {
            userMessages: 1,
            userCharacters: 4,
            petBubbles: 2,
            importantEvents: 1,
            memorableEvents: [
              { id: 'm1', ts: '2026-04-29T10:00:00.000Z', type: 'chat', summary: '聊到发布计划', importance: 3 }
            ],
            topCategories: []
          }
        })
      }
    })
    expect(ledger.entries['2026-04-29'].conversation.memorableEvents).toEqual([
      expect.objectContaining({ summary: '聊到发布计划', importance: 3 })
    ])
    expect(ledger.entries['2026-04-29']).toMatchObject({
      modelNarrativeAt: '2026-04-29T10:00:00.000Z',
      modelNarrativeTurnCount: 6,
      modelNarrativeImportantEvents: 1
    })
  })
})

describe('shouldAutoComposeDiaryNarrative', () => {
  const rawTurns = Array.from({ length: 6 }, (_, index) => ({
    ts: `2026-04-29T10:0${index}:00.000Z`,
    role: index % 2 === 0 ? 'user' as const : 'pet' as const,
    text: `turn ${index}`,
    source: 'chat' as const
  }))

  it('does not run for quiet entries', () => {
    expect(shouldAutoComposeDiaryNarrative(makeEntry(), undefined, Date.now())).toBe(false)
  })

  it('runs after enough new raw turns', () => {
    const entry = makeEntry({ rawTurns })
    expect(shouldAutoComposeDiaryNarrative(entry, undefined, Date.now())).toBe(true)
  })

  it('is blocked by the automatic model throttle', () => {
    const now = new Date('2026-04-29T14:00:00.000Z').getTime()
    const previous = makeEntry({
      modelNarrativeAt: new Date(now - AUTO_MODEL_DIARY_MIN_INTERVAL_MS + 60_000).toISOString(),
      modelNarrativeTurnCount: 0,
      rawTurns: []
    })
    const entry = makeEntry({ rawTurns })
    expect(shouldAutoComposeDiaryNarrative(entry, previous, now)).toBe(false)
  })

  it('runs when important events increase after the throttle window', () => {
    const now = new Date('2026-04-29T18:00:00.000Z').getTime()
    const previous = makeEntry({
      modelNarrativeAt: new Date(now - AUTO_MODEL_DIARY_MIN_INTERVAL_MS - 60_000).toISOString(),
      modelNarrativeImportantEvents: 1,
      conversation: { userMessages: 1, userCharacters: 4, petBubbles: 2, importantEvents: 1, memorableEvents: [], topCategories: [] }
    })
    const entry = makeEntry({
      conversation: { userMessages: 1, userCharacters: 4, petBubbles: 2, importantEvents: 2, memorableEvents: [], topCategories: [] }
    })
    expect(shouldAutoComposeDiaryNarrative(entry, previous, now)).toBe(true)
  })
})

describe('appendDiaryRawTurn / computeConversationStatsFromRawTurns', () => {
  it('captures user and pet turns and counts characters', () => {
    let ledger = createDefaultDiaryLedger()
    ledger = appendDiaryRawTurn(ledger, '2026-04-30', { role: 'user', text: '今天好累', source: 'chat' })
    ledger = appendDiaryRawTurn(ledger, '2026-04-30', { role: 'pet', text: '我陪你', source: 'chat' })
    ledger = appendDiaryRawTurn(ledger, '2026-04-30', { role: 'user', text: '帮我想个方案', source: 'chat' })

    const entry = ledger.entries['2026-04-30']
    expect(entry?.rawTurns).toHaveLength(3)
    const stats = computeConversationStatsFromRawTurns(entry?.rawTurns)
    expect(stats?.userMessages).toBe(2)
    expect(stats?.petBubbles).toBe(1)
    expect(stats?.userCharacters).toBe('今天好累'.length + '帮我想个方案'.length)
  })

  it('drops rawTurns when the entry is sealed', () => {
    let ledger = createDefaultDiaryLedger()
    ledger = appendDiaryRawTurn(ledger, '2026-04-30', { role: 'user', text: 'hello', source: 'chat' })
    ledger = sealDiaryEntry(ledger, '2026-04-30')
    expect(ledger.entries['2026-04-30'].sealed).toBe(true)
    expect(ledger.entries['2026-04-30'].rawTurns).toBeUndefined()
  })

  it('refuses to append to sealed days', () => {
    let ledger = createDefaultDiaryLedger()
    ledger = appendDiaryRawTurn(ledger, '2026-04-30', { role: 'user', text: 'a', source: 'chat' })
    ledger = sealDiaryEntry(ledger, '2026-04-30')
    ledger = appendDiaryRawTurn(ledger, '2026-04-30', { role: 'user', text: 'b', source: 'chat' })
    expect(ledger.entries['2026-04-30'].rawTurns).toBeUndefined()
  })
})
