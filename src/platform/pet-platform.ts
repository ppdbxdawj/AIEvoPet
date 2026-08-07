import { tauriPlatform } from './tauri-platform'
import type {
  CalendarEventWriteInput,
  CalendarEventWriteResult,
  CreateReminderInput,
  PetCodingEvent,
  PetCodingEventIngestResult,
  PetConversationLoopPlan,
  PetConversationStreamCallbacks,
  PetGeneratedReply,
  PetModelConfig,
  PetModelHealth,
  PetModelServiceEnsureResult,
  ReminderItem,
  WindowPosition,
  PetHitRegion,
  PetWindowBounds,
  PetWindowTeleported,
  WalkTick,
  PetLanguage
} from '../types/pet'
import type { DomainStateEnvelope, DomainStateKey, DomainStateMap } from '../types/domain'
import type { PetDiaryActivityStats, PetDiaryGitStats, PetDiaryLedger } from '../types/diary'
import type { ImportedPetPackage } from '../types/pet-package'

export interface CreateUserPetFromImageInput {
  name: string
  fileName: string
  imageBase64: string
}

export interface PetPlatformApi {
  getCurrentWindowLabel: () => string | undefined
  loadPet: () => Promise<unknown>
  savePet: (data: unknown) => Promise<boolean>
  dragWindow: (position: WindowPosition) => void
  persistWindowPosition: (position: WindowPosition) => void
  setDockHover: (hovering: boolean) => void
  togglePanel: (open: boolean) => void
  setPetHitRegion: (region: PetHitRegion) => void
  setPetWindowBounds: (bounds: PetWindowBounds) => void
  interruptWalk: () => void
  // Strong-reminder helpers for high-importance coding events (task done /
  // task failed / build fail / test fail). They live on the platform layer
  // because they need to talk to the OS window manager (multi-monitor
  // teleport) and the OS notification centre — both Tauri-only paths.
  bringPetToActiveMonitor: () => void
  notifyUserStrong: (input: { title: string; body: string }) => void
  onTrayAction: (callback: (action: string) => void) => () => void
  onPetUpdated: (callback: (pet: unknown) => void) => () => void
  onRemindersUpdated: (callback: (reminders: ReminderItem[]) => void) => () => void
  onWalkTick: (callback: (tick: WalkTick) => void) => () => void
  onCodingEvent: (callback: (event: PetCodingEvent) => void) => () => void
  onPetWindowTeleported: (callback: (payload: PetWindowTeleported) => void) => () => void
  loadReminders: () => Promise<ReminderItem[]>
  createReminder: (input: CreateReminderInput) => Promise<ReminderItem>
  writeCalendarEvent: (input: CalendarEventWriteInput) => Promise<CalendarEventWriteResult>
  emitCodingEvent: (event: PetCodingEvent) => Promise<PetCodingEventIngestResult>
  completeReminder: (id: string) => Promise<boolean>
  snoozeReminder: (id: string, minutes: number) => Promise<ReminderItem | null>
  onReminderTrigger: (callback: (reminder: ReminderItem) => void) => () => void
  loadModelConfig: () => Promise<PetModelConfig>
  saveModelConfig: (config: PetModelConfig) => Promise<PetModelConfig>
  checkModelHealth: () => Promise<PetModelHealth>
  ensureModelService: (config: PetModelConfig) => Promise<PetModelServiceEnsureResult>
  generatePetReply: (payload: unknown) => Promise<PetGeneratedReply>
  generateConversationLoop: (payload: unknown, callbacks?: PetConversationStreamCallbacks) => Promise<PetConversationLoopPlan>
  // Blind-box wardrobe pick. Resolves to { id, reason } where id MUST be one
  // of the ids in payload.pool, otherwise the caller falls back to the
  // deterministic weighted random. Returns null when the model is disabled
  // or unavailable so the caller can use its fallback path immediately.
  selectWardrobeItem: (payload: {
    pool: Array<{
      id: string
      nameZh: string
      nameEn?: string
      category: string
      slot: string
      moodTags: string[]
      priceBand: string
      price: number
      description: string
      descriptionEn?: string
    }>
    context: {
      petName?: string
      preferredName?: string
      moodScore?: number
      moodTags?: string[]
      closeness?: number
      stage?: string
      weeklySummary?: string
      budget?: number
      unlockedIds?: string[]
      language?: PetLanguage
    }
  }) => Promise<{ id: string; reason: string } | null>
  loadDomainState: <T extends DomainStateKey>(key: T) => Promise<DomainStateEnvelope<DomainStateMap[T]>>
  saveDomainState: <T extends DomainStateKey>(key: T, data: DomainStateEnvelope<DomainStateMap[T]>) => Promise<DomainStateEnvelope<DomainStateMap[T]>>
  saveShareCard: (bytes: Uint8Array, prefix?: string) => Promise<string>
  revealInFileManager: (path: string) => Promise<boolean>
  // Single-file dump used by the panel "导出全部到磁盘" button. Caller
  // serialises the payload (pet + domains + diary) before invoking; we
  // keep the platform interface dumb so future schema changes don't
  // ripple through Rust.
  writePetSnapshot: (payload: string) => Promise<{ filePath: string }>
  // Diary persistence + collectors. The Tauri backend reconciles append-only
  // semantics (sealed days never get rewritten) so every JS-side mutation
  // round-trips through saveDiary even when the local copy looks complete.
  loadDiary: () => Promise<PetDiaryLedger | null>
  saveDiary: (data: PetDiaryLedger) => Promise<PetDiaryLedger>
  setActivityTracking: (enabled: boolean) => Promise<boolean>
  getActiveMinutes: (date: string) => Promise<PetDiaryActivityStats>
  getGitDiaryStats: (paths: string[], sinceIso: string, untilIso: string) => Promise<PetDiaryGitStats>
  onDiaryUpdated: (callback: (ledger: PetDiaryLedger) => void) => () => void
  // Local Petdex packages. listUserPetPackages returns sanitized package
  // records from <data_dir>/pets/, with image paths converted to data URLs.
  // openUserPetDir pops the OS file manager at that directory.
  listUserPetPackages: () => Promise<ImportedPetPackage[]>
  openUserPetDir: () => Promise<string>
  createUserPetFromImage: (input: CreateUserPetFromImageInput) => Promise<ImportedPetPackage>
  // A6: user-supplied wardrobe overrides. listUserWardrobeAssets returns
  // pairs of (item-id, data-url) for every PNG/JPG/WEBP/SVG in
  // <data_dir>/wardrobe/. openUserWardrobeDir pops the OS file manager
  // at that directory so users can drop their own art in.
  listUserWardrobeAssets: () => Promise<Array<[string, string]>>
  openUserWardrobeDir: () => Promise<string>
  captureScreenText: () => Promise<{
    supported: boolean
    platform: string
    text: string
    lineCount: number
    screenshotPath?: string
    error?: string
  }>
}

