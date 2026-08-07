import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type {
  PetAction,
  PetBlinkMode,
  PetCutoutPlacement,
  PetLeanDirection,
  PetMotionLevel,
  PetMotionProfile,
  PetMotionTempo,
  PetMotionWeight,
  PetResolvedVisualState,
  PetShowExpression,
  PetStage,
  PetSpecies,
  PetLanguage
} from '../types/pet'
import type { WardrobeItem, WardrobePlacement } from '../types/wardrobe'
import { getAppearanceAsset } from '../assets/pet/appearance-registry'
import type { ClipChain, OneShotClipState, PetAnimationManifest, ProceduralClip } from '../types/pet-animation'
import { easeInOut, pushOverlayClip, resolveClipFrame, resolveProceduralOverlayProfile, resolveProceduralProfile } from '../pet-renderer/clip-scheduler'
import { PetCutoutCanvas } from './PetCutoutCanvas'
import { PetMeshCanvas } from './PetMeshCanvas'
import './PetCanvas.css'

export type PetRendererMode = 'mesh' | 'cutout'

// One renderable wardrobe instance: the registry entry plus where the user
// (or DEFAULT_PLACEMENT) wants it positioned for this species. The canvas
// just paints what it's given — selection / placement lookup happens upstream.
export interface PetWardrobeOverlayItem {
  item: WardrobeItem
  placement: WardrobePlacement
}

export type PetHeadCueKind = 'sleepy' | 'hungry' | 'work' | 'earn' | 'spend' | 'hint'

export interface PetHeadCue {
  kind: PetHeadCueKind
  label: string
}

interface PetCanvasProps {
  action: PetAction
  isSleeping: boolean
  showDebug: boolean
  rendererMode: PetRendererMode
  species: PetSpecies
  stage: PetStage
  appearanceVariantKey?: string
  appearanceResetKey?: string
  placements?: PetCutoutPlacement[]
  leanDirection?: PetLeanDirection
  leanAmount?: PetMotionLevel
  visualState?: PetResolvedVisualState
  // Wardrobe overlays to paint above the sprite. May include an item with no
  // assetUrl yet — we fall back to a labelled placeholder so the rest of the
  // pipeline (placement editing, persistence) still works before the PNG
  // arrives. See src/types/wardrobe.ts.
  wardrobeOverlays?: PetWardrobeOverlayItem[]
  // One small status marker shown above the pet head.
  // Controller decides which cue wins when several are true.
  headCue?: PetHeadCue
  language?: PetLanguage
  onPet: () => void
  onTogglePanel: () => void
  onPetDragStart?: (event: PointerEvent) => void
  onDockHoverChange: (hovering: boolean) => void
}

const createBaseMotionProfile = (
  leanDirection?: PetLeanDirection,
  leanAmount: PetMotionLevel = 'still'
): PetMotionProfile => ({
  mode: 'focus',
  blink: 'off',
  earWiggle: 'still',
  snoutPulse: 'still',
  cheekPulse: 'still',
  highlightPulse: 'still',
  tempo: 'slow',
  weight: 'light',
  sparkle: 'still',
  headBob: 'soft',
  headTilt: 'still',
  bodySquash: 'soft',
  limbBounce: 'still',
  eyeFocus: 'still',
  leanDirection,
  leanAmount
})

const proceduralClip = (
  name: string,
  profile: Partial<PetMotionProfile>,
  durationMs: number,
  weight?: number
): ProceduralClip => ({
  kind: 'procedural',
  name,
  profile,
  durationMs,
  easing: easeInOut,
  weight
})

