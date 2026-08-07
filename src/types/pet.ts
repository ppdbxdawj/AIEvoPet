export type PetStage = 'egg' | 'baby' | 'child' | 'adult' | 'elder'
export type GeneratedPetSpecies = `prompt-${number}`
export type ImportedPetSpecies = `petdex:${string}`
export type PetSpecies = 'blob' | 'cat' | 'ghost' | 'puppy' | 'piglet' | GeneratedPetSpecies | ImportedPetSpecies
export type PetAction = 'idle' | 'happy' | 'sleepy' | 'hungry' | 'talking' | 'blush' | 'alert' | 'walk' | 'thinking' | 'reviewing' | 'failed' | 'celebrating' | 'waiting'
export type PetBubbleKind = 'speech' | 'thought' | 'dream'
export type PetBubbleTone = 'soft' | 'warm' | 'playful' | 'alert'
export type PetShowIntent = 'companionship' | 'nudge' | 'celebrate' | 'rest' | 'dream'
export type PetShowAnimKey = 'idle' | 'nudge' | 'bounce' | 'blush' | 'sleep' | 'alert'
export type PetExpressionEyes = 'neutral' | 'soft' | 'smile' | 'sleepy' | 'sparkle' | 'alert'
export type PetExpressionMouth = 'neutral' | 'smile' | 'open' | 'pout' | 'sleepy'
export type InteractionType = 'chat' | 'feed' | 'pet' | 'sleep' | 'wake' | 'idle' | 'drink' | 'bath' | 'hold'
export type PetCodingEventKind = 'task-start' | 'task-done' | 'task-failed' | 'commit-created' | 'test-pass' | 'test-fail' | 'build-pass' | 'build-fail'
export type PetCodingEventSource = 'claude-code' | 'codex' | 'cursor' | 'vscode' | 'skill' | 'manual'
export type PetCodingEventStatus = 'running' | 'succeeded' | 'failed'
export type PetEventType = InteractionType | PetCodingEventKind
export type PetReminderPhase = 'none' | 'soon' | 'alert' | 'done'
export type PetReminderIntensity = 'low' | 'medium' | 'high'
export type PetRelationshipStage = 'stranger' | 'warming-up' | 'friend' | 'close' | 'soulmate'
export type PetLanguage = 'zh-CN' | 'en-US'
export type PetOnboardingStep = 'language' | 'identity' | 'appearance' | 'brain' | 'hatch'
export type PetSceneId =
  | 'idle'
  | 'focus'
  | 'lonely'
  | 'hungry'
  | 'sleepy'
  | 'sleeping'
  | 'wake-up'
  | 'pet-react'
  | 'excited'
  | 'reminder-soon'
  | 'reminder-alert'
  | 'reminder-done'
export type PetPreferenceCategory = 'identity' | 'reminder' | 'interaction' | 'schedule' | 'work' | 'comfort'
export type PetPreferenceSource = 'explicit' | 'behavior'
export type PetWorkingMode = 'idle' | 'focus' | 'care' | 'chat' | 'rest' | 'sleep'
export type PetTimePeriod = 'late-night' | 'morning' | 'afternoon' | 'evening'
export type PetDailyMoodTone = 'playful' | 'warm' | 'steady' | 'sleepy' | 'lonely'
export type PetGenerationKind = 'chat' | 'interaction' | 'scene' | 'reminder' | 'summary' | 'conversation-command' | 'conversation-loop'
export type PetModelProvider = 'ollama'
export type PetSummaryTarget = 'bond' | 'recent-feeling' | 'daily' | 'weekly'
// Coarse buckets for what a memory is *about*. Used to keep the events list
// scan-able and to power weekly rollups ("这周你提到妈妈两次"). Free-form so
// the LLM can also propose one of these without a hard schema break.
export type PetEventCategory =
  | 'milestone'   // 上线、面试通过、考上学校、搬家、宠物领养
  | 'people'      // 妈妈/爸爸/朋友/对象/同事
  | 'work'        // 工作/项目/会议/加班
  | 'health'      // 生病/复诊/失眠/锻炼
  | 'mood'        // 强情绪信号
  | 'preference'  // 用户表达的偏好/口味
  | 'general'     // 其它
