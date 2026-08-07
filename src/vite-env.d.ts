/// <reference types="vite/client" />

import type { PetPlatformApi } from './platform/pet-platform'

type PetReminderIntensity = 'low' | 'medium' | 'high'

interface ReminderItem {
  id: string
  title: string
  scheduledAt: string
  createdAt: string
  status: 'pending' | 'done' | 'missed'
  snoozeUntil?: string
  intensity?: PetReminderIntensity
}

interface CreateReminderInput {
  title: string
  scheduledAt: string
  intensity?: PetReminderIntensity
}

interface PetModelConfig {
  enabled: boolean
  provider: 'ollama'
  endpoint: string
  model: string
  timeoutMs: number
}

interface PetModelHealth {
  ok: boolean
  enabled: boolean
  provider: 'ollama'
  endpoint: string
  model: string
  latencyMs?: number
  error?: string
  availableModels?: string[]
}

interface PetModelServiceEnsureResult {
  alreadyRunning: boolean
  attemptedStart: boolean
  connected: boolean
  launchMethod?: 'app' | 'cli'
  error?: string
}

interface PetConversationIntent {
  kind: 'none' | 'interaction' | 'reminder' | 'memory'
  confidence?: number
  interaction?: 'feed' | 'pet' | 'sleep' | 'wake' | 'drink' | 'bath' | 'hold'
  reminder?: CreateReminderInput
  memoryUpdate?: {
    kind: 'preferred-name' | 'like' | 'dislike' | 'habit' | 'address-style' | 'focus-support' | 'comfort-topic' | 'reminder-preference'
    value: string
  }
}

interface PetConversationLoopStep {
  kind: 'memory-update' | 'interaction' | 'create-reminder' | 'set-scene-hint'
  memoryUpdate?: {
    kind: 'preferred-name' | 'like' | 'dislike' | 'habit' | 'address-style' | 'focus-support' | 'comfort-topic' | 'reminder-preference'
    value: string
  }
  interaction?: 'feed' | 'pet' | 'sleep' | 'wake' | 'drink' | 'bath' | 'hold'
  reminder?: CreateReminderInput
  sceneId?: 'idle' | 'focus' | 'lonely' | 'hungry' | 'sleepy' | 'sleeping' | 'wake-up' | 'pet-react' | 'excited' | 'reminder-soon' | 'reminder-alert' | 'reminder-done'
}

interface PetBubbleContent {
  kind: 'speech' | 'thought' | 'dream'
  text: string
  tone: 'soft' | 'warm' | 'playful' | 'alert'
  emphasis?: 'low' | 'medium' | 'high'
  ttlMs?: number
}

interface PetShowState {
  intent: 'companionship' | 'nudge' | 'celebrate' | 'rest' | 'dream'
  bubble: PetBubbleContent
  expression: {
    eyes: 'neutral' | 'soft' | 'smile' | 'sleepy' | 'sparkle' | 'alert'
    mouth: 'neutral' | 'smile' | 'open' | 'pout' | 'sleepy'
  }
  palette?: string
  overlayIds?: string[]
  animKey?: 'idle' | 'nudge' | 'bounce' | 'blush' | 'sleep' | 'alert'
}

interface PetConversationLoopPlan {
  reply: {
    text: string
    action: 'idle' | 'happy' | 'sleepy' | 'hungry' | 'talking' | 'blush' | 'alert'
    toneTags?: string[]
    memoryHint?: string
    show?: PetShowState
  }
  steps: PetConversationLoopStep[]
  source: 'model' | 'fallback'
}

interface PetGeneratedReply {
  text: string
  action: 'idle' | 'happy' | 'sleepy' | 'hungry' | 'talking' | 'blush' | 'alert'
  toneTags?: string[]
  memoryHint?: string
  summary?: string
  intent?: PetConversationIntent
  show?: PetShowState
  source: 'model' | 'fallback'
}

interface PetApi {
  loadPet: () => Promise<unknown>
  savePet: (data: unknown) => Promise<boolean>
  dragWindow: (position: { x: number; y: number }) => void
  persistWindowPosition: (position: { x: number; y: number }) => void
  setDockHover: (hovering: boolean) => void
  togglePanel: (open: boolean) => void
  onTrayAction: (callback: (action: string) => void) => () => void
  loadReminders: () => Promise<ReminderItem[]>
  createReminder: (input: CreateReminderInput) => Promise<ReminderItem>
  completeReminder: (id: string) => Promise<boolean>
  snoozeReminder: (id: string, minutes: number) => Promise<ReminderItem | null>
  onReminderTrigger: (callback: (reminder: ReminderItem) => void) => () => void
  loadModelConfig: () => Promise<PetModelConfig>
  saveModelConfig: (config: PetModelConfig) => Promise<PetModelConfig>
  checkModelHealth: () => Promise<PetModelHealth>
  ensureModelService: (config: PetModelConfig) => Promise<PetModelServiceEnsureResult>
  generatePetReply: (payload: unknown) => Promise<PetGeneratedReply>
  generateConversationLoop: PetPlatformApi['generateConversationLoop']
  loadDomainState: (key: string) => Promise<unknown>
  saveDomainState: (key: string, data: unknown) => Promise<unknown>
}

declare global {
  interface Window {
    petApi: PetPlatformApi
  }
}

export {}
