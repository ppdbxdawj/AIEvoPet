import { generateCompanionSummary } from './pet-llm'
import { generatePetDialogue } from './pet-dialogue'
import { pickStaleFactKey, stampProactiveRecall } from './pet-facts'
import type {
  EventMemory,
  PetAddressStyle,
  PetData,
  PetFocusSupportStyle,
  PetLowMoodSupportStyle,
  PetLanguage,
  PetMemoryUpdate,
  PetReminderPhase,
  PetReminderStyle,
  PetSceneId,
  PetSceneState,
  PetTimePeriod,
  PetWorkingMode,
  UserPreferenceMemory
} from '../types/pet'

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const SUMMARY_REFRESH_MS = 4 * 60_000

const getLanguage = (pet: PetData): PetLanguage => pet.ui.language === 'en-US' ? 'en-US' : 'zh-CN'

const localized = (pet: PetData, zh: string, en: string) => getLanguage(pet) === 'en-US' ? en : zh

const pickDominantMood = (pet: PetData) => {
  if (pet.state.isSleeping || pet.state.energy < 26) return 'sleepy' as const
  if (pet.state.loneliness > 60) return 'lonely' as const
  if (pet.state.mood > 72 || pet.memory.bond.warmth > 68) return 'playful' as const
  if (pet.memory.working.currentMode === 'focus') return 'steady' as const
  return 'warm' as const
}

export const inferTimePeriod = (now = Date.now()): PetTimePeriod => {
  const hour = new Date(now).getHours()
  if (hour < 6) return 'late-night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export const inferWorkingMode = (pet: PetData, sceneId: PetSceneId, now = Date.now()): PetWorkingMode => {
  if (pet.state.isSleeping || sceneId === 'sleeping') return 'sleep'
  if (sceneId === 'sleepy' || pet.state.energy < 28) return 'rest'
  if (sceneId === 'reminder-alert' || sceneId === 'reminder-soon') return 'care'
  if (sceneId === 'pet-react' || sceneId === 'excited') return 'chat'
  if (sceneId === 'focus') return 'focus'
  const lastMessageAt = pet.memory.working.lastUserMessageAt ? new Date(pet.memory.working.lastUserMessageAt).getTime() : 0
  if (lastMessageAt && now - lastMessageAt < 45_000) return 'chat'
  return 'idle'
}

const updateBondSummary = (pet: PetData) => {
  const { closeness, trust, reliance, warmth, neglectedLevel, interactionMomentum } = pet.memory.bond

  let summary = localized(pet, '它越来越习惯待在你身边，把你当成很重要的人。', 'It is getting used to staying beside you and sees you as someone important.')
  if (closeness > 74 && trust > 68) summary = localized(pet, '它已经把你视作最稳定的依靠，会自然地向你靠近。', 'It already sees you as its most stable support and naturally leans closer.')
  else if (neglectedLevel > 58) summary = localized(pet, '它还是想黏着你，但最近有点怕自己打扰到你。', 'It still wants to stay close, but lately it worries about bothering you.')
  else if (interactionMomentum > 65) summary = localized(pet, '你们最近互动很密，它明显更主动也更放松了。', 'You have interacted a lot lately, and it is noticeably more relaxed and proactive.')

  let recentFeeling = localized(pet, '它觉得现在这样陪着你，刚刚好。', 'It feels that staying with you like this is just right.')
  if (neglectedLevel > 58) recentFeeling = localized(pet, '它这阵子有点怕被忘记，所以会更想蹭过来。', 'It has been a little afraid of being forgotten, so it wants to nudge closer.')
  else if (reliance > 62) recentFeeling = localized(pet, '它越来越依赖你的回应，情绪也会跟着你起伏。', 'It increasingly relies on your responses, and its mood rises and falls with you.')
  else if (warmth > 72) recentFeeling = localized(pet, '它整只都暖洋洋的，像在偷偷冲你撒娇。', 'It feels warm all over, like it is secretly acting cute around you.')

  return {
    ...pet.memory.bond,
    summary,
    recentFeeling
  }
}

const ensureDailyEntry = (pet: PetData, now = Date.now()) => {
  const date = new Date(now).toISOString().slice(0, 10)
  const current = pet.memory.daily[0]
  if (current?.date === date) return pet

  return {
    ...pet,
    memory: {
      ...pet.memory,
      daily: [
        {
          date,
          summary: localized(pet, '今天啵啵继续陪着你，准备重新观察新的节奏。', 'Today Bobo keeps staying with you, ready to observe a new rhythm.'),
          dominantMood: pickDominantMood(pet),
          focusMinutes: 0,
          interactionCount: 0,
          reminderCompleted: 0,
          reminderSnoozed: 0
        },
        ...pet.memory.daily
      ].slice(0, 7)
    }
  }
}

