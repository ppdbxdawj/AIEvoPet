import type {
  WardrobeItem,
  WardrobeMoodTag,
  WardrobeSelectionContext,
  WardrobeSelectionResult,
  WardrobePriceBand
} from '../types/wardrobe'
import { WARDROBE_ITEMS } from '../assets/wardrobe/manifest'

// Shop selection pipeline.
//
//   filterPool(ctx)        — narrow the 48-item manifest by budget + unlocked
//                            + mood. Always returns at least one item if the
//                            manifest is non-empty (relaxes constraints).
//   pickWardrobeFallback() — deterministic weighted random over the filtered
//                            pool. Used when the LLM is unavailable or when
//                            its response fails to validate.
//   pickWardrobe()         — top-level entry. Calls the LLM if a callback was
//                            provided, validates the response against the
//                            filtered pool, falls back otherwise.
//
// Note: this module is intentionally pure (no platform / network imports).
// The LLM call is injected as `callModel` so we can unit-test the whole
// pipeline with a stub model.

// Strict, non-overlapping price bands. Important: low/mid/high are
// *partitions* of the manifest, not just upper bounds. Earlier the filter
// just used `price <= budget`, so the "high" blind box would happily
// surface a 12-米 baseball cap — which made the high band feel pointless.
// With strict ranges, drawing "high" guarantees you actually pull from the
// rare-item pool (or fall back through the relax stages, never silently
// down-grading.)
const PRICE_BAND_RANGES: Record<WardrobePriceBand, [number, number]> = {
  low: [0, 15],
  mid: [16, 45],
  high: [46, Infinity]
}

const itemBand = (price: number): WardrobePriceBand => {
  if (price <= PRICE_BAND_RANGES.low[1]) return 'low'
  if (price <= PRICE_BAND_RANGES.mid[1]) return 'mid'
  return 'high'
}

interface FilterReasons {
  reason: 'normal' | 'budget-empty' | 'mood-empty' | 'all-unlocked' | 'band-relaxed' | 'pool-empty'
  pool: WardrobeItem[]
  // Which band the items in pool actually came from. Useful to the
  // controller for "你抽的是高档但池里只剩中档了" UX hooks.
  effectiveBand?: WardrobePriceBand
}

// Filter the manifest down to a reasonable candidate set. We relax filters
// in stages so the user always gets *something* unless the manifest is empty:
//
//   1. Strict: in-band AND mood AND not-unlocked
//   2. Drop mood (in-band + not-unlocked)
//   3. Drop unlocked filter (in-band only) — duplicate is better than refusal
//   4. Relax band downwards one notch (high → mid, mid → low). This is the
//      only stage where the user can end up with a cheaper item than they
//      asked for; we tag it band-relaxed so callers can mention it.
//   5. Drop everything (full manifest)
export function filterPool(
  ctx: WardrobeSelectionContext,
  manifest: WardrobeItem[] = WARDROBE_ITEMS
): FilterReasons {
  if (manifest.length === 0) return { reason: 'pool-empty', pool: [] }

  const budgetCap = typeof ctx.budget === 'number' && ctx.budget > 0 ? ctx.budget : Infinity
  const targetBand = budgetCap === Infinity ? 'high' : itemBand(budgetCap)
  const unlocked = new Set(ctx.unlockedIds ?? [])
  const moodTags = new Set(ctx.preferredMoods ?? [])

  const inBand = (item: WardrobeItem, band: WardrobePriceBand) => itemBand(item.price) === band
  const matchesMood = (item: WardrobeItem) =>
    moodTags.size === 0 || item.moodTags.some((tag) => moodTags.has(tag))
  const isFresh = (item: WardrobeItem) => !unlocked.has(item.id)

  const strict = manifest.filter((item) => inBand(item, targetBand) && matchesMood(item) && isFresh(item))
  if (strict.length > 0) return { reason: 'normal', pool: strict, effectiveBand: targetBand }

  const noMood = manifest.filter((item) => inBand(item, targetBand) && isFresh(item))
  if (noMood.length > 0) return { reason: 'mood-empty', pool: noMood, effectiveBand: targetBand }

  const noUnlock = manifest.filter((item) => inBand(item, targetBand))
  if (noUnlock.length > 0) return { reason: 'all-unlocked', pool: noUnlock, effectiveBand: targetBand }

  // Relax band one notch down. high → mid → low. low has nothing to relax to.
  const fallbackBand: WardrobePriceBand | null = targetBand === 'high' ? 'mid' : targetBand === 'mid' ? 'low' : null
  if (fallbackBand) {
    const relaxed = manifest.filter((item) => inBand(item, fallbackBand))
    if (relaxed.length > 0) return { reason: 'band-relaxed', pool: relaxed, effectiveBand: fallbackBand }
  }

  return { reason: 'budget-empty', pool: manifest }
}

