import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { PetCutoutCanvas, defaultCutoutPlacements } from './PetCutoutCanvas'
import type { PetCutoutPartDefinition, PetCutoutPlacement, PetLanguage } from '../types/pet'

interface CutoutAlignmentEditorProps {
  placements: PetCutoutPlacement[]
  partDefinitions?: PetCutoutPartDefinition[]
  referenceSrc?: string
  assetLabel?: string
  language?: PetLanguage
  onChangePlacements: (placements: PetCutoutPlacement[]) => void
  onResetPlacements: () => void
}

interface DragState {
  mode: 'move' | 'resize-both' | 'resize-width' | 'resize-height'
  pointerX: number
  pointerY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

const PREVIEW_SCALE = 1.8
const REFERENCE_LEFT = 250
const REFERENCE_TOP = 204
const REFERENCE_WIDTH = 2049
const REFERENCE_HEIGHT = 2164
const REFERENCE_TO_CANVAS_X = REFERENCE_WIDTH / 208
const REFERENCE_TO_CANVAS_Y = REFERENCE_HEIGHT / 208

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalizePlacement = (placement: PetCutoutPlacement): PetCutoutPlacement => {
  const width = clamp(Math.round(placement.width), 24, REFERENCE_WIDTH)
  const height = clamp(Math.round(placement.height), 24, REFERENCE_HEIGHT)
  const x = clamp(Math.round(placement.x), REFERENCE_LEFT, REFERENCE_LEFT + REFERENCE_WIDTH - width)
  const y = clamp(Math.round(placement.y), REFERENCE_TOP, REFERENCE_TOP + REFERENCE_HEIGHT - height)

  return {
    ...placement,
    x,
    y,
    width,
    height,
    zIndex: Math.round(placement.zIndex)
  }
}

const updatePlacement = (
  placements: PetCutoutPlacement[],
  partId: string,
  updater: (placement: PetCutoutPlacement) => PetCutoutPlacement
) => placements.map((placement) => (placement.id === partId ? normalizePlacement(updater(placement)) : normalizePlacement(placement)))

export function CutoutAlignmentEditor({
  placements,
  partDefinitions,
  referenceSrc,
  assetLabel,
  language = 'zh-CN',
  onChangePlacements,
  onResetPlacements
}: CutoutAlignmentEditorProps) {
  const [selectedPartId, setSelectedPartId] = useState<string>(placements[0]?.id ?? defaultCutoutPlacements[0].id)
  const dragRef = useRef<DragState | null>(null)
  const english = language === 'en-US'

  useEffect(() => {
    if (!placements.some((placement) => placement.id === selectedPartId)) {
      setSelectedPartId(placements[0]?.id ?? defaultCutoutPlacements[0].id)
    }
  }, [placements, selectedPartId])

  const selectedPart = useMemo(
    () => placements.find((placement) => placement.id === selectedPartId) ?? placements[0] ?? defaultCutoutPlacements[0],
    [placements, selectedPartId]
  )

  const setField = (field: keyof PetCutoutPlacement, value: number | boolean) => {
    if (!selectedPart) return
    onChangePlacements(updatePlacement(placements, selectedPart.id, (placement) => ({ ...placement, [field]: value })))
  }

  const changeSelectedLayer = (delta: number) => {
    if (!selectedPart) return
    const currentIndex = placements.findIndex((placement) => placement.id === selectedPart.id)
    const targetIndex = currentIndex + delta
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= placements.length) return

    const next = [...placements]
    const [moved] = next.splice(currentIndex, 1)
    next.splice(targetIndex, 0, moved)
    onChangePlacements(next.map((placement, index) => ({ ...placement, zIndex: index + 2 })))
  }

  const handleCopyConfig = async () => {
    await navigator.clipboard.writeText(JSON.stringify(placements, null, 2))
  }