const updateDailySummary = (pet: PetData, now = Date.now()) => {
  const dated = ensureDailyEntry(pet, now)
  const [today, ...rest] = dated.memory.daily
  const summary =
    today.interactionCount > 8
      ? localized(dated, '今天你陪它说了不少话，它明显更黏人了。', 'You talked with it quite a bit today, and it has clearly become clingier.')
      : today.focusMinutes > 45
        ? localized(dated, '今天你专注了很久，它大部分时间都安静守在旁边。', 'You focused for a long time today, and it quietly stayed nearby for most of it.')
        : today.reminderCompleted > 0
          ? localized(dated, '今天它确实帮你把事情往前推了一点。', 'Today it really helped move something forward for you.')
          : localized(dated, '今天它还在继续熟悉你的工作和休息节奏。', 'Today it is still learning your work and rest rhythm.')

  return {
    ...dated,
    memory: {
      ...dated.memory,
      daily: [
        {
          ...today,
          dominantMood: pickDominantMood(dated),
          summary
        },
        ...rest
      ]
    }
  }
}

const upsertPreference = (list: UserPreferenceMemory[], next: Omit<UserPreferenceMemory, 'id'>) => {
  const existing = list.find((item) => item.category === next.category && item.value === next.value)
  if (!existing) {
    return [{ ...next, id: crypto.randomUUID() }, ...list].slice(0, 12)
  }

  return list.map((item) =>
    item.id === existing.id
      ? {
          ...item,
          summary: next.summary,
          confidence: clamp(Math.max(item.confidence, next.confidence) + 0.05, 0, 1),
          source: next.source,
          updatedAt: next.updatedAt
        }
      : item
  )
}

const uniquePush = (items: string[], value: string) => {
  if (!value || items.includes(value)) return items
  return [value, ...items].slice(0, 8)
}

const recentTopicsFromEvents = (pet: PetData) => {
  const values = pet.memory.events
    .slice(0, 8)
    .flatMap((event) => event.tags ?? [])
    .filter((tag) => !['idle', 'chat', 'feed', 'pet', 'sleep', 'wake', 'important', 'bond'].includes(tag))

  return values.filter(Boolean).slice(0, 4)
}

const toTopTopics = (pet: PetData) => {
  const values = [
    ...pet.memory.profile.habits,
    ...pet.memory.profile.likes,
    ...pet.memory.profile.comfortTopics,
    ...pet.memory.preferences.map((item) => item.value)
  ]

  return values.filter(Boolean).slice(0, 4)
}

const toAvoidPhrases = (pet: PetData) => {
  const avoided = pet.memory.profile.dislikes.filter((item) => /(吵|催|打扰|提醒|说教|训)/.test(item))
  return avoided.slice(0, 4)
}

const deriveLearnedSpeechStyle = (pet: PetData) => {
  const phrases: string[] = []
  const profile = pet.memory.profile
  const preferences = pet.memory.preferences

  if (profile.preferredName?.trim()) phrases.push(`喜欢被叫“${profile.preferredName.trim()}”`)
  if (preferences.some((item) => item.category === 'reminder' && /(轻|温柔|别催|别太频繁)/.test(item.value))) phrases.push('更接受轻一点的提醒')
  if (preferences.some((item) => item.category === 'work' && /(轻|安静|低调|别打扰)/.test(item.value))) phrases.push('专注时偏好低打扰陪伴')
  if (profile.comfortTopics[0]) phrases.push(`低落时愿意聊${profile.comfortTopics[0]}`)
  if (profile.likes[0]) phrases.push(`提到${profile.likes[0]}会更容易开心`)

  return phrases.slice(0, 4)
}

const resolveAttentionMode = (pet: PetData, sceneId: PetSceneId, hasActiveReminder: boolean): PetData['memory']['working']['currentMode'] => {
  if (hasActiveReminder || sceneId === 'reminder-alert') return 'care'
  if (pet.state.isSleeping || sceneId === 'sleeping') return 'sleep'
  if (sceneId === 'focus') return 'focus'
  if (sceneId === 'pet-react' || sceneId === 'excited' || sceneId === 'lonely') return 'chat'
  if (sceneId === 'sleepy') return 'rest'
  return 'idle'
}

const resolveInteractionStyle = (pet: PetData) => {
  const dislikes = pet.memory.profile.dislikes.join('')
  if (/(吵|催|打扰|说教)/.test(dislikes)) return 'quiet' as const
  if (pet.memory.bond.warmth > 72 || pet.memory.bond.closeness > 72) return 'playful' as const
  return 'warm' as const
}

const resolveReminderStyle = (pet: PetData): PetReminderStyle => {
  const dislikes = pet.memory.profile.dislikes.join('')
  const strategy = pet.memory.reminderStrategy
  if (/(别催|不要提醒|太吵|太频繁)/.test(dislikes)) return 'gentle'
  if (strategy.ignoreCount >= 2 || strategy.consecutiveSnooze >= 2 || strategy.gentleness < 45 || strategy.snoozeCount > strategy.completionCount) return 'gentle'
  if (strategy.consecutiveDone >= 3 || (strategy.completionCount >= 3 && strategy.gentleness > 78)) return 'direct'
  return 'balanced'
}

const resolveAddressStyle = (pet: PetData): PetAddressStyle => {
  if (pet.memory.profile.preferredName) return 'name'
  if (pet.memory.bond.closeness > 76 || pet.memory.bond.warmth > 78) return 'nickname'
  return 'plain'
}