// Deterministic-ish weighted random selection. Items the user already owns
// are heavily down-weighted so duplicate picks only happen when the pool is
// small. Weight formula:
//   base = 1
//   penalty if already unlocked: divide by 4
//   small bonus if item's primary mood matches preferredMoods: multiply by 1.3
function weightedPick(pool: WardrobeItem[], ctx: WardrobeSelectionContext, rng: () => number): WardrobeItem {
  const unlocked = new Set(ctx.unlockedIds ?? [])
  const moodTags = new Set(ctx.preferredMoods ?? [])

  const weighted = pool.map((item) => {
    let weight = 1
    if (unlocked.has(item.id)) weight /= 4
    if (moodTags.size > 0 && item.moodTags.some((tag) => moodTags.has(tag))) weight *= 1.3
    return { item, weight }
  })

  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  const target = rng() * total
  let acc = 0
  for (const entry of weighted) {
    acc += entry.weight
    if (target <= acc) return entry.item
  }
  // Numerical safety net: shouldn't happen with finite weights but never
  // return undefined.
  return pool[pool.length - 1]
}

const FALLBACK_PHRASES_BY_MOOD: Record<WardrobeMoodTag, Record<'zh-CN' | 'en-US', string[]>> = {
  cozy: {
    'zh-CN': ['天有点冷，给你挑了件 {name} 暖暖的。', '这件 {name} 看着就让人想缩进沙发，给你了。'],
    'en-US': ['It feels a little chilly today, so I picked {name} to keep you warm.', '{name} looks sofa-soft and cozy, so it is yours.']
  },
  playful: {
    'zh-CN': ['今天看你有玩心，挑了 {name} 给你。', '想让你笑一下，{name} 拿走。'],
    'en-US': ['You seem playful today, so I picked {name}.', 'I wanted to make you smile, so take {name}.']
  },
  quiet: {
    'zh-CN': ['这件 {name} 不张扬，正合你今天的样子。', '安静一点的 {name}，配你刚好。'],
    'en-US': ['{name} is understated, which fits today perfectly.', 'A quieter {name} feels just right for you.']
  },
  focus: {
    'zh-CN': ['看你在专心做事，{name} 给你提个气。', '这件 {name} 像个小仪式感，开工配它。'],
    'en-US': ['You look focused, so {name} can give you a small boost.', '{name} feels like a tiny work ritual for getting started.']
  },
  sweet: {
    'zh-CN': ['软乎乎的 {name}，是你今天值得的。', '挑了件甜甜的 {name}，对你温柔点。'],
    'en-US': ['Soft little {name} is exactly what you deserve today.', 'I picked a sweet {name}; be gentle with yourself.']
  },
  cool: {
    'zh-CN': ['{name} 让你看着更带劲，戴上吧。', '今天该酷一点，{name} 给你。'],
    'en-US': ['{name} gives you extra spark, so put it on.', 'Today calls for something cooler, so {name} is yours.']
  },
  mystic: {
    'zh-CN': ['有点神秘感的 {name}，配你今天的氛围。', '挑了件 {name}，像故事里的小道具。'],
    'en-US': ["A slightly mysterious {name} matches today's mood.", 'I picked {name}; it feels like a little prop from a story.']
  },
  celebrate: {
    'zh-CN': ['这是值得庆祝的一天，{name} 给你。', '小奖励：{name}，因为你扛过来了。'],
    'en-US': ['This feels worth celebrating, so {name} is for you.', 'A small reward: {name}, because you made it through.']
  },
  melancholy: {
    'zh-CN': ['看你今天有点闷，{name} 给你撑着点。', '不太好的日子，戴上 {name} 别一个人扛。'],
    'en-US': ['You seem a little weighed down, so {name} can hold you up.', 'On a rough day, wear {name} and do not carry it alone.']
  }
}

const FALLBACK_PHRASES_GENERIC: Record<'zh-CN' | 'en-US', string[]> = {
  'zh-CN': [
    '今天来一件 {name}，看你顺眼。',
    '挑了 {name} 给你，没什么特别理由。',
    '这件 {name} 我看着喜欢，分你了。'
  ],
  'en-US': [
    'Let us go with {name} today; it just feels right.',
    'I picked {name} for you, no grand reason needed.',
    'I like how {name} looks, so I am sharing it with you.'
  ]
}