const missingPlatformMethod = (method: string) => {
  throw new Error(`Pet platform API is unavailable: ${method}`)
}

const missingPlatform: PetPlatformApi = {
  getCurrentWindowLabel: () => undefined,
  loadPet: async () => missingPlatformMethod('loadPet'),
  savePet: async () => missingPlatformMethod('savePet'),
  dragWindow: () => missingPlatformMethod('dragWindow'),
  persistWindowPosition: () => missingPlatformMethod('persistWindowPosition'),
  setDockHover: () => missingPlatformMethod('setDockHover'),
  togglePanel: () => missingPlatformMethod('togglePanel'),
  setPetHitRegion: () => missingPlatformMethod('setPetHitRegion'),
  setPetWindowBounds: () => missingPlatformMethod('setPetWindowBounds'),
  interruptWalk: () => missingPlatformMethod('interruptWalk'),
  bringPetToActiveMonitor: () => undefined,
  notifyUserStrong: () => undefined,
  onTrayAction: () => missingPlatformMethod('onTrayAction'),
  onPetUpdated: () => missingPlatformMethod('onPetUpdated'),
  onRemindersUpdated: () => missingPlatformMethod('onRemindersUpdated'),
  onWalkTick: () => missingPlatformMethod('onWalkTick'),
  onCodingEvent: () => missingPlatformMethod('onCodingEvent'),
  onPetWindowTeleported: () => missingPlatformMethod('onPetWindowTeleported'),
  loadReminders: async () => missingPlatformMethod('loadReminders'),
  createReminder: async () => missingPlatformMethod('createReminder'),
  writeCalendarEvent: async () => missingPlatformMethod('writeCalendarEvent'),
  emitCodingEvent: async () => missingPlatformMethod('emitCodingEvent'),
  completeReminder: async () => missingPlatformMethod('completeReminder'),
  snoozeReminder: async () => missingPlatformMethod('snoozeReminder'),
  onReminderTrigger: () => missingPlatformMethod('onReminderTrigger'),
  loadModelConfig: async () => missingPlatformMethod('loadModelConfig'),
  saveModelConfig: async () => missingPlatformMethod('saveModelConfig'),
  checkModelHealth: async () => missingPlatformMethod('checkModelHealth'),
  ensureModelService: async () => missingPlatformMethod('ensureModelService'),
  generatePetReply: async () => missingPlatformMethod('generatePetReply'),
  generateConversationLoop: async () => missingPlatformMethod('generateConversationLoop'),
  selectWardrobeItem: async () => null,
  loadDomainState: async () => missingPlatformMethod('loadDomainState'),
  saveDomainState: async () => missingPlatformMethod('saveDomainState'),
  saveShareCard: async () => missingPlatformMethod('saveShareCard'),
  revealInFileManager: async () => missingPlatformMethod('revealInFileManager'),
  writePetSnapshot: async () => missingPlatformMethod('writePetSnapshot'),
  loadDiary: async () => missingPlatformMethod('loadDiary'),
  saveDiary: async () => missingPlatformMethod('saveDiary'),
  setActivityTracking: async () => missingPlatformMethod('setActivityTracking'),
  getActiveMinutes: async () => missingPlatformMethod('getActiveMinutes'),
  getGitDiaryStats: async () => missingPlatformMethod('getGitDiaryStats'),
  onDiaryUpdated: () => missingPlatformMethod('onDiaryUpdated'),
  listUserPetPackages: async () => [],
  openUserPetDir: async () => missingPlatformMethod('openUserPetDir'),
  createUserPetFromImage: async () => missingPlatformMethod('createUserPetFromImage'),
  listUserWardrobeAssets: async () => [],
  openUserWardrobeDir: async () => missingPlatformMethod('openUserWardrobeDir'),
  captureScreenText: async () => ({
    supported: false,
    platform: typeof navigator !== 'undefined' ? navigator.platform || 'web' : 'web',
    text: '',
    lineCount: 0,
    error: 'Screen awareness is only available in the desktop app.'
  })
}