export const petAnimationManifest: PetAnimationManifest = {
  version: 1,
  clips: {
    'idle-breathe': proceduralClip('idle-breathe', { mode: 'focus', tempo: 'slow', weight: 'light', headBob: 'soft', bodySquash: 'soft' }, 3200, 3),
    'idle-look': proceduralClip('idle-look', { mode: 'focus', blink: 'soft', tempo: 'slow', headTilt: 'soft', eyeFocus: 'soft', highlightPulse: 'soft' }, 2600, 2),
    'idle-perk': proceduralClip('idle-perk', { mode: 'bounce', blink: 'soft', earWiggle: 'soft', tempo: 'steady', headBob: 'soft', bodySquash: 'soft', eyeFocus: 'soft' }, 1800, 1),
    sleepy: proceduralClip('sleepy', { mode: 'sleepy', blink: 'sleepy', highlightPulse: 'soft', tempo: 'slow', weight: 'grounded', headBob: 'soft', headTilt: 'soft', bodySquash: 'soft', eyeFocus: 'soft' }, 4200),
    walk: proceduralClip('walk', { mode: 'bounce', blink: 'soft', earWiggle: 'soft', snoutPulse: 'soft', highlightPulse: 'soft', tempo: 'steady', weight: 'springy', headBob: 'active', headTilt: 'soft', bodySquash: 'active', limbBounce: 'active', eyeFocus: 'active' }, 1300),
    alert: proceduralClip('alert', { mode: 'alert', blink: 'alert', earWiggle: 'active', snoutPulse: 'active', highlightPulse: 'active', tempo: 'quick', weight: 'springy', sparkle: 'active', headBob: 'active', headTilt: 'active', bodySquash: 'active', limbBounce: 'active', eyeFocus: 'active' }, 950),
    happy: proceduralClip('happy', { mode: 'excited', blink: 'soft', earWiggle: 'active', snoutPulse: 'soft', cheekPulse: 'soft', highlightPulse: 'soft', tempo: 'quick', weight: 'springy', sparkle: 'active', headBob: 'active', headTilt: 'soft', bodySquash: 'active', limbBounce: 'active', eyeFocus: 'active' }, 1100),
    blush: proceduralClip('blush', { mode: 'bounce', blink: 'soft', earWiggle: 'soft', snoutPulse: 'soft', cheekPulse: 'active', highlightPulse: 'soft', tempo: 'steady', weight: 'springy', sparkle: 'soft', headBob: 'active', headTilt: 'soft', bodySquash: 'active', limbBounce: 'soft', eyeFocus: 'soft' }, 1500),
    hungry: proceduralClip('hungry', { mode: 'hungry', blink: 'soft', earWiggle: 'soft', snoutPulse: 'active', tempo: 'steady', weight: 'grounded', headBob: 'soft', headTilt: 'active', bodySquash: 'soft', limbBounce: 'soft', eyeFocus: 'soft' }, 1700),
    talking: proceduralClip('talking', { mode: 'talk', blink: 'soft', earWiggle: 'soft', snoutPulse: 'active', highlightPulse: 'soft', tempo: 'steady', weight: 'light', headBob: 'soft', headTilt: 'soft', bodySquash: 'soft', limbBounce: 'soft', eyeFocus: 'active' }, 1250),
    thinking: proceduralClip('thinking', { mode: 'thinking', blink: 'soft', earWiggle: 'soft', highlightPulse: 'soft', tempo: 'slow', weight: 'grounded', sparkle: 'soft', headBob: 'soft', headTilt: 'active', bodySquash: 'soft', eyeFocus: 'active' }, 2200),
    reviewing: proceduralClip('reviewing', { mode: 'reviewing', blink: 'soft', earWiggle: 'soft', snoutPulse: 'soft', highlightPulse: 'soft', tempo: 'steady', weight: 'light', headBob: 'soft', headTilt: 'active', bodySquash: 'soft', limbBounce: 'soft', eyeFocus: 'active' }, 1800),
    failed: proceduralClip('failed', { mode: 'failed', blink: 'alert', earWiggle: 'soft', snoutPulse: 'active', cheekPulse: 'soft', highlightPulse: 'active', tempo: 'slow', weight: 'grounded', sparkle: 'soft', headBob: 'soft', headTilt: 'active', bodySquash: 'soft', limbBounce: 'soft', eyeFocus: 'active' }, 1900),
    celebrating: proceduralClip('celebrating', { mode: 'excited', blink: 'soft', earWiggle: 'active', snoutPulse: 'soft', cheekPulse: 'soft', highlightPulse: 'active', tempo: 'quick', weight: 'springy', sparkle: 'active', headBob: 'active', headTilt: 'active', bodySquash: 'active', limbBounce: 'active', eyeFocus: 'active' }, 900),
    waiting: proceduralClip('waiting', { mode: 'waiting', blink: 'soft', earWiggle: 'soft', snoutPulse: 'soft', highlightPulse: 'soft', tempo: 'slow', weight: 'grounded', sparkle: 'soft', headBob: 'soft', headTilt: 'soft', bodySquash: 'soft', limbBounce: 'still', eyeFocus: 'active' }, 2600),
    'oneshot-hover': proceduralClip('oneshot-hover', { mode: 'bounce', blink: 'soft', earWiggle: 'active', tempo: 'quick', weight: 'springy', headBob: 'active', headTilt: 'soft', eyeFocus: 'active' }, 420),
    'oneshot-pet': proceduralClip('oneshot-pet', { mode: 'excited', blink: 'soft', cheekPulse: 'active', sparkle: 'active', tempo: 'quick', weight: 'springy', headBob: 'active', bodySquash: 'active', limbBounce: 'soft', eyeFocus: 'active' }, 620),
    'oneshot-drag': proceduralClip('oneshot-drag', { mode: 'alert', blink: 'alert', earWiggle: 'active', tempo: 'quick', weight: 'springy', headTilt: 'active', bodySquash: 'active', eyeFocus: 'active' }, 360)
  },
  chains: {
    idle: { mode: 'idleFallback', sequence: ['idle-breathe', 'idle-look', 'idle-perk', 'idle-breathe'] },
    sleepy: { mode: 'loop', sequence: ['sleepy'] },
    walk: { mode: 'loop', sequence: ['walk'] },
    alert: { mode: 'loop', sequence: ['alert'] },
    happy: { mode: 'loop', sequence: ['happy', 'idle-perk'] },
    blush: { mode: 'loop', sequence: ['blush'] },
    hungry: { mode: 'loop', sequence: ['hungry'] },
    talking: { mode: 'loop', sequence: ['talking', 'idle-look'] },
    thinking: { mode: 'loop', sequence: ['thinking', 'idle-look'] },
    reviewing: { mode: 'loop', sequence: ['reviewing', 'thinking'] },
    failed: { mode: 'loop', sequence: ['failed', 'alert'] },
    celebrating: { mode: 'loop', sequence: ['celebrating', 'happy'] },
    waiting: { mode: 'loop', sequence: ['waiting', 'idle-look'] }
  },
  events: {
    'task-start': 'thinking',
    'task-done': 'celebrating',
    'task-failed': 'failed',
    'commit-created': 'celebrating',
    'test-pass': 'celebrating',
    'test-fail': 'failed',
    'build-pass': 'celebrating',
    'build-fail': 'failed',
    'permission-request': 'waiting',
    hover: 'oneshot-hover',
    pet: 'oneshot-pet',
    drag: 'oneshot-drag'
  },
  spriteTextureSets: {}
}

