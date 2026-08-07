import type { CreateReminderInput, InteractionType, PetReminderIntensity, PetSettingsUpdate } from '../types/pet'

type PetIntent =
  | { kind: 'interaction'; interaction: Exclude<InteractionType, 'idle' | 'chat'> }
  | { kind: 'reminder'; reminder: CreateReminderInput }
  | { kind: 'settings'; settings: PetSettingsUpdate }
  | { kind: 'chat' }

const normalizeText = (input: string) => input.trim().replace(/\u0000/g, '')

const REMINDER_INTENSITY_HIGH = /(强提醒|重要|很重要|务必|一定|盯我|盯着我|认真提醒|系统通知|弹通知)/
const REMINDER_INTENSITY_LOW = /(轻轻|轻一点|低调|不打扰|小声|随便提醒|轻提醒)/

const parseReminderIntensity = (input: string): PetReminderIntensity => {
  if (REMINDER_INTENSITY_LOW.test(input)) return 'low'
  if (REMINDER_INTENSITY_HIGH.test(input)) return 'high'
  return 'medium'
}

const cleanReminderTitle = (input: string) => input
  .trim()
  .replace(/^(去|要|记得|强提醒我|轻提醒我|提醒我|认真提醒我|轻轻提醒我|低调提醒我|小声提醒我)/, '')
  .replace(/^(去|要|记得)/, '')
  .trim()

const parseRelativeReminder = (input: string): CreateReminderInput | null => {
  const match = input.match(/(\d+)\s*(分钟|分|小时|时)后(?:提醒我)?(.+)/)
  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2]
  const title = cleanReminderTitle(match[3])
  if (!amount || !title) return null

  const minutes = unit.startsWith('小') ? amount * 60 : amount
  return {
    title,
    scheduledAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    intensity: parseReminderIntensity(input)
  }
}

const parseTodayReminder = (input: string): CreateReminderInput | null => {
  const match = input.match(/(今天|今晚|早上|上午|中午|下午|傍晚)?\s*(\d{1,2})[:点时](?:(\d{1,2})分?)?(?:提醒我)?(.+)/)
  if (!match) return null

  const period = match[1] ?? ''
  let hour = Number(match[2])
  const minute = match[3] ? Number(match[3]) : 0
  const title = cleanReminderTitle(match[4])
  if (!title || hour > 23 || minute > 59) return null

  if ((period.includes('下午') || period.includes('今晚') || period.includes('傍晚')) && hour < 12) hour += 12
  if (period.includes('中午') && hour < 11) hour += 12
  if (period.includes('早上') && hour === 12) hour = 0

  const now = new Date()
  const target = new Date(now)
  target.setHours(hour, minute, 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)

  return {
    title,
    scheduledAt: target.toISOString(),
    intensity: parseReminderIntensity(input)
  }
}

const parseReminder = (input: string): CreateReminderInput | null => {
  if (!input.includes('提醒')) return null
  return parseRelativeReminder(input) ?? parseTodayReminder(input)
}

// Map common Chinese palette descriptors to the canonical palette ids defined
// in src/lib/palettes.ts. Order matters: more specific phrases are listed
// first so e.g. "蓝莓奶" wins over the generic "蓝色" (both map to the same
// palette today, but we keep the priority for future palette additions).
const PALETTE_KEYWORDS: ReadonlyArray<{ pattern: RegExp; paletteId: string }> = [
  { pattern: /(蓝莓奶|蓝莓色|奶蓝|蓝色|藍色)/, paletteId: 'blueberry-milk' },
  { pattern: /(抹茶云|抹茶|绿色|綠色|薄荷)/, paletteId: 'matcha-cloud' },
  { pattern: /(桃子吐司|桃子|桃色|橘色|橙色|蜜桃)/, paletteId: 'peach-toast' },
  { pattern: /(薰衣草|紫色|淡紫|雾紫)/, paletteId: 'lavender-mist' },
  { pattern: /(午夜摩卡|深色模式|夜色|黑色|深色|暗色)/, paletteId: 'midnight-mocha' },
  { pattern: /(棉花糖粉|棉花糖|草莓|粉色|粉紅|粉红)/, paletteId: 'cotton-candy' }
]

const PALETTE_VERBS = /(换|改|切|换成|切换|换到|换为|改成|改为|改一下|换一下|切到|切成|换个|改个|用|换上)/
const PALETTE_NOUNS = /(色板|配色|主题|颜色|皮肤|面板色|界面色|颜色配)/

const parsePaletteIntent = (input: string): PetSettingsUpdate | null => {
  // Require either a verb hinting at a swap, OR an explicit "色板/配色"
  // mention -- otherwise "我喜欢蓝色" would (wrongly) repaint the panel.
  const hasVerb = PALETTE_VERBS.test(input)
  const hasNoun = PALETTE_NOUNS.test(input)
  if (!hasVerb && !hasNoun) return null
  for (const { pattern, paletteId } of PALETTE_KEYWORDS) {
    if (pattern.test(input)) {
      return { target: 'palette', value: paletteId }
    }
  }
  return null
}

const PET_RENAME_PATTERN = /(?:你叫|你以后叫|改名叫|给你改名|你的新名字叫|叫你)\s*([^\s，。！？!?]{1,12})/

const parsePetNameIntent = (input: string): PetSettingsUpdate | null => {
  const match = input.match(PET_RENAME_PATTERN)
  if (!match?.[1]) return null
  // "叫你 X" is ambiguous with "我叫你 X 吧" (still rename) but distinct from
  // "以后叫我 X" (which sets the *user's* preferred name and is matched
  // earlier in pet-companion.learnFromUserMessage). The earlier user-name
  // pattern uses "叫我/喊我"; this one uses "叫你/改名叫" so they don't collide.
  return { target: 'pet-name', value: match[1] }
}