const resolveFocusSupportStyle = (pet: PetData): PetFocusSupportStyle => {
  const dislikes = pet.memory.profile.dislikes.join('')
  if (/(别催|不要打扰|太吵)/.test(dislikes)) return 'quiet'
  if (pet.memory.bond.trust > 65 && pet.memory.reminderStrategy.completionCount >= 2) return 'encouraging'
  return 'check-in'
}

const resolveLowMoodSupportStyle = (pet: PetData): PetLowMoodSupportStyle => {
  if (pet.state.mood < 38 || pet.memory.bond.neglectedLevel > 56) return 'gentle'
  if (pet.memory.bond.warmth > 74) return 'playful'
  return 'steady'
}

const buildCompanionSummary = (pet: PetData, interactionStyle: PetData['memory']['companionPreferences']['interactionStyle'], reminderStyle: PetReminderStyle) => {
  const addressStyle = resolveAddressStyle(pet)
  const focusSupportStyle = resolveFocusSupportStyle(pet)
  const lowMoodSupportStyle = resolveLowMoodSupportStyle(pet)
  const petBuddyTone = pet.memory.bond.closeness > 68 || pet.memory.bond.warmth > 72
    ? localized(pet, '会主动贴近你，也会像熟一点的搭子那样接话。', 'It will actively stay close and respond like a familiar desk-side buddy.')
    : localized(pet, '更像安静守在旁边的小宠物，但会认真接住你的话。', 'It is more like a quiet little pet nearby, but it listens carefully.')
  const reminderTone =
    reminderStyle === 'gentle'
      ? localized(pet, '提醒时会放轻语气，尽量不催你。', 'When reminding you, it keeps the tone light and avoids rushing you.')
      : reminderStyle === 'direct'
        ? localized(pet, '提醒时会更干脆，想帮你把事情推进。', 'When reminding you, it is more direct and tries to help you move things forward.')
        : localized(pet, '提醒时会先温柔试探，再认真一点。', 'When reminding you, it starts gently and then gets a little more serious.')
  const focusTone =
    focusSupportStyle === 'quiet'
      ? localized(pet, '你忙的时候它更偏向低打扰守着。', 'When you are busy, it prefers low-interruption company.')
      : focusSupportStyle === 'encouraging'
        ? localized(pet, '你忙的时候它会给你一点打气。', 'When you are busy, it gives you a little encouragement.')
        : localized(pet, '你忙的时候它会偶尔轻轻确认一下进度。', 'When you are busy, it occasionally checks in softly.')
  const lowMoodTone =
    lowMoodSupportStyle === 'playful'
      ? localized(pet, '你低落时它会试着用一点撒娇和玩笑把气氛拽回来。', 'When you feel low, it tries to lighten the mood with a little cuteness and humor.')
      : lowMoodSupportStyle === 'steady'
        ? localized(pet, '你低落时它会先稳稳陪着，不急着闹你。', 'When you feel low, it stays steady with you instead of making noise.')
        : localized(pet, '你低落时它会先放软一点，黏过来陪你。', 'When you feel low, it softens and comes closer to keep you company.')
  const addressTone =
    addressStyle === 'nickname'
      ? localized(pet, '熟起来后会用更亲昵的小称呼。', 'As you get closer, it may use warmer nicknames.')
      : addressStyle === 'name'
        ? localized(pet, '优先用你喜欢的称呼和你说话。', 'It prioritizes the name you prefer.')
        : localized(pet, '平时会用更自然克制的称呼方式。', 'It usually addresses you in a natural, restrained way.')

  return `${petBuddyTone}${reminderTone}${focusTone}${lowMoodTone}${addressTone}`
}

export const deriveCompanionPreferences = (pet: PetData, now = Date.now()): PetData => {
  const favoriteTopics = toTopTopics(pet)
  const recentTopics = recentTopicsFromEvents(pet)
  const avoidPhrases = toAvoidPhrases(pet)
  const learnedSpeechStyle = deriveLearnedSpeechStyle(pet)
  const interactionStyle = resolveInteractionStyle(pet)
  const reminderStyle = resolveReminderStyle(pet)
  const addressStyle = resolveAddressStyle(pet)
  const focusSupportStyle = resolveFocusSupportStyle(pet)
  const lowMoodSupportStyle = resolveLowMoodSupportStyle(pet)
  const summary = buildCompanionSummary(pet, interactionStyle, reminderStyle)

  return {
    ...pet,
    memory: {
      ...pet.memory,
      companionPreferences: {
        interactionStyle,
        reminderStyle,
        addressStyle,
        focusSupportStyle,
        lowMoodSupportStyle,
        favoriteTopics,
        recentTopics,
        avoidPhrases,
        learnedSpeechStyle,
        summary,
        updatedAt: new Date(now).toISOString()
      }
    }
  }
}

const updateWorkPreference = (preferences: UserPreferenceMemory[], value: string, updatedAt: string, source: UserPreferenceMemory['source'], language: PetLanguage) =>
  upsertPreference(preferences, {
    category: 'work',
    summary: language === 'en-US' ? `When focused, the user prefers you to ${value}` : `用户专注时更希望你${value}`,
    value,
    confidence: source === 'explicit' ? 0.9 : 0.72,
    source,
    updatedAt
  })

