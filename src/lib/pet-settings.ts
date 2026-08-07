import type { PetData, PetLanguage, PetSettingsUpdate } from '../types/pet'
import { PALETTES, paletteOptions } from './palettes'

export interface PetSettingsApplyOutcome {
  pet: PetData
  applied: boolean
  // Short localized sentence for surfacing to the user as a confirmation.
  // When the update is rejected (unknown palette,
  // wardrobe item not unlocked, ...), `applied` is false and `description`
  // reads as a graceful no-op explanation instead.
  description: string
}

const TRUE_TOKENS = new Set(['on', 'true', '1', 'enable', 'enabled', '开', '开启', '启用', '是', '要', '需要', '打开'])
const FALSE_TOKENS = new Set(['off', 'false', '0', 'disable', 'disabled', '关', '关闭', '停用', '取消', '退出', '不要', '否', '不需要'])

const parseBooleanValue = (value: string): boolean | null => {
  const trimmed = value.trim().toLowerCase()
  if (TRUE_TOKENS.has(trimmed)) return true
  if (FALSE_TOKENS.has(trimmed)) return false
  return null
}

const getLanguage = (pet: PetData): PetLanguage => pet.ui.language === 'en-US' ? 'en-US' : 'zh-CN'

const phrase = (pet: PetData, zh: string, en: string) => getLanguage(pet) === 'en-US' ? en : zh

const labelForPalette = (id: string, language: PetLanguage): string => {
  const match = paletteOptions.find((option) => option.value === id)
  return match ? (language === 'en-US' ? match.labelEn : match.label) : id
}

const applyPaletteUpdate = (current: PetData, value: string): PetSettingsApplyOutcome => {
  const trimmed = value.trim()
  // Accept either the canonical palette id ("blueberry-milk") or the
  // human-readable label ("蓝莓奶") so a model that echoes the label still
  // takes effect.
  const matchById = PALETTES[trimmed]
  const matchByLabel = paletteOptions.find((option) => option.label === trimmed || option.labelEn.toLowerCase() === trimmed.toLowerCase())
  const targetId = matchById?.id ?? matchByLabel?.value
  if (!targetId) {
    return { pet: current, applied: false, description: phrase(current, `还没认识这个色板「${trimmed}」，先维持当前色调。`, `I do not know the “${trimmed}” palette yet, so I kept the current colors.`) }
  }
  if (current.memory.profile.selectedPalette === targetId) {
    return { pet: current, applied: false, description: phrase(current, `面板已经是${labelForPalette(targetId, 'zh-CN')}啦，没动它。`, `The panel is already using ${labelForPalette(targetId, 'en-US')}, so I left it unchanged.`) }
  }
  return {
    pet: {
      ...current,
      memory: {
        ...current.memory,
        profile: {
          ...current.memory.profile,
          selectedPalette: targetId
        }
      }
    },
    applied: true,
    description: phrase(current, `已经把面板换成${labelForPalette(targetId, 'zh-CN')}啦~`, `I switched the panel to ${labelForPalette(targetId, 'en-US')}.`)
  }
}

const applyWardrobeUpdate = (current: PetData, value: string): PetSettingsApplyOutcome => {
  const trimmed = value.trim()
  // Empty string / "none" / "off" all mean "take the current outfit off".
  if (!trimmed || trimmed.toLowerCase() === 'none' || FALSE_TOKENS.has(trimmed.toLowerCase())) {
    if (!current.ui.wardrobeSelection) {
      return { pet: current, applied: false, description: phrase(current, '它本来就没穿其它装扮。', 'It was not wearing any extra outfit already.') }
    }
    return {
      pet: {
        ...current,
        ui: { ...current.ui, wardrobeSelection: undefined }
      },
      applied: true,
      description: phrase(current, '帮它把当前装扮收起来啦。', 'I put away its current outfit.')
    }
  }
  const unlocked = current.ui.wardrobeUnlocked ?? []
  if (!unlocked.includes(trimmed)) {
    return { pet: current, applied: false, description: phrase(current, `「${trimmed}」这个穿搭还没解锁，先没换。`, `The “${trimmed}” outfit is not unlocked yet, so I did not change it.`) }
  }
  if (current.ui.wardrobeSelection === trimmed) {
    return { pet: current, applied: false, description: phrase(current, `它已经穿着${trimmed}了。`, `It is already wearing ${trimmed}.`) }
  }
  return {
    pet: { ...current, ui: { ...current.ui, wardrobeSelection: trimmed } },
    applied: true,
    description: phrase(current, `给它换上${trimmed}啦~`, `I dressed it in ${trimmed}.`)
  }
}