export type ExecutableInteractionType = 'feed' | 'pet' | 'sleep' | 'wake' | 'drink' | 'bath' | 'hold'
export type PetMemoryUpdateKind =
  | 'preferred-name'
  | 'like'
  | 'dislike'
  | 'habit'
  | 'address-style'
  | 'focus-support'
  | 'comfort-topic'
  | 'reminder-preference'
export type PetInteractionStyle = 'quiet' | 'warm' | 'playful'
export type PetReminderStyle = 'gentle' | 'balanced' | 'direct'
export type PetAddressStyle = 'plain' | 'name' | 'nickname'
export type PetFocusSupportStyle = 'quiet' | 'check-in' | 'encouraging'
export type PetLowMoodSupportStyle = 'gentle' | 'steady' | 'playful'
export type PetAttentionMode = 'active-reminder' | 'light-nudge' | 'passive-visible' | 'do-not-disturb'

export interface WindowPosition {
  x: number
  y: number
}

export type PetLeanDirection = 'left' | 'right'
export type PetBlinkMode = 'off' | 'soft' | 'sleepy' | 'alert'
export type PetMotionLevel = 'still' | 'soft' | 'active'
export type PetMotionTempo = 'slow' | 'steady' | 'quick'
export type PetMotionWeight = 'light' | 'grounded' | 'springy'
export type PetMotionMode = 'focus' | 'sleepy' | 'alert' | 'excited' | 'bounce' | 'hungry' | 'talk' | 'thinking' | 'reviewing' | 'failed' | 'waiting'
export type PetCutoutMotionRole = 'none' | 'ears' | 'eyes' | 'snout' | 'cheeks'

export interface PetCutoutPlacement {
  id: string
  slotId?: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  visible: boolean
}

export interface PetCutoutPartDefinition {
  id: string
  slotId: string
  label: string
  imageSrc: string
  motionRole: PetCutoutMotionRole
  defaultPlacement: PetCutoutPlacement
}

export interface PetMotionProfile {
  mode: PetMotionMode
  blink: PetBlinkMode
  earWiggle: PetMotionLevel
  snoutPulse: PetMotionLevel
  cheekPulse: PetMotionLevel
  highlightPulse: PetMotionLevel
  tempo: PetMotionTempo
  weight: PetMotionWeight
  sparkle: PetMotionLevel
  headBob: PetMotionLevel
  headTilt: PetMotionLevel
  bodySquash: PetMotionLevel
  limbBounce: PetMotionLevel
  eyeFocus: PetMotionLevel
  leanDirection?: PetLeanDirection
  leanAmount: PetMotionLevel
}

export interface PetHitRegion {
  x: number
  y: number
  w: number
  h: number
}

export interface WalkTick {
  x: number
  y: number
  action: 'walk' | 'idle'
  facing: 'left' | 'right'
  frame: number
}

export interface PetWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export type PetTeleportReason =
  | 'task-done'
  | 'task-failed'
  | 'reminder'
  | 'manual'
  | (string & {})

export interface PetWindowTeleported {
  x: number
  y: number
  reason: PetTeleportReason
  title?: string
  summary?: string
  displayText?: string
  source?: PetCodingEventSource
}

export interface ReminderItem {
  id: string
  title: string
  scheduledAt: string
  createdAt: string
  status: 'pending' | 'done' | 'missed'
  snoozeUntil?: string
  intensity?: PetReminderIntensity
}

export interface CreateReminderInput {
  title: string
  scheduledAt: string
  intensity?: PetReminderIntensity
}

export interface CalendarEventWriteInput {
  provider: 'eventkit' | 'ics'
  title: string
  startsAt: string
  endsAt?: string
  notes?: string
}

export interface CalendarEventWriteResult {
  provider: 'eventkit' | 'ics'
  target: 'calendar' | 'ics-file'
  eventId?: string
  filePath?: string
  fallback?: boolean
}