export const actionToClipChain = (action: PetAction, isSleeping: boolean): ClipChain => petAnimationManifest.chains[isSleeping ? 'sleepy' : action] ?? petAnimationManifest.chains.idle

export const mapActionToMotionProfile = (
  action: PetAction,
  isSleeping: boolean,
  leanDirection?: PetLeanDirection,
  leanAmount: PetMotionLevel = 'still',
  elapsedMs = 0
): PetMotionProfile => {
  const baseProfile = createBaseMotionProfile(leanDirection, leanAmount)
  const chainId = isSleeping ? 'sleepy' : action
  const frame = resolveClipFrame(petAnimationManifest, chainId, 0, elapsedMs)
  const profile = resolveProceduralProfile(baseProfile, frame)

  return {
    ...profile,
    leanDirection,
    leanAmount: profile.leanAmount === 'still' && (isSleeping || action === 'sleepy' || action === 'walk') ? 'soft' : profile.leanAmount
  }
}

const getCurrentClipName = (chainKey: string, startedAtMs: number) => resolveClipFrame(petAnimationManifest, chainKey, startedAtMs, performance.now())?.clip.name ?? ''

const useScheduledMotionProfile = (
  action: PetAction,
  isSleeping: boolean,
  leanDirection?: PetLeanDirection,
  leanAmount: PetMotionLevel = 'still',
  overlayState?: OneShotClipState | null
) => {
  const chainKey = isSleeping ? 'sleepy' : action
  const startedAtRef = useRef(performance.now())
  const currentClipNameRef = useRef('')
  const [clipRevision, setClipRevision] = useState(0)

  useEffect(() => {
    startedAtRef.current = performance.now()
    currentClipNameRef.current = getCurrentClipName(chainKey, startedAtRef.current)
    setClipRevision((value) => value + 1)
  }, [chainKey])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextClipName = getCurrentClipName(chainKey, startedAtRef.current)
      if (nextClipName === currentClipNameRef.current) return
      currentClipNameRef.current = nextClipName
      setClipRevision((value) => value + 1)
    }, 160)
    return () => window.clearInterval(interval)
  }, [chainKey])

  return useMemo(() => {
    const nowMs = performance.now()
    const baseProfile = mapActionToMotionProfile(action, isSleeping, leanDirection, leanAmount, nowMs - startedAtRef.current)
    return resolveProceduralOverlayProfile(baseProfile, petAnimationManifest, overlayState ?? null, nowMs).profile
  }, [action, chainKey, clipRevision, isSleeping, leanAmount, leanDirection, overlayState])
}

