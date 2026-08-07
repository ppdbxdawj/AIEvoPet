import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAppearanceAsset } from '../assets/pet/appearance-registry'
import { createDefaultPet } from '../lib/default-pet'
import { PanelWindowShell } from './PanelWindowShell'
import type { SpeciesGalleryOption } from '../components/SpeciesGalleryPanel'
import type {
  AchievementState,
  AuditState,
  EconomyState,
  HomeState,
  InventoryState,
  JobState,
  OracleState,
  ToolRegistryState
} from '../types/domain'
import type { PetDiaryConfig, PetDiaryEntry } from '../types/diary'
import type { PetBubbleContent, PetData, PetResolvedVisualState, ReminderItem } from '../types/pet'

vi.mock('../components/ChatBubble', () => ({
  ChatBubble: () => <div data-testid="chat-bubble" />
}))

vi.mock('../components/HoverChatDock', () => ({
  HoverChatDock: () => <div data-testid="hover-chat-dock" />
}))

vi.mock('../components/PetCanvas', () => ({
  PetCanvas: () => <div data-testid="pet-canvas" />,
  petAnimationManifest: {
    chains: {
      idle: { mode: 'idleFallback', sequence: ['idle-breathe'] },
      celebrating: { mode: 'loop', sequence: ['celebrating'] },
      failed: { mode: 'loop', sequence: ['failed'] }
    },
    events: {
      hover: 'idle',
      'task-done': 'celebrating',
      'task-failed': 'failed'
    }
  }
}))

vi.mock('../components/StatusPanel', () => ({
  StatusPanel: () => <div data-testid="status-panel" />
}))

vi.mock('../components/CutoutAlignmentEditor', () => ({
  CutoutAlignmentEditor: () => <div data-testid="cutout-editor" />
}))

const bubble: PetBubbleContent = {
  kind: 'speech',
  text: '你好呀',
  tone: 'warm'
}

const visualState: PetResolvedVisualState = {
  palette: 'cotton-candy',
  overlayIds: ['hat-bucket-hat'],
  expression: { eyes: 'neutral', mouth: 'neutral' },
  animKey: 'idle'
}

const noop = vi.fn()

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn() as never
  Element.prototype.scrollBy = vi.fn() as never
})

