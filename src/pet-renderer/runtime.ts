import { AnimatedSprite, Application, Assets, Container, Graphics, MeshPlane, Rectangle, Texture } from 'pixi.js'
import type { BLEND_MODES } from 'pixi.js'
import type { PetCutoutPlacement, PetMotionProfile } from '../types/pet'
import type { OneShotClipState, PetAnimationManifest, SpriteClip } from '../types/pet-animation'
import { getClipDurationMs, resolveSpriteOverlay, clamp01 } from './clip-scheduler'
import { blendRigMotionStates, createRigMotionState } from './profile-mapper'
import type { PetRigDefinition, PetRigPart, Point2D, RigMotionState, RigPartTransform } from './rig-types'
import { normalizeCutoutPlacement, referenceFrame } from '../components/PetCutoutCanvas'

interface RigPartRuntime {
  part: PetRigPart
  container: Container
  mesh: MeshPlane
  debugOutline: Graphics
  debugPivot: Graphics
  baseVertices: Float32Array
  transform: RigPartTransform
}

interface ActiveSpriteOverlay {
  state: OneShotClipState
  clip: SpriteClip
  sprite: AnimatedSprite
  frames: Texture[]
}

const toBlendMode = (blendMode?: PetRigPart['blendMode']): BLEND_MODES => {
  if (blendMode === 'screen') return 'screen'
  return 'normal'
}

const referenceScaleX = 208 / referenceFrame.visibleWidth
const referenceScaleY = 208 / referenceFrame.visibleHeight
const PROFILE_CROSSFADE_MS = 260
const SPRITE_OVERLAY_FADE_MS = 200

const placementToTransform = (placement: RigPartTransform): RigPartTransform => ({
  x: (placement.x - referenceFrame.visibleLeft) * referenceScaleX,
  y: (placement.y - referenceFrame.visibleTop) * referenceScaleY,
  width: placement.width * referenceScaleX,
  height: placement.height * referenceScaleY,
  zIndex: placement.zIndex,
  visible: placement.visible
})

const partTransformFromPlacement = (part: PetRigPart, placements?: PetCutoutPlacement[]) => {
  const placement = part.placementId ? placements?.find((item) => item.id === part.placementId) : undefined
  const resolved = placement ? normalizeCutoutPlacement(placement) : part.defaultTransform
  return placementToTransform(resolved)
}

const resolvePivot = (part: PetRigPart, transform: RigPartTransform): Point2D => {
  if (part.pivot) return part.pivot
  const ratio = part.pivotRatio ?? { x: 0.5, y: 0.5 }
  return {
    x: transform.width * ratio.x,
    y: transform.height * ratio.y
  }
}

const drawDebugRect = (graphics: Graphics, transform: RigPartTransform, color: number) => {
  graphics.clear()
  graphics.rect(0, 0, transform.width, transform.height)
  graphics.stroke({ color, width: 1.5, alpha: 0.92 })
}

const drawDebugPivot = (graphics: Graphics, pivot: Point2D, color: number) => {
  graphics.clear()
  graphics.circle(pivot.x, pivot.y, 3)
  graphics.fill({ color, alpha: 0.92 })
  graphics.moveTo(pivot.x - 6, pivot.y)
  graphics.lineTo(pivot.x + 6, pivot.y)
  graphics.moveTo(pivot.x, pivot.y - 6)
  graphics.lineTo(pivot.x, pivot.y + 6)
  graphics.stroke({ color, width: 1.2, alpha: 0.92 })
}