const resolvePlatform = (): PetPlatformApi => {
  if (typeof window === 'undefined') return missingPlatform

  const globalPetApi = (window as typeof window & { petApi?: PetPlatformApi }).petApi
  if (globalPetApi) return globalPetApi

  const runtimeWindow = window as typeof window & {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }

  return runtimeWindow.__TAURI_INTERNALS__ || runtimeWindow.__TAURI__
    ? tauriPlatform
    : missingPlatform
}

export const petPlatform: PetPlatformApi = {
  getCurrentWindowLabel: () => resolvePlatform().getCurrentWindowLabel(),
  loadPet: () => resolvePlatform().loadPet(),
  savePet: (data) => resolvePlatform().savePet(data),
  dragWindow: (position) => resolvePlatform().dragWindow(position),
  persistWindowPosition: (position) => resolvePlatform().persistWindowPosition(position),
  setDockHover: (hovering) => resolvePlatform().setDockHover(hovering),
  togglePanel: (open) => resolvePlatform().togglePanel(open),
  setPetHitRegion: (region) => resolvePlatform().setPetHitRegion(region),
  setPetWindowBounds: (bounds) => resolvePlatform().setPetWindowBounds(bounds),
  interruptWalk: () => resolvePlatform().interruptWalk(),
  bringPetToActiveMonitor: () => resolvePlatform().bringPetToActiveMonitor(),
  notifyUserStrong: (input) => resolvePlatform().notifyUserStrong(input),
  onTrayAction: (callback) => resolvePlatform().onTrayAction(callback),
  onPetUpdated: (callback) => resolvePlatform().onPetUpdated(callback),
  onRemindersUpdated: (callback) => resolvePlatform().onRemindersUpdated(callback),
  onWalkTick: (callback) => resolvePlatform().onWalkTick(callback),
  onCodingEvent: (callback) => resolvePlatform().onCodingEvent(callback),
  onPetWindowTeleported: (callback) => resolvePlatform().onPetWindowTeleported(callback),
  loadReminders: () => resolvePlatform().loadReminders(),
  createReminder: (input) => resolvePlatform().createReminder(input),
  writeCalendarEvent: (input) => resolvePlatform().writeCalendarEvent(input),
  emitCodingEvent: (event) => resolvePlatform().emitCodingEvent(event),
  completeReminder: (id) => resolvePlatform().completeReminder(id),
  snoozeReminder: (id, minutes) => resolvePlatform().snoozeReminder(id, minutes),
  onReminderTrigger: (callback) => resolvePlatform().onReminderTrigger(callback),
  loadModelConfig: () => resolvePlatform().loadModelConfig(),
  saveModelConfig: (config) => resolvePlatform().saveModelConfig(config),
  checkModelHealth: () => resolvePlatform().checkModelHealth(),
  ensureModelService: (config) => resolvePlatform().ensureModelService(config),
  generatePetReply: (payload) => resolvePlatform().generatePetReply(payload),
  generateConversationLoop: (payload, callbacks) => resolvePlatform().generateConversationLoop(payload, callbacks),
  selectWardrobeItem: (payload) => resolvePlatform().selectWardrobeItem(payload),
  loadDomainState: <T extends DomainStateKey>(key: T) => resolvePlatform().loadDomainState(key),
  saveDomainState: <T extends DomainStateKey>(key: T, data: DomainStateEnvelope<DomainStateMap[T]>) => resolvePlatform().saveDomainState(key, data),
  saveShareCard: (bytes: Uint8Array, prefix?: string) => resolvePlatform().saveShareCard(bytes, prefix),
  revealInFileManager: (path: string) => resolvePlatform().revealInFileManager(path),
  writePetSnapshot: (payload: string) => resolvePlatform().writePetSnapshot(payload),
  loadDiary: () => resolvePlatform().loadDiary(),
  saveDiary: (data) => resolvePlatform().saveDiary(data),
  setActivityTracking: (enabled) => resolvePlatform().setActivityTracking(enabled),
  getActiveMinutes: (date) => resolvePlatform().getActiveMinutes(date),
  getGitDiaryStats: (paths, sinceIso, untilIso) => resolvePlatform().getGitDiaryStats(paths, sinceIso, untilIso),
  onDiaryUpdated: (callback) => resolvePlatform().onDiaryUpdated(callback),
  listUserPetPackages: () => resolvePlatform().listUserPetPackages(),
  openUserPetDir: () => resolvePlatform().openUserPetDir(),
  createUserPetFromImage: (input) => resolvePlatform().createUserPetFromImage(input),
  listUserWardrobeAssets: () => resolvePlatform().listUserWardrobeAssets(),
  openUserWardrobeDir: () => resolvePlatform().openUserWardrobeDir(),
  captureScreenText: () => resolvePlatform().captureScreenText()
}
