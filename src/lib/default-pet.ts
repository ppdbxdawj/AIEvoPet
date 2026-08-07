import type { PetData } from '../types/pet'

const nowIso = () => new Date().toISOString()
const todayKey = () => new Date().toISOString().slice(0, 10)

// Starter wardrobe is intentionally empty: every wearable item ships
// behind the blind-box shop so the panel's "已解锁的穿搭" list either
// shows real, renderable PNGs or shows an empty-state hint that points
// the user at the shop. Earlier defaults seeded three legacy ids
// (classic-bow / cloud-scarf / sun-hat) that never had manifest
// entries; clicking them did nothing visible, which made users (rightly)
// ask "怎么没用上".
export const starterWardrobe: string[] = []

export const createDefaultPet = (): PetData => ({
  personality: {
    name: '啵啵',
    species: 'puppy',
    corePersonality: '黏人、嘴硬、会偷偷关心你',
    speakingStyle: ['短句', '口语化', '偶尔用“哼”', '喜欢撒娇但不承认'],
    likes: ['被摸摸', '陪伴', '零食', '安静地待在你旁边'],
    dislikes: ['被忽略', '太吵', '饿肚子'],
    worldview: '你是它最重要的人，它想一直陪着你。',
    defaultMood: 'playful'
  },
  state: {
    level: 1,
    stage: 'egg',
    ageDays: 0,
    hunger: 22,
    mood: 82,
    cleanliness: 88,
    health: 92,
    energy: 76,
    affection: 40,
    loneliness: 18,
    isSleeping: false,
    lastInteractionAt: nowIso(),
    lastCareAt: nowIso()
  },
  memory: {
    profile: {
      petName: '啵啵',
      userAddress: '你',
      chosenSpecies: 'puppy',
      selectedPalette: 'cotton-candy',
      selectedGender: 'girl',
      likes: [],
      dislikes: [],
      habits: [],
      comfortTopics: []
    },
    preferences: [],
    working: {
      currentMode: 'idle',
      currentScene: 'idle',
      currentTimePeriod: 'afternoon',
      lastObservedAt: nowIso()
    },
    daily: [
      {
        date: todayKey(),
        summary: '啵啵还在蛋里，安静等着和你见面。',
        dominantMood: 'warm',
        focusMinutes: 0,
        interactionCount: 0,
        reminderCompleted: 0,
        reminderSnoozed: 0
      }
    ],
    bond: {
      closeness: 34,
      trust: 32,
      reliance: 20,
      warmth: 40,
      neglectedLevel: 10,
      interactionMomentum: 12,
      summary: '它还在悄悄认识你，像一颗等你领养的小生命。',
      recentFeeling: '它有点好奇，也有点期待被你带回桌面。'
    },
    reminderStrategy: {
      preferredSnoozeMinutes: 5,
      gentleness: 72,
      completionCount: 0,
      snoozeCount: 0,
      ignoreCount: 0,
      consecutiveDone: 0,
      consecutiveSnooze: 0
    },
    relationship: {
      stage: 'stranger',
      dayMilestones: [],
      summary: '它刚准备和你开始第一段陪伴关系。'
    },
    companionPreferences: {
      interactionStyle: 'warm',
      reminderStyle: 'gentle',
      addressStyle: 'name',
      focusSupportStyle: 'quiet',
      lowMoodSupportStyle: 'gentle',
      favoriteTopics: [],
      recentTopics: [],
      avoidPhrases: [],
      learnedSpeechStyle: [],
      summary: '它还在通过对话慢慢摸清你喜欢怎样被陪伴。',
      updatedAt: nowIso()
    },
    aiSetup: {
      status: 'needs-setup',
      provider: 'ollama',
      desiredModel: 'qwen3:4b-instruct',
      endpoint: 'http://127.0.0.1:11434',
      note: '先检查本机是否已有可用的大语言模型。'
    },
    events: [
      {
        id: crypto.randomUUID(),
        ts: nowIso(),
        type: 'idle',
        summary: '它安静待在蛋里，等着第一次和你见面。',
        petEmotion: 'excited',
        importance: 2,
        sceneId: 'idle',
        tags: ['first-awake', 'bond-start', 'egg']
      }
    ],
    facts: {
      records: [],
      trackable: {}
    },
    traits: {
      energy: 56,
      bond: 52,
      talkative: 48,
      playful: 58,
      routine: 44,
      summary: '现在还是颗小小的蛋，已经隐约看得出会黏人又有点活泼。'
    }
  },
  ui: {
    panelOpen: false,
    language: 'zh-CN',
    onboardingCompleted: false,
    onboarding: {
      currentStep: 'language',
      completedSteps: []
    },
    companionSurfaces: {
      activeTab: 'care'
    },
    system: {
      vacationMode: false,
      bossModeEnabled: false,
      nestModeEnabled: false,
      strongReminderEnabled: false,
      stickerHistory: { entries: [] },
      developerModeEnabled: false
    },
    wardrobeSelection: undefined,
    wardrobeUnlocked: starterWardrobe,
    wardrobeEquipped: {},
    wardrobeVariantByItem: {},
    speciesVariantBySpecies: {},
    wardrobePlacements: {},
    cutoutPlacementsByAppearance: {},
    wardrobeDrawHistory: [],
    showMemoryEditor: false
  }
})