const createSpriteFrames = async (clip: SpriteClip, manifest: PetAnimationManifest) => {
  const textureSet = manifest.spriteTextureSets?.[clip.textureSetId]
  if (textureSet?.frames.length) return Promise.all(textureSet.frames.map((source) => Assets.load(source) as Promise<Texture>))
  if (!manifest.emoteSheetPath) return []

  const baseTexture = await Assets.load(manifest.emoteSheetPath) as Texture
  const atlas = manifest.emoteAtlas
  const row = atlas?.rows[clip.textureSetId] ?? atlas?.rows[clip.name]
  const cellWidth = atlas?.cellWidth ?? 192
  const cellHeight = atlas?.cellHeight ?? 208
  const columns = atlas?.columns ?? 8
  const rowIndex = row?.row ?? 0
  const frameCount = row?.frames ?? clip.frameCount

  return Array.from({ length: frameCount }, (_, index) => new Texture({
    source: baseTexture.source,
    frame: new Rectangle((index % columns) * cellWidth, rowIndex * cellHeight, cellWidth, cellHeight)
  }))
}

const getDebugColor = (part: PetRigPart) => {
  if (part.regionRole === 'head') return 0x7dd3fc
  if (part.regionRole === 'body') return 0xfde68a
  if (part.regionRole === 'limb') return 0xc4b5fd
  if (part.regionRole === 'ear') return 0xf472b6
  if (part.regionRole === 'snout') return 0xf59e0b
  if (part.regionRole === 'eye') return 0x34d399
  if (part.regionRole === 'cheek') return 0xfb7185
  return 0xe879f9
}

const updateCorners = (runtime: RigPartRuntime, scaleX: number, scaleY: number, offsetY = 0) => {
  const data = runtime.mesh.geometry.getBuffer('aPosition').data as Float32Array
  const base = runtime.baseVertices
  const width = runtime.transform.width
  const height = runtime.transform.height
  const centerX = width / 2
  const centerY = height / 2

  for (let index = 0; index < base.length; index += 2) {
    const x = base[index]
    const y = base[index + 1]
    data[index] = centerX + (x - centerX) * scaleX
    data[index + 1] = centerY + (y - centerY) * scaleY + offsetY
  }

  runtime.mesh.geometry.getBuffer('aPosition').update()
}

const applyWarp = (runtime: RigPartRuntime, amount: number) => {
  if (!runtime.part.warp) return

  const data = runtime.mesh.geometry.getBuffer('aPosition').data as Float32Array
  const base = runtime.baseVertices
  const { topLeft, topRight, bottomRight, bottomLeft } = runtime.part.warp
  const corners = [topLeft, topRight, bottomLeft, bottomRight]

  for (let cornerIndex = 0; cornerIndex < corners.length; cornerIndex += 1) {
    const corner = corners[cornerIndex]
    if (!corner) continue
    const dataIndex = cornerIndex * 2
    data[dataIndex] = base[dataIndex] + corner.x * amount
    data[dataIndex + 1] = base[dataIndex + 1] + corner.y * amount
  }

  runtime.mesh.geometry.getBuffer('aPosition').update()
}

export class PetRigRuntime {
  private app: Application | null = null
  private host: HTMLElement | null = null
  private rigParts: RigPartRuntime[] = []
  private profile: PetMotionProfile | null = null
  private previousState: RigMotionState | null = null
  private transitionStartedAt = 0
  private placements: PetCutoutPlacement[] | undefined
  private startTime = 0
  private tick: (() => void) | null = null
  private debugVisible = false
  private rigLayer: Container | null = null
  private spriteOverlayLayer: Container | null = null
  private activeSpriteOverlay: ActiveSpriteOverlay | null = null