const updateReminderPreference = (preferences: UserPreferenceMemory[], value: string, updatedAt: string, source: UserPreferenceMemory['source'], language: PetLanguage) =>
  upsertPreference(preferences, {
    category: 'reminder',
    summary: language === 'en-US' ? `User reminder preference: ${value}` : `用户偏好提醒方式：${value}`,
    value,
    confidence: source === 'explicit' ? 0.92 : 0.74,
    source,
    updatedAt
  })

const updateComfortTopic = (preferences: UserPreferenceMemory[], value: string, updatedAt: string, source: UserPreferenceMemory['source'], language: PetLanguage) =>
  upsertPreference(preferences, {
    category: 'comfort',
    summary: language === 'en-US' ? `The user cares about or often returns to ${value}` : `用户在意或会反复提到${value}`,
    value,
    confidence: source === 'explicit' ? 0.86 : 0.68,
    source,
    updatedAt
  })

export const applyStructuredMemoryUpdate = (pet: PetData, memoryUpdate: PetMemoryUpdate, now = Date.now()): PetData => {
  const value = memoryUpdate.value.trim().replace(/[。！!？?]$/, '')
  if (!value) return pet

  const updatedAt = new Date(now).toISOString()
  const language = getLanguage(pet)
  let preferences = pet.memory.preferences
  const profile = {
    ...pet.memory.profile,
    likes: [...pet.memory.profile.likes],
    dislikes: [...pet.memory.profile.dislikes],
    habits: [...pet.memory.profile.habits],
    comfortTopics: [...pet.memory.profile.comfortTopics]
  }

  if (memoryUpdate.kind === 'preferred-name') {
    profile.preferredName = value
    preferences = upsertPreference(preferences, {
      category: 'identity',
      summary: language === 'en-US' ? `The user prefers to be called ${value}` : `用户偏好被称呼为${value}`,
      value,
      confidence: 0.92,
      source: 'behavior',
      updatedAt
    })
  }

  if (memoryUpdate.kind === 'like') {
    profile.likes = uniquePush(profile.likes, value)
    preferences = upsertPreference(preferences, {
      category: 'interaction',
      summary: language === 'en-US' ? `The user likes ${value}` : `用户喜欢${value}`,
      value,
      confidence: 0.84,
      source: 'behavior',
      updatedAt
    })
  }

  if (memoryUpdate.kind === 'dislike') {
    profile.dislikes = uniquePush(profile.dislikes, value)
    preferences = upsertPreference(preferences, {
      category: value.includes('提醒') ? 'reminder' : 'interaction',
      summary: language === 'en-US' ? `The user dislikes ${value}` : `用户不喜欢${value}`,
      value,
      confidence: 0.84,
      source: 'behavior',
      updatedAt
    })
  }

  if (memoryUpdate.kind === 'habit') {
    profile.habits = uniquePush(profile.habits, value)
    preferences = upsertPreference(preferences, {
      category: value.includes('喝水') ? 'schedule' : 'work',
      summary: language === 'en-US' ? `The user has recently mentioned ${value} often` : `用户最近常提到${value}`,
      value,
      confidence: 0.68,
      source: 'behavior',
      updatedAt
    })
  }

  if (memoryUpdate.kind === 'address-style') {
    preferences = upsertPreference(preferences, {
      category: 'identity',
      summary: language === 'en-US' ? `The user wants to be addressed as: ${value}` : `用户希望被这样称呼：${value}`,
      value,
      confidence: 0.88,
      source: 'behavior',
      updatedAt
    })
    if (!profile.preferredName && value.length <= 12 && !/(叫|喊|称呼|不要)/.test(value)) {
      profile.preferredName = value
    }
  }

  if (memoryUpdate.kind === 'focus-support') {
    preferences = updateWorkPreference(preferences, value, updatedAt, 'behavior', language)
  }

  if (memoryUpdate.kind === 'comfort-topic') {
    profile.comfortTopics = uniquePush(profile.comfortTopics, value)
    preferences = updateComfortTopic(preferences, value, updatedAt, 'behavior', language)
  }

  if (memoryUpdate.kind === 'reminder-preference') {
    preferences = updateReminderPreference(preferences, value, updatedAt, 'behavior', language)
  }

  return deriveCompanionPreferences({
    ...pet,
    memory: {
      ...pet.memory,
      profile,
      preferences,
      working: {
        ...pet.memory.working,
        lastObservedAt: updatedAt
      }
    }
  }, now)
}