const renderPanel = (overrides?: {
  inventoryState?: InventoryState
  economyState?: EconomyState
  homeState?: HomeState
  jobState?: JobState
  achievementState?: AchievementState
  oracleState?: OracleState
  auditState?: AuditState
  toolState?: ToolRegistryState
  activeTab?: PetData['ui']['companionSurfaces']['activeTab']
  reminderIntensity?: 'low' | 'medium' | 'high'
  activeReminder?: ReminderItem | null
  pendingReminders?: ReminderItem[]
  onReminderIntensityChange?: (value: 'low' | 'medium' | 'high') => void
  diaryEntries?: PetDiaryEntry[]
  diaryConfig?: PetDiaryConfig | null
  diarySelectedDate?: string
  speciesOptions?: SpeciesGalleryOption[]
  onSpeciesChange?: (value: PetData['personality']['species']) => void
  onOpenUserPetDir?: () => Promise<void>
  onRescanUserPetPackages?: () => Promise<void>
  onCreateUserPetFromImage?: (file: File) => Promise<unknown>
  hatchedAt?: string
}) => {
  const pet = createDefaultPet()
  const currentAppearanceAsset = getAppearanceAsset(pet.memory.profile.chosenSpecies ?? pet.personality.species, pet.state.stage)
  pet.ui.onboardingCompleted = true
  pet.ui.panelOpen = true
  if (overrides?.hatchedAt) {
    pet.state.hatchedAt = overrides.hatchedAt
    pet.state.stage = 'baby'
  }
  pet.ui.companionSurfaces.activeTab = overrides?.activeTab ?? 'grow'
  pet.memory.bond.closeness = 40

  const now = new Date('2026-04-28T12:00:00.000Z').getTime()
  vi.setSystemTime(now)

  const reminders: ReminderItem[] = overrides?.pendingReminders ?? []

  return render(
    <PanelWindowShell
      pet={pet}
      isPanelWindow
      panelVisible
      bubble={bubble}
      bubbleVisible
      action="idle"
      visualState={visualState}
      paletteStyle={{}}
      currentAppearanceLabel="奶油小狗"
      currentAppearanceAsset={currentAppearanceAsset}
      draft=""
      chatLoading={false}
      hoverChatVisible={false}
      hoverChatExpanded={false}
      reminderTitle=""
      reminderTime=""
      reminderIntensity={overrides?.reminderIntensity ?? 'medium'}
      activeReminder={overrides?.activeReminder ?? null}
      pendingReminders={reminders}
      rendererMode="mesh"
      showMeshDebug={false}
      showAlignmentEditor={false}
      appliedCutoutPlacements={[]}
      cutoutPlacements={[]}
      dockLeanAmount="still"
      modelDraft={null}
      modelHealth={null}
      lastReplySource="fallback"
      modelSaving={false}
      modelConfigMessage=""
      hasModelDraftChanges={false}
      inventoryState={overrides?.inventoryState ?? { items: [], equippedWardrobeSlots: {} }}
      economyState={overrides?.economyState ?? { pawcoin: 80, lifetimeEarned: 0, lifetimeSpent: 0, pendingRewards: [] }}
      homeState={overrides?.homeState ?? { roomTier: 'starter', comfort: 0, furniture: [] }}
      jobState={overrides?.jobState ?? { unlockedJobs: [], completedJobs: 0 }}
      achievementState={overrides?.achievementState ?? { unlocked: [], exportedCards: 0 }}
      oracleState={overrides?.oracleState ?? { history: [] }}
      auditState={overrides?.auditState ?? { entries: [] }}
      toolState={overrides?.toolState ?? { enabledTools: [], promptsRequiredFor: [], lastUsedAtByTool: {} }}
      formatStage={() => '幼年期'}
      formatWorkingMode={() => '轻陪伴'}
      formatAttentionMode={() => '轻提醒'}
      formatReminderTime={(value) => value}
      getCompanionPresenceText={() => '低打扰陪着你'}
      getReminderSnoozeMinutes={() => 5}
      onboardingStep="hatch"
      onboardingProgress="5/5"
      aiSetupReady
      brainSetupHint=""
      paletteOptions={[]}
      importedPetLoadStatus={{ state: 'idle', count: 0 }}
      userPetImageImportStatus={{ state: 'idle' }}
      speciesOptions={overrides?.speciesOptions ?? []}
      onCreateUserPetFromImage={overrides?.onCreateUserPetFromImage ?? (async () => {})}
      onOpenUserPetDir={overrides?.onOpenUserPetDir ?? (async () => {})}
      onRescanUserPetPackages={overrides?.onRescanUserPetPackages ?? (async () => {})}
      onAdvanceOnboarding={noop}
      onSelectOnboardingStep={noop}
      onCompanionTabChange={noop}
      onPet={noop}
      onTogglePanel={noop}
      onPetDragStart={noop}
      onDockHoverChange={noop}
      onDraftChange={noop}
      onSubmit={noop}
      onExpand={noop}
      onCollapse={noop}
      onClosePanel={noop}
      onToggleMemoryEditor={noop}
      onProfileFieldChange={noop}
      onSpeciesChange={overrides?.onSpeciesChange ?? noop}
      onPaletteChange={noop}
      onLanguageChange={noop}
      onGenderChange={noop}
      onHatchPet={noop}
      onReminderTitleChange={noop}
      onReminderTimeChange={noop}
      onReminderIntensityChange={overrides?.onReminderIntensityChange ?? noop}
      onReminderSubmit={noop}
      onCompleteReminder={noop}
      onSnoozeReminder={noop}
      onWardrobeSelect={noop}
      onWardrobeUnequip={noop}
      onOpenUserWardrobeDir={async () => {}}
      onPreviewWardrobePlacement={noop}
      onUpdateWardrobePlacement={noop}
      onResetWardrobePlacement={noop}
      onExportAll={noop}
      onClearMemories={noop}
      onRemovePreference={noop}
      onRemoveFactRecord={noop}
      onRemoveFactKey={noop}
      onToggleFactKeyTracking={noop}
      diaryEntries={overrides?.diaryEntries ?? []}
      diaryConfig={overrides?.diaryConfig ?? null}
      diarySelectedDate={overrides?.diarySelectedDate ?? '2026-04-29'}
      diaryStatus={{ state: 'idle' }}
      onDiarySelectDate={noop}
      onRefreshDiaryToday={noop}
      onSealDiaryDate={noop}
      onAppendDiaryNote={noop}
      onAddGitRepoPath={noop}
      onRemoveGitRepoPath={noop}
      onToggleActivityTracking={noop}
      onClaimRewards={noop}
      onDrawWardrobe={noop}
      onUseInventoryItem={noop}
      onStartJob={noop}
      onClaimJob={noop}
      onExportAchievementCard={noop}
      onRevealShareCard={noop}
      shareCardStatus={{ state: 'idle' }}
      onConsolidateWeeklyMemory={noop}
      weeklySummaryStatus={{ state: 'idle' }}
      onPomodoroStart={noop}
      onDrawOracle={noop}
      onToggleSystemMode={noop}
      onToggleRendererMode={noop}
      onToggleAlignmentEditor={noop}
      onToggleMeshDebug={noop}
      onCutoutPlacementsChange={noop}
      onResetCutoutPlacements={noop}
      onModelDraftEnabledChange={noop}
      onModelDraftEndpointChange={noop}
      onModelDraftNameChange={noop}
      onModelDraftTimeoutChange={noop}
      onSaveModelConfig={noop}
      onResetModelDraft={noop}
    />
  )
}