  async mount(host: HTMLElement, rig: PetRigDefinition, profile: PetMotionProfile, placements?: PetCutoutPlacement[]) {
    this.host = host
    this.profile = profile
    this.placements = placements
    this.startTime = performance.now()

    const app = new Application()
    await app.init({
      width: rig.width,
      height: rig.height,
      antialias: true,
      backgroundAlpha: 0,
      preference: 'webgl',
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    })

    app.canvas.style.width = `${rig.width}px`
    app.canvas.style.height = `${rig.height}px`
    app.canvas.style.pointerEvents = 'none'
    host.replaceChildren(app.canvas)

    const textureEntries = await Promise.all(
      rig.parts.map(async (part) => [part.id, await Assets.load(part.texture as string)] as const)
    )
    const textures = new Map<string, Texture>(textureEntries)
    const rigLayer = new Container()
    const spriteOverlayLayer = new Container()
    rigLayer.sortableChildren = true
    spriteOverlayLayer.sortableChildren = true
    spriteOverlayLayer.zIndex = 1000
    app.stage.addChild(rigLayer)
    app.stage.addChild(spriteOverlayLayer)
    this.rigLayer = rigLayer
    this.spriteOverlayLayer = spriteOverlayLayer

    this.rigParts = [...rig.parts]
      .sort((left, right) => left.drawOrder - right.drawOrder)
      .map((part) => {
        const transform = partTransformFromPlacement(part, this.placements)
        const pivot = resolvePivot(part, transform)
        const container = new Container()
        container.position.set(transform.x + pivot.x, transform.y + pivot.y)
        container.pivot.set(pivot.x, pivot.y)
        container.alpha = part.opacity ?? 1
        container.blendMode = toBlendMode(part.blendMode)
        container.visible = transform.visible
        container.zIndex = transform.zIndex

        const mesh = new MeshPlane({
          texture: textures.get(part.id) as Texture,
          verticesX: 2,
          verticesY: 2
        })
        mesh.width = transform.width
        mesh.height = transform.height
        mesh.position.set(0, 0)

        const debugColor = getDebugColor(part)
        const debugOutline = new Graphics()
        drawDebugRect(debugOutline, transform, debugColor)
        debugOutline.visible = this.debugVisible

        const debugPivot = new Graphics()
        drawDebugPivot(debugPivot, pivot, debugColor)
        debugPivot.visible = this.debugVisible

        container.addChild(mesh)
        container.addChild(debugOutline)
        container.addChild(debugPivot)
        rigLayer.addChild(container)

        const baseVertices = Float32Array.from(mesh.geometry.getBuffer('aPosition').data as Float32Array)

        return {
          part,
          container,
          mesh,
          debugOutline,
          debugPivot,
          baseVertices,
          transform
        }
      })

    app.stage.sortableChildren = true
    this.app = app
    this.tick = () => this.renderFrame()
    app.ticker.add(this.tick)
    this.renderFrame()
  }

  updateProfile(profile: PetMotionProfile) {
    if (this.profile) {
      this.previousState = createRigMotionState(this.profile, performance.now() - this.startTime)
      this.transitionStartedAt = performance.now()
    }
    this.profile = profile
  }

  updatePlacements(placements?: PetCutoutPlacement[]) {
    this.placements = placements

    for (const runtime of this.rigParts) {
      runtime.transform = partTransformFromPlacement(runtime.part, placements)
      runtime.mesh.width = runtime.transform.width
      runtime.mesh.height = runtime.transform.height
      runtime.mesh.position.set(0, 0)
      runtime.container.visible = runtime.transform.visible
      runtime.container.zIndex = runtime.transform.zIndex
      const pivot = resolvePivot(runtime.part, runtime.transform)
      runtime.container.pivot.set(pivot.x, pivot.y)
      drawDebugRect(runtime.debugOutline, runtime.transform, getDebugColor(runtime.part))
      drawDebugPivot(runtime.debugPivot, pivot, getDebugColor(runtime.part))
      runtime.baseVertices = Float32Array.from(runtime.mesh.geometry.getBuffer('aPosition').data as Float32Array)
    }
  }

  setDebugVisible(visible: boolean) {
    this.debugVisible = visible

    for (const runtime of this.rigParts) {
      runtime.debugOutline.visible = visible
      runtime.debugPivot.visible = visible
    }
  }

