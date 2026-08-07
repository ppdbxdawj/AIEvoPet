import type { PetMotionProfile } from './pet'

export type EasingFn = (value: number) => number

export interface ProceduralClip {
  kind: 'procedural'
  name: string
  profile: Partial<PetMotionProfile>
  durationMs: number
  easing?: EasingFn
  weight?: number
}

export interface SpriteClip {
  kind: 'sprite'
  name: string
  textureSetId: string
  frameCount: number
  frameMs: number
  blockBase?: boolean
  weight?: number
}

export type Clip = ProceduralClip | SpriteClip
export type ChainMode = 'loop' | 'once' | 'idleFallback'

export interface ClipChain {
  mode: ChainMode
  sequence: string[]
}

export interface SpriteTextureSet {
  id: string
  frames: string[]
  width?: number
  height?: number
}

export interface SpriteAtlasRow {
  row: number
  frames: number
  frameMs?: number
}

export interface PetAnimationManifest {
  version: 1
  baseProfile?: Partial<PetMotionProfile>
  clips: Record<string, Clip>
  chains: Record<string, ClipChain>
  events?: Record<string, string>
  idleSlowdown?: number
  emoteSheetPath?: string
  emoteAtlas?: {
    rows: Record<string, SpriteAtlasRow>
    cellWidth?: number
    cellHeight?: number
    columns?: number
  }
  spriteTextureSets?: Record<string, SpriteTextureSet>
}

export interface SpriteOverlayState {
  clip: SpriteClip
  frameIndex: number
  elapsedMs: number
  complete: boolean
}

export interface ClipFrame {
  clip: Clip
  chainId: string
  clipIndex: number
  elapsedMs: number
  progress: number
  complete: boolean
}

export interface OneShotClipState {
  clipName: string
  startedAtMs: number
}
