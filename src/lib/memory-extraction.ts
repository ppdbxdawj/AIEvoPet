import type { PetEventCategory } from '../types/pet'

/**
 * Keyword-based, deterministic event extraction. Used as a fallback when the
 * LLM doesn't supply explicit memoryImportance/memoryCategory, and as a sanity
 * floor on top of LLM output (so the model can't accidentally label a "妈妈住
 * 院" message as importance=1).
 *
 * Intentionally Chinese-first because that's the deployment locale; English
 * support is handled by additional patterns where they overlap (e.g. "family",
 * "boss"). All matchers are case-insensitive on the latin side.
 */

interface KeywordBucket {
  category: PetEventCategory
  // Importance the keyword bumps the event up to. We always take the maximum
  // across matched buckets so a "妈妈生病" message hits both people + health
  // and lands at importance 3.
  importance: 1 | 2 | 3
  pattern: RegExp
}

const KEYWORD_BUCKETS: ReadonlyArray<KeywordBucket> = [
  // Life-changing milestone keywords -- highest signal, almost always worth
  // pinning forever.
  {
    category: 'milestone',
    importance: 3,
    pattern: /(结婚|分手|离婚|订婚|领证|怀孕|生孩子|出生|去世|过世|离世|搬家|搬走|出国|留学|回国|入职|辞职|离职|裁员|被裁|发版|上线|发布|拿到|拿下|考上|考过|录取|毕业|搬到|开学|住院|手术|确诊|生日|领养)/
  },
  // People mentions (close circle). Importance 2 by default, but combined
  // with health/mood signals it bumps to 3 via the max-merge below.
  {
    category: 'people',
    importance: 2,
    pattern: /(妈妈|爸爸|父母|爷爷|奶奶|外婆|外公|姥姥|姥爷|哥哥|姐姐|弟弟|妹妹|宝宝|孩子|儿子|女儿|对象|男朋友|女朋友|男友|女友|老婆|老公|前任|室友|好朋友|闺蜜|兄弟|family|mom|dad)/i
  },
  // Health + body signals.
  {
    category: 'health',
    importance: 2,
    pattern: /(生病|发烧|感冒|住院|手术|确诊|查出|体检|失眠|睡不着|崩了|崩溃|心悸|焦虑|抑郁|心理|疼|痛|疲惫|累瘫|哭了|哭过)/
  },
  // Work / project signals.
  {
    category: 'work',
    importance: 2,
    pattern: /(发版|上线|发布|项目|deadline|赶项目|加班|开会|周会|月会|绩效|review|代码|bug|代码评审|kpi|okr|交付|延期|被骂|被夸|被表扬|领导|老板|boss|同事|客户)/i
  },
  // Strong mood signals (alone these don't bump to 3 but they keep events
  // out of the "importance 1" trash bin).
  {
    category: 'mood',
    importance: 2,
    pattern: /(超开心|很开心|好开心|开心死了|爽爆|爽死了|气死|气炸|崩溃|哭了|哭出来|想哭|心碎|难受死|爆炸|绝望|终于|总算|好骄傲|很自豪|超累|累死|累瘫)/
  },
  // Preference / taste signals -- low importance but stamped as preference
  // so weekly rollups can say "这周你提到三次喜欢...".
  {
    category: 'preference',
    importance: 1,
    pattern: /(我喜欢|我爱|我超爱|我讨厌|我不喜欢|我最近迷上|最近喜欢)/
  }
]

const FIRST_TIME_HINT = /(第一次|有史以来|从来没|首次)/

const importanceRank = (value: 1 | 2 | 3) => value

/**
 * Returns the "richest" category for a given text. When multiple buckets
 * match, milestone wins, then people/health/work, then mood, then preference,
 * then general. Uses a stable priority list to keep the result deterministic.
 */
const CATEGORY_PRIORITY: ReadonlyArray<PetEventCategory> = [
  'milestone',
  'people',
  'health',
  'work',
  'mood',
  'preference',
  'general'
]

const compareCategoryPriority = (a: PetEventCategory, b: PetEventCategory) => (
  CATEGORY_PRIORITY.indexOf(a) - CATEGORY_PRIORITY.indexOf(b)
)

export interface ExtractedMemorySignals {
  importance: 1 | 2 | 3
  category: PetEventCategory
  // Bucket categories the text matched, useful for tag generation downstream.
  matchedCategories: PetEventCategory[]
}

export const extractMemorySignals = (text: string | undefined): ExtractedMemorySignals => {
  const normalised = (text ?? '').trim()
  if (!normalised) {
    return { importance: 1, category: 'general', matchedCategories: [] }
  }

  let importance: 1 | 2 | 3 = 1
  const matched: PetEventCategory[] = []
  for (const bucket of KEYWORD_BUCKETS) {
    if (bucket.pattern.test(normalised)) {
      matched.push(bucket.category)
      if (importanceRank(bucket.importance) > importanceRank(importance)) {
        importance = bucket.importance
      }
    }
  }

  // "第一次" / "首次" pushes whatever we matched up one tier (capped at 3).
  // Chosen over a flat +1 because a generic "我第一次写代码" should be more
  // memorable than a generic "我写代码", but doesn't need to outrank true
  // milestones.
  if (FIRST_TIME_HINT.test(normalised) && importance < 3) {
    importance = (importance + 1) as 1 | 2 | 3
  }

  // Combo bump: if we hit BOTH people AND (health|mood|milestone) it's almost
  // certainly a "妈妈生病了" / "妈妈过生日" type event -- pin it to 3.
  if (matched.includes('people') && matched.some((c) => c === 'health' || c === 'mood' || c === 'milestone') && importance < 3) {
    importance = 3
  }

  const category = matched.length === 0
    ? 'general'
    : [...matched].sort(compareCategoryPriority)[0]

  return { importance, category, matchedCategories: matched }
}

/**
 * Builds a small set of tag strings for an EventMemory, layering together the
 * matched category buckets plus a couple of broad tags (anchor day, sceneId).
 * Capped at 5 to keep the events list readable.
 */
export const buildExtractedTags = (
  signals: ExtractedMemorySignals,
  extras: ReadonlyArray<string | undefined> = []
): string[] => {
  const tags = new Set<string>()
  for (const category of signals.matchedCategories) tags.add(category)
  if (signals.importance === 3) tags.add('important')
  for (const extra of extras) {
    if (extra && extra.trim()) tags.add(extra.trim())
  }
  return Array.from(tags).slice(0, 5)
}