  async playSpriteOverlay(manifest: PetAnimationManifest, state: OneShotClipState | null) {
    if (!state || !this.spriteOverlayLayer) {
      this.clearSpriteOverlay()
      return
    }

    const clip = manifest.clips[state.clipName]
    if (!clip || clip.kind !== 'sprite') {
      this.clearSpriteOverlay()
      return
    }

    if (this.activeSpriteOverlay?.state.clipName === state.clipName && this.activeSpriteOverlay.state.startedAtMs === state.startedAtMs) return

    this.clearSpriteOverlay()
    const frames = await createSpriteFrames(clip, manifest)
    if (frames.length === 0 || !this.spriteOverlayLayer) return

    const sprite = new AnimatedSprite(frames, false)
    sprite.anchor.set(0.5)
    sprite.position.set((this.app?.renderer.width ?? 208) / 2, (this.app?.renderer.height ?? 208) / 2)
    sprite.width = this.app?.renderer.width ?? 208
    sprite.height = this.app?.renderer.height ?? 208
    this.spriteOverlayLayer.addChild(sprite)
    this.activeSpriteOverlay = { state, clip, sprite, frames }
  }

  private clearSpriteOverlay() {
    this.activeSpriteOverlay?.sprite.destroy()
    this.activeSpriteOverlay = null
    this.spriteOverlayLayer?.removeChildren()
    if (this.rigLayer) this.rigLayer.alpha = 1
  }