const applyPetNameUpdate = (current: PetData, value: string): PetSettingsApplyOutcome => {
  const trimmed = value.trim().replace(/^[「『"'\s]+|[」』"'\s。！!？?]+$/g, '')
  if (!trimmed || trimmed.length > 12) {
    return { pet: current, applied: false, description: phrase(current, '这个名字不太合适，先没改。', 'That name does not fit well, so I did not change it.') }
  }
  if (current.memory.profile.petName === trimmed && current.personality.name === trimmed) {
    return { pet: current, applied: false, description: phrase(current, `它已经叫${trimmed}啦。`, `It is already named ${trimmed}.`) }
  }
  return {
    pet: {
      ...current,
      // Only commit to personality.name once onboarding is past the identity
      // step; otherwise the onboarding flow is the source of truth and we
      // shouldn't race with it.
      personality: current.ui.onboardingCompleted
        ? { ...current.personality, name: trimmed }
        : current.personality,
      memory: {
        ...current.memory,
        profile: {
          ...current.memory.profile,
          petName: trimmed
        }
      }
    },
    applied: true,
    description: phrase(current, `好，以后叫它${trimmed}~`, `Okay, I will call it ${trimmed} from now on.`)
  }
}

const applySystemModeUpdate = (
  current: PetData,
  field: 'vacationMode' | 'bossModeEnabled' | 'nestModeEnabled',
  enabled: boolean,
  labelOn: string,
  labelOff: string,
  labelOnEn: string,
  labelOffEn: string
): PetSettingsApplyOutcome => {
  if (current.ui.system[field] === enabled) {
    return {
      pet: current,
      applied: false,
      description: getLanguage(current) === 'en-US'
        ? enabled ? `It is already in ${labelOnEn}.` : `${labelOnEn} was not enabled.`
        : enabled ? `已经在${labelOn}里啦。` : `${labelOn}本来就没开。`
    }
  }

  const baseSystem = { ...current.ui.system, [field]: enabled }
  // Mirror the exclusivity rules from handleSystemModeToggle: vacation,
  // bossMode and nestMode all suppress each other so we never end up in two
  // mutually-incompatible "lifestyle" modes at the same time.
  const nextSystem = enabled
    ? field === 'vacationMode'
      ? { ...baseSystem, bossModeEnabled: false, nestModeEnabled: false }
      : field === 'bossModeEnabled'
        ? { ...baseSystem, vacationMode: false }
        : { ...baseSystem, vacationMode: false }
    : baseSystem

  return {
    pet: {
      ...current,
      ui: { ...current.ui, system: nextSystem }
    },
    applied: true,
    description: getLanguage(current) === 'en-US'
      ? enabled ? `Okay, entering ${labelOnEn}.` : `Okay, ${labelOffEn}.`
      : enabled ? `好，进入${labelOn}。` : `好，${labelOff}。`
  }
}

// Strong reminder is the user-facing inverse of免打扰, so flipping it
// on must also clear vacation/boss/nest. Without this mutex you'd end
// up in a contradictory state where the panel chip says"强提醒"yet
// `shouldFireStrongReminder` would still gate everything off because a
// quiet mode is also enabled. Flipping it OFF doesn't force a quiet
// mode — the user might just want default behavior — so we leave the
// other flags alone.
const applyStrongReminderUpdate = (current: PetData, enabled: boolean): PetSettingsApplyOutcome => {
  const alreadyOn = Boolean(current.ui.system.strongReminderEnabled)
  const noQuietMode = !current.ui.system.vacationMode && !current.ui.system.bossModeEnabled && !current.ui.system.nestModeEnabled
  if (alreadyOn === enabled && (!enabled || noQuietMode)) {
    return {
      pet: current,
      applied: false,
      description: enabled
        ? phrase(current, '已经在强提醒里啦，不用再切了。', "It's already set to strong reminder, no need to switch.")
        : phrase(current, '强提醒本来就没开。', 'Strong reminder was not on.')
    }
  }
  const nextSystem = enabled
    ? {
        ...current.ui.system,
        strongReminderEnabled: true,
        vacationMode: false,
        bossModeEnabled: false,
        nestModeEnabled: false
      }
    : {
        ...current.ui.system,
        strongReminderEnabled: false
      }
  return {
    pet: { ...current, ui: { ...current.ui, system: nextSystem } },
    applied: true,
    description: enabled
      ? phrase(current, '好，进入强提醒模式：重要事件会瞬移到当前屏 + 系统通知。', 'Okay, switching to strong reminder mode: important events will teleport the pet to the current monitor and send an OS notification.')
      : phrase(current, '好，关掉强提醒，回到默认提醒强度。', 'Okay, strong reminder turned off; back to default reminder intensity.')
  }
}

export const applyPetSettingsUpdate = (current: PetData, update: PetSettingsUpdate): PetSettingsApplyOutcome => {
  switch (update.target) {
    case 'palette':
      return applyPaletteUpdate(current, update.value)
    case 'wardrobe':
      return applyWardrobeUpdate(current, update.value)
    case 'pet-name':
      return applyPetNameUpdate(current, update.value)
    case 'vacation-mode': {
      const enabled = parseBooleanValue(update.value)
      if (enabled === null) return { pet: current, applied: false, description: phrase(current, '没听明白要开还是关，先没动安静陪伴。', 'I could not tell whether to turn quiet companion on or off, so I left it unchanged.') }
      return applySystemModeUpdate(current, 'vacationMode', enabled, '安静陪伴', '退出安静陪伴', 'quiet companion mode', 'exiting quiet companion mode')
    }
    case 'boss-mode': {
      const enabled = parseBooleanValue(update.value)
      if (enabled === null) return { pet: current, applied: false, description: phrase(current, '没听明白要开还是关，先没动老板模式。', 'I could not tell whether to turn boss mode on or off, so I left it unchanged.') }
      return applySystemModeUpdate(current, 'bossModeEnabled', enabled, '老板模式', '退出老板模式', 'boss mode', 'exiting boss mode')
    }
    case 'nest-mode': {
      const enabled = parseBooleanValue(update.value)
      if (enabled === null) return { pet: current, applied: false, description: phrase(current, '没听明白要开还是关，先没动窝模式。', 'I could not tell whether to turn nest mode on or off, so I left it unchanged.') }
      return applySystemModeUpdate(current, 'nestModeEnabled', enabled, '窝模式', '退出窝模式', 'nest mode', 'exiting nest mode')
    }
    case 'strong-reminder': {
      const enabled = parseBooleanValue(update.value)
      if (enabled === null) return { pet: current, applied: false, description: phrase(current, '没听明白要开还是关强提醒，先没动它。', 'I could not tell whether to turn the strong reminder on or off, so I left it unchanged.') }
      return applyStrongReminderUpdate(current, enabled)
    }
    default:
      return { pet: current, applied: false, description: phrase(current, '这种设置改不了。', 'That setting cannot be changed here.') }
  }
}