const motionLevelClass = (prefix: string, value: PetMotionLevel) => `${prefix}-${value}`
const leanClass = (value?: PetLeanDirection) => value ? `lean-${value}` : ''
const blinkClass = (value: PetBlinkMode) => `blink-${value}`
const tempoClass = (value: PetMotionTempo) => `tempo-${value}`
const weightClass = (value: PetMotionWeight) => `weight-${value}`

const expressionClassNames = (expression: PetShowExpression) => [
  `eyes-${expression.eyes}`,
  `mouth-${expression.mouth}`
]

export function PetCanvas({ action, isSleeping, showDebug, rendererMode, species, stage, appearanceVariantKey, appearanceResetKey, placements, leanDirection, leanAmount = 'still', visualState, wardrobeOverlays, headCue, language, onPet, onTogglePanel, onPetDragStart, onDockHoverChange }: PetCanvasProps) {
  const [overlayClip, setOverlayClip] = useState<OneShotClipState | null>(null)
  const pushReactionClip = (clipName: string) => setOverlayClip(pushOverlayClip(clipName, performance.now()))
  const motionProfile = useScheduledMotionProfile(action, isSleeping, leanDirection, leanAmount, overlayClip)
  useEffect(() => {
    if (!overlayClip) return
    const clip = petAnimationManifest.clips[overlayClip.clipName]
    if (!clip) {
      setOverlayClip(null)
      return
    }
    const timeout = window.setTimeout(() => setOverlayClip(null), clip.kind === 'sprite' ? clip.frameCount * clip.frameMs : clip.durationMs)
    return () => window.clearTimeout(timeout)
  }, [overlayClip])

  const appearanceAsset = getAppearanceAsset(species, stage, appearanceVariantKey)
  const appearanceRenderKey = `${species}:${stage}:${appearanceVariantKey ?? 'default'}:${appearanceResetKey ?? 'stable'}`
  const palette = visualState?.palette ?? 'cotton-candy'
  const overlayIds = visualState?.overlayIds ?? []
  const overlayToken = overlayIds.join(' ')
  const shellClassName = [
    'pet-shell',
    isSleeping ? 'sleeping' : '',
    action,
    `stage-${stage}`,
    `palette-${palette}`,
    ...overlayIds.map((overlayId) => `wardrobe-${overlayId}`),
    `motion-${motionProfile.mode}`,
    motionLevelClass('ears', motionProfile.earWiggle),
    motionLevelClass('snout', motionProfile.snoutPulse),
    motionLevelClass('cheeks', motionProfile.cheekPulse),
    motionLevelClass('highlight', motionProfile.highlightPulse),
    motionLevelClass('sparkle', motionProfile.sparkle),
    motionLevelClass('head-bob', motionProfile.headBob),
    motionLevelClass('head-tilt', motionProfile.headTilt),
    motionLevelClass('body-squash', motionProfile.bodySquash),
    motionLevelClass('limbs', motionProfile.limbBounce),
    motionLevelClass('eyes-focus', motionProfile.eyeFocus),
    motionLevelClass('lean', motionProfile.leanAmount),
    leanClass(motionProfile.leanDirection),
    blinkClass(motionProfile.blink),
    tempoClass(motionProfile.tempo),
    weightClass(motionProfile.weight),
    headCue ? `headcue-${headCue.kind}` : '',
    headCue?.kind === 'work' ? 'headcue-work-active' : '',
    ...expressionClassNames(visualState?.expression ?? { eyes: 'neutral', mouth: 'neutral' }),
    visualState?.animKey ? `show-anim-${visualState.animKey}` : '',
    overlayToken ? 'has-overlay' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClassName}>
      <span
        className="pet-hover-capture"
        data-testid="pet-hover-capture"
        onPointerEnter={() => {
          pushReactionClip('oneshot-hover')
          onDockHoverChange(true)
        }}
        onPointerLeave={() => onDockHoverChange(false)}
        aria-hidden="true"
      />
      <button
        className="pet-body"
        data-testid="pet-body"
        onPointerDown={(event) => {
          pushReactionClip('oneshot-drag')
          onPetDragStart?.(event.nativeEvent)
        }}
        onPointerEnter={() => {
          pushReactionClip('oneshot-hover')
          onDockHoverChange(true)
        }}
        onPointerLeave={() => onDockHoverChange(false)}
        onClick={onTogglePanel}
        onDoubleClick={() => {
          pushReactionClip('oneshot-pet')
          onPet()
        }}
        aria-label={language === 'en-US' ? 'Pet the companion' : '抚摸宠物'}
      >
        <span className="pet-aura" aria-hidden="true" />
        <span className="pet-alert-ring" aria-hidden="true" />
        <span className="pet-sparkle pet-sparkle-left" aria-hidden="true" />
        <span className="pet-sparkle pet-sparkle-right" aria-hidden="true" />
        {headCue ? (
          <span className={`pet-head-cue cue-${headCue.kind}`} aria-hidden="true">{headCue.label}</span>
        ) : null}
        <span key={appearanceRenderKey} className="pet-sprite-stack" aria-hidden="true">
          {rendererMode === 'mesh' && appearanceAsset.meshRig
            ? <PetMeshCanvas rig={appearanceAsset.meshRig} motionProfile={motionProfile} placements={placements} expression={visualState?.expression} showDebug={showDebug} animationManifest={petAnimationManifest} spriteOverlay={overlayClip} />
            : <PetCutoutCanvas
                showDebug={showDebug}
                placements={placements}
                partDefinitions={appearanceAsset.partDefinitions}
                referenceSrc={appearanceAsset.referenceSrc}
                motionProfile={motionProfile}
                expression={visualState?.expression}
                centerInFrame
              />}
        </span>
        <WardrobeOverlayLayer overlays={wardrobeOverlays} />
      </button>
    </div>
  )
}