export const learnFromUserMessage = (pet: PetData, message: string, now = Date.now()): PetData => {
  const trimmed = message.trim()
  if (!trimmed) return pet

  let next = ensureDailyEntry(pet, now)
  const updatedAt = new Date(now).toISOString()
  const language = getLanguage(next)
  let preferences = next.memory.preferences
  const profile = {
    ...next.memory.profile,
    likes: [...next.memory.profile.likes],
    dislikes: [...next.memory.profile.dislikes],
    habits: [...next.memory.profile.habits],
    comfortTopics: [...next.memory.profile.comfortTopics]
  }

  const preferredNameMatch = trimmed.match(/(?:叫我|喊我|以后称呼我)\s*(.{1,12})$/)
  if (preferredNameMatch?.[1]) {
    const preferredName = preferredNameMatch[1].trim().replace(/[。！!？?]$/, '')
    if (preferredName) {
      profile.preferredName = preferredName
      preferences = upsertPreference(preferences, {
        category: 'identity',
        summary: language === 'en-US' ? `The user prefers to be called ${preferredName}` : `用户偏好被称呼为${preferredName}`,
        value: preferredName,
        confidence: 0.96,
        source: 'explicit',
        updatedAt
      })
    }
  }

  const likesMatch = trimmed.match(/(?:我喜欢|我最喜欢)(.+)/)
  if (likesMatch?.[1]) {
    const like = likesMatch[1].trim().replace(/[。！!？?]$/, '')
    if (like) {
      profile.likes = uniquePush(profile.likes, like)
      preferences = upsertPreference(preferences, {
        category: 'interaction',
        summary: language === 'en-US' ? `The user likes ${like}` : `用户喜欢${like}`,
        value: like,
        confidence: 0.88,
        source: 'explicit',
        updatedAt
      })
    }
  }

  const dislikesMatch = trimmed.match(/(?:我不喜欢|别|不要)(.+)/)
  if (dislikesMatch?.[1]) {
    const dislike = dislikesMatch[1].trim().replace(/[。！!？?]$/, '')
    if (dislike.length <= 20) {
      profile.dislikes = uniquePush(profile.dislikes, dislike)
      preferences = upsertPreference(preferences, {
        category: trimmed.includes('提醒') ? 'reminder' : 'interaction',
        summary: language === 'en-US' ? `The user dislikes ${dislike}` : `用户不喜欢${dislike}`,
        value: dislike,
        confidence: 0.82,
        source: 'explicit',
        updatedAt
      })
    }
  }

  const comfortTopicMatch = trimmed.match(/(?:难受的时候|不开心的时候|烦的时候|压力大的时候|心情不好时)(?:聊聊|说说|提提|讲讲)?(.+)/)
  if (comfortTopicMatch?.[1]) {
    const comfortTopic = comfortTopicMatch[1].trim().replace(/[。！!？?]$/, '')
    if (comfortTopic && comfortTopic.length <= 20) {
      profile.comfortTopics = uniquePush(profile.comfortTopics, comfortTopic)
      preferences = updateComfortTopic(preferences, comfortTopic, updatedAt, 'explicit', language)
    }
  }

  const reminderPreferenceMatch = trimmed.match(/(?:提醒我时|提醒的时候|你提醒我)(.+)/)
  if (reminderPreferenceMatch?.[1]) {
    const reminderPreference = reminderPreferenceMatch[1].trim().replace(/[。！!？?]$/, '')
    if (reminderPreference && reminderPreference.length <= 24) {
      preferences = updateReminderPreference(preferences, reminderPreference, updatedAt, 'explicit', language)
      if (/轻点|温柔|别催|别太频繁/.test(reminderPreference)) {
        profile.dislikes = uniquePush(profile.dislikes, '太吵的提醒')
      }
    }
  }

  const focusPreferenceMatch = trimmed.match(/(?:我忙的时候|我专注的时候|写代码的时候|开会的时候)(.+)/)
  if (focusPreferenceMatch?.[1]) {
    const focusPreference = focusPreferenceMatch[1].trim().replace(/[。！!？?]$/, '')
    if (focusPreference && focusPreference.length <= 24) {
      preferences = updateWorkPreference(preferences, focusPreference, updatedAt, 'explicit', language)
    }
  }

  const habitPatterns = ['开会', '写代码', '写需求', '喝水', '摸鱼', '午休', '赶项目']
  const matchedHabit = habitPatterns.find((item) => trimmed.includes(item))
  if (matchedHabit) {
    profile.habits = uniquePush(profile.habits, matchedHabit)
    preferences = upsertPreference(preferences, {
      category: matchedHabit === '喝水' ? 'schedule' : 'work',
      summary: language === 'en-US' ? `The user has recently mentioned ${matchedHabit} often` : `用户最近常提到${matchedHabit}`,
      value: matchedHabit,
      confidence: 0.62,
      source: 'behavior',
      updatedAt
    })
  }

  next = {
    ...next,
    memory: {
      ...next.memory,
      profile,
      preferences,
      working: {
        ...next.memory.working,
        lastUserMessage: trimmed,
        lastUserMessageAt: updatedAt,
        lastObservedAt: updatedAt
      }
    }
  }

  return deriveCompanionPreferences(updateDailySummary(next, now), now)
}

const shouldRefreshSummary = (pet: PetData, sceneId: PetSceneId, now: number) => {
  const lastSummaryAt = pet.memory.working.lastSummaryAt ? new Date(pet.memory.working.lastSummaryAt).getTime() : 0
  if (!lastSummaryAt) return true
  if (now - lastSummaryAt >= SUMMARY_REFRESH_MS) return true
  return pet.memory.working.currentScene !== sceneId
}