export interface PetCodingEvent {
  id: string
  kind: PetCodingEventKind
  source: PetCodingEventSource
  title: string
  summary?: string
  status: PetCodingEventStatus
  createdAt: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface PetCodingEventPresentation {
  reply: Pick<PetGeneratedReply, 'text' | 'action' | 'show'>
  persistent?: boolean
  shouldRecordMemory: boolean
}

export interface PetCodingEventIngestResult {
  accepted: boolean
  event: PetCodingEvent
}

export interface PetPersonality {
  name: string
  species: PetSpecies
  corePersonality: string
  speakingStyle: string[]
  likes: string[]
  dislikes: string[]
  worldview: string
  defaultMood: 'happy' | 'calm' | 'shy' | 'playful' | 'tsundere'
}

export interface PetState {
  level: number
  stage: PetStage
  ageDays: number
  hunger: number
  mood: number
  cleanliness: number
  health: number
  energy: number
  affection: number
  loneliness: number
  isSleeping: boolean
  lastInteractionAt: string
  lastCareAt?: string
  hatchedAt?: string
}

export interface UserProfileMemory {
  preferredName?: string
  petName?: string
  userAddress?: string
  chosenSpecies?: PetPersonality['species']
  selectedPalette?: string
  selectedGender?: 'boy' | 'girl'
  likes: string[]
  dislikes: string[]
  habits: string[]
  comfortTopics: string[]
}

export interface UserPreferenceMemory {
  id: string
  category: PetPreferenceCategory
  summary: string
  value: string
  confidence: number
  source: PetPreferenceSource
  updatedAt: string
}

export interface BondMemory {
  closeness: number
  trust: number
  reliance: number
  warmth: number
  neglectedLevel: number
  interactionMomentum: number
  summary: string
  recentFeeling: string
}

export interface EventMemory {
  id: string
  ts: string
  type: PetEventType
  summary: string
  petEmotion: 'happy' | 'sad' | 'calm' | 'excited' | 'lonely'
  importance: 1 | 2 | 3
  sceneId?: PetSceneId
  tags?: string[]
  // Optional categorisation for weekly rollups. Older saved events won't have
  // it; consumers must treat undefined as "general".
  category?: PetEventCategory
}

export interface PetWorkingMemory {
  currentMode: PetWorkingMode
  currentScene: PetSceneId
  currentTimePeriod: PetTimePeriod
  lastObservedAt: string
  focusStartedAt?: string
  lastUserMessage?: string
  lastUserMessageAt?: string
  lastSummaryAt?: string
  lastProactiveAt?: string
}

export interface PetDailySummary {
  date: string
  summary: string
  dominantMood: PetDailyMoodTone
  focusMinutes: number
  interactionCount: number
  reminderCompleted: number
  reminderSnoozed: number
}

export interface ReminderStrategyMemory {
  preferredSnoozeMinutes: number
  gentleness: number
  completionCount: number
  snoozeCount: number
  ignoreCount: number
  consecutiveDone: number
  consecutiveSnooze: number
  lastAlertAt?: string
  lastCompletedAt?: string
  lastResponseAt?: string
}

export interface CompanionPreferenceMemory {
  interactionStyle: PetInteractionStyle
  reminderStyle: PetReminderStyle
  addressStyle: PetAddressStyle
  focusSupportStyle: PetFocusSupportStyle
  lowMoodSupportStyle: PetLowMoodSupportStyle
  favoriteTopics: string[]
  recentTopics: string[]
  avoidPhrases: string[]
  learnedSpeechStyle: string[]
  summary: string
  updatedAt: string
}

export interface PetRelationshipMemory {
  stage: PetRelationshipStage
  anniversaryStartedAt?: string
  dayMilestones: number[]
  weeklyConsolidationAt?: string
  // 2-3 sentence narrative summarising the past 7 days of chat + events.
  // Refreshed by consolidateWeeklyMemory() either on a 7-day cadence or via
  // an explicit "再总结一次" button in the panel.
  weeklySummary?: string
  lastGrowthAt?: string
  summary: string
}

export interface PetAiSetupState {
  status: 'needs-setup' | 'checking' | 'ready' | 'fallback'
  provider: 'ollama' | 'fallback'
  desiredModel: string
  endpoint: string
  lastCheckedAt?: string
  note?: string
}

export interface PetOnboardingState {
  currentStep: PetOnboardingStep
  completedSteps: PetOnboardingStep[]
  finishedAt?: string
}

export interface PetCompanionSurfaces {
  activeTab: 'overview' | 'reminders' | 'care' | 'grow' | 'diary' | 'settings'
}

export interface PetSystemState {
  vacationMode: boolean
  bossModeEnabled: boolean
  nestModeEnabled: boolean
  // Strong-reminder mode. The visible inverse of vacation/boss/nest:
  // when on, every meaningful coding event (not just task-failed /
  // build-fail / test-fail / task-done) fires the OS-level strong
  // reminder pipeline (teleport pet to active monitor + silent OS
  // notification). We persist a separate flag rather than treating
  // "no quiet mode" as implicitly strong because the user explicitly
  // asked for "强提醒" as its own switch — see `shouldFireStrongReminder`
  // and the chip in PanelWindowShell. Optional in the type so older
  // saves don't error on load; pet-memory.ts coerces missing -> false.
  strongReminderEnabled?: boolean
  // Phase A sticker bookkeeping. Persisted so cross-restart dedup works
  // and so the morning sticker only fires once per local day.
  stickerHistory?: import('./sticker').PetStickerHistory
  // When enabled, panel exposes debug/authoring controls (render path,
  // placement editor, mesh outlines). Optional for backward compatibility;
  // missing value is treated as false in migration.
  developerModeEnabled?: boolean
}

// Predefined typed fact keys. Predefined keys carry stable units and unlock
// numeric trend comparisons; LLM-proposed open keys (anything else) are
// allowed too but get string-only handling.
export type PetPredefinedFactKey =
  | 'body.weight'           // unit: kg
  | 'body.height'           // unit: cm
  | 'health.sleepHours'     // unit: h
  | 'expense.amount'        // unit: CNY (or whichever unit user mentions)
  | 'work.hours'            // unit: h
  | 'mood.score'            // unit: 1-10

export interface PetFactRecord {
  id: string
  key: string                    // predefined key OR LLM-proposed open key
  // Numeric values unlock delta/trend comparison; strings store as-is.
  value: number | string
  unit?: string
  ts: string                     // ISO timestamp this fact was observed
  source: 'user-said' | 'inferred' | 'pet-asked'
  confidence?: number            // 0..1
  raw?: string                   // original utterance snippet for traceability
}

export interface PetFactLedger {
  records: PetFactRecord[]
  // Per-key opt-out. Missing entry = enabled (default on for newly seen keys).
  trackable: Record<string, boolean>
  // Stamp of the last LLM-driven proactive recall, used to throttle the
  // "你最近都没说体重" type nudges to at most once every few hours.
  lastProactiveRecallAt?: string
}

export interface PetMemory {
  profile: UserProfileMemory
  preferences: UserPreferenceMemory[]
  working: PetWorkingMemory
  daily: PetDailySummary[]
  bond: BondMemory
  relationship: PetRelationshipMemory
  reminderStrategy: ReminderStrategyMemory
  companionPreferences: CompanionPreferenceMemory
  aiSetup: PetAiSetupState
  events: EventMemory[]
  facts: PetFactLedger
  traits: {
    energy: number
    bond: number
    talkative: number
    playful: number
    routine: number
    summary: string
  }
}

export interface PetUiState {
  panelOpen: boolean
  language?: PetLanguage
  position?: WindowPosition
  onboardingCompleted?: boolean
  onboarding: PetOnboardingState
  companionSurfaces: PetCompanionSurfaces
  system: PetSystemState
  // The currently-focused item id. With multi-slot equipment this no longer
  // means "the only thing equipped" — it means "the item the alignment
  // editor is currently showing controls for". Equipping always sets it,
  // unequipping clears it (or moves it to another equipped item if any).
  wardrobeSelection?: string
  wardrobeUnlocked?: string[]
  // Multi-slot equipment map. Keyed by WardrobeSlot. One item per slot
  // maximum; equipping a second hat replaces the first hat but leaves
  // back/neck/etc. alone. Migration-on-load fills this from a non-empty
  // wardrobeSelection if the id resolves to a manifest entry.
  wardrobeEquipped?: import('./wardrobe').WardrobeEquippedMap
  // Selected visual variant per item id, e.g.:
  //   { "hat-baseball-cap": "v2" }
  // so the same drawn item keeps the same look across reopen/restart.
  wardrobeVariantByItem?: Record<string, string>
  // Selected generated-pet sprite variant per species id, e.g.:
  //   { "prompt-17": "v2" }
  // so one prompt can ship multiple generated images while each user's pet
  // keeps the randomly assigned look after selection.
  speciesVariantBySpecies?: Record<string, string>
  speciesChangedAt?: string
  // Per-species placement overrides for wardrobe items. Keyed by species id
  // first, then by item id. Missing entries fall back to DEFAULT_PLACEMENT
  // (centred, original size, no rotation). See src/types/wardrobe.ts.
  wardrobePlacements?: import('./wardrobe').WardrobePlacementMap
  cutoutPlacementsByAppearance?: Record<string, PetCutoutPlacement[]>
  // Recent blind-box draws. Bounded by WARDROBE_DRAW_HISTORY_LIMIT. The shop
  // UI shows this list so the user can re-open the alignment editor on a
  // freshly-drawn item without scrolling the full inventory.
  wardrobeDrawHistory?: import('./wardrobe').WardrobeDrawHistoryEntry[]
  showMemoryEditor?: boolean
}

export interface PetData {
  personality: PetPersonality
  state: PetState
  memory: PetMemory
  ui: PetUiState
}

export interface PetReply {
  text: string
  action: PetAction
  moodDelta?: number
  affectionDelta?: number
  memoryWrite?: string
}

export interface PetRecentInteraction {
  type: InteractionType
  at: number
  streak: number
}

export interface PetSceneContext {
  reminderPhase: PetReminderPhase
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  recentInteraction: PetRecentInteraction | null
  now?: number
}

export interface PetSceneState {
  id: PetSceneId
  action: PetAction
  text: string
  attentionMode: PetAttentionMode
  persistent?: boolean
  reason?: string
}

export interface PetModelConfig {
  enabled: boolean
  provider: PetModelProvider
  endpoint: string
  model: string
  timeoutMs: number
}

export interface PetModelHealth {
  ok: boolean
  enabled: boolean
  provider: PetModelProvider
  endpoint: string
  model: string
  latencyMs?: number
  error?: string
  availableModels?: string[]
}

export interface PetModelServiceEnsureResult {
  alreadyRunning: boolean
  attemptedStart: boolean
  connected: boolean
  launchMethod?: 'app' | 'cli'
  error?: string
}

export interface PetConversationIntent {
  kind: 'none' | 'interaction' | 'reminder' | 'memory'
  confidence?: number
  interaction?: ExecutableInteractionType
  reminder?: CreateReminderInput
  memoryUpdate?: PetMemoryUpdate
}

export interface PetBubbleContent {
  kind: PetBubbleKind
  text: string
  tone: PetBubbleTone
  emphasis?: 'low' | 'medium' | 'high'
  ttlMs?: number
  loading?: boolean
  typing?: boolean
}

export interface PetShowExpression {
  eyes: PetExpressionEyes
  mouth: PetExpressionMouth
}

export interface PetShowState {
  intent: PetShowIntent
  bubble: PetBubbleContent
  expression: PetShowExpression
  palette?: string
  overlayIds?: string[]
  animKey?: PetShowAnimKey
  // Phase A: optional sticker overlay. The sprite continues to render
  // normally underneath; the renderer composites the sticker on top with
  // its own TTL handling.
  stickerId?: string
}

export interface PetResolvedVisualState {
  palette: string
  overlayIds: string[]
  expression: PetShowExpression
  animKey: PetShowAnimKey
}

export interface PetMemoryUpdate {
  kind: PetMemoryUpdateKind
  value: string
}

// Whitelist of pet configuration knobs the agent loop is allowed to flip
// from inside a chat turn. Kept intentionally narrow: anything destructive
// (model endpoint, species, memory wipe) stays panel-only.
export type PetSettingsTarget =
  | 'palette'
  | 'wardrobe'
  | 'pet-name'
  | 'vacation-mode'
  | 'boss-mode'
  | 'nest-mode'
  // 'strong-reminder' is the user-facing inverse of the three quiet
  // modes. Setting it to "on" turns vacation/boss/nest off (mutex) and
  // flips strongReminderEnabled in PetSystemState. Setting it to "off"
  // only flips the flag back without forcing a quiet mode, so the user
  // can freely combine "no DND, no strong reminder" too.
  | 'strong-reminder'

export interface PetSettingsUpdate {
  target: PetSettingsTarget
  // Loose string by design so the LLM can return e.g. "blueberry-milk", "off",
  // "啵啵". The applier in pet-settings.ts is responsible for validating and
  // normalising before mutating PetData.
  value: string
}

// Slimmer subset of PetFactRecord that the LLM (or a deterministic extractor)
// is allowed to propose. We always assign id/ts/source-status server-side so
// the model can't backdate or spoof events.
export interface PetFactInput {
  key: string
  value: number | string
  unit?: string
  confidence?: number
  raw?: string
}

export type PetConversationLoopStep =
  | { kind: 'memory-update'; memoryUpdate: PetMemoryUpdate }
  | { kind: 'interaction'; interaction: ExecutableInteractionType }
  | { kind: 'create-reminder'; reminder: CreateReminderInput }
  | { kind: 'set-scene-hint'; sceneId: PetSceneId }
  | { kind: 'show.set-intent'; show: PetShowState }
  | { kind: 'settings-update'; settingsUpdate: PetSettingsUpdate }
  | { kind: 'record-fact'; fact: PetFactInput }

export interface PetConversationStreamCallbacks {
  onBubbleText?: (text: string) => void
}

export interface PetConversationLoopPlan {
  reply: Pick<PetGeneratedReply, 'text' | 'action' | 'toneTags' | 'memoryHint' | 'memoryImportance' | 'memoryCategory' | 'show'>
  steps: PetConversationLoopStep[]
  source: 'model' | 'fallback'
}

// One row of compact, model-readable fact context. Built by the runtime
// adapter when the user message touches a fact key the pet has seen before;
// the model consumes these rows to ground its reply in actual history rather
// than guessing.
export interface PetFactContextLine {
  // Display key (predefined or open-namespace).
  key: string
  // Latest known value (with unit, e.g. "62 kg").
  current: string
  // Previous value with relative timing, e.g. "60 kg, 3 天前".
  previous?: string
  // Signed delta string for numeric facts, e.g. "+2 kg" / "-0.5 h".
  delta?: string
  trend?: 'up' | 'down' | 'same'
  // True when this is the first time the pet sees this key (no comparison
  // available, but worth telling the model "this is new").
  isFirstTime?: boolean
}

export interface PetPromptContext {
  kind: PetGenerationKind
  language: PetLanguage
  sceneId: PetSceneId
  interactionType?: InteractionType
  userInput?: string
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  recentInteraction?: PetRecentInteraction | null
  summaryTarget?: PetSummaryTarget
  // Optional fact-comparison rows produced by the runtime adapter when the
  // user mentions a tracked numeric/string fact. The model is expected to
  // weave these naturally into its reply ("比前天还重了 2kg 哦").
  factContext?: PetFactContextLine[]
  // Optional proactive-recall payload, set when the runtime is intentionally
  // nudging the LLM to bring up something the user hasn't mentioned for a
  // while. Mutually exclusive with normal chat turns.
  factRecall?: {
    key: string
    latest: string
    daysSince: number
  }
  pet: PetData
}

export interface PetGenerationRequest {
  context: PetPromptContext
}

export interface PetGeneratedReply {
  text: string
  action: PetAction
  toneTags?: string[]
  memoryHint?: string
  // Optional explicit importance for the memory hint. When the LLM sets
  // memoryImportance=3 the resulting EventMemory is "pinned" by the tier
  // eviction policy in addEventMemory and survives much longer than chatter.
  memoryImportance?: 1 | 2 | 3
  // Optional categorisation that drives weekly rollups + future timeline UI.
  memoryCategory?: PetEventCategory
  summary?: string
  intent?: PetConversationIntent
  show?: PetShowState
  source: 'model' | 'fallback'
}
