import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { PetLanguage } from '../types/pet'
import { DEFAULT_PLACEMENT, type WardrobePlacement, type WardrobeSlot } from '../types/wardrobe'

// WardrobeAlignmentEditor — drag the wardrobe item to position it on the
// pet preview, slide for scale/rotate. Lives next to the wardrobe inventory
// in the panel (mounted on demand when the user wants to tune a freshly
// drawn or already-owned item).
//
// Coordinate model: x/y are pixel offsets *from the pet sprite centre*, not
// from the editor canvas top-left. This is what gets persisted into
// pet.ui.wardrobePlacements[species][itemId] and what the runtime renderer
// uses to overlay the item on the live pet. We re-centre at every render
// so the editor's preview frame can grow/shrink without breaking saved
// placements.
//
// Asset loading: when assetUrl is undefined we render a labelled square so
// the rest of the pipeline (drag/scale/rotate, save, runtime overlay) can
// be exercised before the PNG cutouts are generated. The first time you
// run this editor with a real PNG it just works — no other code paths
// change.

// 272 = .pet-body width/height in PetCanvas.css. Keeping the editor stage
// the exact same size as the live pet body means placement (x, y) coords
// in the editor map 1:1 to the rendered overlay position, so what you drag
// is what you see on the live pet — no scaling math, no surprise drift.
const REFERENCE_SIZE = 272
// 96 = .pet-wardrobe-overlay-item width/height. Same rationale.
const ITEM_BASE_SIZE = 96
const SCALE_MIN = 0.3
const SCALE_MAX = 3
const ROTATE_MIN = -180
const ROTATE_MAX = 180
// Soft clamp on position. Allowing a little overshoot past the pet-body
// edge is intentional — large props (cape, wings) often sit half-outside
// the sprite box.
const POSITION_LIMIT = REFERENCE_SIZE

interface WardrobeAlignmentEditorProps {
  itemId: string
  itemNameZh: string
  itemNameEn?: string
  assetUrl?: string
  placement: WardrobePlacement
  // D4: when known, the slot lets us offer a "good starting point" preset
  // for the item (hat → top of head, neck → mid-collar, etc.). Optional —
  // legacy items without a slot just don't show preset chips.
  slot?: WardrobeSlot
  language?: PetLanguage
  onChange: (placement: WardrobePlacement) => void
  onCommit?: (placement: WardrobePlacement) => void
  onReset?: () => void
  // Caller renders the pet body inside a 220×220 box with the sprite
  // centred. Editor overlays the item on top. We don't render the pet
  // ourselves so this component stays decoupled from the species sprite
  // pipeline (which has its own renderers per stage / appearance).
  petPreview: ReactNode
}

// D4: hand-tuned starting placements per slot. These are the best guess
// given the 272×272 pet body — the user can still drag from there. We
// avoid making them species-specific because the per-(species, item)
// override map already lets the user save species-specific tuning;
// presets just shorten the first nudge.
const SLOT_PRESETS: Partial<Record<WardrobeSlot, { label: string; labelEn: string; placement: WardrobePlacement }[]>> = {
  'head-top': [
    { label: '头顶', labelEn: 'Top of head', placement: { x: 0, y: -90, scale: 0.9, rotate: 0 } },
    { label: '微歪戴', labelEn: 'Slightly tilted', placement: { x: 6, y: -86, scale: 0.9, rotate: 12 } }
  ],
  'face': [
    { label: '正脸', labelEn: 'Front face', placement: { x: 0, y: -28, scale: 0.85, rotate: 0 } }
  ],
  'mouth': [
    { label: '嘴边', labelEn: 'By mouth', placement: { x: 0, y: 4, scale: 0.6, rotate: 0 } }
  ],
  'neck': [
    { label: '颈部', labelEn: 'Neck', placement: { x: 0, y: 32, scale: 0.95, rotate: 0 } }
  ],
  'chest': [
    { label: '胸前', labelEn: 'Chest', placement: { x: 0, y: 50, scale: 0.95, rotate: 0 } }
  ],
  'back': [
    { label: '背后展开', labelEn: 'Spread behind', placement: { x: 0, y: 0, scale: 1.4, rotate: 0 } }
  ],
  'hand': [
    { label: '右手持', labelEn: 'Right hand', placement: { x: 70, y: 30, scale: 0.85, rotate: 0 } },
    { label: '左手持', labelEn: 'Left hand', placement: { x: -70, y: 30, scale: 0.85, rotate: 0 } }
  ],
  'floating': [
    { label: '右上角', labelEn: 'Upper right', placement: { x: 80, y: -80, scale: 0.7, rotate: 0 } },
    { label: '左上角', labelEn: 'Upper left', placement: { x: -80, y: -80, scale: 0.7, rotate: 0 } }
  ]
}