// B5: relationship stage thresholds. closeness is the primary driver; trust
// gates the top tier so a quick burst of closeness from one petting session
// can't shoot the pet to "soulmate" overnight. Stage never goes backwards
// in this helper — neglected pets still register as 'soulmate' visually but
// their bond.summary will reflect the cooling. Going up triggers a one-off
// sticker fired by the controller (which compares prev vs next stage).
const RELATIONSHIP_STAGE_ORDER: PetData['memory']['relationship']['stage'][] = [
  'stranger', 'warming-up', 'friend', 'close', 'soulmate'
]

export const inferRelationshipStage = (
  bond: PetData['memory']['bond'],
  current: PetData['memory']['relationship']['stage']
): PetData['memory']['relationship']['stage'] => {
  const { closeness, trust } = bond
  let target: PetData['memory']['relationship']['stage'] = 'stranger'
  if (closeness >= 85 && trust >= 70) target = 'soulmate'
  else if (closeness >= 65) target = 'close'
  else if (closeness >= 40) target = 'friend'
  else if (closeness >= 20) target = 'warming-up'

  // Monotonic upgrade: don't demote, even if closeness drops below the
  // threshold later. Demotion would pop the user out of an emotional beat
  // they've already invested in.
  const currentIdx = RELATIONSHIP_STAGE_ORDER.indexOf(current)
  const targetIdx = RELATIONSHIP_STAGE_ORDER.indexOf(target)
  return targetIdx > currentIdx ? target : current
}

export const syncCompanionMemory = async (pet: PetData, sceneId: PetSceneId, now = Date.now()): Promise<PetData> => {
  const dated = ensureDailyEntry(pet, now)
  const currentMode = inferWorkingMode(dated, sceneId, now)
  const focusStartedAt = currentMode === 'focus' ? dated.memory.working.focusStartedAt ?? new Date(now).toISOString() : undefined
  const proactiveScene = sceneId === 'focus' || sceneId === 'lonely' || sceneId === 'reminder-soon'
  const reminderAlertAt = sceneId === 'reminder-alert' ? new Date(now).toISOString() : dated.memory.reminderStrategy.lastAlertAt
  const lastProactiveAt = proactiveScene ? new Date(now).toISOString() : dated.memory.working.lastProactiveAt

  const [today, ...rest] = dated.memory.daily
  const nextFocusMinutes = currentMode === 'focus' ? Math.min(24 * 60, today.focusMinutes + 1) : today.focusMinutes
  const nextBond = updateBondSummary({
    ...dated,
    memory: {
      ...dated.memory,
      bond: {
        ...dated.memory.bond,
        neglectedLevel: clamp(dated.state.loneliness * 0.9),
        interactionMomentum: clamp(dated.memory.bond.interactionMomentum * 0.82 + (sceneId === 'pet-react' || sceneId === 'excited' ? 18 : sceneId === 'focus' ? 6 : 2)),
        reliance: clamp(dated.memory.bond.reliance * 0.9 + (sceneId === 'focus' || sceneId === 'reminder-alert' ? 10 : 4)),
        warmth: clamp(dated.memory.bond.warmth * 0.85 + dated.state.affection * 0.18)
      }
    }
  })

  const nextStage = inferRelationshipStage(nextBond, dated.memory.relationship.stage)
  const updated = deriveCompanionPreferences(updateDailySummary(
    {
      ...dated,
      memory: {
        ...dated.memory,
        bond: nextBond,
        relationship: {
          ...dated.memory.relationship,
          stage: nextStage
        },
        working: {
          ...dated.memory.working,
          currentMode,
          currentScene: sceneId,
          currentTimePeriod: inferTimePeriod(now),
          focusStartedAt,
          lastObservedAt: new Date(now).toISOString(),
          lastProactiveAt
        },
        reminderStrategy: {
          ...dated.memory.reminderStrategy,
          lastAlertAt: reminderAlertAt
        },
        daily: [
          {
            ...today,
            focusMinutes: nextFocusMinutes
          },
          ...rest
        ]
      }
    },
    now
  ), now)

  const refreshSummary = shouldRefreshSummary(updated, sceneId, now)
  if (!refreshSummary) return updated

  const [bondSummary, recentFeeling, dailySummary] = await Promise.all([
    generateCompanionSummary(updated, 'bond'),
    generateCompanionSummary(updated, 'recent-feeling'),
    generateCompanionSummary(updated, 'daily')
  ])

  return {
    ...updated,
    memory: {
      ...updated.memory,
      bond: {
        ...updated.memory.bond,
        summary: bondSummary,
        recentFeeling
      },
      working: {
        ...updated.memory.working,
        lastSummaryAt: new Date(now).toISOString()
      },
      daily: updated.memory.daily.length
        ? [
            {
              ...updated.memory.daily[0],
              summary: dailySummary
            },
            ...updated.memory.daily.slice(1)
          ]
        : updated.memory.daily
    }
  }
}

