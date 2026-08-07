import { useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type { PetAppearanceAsset } from '../assets/pet/appearance-registry'
import { JOB_OPTIONS, ORACLE_DECKS, SHOP_ITEMS, getAchievementTitle } from '../lib/pet-domains'
import { BLIND_BOX_BUDGETS } from '../lib/wardrobe-shop'
import { getWardrobeItemById } from '../assets/wardrobe/manifest'
import type { InventoryState, EconomyState, HomeState, JobState, AchievementState, OracleState, AuditState, ToolRegistryState } from '../types/domain'
import { ChatBubble } from '../components/ChatBubble'
import { CutoutAlignmentEditor } from '../components/CutoutAlignmentEditor'
import { HoverChatDock } from '../components/HoverChatDock'
import { PetCanvas, petAnimationManifest, type PetHeadCue, type PetRendererMode, type PetWardrobeOverlayItem } from '../components/PetCanvas'
import { SpeciesGalleryPanel } from '../components/SpeciesGalleryPanel'
import { WardrobeAlignmentEditor } from '../components/WardrobeAlignmentEditor'
import { DEFAULT_PLACEMENT, type WardrobePlacement } from '../types/wardrobe'
import { StatusPanel } from '../components/StatusPanel'
import { t } from '../lib/i18n'
import type {
  PetAction,
  PetBubbleContent,
  PetCutoutPlacement,
  PetData,
  PetLeanDirection,
  PetModelConfig,
  PetModelHealth,
  PetOnboardingStep,
  PetLanguage,
  PetReminderIntensity,
  PetResolvedVisualState,
  ReminderItem
} from '../types/pet'
import type { PetDiaryConfig, PetDiaryEntry } from '../types/diary'
import type { ImportedPetLoadStatus } from '../types/pet-package'

type ScreenAwarenessStatus = {
  state: 'idle' | 'capturing' | 'ready' | 'error' | 'unsupported'
  preview?: string
  lineCount?: number
  message?: string
}

type UserPetImageImportStatus = {
  state: 'idle' | 'creating' | 'ready' | 'error'
  message?: string
}

interface PanelWindowShellProps {
  pet: PetData
  isPanelWindow: boolean
  panelVisible: boolean
  bubble: PetBubbleContent
  bubbleVisible: boolean
  action: PetAction
  visualState: PetResolvedVisualState
  paletteStyle: CSSProperties
  currentAppearanceLabel: string
  draft: string
  chatLoading: boolean
  hoverChatVisible: boolean
  hoverChatExpanded: boolean
  reminderTitle: string
  reminderTime: string
  reminderIntensity: PetReminderIntensity
  activeReminder: ReminderItem | null
  pendingReminders: ReminderItem[]
  rendererMode: PetRendererMode
  showMeshDebug: boolean
  showAlignmentEditor: boolean
  currentAppearanceAsset: PetAppearanceAsset
  appliedCutoutPlacements: PetCutoutPlacement[]
  cutoutPlacements: PetCutoutPlacement[]
  dockLeanDirection?: PetLeanDirection
  dockLeanAmount: 'still' | 'soft' | 'active'
  modelDraft: PetModelConfig | null
  modelHealth: PetModelHealth | null
  lastReplySource: 'model' | 'fallback'
  modelSaving: boolean
  modelConfigMessage: string
  screenAwarenessStatus?: ScreenAwarenessStatus
  hasModelDraftChanges: boolean
  inventoryState: InventoryState
  economyState: EconomyState
  homeState: HomeState
  jobState: JobState
  achievementState: AchievementState
  oracleState: OracleState
  auditState: AuditState
  toolState: ToolRegistryState
  formatStage: (stage: PetData['state']['stage'], language?: PetLanguage) => string
  formatWorkingMode: (mode: PetData['memory']['working']['currentMode'], language?: PetLanguage) => string
  formatAttentionMode: (pet: PetData, hasActiveReminder: boolean) => string
  formatReminderTime: (value: string, language?: PetLanguage) => string
  getCompanionPresenceText: (pet: PetData, hasActiveReminder: boolean) => string
  getReminderSnoozeMinutes: (pet: PetData) => number
  onboardingStep: PetOnboardingStep
  onboardingProgress: string
  aiSetupReady: boolean
  brainSetupHint: string
  importedPetLoadStatus: ImportedPetLoadStatus
  userPetImageImportStatus: UserPetImageImportStatus
  paletteOptions: readonly { value: string; label: string; labelEn?: string }[]
  speciesOptions: readonly { value: PetData['personality']['species']; label: string; labelEn?: string }[]
  onCreateUserPetFromImage: (file: File) => Promise<unknown>
  onOpenUserPetDir: () => Promise<void>
  onRescanUserPetPackages: () => Promise<void>
  onAdvanceOnboarding: () => void | Promise<void>
  onSelectOnboardingStep: (step: PetOnboardingStep) => void | Promise<void>
  onLanguageChange: (language: PetLanguage) => void | Promise<void>
  onCompanionTabChange: (tab: PetData['ui']['companionSurfaces']['activeTab']) => void | Promise<void>
  onPet: () => void
  onTogglePanel: () => void
  onPetDragStart: (event: PointerEvent) => void
  onDockHoverChange: (hovering: boolean) => void
  onDraftChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onExpand: () => void
  onCollapse: () => void
  onClosePanel: () => void
  onToggleMemoryEditor: () => void | Promise<void>
  onProfileFieldChange: (field: 'petName' | 'preferredName', value: string) => void | Promise<void>
  onSpeciesChange: (value: PetData['personality']['species']) => void | Promise<void>
  onPaletteChange: (value: string) => void | Promise<void>
  onGenderChange: (value: 'boy' | 'girl') => void | Promise<void>
  onHatchPet: () => void | Promise<void>
  onReminderTitleChange: (value: string) => void
  onReminderTimeChange: (value: string) => void
  onReminderIntensityChange: (value: PetReminderIntensity) => void
  onReminderSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onCompleteReminder: (id: string) => void | Promise<void>
  onSnoozeReminder: (id: string) => void | Promise<void>
  onWardrobeSelect: (value: string) => void | Promise<void>
  onWardrobeUnequip: () => void | Promise<void>
  onOpenUserWardrobeDir: () => Promise<void>
  onPreviewWardrobePlacement: (itemId: string, placement: WardrobePlacement) => void
  onUpdateWardrobePlacement: (itemId: string, placement: WardrobePlacement) => void | Promise<void>
  onResetWardrobePlacement: (itemId: string) => void | Promise<void>
  wardrobeOverlays?: PetWardrobeOverlayItem[]
  headCue?: PetHeadCue
  onExportAll: () => void | Promise<void>
  onClearMemories: (options: { alsoWeeklySummary: boolean }) => void | Promise<void>
  onRemovePreference: (id: string) => void | Promise<void>
  onRemoveFactRecord: (recordId: string) => void | Promise<void>
  onRemoveFactKey: (key: string) => void | Promise<void>
  onToggleFactKeyTracking: (key: string, enabled: boolean) => void | Promise<void>
  onClaimRewards: () => void | Promise<void>
  onDrawWardrobe: (band: 'low' | 'mid' | 'high') => void | Promise<void>
  onUseInventoryItem: (itemId: string) => void | Promise<void>
  onStartJob: (jobId: string) => void | Promise<void>
  onSwitchJob?: (jobId: string) => void | Promise<void>
  onCancelJob?: () => void | Promise<void>
  onClaimJob: () => void | Promise<void>
  onExportAchievementCard: () => void | Promise<void>
  onRevealShareCard: () => void | Promise<void>
  shareCardStatus: {
    state: 'idle' | 'exporting' | 'ready' | 'error'
    savedPath?: string
    fileName?: string
    clipboardCopied?: boolean
    message?: string
    kind?: 'manual' | 'growth'
    stage?: PetData['state']['stage']
  }
  onConsolidateWeeklyMemory: () => void | Promise<void>
  weeklySummaryStatus: {
    state: 'idle' | 'refreshing' | 'ready' | 'skipped' | 'error'
    message?: string
  }
  diaryEntries: PetDiaryEntry[]
  diaryConfig: PetDiaryConfig | null
  diarySelectedDate: string
  diaryStatus: {
    state: 'idle' | 'refreshing' | 'ready' | 'error'
    message?: string
  }
  onDiarySelectDate: (dateKey: string) => void
  onRefreshDiaryToday: () => void | Promise<void>
  onSealDiaryDate: (dateKey: string) => void | Promise<void>
  onAppendDiaryNote: (dateKey: string, note: string) => void | Promise<void>
  onAddGitRepoPath: (path: string) => void | Promise<void>
  onRemoveGitRepoPath: (path: string) => void | Promise<void>
  onToggleActivityTracking: (enabled: boolean) => void | Promise<void>
  onPomodoroStart: () => void | Promise<void>
  onDrawOracle: (deckId: string) => void | Promise<void>
  onToggleSystemMode: (field: keyof PetData['ui']['system']) => void | Promise<void>
  onToggleRendererMode: () => void
  onToggleAlignmentEditor: () => void
  onToggleMeshDebug: () => void
  onCutoutPlacementsChange: (next: PetCutoutPlacement[]) => void
  onResetCutoutPlacements: () => void
  onModelDraftEnabledChange: (enabled: boolean) => void
  onModelDraftEndpointChange: (value: string) => void
  onModelDraftNameChange: (value: string) => void
  onModelDraftTimeoutChange: (value: number) => void
  onSaveModelConfig: () => void | Promise<void>
  onCaptureScreenAwareness?: () => void | Promise<void>
  onResetModelDraft: () => void
}

export function PanelWindowShell({
  pet,
  isPanelWindow,
  panelVisible,
  bubble,
  bubbleVisible,
  action,
  visualState,
  paletteStyle,
  currentAppearanceLabel,
  draft,
  chatLoading,
  hoverChatVisible,
  hoverChatExpanded,
  reminderTitle,
  reminderTime,
  reminderIntensity,
  activeReminder,
  pendingReminders,
  rendererMode,
  showMeshDebug,
  showAlignmentEditor,
  currentAppearanceAsset,
  appliedCutoutPlacements,
  cutoutPlacements,
  dockLeanDirection,
  dockLeanAmount,
  modelDraft,
  modelHealth,
  lastReplySource,
  modelSaving,
  modelConfigMessage,
  screenAwarenessStatus = { state: 'idle' },
  hasModelDraftChanges,
  inventoryState,
  economyState,
  homeState,
  jobState,
  achievementState,
  oracleState,
  auditState,
  toolState,
  formatStage,
  formatWorkingMode,
  formatAttentionMode,
  formatReminderTime,
  getCompanionPresenceText,
  getReminderSnoozeMinutes,
  onboardingStep,
  onboardingProgress,
  aiSetupReady,
  brainSetupHint,
  importedPetLoadStatus,
  userPetImageImportStatus,
  paletteOptions,
  speciesOptions,
  onCreateUserPetFromImage,
  onOpenUserPetDir,
  onRescanUserPetPackages,
  onAdvanceOnboarding,
  onSelectOnboardingStep,
  onLanguageChange,
  onCompanionTabChange,
  onPet,
  onTogglePanel,
  onPetDragStart,
  onDockHoverChange,
  onDraftChange,
  onSubmit,
  onExpand,
  onCollapse,
  onClosePanel,
  onToggleMemoryEditor,
  onProfileFieldChange,
  onSpeciesChange,
  onPaletteChange,
  onGenderChange,
  onHatchPet,
  onReminderTitleChange,
  onReminderTimeChange,
  onReminderIntensityChange,
  onReminderSubmit,
  onCompleteReminder,
  onSnoozeReminder,
  onWardrobeSelect,
  onWardrobeUnequip,
  onOpenUserWardrobeDir,
  onPreviewWardrobePlacement,
  onUpdateWardrobePlacement,
  onResetWardrobePlacement,
  wardrobeOverlays,
  headCue,
  onExportAll,
  onClearMemories,
  onRemovePreference,
  onRemoveFactRecord,
  onRemoveFactKey,
  onToggleFactKeyTracking,
  onClaimRewards,
  onDrawWardrobe,
  onUseInventoryItem,
  onStartJob,
  onSwitchJob,
  onCancelJob,
  onClaimJob,
  onExportAchievementCard,
  onRevealShareCard,
  shareCardStatus,
  onConsolidateWeeklyMemory,
  weeklySummaryStatus,
  diaryEntries,
  diaryConfig,
  diarySelectedDate,
  diaryStatus,
  onDiarySelectDate,
  onRefreshDiaryToday,
  onSealDiaryDate,
  onAppendDiaryNote,
  onAddGitRepoPath,
  onRemoveGitRepoPath,
  onToggleActivityTracking,
  onDrawOracle,
  onToggleSystemMode,
  onToggleRendererMode,
  onToggleAlignmentEditor,
  onToggleMeshDebug,
  onCutoutPlacementsChange,
  onResetCutoutPlacements,
  onModelDraftEnabledChange,
  onModelDraftEndpointChange,
  onModelDraftNameChange,
  onModelDraftTimeoutChange,
  onSaveModelConfig,
  onCaptureScreenAwareness,
  onResetModelDraft
}: PanelWindowShellProps) {
  // Local UI state for destructive confirmations. Lives here (not in the
  // controller) because it only affects what's drawn -- the controller
  // shouldn't have to track which inline panel is open.
  const [clearMemoriesOpen, setClearMemoriesOpen] = useState(false)
  const [clearAlsoWeekly, setClearAlsoWeekly] = useState(false)

  // D3: wardrobe chip category filter. 'all' shows everything; selecting
  // a specific category narrows the chip row. Stored locally because it's
  // pure UI sugar — no need to round-trip through the controller / disk.
  const [wardrobeFilter, setWardrobeFilter] = useState<'all' | 'hat' | 'neck' | 'back' | 'hand' | 'mouth' | 'special'>('all')
  const [auditVisibleCount, setAuditVisibleCount] = useState(20)
  const [animationPreviewAction, setAnimationPreviewAction] = useState<PetAction | null>(null)
  const imagePetInputRef = useRef<HTMLInputElement | null>(null)
  const language = pet.ui.language ?? 'zh-CN'
  const copy = (zh: string, en: string) => language === 'en-US' ? en : zh
  const listJoiner = language === 'en-US' ? '; ' : '；'
  const developerModeEnabled = Boolean(pet.ui.system.developerModeEnabled)
  const readableId = (value: string) => value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  const normalizeReminderIntensity = (value: unknown): PetReminderIntensity => value === 'low' || value === 'high' ? value : 'medium'
  const reminderIntensityLabels: Record<PetReminderIntensity, string> = {
    low: copy('轻提醒', 'Light'),
    medium: copy('标准', 'Standard'),
    high: copy('强提醒', 'Strong')
  }
  const reminderIntensityShortLabels: Record<PetReminderIntensity, string> = {
    low: copy('轻', 'Light'),
    medium: copy('标', 'Std'),
    high: copy('强', 'Strong')
  }
  const formatReminderIntensity = (value: unknown) => reminderIntensityLabels[normalizeReminderIntensity(value)]
  const formatReminderIntensityShort = (value: unknown) => reminderIntensityShortLabels[normalizeReminderIntensity(value)]

  const handleClearMemoriesClick = () => {
    setClearAlsoWeekly(false)
    setClearMemoriesOpen(true)
  }
  const handleConfirmClearMemories = async () => {
    await onClearMemories({ alsoWeeklySummary: clearAlsoWeekly })
    setClearMemoriesOpen(false)
  }

  const getSpeciesLabel = (value: PetData['personality']['species']) => {
    const option = speciesOptions.find((item) => item.value === value)
    return option ? (language === 'en-US' ? option.labelEn ?? option.label : option.label) : String(value)
  }
  const onboardingSteps: { step: PetOnboardingStep; label: string; labelEn?: string }[] = [
    { step: 'language', label: t(language, 'onboarding.step.language') },
    { step: 'identity', label: t(language, 'onboarding.step.identity') },
    { step: 'appearance', label: t(language, 'onboarding.step.appearance') },
    { step: 'brain', label: t(language, 'onboarding.step.brain') },
    { step: 'hatch', label: t(language, 'onboarding.step.hatch') }
  ]

  const currentSpecies = pet.memory.profile.chosenSpecies ?? pet.personality.species
  const currentSpeciesLabel = getSpeciesLabel(currentSpecies)
  const presenceAppearanceLabel = currentAppearanceLabel || currentSpeciesLabel
  const petdexStatusText = userPetImageImportStatus.message ?? importedPetLoadStatus.message ?? (importedPetLoadStatus.count > 0
    ? copy(`已导入 ${importedPetLoadStatus.count} 个本地宠物`, `${importedPetLoadStatus.count} local pet${importedPetLoadStatus.count === 1 ? '' : 's'} imported`)
    : copy('把 manifest.json 宠物包放进本地 Petdex 文件夹。', 'Drop manifest.json pet packages into the local Petdex folder.'))
  const creatingImagePet = userPetImageImportStatus.state === 'creating'
  const handleImagePetInputChange = (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    void onCreateUserPetFromImage(file).finally(() => {
      input.value = ''
    })
  }
  const petdexImportControls = (
    <div className="toolbar-row">
      <input
        ref={imagePetInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label={copy('选择图片创建宠物', 'Choose image to create pet')}
        style={{ display: 'none' }}
        onChange={handleImagePetInputChange}
      />
      <button type="button" className="ghost-button" onClick={() => imagePetInputRef.current?.click()} disabled={creatingImagePet}>
        {creatingImagePet ? copy('创建中…', 'Creating…') : copy('用图片创建宠物', 'Create from image')}
      </button>
      <button type="button" className="ghost-button" onClick={() => void onOpenUserPetDir()}>
        {copy('打开 Petdex 文件夹', 'Open Petdex folder')}
      </button>
      <button type="button" className="ghost-button" onClick={() => void onRescanUserPetPackages()} disabled={importedPetLoadStatus.state === 'loading'}>
        {importedPetLoadStatus.state === 'loading' ? copy('扫描中…', 'Scanning…') : copy('重新扫描', 'Rescan')}
      </button>
      <span className="model-config-note">{petdexStatusText}</span>
    </div>
  )
  const stageLabel = formatStage(pet.state.stage, language)
  const companionStartedAt = pet.memory.relationship.anniversaryStartedAt ?? pet.state.hatchedAt ?? pet.ui.onboarding.finishedAt
  const companionStartedTime = companionStartedAt ? new Date(companionStartedAt).getTime() : NaN
  const companionDay = Number.isFinite(companionStartedTime)
    ? Math.max(1, Math.floor((Date.now() - companionStartedTime) / 86_400_000) + 1)
    : undefined
  const companionDayLabel = companionDay
    ? copy(`陪伴第 ${companionDay} 天`, `Day ${companionDay}`)
    : copy('还没破壳', 'Not hatched yet')
  const reminderNeedsAttention = Boolean(activeReminder) || pendingReminders.length > 0
  const careNeedsAttention = pet.state.hunger >= 68 || pet.state.energy < 28 || pet.state.mood < 38 || pet.state.cleanliness < 36 || pet.state.health < 55
  const rewardCount = economyState.pendingRewards.length
  const pendingRewardTotal = economyState.pendingRewards.reduce((sum, item) => sum + item.amount, 0)
  const unlockedWardrobeCount = (pet.ui.wardrobeUnlocked ?? []).length
  const inventoryTypeCount = inventoryState.items.length
  const unlockedAchievementCount = achievementState.unlocked.length
  const settingsNeedsAttention = Boolean(modelDraft?.enabled && modelHealth && !modelHealth.ok)
  const nextCompanionAction = activeReminder
    ? copy('先处理提醒', 'Handle the reminder')
    : careNeedsAttention
      ? copy('补一点照料', 'Give care')
      : rewardCount > 0
        ? copy('领取奖励', 'Claim rewards')
        : copy('状态稳定', 'Steady')
  const primaryAttentionTab: PetData['ui']['companionSurfaces']['activeTab'] | null = activeReminder
    ? 'reminders'
    : reminderNeedsAttention
      ? 'reminders'
    : careNeedsAttention
      ? 'care'
      : rewardCount > 0
        ? 'grow'
        : settingsNeedsAttention
          ? 'settings'
          : null
  const activeSurfaceTab = pet.ui.companionSurfaces.activeTab === 'overview' ? 'care' : pet.ui.companionSurfaces.activeTab
  const companionTabsBase: { key: PetData['ui']['companionSurfaces']['activeTab']; label: string; badge?: string; tone?: 'warning' | 'danger' | 'offline' }[] = [
    { key: 'care', label: copy('照料', 'Care'), badge: careNeedsAttention ? '!' : undefined, tone: careNeedsAttention ? 'warning' : undefined },
    { key: 'reminders', label: copy('提醒', 'Reminders'), badge: activeReminder ? '!' : pendingReminders.length > 0 ? String(pendingReminders.length) : undefined, tone: activeReminder ? 'danger' : pendingReminders.length > 0 ? 'warning' : undefined },
    { key: 'grow', label: copy('成长', 'Growth'), badge: rewardCount > 0 ? String(rewardCount) : undefined },
    { key: 'diary', label: copy('日记', 'Diary') },
    { key: 'settings', label: copy('设置', 'Settings'), badge: settingsNeedsAttention ? '!' : undefined, tone: settingsNeedsAttention ? 'offline' : undefined }
  ]
  const companionTabs = companionTabsBase.map((item) => {
    if (!primaryAttentionTab || item.key === primaryAttentionTab) return item
    return { ...item, badge: undefined, tone: undefined }
  })
  const inventoryItemMetaById = new Map<string, (typeof SHOP_ITEMS)[number]>(SHOP_ITEMS.map((item) => [item.id, item]))
  const activeJobMeta = jobState.activeJob ? JOB_OPTIONS.find((job) => job.id === jobState.activeJob?.id) : undefined
  const activeJobRemainingMinutes = jobState.activeJob
    ? Math.max(0, Math.ceil((new Date(jobState.activeJob.endsAt).getTime() - Date.now()) / 60_000))
    : 0
  const visibleAuditEntries = auditState.entries.slice(0, auditVisibleCount)
  const hasMoreAuditEntries = auditVisibleCount < auditState.entries.length
  const enabledToolCount = toolState.enabledTools.length
  const promptRequiredToolCount = toolState.promptsRequiredFor.length
  const animationPreviewActions = Object.keys(petAnimationManifest.chains)
    .filter((key): key is PetAction => key !== 'sleepy' || !pet.state.isSleeping)
  const recentPetEvents = pet.memory.events
    .filter((event) => event.summary?.trim())
    .slice(0, 4)
    .map((event) => ({
      id: `event-${event.id}`,
      title: event.summary,
      meta: `${copy('记忆', 'Memory')} · ${formatReminderTime(event.ts, language)}`,
      tone: event.importance >= 3 ? 'important' : 'normal'
    }))
  const recentDiaryItems = diaryEntries
    .slice(0, 2)
    .map((entry) => ({
      id: `diary-${entry.date}`,
      title: entry.narrative || entry.userNote || copy('日记已记录', 'Diary recorded'),
      meta: `${copy('日记', 'Diary')} · ${entry.date}`,
      tone: 'normal'
    }))
  const recentActivityItems = [
    ...(activeReminder ? [{
      id: `reminder-${activeReminder.id}`,
      title: activeReminder.title,
      meta: `${copy('当前提醒', 'Active reminder')} · ${formatReminderTime(activeReminder.snoozeUntil ?? activeReminder.scheduledAt, language)}`,
      tone: 'urgent'
    }] : []),
    ...auditState.entries.slice(0, 4).map((entry) => ({
      id: `audit-${entry.id}`,
      title: entry.summary,
      meta: `${entry.domain} · ${formatReminderTime(entry.at, language)}`,
      tone: entry.requiresConfirmation ? 'important' : 'normal'
    })),
    ...recentPetEvents,
    ...recentDiaryItems
  ].slice(0, 6)
  const agentSkillDescriptions: Record<Exclude<PetData['ui']['companionSurfaces']['activeTab'], 'overview'>, string> = {
    care: copy('状态、喂食和即时照料', 'Vitals, feeding, and care'),
    reminders: copy('到点事项和强度策略', 'Due tasks and reminder intensity'),
    grow: copy('爪币、兼职、衣柜和成就', 'Pawcoin, jobs, wardrobe, achievements'),
    diary: copy('每日活动和项目记录', 'Daily activity and project notes'),
    settings: copy('工具、外观、模型和记忆', 'Tools, appearance, model, memory')
  }
  const agentSkillMetrics: Record<Exclude<PetData['ui']['companionSurfaces']['activeTab'], 'overview'>, string> = {
    care: copy(`心情 ${pet.state.mood}%`, `Mood ${pet.state.mood}%`),
    reminders: pendingReminders.length > 0 ? copy(`${pendingReminders.length} 个待提醒`, `${pendingReminders.length} pending`) : copy('无待办', 'Clear'),
    grow: rewardCount > 0 ? copy(`待领 ${pendingRewardTotal}`, `${pendingRewardTotal} to claim`) : copy(`${economyState.pawcoin} 爪币`, `${economyState.pawcoin} pawcoin`),
    diary: diaryEntries[0]?.date ?? copy('今日待记录', 'Today pending'),
    settings: promptRequiredToolCount > 0 ? copy(`${promptRequiredToolCount} 个需确认`, `${promptRequiredToolCount} need approval`) : copy(`${enabledToolCount} 个工具`, `${enabledToolCount} tools`)
  }
  const detailDrawerTitle = companionTabs.find((item) => item.key === activeSurfaceTab)?.label ?? copy('照料', 'Care')

  return (
    <main className={`pet-app palette-${visualState.palette} ${panelVisible ? 'panel-open' : 'panel-closed'}`} style={paletteStyle}>
      {isPanelWindow ? null : (
        <section className="pet-stage">
          <div className={`bubble-slot ${bubbleVisible && bubble.text.trim() ? 'visible' : 'hidden'}`}>
            <ChatBubble bubble={bubble} />
          </div>
          {pet.memory.working.currentMode === 'focus' && !pet.ui.panelOpen ? <div className="focus-pill">{t(language, 'focus.pill')}</div> : null}
          <div className="pet-chat-anchor">
            <PetCanvas
              key={`${pet.memory.profile.chosenSpecies ?? pet.personality.species}:${pet.state.stage}:${pet.ui.speciesVariantBySpecies?.[pet.memory.profile.chosenSpecies ?? pet.personality.species] ?? 'default'}:${pet.ui.speciesChangedAt ?? 'stable'}`}
              action={action}
              isSleeping={pet.state.isSleeping}
              showDebug={showMeshDebug}
              rendererMode={showAlignmentEditor ? 'cutout' : rendererMode}
              species={pet.memory.profile.chosenSpecies ?? pet.personality.species}
              stage={pet.state.stage}
              appearanceVariantKey={pet.ui.speciesVariantBySpecies?.[pet.memory.profile.chosenSpecies ?? pet.personality.species]}
              appearanceResetKey={pet.ui.speciesChangedAt}
              placements={showAlignmentEditor ? cutoutPlacements : appliedCutoutPlacements}
              visualState={visualState}
              wardrobeOverlays={wardrobeOverlays}
              headCue={headCue}
              language={language}
              leanDirection={dockLeanDirection}
              leanAmount={dockLeanAmount}
              onPet={onPet}
              onTogglePanel={onTogglePanel}
              onPetDragStart={onPetDragStart}
              onDockHoverChange={onDockHoverChange}
            />
            <HoverChatDock
              visible={hoverChatVisible}
              expanded={hoverChatExpanded}
              panelOpen={pet.ui.panelOpen}
              isSleeping={pet.state.isSleeping}
              draft={draft}
              loading={chatLoading}
              language={language}
              onDraftChange={onDraftChange}
              onSubmit={onSubmit}
              onExpand={onExpand}
              onCollapse={onCollapse}
            />
          </div>
          <p className="pet-caption">{pet.state.isSleeping ? t(language, 'pet.caption.sleeping') : t(language, 'pet.caption.awake')}</p>
        </section>
      )}

      <section className={`pet-panel ${panelVisible ? 'open' : 'closed'}`}>
        <div className="pet-panel-header">
          <section className="pet-panel-presence">
            <div className={`pet-panel-avatar stage-${pet.state.stage}`} aria-hidden="true">
              <span>{presenceAppearanceLabel.slice(0, 1)}</span>
            </div>
            <div className="pet-panel-header-status">
              <div>
                <strong>{pet.personality.name}</strong>
                <span>{`${companionDayLabel} · ${presenceAppearanceLabel} · ${stageLabel} · ${getCompanionPresenceText(pet, Boolean(activeReminder))}`}</span>
              </div>
            </div>
          </section>
          <div className="pet-panel-header-actions">
            <button type="button" className="ghost-button button-quiet" onClick={() => void onToggleMemoryEditor()}>
              {pet.ui.showMemoryEditor ? t(language, 'panel.memory.hide') : t(language, 'panel.memory.manage')}
            </button>
            <button type="button" className="ghost-button button-quiet" onClick={onClosePanel}>
              {t(language, 'common.close')}
            </button>
          </div>
        </div>

        {!pet.ui.onboardingCompleted ? (
          <section className="onboarding-card companion-overview-card">
            <div className="section-header">
              <strong>{t(language, 'onboarding.title')}</strong>
              <span>{t(language, 'onboarding.progress', { progress: onboardingProgress })}</span>
            </div>

            <div className="onboarding-step-row">
              {onboardingSteps.map((item) => {
                const active = onboardingStep === item.step
                const completed = pet.ui.onboarding.completedSteps.includes(item.step)
                return (
                  <button
                    key={item.step}
                    type="button"
                    className={`chip-button onboarding-step-chip ${active ? 'active' : ''} ${completed ? 'done' : ''}`}
                    onClick={() => void onSelectOnboardingStep(item.step)}
                  >
                    {language === 'en-US' ? item.labelEn ?? item.label : item.label}
                  </button>
                )
              })}
            </div>

            {onboardingStep === 'language' ? (
              <>
                <div className="section-subcopy">{t(language, 'onboarding.language.copy')}</div>
                <div className="chip-row">
                  <button type="button" className={`chip-button ${language === 'zh-CN' ? 'active' : ''}`} onClick={() => void onLanguageChange('zh-CN')}>
                    <strong>{t(language, 'onboarding.language.zh')}</strong>
                    <span>{t(language, 'onboarding.language.zh.copy')}</span>
                  </button>
                  <button type="button" className={`chip-button ${language === 'en-US' ? 'active' : ''}`} onClick={() => void onLanguageChange('en-US')}>
                    <strong>{t(language, 'onboarding.language.en')}</strong>
                    <span>{t(language, 'onboarding.language.en.copy')}</span>
                  </button>
                </div>
                <button type="button" className="primary-wide-button" onClick={() => void onAdvanceOnboarding()}>
                  {t(language, 'onboarding.language.next')}
                </button>
              </>
            ) : null}

            {onboardingStep === 'identity' ? (
              <>
                <div className="onboarding-grid">
                  <label>
                    <span>{t(language, 'onboarding.identity.petName')}</span>
                    <input value={pet.memory.profile.petName ?? ''} onChange={(event) => void onProfileFieldChange('petName', event.target.value)} placeholder={t(language, 'onboarding.identity.petName.placeholder')} />
                  </label>
                  <label>
                    <span>{t(language, 'onboarding.identity.userName')}</span>
                    <input value={pet.memory.profile.preferredName ?? ''} onChange={(event) => void onProfileFieldChange('preferredName', event.target.value)} placeholder={t(language, 'onboarding.identity.userName.placeholder')} />
                  </label>
                  <label>
                    <span>{t(language, 'onboarding.identity.gender')}</span>
                    <select value={pet.memory.profile.selectedGender ?? 'girl'} onChange={(event) => void onGenderChange(event.target.value as 'boy' | 'girl')}>
                      <option value="girl">{t(language, 'onboarding.identity.girl')}</option>
                      <option value="boy">{t(language, 'onboarding.identity.boy')}</option>
                    </select>
                  </label>
                </div>
                <button type="button" className="primary-wide-button" onClick={() => void onAdvanceOnboarding()}>
                  {t(language, 'onboarding.identity.next')}
                </button>
              </>
            ) : null}

            {onboardingStep === 'appearance' ? (
              <>
                <div className="section-subcopy">{t(language, 'onboarding.appearance.copy')}</div>
                <section className="surface-card status-card">
                  <div className="section-header">
                    <strong>{copy('导入本地宠物', 'Import local pet')}</strong>
                    <span>{copy('使用你放进本机的 Petdex 包。', 'Use Petdex packages you place on this computer.')}</span>
                  </div>
                  {petdexImportControls}
                </section>
                <div className="onboarding-appearance-preview" aria-label={t(language, 'onboarding.appearance.previewLabel')}>
                  <div className="onboarding-appearance-preview-copy">
                    <strong>{currentAppearanceLabel}</strong>
                    <span>{pet.state.stage === 'egg' ? t(language, 'onboarding.appearance.eggWaiting') : t(language, 'onboarding.appearance.petReady')}</span>
                  </div>
                  <div className="onboarding-appearance-preview-chip">
                    <span>{pet.state.stage === 'egg' ? t(language, 'onboarding.appearance.eggPreview') : t(language, 'onboarding.appearance.petPreview')}</span>
                    <strong>{language === 'en-US' ? currentAppearanceAsset.labelEn : currentAppearanceAsset.label}</strong>
                  </div>
                </div>
                <SpeciesGalleryPanel
                  options={speciesOptions}
                  selected={pet.memory.profile.chosenSpecies ?? pet.personality.species}
                  // During onboarding the pet is often still "egg", which makes
                  // every species thumbnail look the same and feels like
                  // switching is broken. Force hatched preview for clarity.
                  previewStage={pet.ui.onboardingCompleted ? pet.state.stage : 'baby'}
                  language={language}
                  onSelect={(value) => void onSpeciesChange(value)}
                  ariaLabel={copy('选择宠物外观', 'Choose pet appearance')}
                />
                <div className="section-subcopy">{t(language, 'onboarding.appearance.paletteCopy')}</div>
                <div className="chip-row">
                  {paletteOptions.map((item) => (
                    <button key={item.value} type="button" className={`chip-button ${pet.memory.profile.selectedPalette === item.value ? 'active' : ''}`} onClick={() => void onPaletteChange(item.value)}>
                      {language === 'en-US' ? item.labelEn ?? item.label : item.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="primary-wide-button" onClick={() => void onAdvanceOnboarding()}>
                  {t(language, 'onboarding.appearance.next')}
                </button>
              </>
            ) : null}

            {onboardingStep === 'brain' ? (
              <section className="model-config-card onboarding-brain-card">
                <div className="companion-memory-header">
                  <strong>{copy('本地模型', 'Local model')}</strong>
                  <span>{brainSetupHint}</span>
                </div>
                <div className={`model-status-pill ${modelHealth?.ok ? 'online' : 'offline'}`}>
                  {modelHealth?.ok ? copy(`Qwen 可生成 · ${modelHealth.model}`, `Qwen can generate · ${modelHealth.model}`) : copy('Qwen 未通过生成检测 · fallback', 'Qwen failed generation check · fallback')}
                </div>
                <div className="model-config-grid">
                  <label className="alignment-toggle-field">
                    <span>{copy('启用本地模型', 'Enable local model')}</span>
                    <input
                      type="checkbox"
                      checked={modelDraft?.enabled ?? false}
                      onChange={(event) => {
                        onModelDraftEnabledChange(event.target.checked)
                      }}
                    />
                  </label>
                  <label>
                    <span>{copy('服务地址', 'Service URL')}</span>
                    <input
                      value={modelDraft?.endpoint ?? ''}
                      onChange={(event) => {
                        onModelDraftEndpointChange(event.target.value)
                      }}
                      placeholder="http://127.0.0.1:11434"
                    />
                  </label>
                  <label>
                    <span>{copy('模型名', 'Model name')}</span>
                    <input
                      value={modelDraft?.model ?? ''}
                      onChange={(event) => {
                        onModelDraftNameChange(event.target.value)
                      }}
                      placeholder="qwen3:4b-instruct"
                    />
                  </label>
                  <label>
                    <span>{copy('超时（毫秒）', 'Timeout (ms)')}</span>
                    <input
                      type="number"
                      min="2000"
                      max="60000"
                      step="1000"
                      value={modelDraft?.timeoutMs ?? 12000}
                      onChange={(event) => {
                        onModelDraftTimeoutChange(Number(event.target.value))
                      }}
                    />
                  </label>
                </div>
                <div className="model-config-actions">
                  <button type="button" className="ghost-button" onClick={() => void onSaveModelConfig()} disabled={!modelDraft || modelSaving || !hasModelDraftChanges}>
                    {modelSaving ? copy('保存中…', 'Saving…') : copy('保存并检测', 'Save and check')}
                  </button>
                  <button type="button" className="ghost-button" onClick={onResetModelDraft} disabled={!hasModelDraftChanges || modelSaving}>
                    {copy('还原', 'Reset')}
                  </button>
                </div>
                <p className="model-config-note">
                  {modelConfigMessage || copy('先确认 Ollama 模型在线。', 'Confirm the Ollama model is online first.')}
                </p>
                <button type="button" className="primary-wide-button" onClick={() => void onAdvanceOnboarding()} disabled={!aiSetupReady}>
                  {aiSetupReady ? copy('进入破壳', 'Go to hatch') : copy('等待模型在线', 'Waiting for model')}
                </button>
              </section>
            ) : null}

            {onboardingStep === 'hatch' ? (
              <section className="hatch-ready-card">
                <div className="section-header">
                  <strong>{copy('准备破壳', 'Ready to hatch')}</strong>
                  <span>{aiSetupReady ? copy('已准备好。', 'Ready.') : copy('模型未就绪。', 'Model not ready.')}</span>
                </div>
                <div className="companion-memory-grid">
                  <div>
                    <label>{copy('宠物名字', 'Pet name')}</label>
                    <p>{pet.memory.profile.petName ?? pet.personality.name}</p>
                  </div>
                  <div>
                    <label>{copy('称呼你', 'Calls you')}</label>
                    <p>{pet.memory.profile.preferredName ?? copy('还没填', 'Not set yet')}</p>
                  </div>
                  <div>
                    <label>{copy('破壳后外观', 'Post-hatch appearance')}</label>
                    <p>{`${currentAppearanceLabel} · ${language === 'en-US' ? currentAppearanceAsset.labelEn : currentAppearanceAsset.label}`}</p>
                  </div>
                  <div>
                    <label>{copy('氛围色板', 'Palette')}</label>
                    <p>{paletteOptions.find((item) => item.value === (pet.memory.profile.selectedPalette ?? 'cotton-candy'))?.[language === 'en-US' ? 'labelEn' : 'label'] ?? copy('棉花糖粉', 'Cotton candy pink')}</p>
                  </div>
                  <div>
                    <label>{copy('模型状态', 'Model status')}</label>
                    <p>{aiSetupReady ? copy(`已接入 ${modelHealth?.model ?? modelDraft?.model ?? 'Qwen'}`, `Connected to ${modelHealth?.model ?? modelDraft?.model ?? 'Qwen'}`) : copy('当前仍会先走 fallback', 'Currently still using fallback first')}</p>
                  </div>
                </div>
                <div className="hatch-preview-note">{copy('破壳后使用当前外观。', 'Hatches with the selected look.')}</div>
                <button type="button" className="primary-wide-button" onClick={() => void onHatchPet()}>
                  {copy('现在破壳', 'Hatch now')}
                </button>
              </section>
            ) : null}
          </section>
        ) : (
          <section className="agent-console">
            <section className="companion-hero-card agent-console-hero">
              <div className="companion-hero-summary">
                <div className="companion-next-action">
                  <label>{companionDayLabel}</label>
                  <strong>{nextCompanionAction}</strong>
                  <span>{pet.memory.bond.summary}</span>
                  {primaryAttentionTab ? (
                    <button
                      type="button"
                      className="ghost-button companion-focus-jump"
                      onClick={() => void onCompanionTabChange(primaryAttentionTab)}
                    >
                      {primaryAttentionTab === 'reminders'
                        ? copy('先处理提醒', 'Handle reminders')
                        : primaryAttentionTab === 'care'
                          ? copy('先补照料', 'Give care first')
                          : primaryAttentionTab === 'grow'
                            ? copy('先看奖励', 'Check rewards first')
                            : copy('检查工具', 'Check tools')}
                    </button>
                  ) : null}
                </div>
                <div className="agent-status-grid" aria-label={copy('代理状态', 'Agent status')}>
                  <div>
                    <label>{copy('生命体征', 'Vitals')}</label>
                    <strong>{copy(`饱腹 ${100 - pet.state.hunger}%`, `Hunger ${100 - pet.state.hunger}%`)}</strong>
                    <span>{copy(`心情 ${pet.state.mood}% · 精力 ${pet.state.energy}%`, `Mood ${pet.state.mood}% · Energy ${pet.state.energy}%`)}</span>
                  </div>
                  <div>
                    <label>{copy('工作流', 'Workflow')}</label>
                    <strong>{activeReminder ? copy('等待你确认', 'Needs attention') : copy('待命中', 'Standing by')}</strong>
                    <span>{pendingReminders.length > 0 ? copy(`${pendingReminders.length} 个提醒排队`, `${pendingReminders.length} reminders queued`) : copy('暂无排队提醒', 'No queued reminders')}</span>
                  </div>
                  <div>
                    <label>{copy('工具', 'Tools')}</label>
                    <strong>{enabledToolCount}</strong>
                    <span>{promptRequiredToolCount > 0 ? copy(`${promptRequiredToolCount} 个需要确认`, `${promptRequiredToolCount} need approval`) : copy('无需确认', 'No approvals needed')}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="surface-card agent-command-card">
              <div className="section-header">
                <strong>{copy('给桌宠代理一个任务', 'Ask your pet agent')}</strong>
                <span>{lastReplySource === 'model' ? copy('本地模型已接管回复。', 'Local model handled the last reply.') : copy('会沿用原来的聊天能力。', 'Uses the existing chat flow.')}</span>
              </div>
              <form className="agent-command-form" onSubmit={onSubmit}>
                <input
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  placeholder={copy('例如：提醒我 20 分钟后休息 / 帮我记录今天进展', 'E.g. remind me to rest in 20 minutes / log today’s progress')}
                  aria-label={copy('代理任务输入', 'Agent task input')}
                />
                <button type="submit" className="button-primary" disabled={chatLoading || !draft.trim()}>
                  {chatLoading ? copy('处理中…', 'Working…') : copy('发送', 'Send')}
                </button>
              </form>
            </section>

            <section className="agent-skill-grid" aria-label={copy('代理技能', 'Agent skills')}>
              {companionTabs.map((item) => {
                const skillKey = item.key === 'overview' ? 'care' : item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`agent-skill-card ${activeSurfaceTab === skillKey ? 'active' : ''} ${item.tone ? `tab-tone-${item.tone}` : ''}`}
                    onClick={() => void onCompanionTabChange(item.key)}
                  >
                    <span className="agent-skill-card-kicker">{agentSkillMetrics[skillKey]}</span>
                    <strong>{item.label}</strong>
                    <span>{agentSkillDescriptions[skillKey]}</span>
                    {item.badge ? <em>{item.badge}</em> : null}
                  </button>
                )
              })}
            </section>

            <section className="surface-card agent-activity-card">
              <div className="section-header">
                <strong>{copy('近期活动', 'Recent activity')}</strong>
                <span>{recentActivityItems.length > 0 ? copy('只显示最值得看的几条。', 'Only the most relevant rows.') : copy('还没有活动记录。', 'No activity yet.')}</span>
              </div>
              <div className="compact-list">
                {recentActivityItems.length === 0 ? <p className="reminder-empty">{copy('等它接到提醒、工具或聊天事件后会出现在这里。', 'Reminders, tools, and chat events will appear here.')}</p> : null}
                {recentActivityItems.map((item) => (
                  <div key={item.id} className={`reminder-item compact-item agent-activity-item activity-${item.tone}`}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="agent-detail-drawer">
              <div className="section-header">
                <strong>{detailDrawerTitle}</strong>
                <span>{copy('当前技能详情', 'Current skill detail')}</span>
              </div>

              {activeSurfaceTab === 'reminders' ? (
                <div className="companion-surface-stack">
                  {activeReminder ? (
                    <div className="reminder-alert-card">
                      <strong>{pet.memory.profile.preferredName ? copy(`${pet.memory.profile.preferredName}，该做这件事啦`, `${pet.memory.profile.preferredName}, it is time for this`) : copy('该做这件事啦', 'It is time for this')}</strong>
                      <p>
                        {activeReminder.title}
                        <span className={`reminder-intensity-badge ${normalizeReminderIntensity(activeReminder.intensity)}`}>{formatReminderIntensityShort(activeReminder.intensity)}</span>
                      </p>
                      <span>{formatReminderTime(activeReminder.snoozeUntil ?? activeReminder.scheduledAt, language)}</span>
                      <div className="reminder-alert-actions">
                        <button type="button" onClick={() => void onCompleteReminder(activeReminder.id)}>
                          {copy('完成', 'Done')}
                        </button>
                        <button type="button" className="ghost-button" onClick={() => void onSnoozeReminder(activeReminder.id)}>
                          {language === 'en-US' ? `Remind in ${getReminderSnoozeMinutes(pet)} minutes` : `${getReminderSnoozeMinutes(pet)} 分钟后再说`}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <details className="advanced-collapsible companion-focus-collapsible" open={Boolean(activeReminder)}>
                    <summary>
                      <span>{copy('提醒清单与新增', 'Reminders list and add')}</span>
                      <small>{pendingReminders.length > 0 ? copy(`${pendingReminders.length} 条待办提醒`, `${pendingReminders.length} pending reminders`) : copy('暂无待办提醒', 'No pending reminders')}</small>
                    </summary>
                    <div className="advanced-collapsible-body">
                      <section className="surface-card reminder-panel">
                        <div className="reminder-panel-header">
                          <strong>{copy('提醒', 'Reminders')}</strong>
                          <span>{language === 'en-US' ? `Usual snooze: ${getReminderSnoozeMinutes(pet)} min · ${pet.memory.reminderStrategy.completionCount} recent completions` : `常用顺延 ${getReminderSnoozeMinutes(pet)} 分钟 · 最近完成 ${pet.memory.reminderStrategy.completionCount} 次`}</span>
                        </div>
                        <form className="reminder-form" onSubmit={onReminderSubmit}>
                          <input value={reminderTitle} onChange={(event) => onReminderTitleChange(event.target.value)} placeholder={pet.memory.profile.preferredName ? copy(`比如：提醒${pet.memory.profile.preferredName}开会 / 喝水`, `E.g. remind ${pet.memory.profile.preferredName} about a meeting / drink water`) : copy('比如：开会 / 喝水 / 回消息', 'E.g. meeting / drink water / reply to messages')} />
                          <input type="datetime-local" value={reminderTime} onChange={(event) => onReminderTimeChange(event.target.value)} />
                          <div className="reminder-intensity-row" role="radiogroup" aria-label={copy('提醒强度', 'Reminder intensity')}>
                            {(['low', 'medium', 'high'] as const).map((value) => (
                              <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={reminderIntensity === value}
                                className={`chip-button chip-button-mini ${reminderIntensity === value ? 'active' : ''}`}
                                onClick={() => onReminderIntensityChange(value)}
                              >
                                {reminderIntensityLabels[value]}
                              </button>
                            ))}
                          </div>
                          <button type="submit" className="button-primary">{copy('添加提醒', 'Add reminder')}</button>
                        </form>
                        <div className="reminder-list">
                          {pendingReminders.length === 0 ? (
                            <div className="empty-state">
                              <strong>{copy('还没有待提醒的事', 'No pending reminders')}</strong>
                              <span>{copy('上面写一句就行。', 'Write one above.')}</span>
                            </div>
                          ) : null}
                          {pendingReminders.map((item) => (
                            <div key={item.id} className={`reminder-item ${activeReminder?.id === item.id ? 'active' : ''}`}>
                              <div>
                                <strong>
                                  {item.title}
                                  <span className={`reminder-intensity-badge ${normalizeReminderIntensity(item.intensity)}`}>{formatReminderIntensityShort(item.intensity)}</span>
                                </strong>
                                <span>{formatReminderTime(item.snoozeUntil ?? item.scheduledAt, language)} · {formatReminderIntensity(item.intensity)}</span>
                              </div>
                              <button type="button" className="ghost-button" onClick={() => void onSnoozeReminder(item.id)}>
                                {language === 'en-US' ? `Snooze ${getReminderSnoozeMinutes(pet)} minutes` : `顺延 ${getReminderSnoozeMinutes(pet)} 分钟`}
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </details>
                </div>
              ) : null}

              {activeSurfaceTab === 'care' ? (
                <div className="companion-surface-stack">
                  <section className="status-card surface-card">
                    <StatusPanel
                      hunger={pet.state.hunger}
                      mood={pet.state.mood}
                      cleanliness={pet.state.cleanliness}
                      health={pet.state.health}
                      energy={pet.state.energy}
                      language={language}
                    />
                  </section>
                </div>
              ) : null}

              {activeSurfaceTab === 'grow' ? (
                <div className="companion-surface-stack">
                  <section className="surface-card growth-focus-card">
                    <div className="section-header">
                      <strong>{copy('成长一览', 'Growth at a glance')}</strong>
                      <span>{rewardCount > 0 ? copy('有奖励待领。', 'Rewards waiting.') : copy('奖励、衣柜、成就。', 'Rewards, wardrobe, achievements.')}</span>
                    </div>
                    <div className="growth-quick-grid">
                      <div>
                        <label>{copy('爪币', 'Pawcoin')}</label>
                        <strong>{economyState.pawcoin}</strong>
                      </div>
                      <div className={rewardCount > 0 ? 'needs-attention' : ''}>
                        <label>{copy('待领', 'Pending')}</label>
                        <strong>{rewardCount > 0 ? `+${pendingRewardTotal}` : '0'}</strong>
                      </div>
                      <div>
                        <label>{copy('衣柜', 'Wardrobe')}</label>
                        <strong>{unlockedWardrobeCount}</strong>
                      </div>
                      <div>
                        <label>{copy('成就', 'Achievements')}</label>
                        <strong>{unlockedAchievementCount}</strong>
                      </div>
                    </div>
                    <div className="toolbar-row">
                      <button type="button" className="button-primary" onClick={() => void onClaimRewards()} disabled={rewardCount === 0}>{rewardCount > 0 ? copy(`领取 ${pendingRewardTotal} Pawcoin`, `Claim ${pendingRewardTotal} Pawcoin`) : copy('暂无奖励', 'No rewards')}</button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => void onExportAchievementCard()}
                        disabled={shareCardStatus.state === 'exporting'}
                        title={copy('生成 PNG 并复制到剪贴板', 'Generate a PNG and copy it to clipboard')}
                      >
                        {shareCardStatus.state === 'exporting' ? copy('生成中…', 'Generating…') : copy('生成陪伴卡', 'Generate companion card')}
                      </button>
                    </div>
                    {shareCardStatus.state === 'ready' || shareCardStatus.state === 'error' ? (
                      (() => {
                        const isGrowth = shareCardStatus.kind === 'growth'
                        const cardLabel = isGrowth ? copy('成长卡', 'Growth card') : copy('陪伴卡', 'Companion card')
                        const fallbackName = isGrowth ? 'growth-card.png' : 'share-card.png'
                        const readyTitle = language === 'en-US' ? `${cardLabel} generated` : `${cardLabel}已生成`
                        const errorTitle = language === 'en-US' ? `${cardLabel} export failed` : `${cardLabel}导出失败`
                        const retryLabel = isGrowth ? copy('重新生成陪伴卡', 'Regenerate companion card') : copy('再生成一次', 'Generate again')
                        return (
                          <div className={`share-card-status share-card-status-${shareCardStatus.state}`}>
                            <div className="share-card-status-text">
                              <strong>{shareCardStatus.state === 'ready' ? readyTitle : errorTitle}</strong>
                              <span>
                                {shareCardStatus.state === 'ready'
                                  ? language === 'en-US' ? `${shareCardStatus.clipboardCopied ? 'Copied to clipboard, ' : ''}saved as ${shareCardStatus.fileName ?? fallbackName}` : `${shareCardStatus.clipboardCopied ? '已复制到剪贴板，' : ''}保存为 ${shareCardStatus.fileName ?? fallbackName}`
                                  : shareCardStatus.message}
                              </span>
                            </div>
                            {shareCardStatus.state === 'ready' ? (
                              <div className="share-card-status-actions">
                                <button type="button" className="ghost-button" onClick={() => void onRevealShareCard()}>{copy('在 Finder 打开', 'Open in Finder')}</button>
                                <button type="button" className="ghost-button" onClick={() => void onExportAchievementCard()}>{retryLabel}</button>
                              </div>
                            ) : (
                              <button type="button" className="ghost-button" onClick={() => void onExportAchievementCard()}>{isGrowth ? copy('生成陪伴卡', 'Generate companion card') : copy('重试', 'Retry')}</button>
                            )}
                          </div>
                        )
                      })()
                    ) : null}
                  </section>

                  <details className="advanced-collapsible companion-focus-collapsible">
                    <summary>
                      <span>{copy('成长轨迹与周记', 'Growth path and weekly note')}</span>
                      <small>{copy('关系 / 周总结', 'Relationship / weekly note')}</small>
                    </summary>
                    <div className="advanced-collapsible-body">
                      <section className="companion-memory-card companion-overview-card surface-card">
                        <div className="companion-memory-header">
                          <strong>{copy('成长轨迹', 'Growth path')}</strong>
                          <span>{pet.memory.relationship.summary}</span>
                        </div>
                        <div className="companion-memory-grid">
                          <div>
                            <label>{copy('最近感受', 'Recent feeling')}</label>
                            <p>{pet.memory.bond.recentFeeling}</p>
                          </div>
                          <div>
                            <label>{copy('今天小结', 'Today summary')}</label>
                            <p>{pet.memory.daily[0]?.summary ?? copy('今天还在记录。', 'Still recording today.')}</p>
                          </div>
                          <div>
                            <label>{copy('学到的说话方式', 'Learned speech style')}</label>
                            <p>{pet.memory.companionPreferences.learnedSpeechStyle.join(listJoiner) || copy('还在学你的偏好。', 'Still learning your preferences.')}</p>
                          </div>
                          <div>
                            <label>{copy('最近记住的事', 'Recent memories')}</label>
                            <p>{pet.memory.preferences.slice(0, 3).map((item) => item.summary).join(listJoiner) || copy('暂无。', 'None yet.')}</p>
                          </div>
                          <div>
                            <label>{copy('高频主题', 'Frequent topics')}</label>
                            <p>{pet.memory.companionPreferences.favoriteTopics.join(listJoiner) || copy('暂无常聊话题。', 'No frequent topics yet.')}</p>
                          </div>
                          <div>
                            <label>{copy('陪伴天数', 'Days together')}</label>
                            <p>{companionDayLabel}</p>
                          </div>
                        </div>
                        <div className="trait-grid">
                          <div><label>{copy('活力', 'Energy')}</label><div className="status-bar"><i style={{ width: `${pet.memory.traits.energy}%` }} /></div></div>
                          <div><label>{copy('依恋', 'Attachment')}</label><div className="status-bar"><i style={{ width: `${pet.memory.traits.bond}%` }} /></div></div>
                          <div><label>{copy('话痨', 'Talkative')}</label><div className="status-bar"><i style={{ width: `${pet.memory.traits.talkative}%` }} /></div></div>
                          <div><label>{copy('玩心', 'Playfulness')}</label><div className="status-bar"><i style={{ width: `${pet.memory.traits.playful}%` }} /></div></div>
                          <div><label>{copy('规律', 'Routine')}</label><div className="status-bar"><i style={{ width: `${pet.memory.traits.routine}%` }} /></div></div>
                        </div>
                      </section>

                      <section className="weekly-summary-card companion-overview-card surface-card">
                        <div className="section-header">
                          <strong>{copy('本周陪伴', 'This week')}</strong>
                          <span>
                            {pet.memory.relationship.weeklyConsolidationAt
                              ? copy(`更新于 ${formatReminderTime(pet.memory.relationship.weeklyConsolidationAt, language)}`, `Updated ${formatReminderTime(pet.memory.relationship.weeklyConsolidationAt, language)}`)
                              : copy('数据够了会自动写。', 'Writes automatically when there is enough data.')}
                          </span>
                        </div>
                        <p className="weekly-summary-body">
                          {pet.memory.relationship.weeklySummary
                            || copy('本周还在记录中。', 'This week is still being recorded.')}
                        </p>

                        {(() => {
                          const cutoff = Date.now() - 7 * 86_400_000
                          const recentImportantEvents = pet.memory.events
                            .filter((event) => {
                              const ts = new Date(event.ts).getTime()
                              return Number.isFinite(ts) && ts >= cutoff && event.importance >= 2 && event.summary?.trim()
                            })
                            .slice(0, 5)
                          if (recentImportantEvents.length === 0) return null
                          return (
                            <ul className="weekly-event-list">
                              {recentImportantEvents.map((event) => (
                                <li key={event.id} className={`weekly-event-item importance-${event.importance}`}>
                                  <span className="weekly-event-date">{formatReminderTime(event.ts, language).replace(/^(\d{4})-/, '')}</span>
                                  <span className="weekly-event-text">{event.summary}</span>
                                  {event.category ? <span className="weekly-event-tag">{event.category}</span> : null}
                                </li>
                              ))}
                            </ul>
                          )
                        })()}

                        <div className="weekly-summary-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => void onConsolidateWeeklyMemory()}
                            disabled={weeklySummaryStatus.state === 'refreshing'}
                          >
                            {weeklySummaryStatus.state === 'refreshing' ? copy('正在归纳…', 'Summarizing…') : copy('再总结一次', 'Summarize again')}
                          </button>
                          {weeklySummaryStatus.state === 'skipped' || weeklySummaryStatus.state === 'error' || weeklySummaryStatus.state === 'ready' ? (
                            <span className={`weekly-summary-hint hint-${weeklySummaryStatus.state}`}>
                              {weeklySummaryStatus.message}
                            </span>
                          ) : null}
                        </div>
                      </section>
                    </div>
                  </details>

                  <details className="advanced-collapsible wardrobe-collapsible" open={Boolean(pet.ui.wardrobeSelection)}>
                    <summary>
                      <span>{copy('衣柜与配色', 'Wardrobe and palette')}</span>
                      <small>{pet.ui.wardrobeSelection ? copy(`正在佩戴 ${pet.ui.wardrobeSelection}`, `Wearing ${pet.ui.wardrobeSelection}`) : copy(`${unlockedWardrobeCount} 件已解锁`, `${unlockedWardrobeCount} unlocked`)}</small>
                    </summary>
                    <div className="advanced-collapsible-body">
                      <section className="wardrobe-card companion-overview-card surface-card">
                        <div className="section-header">
                          <strong>{copy('衣柜', 'Wardrobe')}</strong>
                          <span>{pet.ui.wardrobeSelection ? pet.ui.wardrobeSelection : copy('未佩戴', 'Nothing equipped')}</span>
                        </div>
                    <div className="wardrobe-preview-row">
                      <div className={`wardrobe-preview-chip palette-${pet.memory.profile.selectedPalette ?? 'cotton-candy'}`}>
                        <strong>{copy('当前配色', 'Current palette')}</strong>
                        <span>{paletteOptions.find((item) => item.value === (pet.memory.profile.selectedPalette ?? 'cotton-candy'))?.[language === 'en-US' ? 'labelEn' : 'label'] ?? copy('棉花糖粉', 'Cotton candy pink')}</span>
                      </div>
                      <div className={`wardrobe-preview-chip ${pet.ui.wardrobeSelection ? `wardrobe-${pet.ui.wardrobeSelection}` : 'wardrobe-none'}`}>
                        <strong>{copy('当前穿搭', 'Current outfit')}</strong>
                        <span>{pet.ui.wardrobeSelection ?? copy('未佩戴', 'None')}</span>
                      </div>
                    </div>
                    <div className="section-subcopy">{copy('同步调整面板和气泡。', 'Updates panel and bubbles together.')}</div>
                    <div className="chip-row">
                      {paletteOptions.map((item) => (
                        <button key={item.value} type="button" className={`chip-button ${(pet.memory.profile.selectedPalette ?? 'cotton-candy') === item.value ? 'active' : ''}`} onClick={() => void onPaletteChange(item.value)}>
                          {language === 'en-US' ? item.labelEn ?? item.label : item.label}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      // Equipped-now strip: shows which slots the pet is
                      // currently wearing something in. Clicking an entry
                      // focuses that item in the alignment editor; the X
                      // takes only that slot off without affecting others.
                      const equipped = pet.ui.wardrobeEquipped ?? {}
                      const slotLabels: Record<string, string> = {
                        'head-top': copy('头顶', 'Head'),
                        'face': copy('脸', 'Face'),
                        'mouth': copy('嘴', 'Mouth'),
                        'neck': copy('颈', 'Neck'),
                        'chest': copy('胸', 'Chest'),
                        'back': copy('背', 'Back'),
                        'hand': copy('手', 'Hand'),
                        'floating': copy('特效', 'Effect')
                      }
                      const slotEntries = (Object.entries(equipped) as Array<[string, string]>)
                        .filter(([, id]) => Boolean(id))
                      if (slotEntries.length === 0) return null
                      return (
                        <>
                          <div className="section-subcopy">{copy('现在身上：', 'Wearing now:')}</div>
                          <div className="chip-row chip-row-tight">
                            {slotEntries.map(([slot, itemId]) => {
                              const meta = getWardrobeItemById(itemId)
                              const label = language === 'en-US' ? meta?.nameEn ?? readableId(itemId) : meta?.nameZh ?? itemId
                              const slotLabel = slotLabels[slot] ?? slot
                              const isFocused = pet.ui.wardrobeSelection === itemId
                              return (
                                <button
                                  key={slot}
                                  type="button"
                                  className={`chip-button chip-button-equipped ${isFocused ? 'active' : ''}`}
                                  onClick={() => void onWardrobeSelect(itemId)}
                                  aria-label={copy(`${slotLabel}: ${label}（点击在编辑器中调位）`, `${slotLabel}: ${label} (click to adjust in the editor)`)}
                                >
                                  <span className="chip-equipped-slot">{slotLabel}</span>
                                  <span>{label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )
                    })()}
                    {(pet.ui.wardrobeUnlocked ?? []).length === 0 ? (
                      <div className="empty-state" style={{ marginTop: 6 }}>
                        <strong>{copy('还没有任何穿搭', 'No outfits yet')}</strong>
                        <span>{copy('抽到的小物会在这里出现。', 'Drawn items appear here.')}</span>
                      </div>
                    ) : null}
                    {(pet.ui.wardrobeUnlocked ?? []).length > 0 ? (
                      <>
                        <div className="section-subcopy">{copy('已解锁的穿搭：', 'Unlocked outfits:')}</div>
                        {(pet.ui.wardrobeUnlocked ?? []).length > 6 ? (
                          <div className="chip-row chip-row-tight" role="tablist" aria-label={copy('按部位筛选穿搭', 'Filter outfits by slot')}>
                            {([
                              { value: 'all', label: copy('全部', 'All') },
                              { value: 'hat', label: copy('头顶', 'Head') },
                              { value: 'neck', label: copy('颈部', 'Neck') },
                              { value: 'back', label: copy('背部', 'Back') },
                              { value: 'hand', label: copy('手持', 'Hand') },
                              { value: 'mouth', label: copy('嘴部', 'Mouth') },
                              { value: 'special', label: copy('特效', 'Effect') }
                            ] as const).map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                role="tab"
                                aria-selected={wardrobeFilter === option.value}
                                className={`chip-button chip-button-mini ${wardrobeFilter === option.value ? 'active' : ''}`}
                                onClick={() => setWardrobeFilter(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="chip-row">
                          {(() => {
                            // Mark items the user obtained in the last 30
                            // min as "new" — gives the panel a visual
                            // breadcrumb back to whatever the pet just gave
                            // them, especially right after a blind-box draw.
                            const FRESH_WINDOW_MS = 30 * 60 * 1000
                            const now = Date.now()
                            const freshIds = new Set(
                              (pet.ui.wardrobeDrawHistory ?? [])
                                .filter((entry) => now - new Date(entry.drawnAt).getTime() <= FRESH_WINDOW_MS)
                                .map((entry) => entry.itemId)
                            )
                            const visibleIds = (pet.ui.wardrobeUnlocked ?? []).filter((itemId) => {
                              if (wardrobeFilter === 'all') return true
                              const meta = getWardrobeItemById(itemId)
                              // Anything not in the manifest is a stray
                              // legacy id; surface it under 'all' so the
                              // user can see + remove it, but hide it from
                              // category-specific tabs to avoid clutter.
                              return meta ? meta.category === wardrobeFilter : false
                            })
                            return visibleIds.map((itemId) => {
                              const meta = getWardrobeItemById(itemId)
                              const label = language === 'en-US' ? meta?.nameEn ?? readableId(itemId) : meta?.nameZh ?? itemId
                              const isFresh = freshIds.has(itemId)
                              return (
                                <button
                                  key={itemId}
                                  type="button"
                                  className={`chip-button ${pet.ui.wardrobeSelection === itemId ? 'active' : ''}${isFresh ? ' chip-button-fresh' : ''}`}
                                  onClick={() => void onWardrobeSelect(itemId)}
                                  aria-label={isFresh ? copy(`${label}（刚抽到的）`, `${label} (newly drawn)`) : label}
                                >
                                  {label}
                                  {isFresh ? <span className="chip-fresh-dot" aria-hidden="true">●</span> : null}
                                </button>
                              )
                            })
                          })()}
                          {pet.ui.wardrobeSelection ? (
                            <button
                              type="button"
                              className="chip-button chip-button-quiet"
                              onClick={() => void onWardrobeUnequip()}
                              aria-label={copy('脱下当前穿搭', 'Remove current outfit')}
                            >
                              {copy('脱下', 'Remove')}
                            </button>
                          ) : null}
                        </div>
                        <div className="toolbar-row" style={{ marginTop: 4 }}>
                          <span className="model-config-note">
                            {copy('自定义 PNG 文件名用物品 ID。', 'Custom PNG names use item IDs.')}
                          </span>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => void onOpenUserWardrobeDir()}
                          >
                            {copy('打开自定义素材目录', 'Open custom assets directory')}
                          </button>
                        </div>
                      </>
                    ) : null}
                    {(() => {
                      const equippedId = pet.ui.wardrobeSelection
                      if (!equippedId) return null
                      const equipped = getWardrobeItemById(equippedId)
                      if (!equipped) return null
                      const species = pet.memory.profile.chosenSpecies ?? pet.personality.species
                      const placement: WardrobePlacement = pet.ui.wardrobePlacements?.[species]?.[equipped.id] ?? DEFAULT_PLACEMENT
                      return (
                        <div className="wardrobe-aligner-mount">
                          <div className="wardrobe-aligner-mount-header">
                            <strong>{copy(`调整 ${equipped.nameZh} 的位置`, `Adjust ${equipped.nameEn ?? readableId(equipped.id)} placement`)}</strong>
                            <span>{copy('拖动，或调缩放和旋转。', 'Drag, scale, or rotate.')}</span>
                          </div>
                          <WardrobeAlignmentEditor
                            itemId={equipped.id}
                            itemNameZh={equipped.nameZh}
                            itemNameEn={equipped.nameEn}
                            assetUrl={equipped.assetUrl}
                            slot={equipped.slot}
                            language={language}
                            placement={placement}
                            onChange={(next) => onPreviewWardrobePlacement(equipped.id, next)}
                            onCommit={(next) => void onUpdateWardrobePlacement(equipped.id, next)}
                            onReset={() => void onResetWardrobePlacement(equipped.id)}
                            petPreview={
                              currentAppearanceAsset.partDefinitions[0]?.imageSrc
                                ? <img className="wardrobe-aligner-pet-sprite" src={currentAppearanceAsset.partDefinitions[0].imageSrc} alt="" aria-hidden="true" draggable={false} />
                                : <div className="wardrobe-aligner-pet-stub" aria-hidden="true" />
                            }
                          />
                        </div>
                      )
                    })()}
                      </section>
                    </div>
                  </details>

                  <details className="advanced-collapsible growth-collapsible" open={rewardCount > 0 || Boolean(jobState.activeJob)}>
                    <summary>
                      <span>{copy('小物、兼职和成就', 'Items, jobs, and achievements')}</span>
                      <small>{language === 'en-US' ? `${inventoryTypeCount} inventory types · room ${homeState.roomTier}` : `${inventoryTypeCount} 种背包物品 · 房间 ${homeState.roomTier} 级`}</small>
                    </summary>
                    <div className="advanced-collapsible-body">
                      <div className="economy-grid">
                      <section className="economy-subcard">
                        <div className="section-header compact-header">
                          <strong>{copy('盲盒小物', 'Blind-box items')}</strong>
                          <span>{copy('选预算，它来挑。', 'Pick a budget; it chooses.')}</span>
                        </div>
                        <div className="blind-box-grid">
                          {(['low', 'mid', 'high'] as const).map((band) => {
                            const budget = BLIND_BOX_BUDGETS[band]
                            const label = band === 'low' ? copy('小米盲盒', 'Small blind box') : band === 'mid' ? copy('中米盲盒', 'Medium blind box') : copy('大米盲盒', 'Large blind box')
                            const hint = band === 'low'
                              ? copy('日常小物、表情、零碎装饰', 'Daily items, expressions, and small decorations')
                              : band === 'mid'
                                ? copy('帽子围巾手持，正经穿搭单品', 'Hats, scarves, handhelds, and outfit pieces')
                                : copy('稀有翅膀、王冠、特效大件', 'Rare wings, crowns, and large effects')
                            const affordable = economyState.pawcoin >= budget
                            const shortfall = affordable ? 0 : budget - economyState.pawcoin
                            return (
                              <button
                                key={band}
                                type="button"
                                className={`blind-box-button${affordable ? '' : ' blind-box-button-locked'}`}
                                onClick={() => void onDrawWardrobe(band)}
                                disabled={!affordable}
                                aria-label={affordable
                                  ? language === 'en-US' ? `${label}: spend ${budget} Pawcoin to draw one item` : `${label}：花${budget}米抽一件`
                                  : language === 'en-US' ? `${label}: need ${shortfall} more Pawcoin` : `${label}：还差${shortfall}米才能抽`}
                              >
                                <strong>{label}</strong>
                                <em>{affordable ? (language === 'en-US' ? `≤${budget} Pawcoin` : `≤${budget} 米`) : (language === 'en-US' ? `${shortfall} more` : `还差 ${shortfall} 米`)}</em>
                                <span>{hint}</span>
                              </button>
                            )
                          })}
                        </div>
                        {(() => {
                          const recent = (pet.ui.wardrobeDrawHistory ?? []).slice(-3).reverse()
                          if (recent.length === 0) {
                            return <p className="reminder-empty compact-empty">{copy('还没抽过盲盒。', 'No blind-box draws yet.')}</p>
                          }
                          return (
                            <div className="blind-box-recent" aria-label={copy('最近抽到的小物', 'Recently drawn items')}>
                              <span className="blind-box-recent-title">{copy('最近抽到', 'Recently drawn')}</span>
                              <ul className="blind-box-recent-list">
                                {recent.map((entry) => {
                                  const meta = getWardrobeItemById(entry.itemId)
                                  return (
                                    <li key={entry.drawnAt} className="blind-box-recent-item">
                                      <strong>{language === 'en-US' ? meta?.nameEn ?? readableId(entry.itemId) : meta?.nameZh ?? entry.itemId}</strong>
                                      <span className="blind-box-recent-reason">{entry.reason}</span>
                                      <em className="blind-box-recent-meta">
                                        {language === 'en-US' ? `${entry.pricePaid} Pawcoin · ${entry.source === 'model' ? 'Picked by it' : 'Random draw'}` : `${entry.pricePaid} 米 · ${entry.source === 'model' ? '它自己挑的' : '随机抽的'}`}
                                      </em>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          )
                        })()}
                      </section>

                      {/*
                        The legacy "日常补给" (Daily supplies) shop card —
                        which used to sell snack-pack / cozy-blanket /
                        star-lamp — was removed at the user's request:
                        the blind-box wardrobe is the only purchasing
                        surface now. SHOP_ITEMS lives on as read-only
                        metadata so inventory entries from old saves
                        still render with proper names + the right
                        "feed" / "place in home" affordances.
                      */}

                      <section className="economy-subcard">
                        <div className="section-header compact-header">
                          <strong>{copy('背包与家园', 'Inventory and home')}</strong>
                          <span>{language === 'en-US' ? `Inventory has ${inventoryState.items.length} item types, room tier ${homeState.roomTier}.` : `背包里有 ${inventoryState.items.length} 种物品，房间等级 ${homeState.roomTier}。`}</span>
                        </div>
                        <div className="compact-list">
                          {inventoryState.items.length === 0 ? <p className="reminder-empty">{copy('还没有囤任何物品，先从小零食和家具开始吧。', 'No items stored yet. Start with snacks and furniture.')}</p> : null}
                          {inventoryState.items.map((item) => {
                            const meta = inventoryItemMetaById.get(item.itemId)
                            const itemLabel = language === 'en-US' ? meta?.titleEn ?? readableId(item.itemId) : meta?.title ?? item.itemId
                            const actionLabel = meta?.kind === 'furniture'
                              ? copy('摆进小窝', 'Place in home')
                              : copy('喂给它', 'Feed it')

                            return (
                              <div key={item.itemId} className="reminder-item compact-item">
                                <div>
                                  <strong>{itemLabel}</strong>
                                  <span>{language === 'en-US' ? `Qty ${item.quantity}${item.source ? ` · ${item.source}` : ''}${meta?.kind ? ` · ${meta.kind}` : ''}` : `数量 ${item.quantity}${item.source ? ` · ${item.source}` : ''}${meta?.kind ? ` · ${meta.kind}` : ''}`}</span>
                                </div>
                                <button type="button" className="ghost-button" onClick={() => void onUseInventoryItem(item.itemId)}>{actionLabel}</button>
                              </div>
                            )
                          })}
                        </div>
                        <p className="model-config-note">{copy('家具加舒适度；零食触发照料。', 'Furniture adds comfort; snacks trigger care.')}</p>
                      </section>

                      <section className="economy-subcard">
                        <div className="section-header compact-header">
                          <strong>{copy('兼职', 'Part-time jobs')}</strong>
                          <span>{jobState.activeJob ? copy('任务结束自动入账。', 'Coins land when it finishes.') : copy('小任务换爪币。', 'Small tasks earn pawcoin.')}</span>
                        </div>
                        <div className="compact-list">
                          {JOB_OPTIONS.map((job) => {
                            const locked = pet.memory.bond.closeness < job.unlockBond
                            const active = jobState.activeJob?.id === job.id
                            const claimable = active && Boolean(jobState.activeJob?.endsAt) && new Date(jobState.activeJob?.endsAt ?? '').getTime() <= Date.now()
                            const hasAnotherActive = !active && Boolean(jobState.activeJob)
                            const actionLabel = locked
                              ? copy('未解锁', 'Locked')
                              : active
                                ? (claimable ? copy('可领取', 'Claimable') : copy('进行中', 'In progress'))
                                : hasAnotherActive
                                  ? copy('换成这个', 'Switch to this')
                                  : copy('出发', 'Start')

                            // Row click handler: when claimable, claim directly from the row
                            // so the "可领取" label is actually actionable. Otherwise fall back
                            // to starting a new job.
                            const handleRowClick = () => {
                              if (claimable) {
                                void onClaimJob()
                                return
                              }
                              if (hasAnotherActive && onSwitchJob) {
                                void onSwitchJob(job.id)
                                return
                              }
                              void onStartJob(job.id)
                            }
                            const rowDisabled = locked || (active && !claimable) || (hasAnotherActive && !onSwitchJob)
                            return (
                              <div key={job.id} className="reminder-item compact-item">
                                <div>
                                  <strong>{language === 'en-US' ? job.titleEn : job.title}</strong>
                                  <span>{language === 'en-US' ? `${job.reward} Pawcoin · ${job.durationMinutes} minutes${job.unlockBond > 0 ? ` · bond ${job.unlockBond}+` : ''}` : `${job.reward} Pawcoin · ${job.durationMinutes} 分钟${job.unlockBond > 0 ? ` · 亲密度 ${job.unlockBond}+` : ''}`}</span>
                                </div>
                                <button type="button" className={`ghost-button ${claimable ? 'job-claim-ready' : ''}`} onClick={handleRowClick} disabled={rowDisabled}>
                                  {actionLabel}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                        <div className="toolbar-row">
                          <span className="model-config-note">{jobState.activeJob ? (language === 'en-US'
                            ? `Current job: ${activeJobMeta?.titleEn ?? jobState.activeJob.id}${new Date(jobState.activeJob.endsAt).getTime() <= Date.now() ? ' · reward ready' : ` · ${activeJobRemainingMinutes} min left`}`
                            : `当前兼职：${activeJobMeta?.title ?? jobState.activeJob.id}${new Date(jobState.activeJob.endsAt).getTime() <= Date.now() ? ' · 已可领奖' : ` · 剩余 ${activeJobRemainingMinutes} 分钟`}`
                          ) : (language === 'en-US' ? `Completed ${jobState.completedJobs} times` : `累计完成 ${jobState.completedJobs} 次`)}</span>
                          {jobState.activeJob && onCancelJob ? (
                            <button type="button" className="ghost-button" onClick={() => void onCancelJob()}>
                              {copy('取消当前兼职', 'Cancel current job')}
                            </button>
                          ) : null}
                        </div>
                      </section>

                      <section className="economy-subcard">
                        <div className="section-header compact-header">
                          <strong>{copy('成就', 'Achievements')}</strong>
                          <span>{language === 'en-US' ? `${achievementState.unlocked.length} unlocked` : `已解锁 ${achievementState.unlocked.length} 个`}</span>
                        </div>
                        <div className="compact-list">
                          {achievementState.unlocked.length === 0 ? (
                            <p className="reminder-empty">{copy('继续陪它，第一个成就很快就到。', 'Keep companioning. The first achievement is just around the corner.')}</p>
                          ) : null}
                          {achievementState.unlocked
                            .slice()
                            .sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime())
                            .map((entry) => (
                              <div key={entry.id} className="reminder-item compact-item">
                                <div>
                                  <strong>{getAchievementTitle(entry.id, language)}</strong>
                                  <span>{formatReminderTime(entry.unlockedAt, language)}</span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </section>
                    </div>
                    </div>
                  </details>
                </div>
              ) : null}

              {activeSurfaceTab === 'diary' ? (
                <div className="companion-surface-stack">
                  <DiaryTab
                    entries={diaryEntries}
                    config={diaryConfig}
                    selectedDate={diarySelectedDate}
                    status={diaryStatus}
                    language={language}
                    jobsByDay={(() => {
                      // Group today + recent days' job.complete audit
                      // entries into { count, earned } buckets keyed by
                      // YYYY-MM-DD. Done at render time because the audit
                      // log is small (max 200 entries) and changes
                      // infrequently — no useMemo needed.
                      const buckets: Record<string, { count: number; earned: number }> = {}
                      for (const entry of auditState.entries) {
                        if (entry.domain !== 'jobs' || entry.action !== 'job.complete') continue
                        const ts = new Date(entry.at).getTime()
                        if (!Number.isFinite(ts)) continue
                        const date = new Date(ts)
                        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                        const reward = typeof entry.metadata?.reward === 'number' ? entry.metadata.reward : 0
                        const bucket = buckets[key] ?? { count: 0, earned: 0 }
                        bucket.count += 1
                        bucket.earned += reward
                        buckets[key] = bucket
                      }
                      return buckets
                    })()}
                    onSelect={onDiarySelectDate}
                    onRefresh={onRefreshDiaryToday}
                    onSeal={onSealDiaryDate}
                    onAppendNote={onAppendDiaryNote}
                    onAddGitRepo={onAddGitRepoPath}
                    onRemoveGitRepo={onRemoveGitRepoPath}
                    onToggleActivity={onToggleActivityTracking}
                  />
                </div>
              ) : null}

              {activeSurfaceTab === 'settings' ? (
                <div className="companion-surface-stack">
                  <section className="surface-card status-card">
                    <div className="section-header">
                      <strong>{copy('Agent tools', 'Agent tools')}</strong>
                      <span>{promptRequiredToolCount > 0 ? copy('有工具需要你确认。', 'Some tools need your approval.') : copy('工具状态稳定。', 'Tool state is steady.')}</span>
                    </div>
                    <div className="agent-tool-summary-grid">
                      <div>
                        <label>{copy('已启用', 'Enabled')}</label>
                        <strong>{enabledToolCount}</strong>
                        <span>{toolState.enabledTools.slice(0, 3).map(readableId).join(listJoiner) || copy('暂无工具记录', 'No tools recorded')}</span>
                      </div>
                      <div className={promptRequiredToolCount > 0 ? 'needs-attention' : ''}>
                        <label>{copy('需确认', 'Approvals')}</label>
                        <strong>{promptRequiredToolCount}</strong>
                        <span>{toolState.promptsRequiredFor.slice(0, 3).map(readableId).join(listJoiner) || copy('无需处理', 'Nothing to handle')}</span>
                      </div>
                    </div>
                  </section>
                  <section className="surface-card status-card">
                    <div className="section-header">
                      <strong>{language === 'en-US' ? 'Language' : '语言'}</strong>
                      <span>{copy('影响新界面和新回复。', 'Affects new UI and replies.')}</span>
                    </div>
                    <div className="chip-row">
                      <button type="button" className={`chip-button ${language === 'zh-CN' ? 'active' : ''}`} onClick={() => void onLanguageChange('zh-CN')}>中文</button>
                      <button type="button" className={`chip-button ${language === 'en-US' ? 'active' : ''}`} onClick={() => void onLanguageChange('en-US')}>English</button>
                    </div>
                  </section>

                  <section className="surface-card status-card">
                    <div className="section-header">
                      <strong>{copy('外观与骨骼', 'Appearance and rig')}</strong>
                      <span>{copy('选择外观，确认后立即替换。', 'Choose a look; confirm to swap.')}</span>
                    </div>
                    <div className="section-header section-header-compact">
                      <strong>{copy('导入本地宠物', 'Import local pet')}</strong>
                      <span>{copy('本地 Petdex 包会出现在下方列表。', 'Local Petdex packages appear below.')}</span>
                    </div>
                    {petdexImportControls}
                    <SpeciesGalleryPanel
                      options={speciesOptions}
                      selected={pet.memory.profile.chosenSpecies ?? pet.personality.species}
                      previewStage={pet.state.stage}
                      language={language}
                      onSelect={(value) => void onSpeciesChange(value)}
                      ariaLabel={copy('选择宠物外观', 'Choose pet appearance')}
                    />
                    <div className="companion-memory-grid">
                      <div>
                        <label>{copy('当前外观', 'Current appearance')}</label>
                        <p>{currentAppearanceLabel}</p>
                      </div>
                      <div>
                        <label>{copy('渲染路径', 'Render path')}</label>
                        <p>{currentAppearanceAsset.meshRig && rendererMode === 'mesh' ? copy('分件 Mesh 局部运动', 'Split Mesh local motion') : copy('Cutout / 单图渲染', 'Cutout / single image render')}</p>
                      </div>
                    </div>
                    <div className="toolbar-row">
                      <button
                        type="button"
                        className={`ghost-button ${showAlignmentEditor ? 'debug-active' : ''}`}
                        onClick={onToggleAlignmentEditor}
                      >
                        {showAlignmentEditor ? copy('关闭摆位', 'Close placement mode') : copy('摆位模式', 'Placement mode')}
                      </button>
                      <span className="model-config-note">{copy('调整身体部件位置，不再藏在开发工具里。', 'Adjust body-part placement; no longer hidden in developer tools.')}</span>
                    </div>
                    {showAlignmentEditor ? (
                      <CutoutAlignmentEditor
                        placements={cutoutPlacements}
                        partDefinitions={currentAppearanceAsset.partDefinitions}
                        referenceSrc={currentAppearanceAsset.referenceSrc}
                        assetLabel={currentAppearanceLabel}
                        language={language}
                        onChangePlacements={onCutoutPlacementsChange}
                        onResetPlacements={onResetCutoutPlacements}
                      />
                    ) : null}
                  </section>

                  <section className="surface-card status-card">
                    <div className="section-header">
                      <strong>{copy('陪伴模式', 'Companion mode')}</strong>
                      <span>{copy('只留常用开关。', 'Only common switches.')}</span>
                    </div>
                    <div className="chip-row">
                      <button
                        type="button"
                        className={`chip-button ${pet.ui.system.vacationMode ? 'active' : ''}`}
                        onClick={() => void onToggleSystemMode('vacationMode')}
                      >
                        {copy('免打扰', 'Do not disturb')}
                      </button>
                      <button
                        type="button"
                        className={`chip-button ${pet.ui.system.strongReminderEnabled ? 'active' : ''}`}
                        onClick={() => void onToggleSystemMode('strongReminderEnabled')}
                        title={copy('只影响 coding 事件；普通提醒看单条强度。', 'Only affects coding events; normal reminders use per-item intensity.')}
                      >
                        {copy('代码强提醒', 'Code strong reminder')}
                      </button>
                    </div>
                    <div className="companion-memory-grid">
                      <div>
                        <label>{copy('当前状态', 'Current state')}</label>
                        <p>
                          {pet.ui.system.vacationMode
                            ? copy('安静待机', 'Quiet standby')
                            : pet.ui.system.bossModeEnabled
                              ? copy('低可见低动作', 'Low visibility, low motion')
                              : pet.ui.system.nestModeEnabled
                                ? copy('固定角落陪伴', 'Stays in a fixed corner')
                                : pet.ui.system.strongReminderEnabled
                                  ? copy('代码事件强提醒', 'Strong coding-event reminders')
                                  : copy('自由走动陪伴', 'Free-roaming companionship')}
                        </p>
                      </div>
                      <div>
                        <label>{copy('提醒策略', 'Reminder strategy')}</label>
                        <p>
                          {pet.ui.system.vacationMode || pet.ui.system.bossModeEnabled
                            ? copy('只提醒到点事项', 'Only due reminders')
                            : pet.ui.system.nestModeEnabled
                              ? copy('可见但安静', 'Visible but quiet')
                              : pet.ui.system.strongReminderEnabled
                                ? copy('代码事件全部瞬移 + 系统通知', 'Every coding event teleports + sends an OS notification')
                                : copy('按当前关系和状态自然反应', 'React naturally based on relationship and state')}
                        </p>
                      </div>
                    </div>
                    <details className="advanced-collapsible" open={pet.ui.system.bossModeEnabled || pet.ui.system.nestModeEnabled || developerModeEnabled}>
                      <summary>
                        <span>{copy('更多低频模式', 'More low-frequency modes')}</span>
                        <small>{copy('老板 / 窝 / 开发调试', 'Boss / nest / developer tools')}</small>
                      </summary>
                      <div className="advanced-collapsible-body">
                        <div className="chip-row">
                          <button
                            type="button"
                            className={`chip-button ${pet.ui.system.bossModeEnabled ? 'active' : ''}`}
                            onClick={() => void onToggleSystemMode('bossModeEnabled')}
                          >
                            {copy('低动作', 'Low motion')}
                          </button>
                          <button
                            type="button"
                            className={`chip-button ${pet.ui.system.nestModeEnabled ? 'active' : ''}`}
                            onClick={() => void onToggleSystemMode('nestModeEnabled')}
                          >
                            {copy('固定角落', 'Fixed corner')}
                          </button>
                          <button
                            type="button"
                            className={`chip-button ${developerModeEnabled ? 'active' : ''}`}
                            onClick={() => void onToggleSystemMode('developerModeEnabled')}
                            title={copy('控制渲染/摆位等开发调试工具是否显示。', 'Controls visibility of render/placement developer tools.')}
                          >
                            {copy('开发调试', 'Developer tools')}
                          </button>
                        </div>
                      </div>
                    </details>
                  </section>

                  <details className="advanced-collapsible settings-memory-collapsible" open={pet.ui.showMemoryEditor}>
                    <summary>{copy('记忆、事实与审计', 'Memory, facts, and audit')}</summary>
                    <div className="advanced-collapsible-body">
                      <div className="toolbar-row">
                        <button type="button" className="ghost-button" onClick={() => void onToggleMemoryEditor()}>
                          {pet.ui.showMemoryEditor ? t(language, 'panel.memory.hide') : t(language, 'panel.memory.manage')}
                        </button>
                        <span className="model-config-note">{copy('低频维护默认收起。', 'Low-frequency maintenance stays folded.')}</span>
                      </div>

                  {pet.ui.showMemoryEditor ? (
                    <section className="memory-editor-card companion-memory-card surface-card">
                      <div className="section-header">
                        <strong>{copy('记忆编辑', 'Memory editor')}</strong>
                        <span>{copy('查看、删除或导出记忆。', 'Review, delete, or export memories.')}</span>
                      </div>
                      <div className="memory-editor-actions">
                        <button type="button" className="ghost-button" onClick={() => void onExportAll()}>{copy('导出全部到磁盘', 'Export all to disk')}</button>
                        {clearMemoriesOpen ? null : (
                          <button type="button" className="ghost-button" onClick={handleClearMemoriesClick}>{copy('清空记忆（偏好+事件）…', 'Clear memory (prefs + events)…')}</button>
                        )}
                      </div>
                      {clearMemoriesOpen ? (
                        <div className="confirm-panel">
                          <p><strong>{copy('确认清空已记住的偏好和事件历史？', 'Clear remembered preferences and event history?')}</strong>{copy('此操作无法撤销。', 'This cannot be undone.')}</p>
                          <label className="confirm-panel-option">
                            <input
                              type="checkbox"
                              checked={clearAlsoWeekly}
                              onChange={(event) => setClearAlsoWeekly(event.target.checked)}
                            />
                            <span>{copy('同时清掉本周总结（自动陪伴文案）', 'Also clear this week summary (automatic companion copy)')}</span>
                          </label>
                          <div className="confirm-panel-actions">
                            <button type="button" className="ghost-button" onClick={() => setClearMemoriesOpen(false)}>{copy('取消', 'Cancel')}</button>
                            <button type="button" className="ghost-button danger-button" onClick={() => void handleConfirmClearMemories()}>{copy('确认清空', 'Confirm clear')}</button>
                          </div>
                        </div>
                      ) : null}
                      <p className="reminder-empty">{pet.memory.companionPreferences.learnedSpeechStyle.join(listJoiner) || copy('它还在学你的说话节奏。', 'It is still learning your speaking rhythm.')}</p>
                      <div className="memory-chip-list">
                        {pet.memory.preferences.length === 0 ? <p className="reminder-empty">{copy('它还没有记住新的偏好。', 'It has not remembered any new preferences yet.')}</p> : null}
                        {pet.memory.preferences.map((item) => (
                          <div key={item.id} className="memory-chip-row">
                            <div>
                              <strong>{item.summary}</strong>
                              <span>{item.value}</span>
                              <span>{`${item.category} · ${Math.round(item.confidence * 100)}%`}</span>
                            </div>
                            <button type="button" className="ghost-button" onClick={() => void onRemovePreference(item.id)}>{copy('删除', 'Delete')}</button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {pet.ui.showMemoryEditor ? (
                    <section className="memory-editor-card fact-ledger-card surface-card">
                      <div className="section-header">
                        <strong>{copy('它记得的事实', 'Facts it remembers')}</strong>
                        <span>{copy('自动跟踪聊天里的量化信息。', 'Tracks quantified chat facts.')}</span>
                      </div>
                      {(() => {
                        const records = pet.memory.facts?.records ?? []
                        const trackable = pet.memory.facts?.trackable ?? {}
                        if (records.length === 0) {
                          return <p className="reminder-empty">{copy('还没记下事实。', 'No facts recorded yet.')}</p>
                        }
                        // Group by key, showing latest first plus the small
                        // history beneath. Disabled keys still appear so the
                        // user can re-enable them without scripting.
                        const keyOrder: string[] = []
                        const grouped = new Map<string, typeof records>()
                        for (const record of records) {
                          if (!grouped.has(record.key)) {
                            grouped.set(record.key, [])
                            keyOrder.push(record.key)
                          }
                          grouped.get(record.key)!.push(record)
                        }
                        return keyOrder.map((key) => {
                          const items = grouped.get(key) ?? []
                          const latest = items[0]
                          const previous = items.slice(1, 6)
                          const enabled = trackable[key] !== false
                          const latestLabel = (() => {
                            if (typeof latest.value === 'number') {
                              const trimmed = Number.isInteger(latest.value) ? latest.value.toString() : latest.value.toFixed(2).replace(/\.?0+$/, '')
                              return latest.unit ? `${trimmed} ${latest.unit}` : trimmed
                            }
                            return String(latest.value)
                          })()
                          return (
                            <div key={key} className="fact-ledger-group">
                              <div className="fact-ledger-header">
                                <div className="fact-ledger-key">
                                  <strong>{key}</strong>
                                  <span>{latestLabel} · {new Date(latest.ts).toLocaleString()}</span>
                                </div>
                                <div className="fact-ledger-actions">
                                  <button
                                    type="button"
                                    className={`chip-button ${enabled ? 'active' : ''}`}
                                    onClick={() => void onToggleFactKeyTracking(key, !enabled)}
                                    title={enabled ? copy('关闭后将不再记录这个 key 的新值', 'When disabled, new values for this key will no longer be recorded') : copy('开启后会重新跟踪这个 key', 'When enabled, this key will be tracked again')}
                                  >
                                    {enabled ? copy('跟踪中', 'Tracking') : copy('已停跟', 'Paused')}
                                  </button>
                                  <button type="button" className="ghost-button" onClick={() => void onRemoveFactKey(key)}>{copy('清空此项', 'Clear this')}</button>
                                </div>
                              </div>
                              {previous.length > 0 ? (
                                <ol className="fact-ledger-history">
                                  {previous.map((item) => {
                                    const valueLabel = typeof item.value === 'number'
                                      ? (Number.isInteger(item.value) ? item.value.toString() : item.value.toFixed(2).replace(/\.?0+$/, ''))
                                      : String(item.value)
                                    return (
                                      <li key={item.id}>
                                        <span>{item.unit ? `${valueLabel} ${item.unit}` : valueLabel}</span>
                                        <span>{new Date(item.ts).toLocaleString()}</span>
                                        <button type="button" className="link-button" onClick={() => void onRemoveFactRecord(item.id)}>{copy('删除', 'Delete')}</button>
                                      </li>
                                    )
                                  })}
                                </ol>
                              ) : null}
                            </div>
                          )
                        })
                      })()}
                    </section>
                  ) : null}

                  <section className="surface-card status-card">
                    <div className="section-header">
                      <strong>{copy('审计记录', 'Audit log')}</strong>
                      <span>{copy('领奖、抽签、记忆改写等记录。', 'Rewards, oracle draws, memory edits, and more.')}</span>
                    </div>
                    <div className="companion-memory-grid">
                      <div>
                        <label>{copy('审计条数', 'Audit entries')}</label>
                        <p>{language === 'en-US' ? `${auditState.entries.length}` : `${auditState.entries.length} 条`}</p>
                      </div>
                      <div>
                        <label>{copy('最近动作', 'Latest action')}</label>
                        <p>{auditState.entries[0]?.summary ?? copy('还没有高权限动作记录。', 'No high-privilege actions recorded yet.')}</p>
                      </div>
                    </div>
                    <div className="compact-list audit-log-scroll">
                      {visibleAuditEntries.map((entry) => (
                        <div key={entry.id} className="reminder-item compact-item">
                          <div>
                            <strong>{entry.summary}</strong>
                            <span>{`${entry.domain} · ${formatReminderTime(entry.at, language)}`}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="toolbar-row">
                      {hasMoreAuditEntries ? (
                        <button type="button" className="ghost-button" onClick={() => setAuditVisibleCount((count) => Math.min(count + 20, auditState.entries.length))}>
                          {copy('查看更多', 'Load more')}
                        </button>
                      ) : null}
                      {auditVisibleCount > 20 && auditState.entries.length > 20 ? (
                        <button type="button" className="ghost-button" onClick={() => setAuditVisibleCount(20)}>
                          {copy('收起', 'Collapse')}
                        </button>
                      ) : null}
                    </div>
                  </section>
                    </div>
                  </details>


                  <details className="advanced-collapsible settings-advanced-collapsible" open={settingsNeedsAttention}>
                    <summary>
                      <span>{copy('模型与实验', 'Model and experiments')}</span>
                      <small>{modelHealth?.ok ? copy('Qwen 在线', 'Qwen online') : copy('fallback 可用', 'fallback available')}</small>
                    </summary>
                    <div className="advanced-collapsible-body advanced-settings-stack">
                    <section className="advanced-settings-card surface-card">
                      <div className="section-header advanced-settings-header">
                        <div>
                          <strong>{copy('模型设置', 'Model settings')}</strong>
                          <span>{modelDraft?.enabled ? copy('连接与超时。', 'Connection and timeout.') : copy('本地模型已关闭。', 'Local model is off.')}</span>
                        </div>
                        <div className={`model-status-pill ${modelHealth?.ok ? 'online' : 'offline'}`}>
                          {modelHealth?.ok ? copy(`Qwen 可生成 · ${modelHealth.model}`, `Qwen can generate · ${modelHealth.model}`) : copy('Qwen 未通过生成检测 · fallback', 'Qwen failed generation check · fallback')}
                        </div>
                      </div>
                      <section className="model-config-card">
                        <div className="companion-memory-header">
                          <strong>{copy('本地模型', 'Local model')}</strong>
                          <span>{modelDraft?.enabled ? copy('Qwen 负责理解表达。', 'Qwen handles expression understanding.') : copy('使用静态 fallback。', 'Uses static fallback.')}</span>
                        </div>
                        <div className="model-config-grid">
                          <label className="alignment-toggle-field">
                            <span>{copy('启用本地模型', 'Enable local model')}</span>
                            <input
                              type="checkbox"
                              checked={modelDraft?.enabled ?? false}
                              onChange={(event) => {
                                onModelDraftEnabledChange(event.target.checked)
                              }}
                            />
                          </label>
                          <label>
                            <span>{copy('服务地址', 'Service URL')}</span>
                            <input
                              value={modelDraft?.endpoint ?? ''}
                              onChange={(event) => {
                                onModelDraftEndpointChange(event.target.value)
                              }}
                              placeholder="http://127.0.0.1:11434"
                            />
                          </label>
                          <label>
                            <span>{copy('模型名', 'Model name')}</span>
                            <input
                              value={modelDraft?.model ?? ''}
                              onChange={(event) => {
                                onModelDraftNameChange(event.target.value)
                              }}
                              placeholder="qwen3:4b-instruct"
                            />
                          </label>
                          <label>
                            <span>{copy('超时（毫秒）', 'Timeout (ms)')}</span>
                            <input
                              type="number"
                              min="2000"
                              max="60000"
                              step="1000"
                              value={modelDraft?.timeoutMs ?? 12000}
                              onChange={(event) => {
                                onModelDraftTimeoutChange(Number(event.target.value))
                              }}
                            />
                          </label>
                        </div>
                        <div className="model-config-actions">
                          <button type="button" className="ghost-button" onClick={() => void onSaveModelConfig()} disabled={!modelDraft || modelSaving || !hasModelDraftChanges}>
                            {modelSaving ? copy('保存中…', 'Saving…') : copy('保存模型设置', 'Save model settings')}
                          </button>
                          <button type="button" className="ghost-button" onClick={onResetModelDraft} disabled={!hasModelDraftChanges || modelSaving}>
                            {copy('还原', 'Reset')}
                          </button>
                        </div>
                        <p className="model-config-note">
                          {modelConfigMessage || (modelDraft?.enabled ? copy('推荐 Ollama + qwen3:4b-instruct。', 'Recommended: Ollama + qwen3:4b-instruct.') : copy('不会请求本地模型。', 'Local model will not be requested.'))}
                        </p>
                      </section>
                    </section>

                    <section className="advanced-settings-card surface-card">
                      <div className="section-header advanced-settings-header">
                        <div>
                          <strong>{copy('实验功能', 'Experimental features')}</strong>
                          <span>{copy('低频和调试功能。', 'Low-frequency and debug features.')}</span>
                        </div>
                      </div>

                      {developerModeEnabled ? (
                        <details className="advanced-collapsible">
                          <summary>{copy('开发者工具（渲染/摆位调试）', 'Developer tools (render/placement debug)')}</summary>
                          <div className="advanced-collapsible-body">
                            <div className="advanced-tool-actions">
                              <button
                                type="button"
                                className={`ghost-button ${rendererMode === 'mesh' ? 'debug-active' : ''}`}
                                onClick={onToggleRendererMode}
                                disabled={showAlignmentEditor}
                              >
                                {rendererMode === 'mesh' ? copy('当前 Mesh 渲染', 'Mesh render active') : copy('切到 Mesh 渲染', 'Switch to Mesh render')}
                              </button>
                              <button
                                type="button"
                                className={`ghost-button ${showAlignmentEditor ? 'debug-active' : ''}`}
                                onClick={onToggleAlignmentEditor}
                              >
                                {showAlignmentEditor ? copy('关闭摆位', 'Close placement mode') : copy('摆位模式', 'Placement mode')}
                              </button>
                              <button type="button" className={`ghost-button ${showMeshDebug ? 'debug-active' : ''}`} onClick={onToggleMeshDebug}>
                                {showMeshDebug ? copy('关闭 Mesh 轮廓', 'Hide Mesh outline') : copy('显示 Mesh 轮廓', 'Show Mesh outline')}
                              </button>
                            </div>

                            <section className="animation-preview-panel">
                              <div className="section-header advanced-settings-header">
                                <div>
                                  <strong>{copy('动画状态预览', 'Animation state preview')}</strong>
                                  <span>{copy('预览 manifest 里的状态链和事件映射。', 'Preview manifest chains and event mappings.')}</span>
                                </div>
                                <span className="model-config-note">{animationPreviewAction ?? action}</span>
                              </div>
                              <div className="animation-preview-stage">
                                <PetCanvas
                                  action={animationPreviewAction ?? action}
                                  isSleeping={pet.state.isSleeping}
                                  showDebug={showMeshDebug}
                                  rendererMode={showAlignmentEditor ? 'cutout' : rendererMode}
                                  species={currentSpecies}
                                  stage={pet.state.stage}
                                  appearanceVariantKey={pet.ui.speciesVariantBySpecies?.[currentSpecies]}
                                  appearanceResetKey={pet.ui.speciesChangedAt}
                                  placements={showAlignmentEditor ? cutoutPlacements : appliedCutoutPlacements}
                                  visualState={visualState}
                                  wardrobeOverlays={wardrobeOverlays}
                                  language={language}
                                  leanDirection={dockLeanDirection}
                                  leanAmount={dockLeanAmount}
                                  onPet={() => {}}
                                  onTogglePanel={() => {}}
                                  onPetDragStart={() => {}}
                                  onDockHoverChange={() => {}}
                                />
                              </div>
                              <div className="animation-preview-grid">
                                {animationPreviewActions.map((previewAction) => (
                                  <button
                                    key={previewAction}
                                    type="button"
                                    className={`chip-button ${animationPreviewAction === previewAction ? 'active' : ''}`}
                                    onClick={() => setAnimationPreviewAction(previewAction)}
                                  >
                                    {readableId(previewAction)}
                                  </button>
                                ))}
                              </div>
                              <div className="animation-event-grid">
                                {Object.entries(petAnimationManifest.events ?? {}).map(([eventName, target]) => (
                                  <button
                                    key={eventName}
                                    type="button"
                                    className="ghost-button"
                                    onClick={() => {
                                      if (target in petAnimationManifest.chains) setAnimationPreviewAction(target as PetAction)
                                    }}
                                    disabled={!(target in petAnimationManifest.chains)}
                                  >
                                    {`${readableId(eventName)} → ${readableId(target)}`}
                                  </button>
                                ))}
                              </div>
                            </section>
                          </div>
                        </details>
                      ) : null}

                      <details className="advanced-collapsible">
                        <summary>{copy('屏幕感知（MVP）', 'Screen awareness (MVP)')}</summary>
                        <div className="advanced-collapsible-body">
                          <p className="model-config-note">
                            {copy(
                              '读取当前屏幕上的文本内容，仅本地处理（macOS 版先行）。可用于后续做“我看到你在干嘛”的上下文陪伴。',
                              'Reads text from your current screen, processed locally only (macOS first). This seeds future context-aware companionship.'
                            )}
                          </p>
                          <div className="toolbar-row">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => void onCaptureScreenAwareness?.()}
                              disabled={!onCaptureScreenAwareness || screenAwarenessStatus.state === 'capturing'}
                            >
                              {screenAwarenessStatus.state === 'capturing'
                                ? copy('读取中…', 'Capturing…')
                                : copy('读取当前屏幕文字', 'Capture screen text')}
                            </button>
                            {screenAwarenessStatus.lineCount && screenAwarenessStatus.lineCount > 0 ? (
                              <span className="model-config-note">
                                {copy(`识别 ${screenAwarenessStatus.lineCount} 行`, `${screenAwarenessStatus.lineCount} lines recognized`)}
                              </span>
                            ) : null}
                          </div>
                          {screenAwarenessStatus.message ? (
                            <p className="model-config-note">{screenAwarenessStatus.message}</p>
                          ) : null}
                          {screenAwarenessStatus.preview ? (
                            <pre className="screen-awareness-preview">{screenAwarenessStatus.preview}</pre>
                          ) : null}
                        </div>
                      </details>

                      <details className="advanced-collapsible">
                        <summary>{copy('Oracle 抽签', 'Oracle draw')}</summary>
                        <div className="advanced-collapsible-body">
                          <p className="model-config-note">{oracleState.history[0]?.summary ?? copy('抽一张今日签。', 'Draw today’s card.')}</p>
                          <div className="toolbar-row">
                            {ORACLE_DECKS.map((deck) => (
                              <button key={deck.id} type="button" className="ghost-button" onClick={() => void onDrawOracle(deck.id)}>
                                {language === 'en-US' ? readableId(deck.id) : deck.title}
                              </button>
                            ))}
                          </div>
                          {oracleState.history.length > 1 ? (
                            <div className="compact-list">
                              {oracleState.history.slice(1, 5).map((entry) => (
                                <div key={entry.id} className="reminder-item compact-item">
                                  <div>
                                    <strong>{entry.title}</strong>
                                    <span>{entry.summary}</span>
                                  </div>
                                  <span className="model-config-note">{formatReminderTime(entry.createdAt, language)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </details>
                    </section>
                    </div>
                  </details>
                </div>
              ) : null}
            </section>
          </section>
        )}
      </section>
    </main>
  )
}

interface DiaryTabProps {
  entries: PetDiaryEntry[]
  config: PetDiaryConfig | null
  selectedDate: string
  status: { state: 'idle' | 'refreshing' | 'ready' | 'error'; message?: string }
  language: PetLanguage
  // Per-day part-time-job stats. Computed live from auditState in
  // PanelWindowShell because PetDiaryEntry deliberately doesn't persist
  // job stats — the audit log already keeps the last 200 entries which
  // covers any realistic single-day span, and we don't want diary
  // schema migrations every time we add another economy domain.
  jobsByDay: Record<string, { count: number; earned: number }>
  onSelect: (dateKey: string) => void
  onRefresh: () => void | Promise<void>
  onSeal: (dateKey: string) => void | Promise<void>
  onAppendNote: (dateKey: string, note: string) => void | Promise<void>
  onAddGitRepo: (path: string) => void | Promise<void>
  onRemoveGitRepo: (path: string) => void | Promise<void>
  onToggleActivity: (enabled: boolean) => void | Promise<void>
}

const formatActiveSpan = (minutes: number, language: PetLanguage) => {
  if (minutes < 0) return language === 'en-US' ? 'Not tracked' : '未追踪'
  if (minutes === 0) return language === 'en-US' ? '0 minutes' : '0 分钟'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return language === 'en-US' ? `${m} minute${m === 1 ? '' : 's'}` : `${m} 分钟`
  if (m === 0) return language === 'en-US' ? `${h} hour${h === 1 ? '' : 's'}` : `${h} 小时`
  return language === 'en-US' ? `${h} hour${h === 1 ? '' : 's'} ${m} minute${m === 1 ? '' : 's'}` : `${h} 小时 ${m} 分钟`
}

const formatDiaryEventTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toTimeString().slice(0, 5)
}

function DiaryDayButton({
  day,
  selectedDate,
  onSelect
}: {
  day: { key: string; entry?: PetDiaryEntry; isToday: boolean }
  selectedDate: string
  onSelect: (dateKey: string) => void
}) {
  const hasData = day.entry && (
    day.entry.conversation.userMessages > 0 ||
    day.entry.git.totalCommits > 0 ||
    (day.entry.activity.activeMinutes ?? -1) > 0 ||
    Boolean(day.entry.userNote)
  )

  return (
    <button
      type="button"
      className={`diary-day ${selectedDate === day.key ? 'active' : ''} ${day.isToday ? 'today' : ''} ${hasData ? 'has-data' : 'empty'} ${day.entry?.sealed ? 'sealed' : ''}`}
      onClick={() => onSelect(day.key)}
      title={day.entry?.narrative ?? day.key}
    >
      <span className="diary-day-date">{day.key.slice(5)}</span>
      <span className="diary-day-stat">
        {day.entry?.conversation.userMessages ?? 0}/{day.entry?.git.totalCommits ?? 0}
      </span>
    </button>
  )
}

function DiaryTab({
  entries,
  config,
  selectedDate,
  status,
  language,
  jobsByDay,
  onSelect,
  onRefresh,
  onSeal,
  onAppendNote,
  onAddGitRepo,
  onRemoveGitRepo,
  onToggleActivity
}: DiaryTabProps) {
  const [draftRepoPath, setDraftRepoPath] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const copy = (zh: string, en: string) => language === 'en-US' ? en : zh

  if (!config) {
    return (
      <section className="surface-card status-card">
        <p className="reminder-empty">{copy('日记加载中…', 'Loading diary…')}</p>
      </section>
    )
  }

  // Build a 30-day grid: today first, then back. Empty slots get a stub
  // entry so the calendar layout stays uniform regardless of activity.
  const today = new Date()
  const gridDays: { key: string; entry?: PetDiaryEntry; isToday: boolean }[] = []
  for (let i = 0; i < 30; i += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    gridDays.push({
      key,
      entry: entries.find((entry) => entry.date === key),
      isToday: i === 0
    })
  }

  const selectedEntry = entries.find((entry) => entry.date === selectedDate)
  const isSelectedToday = selectedDate === gridDays[0]?.key
  const recentGridDays = gridDays.slice(0, 14)
  const olderGridDays = gridDays.slice(14)

  return (
    <>
      <section className="surface-card diary-calendar-card">
        <div className="section-header">
          <strong>{copy('日记台账', 'Diary ledger')}</strong>
          <span>{copy('自动记录聊天、commit 和活跃时长。', 'Tracks chat, commits, and active time.')}</span>
        </div>
        <div className="diary-calendar-grid">
          {recentGridDays.map((day) => <DiaryDayButton key={day.key} day={day} selectedDate={selectedDate} onSelect={onSelect} />)}
        </div>
        <details className="advanced-collapsible diary-older-days">
          <summary>
            <span>{copy('更早日期', 'Older dates')}</span>
            <small>{copy('展开看前 30 天', 'Show last 30 days')}</small>
          </summary>
          <div className="diary-calendar-grid diary-calendar-grid-compact">
            {olderGridDays.map((day) => <DiaryDayButton key={day.key} day={day} selectedDate={selectedDate} onSelect={onSelect} />)}
          </div>
        </details>
        <div className="toolbar-row">
          <button
            type="button"
            className="ghost-button"
            onClick={() => void onRefresh()}
            disabled={status.state === 'refreshing'}
          >
            {status.state === 'refreshing' ? copy('正在更新…', 'Updating…') : copy('让它再写一次今天', 'Let it rewrite today')}
          </button>
          {isSelectedToday && selectedEntry ? (
            <button type="button" className="ghost-button" onClick={() => void onSeal(selectedDate)}>
              {copy('归档今天（不再自动改写）', 'Archive today (stop automatic rewrites)')}
            </button>
          ) : null}
        </div>
        {status.message ? (
          <p className={`reminder-empty ${status.state === 'error' ? 'error' : ''}`}>{status.message}</p>
        ) : null}
      </section>

      <section className="surface-card diary-detail-card">
        <div className="section-header">
          <strong>{selectedDate}</strong>
          <span>{selectedEntry?.sealed ? copy('已归档。', 'Archived.') : copy('持续记录中。', 'Still recording.')}</span>
        </div>
        {selectedEntry ? (
          <>
            <p className="diary-narrative">
              {selectedEntry.narrative}
              {selectedEntry.narrativeSource === 'fallback' ? <span className="diary-narrative-source">{copy(' · 本地记录；可点“再写一次”', ' · Local record; use “Rewrite” to refresh')}</span> : null}
            </p>
            <div className="diary-stat-grid">
              <div>
                <strong>{copy('对话', 'Conversation')}</strong>
                <span>{language === 'en-US' ? `${selectedEntry.conversation.userMessages} messages · ${selectedEntry.conversation.importantEvents} memorable` : `${selectedEntry.conversation.userMessages} 句 · ${selectedEntry.conversation.importantEvents} 件值得记`}</span>
              </div>
              <div>
                <strong>Git</strong>
                <span>{selectedEntry.git.totalCommits} commit · +{selectedEntry.git.totalInsertions}/-{selectedEntry.git.totalDeletions}</span>
              </div>
              <div>
                <strong>{copy('电脑活跃', 'Computer activity')}</strong>
                <span>{formatActiveSpan(selectedEntry.activity.activeMinutes, language)}{selectedEntry.activity.firstActiveAt && selectedEntry.activity.lastActiveAt ? ` · ${selectedEntry.activity.firstActiveAt}-${selectedEntry.activity.lastActiveAt}` : ''}</span>
              </div>
              {(() => {
                const jobs = jobsByDay[selectedEntry.date]
                const count = jobs?.count ?? 0
                const earned = jobs?.earned ?? 0
                return (
                  <div>
                    <strong>{copy('兼职', 'Part-time')}</strong>
                    <span>
                      {count === 0
                        ? copy('无', 'None')
                        : language === 'en-US'
                          ? `${count} job${count === 1 ? '' : 's'} · +${earned} pawcoin`
                          : `${count} 次 · +${earned} 米`}
                    </span>
                  </div>
                )
              })()}
            </div>
            {(selectedEntry.conversation.memorableEvents ?? []).length > 0 ? (
              <div className="diary-memory-list">
                <strong>{copy('今天具体记下了', 'Specifically remembered today')}</strong>
                <ul>
                  {(selectedEntry.conversation.memorableEvents ?? []).map((event) => {
                    const time = formatDiaryEventTime(event.ts)
                    return (
                      <li key={event.id}>
                        {time ? <span>{time}</span> : null}
                        <p>{event.summary}</p>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : selectedEntry.conversation.importantEvents > 0 ? (
              <p className="reminder-empty">{copy('旧日记只保存了数量。', 'Older diary only saved counts.')}</p>
            ) : null}
            {selectedEntry.git.perRepo.length > 0 ? (
              <div className="diary-repo-list">
                {selectedEntry.git.perRepo.map((repo) => (
                  <div key={repo.path} className="diary-repo-item">
                    <strong>{repo.path}</strong>
                    {repo.error ? (
                      <span className="diary-repo-error">{repo.error}</span>
                    ) : (
                      <span>{repo.commits} commit · +{repo.insertions}/-{repo.deletions}{repo.lastSubject ? language === 'en-US' ? ` · latest: "${repo.lastSubject}"` : ` · 最近："${repo.lastSubject}"` : ''}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="diary-note-block">
              <label>
                {copy('给这一天加一句手记', 'Add a note for this day')}
                <textarea
                  rows={2}
                  value={selectedEntry.date === selectedDate && draftNote ? draftNote : (selectedEntry.userNote ?? '')}
                  onChange={(event) => setDraftNote(event.target.value)}
                  placeholder={copy('归档后只能改手记。', 'Only notes can change after archiving.')}
                />
              </label>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  void onAppendNote(selectedDate, draftNote)
                  setDraftNote('')
                }}
                disabled={!draftNote.trim()}
              >
                {copy('保存手记', 'Save note')}
              </button>
            </div>
          </>
        ) : (
          <p className="reminder-empty">{copy('这一天还没日记。', 'No diary for this day yet.')}</p>
        )}
      </section>

      <section className="surface-card diary-config-card">
        <div className="section-header">
          <strong>{copy('数据来源', 'Data sources')}</strong>
          <span>{copy('全部本机采集，需手动开启。', 'All local; enable manually.')}</span>
        </div>
        <div className="diary-config-block">
          <label className="diary-toggle">
            <input
              type="checkbox"
              checked={config.activityTrackingEnabled}
              onChange={(event) => void onToggleActivity(event.target.checked)}
            />
            <span>
              <strong>{copy('跟踪电脑活跃时长', 'Track computer activity time')}</strong>
              <small>{copy('只读系统空闲时间，不读窗口或输入。', 'Reads idle time only, not windows or input.')}</small>
            </span>
          </label>
        </div>
        <div className="diary-config-block">
          <strong>{copy('Git 仓库路径', 'Git repository paths')}</strong>
          <p className="reminder-empty">{copy('按当天 commit 和行数统计。', 'Counts daily commits and line changes.')}</p>
          <div className="diary-repo-input">
            <input
              type="text"
              value={draftRepoPath}
              onChange={(event) => setDraftRepoPath(event.target.value)}
              placeholder={copy('例如 /Users/you/code/my-project', 'e.g. /Users/you/code/my-project')}
              spellCheck={false}
            />
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                if (!draftRepoPath.trim()) return
                void onAddGitRepo(draftRepoPath.trim())
                setDraftRepoPath('')
              }}
              disabled={!draftRepoPath.trim()}
            >
              {copy('添加', 'Add')}
            </button>
          </div>
          {config.gitRepoPaths.length === 0 ? (
            <p className="reminder-empty">{copy('还没添加任何仓库。', 'No repositories added yet.')}</p>
          ) : (
            <ul className="diary-repo-config-list">
              {config.gitRepoPaths.map((path) => (
                <li key={path}>
                  <span>{path}</span>
                  <button type="button" className="link-button" onClick={() => void onRemoveGitRepo(path)}>{copy('移除', 'Remove')}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