describe('PanelWindowShell reminder intensity UI', () => {
  it('renders reminder intensity choices and reports selector changes', () => {
    const onReminderIntensityChange = vi.fn()
    renderPanel({
      activeTab: 'reminders',
      reminderIntensity: 'medium',
      onReminderIntensityChange,
      activeReminder: {
        id: 'open',
        title: '喝水',
        scheduledAt: '2026-04-28T12:10:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
        status: 'pending',
        intensity: 'medium'
      }
    })

    const low = screen.getByRole('radio', { name: '轻提醒' })
    const medium = screen.getByRole('radio', { name: '标准' })
    const high = screen.getByRole('radio', { name: '强提醒' })

    expect(low.getAttribute('aria-checked')).toBe('false')
    expect(medium.getAttribute('aria-checked')).toBe('true')
    expect(high.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(high)
    expect(onReminderIntensityChange).toHaveBeenCalledWith('high')
  })

  it('shows intensity badges for active and pending reminders', () => {
    const activeReminder: ReminderItem = {
      id: 'active',
      title: '喝水',
      scheduledAt: '2026-04-28T12:10:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      status: 'pending',
      intensity: 'high'
    }
    renderPanel({
      activeTab: 'reminders',
      activeReminder,
      pendingReminders: [
        activeReminder,
        {
          id: 'quiet',
          title: '伸展',
          scheduledAt: '2026-04-28T12:20:00.000Z',
          createdAt: '2026-04-28T12:00:00.000Z',
          status: 'pending',
          intensity: 'low'
        }
      ]
    })

    expect(screen.getAllByText('强').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('轻')).toBeTruthy()
    expect(screen.getByText(/2026-04-28T12:10:00.000Z · 强提醒/)).toBeTruthy()
    expect(screen.getByText(/2026-04-28T12:20:00.000Z · 轻提醒/)).toBeTruthy()
  })
})

describe('PanelWindowShell diary UI', () => {
  it('shows concrete memorable diary items and explains fallback narrative generation', () => {
    renderPanel({
      activeTab: 'diary',
      diarySelectedDate: '2026-04-29',
      diaryConfig: { gitRepoPaths: [], activityTrackingEnabled: false, todayRollupIntervalMinutes: 60 },
      diaryEntries: [
        {
          date: '2026-04-29',
          refreshedAt: '2026-04-29T12:00:00.000Z',
          sealed: false,
          source: 'auto',
          narrative: '今天聊到一点计划。',
          narrativeSource: 'fallback',
          conversation: {
            userMessages: 1,
            userCharacters: 8,
            petBubbles: 2,
            importantEvents: 2,
            memorableEvents: [
              { id: 'm1', ts: '2026-04-29T10:15:00.000Z', type: 'chat', summary: '聊到提醒强度要分级', importance: 3 },
              { id: 'm2', ts: '2026-04-29T11:20:00.000Z', type: 'chat', summary: '记录了日记需要展示具体内容', importance: 2 }
            ],
            topCategories: []
          },
          git: { totalCommits: 0, totalInsertions: 0, totalDeletions: 0, perRepo: [] },
          activity: { activeMinutes: -1, fullDayCoverage: false }
        }
      ]
    })

    expect(screen.getByText('今天具体记下了')).toBeTruthy()
    expect(screen.getByText('聊到提醒强度要分级')).toBeTruthy()
    expect(screen.getByText('记录了日记需要展示具体内容')).toBeTruthy()
    expect(screen.getByText(/本地记录/)).toBeTruthy()
  })
})

describe('PanelWindowShell settings surface', () => {
  it('swaps species immediately from appearance settings', () => {
    const onSpeciesChange = vi.fn()
    renderPanel({
      activeTab: 'settings',
      speciesOptions: [
        { value: 'puppy' as never, label: '小狗', labelEn: 'Puppy' },
        { value: 'piglet' as never, label: '小猪', labelEn: 'Piglet' }
      ],
      onSpeciesChange
    })

    const piglet = screen.getByRole('radio', { name: /小猪/ })
    fireEvent.pointerDown(piglet, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(piglet, { clientX: 10, clientY: 10 })

    expect(screen.queryByText('确认替换当前外观？')).toBeNull()
    expect(onSpeciesChange).toHaveBeenCalledWith('piglet')
  })

  it('shows local Petdex import controls in appearance settings', () => {
    const onOpenUserPetDir = vi.fn(async () => {})
    const onRescanUserPetPackages = vi.fn(async () => {})
    const onCreateUserPetFromImage = vi.fn(async () => {})
    renderPanel({
      activeTab: 'settings',
      onOpenUserPetDir,
      onRescanUserPetPackages,
      onCreateUserPetFromImage,
      speciesOptions: [
        { value: 'puppy', label: '奶油小狗', labelEn: 'Cream puppy' },
        { value: 'petdex:moon-cat', label: '月亮猫', labelEn: 'Moon Cat' }
      ]
    })

    expect(screen.getByText('导入本地宠物')).toBeTruthy()
    expect(screen.getByText('月亮猫')).toBeTruthy()
    const imageInput = screen.getByLabelText('选择图片创建宠物') as HTMLInputElement
    expect(imageInput.accept).toBe('image/png,image/jpeg,image/webp')
    fireEvent.click(screen.getByRole('button', { name: '打开 Petdex 文件夹' }))
    fireEvent.click(screen.getByRole('button', { name: '重新扫描' }))
    fireEvent.change(imageInput, {
      target: {
        files: [new File(['png'], 'moon-cat.png', { type: 'image/png' })]
      }
    })

    expect(onOpenUserPetDir).toHaveBeenCalled()
    expect(onRescanUserPetPackages).toHaveBeenCalled()
    expect(onCreateUserPetFromImage).toHaveBeenCalledWith(expect.objectContaining({ name: 'moon-cat.png' }))
  })

  it('shows companion presence and Agent Console skill cards', () => {
    renderPanel({
      activeTab: 'overview',
      hatchedAt: '2026-04-27T12:00:00.000Z',
      activeReminder: {
        id: 'active',
        title: '喝水',
        scheduledAt: '2026-04-28T12:10:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
        status: 'pending',
        intensity: 'high'
      },
      toolState: { enabledTools: ['pomodoro.start', 'oracle.draw'], promptsRequiredFor: ['shell.run'], lastUsedAtByTool: {} }
    })

    expect(screen.getByText(/陪伴第 \d+ 天 · 奶油小狗 · 幼年期 · 低打扰陪着你/)).toBeTruthy()
    expect(screen.getByText('给桌宠代理一个任务')).toBeTruthy()
    expect(screen.getByLabelText('代理技能')).toBeTruthy()
    expect(screen.getByText('近期活动')).toBeTruthy()
    const reminderButtons = screen.getAllByRole('button', { name: /提醒/ })
    expect(reminderButtons.some((button) => button.textContent?.includes('!'))).toBe(true)
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText(/1 个需要确认/)).toBeTruthy()
  })

  it('does not render nostalgia onboarding copy', () => {
    const pet = createDefaultPet()
    const currentAppearanceAsset = getAppearanceAsset(pet.memory.profile.chosenSpecies ?? pet.personality.species, pet.state.stage)
    pet.ui.onboardingCompleted = false
    pet.ui.panelOpen = true
    pet.ui.onboarding.currentStep = 'appearance'

    render(
      <PanelWindowShell
        pet={pet}
        isPanelWindow
        panelVisible
        bubble={bubble}
        bubbleVisible
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        currentAppearanceLabel="奶油小狗"
        currentAppearanceAsset={currentAppearanceAsset}
        draft=""
        chatLoading={false}
        hoverChatVisible={false}
        hoverChatExpanded={false}
        reminderTitle=""
        reminderTime=""
        reminderIntensity="medium"
        activeReminder={null}
        pendingReminders={[]}
        rendererMode="mesh"
        showMeshDebug={false}
        showAlignmentEditor={false}
        appliedCutoutPlacements={[]}
        cutoutPlacements={[]}
        dockLeanAmount="still"
        modelDraft={null}
        modelHealth={null}
        lastReplySource="fallback"
        modelSaving={false}
        modelConfigMessage=""
        hasModelDraftChanges={false}
        inventoryState={{ items: [], equippedWardrobeSlots: {} }}
        economyState={{ pawcoin: 80, lifetimeEarned: 0, lifetimeSpent: 0, pendingRewards: [] }}
        homeState={{ roomTier: 'starter', comfort: 0, furniture: [] }}
        jobState={{ unlockedJobs: [], completedJobs: 0 }}
        achievementState={{ unlocked: [], exportedCards: 0 }}
        oracleState={{ history: [] }}
        auditState={{ entries: [] }}
        toolState={{ enabledTools: [], promptsRequiredFor: [], lastUsedAtByTool: {} }}
        formatStage={() => '宠物蛋'}
        formatWorkingMode={() => '轻陪伴'}
        formatAttentionMode={() => '轻提醒'}
        formatReminderTime={(value) => value}
        getCompanionPresenceText={() => '低打扰陪着你'}
        getReminderSnoozeMinutes={() => 5}
        onboardingStep="appearance"
        onboardingProgress="2/4"
        aiSetupReady={false}
        brainSetupHint=""
        paletteOptions={[]}
        importedPetLoadStatus={{ state: 'idle', count: 0 }}
        userPetImageImportStatus={{ state: 'idle' }}
        speciesOptions={[]}
        onCreateUserPetFromImage={async () => {}}
        onOpenUserPetDir={async () => {}}
        onRescanUserPetPackages={async () => {}}
        onAdvanceOnboarding={noop}
        onSelectOnboardingStep={noop}
        onCompanionTabChange={noop}
        onPet={noop}
        onTogglePanel={noop}
        onPetDragStart={noop}
        onDockHoverChange={noop}
        onDraftChange={noop}
        onSubmit={noop}
        onExpand={noop}
        onCollapse={noop}
        onClosePanel={noop}
        onToggleMemoryEditor={noop}
        onProfileFieldChange={noop}
        onSpeciesChange={noop}
        onPaletteChange={noop}
        onLanguageChange={noop}
        onGenderChange={noop}
        onHatchPet={noop}
          onReminderTitleChange={noop}
        onReminderTimeChange={noop}
        onReminderIntensityChange={noop}
        onReminderSubmit={noop}
        onCompleteReminder={noop}
        onSnoozeReminder={noop}
        onWardrobeSelect={noop}
      onWardrobeUnequip={noop}
      onOpenUserWardrobeDir={async () => {}}
      onPreviewWardrobePlacement={noop}
      onUpdateWardrobePlacement={noop}
      onResetWardrobePlacement={noop}
        onExportAll={noop}
        onClearMemories={noop}
        onRemovePreference={noop}
      onRemoveFactRecord={noop}
      onRemoveFactKey={noop}
      onToggleFactKeyTracking={noop}
      diaryEntries={[]}
      diaryConfig={null}
      diarySelectedDate="2026-04-29"
      diaryStatus={{ state: 'idle' }}
      onDiarySelectDate={noop}
      onRefreshDiaryToday={noop}
      onSealDiaryDate={noop}
      onAppendDiaryNote={noop}
      onAddGitRepoPath={noop}
      onRemoveGitRepoPath={noop}
      onToggleActivityTracking={noop}
        onClaimRewards={noop}
        onDrawWardrobe={noop}
        onUseInventoryItem={noop}
        onStartJob={noop}
        onClaimJob={noop}
        onExportAchievementCard={noop}
        onRevealShareCard={noop}
        shareCardStatus={{ state: 'idle' }}
        onConsolidateWeeklyMemory={noop}
        weeklySummaryStatus={{ state: 'idle' }}
        onPomodoroStart={noop}
        onDrawOracle={noop}
        onToggleSystemMode={noop}
        onToggleRendererMode={noop}
        onToggleAlignmentEditor={noop}
        onToggleMeshDebug={noop}
        onCutoutPlacementsChange={noop}
        onResetCutoutPlacements={noop}
        onModelDraftEnabledChange={noop}
        onModelDraftEndpointChange={noop}
        onModelDraftNameChange={noop}
        onModelDraftTimeoutChange={noop}
        onSaveModelConfig={noop}
        onResetModelDraft={noop}
      />
    )

    expect(screen.queryByText('怀旧')).toBeNull()
    expect(screen.queryByText('怀旧彩蛋')).toBeNull()
    expect(screen.getByRole('button', { name: '去连接大语言模型' })).toBeTruthy()
  })

  it('no longer surfaces dead calendar/planner/minigame controls in settings', () => {
    const pet = createDefaultPet()
    const currentAppearanceAsset = getAppearanceAsset(pet.memory.profile.chosenSpecies ?? pet.personality.species, pet.state.stage)
    pet.ui.onboardingCompleted = true
    pet.ui.panelOpen = true
    pet.ui.companionSurfaces.activeTab = 'settings'

    render(
      <PanelWindowShell
        pet={pet}
        isPanelWindow
        panelVisible
        bubble={bubble}
        bubbleVisible
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        currentAppearanceLabel="奶油小狗"
        currentAppearanceAsset={currentAppearanceAsset}
        draft=""
        chatLoading={false}
        hoverChatVisible={false}
        hoverChatExpanded={false}
        reminderTitle=""
        reminderTime=""
        reminderIntensity="medium"
        activeReminder={null}
        pendingReminders={[]}
        rendererMode="mesh"
        showMeshDebug={false}
        showAlignmentEditor={false}
        appliedCutoutPlacements={[]}
        cutoutPlacements={[]}
        dockLeanAmount="still"
        modelDraft={null}
        modelHealth={null}
        lastReplySource="fallback"
        modelSaving={false}
        modelConfigMessage=""
        hasModelDraftChanges={false}
        inventoryState={{ items: [], equippedWardrobeSlots: {} }}
        economyState={{ pawcoin: 80, lifetimeEarned: 0, lifetimeSpent: 0, pendingRewards: [] }}
        homeState={{ roomTier: 'starter', comfort: 0, furniture: [] }}
        jobState={{ unlockedJobs: [], completedJobs: 0 }}
        achievementState={{ unlocked: [], exportedCards: 0 }}
        oracleState={{ history: [] }}
        auditState={{ entries: [] }}
        toolState={{ enabledTools: [], promptsRequiredFor: [], lastUsedAtByTool: {} }}
        formatStage={() => '幼年期'}
        formatWorkingMode={() => '轻陪伴'}
        formatAttentionMode={() => '轻提醒'}
        formatReminderTime={(value) => value}
        getCompanionPresenceText={() => '低打扰陪着你'}
        getReminderSnoozeMinutes={() => 5}
        onboardingStep="hatch"
        onboardingProgress="5/5"
        aiSetupReady
        brainSetupHint=""
        paletteOptions={[]}
        importedPetLoadStatus={{ state: 'idle', count: 0 }}
        userPetImageImportStatus={{ state: 'idle' }}
        speciesOptions={[]}
        onCreateUserPetFromImage={async () => {}}
        onOpenUserPetDir={async () => {}}
        onRescanUserPetPackages={async () => {}}
        onAdvanceOnboarding={noop}
        onSelectOnboardingStep={noop}
        onCompanionTabChange={noop}
        onPet={noop}
        onTogglePanel={noop}
        onPetDragStart={noop}
        onDockHoverChange={noop}
        onDraftChange={noop}
        onSubmit={noop}
        onExpand={noop}
        onCollapse={noop}
        onClosePanel={noop}
        onToggleMemoryEditor={noop}
        onProfileFieldChange={noop}
        onSpeciesChange={noop}
        onPaletteChange={noop}
        onLanguageChange={noop}
        onGenderChange={noop}
        onHatchPet={noop}
          onReminderTitleChange={noop}
        onReminderTimeChange={noop}
        onReminderIntensityChange={noop}
        onReminderSubmit={noop}
        onCompleteReminder={noop}
        onSnoozeReminder={noop}
        onWardrobeSelect={noop}
      onWardrobeUnequip={noop}
      onOpenUserWardrobeDir={async () => {}}
      onPreviewWardrobePlacement={noop}
      onUpdateWardrobePlacement={noop}
      onResetWardrobePlacement={noop}
        onExportAll={noop}
        onClearMemories={noop}
        onRemovePreference={noop}
      onRemoveFactRecord={noop}
      onRemoveFactKey={noop}
      onToggleFactKeyTracking={noop}
      diaryEntries={[]}
      diaryConfig={null}
      diarySelectedDate="2026-04-29"
      diaryStatus={{ state: 'idle' }}
      onDiarySelectDate={noop}
      onRefreshDiaryToday={noop}
      onSealDiaryDate={noop}
      onAppendDiaryNote={noop}
      onAddGitRepoPath={noop}
      onRemoveGitRepoPath={noop}
      onToggleActivityTracking={noop}
        onClaimRewards={noop}
        onDrawWardrobe={noop}
        onUseInventoryItem={noop}
        onStartJob={noop}
        onClaimJob={noop}
        onExportAchievementCard={noop}
        onRevealShareCard={noop}
        shareCardStatus={{ state: 'idle' }}
        onConsolidateWeeklyMemory={noop}
        weeklySummaryStatus={{ state: 'idle' }}
        onPomodoroStart={noop}
        onDrawOracle={noop}
        onToggleSystemMode={noop}
        onToggleRendererMode={noop}
        onToggleAlignmentEditor={noop}
        onToggleMeshDebug={noop}
        onCutoutPlacementsChange={noop}
        onResetCutoutPlacements={noop}
        onModelDraftEnabledChange={noop}
        onModelDraftEndpointChange={noop}
        onModelDraftNameChange={noop}
        onModelDraftTimeoutChange={noop}
        onSaveModelConfig={noop}
        onResetModelDraft={noop}
      />
    )

    // After the panel UX cleanup these surfaces were either never wired or
    // misleading (calendar export piggybacked on reminder fields, planner
    // generated 3 hardcoded slots, minigame was an instant payout). The
    // settings tab should now be free of all of them.
    expect(screen.queryByRole('button', { name: /导出 \.ics/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'EventKit' })).toBeNull()
    expect(screen.queryByRole('button', { name: '记录今日宣言' })).toBeNull()
    expect(screen.queryByRole('button', { name: '开始番茄钟' })).toBeNull()
    expect(screen.queryByRole('button', { name: '陪它玩一会儿' })).toBeNull()
    // The audit log card stays since it has real producers.
    expect(screen.getByText('审计记录')).toBeTruthy()
  })

  it('renders recent audit activity in the Agent Console feed', () => {
    renderPanel({
      activeTab: 'care',
      auditState: {
        entries: [{
          id: 'audit-1',
          at: '2026-04-28T11:55:00.000Z',
          actor: 'pet-agent',
          domain: 'tools',
          action: 'pomodoro.start',
          summary: '启动了 25 分钟番茄钟',
          requiresConfirmation: true
        }]
      }
    })

    expect(screen.getByText('近期活动')).toBeTruthy()
    expect(screen.getByText('启动了 25 分钟番茄钟')).toBeTruthy()
    expect(screen.getByText(/tools · 2026-04-28T11:55:00.000Z/)).toBeTruthy()
  })

  it('maps the legacy overview tab to care instead of showing a dead companion tab', () => {
    const pet = createDefaultPet()
    const currentAppearanceAsset = getAppearanceAsset(pet.memory.profile.chosenSpecies ?? pet.personality.species, pet.state.stage)
    pet.ui.onboardingCompleted = true
    pet.ui.panelOpen = true
    pet.ui.companionSurfaces.activeTab = 'overview'

    render(
      <PanelWindowShell
        pet={pet}
        isPanelWindow
        panelVisible
        bubble={bubble}
        bubbleVisible
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        currentAppearanceLabel="奶油小狗"
        currentAppearanceAsset={currentAppearanceAsset}
        draft=""
        chatLoading={false}
        hoverChatVisible={false}
        hoverChatExpanded={false}
        reminderTitle=""
        reminderTime=""
        reminderIntensity="medium"
        activeReminder={null}
        pendingReminders={[]}
        rendererMode="mesh"
        showMeshDebug={false}
        showAlignmentEditor={false}
        appliedCutoutPlacements={[]}
        cutoutPlacements={[]}
        dockLeanAmount="still"
        modelDraft={null}
        modelHealth={null}
        lastReplySource="fallback"
        modelSaving={false}
        modelConfigMessage=""
        hasModelDraftChanges={false}
        inventoryState={{ items: [], equippedWardrobeSlots: {} }}
        economyState={{ pawcoin: 80, lifetimeEarned: 0, lifetimeSpent: 0, pendingRewards: [] }}
        homeState={{ roomTier: 'starter', comfort: 0, furniture: [] }}
        jobState={{ unlockedJobs: [], completedJobs: 0 }}
        achievementState={{ unlocked: [], exportedCards: 0 }}
        oracleState={{ history: [] }}
        auditState={{ entries: [] }}
        toolState={{ enabledTools: [], promptsRequiredFor: [], lastUsedAtByTool: {} }}
        formatStage={() => '幼年期'}
        formatWorkingMode={() => '轻陪伴'}
        formatAttentionMode={() => '轻提醒'}
        formatReminderTime={(value) => value}
        getCompanionPresenceText={() => '低打扰陪着你'}
        getReminderSnoozeMinutes={() => 5}
        onboardingStep="hatch"
        onboardingProgress="5/5"
        aiSetupReady
        brainSetupHint=""
        paletteOptions={[]}
        importedPetLoadStatus={{ state: 'idle', count: 0 }}
        userPetImageImportStatus={{ state: 'idle' }}
        speciesOptions={[]}
        onCreateUserPetFromImage={async () => {}}
        onOpenUserPetDir={async () => {}}
        onRescanUserPetPackages={async () => {}}
        onAdvanceOnboarding={noop}
        onSelectOnboardingStep={noop}
        onCompanionTabChange={noop}
        onPet={noop}
        onTogglePanel={noop}
        onPetDragStart={noop}
        onDockHoverChange={noop}
        onDraftChange={noop}
        onSubmit={noop}
        onExpand={noop}
        onCollapse={noop}
        onClosePanel={noop}
        onToggleMemoryEditor={noop}
        onProfileFieldChange={noop}
        onSpeciesChange={noop}
        onPaletteChange={noop}
        onLanguageChange={noop}
        onGenderChange={noop}
        onHatchPet={noop}
          onReminderTitleChange={noop}
        onReminderTimeChange={noop}
        onReminderIntensityChange={noop}
        onReminderSubmit={noop}
        onCompleteReminder={noop}
        onSnoozeReminder={noop}
        onWardrobeSelect={noop}
      onWardrobeUnequip={noop}
      onOpenUserWardrobeDir={async () => {}}
      onPreviewWardrobePlacement={noop}
      onUpdateWardrobePlacement={noop}
      onResetWardrobePlacement={noop}
        onExportAll={noop}
        onClearMemories={noop}
        onRemovePreference={noop}
      onRemoveFactRecord={noop}
      onRemoveFactKey={noop}
      onToggleFactKeyTracking={noop}
      diaryEntries={[]}
      diaryConfig={null}
      diarySelectedDate="2026-04-29"
      diaryStatus={{ state: 'idle' }}
      onDiarySelectDate={noop}
      onRefreshDiaryToday={noop}
      onSealDiaryDate={noop}
      onAppendDiaryNote={noop}
      onAddGitRepoPath={noop}
      onRemoveGitRepoPath={noop}
      onToggleActivityTracking={noop}
        onClaimRewards={noop}
        onDrawWardrobe={noop}
        onUseInventoryItem={noop}
        onStartJob={noop}
        onClaimJob={noop}
        onExportAchievementCard={noop}
        onRevealShareCard={noop}
        shareCardStatus={{ state: 'idle' }}
        onConsolidateWeeklyMemory={noop}
        weeklySummaryStatus={{ state: 'idle' }}
        onPomodoroStart={noop}
        onDrawOracle={noop}
        onToggleSystemMode={noop}
        onToggleRendererMode={noop}
        onToggleAlignmentEditor={noop}
        onToggleMeshDebug={noop}
        onCutoutPlacementsChange={noop}
        onResetCutoutPlacements={noop}
        onModelDraftEnabledChange={noop}
        onModelDraftEndpointChange={noop}
        onModelDraftNameChange={noop}
        onModelDraftTimeoutChange={noop}
        onSaveModelConfig={noop}
        onResetModelDraft={noop}
      />
    )

    expect(screen.getByRole('button', { name: /照料/ }).className).toContain('active')
    expect(screen.queryByRole('button', { name: /陪伴/ })).toBeNull()
    expect(screen.getByTestId('status-panel')).toBeTruthy()
    expect(screen.queryByText('日常照料')).toBeNull()
    expect(screen.queryByText('当前是 fallback 陪伴回复')).toBeNull()
  })

  it('does not render the dead 工具开关 chips or 安静陪伴/导出快照 buttons', () => {
    const pet = createDefaultPet()
    const currentAppearanceAsset = getAppearanceAsset(pet.memory.profile.chosenSpecies ?? pet.personality.species, pet.state.stage)
    pet.ui.onboardingCompleted = true
    pet.ui.panelOpen = true
    pet.ui.companionSurfaces.activeTab = 'settings'

    render(
      <PanelWindowShell
        pet={pet}
        isPanelWindow
        panelVisible
        bubble={bubble}
        bubbleVisible
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        currentAppearanceLabel="奶油小狗"
        currentAppearanceAsset={currentAppearanceAsset}
        draft=""
        chatLoading={false}
        hoverChatVisible={false}
        hoverChatExpanded={false}
        reminderTitle=""
        reminderTime=""
        reminderIntensity="medium"
        activeReminder={null}
        pendingReminders={[]}
        rendererMode="mesh"
        showMeshDebug={false}
        showAlignmentEditor={false}
        appliedCutoutPlacements={[]}
        cutoutPlacements={[]}
        dockLeanAmount="still"
        modelDraft={null}
        modelHealth={null}
        lastReplySource="fallback"
        modelSaving={false}
        modelConfigMessage=""
        hasModelDraftChanges={false}
        inventoryState={{ items: [], equippedWardrobeSlots: {} }}
        economyState={{ pawcoin: 80, lifetimeEarned: 0, lifetimeSpent: 0, pendingRewards: [] }}
        homeState={{ roomTier: 'starter', comfort: 0, furniture: [] }}
        jobState={{ unlockedJobs: [], completedJobs: 0 }}
        achievementState={{ unlocked: [], exportedCards: 0 }}
        oracleState={{ history: [] }}
        auditState={{ entries: [] }}
        toolState={{ enabledTools: [], promptsRequiredFor: [], lastUsedAtByTool: {} }}
        formatStage={() => '幼年期'}
        formatWorkingMode={() => '轻陪伴'}
        formatAttentionMode={() => '轻提醒'}
        formatReminderTime={(value) => value}
        getCompanionPresenceText={() => '低打扰陪着你'}
        getReminderSnoozeMinutes={() => 5}
        onboardingStep="hatch"
        onboardingProgress="5/5"
        aiSetupReady
        brainSetupHint=""
        paletteOptions={[]}
        importedPetLoadStatus={{ state: 'idle', count: 0 }}
        userPetImageImportStatus={{ state: 'idle' }}
        speciesOptions={[]}
        onCreateUserPetFromImage={async () => {}}
        onOpenUserPetDir={async () => {}}
        onRescanUserPetPackages={async () => {}}
        onAdvanceOnboarding={noop}
        onSelectOnboardingStep={noop}
        onCompanionTabChange={noop}
        onPet={noop}
        onTogglePanel={noop}
        onPetDragStart={noop}
        onDockHoverChange={noop}
        onDraftChange={noop}
        onSubmit={noop}
        onExpand={noop}
        onCollapse={noop}
        onClosePanel={noop}
        onToggleMemoryEditor={noop}
        onProfileFieldChange={noop}
        onSpeciesChange={noop}
        onPaletteChange={noop}
        onLanguageChange={noop}
        onGenderChange={noop}
        onHatchPet={noop}
          onReminderTitleChange={noop}
        onReminderTimeChange={noop}
        onReminderIntensityChange={noop}
        onReminderSubmit={noop}
        onCompleteReminder={noop}
        onSnoozeReminder={noop}
        onWardrobeSelect={noop}
      onWardrobeUnequip={noop}
      onOpenUserWardrobeDir={async () => {}}
      onPreviewWardrobePlacement={noop}
      onUpdateWardrobePlacement={noop}
      onResetWardrobePlacement={noop}
        onExportAll={noop}
        onClearMemories={noop}
        onRemovePreference={noop}
      onRemoveFactRecord={noop}
      onRemoveFactKey={noop}
      onToggleFactKeyTracking={noop}
      diaryEntries={[]}
      diaryConfig={null}
      diarySelectedDate="2026-04-29"
      diaryStatus={{ state: 'idle' }}
      onDiarySelectDate={noop}
      onRefreshDiaryToday={noop}
      onSealDiaryDate={noop}
      onAppendDiaryNote={noop}
      onAddGitRepoPath={noop}
      onRemoveGitRepoPath={noop}
      onToggleActivityTracking={noop}
        onClaimRewards={noop}
        onDrawWardrobe={noop}
        onUseInventoryItem={noop}
        onStartJob={noop}
        onClaimJob={noop}
        onExportAchievementCard={noop}
        onRevealShareCard={noop}
        shareCardStatus={{ state: 'idle' }}
        onConsolidateWeeklyMemory={noop}
        weeklySummaryStatus={{ state: 'idle' }}
        onPomodoroStart={noop}
        onDrawOracle={noop}
        onToggleSystemMode={noop}
        onToggleRendererMode={noop}
        onToggleAlignmentEditor={noop}
        onToggleMeshDebug={noop}
        onCutoutPlacementsChange={noop}
        onResetCutoutPlacements={noop}
        onModelDraftEnabledChange={noop}
        onModelDraftEndpointChange={noop}
        onModelDraftNameChange={noop}
        onModelDraftTimeoutChange={noop}
        onSaveModelConfig={noop}
        onResetModelDraft={noop}
      />
    )

    // The "工具开关" subcard was a dead toggle (controller never read its
    // enabledTools list back into runtime decisions). The "安静陪伴" button
    // duplicated the "度假模式" chip, and "导出快照" duplicated "导出记忆".
    expect(screen.queryByText('工具开关')).toBeNull()
    expect(screen.queryByRole('button', { name: '安静陪伴' })).toBeNull()
    expect(screen.queryByRole('button', { name: '导出快照' })).toBeNull()
    // Oracle is now folded behind 高级设置 → details collapsed.
    expect(screen.queryByText('抽一张签，让它给你一个轻量提示。')).toBeNull()
  })
})