interface DragState {
  startPointerX: number
  startPointerY: number
  startX: number
  startY: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalize = (placement: WardrobePlacement): WardrobePlacement => ({
  x: clamp(Math.round(placement.x), -POSITION_LIMIT, POSITION_LIMIT),
  y: clamp(Math.round(placement.y), -POSITION_LIMIT, POSITION_LIMIT),
  scale: Number(clamp(placement.scale, SCALE_MIN, SCALE_MAX).toFixed(2)),
  rotate: Math.round(((placement.rotate + 540) % 360) - 180)
})

export function WardrobeAlignmentEditor({
  itemId,
  itemNameZh,
  itemNameEn,
  assetUrl,
  placement,
  slot,
  language = 'zh-CN',
  onChange,
  onCommit,
  onReset,
  petPreview
}: WardrobeAlignmentEditorProps) {
  const [draft, setDraft] = useState<WardrobePlacement>(placement)
  const draftRef = useRef<WardrobePlacement>(placement)
  const dragRef = useRef<DragState | null>(null)
  const itemRef = useRef<HTMLDivElement | null>(null)
  const english = language === 'en-US'
  const itemName = english ? itemNameEn ?? itemNameZh : itemNameZh

  // Re-sync when the parent swaps which item we're editing (different itemId)
  // or when the parent commits a normalised version that differs from our
  // local draft (e.g. after onCommit). We deliberately don't re-sync on
  // every parent placement change to avoid eating mid-drag updates.
  useEffect(() => {
    setDraft(placement)
    draftRef.current = placement
  }, [itemId, placement])

  const update = (next: WardrobePlacement) => {
    const normalised = normalize(next)
    draftRef.current = normalised
    setDraft(normalised)
    onChange(normalised)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: draftRef.current.x,
      startY: draftRef.current.y
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const deltaX = event.clientX - drag.startPointerX
    const deltaY = event.clientY - drag.startPointerY
    update({ ...draftRef.current, x: drag.startX + deltaX, y: drag.startY + deltaY })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onCommit?.(draftRef.current)
  }

  const handleScaleChange = (value: number) => update({ ...draftRef.current, scale: value })
  const handleRotateChange = (value: number) => update({ ...draftRef.current, rotate: value })
  const handleResetClick = () => {
    draftRef.current = DEFAULT_PLACEMENT
    setDraft(DEFAULT_PLACEMENT)
    onChange(DEFAULT_PLACEMENT)
    onCommit?.(DEFAULT_PLACEMENT)
    onReset?.()
  }

  const itemStyle: CSSProperties = {
    width: ITEM_BASE_SIZE,
    height: ITEM_BASE_SIZE,
    transform: `translate(-50%, -50%) translate(${draft.x}px, ${draft.y}px) rotate(${draft.rotate}deg) scale(${draft.scale})`,
    transformOrigin: 'center'
  }

  return (
    <div className="wardrobe-aligner">
      <div
        className="wardrobe-aligner-stage"
        style={{ width: REFERENCE_SIZE, height: REFERENCE_SIZE }}
        aria-label={english ? `Adjust ${itemName} placement on the pet` : `调整 ${itemNameZh} 在宠物身上的位置`}
      >
        <div className="wardrobe-aligner-pet">{petPreview}</div>
        <div
          ref={itemRef}
          className={`wardrobe-aligner-item${assetUrl ? '' : ' wardrobe-aligner-item-placeholder'}`}
          style={itemStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="button"
          tabIndex={0}
          aria-grabbed={dragRef.current ? 'true' : 'false'}
        >
          {assetUrl ? (
            <img src={assetUrl} alt={itemName} draggable={false} />
          ) : (
            <span>{itemName}</span>
          )}
        </div>
      </div>
      <div className="wardrobe-aligner-controls">
        <label>
          <span>{english ? `Scale ${draft.scale.toFixed(2)}×` : `缩放 ${draft.scale.toFixed(2)}×`}</span>
          <input
            type="range"
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.05}
            value={draft.scale}
            onChange={(event) => handleScaleChange(Number(event.target.value))}
            onPointerUp={() => onCommit?.(draftRef.current)}
          />
        </label>
        <label>
          <span>{english ? `Rotate ${draft.rotate}°` : `旋转 ${draft.rotate}°`}</span>
          <input
            type="range"
            min={ROTATE_MIN}
            max={ROTATE_MAX}
            step={1}
            value={draft.rotate}
            onChange={(event) => handleRotateChange(Number(event.target.value))}
            onPointerUp={() => onCommit?.(draftRef.current)}
          />
        </label>
        {slot && SLOT_PRESETS[slot] ? (
          <div className="wardrobe-aligner-presets" role="group" aria-label={english ? 'Position presets' : '位置预设'}>
            <span className="wardrobe-aligner-presets-label">{english ? 'Recommended:' : '推荐：'}</span>
            {SLOT_PRESETS[slot]!.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="chip-button chip-button-mini"
                onClick={() => {
                  const normalised = normalize(preset.placement)
                  draftRef.current = normalised
                  setDraft(normalised)
                  onChange(normalised)
                  onCommit?.(normalised)
                }}
              >
                {english ? preset.labelEn : preset.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="wardrobe-aligner-actions">
          <span className="wardrobe-aligner-coords">{`x ${draft.x} · y ${draft.y}`}</span>
          <button type="button" className="ghost-button" onClick={handleResetClick}>
            {english ? 'Reset to center' : '还原到正中'}
          </button>
        </div>
      </div>
    </div>
  )
}

export const WARDROBE_ALIGNER_REFERENCE_SIZE = REFERENCE_SIZE
export const WARDROBE_ALIGNER_ITEM_BASE_SIZE = ITEM_BASE_SIZE
