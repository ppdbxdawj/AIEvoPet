import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { createDefaultPlacementsForAppearance, getAppearanceAsset } from '../assets/pet/appearance-registry'
import type { PetCutoutPartDefinition, PetCutoutPlacement, PetMotionProfile, PetShowExpression } from '../types/pet'

interface PetCutoutCanvasProps {
  showDebug: boolean
  placements?: PetCutoutPlacement[]
  partDefinitions?: PetCutoutPartDefinition[]
  referenceSrc?: string
  motionProfile?: PetMotionProfile
  expression?: PetShowExpression
  selectedPartId?: string | null
  editing?: boolean
  scale?: number
  centerInFrame?: boolean
  onSelectPart?: (partId: string) => void
  onPartPointerDown?: (partId: string, event: React.PointerEvent<HTMLButtonElement>) => void
}

export const referenceFrame = {
  sourceWidth: 2560,
  sourceHeight: 2560,
  visibleLeft: 250,
  visibleTop: 204,
  visibleWidth: 2049,
  visibleHeight: 2164
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const normalizeCutoutPlacement = (placement: PetCutoutPlacement): PetCutoutPlacement => {
  const width = clamp(Math.round(placement.width), 24, referenceFrame.visibleWidth)
  const height = clamp(Math.round(placement.height), 24, referenceFrame.visibleHeight)
  const x = clamp(Math.round(placement.x), referenceFrame.visibleLeft, referenceFrame.visibleLeft + referenceFrame.visibleWidth - width)
  const y = clamp(Math.round(placement.y), referenceFrame.visibleTop, referenceFrame.visibleTop + referenceFrame.visibleHeight - height)

  return {
    ...placement,
    x,
    y,
    width,
    height,
    zIndex: Math.round(placement.zIndex)
  }
}

const defaultAppearanceAsset = getAppearanceAsset('puppy', 'egg')

export const defaultCutoutRig = defaultAppearanceAsset.partDefinitions

export const defaultCutoutPlacements: PetCutoutPlacement[] = createDefaultPlacementsForAppearance('puppy', 'egg')

const fitToCanvas = (placement: Pick<PetCutoutPlacement, 'x' | 'y' | 'width' | 'height'>, scale: number): CSSProperties => ({
  left: `${((placement.x - referenceFrame.visibleLeft) / referenceFrame.visibleWidth) * CANVAS_SIZE * scale}px`,
  top: `${((placement.y - referenceFrame.visibleTop) / referenceFrame.visibleHeight) * CANVAS_SIZE * scale}px`,
  width: `${(placement.width / referenceFrame.visibleWidth) * CANVAS_SIZE * scale}px`,
  height: `${(placement.height / referenceFrame.visibleHeight) * CANVAS_SIZE * scale}px`
})

const CANVAS_SIZE = 208
const PET_FRAME_SIZE = 248

export const calculateFrameCenterOffset = (scale = 1) => Math.round(((PET_FRAME_SIZE - CANVAS_SIZE * scale) / 2) * 10) / 10

const referenceStyle = (scale: number, centerOffset = 0): CSSProperties => ({
  width: `${CANVAS_SIZE * scale}px`,
  height: `${CANVAS_SIZE * scale}px`,
  transform: centerOffset ? `translate(${centerOffset}px, ${centerOffset}px)` : undefined
})

const partClassName = (placement: PetCutoutPlacement, definitions: PetCutoutPartDefinition[]) => {
  const part = definitions.find((item) => item.id === placement.id)
  const slotToken = part?.slotId ?? placement.slotId ?? placement.id
  const roleToken = part?.motionRole && part.motionRole !== 'none' ? `motion-role-${part.motionRole}` : ''
  return [
    `part-${slotToken}`,
    roleToken
  ]
    .filter(Boolean)
    .join(' ')
}

export function PetCutoutCanvas({
  showDebug,
  placements = defaultCutoutPlacements,
  partDefinitions = defaultCutoutRig,
  referenceSrc,
  motionProfile,
  expression,
  selectedPartId = null,
  editing = false,
  scale = 1,
  centerInFrame = false,
  onSelectPart,
  onPartPointerDown
}: PetCutoutCanvasProps) {
  const cutoutSources = Object.fromEntries(partDefinitions.map((part) => [part.id, part.imageSrc])) as Record<string, string>
  // Safety net: if none of the supplied placements match the current
  // partDefinitions (e.g. a stale render right after the pet's species/stage
  // changes), fall back to each part's defaultPlacement so the sprite always
  // shows instead of rendering nothing.
  const placementsMatchParts = !editing && placements.some((placement) => Boolean(cutoutSources[placement.id] ?? cutoutSources[placement.slotId ?? '']))
  const effectivePlacements = placementsMatchParts || editing
    ? placements
    : partDefinitions.map((part) => ({ ...part.defaultPlacement, visible: true }))
  const sortedPlacements = [...effectivePlacements].map(normalizeCutoutPlacement).sort((left, right) => left.zIndex - right.zIndex)
  const centerOffset = centerInFrame && !editing ? calculateFrameCenterOffset(scale) : 0

  return (
    <div
      className={`pet-cutout-canvas ${showDebug ? 'debug-visible' : ''} ${editing ? 'debug-visible editing' : ''} ${expression ? `expression-eyes-${expression.eyes} expression-mouth-${expression.mouth}` : ''}`}
      aria-hidden="true"
      data-motion-mode={motionProfile?.mode ?? 'focus'}
      style={referenceStyle(scale, centerOffset)}
    >
      {editing && referenceSrc ? <img className="pet-cutout-layer part-reference" src={referenceSrc} alt="" draggable={false} style={referenceStyle(scale)} /> : null}
      {sortedPlacements.map((placement) => {
        const src = cutoutSources[placement.id] ?? cutoutSources[placement.slotId ?? '']
        if (!src) return null
        const selected = placement.id === selectedPartId
        const hidden = editing ? false : !showDebug && !placement.visible

        return (
          <button
            key={placement.id}
            type="button"
            className={`pet-cutout-layer pet-cutout-piece ${partClassName(placement, partDefinitions)} ${selected ? 'is-selected' : ''}`}
            draggable={false}
            onPointerDown={(event) => {
              event.stopPropagation()
              onSelectPart?.(placement.id)
              onPartPointerDown?.(placement.id, event as ReactPointerEvent<HTMLButtonElement>)
            }}
            style={{
              ...fitToCanvas(placement, scale),
              zIndex: placement.zIndex,
              opacity: hidden ? 0 : 1,
              pointerEvents: editing ? 'auto' : 'none'
            }}
          >
            <img src={src} alt="" draggable={false} />
          </button>
        )
      })}
    </div>
  )
}