function templateReason(item: WardrobeItem, ctx: WardrobeSelectionContext, rng: () => number): string {
  const language = ctx.language === 'en-US' ? 'en-US' : 'zh-CN'
  const moods = ctx.preferredMoods ?? []
  const matchedMood = moods.find((tag) => item.moodTags.includes(tag))
  const pool = matchedMood ? FALLBACK_PHRASES_BY_MOOD[matchedMood][language] : FALLBACK_PHRASES_GENERIC[language]
  const phrase = pool[Math.floor(rng() * pool.length)] ?? pool[0]
  const name = language === 'en-US' ? item.nameEn ?? item.nameZh : item.nameZh
  return phrase.replace('{name}', name)
}

export interface WardrobeShopOptions {
  // Random source. Tests inject a deterministic rng.
  rng?: () => number
  // Optional async LLM call. Receives the filtered pool + context, must
  // resolve to { id, reason } pointing at one of the pool items, or null
  // to indicate it punted. Anything else (throw, undefined, off-pool id)
  // is treated as a fallback trigger.
  callModel?: (
    pool: WardrobeItem[],
    ctx: WardrobeSelectionContext
  ) => Promise<{ id: string; reason: string } | null>
}

export async function pickWardrobe(
  ctx: WardrobeSelectionContext,
  options: WardrobeShopOptions = {}
): Promise<WardrobeSelectionResult | null> {
  const rng = options.rng ?? Math.random
  const { pool } = filterPool(ctx)
  if (pool.length === 0) return null

  if (options.callModel) {
    try {
      const result = await options.callModel(pool, ctx)
      if (result) {
        const matched = pool.find((item) => item.id === result.id)
        const reasonText = (result.reason ?? '').trim()
        if (matched && reasonText.length > 0) {
          return {
            item: matched,
            reason: reasonText.slice(0, 200),
            source: 'model'
          }
        }
      }
    } catch (error) {
      console.warn('[wardrobe-shop] model selection failed, falling back', error)
    }
  }

  const item = weightedPick(pool, ctx, rng)
  return {
    item,
    reason: templateReason(item, ctx, rng),
    source: 'fallback'
  }
}

// Helper for the controller / tests: deterministically sort the pool the
// same way the LLM sees it. We sort by (priceBand, price, id) so the LLM's
// choice indices are stable across runs.
export function orderPool(pool: WardrobeItem[]): WardrobeItem[] {
  const bandOrder: Record<WardrobePriceBand, number> = { low: 0, mid: 1, high: 2 }
  return [...pool].sort((a, b) => {
    const bandDiff = bandOrder[a.priceBand] - bandOrder[b.priceBand]
    if (bandDiff !== 0) return bandDiff
    const priceDiff = a.price - b.price
    if (priceDiff !== 0) return priceDiff
    return a.id.localeCompare(b.id)
  })
}

// Build a compact prompt fragment describing the pool to the LLM. The shop
// prompt itself lives near the platform layer so it can be co-located with
// other model prompts; this just produces the stable item-list block.
export function describePool(pool: WardrobeItem[]): string {
  return orderPool(pool)
    .map((item) =>
      [
        `id=${item.id}`,
        `name=${item.nameZh}`,
        `category=${item.category}`,
        `slot=${item.slot}`,
        `mood=${item.moodTags.join('|')}`,
        `band=${item.priceBand}`,
        `price=${item.price}米`,
        `desc=${item.description}`
      ].join(' / ')
    )
    .join('\n')
}

// Re-export the price band ranges so the shop UI can show "你今天的预算可
// 以抽到 {low|mid|high} 档 N 件" without having to know the constants.
export { PRICE_BAND_RANGES }

// Convenience: turn the pet's 0-100 mood score into a small set of tag
// candidates the shop should prefer. Caller can extend this with weather /
// relationship signals if it has them.
export function inferMoodTagsFromScore(moodScore: number | undefined): WardrobeMoodTag[] {
  if (typeof moodScore !== 'number' || Number.isNaN(moodScore)) return []
  if (moodScore <= 30) return ['melancholy', 'cozy', 'quiet']
  if (moodScore >= 75) return ['playful', 'celebrate', 'sweet']
  if (moodScore >= 55) return ['cozy', 'sweet']
  return ['quiet', 'focus']
}

// Default budgets per band — used when the panel UI exposes a 3-button
// "low/mid/high blind box" instead of letting the user type a number.
export const BLIND_BOX_BUDGETS: Record<WardrobePriceBand, number> = {
  low: 15,
  mid: 35,
  high: 80
}
