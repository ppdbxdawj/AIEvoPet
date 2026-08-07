/**
 * Bundled sticker manifest. Phase A only ships morning-greeting and
 * reminder-due stickers — these are the two triggers we wired up first
 * because they are the most user-visible "moments" the pet has.
 *
 * Adding a sticker is intentionally low-friction:
 *   1. drop the PNG/SVG under src/assets/stickers/<bucket>/
 *   2. add an entry below
 *
 * Phase C will move this manifest into the user data dir so users can
 * drop their own art in. Until that ships, bundling keeps the contract
 * simple: same assets for everyone, one source of truth, no async
 * loading on the hot path.
 */

import type { PetSticker } from '../../types/sticker'
import morningCoffeeUrl from './greeting/morning-coffee.svg'
import morningSunUrl from './greeting/morning-sun.svg'
import clockRingUrl from './reminder/clock-ring.svg'
import notePointingUrl from './reminder/note-pointing.svg'
import milestoneConfettiUrl from './celebrate/milestone-confetti.svg'

// Default bucket cooldown — a single sticker won't repeat for 6 hours
// even if it matches every selection. Selectors can override per entry.
const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000

export const BUNDLED_STICKERS: PetSticker[] = [
  {
    id: 'greeting-morning-coffee',
    src: morningCoffeeUrl,
    triggers: [{ kind: 'greeting', period: 'morning' }],
    mood: 'cozy',
    caption: '今天也慢慢来',
    weight: 1,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    alt: '热咖啡和热气'
  },
  {
    id: 'greeting-morning-sun',
    src: morningSunUrl,
    triggers: [{ kind: 'greeting', period: 'morning' }],
    mood: 'happy',
    caption: '早安呀',
    weight: 1,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    alt: '微笑的太阳'
  },
  {
    id: 'reminder-clock-ring',
    src: clockRingUrl,
    triggers: [{ kind: 'reminder', phase: 'alert' }],
    mood: 'concerned',
    caption: '到点啦',
    weight: 1,
    cooldownMs: 30 * 60 * 1000, // shorter — reminder stickers can repeat sooner
    alt: '响铃的闹钟'
  },
  {
    id: 'reminder-note-pointing',
    src: notePointingUrl,
    triggers: [{ kind: 'reminder', phase: 'alert' }],
    mood: 'concerned',
    caption: '别忘啦',
    weight: 1,
    cooldownMs: 30 * 60 * 1000,
    alt: '便利贴和指示'
  },
  {
    id: 'celebrate-milestone-confetti',
    src: milestoneConfettiUrl,
    triggers: [{ kind: 'celebrate', topic: 'milestone' }],
    mood: 'happy',
    caption: '我们更近了一些',
    weight: 1,
    // Milestone is a once-in-a-while moment — a long cooldown is fine
    // because closeness stage transitions themselves are rare.
    cooldownMs: 24 * 60 * 60 * 1000,
    alt: '彩纸和星星'
  }
]

// Lookup index used by the renderer when it has only an id from PetShowState.
export const BUNDLED_STICKERS_BY_ID: Readonly<Record<string, PetSticker>> = Object.freeze(
  BUNDLED_STICKERS.reduce<Record<string, PetSticker>>((acc, sticker) => {
    acc[sticker.id] = sticker
    return acc
  }, {})
)