const QUIET_MODE_ON = /(安静陪伴|安静一会|静一会|静音陪伴|别打扰我|不要打扰|进入安静|开启安静|进入静音|开静音模式|进入免打扰|开免打扰|开启免打扰|切换免打扰)/
const QUIET_MODE_OFF = /(退出安静|关掉安静|关闭安静|结束安静|不要安静了|取消安静|关闭免打扰|退出免打扰|不要免打扰)/
const BOSS_MODE_ON = /(老板模式|老板来了|装作没事|藏起来一下|开启老板模式)/
const BOSS_MODE_OFF = /(关闭老板模式|退出老板模式|老板走了|结束老板模式)/
const NEST_MODE_ON = /(窝模式|缩窝|窝着不动|进入窝模式|开启窝模式|宅一会)/
const NEST_MODE_OFF = /(出窝|退出窝模式|关闭窝模式|不窝着了)/
// "强提醒" is the user-facing inverse of免打扰. We accept several
// natural phrasings — including just"强提醒"on its own — because users
// chat with the pet conversationally and would otherwise see the LLM
// hallucinate a confirmation while nothing flipped (the original
// complaint that prompted this whole switch).
const STRONG_REMINDER_ON = /(强提醒|开启强提醒|切换强提醒|改成强提醒|换成强提醒|认真提醒|正常提醒|不要免打扰|关掉免打扰|关闭免打扰)/
const STRONG_REMINDER_OFF = /(关闭强提醒|关掉强提醒|不要强提醒|取消强提醒|退出强提醒)/

const parseSystemModeIntent = (input: string): PetSettingsUpdate | null => {
  // STRONG_REMINDER_OFF must come before _ON because phrases like
  // "关闭强提醒" contain "强提醒"; and the strong-reminder pair as a
  // whole must precede the quiet-mode pair so that "不要免打扰" is read
  // as "I want strong reminders" rather than mis-routed into a quiet
  // mode parser that happens to mention 免打扰.
  if (STRONG_REMINDER_OFF.test(input)) return { target: 'strong-reminder', value: 'off' }
  if (STRONG_REMINDER_ON.test(input)) return { target: 'strong-reminder', value: 'on' }
  if (QUIET_MODE_OFF.test(input)) return { target: 'vacation-mode', value: 'off' }
  if (QUIET_MODE_ON.test(input)) return { target: 'vacation-mode', value: 'on' }
  if (BOSS_MODE_OFF.test(input)) return { target: 'boss-mode', value: 'off' }
  if (BOSS_MODE_ON.test(input)) return { target: 'boss-mode', value: 'on' }
  if (NEST_MODE_OFF.test(input)) return { target: 'nest-mode', value: 'off' }
  if (NEST_MODE_ON.test(input)) return { target: 'nest-mode', value: 'on' }
  return null
}

const parseSettingsIntent = (input: string): PetSettingsUpdate | null => (
  parsePaletteIntent(input) ?? parsePetNameIntent(input) ?? parseSystemModeIntent(input)
)

const FEED_COMMAND = /(?:喂我一口|喂你一口|喂一下|投喂|来点吃的|给你吃点|给我吃点|吃点吧)/
const DRINK_COMMAND = /(?:喝点水|喝水吧|陪你喝水|给你喝水|喝一口水|去喝水)/
const BATH_COMMAND = /(?:洗澡|洗香香|给你洗洗|去洗洗|洗个澡)/
const HOLD_COMMAND = /(?:抱抱你|抱抱我|让我抱抱|抱一下|给你抱抱|过来抱抱)/i
const PET_COMMAND = /(?:过来让我摸摸|让我摸摸|给你摸摸|摸摸你|摸摸|抱抱|rua一下|rua你|亲亲|贴贴)/i
const WAKE_COMMAND = /(?:醒醒|快醒醒|醒来|醒过来|别睡了|起来啦|快起床|叫醒你)/
const SLEEP_COMMAND = /(?:你先睡会儿|先睡会儿|去睡吧|快睡吧|去休息吧|休息一下|睡一会儿|该睡了|先去睡觉)/

export const parsePetIntent = (rawInput: string): PetIntent => {
  const input = normalizeText(rawInput)
  if (!input) return { kind: 'chat' }

  const reminder = parseReminder(input)
  if (reminder) return { kind: 'reminder', reminder }

  const settings = parseSettingsIntent(input)
  if (settings) return { kind: 'settings', settings }

  if (FEED_COMMAND.test(input)) {
    return { kind: 'interaction', interaction: 'feed' }
  }

  if (DRINK_COMMAND.test(input)) {
    return { kind: 'interaction', interaction: 'drink' }
  }

  if (BATH_COMMAND.test(input)) {
    return { kind: 'interaction', interaction: 'bath' }
  }

  if (HOLD_COMMAND.test(input)) {
    return { kind: 'interaction', interaction: 'hold' }
  }

  if (PET_COMMAND.test(input)) {
    return { kind: 'interaction', interaction: 'pet' }
  }

  if (WAKE_COMMAND.test(input)) {
    return { kind: 'interaction', interaction: 'wake' }
  }

  if (SLEEP_COMMAND.test(input)) {
    return { kind: 'interaction', interaction: 'sleep' }
  }

  return { kind: 'chat' }
}