// Memoised wardrobe overlay layer. The outer PetCanvas re-renders on every
// motion-profile / palette / animation tick (driven by action / showState
// changes); the wardrobe overlay only depends on the (item, placement)
// pairs, so we want it to skip those parent re-renders and only repaint
// when the user actually equips/drags. We compare overlays by id+placement
// content rather than by reference so the array literal generated upstream
// every render doesn't bust the memo.
const overlaysEqual = (
  prev: PetWardrobeOverlayItem[] | undefined,
  next: PetWardrobeOverlayItem[] | undefined
) => {
  if (prev === next) return true
  if (!prev || !next) return prev === next
  if (prev.length !== next.length) return false
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i]
    const b = next[i]
    if (a.item.id !== b.item.id) return false
    if (a.item.assetUrl !== b.item.assetUrl) return false
    if (a.placement.x !== b.placement.x) return false
    if (a.placement.y !== b.placement.y) return false
    if (a.placement.scale !== b.placement.scale) return false
    if (a.placement.rotate !== b.placement.rotate) return false
  }
  return true
}

const WardrobeOverlayLayer = memo(
  ({ overlays }: { overlays?: PetWardrobeOverlayItem[] }) => {
    if (!overlays || overlays.length === 0) return null
    return (
      <span className="pet-wardrobe-overlay" aria-hidden="true">
        {overlays.map(({ item, placement }, i) => {
          const itemStyle: CSSProperties = {
            transform: `translate(-50%, -50%) translate(${placement.x}px, ${placement.y}px) rotate(${placement.rotate}deg) scale(${placement.scale})`,
            // A5: explicit z-index per stacking order. The controller hands
            // overlays in slot order back→floating, which we map to
            // increasing z-index here. Hand-rolled instead of relying on
            // implicit DOM stacking because rotate(...) creates a new
            // stacking context that can flip ordering on some browsers.
            zIndex: 10 + i
          }
          return (
            <span
              key={item.id}
              className={`pet-wardrobe-overlay-item${item.assetUrl ? '' : ' pet-wardrobe-overlay-placeholder'}`}
              style={itemStyle}
            >
              {item.assetUrl ? (
                <img src={item.assetUrl} alt="" draggable={false} />
              ) : (
                <span>{item.nameZh}</span>
              )}
            </span>
          )
        })}
      </span>
    )
  },
  (prev, next) => overlaysEqual(prev.overlays, next.overlays)
)
WardrobeOverlayLayer.displayName = 'WardrobeOverlayLayer'
