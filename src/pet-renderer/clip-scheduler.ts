import type { PetMotionProfile } from '../types/pet'
import type { Clip, ClipChain, ClipFrame, EasingFn, OneShotClipState, PetAnimationManifest, SpriteOverlayState } from '../types/pet-animation'

export type { Clip, ClipChain, ClipFrame, EasingFn, OneShotClipState, PetAnimationManifest, ProceduralClip, SpriteClip, SpriteOverlayState, SpriteTextureSet } from '../types/pet-animation'

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
export const easeInOut: EasingFn = (value) => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

export const getClipDurationMs = (clip: Clip) => clip.kind === 'sprite'
  ? clip.frameCount * clip.frameMs
  : clip.durationMs

const chainDurationMs = (chain: ClipChain, clips: Record<string, Clip>) => chain.sequence.reduce((sum, clipName) => {
  const clip = clips[clipName]
  return sum + (clip ? getClipDurationMs(clip) : 0)
}, 0)

const weightedIndex = (clips: Clip[], seed: number) => {
  const total = clips.reduce((sum, clip) => sum + Math.max(0, clip.weight ?? 1), 0)
  if (total <= 0) return 0

  let cursor = ((Math.sin(seed * 9301 + 49297) + 1) / 2) * total
  for (let i = 0; i < clips.length; i += 1) {
    cursor -= Math.max(0, clips[i].weight ?? 1)
    if (cursor <= 0) return i
  }
  return clips.length - 1
}

export const pickWeightedClipName = (clipNames: string[], clips: Record<string, Clip>, seed: number) => {
  const candidates = clipNames.map((name) => clips[name]).filter((clip): clip is Clip => Boolean(clip))
  if (candidates.length === 0) return clipNames[0]
  return candidates[weightedIndex(candidates, seed)].name
}

export const resolveClipFrame = (
  manifest: Pick<PetAnimationManifest, 'clips' | 'chains'>,
  chainId: string,
  startedAtMs: number,
  nowMs: number
): ClipFrame | null => {
  const chain = manifest.chains[chainId]
  if (!chain || chain.sequence.length === 0) return null

  const totalDuration = Math.max(1, chainDurationMs(chain, manifest.clips))
  const rawElapsed = Math.max(0, nowMs - startedAtMs)
  const elapsedInChain = chain.mode === 'once' ? Math.min(rawElapsed, totalDuration) : rawElapsed % totalDuration
  const complete = chain.mode === 'once' && rawElapsed >= totalDuration

  let cursor = 0
  for (let index = 0; index < chain.sequence.length; index += 1) {
    const clipName = chain.sequence[index]
    const clip = manifest.clips[clipName]
    if (!clip) continue

    const duration = Math.max(1, getClipDurationMs(clip))
    const clipEnd = cursor + duration
    if (elapsedInChain <= clipEnd || index === chain.sequence.length - 1) {
      const elapsedMs = Math.min(duration, Math.max(0, elapsedInChain - cursor))
      const rawProgress = elapsedMs / duration
      return {
        clip,
        chainId,
        clipIndex: index,
        elapsedMs,
        progress: clip.kind === 'procedural' && clip.easing ? clip.easing(rawProgress) : rawProgress,
        complete
      }
    }
    cursor = clipEnd
  }

  const fallbackName = chain.sequence[0]
  const fallback = manifest.clips[fallbackName]
  return fallback ? { clip: fallback, chainId, clipIndex: 0, elapsedMs: 0, progress: 0, complete } : null
}

export const resolveProceduralProfile = (
  baseProfile: PetMotionProfile,
  frame: ClipFrame | null
): PetMotionProfile => {
  if (!frame || frame.clip.kind !== 'procedural') return baseProfile
  return { ...baseProfile, ...frame.clip.profile }
}

export const pushOverlayClip = (clipName: string, nowMs: number): OneShotClipState => ({
  clipName,
  startedAtMs: nowMs
})

export const resolveProceduralOverlayProfile = (
  baseProfile: PetMotionProfile,
  manifest: Pick<PetAnimationManifest, 'clips'>,
  state: OneShotClipState | null,
  nowMs: number
): { profile: PetMotionProfile; complete: boolean } => {
  if (!state) return { profile: baseProfile, complete: false }
  const clip = manifest.clips[state.clipName]
  if (!clip || clip.kind !== 'procedural') return { profile: baseProfile, complete: true }

  const elapsedMs = Math.max(0, nowMs - state.startedAtMs)
  const durationMs = Math.max(1, getClipDurationMs(clip))
  return {
    profile: { ...baseProfile, ...clip.profile },
    complete: elapsedMs >= durationMs
  }
}

export const resolveSpriteOverlay = (
  manifest: Pick<PetAnimationManifest, 'clips'>,
  state: OneShotClipState | null,
  nowMs: number
): SpriteOverlayState | null => {
  if (!state) return null
  const clip = manifest.clips[state.clipName]
  if (!clip || clip.kind !== 'sprite') return null

  const elapsedMs = Math.max(0, nowMs - state.startedAtMs)
  const durationMs = Math.max(1, getClipDurationMs(clip))
  return {
    clip,
    elapsedMs,
    frameIndex: Math.min(clip.frameCount - 1, Math.floor(elapsedMs / Math.max(1, clip.frameMs))),
    complete: elapsedMs >= durationMs
  }
}