  const handleLayerPointerDown = (partId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const placement = placements.find((item) => item.id === partId)
    if (!placement) return

    setSelectedPartId(partId)
    dragRef.current = {
      mode: 'move',
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: placement.x,
      startY: placement.y,
      startWidth: placement.width,
      startHeight: placement.height
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const deltaX = ((moveEvent.clientX - drag.pointerX) / PREVIEW_SCALE) * REFERENCE_TO_CANVAS_X
      const deltaY = ((moveEvent.clientY - drag.pointerY) / PREVIEW_SCALE) * REFERENCE_TO_CANVAS_Y
      onChangePlacements(updatePlacement(placements, partId, (current) => ({
        ...current,
        x: Math.round(drag.startX + deltaX),
        y: Math.round(drag.startY + deltaY)
      })))
    }

    const handlePointerUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const handleResizePointerDown = (
    partId: string,
    mode: DragState['mode'],
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const placement = placements.find((item) => item.id === partId)
    if (!placement) return

    setSelectedPartId(partId)
    dragRef.current = {
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: placement.x,
      startY: placement.y,
      startWidth: placement.width,
      startHeight: placement.height
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const deltaX = ((moveEvent.clientX - drag.pointerX) / PREVIEW_SCALE) * REFERENCE_TO_CANVAS_X
      const deltaY = ((moveEvent.clientY - drag.pointerY) / PREVIEW_SCALE) * REFERENCE_TO_CANVAS_Y
      onChangePlacements(updatePlacement(placements, partId, (current) => ({
        ...current,
        width: drag.mode === 'resize-height' ? current.width : Math.max(24, Math.round(drag.startWidth + deltaX)),
        height: drag.mode === 'resize-width' ? current.height : Math.max(24, Math.round(drag.startHeight + deltaY))
      })))
    }

    const handlePointerUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }


  const previewLeft = selectedPart ? ((selectedPart.x - REFERENCE_LEFT) / REFERENCE_WIDTH) * 208 * PREVIEW_SCALE + 12 : 0
  const previewTop = selectedPart ? ((selectedPart.y - REFERENCE_TOP) / REFERENCE_HEIGHT) * 208 * PREVIEW_SCALE + 12 : 0
  const previewWidth = selectedPart ? (selectedPart.width / REFERENCE_WIDTH) * 208 * PREVIEW_SCALE : 0
  const previewHeight = selectedPart ? (selectedPart.height / REFERENCE_HEIGHT) * 208 * PREVIEW_SCALE : 0

  return (
    <section className="alignment-editor">
      <div className="alignment-editor-header">
        <div>
          <strong>{assetLabel ? (english ? `${assetLabel} placement` : `${assetLabel}摆位`) : (english ? 'Asset placement' : '素材摆位')}</strong>
          <span>{english ? 'Select a part to drag it, or edit the numbers directly.' : '点选部件后可拖动，也可以直接改数值。'}</span>
        </div>
        <div className="alignment-editor-actions">
          <button type="button" className="ghost-button" onClick={() => void handleCopyConfig()}>
            {english ? 'Copy config' : '复制配置'}
          </button>
          <button type="button" className="ghost-button" onClick={onResetPlacements}>
            {english ? 'Restore defaults' : '恢复默认'}
          </button>
        </div>
      </div>

      <div className="alignment-editor-layout">
        <div className="alignment-preview-shell">
          <PetCutoutCanvas
            showDebug
            placements={placements}
            partDefinitions={partDefinitions}
            referenceSrc={referenceSrc}
            selectedPartId={selectedPart?.id ?? null}
            editing
            scale={PREVIEW_SCALE}
            onSelectPart={setSelectedPartId}
            onPartPointerDown={handleLayerPointerDown}
          />
          {selectedPart ? (
            <>
              <button
                type="button"
                className="alignment-resize-handle alignment-resize-handle-width"
                onPointerDown={(event) => handleResizePointerDown(selectedPart.id, 'resize-width', event)}
                style={{
                  left: `${previewLeft + previewWidth - 14}px`,
                  top: `${previewTop + previewHeight / 2 - 20}px`,
                  zIndex: selectedPart.zIndex + 30
                }}
                aria-label={english ? `Adjust ${selectedPart.id} width` : `调整 ${selectedPart.id} 宽度`}
              />
              <button
                type="button"
                className="alignment-resize-handle alignment-resize-handle-height"
                onPointerDown={(event) => handleResizePointerDown(selectedPart.id, 'resize-height', event)}
                style={{
                  left: `${previewLeft + previewWidth / 2 - 9}px`,
                  top: `${previewTop + previewHeight - 9}px`,
                  zIndex: selectedPart.zIndex + 30
                }}
                aria-label={english ? `Adjust ${selectedPart.id} height` : `调整 ${selectedPart.id} 高度`}
              />
              <button
                type="button"
                className="alignment-resize-handle alignment-resize-handle-both"
                onPointerDown={(event) => handleResizePointerDown(selectedPart.id, 'resize-both', event)}
                style={{
                  left: `${previewLeft + previewWidth - 9}px`,
                  top: `${previewTop + previewHeight - 9}px`,
                  zIndex: selectedPart.zIndex + 31
                }}
                aria-label={english ? `Adjust ${selectedPart.id} size` : `调整 ${selectedPart.id} 大小`}
              />
            </>
          ) : null}
        </div>

        <div className="alignment-controls">
          <label>
            {english ? 'Part' : '部件'}
            <select value={selectedPart?.id ?? ''} onChange={(event) => setSelectedPartId(event.target.value)}>
              {placements.map((placement) => (
                <option key={placement.id} value={placement.id}>{placement.id}</option>
              ))}
            </select>
          </label>

          <div className="alignment-layer-actions">
            <button type="button" className="ghost-button" onClick={() => changeSelectedLayer(1)}>{english ? 'Bring forward' : '前移一层'}</button>
            <button type="button" className="ghost-button" onClick={() => changeSelectedLayer(-1)}>{english ? 'Send backward' : '后移一层'}</button>
          </div>

          <div className="alignment-grid-fields">
            <label>
              X
              <input type="number" value={selectedPart?.x ?? 0} onChange={(event) => setField('x', Number(event.target.value))} />
            </label>
            <label>
              Y
              <input type="number" value={selectedPart?.y ?? 0} onChange={(event) => setField('y', Number(event.target.value))} />
            </label>
            <label>
              {english ? 'Width' : '宽'}
              <input type="number" value={selectedPart?.width ?? 0} onChange={(event) => setField('width', Number(event.target.value))} />
            </label>
            <label>
              {english ? 'Height' : '高'}
              <input type="number" value={selectedPart?.height ?? 0} onChange={(event) => setField('height', Number(event.target.value))} />
            </label>
            <label>
              {english ? 'Layer' : '层级'}
              <input type="number" value={selectedPart?.zIndex ?? 0} onChange={(event) => setField('zIndex', Number(event.target.value))} />
            </label>
            <label className="alignment-toggle-field">
              <span>{english ? 'Visible' : '显示'}</span>
              <input type="checkbox" checked={selectedPart?.visible ?? false} onChange={(event) => setField('visible', event.target.checked)} />
            </label>
          </div>
        </div>
      </div>
    </section>
  )
}