  private renderFrame() {
    if (!this.profile) return

    const now = performance.now()
    const nextState = createRigMotionState(this.profile, now - this.startTime)
    const transitionProgress = this.previousState ? (now - this.transitionStartedAt) / PROFILE_CROSSFADE_MS : 1
    const state = this.previousState && transitionProgress < 1
      ? blendRigMotionStates(this.previousState, nextState, transitionProgress)
      : nextState
    if (transitionProgress >= 1) this.previousState = null

    for (const runtime of this.rigParts) {
      const pivot = resolvePivot(runtime.part, runtime.transform)
      runtime.container.position.set(
        runtime.transform.x + pivot.x,
        runtime.transform.y + pivot.y
      )
      runtime.container.scale.set(1, 1)
      runtime.container.rotation = 0
      runtime.container.alpha = runtime.part.regionRole === 'highlight' ? state.highlightAlpha : runtime.part.opacity ?? 1
      runtime.container.visible = runtime.transform.visible

      updateCorners(runtime, 1, 1, 0)

      const baseLeanX = state.leanOffsetX
      const baseLeanY = state.leanOffsetY
      const baseLeanRotation = state.leanRotation

      if (runtime.part.motionGroup === 'body') {
        runtime.container.position.x += state.bodyOffsetX * 0.75 + baseLeanX * 0.8
        runtime.container.position.y += state.bodyFloat * 0.8 + baseLeanY
        runtime.container.rotation = state.bodyRotation + baseLeanRotation * 0.8
        runtime.container.scale.set(state.bodyScaleX, state.bodyScaleY)
      }

      if (runtime.part.motionGroup === 'head') {
        runtime.container.position.x += state.bodyOffsetX * 1.15 + state.headOffsetX + baseLeanX * 1.18
        runtime.container.position.y += state.bodyFloat * 1.18 + state.headOffsetY + baseLeanY * 1.15
        runtime.container.rotation = state.bodyRotation * 0.55 + state.headRotation + baseLeanRotation * 1.15
        runtime.container.scale.set(
          (1 + (state.bodyScaleX - 1) * 0.55) * state.headScaleX,
          (1 + (state.bodyScaleY - 1) * 0.55) * state.headScaleY
        )
      }

      if (runtime.part.motionGroup === 'limbs') {
        runtime.container.position.x += state.bodyOffsetX * 0.42 + state.limbsOffsetX + baseLeanX * 0.36
        runtime.container.position.y += state.bodyFloat * 0.42 + state.limbsOffsetY + baseLeanY * 0.35
        runtime.container.rotation = -state.bodyRotation * 0.9 + state.limbsRotation + baseLeanRotation * 0.35
        runtime.container.scale.set(
          (1 + (state.bodyScaleX - 1) * 0.32) * state.limbsScaleX,
          (1 + (state.bodyScaleY - 1) * 0.32) * state.limbsScaleY
        )
      }

      if (runtime.part.followBase) {
        runtime.container.position.x += state.bodyOffsetX * 1.15 + state.headOffsetX * 0.92 + baseLeanX
        runtime.container.position.y += state.bodyFloat * 1.1 + state.headOffsetY * 0.82 + baseLeanY
        runtime.container.rotation += state.headRotation * 0.88 + baseLeanRotation * 0.4
      }

      if (runtime.part.id === 'ears') {
        runtime.container.x += state.bodyOffsetX * 1.18 + state.headOffsetX * 1.22 + baseLeanX
        runtime.container.y += state.bodyFloat * 1.08 + state.headOffsetY * 0.95 + Math.min(state.leftEarLift, state.rightEarLift) * 1.8 + baseLeanY
        runtime.container.rotation = state.leftEarRotation * 1.15 + state.headRotation * 1.05 + baseLeanRotation
        updateCorners(runtime, 1.03, 1, 0)
        applyWarp(runtime, Math.max(Math.abs(state.leftEarRotation), Math.abs(state.rightEarRotation)) * 26)
      }

      if (runtime.part.id === 'snout') {
        runtime.container.y += state.headOffsetY * 0.18 + state.snoutOffsetY * 0.65
        runtime.container.rotation += state.headRotation * 0.28
        updateCorners(runtime, state.snoutScaleX, state.snoutScaleY, state.snoutOffsetY)
        applyWarp(runtime, Math.abs(state.snoutOffsetY) * 8)
      }

      if (runtime.part.id === 'eyes') {
        runtime.container.x += state.headOffsetX * 0.08
        runtime.container.y += state.eyeFocusOffsetY + state.headOffsetY * 0.1
        runtime.container.rotation += state.headRotation * 0.2
        updateCorners(runtime, 1, Math.min(state.leftEyeScaleY, state.rightEyeScaleY), Math.max(state.leftEyeOffsetY, state.rightEyeOffsetY) + state.eyeFocusOffsetY)
      }

      if (runtime.part.id === 'blush') {
        runtime.container.y += state.headOffsetY * 0.08
        updateCorners(runtime, state.cheekScale, state.cheekScale, state.cheekOffsetY)
      }
    }

    if (this.activeSpriteOverlay) {
      const overlay = resolveSpriteOverlay({ clips: { [this.activeSpriteOverlay.state.clipName]: this.activeSpriteOverlay.clip } }, this.activeSpriteOverlay.state, now)
      if (!overlay) {
        this.clearSpriteOverlay()
      } else {
        const sprite = this.activeSpriteOverlay.sprite
        sprite.texture = this.activeSpriteOverlay.frames[overlay.frameIndex] ?? this.activeSpriteOverlay.frames[0]
        const durationMs = Math.max(1, getClipDurationMs(this.activeSpriteOverlay.clip))
        const fadeIn = clamp01(overlay.elapsedMs / SPRITE_OVERLAY_FADE_MS)
        const fadeOut = clamp01((durationMs - overlay.elapsedMs) / SPRITE_OVERLAY_FADE_MS)
        sprite.alpha = Math.min(fadeIn, fadeOut)
        if (this.rigLayer) this.rigLayer.alpha = this.activeSpriteOverlay.clip.blockBase ? 1 - sprite.alpha : 1
        if (overlay.complete) this.clearSpriteOverlay()
      }
    }

    if (import.meta.env.VITE_AI_PET_E2E) {
      (window as typeof window & { __AI_PET_RIG_SNAPSHOT__?: unknown }).__AI_PET_RIG_SNAPSHOT__ = this.rigParts.map((runtime) => ({
        id: runtime.part.id,
        x: runtime.container.x,
        y: runtime.container.y,
        rotation: runtime.container.rotation,
        scaleX: runtime.container.scale.x,
        scaleY: runtime.container.scale.y
      }))
    }
  }

  destroy() {
    if (this.app && this.tick) this.app.ticker.remove(this.tick)
    this.clearSpriteOverlay()
    this.rigParts = []
    this.app?.destroy(true, true)
    this.app = null
    this.rigLayer = null
    this.spriteOverlayLayer = null
    this.host?.replaceChildren()
    this.host = null
    this.tick = null
  }
}
