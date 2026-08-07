import type { PetLanguage } from '../types/pet'

export const DEFAULT_LANGUAGE: PetLanguage = 'zh-CN'

export const resolveLanguage = (language?: string | null): PetLanguage => (
  language === 'en-US' || language === 'zh-CN' ? language : DEFAULT_LANGUAGE
)

type TranslationValue = string | ((params?: Record<string, string | number>) => string)

const dictionary = {
  'app.loading': {
    'zh-CN': '桌宠正在醒来…',
    'en-US': 'Your desktop pet is waking up…'
  },
  'hover.placeholder.idle': {
    'zh-CN': '和它搭句话…',
    'en-US': 'Say something to it…'
  },
  'hover.placeholder.loading': {
    'zh-CN': '它正在想…',
    'en-US': 'It is thinking…'
  },
  'hover.button.send': {
    'zh-CN': '发送',
    'en-US': 'Send'
  },
  'hover.button.loading': {
    'zh-CN': '思考中',
    'en-US': 'Thinking'
  },
  'hover.trigger.title': {
    'zh-CN': '聊聊',
    'en-US': 'Chat'
  },
  'hover.trigger.sleeping': {
    'zh-CN': '轻轻叫它一声',
    'en-US': 'Call it gently'
  },
  'hover.trigger.awake': {
    'zh-CN': 'hover 就会展开',
    'en-US': 'Hover to open'
  },
  'status.hunger': {
    'zh-CN': '饱腹',
    'en-US': 'Fullness'
  },
  'status.mood': {
    'zh-CN': '心情',
    'en-US': 'Mood'
  },
  'status.cleanliness': {
    'zh-CN': '清洁',
    'en-US': 'Cleanliness'
  },
  'status.health': {
    'zh-CN': '健康',
    'en-US': 'Health'
  },
  'status.energy': {
    'zh-CN': '精力',
    'en-US': 'Energy'
  },
  'common.close': {
    'zh-CN': '收起',
    'en-US': 'Collapse'
  },
  'panel.memory.manage': {
    'zh-CN': '管理记忆',
    'en-US': 'Manage memory'
  },
  'panel.memory.hide': {
    'zh-CN': '收起记忆',
    'en-US': 'Hide memory'
  },
  'pet.caption.sleeping': {
    'zh-CN': '轻点看看它，双击叫醒它。',
    'en-US': 'Tap to check on it, double-tap to wake it.'
  },
  'pet.caption.awake': {
    'zh-CN': '轻点展开，双击摸摸它。',
    'en-US': 'Tap to open, double-tap to pet it.'
  },
  'focus.pill': {
    'zh-CN': '低打扰陪着你',
    'en-US': 'Quietly keeping you company'
  },
  'onboarding.title': {
    'zh-CN': '领养流程',
    'en-US': 'Adoption flow'
  },
  'onboarding.progress': {
    'zh-CN': (params) => `第 ${params?.progress ?? ''} 步，先选择语言，再把称呼、外观和大脑接好，最后让它正式破壳。`,
    'en-US': (params) => `Step ${params?.progress ?? ''}: choose a language, set its name, look, and brain, then hatch it.`
  },
  'onboarding.step.language': {
    'zh-CN': '语言',
    'en-US': 'Language'
  },
  'onboarding.step.identity': {
    'zh-CN': '称呼',
    'en-US': 'Names'
  },
  'onboarding.step.appearance': {
    'zh-CN': '外观',
    'en-US': 'Look'
  },
  'onboarding.step.brain': {
    'zh-CN': '大脑',
    'en-US': 'Brain'
  },
  'onboarding.step.hatch': {
    'zh-CN': '破壳',
    'en-US': 'Hatch'
  },
  'onboarding.language.title': {
    'zh-CN': '先选择语言',
    'en-US': 'Choose a language first'
  },
  'onboarding.language.copy': {
    'zh-CN': '它之后的界面、提醒、默认回复和本地模型提示词都会使用这个语言。旧日记和记忆会保持原文。',
    'en-US': 'Its UI, reminders, fallback replies, and local model prompts will use this language. Old diary and memory entries stay as written.'
  },
  'onboarding.language.zh': {
    'zh-CN': '中文',
    'en-US': 'Chinese'
  },
  'onboarding.language.en': {
    'zh-CN': 'English',
    'en-US': 'English'
  },
  'onboarding.language.zh.copy': {
    'zh-CN': '使用简体中文陪伴、提醒和对话。',
    'en-US': 'Use Simplified Chinese for companionship, reminders, and chat.'
  },
  'onboarding.language.en.copy': {
    'zh-CN': 'Use English for the app and pet replies.',
    'en-US': 'Use English for the app and pet replies.'
  },
  'onboarding.language.next': {
    'zh-CN': '继续设置称呼',
    'en-US': 'Continue to names'
  },
  'onboarding.identity.petName': {
    'zh-CN': '宠物名字',
    'en-US': 'Pet name'
  },
  'onboarding.identity.petName.placeholder': {
    'zh-CN': '比如：啵啵',
    'en-US': 'e.g. Bobo'
  },
  'onboarding.identity.userName': {
    'zh-CN': '它怎么叫你',
    'en-US': 'What it calls you'
  },
  'onboarding.identity.userName.placeholder': {
    'zh-CN': '比如：阿江',
    'en-US': 'e.g. Alex'
  },
  'onboarding.identity.gender': {
    'zh-CN': '性别气质',
    'en-US': 'Vibe'
  },
  'onboarding.identity.girl': {
    'zh-CN': '女孩',
    'en-US': 'Girl'
  },
  'onboarding.identity.boy': {
    'zh-CN': '男孩',
    'en-US': 'Boy'
  },
  'onboarding.identity.next': {
    'zh-CN': '进入外观设置',
    'en-US': 'Set appearance'
  },
  'onboarding.appearance.copy': {
    'zh-CN': '先选一套真实外观，破壳前会显示对应的蛋，破壳后会切到对应宠物素材。',
    'en-US': 'Choose its real look first. Before hatching it shows the matching egg, then switches to the pet artwork.'
  },
  'onboarding.appearance.previewLabel': {
    'zh-CN': '当前外观预览',
    'en-US': 'Current appearance preview'
  },
  'onboarding.appearance.eggWaiting': {
    'zh-CN': '当前会先以对应蛋态等待破壳。',
    'en-US': 'It will wait as the matching egg until hatching.'
  },
  'onboarding.appearance.petReady': {
    'zh-CN': '已经切到当前外观的宠物形态。',
    'en-US': 'It is already using this pet form.'
  },
  'onboarding.appearance.eggPreview': {
    'zh-CN': '蛋态预览',
    'en-US': 'Egg preview'
  },
  'onboarding.appearance.petPreview': {
    'zh-CN': '宠物预览',
    'en-US': 'Pet preview'
  },
  'onboarding.appearance.paletteCopy': {
    'zh-CN': '色板会同时调整面板、对话气泡、聊天框和桌宠周围的氛围，挑一个你看着舒服的。',
    'en-US': 'The palette affects the panel, bubbles, chat box, and pet atmosphere. Pick one that feels comfortable.'
  },
  'onboarding.appearance.next': {
    'zh-CN': '去连接大语言模型',
    'en-US': 'Connect the local model'
  },
  'confirm.speciesSwap': {
    'zh-CN': (params) => `确定要把它从「${params?.current ?? ''}」换成「${params?.next ?? ''}」吗？外观和动画会立刻变化。`,
    'en-US': (params) => `Switch it from “${params?.current ?? ''}” to “${params?.next ?? ''}”? Its look and animations will change right away.`
  },
  'panel.care.dragHint': {
    'zh-CN': '在宠物窗口底部拖动托盘到小精灵身上即可照料。',
    'en-US': 'Drag items from the tray under the pet in the pet window onto the sprite.'
  },
  'panel.care.fallbackToggle': {
    'zh-CN': '更多 · 面板按钮',
    'en-US': 'More · panel buttons'
  },
  'care.tray.feed': {
    'zh-CN': '食物',
    'en-US': 'Food'
  },
  'care.tray.drink': {
    'zh-CN': '水',
    'en-US': 'Water'
  },
  'care.tray.bath': {
    'zh-CN': '洗澡',
    'en-US': 'Bath'
  },
  'care.tray.pet': {
    'zh-CN': '摸摸',
    'en-US': 'Pet'
  },
  'care.tray.hold': {
    'zh-CN': '抱抱',
    'en-US': 'Hold'
  },
  'care.tray.sleep': {
    'zh-CN': '睡觉',
    'en-US': 'Sleep'
  },
  'care.tray.wake': {
    'zh-CN': '叫醒',
    'en-US': 'Wake'
  },
  'care.tray.aria': {
    'zh-CN': '拖动照料物品到宠物身上',
    'en-US': 'Drag care items onto the pet'
  },
  'interaction.refuse.sleeping': {
    'zh-CN': '我在睡觉啦…',
    'en-US': 'Let me sleep…'
  },
  'interaction.refuse.sleep.already': {
    'zh-CN': '已经在睡啦。',
    'en-US': 'Already asleep.'
  },
  'interaction.refuse.awake.not_sleeping': {
    'zh-CN': '我还没睡着呢。',
    'en-US': 'I am not sleeping yet.'
  },
  'interaction.refuse.feed.full': {
    'zh-CN': '我不饿。',
    'en-US': 'I am not hungry.'
  },
  'interaction.refuse.drink.full': {
    'zh-CN': '现在不想喝水。',
    'en-US': 'Not thirsty right now.'
  },
  'interaction.refuse.bath.clean': {
    'zh-CN': '刚洗过啦。',
    'en-US': 'Just bathed!'
  },
  'interaction.refuse.sleep.not_tired': {
    'zh-CN': '还不困呢。',
    'en-US': 'Not sleepy yet.'
  },
  'tab.overview': {
    'zh-CN': '陪伴',
    'en-US': 'Companion'
  },
  'tab.care': {
    'zh-CN': '照料',
    'en-US': 'Care'
  },
  'tab.grow': {
    'zh-CN': '成长',
    'en-US': 'Growth'
  },
  'tab.diary': {
    'zh-CN': '日记',
    'en-US': 'Diary'
  },
  'tab.settings': {
    'zh-CN': '设置',
    'en-US': 'Settings'
  }
} satisfies Record<string, Record<PetLanguage, TranslationValue>>

export type TranslationKey = keyof typeof dictionary

export const t = (language: PetLanguage | undefined, key: TranslationKey, params?: Record<string, string | number>): string => {
  const resolved = resolveLanguage(language)
  const value = dictionary[key][resolved]
  return typeof value === 'function' ? value(params) : value
}

export const formatDateTime = (language: PetLanguage | undefined, value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(resolveLanguage(language), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