export const noteInteractionInDaily = (pet: PetData, now = Date.now()): PetData => {
  const dated = ensureDailyEntry(pet, now)
  const [today, ...rest] = dated.memory.daily
  return updateDailySummary(
    {
      ...dated,
      memory: {
        ...dated.memory,
        daily: [
          {
            ...today,
            interactionCount: today.interactionCount + 1
          },
          ...rest
        ]
      }
    },
    now
  )
}

export const recordReminderOutcome = (pet: PetData, outcome: 'done' | 'snooze' | 'ignore', now = Date.now()): PetData => {
  const dated = ensureDailyEntry(pet, now)
  const [today, ...rest] = dated.memory.daily
  const strategy = dated.memory.reminderStrategy

  const nextStrategy =
    outcome === 'done'
      ? {
          ...strategy,
          completionCount: strategy.completionCount + 1,
          consecutiveDone: strategy.consecutiveDone + 1,
          consecutiveSnooze: 0,
          gentleness: clamp(strategy.gentleness + 3),
          lastCompletedAt: new Date(now).toISOString(),
          lastResponseAt: new Date(now).toISOString()
        }
      : outcome === 'snooze'
        ? {
            ...strategy,
            snoozeCount: strategy.snoozeCount + 1,
            consecutiveDone: 0,
            consecutiveSnooze: strategy.consecutiveSnooze + 1,
            gentleness: clamp(strategy.gentleness - 6),
            preferredSnoozeMinutes: clamp(Math.round(strategy.preferredSnoozeMinutes * 0.7 + 5 * 0.3), 3, 15),
            lastResponseAt: new Date(now).toISOString()
          }
        : {
            ...strategy,
            ignoreCount: strategy.ignoreCount + 1,
            consecutiveDone: 0,
            consecutiveSnooze: 0,
            gentleness: clamp(strategy.gentleness - 4),
            lastResponseAt: new Date(now).toISOString()
          }

  return deriveCompanionPreferences(
    updateDailySummary(
      {
        ...dated,
        memory: {
          ...dated.memory,
          reminderStrategy: nextStrategy,
          daily: [
            {
              ...today,
              reminderCompleted: outcome === 'done' ? today.reminderCompleted + 1 : today.reminderCompleted,
              reminderSnoozed: outcome === 'snooze' ? today.reminderSnoozed + 1 : today.reminderSnoozed
            },
            ...rest
          ]
        }
      },
      now
    ),
    now
  )
}

export const getReminderSnoozeMinutes = (pet: PetData) => clamp(Math.round(pet.memory.reminderStrategy.preferredSnoozeMinutes), 3, 15)

export const getCompanionPresenceText = (pet: PetData, hasActiveReminder: boolean) => {
  const english = getLanguage(pet) === 'en-US'
  if (hasActiveReminder) return english ? 'Actively reminding you' : '正在认真提醒你'
  if (pet.state.isSleeping) return english ? 'Sleeping quietly' : '安静睡着'
  if (pet.memory.working.currentMode === 'focus') return english ? 'Low-interruption company' : '低打扰陪着你'
  if (pet.memory.working.currentMode === 'care') return english ? 'Watching the time for you' : '在替你盯时间'
  if (pet.memory.working.currentMode === 'chat') return english ? 'Waiting for you to continue' : '正等你继续说'
  if (pet.memory.working.currentMode === 'rest') return english ? 'Slowing down with you' : '想和你一起慢下来'
  return english ? 'Keeping you company at the desk' : '在桌边陪你'
}

export const buildEventTags = (event: EventMemory): string[] => {
  const tags: string[] = [event.type]
  if (event.importance >= 2) tags.push('important')
  if (event.petEmotion === 'lonely') tags.push('bond')
  if (event.sceneId) tags.push(event.sceneId)
  return tags
}

// Refresh the relationship.weeklySummary at most once per week. This is the
// "B+C" payoff: the user gets a 2-3 sentence narrative every Sunday-ish that
// pulls together which moments mattered, what mood the week had, and how busy
// you two were. Cheap to call -- it short-circuits unless 7+ days have passed
// since the last consolidation.
//
// `force` skips the cadence check (used by the "再总结一次" button) but still
// requires at least one importance>=2 event or one daily entry, otherwise the
// summary would just say "nothing happened" and erase any existing one.
const WEEKLY_CONSOLIDATION_INTERVAL_MS = 7 * 86_400_000

export const isWeeklyConsolidationDue = (pet: PetData, now = Date.now()): boolean => {
  const last = pet.memory.relationship.weeklyConsolidationAt
  if (!last) {
    // First-ever consolidation: only fire once we've accumulated a few days
    // of data so the LLM has something concrete to work with.
    return pet.memory.daily.length >= 3
  }
  const lastTs = new Date(last).getTime()
  if (!Number.isFinite(lastTs)) return true
  return now - lastTs >= WEEKLY_CONSOLIDATION_INTERVAL_MS
}

export interface WeeklyConsolidationResult {
  pet: PetData
  refreshed: boolean
  // Reason the consolidation was skipped, surfaced to the panel UI so the
  // "再总结一次" button can show a soft hint instead of failing silently.
  skippedReason?: 'too-soon' | 'no-data'
}

export const consolidateWeeklyMemory = async (
  pet: PetData,
  options: { force?: boolean; now?: number } = {}
): Promise<WeeklyConsolidationResult> => {
  const now = options.now ?? Date.now()
  if (!options.force && !isWeeklyConsolidationDue(pet, now)) {
    return { pet, refreshed: false, skippedReason: 'too-soon' }
  }

  const cutoff = now - WEEKLY_CONSOLIDATION_INTERVAL_MS
  const weeklyEventCount = pet.memory.events.filter((event) => {
    const ts = new Date(event.ts).getTime()
    return Number.isFinite(ts) && ts >= cutoff
  }).length
  // Require either a real event OR enough daily history that the LLM can
  // actually say something specific. Otherwise the summary devolves into
  // "nothing happened" filler that overwrites a real previous week.
  const hasEnoughDaily = pet.memory.daily.length >= 2 || pet.memory.daily.some((day) => (day.interactionCount ?? 0) >= 3)

  // B4: when the week is too cold to summarise, bump weeklyConsolidationAt
  // forward by one day so the auto-scheduler doesn't retry every 6 hours
  // forever. We treat the skip as "we did look, just nothing to write down
  // yet" — the pet's perception of when it last reflected, not when it
  // last produced text.
  const dayMs = 86_400_000
  const partialCheckIso = new Date(now - WEEKLY_CONSOLIDATION_INTERVAL_MS + dayMs).toISOString()
  const markPartialCheck = (current: PetData): PetData => ({
    ...current,
    memory: {
      ...current.memory,
      relationship: {
        ...current.memory.relationship,
        weeklyConsolidationAt: partialCheckIso
      }
    }
  })

  if (weeklyEventCount === 0 && !hasEnoughDaily) {
    return { pet: options.force ? pet : markPartialCheck(pet), refreshed: false, skippedReason: 'no-data' }
  }

  const summary = await generateCompanionSummary(pet, 'weekly')
  const trimmed = summary.trim()
  if (!trimmed) {
    return { pet: options.force ? pet : markPartialCheck(pet), refreshed: false, skippedReason: 'no-data' }
  }

  return {
    pet: {
      ...pet,
      memory: {
        ...pet.memory,
        relationship: {
          ...pet.memory.relationship,
          weeklySummary: trimmed,
          weeklyConsolidationAt: new Date(now).toISOString()
        }
      }
    },
    refreshed: true
  }
}

// Proactive recall: scan the fact ledger for keys the user used to track but
// has gone quiet on, then prompt the LLM to bring it up naturally
// ("欸你最近都没说体重哦"). Throttled to at most once every 4 hours so it
// stays a chat moment, not a nag.
const PROACTIVE_RECALL_COOLDOWN_MS = 4 * 60 * 60_000
const PROACTIVE_RECALL_STALE_DAYS = 5

export interface ProactiveRecallResult {
  pet: PetData
  // The bubble text the model produced; rendered as a regular companion
  // bubble. Undefined when nothing fired (no stale facts, on cooldown, etc).
  bubble?: string
  // Why it was skipped, surfaced for tests and debug only.
  skippedReason?: 'cooldown' | 'no-stale-fact' | 'model-empty'
  // Echoed back so the controller can stamp `pet.memory.facts.lastProactiveRecallAt`
  // even when it ends up taking a different copy of the pet from somewhere
  // else (commit pipeline merging happens upstream).
  recalledKey?: string
}

interface TryProactiveFactRecallInput {
  pet: PetData
  scene: PetSceneState
  reminderPhase: PetReminderPhase
  now?: number
}

export const tryProactiveFactRecall = async (
  input: TryProactiveFactRecallInput
): Promise<ProactiveRecallResult> => {
  const now = input.now ?? Date.now()
  const ledger = input.pet.memory.facts
  const lastRecall = ledger.lastProactiveRecallAt ? new Date(ledger.lastProactiveRecallAt).getTime() : 0
  if (lastRecall && now - lastRecall < PROACTIVE_RECALL_COOLDOWN_MS) {
    return { pet: input.pet, skippedReason: 'cooldown' }
  }

  const stale = pickStaleFactKey(input.pet, { staleAfterDays: PROACTIVE_RECALL_STALE_DAYS, now })
  if (!stale) return { pet: input.pet, skippedReason: 'no-stale-fact' }

  const latestLabel = (() => {
    const value = stale.latest.value
    if (typeof value === 'number') {
      const trimmed = Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '')
      return stale.latest.unit ? `${trimmed} ${stale.latest.unit}` : trimmed
    }
    return value
  })()

  const reply = await generatePetDialogue({
    pet: input.pet,
    scene: input.scene,
    reminderPhase: input.reminderPhase,
    factRecall: {
      key: stale.key,
      latest: latestLabel,
      daysSince: stale.daysSince
    }
  })

  const text = reply.text?.trim()
  if (!text) {
    // Even if the model didn't produce anything, stamp the cooldown so we
    // don't retry every 30 minutes in a loop on broken LLMs.
    return { pet: stampProactiveRecall(input.pet, now), skippedReason: 'model-empty' }
  }

  return {
    pet: stampProactiveRecall(input.pet, now),
    bubble: text,
    recalledKey: stale.key
  }
}
