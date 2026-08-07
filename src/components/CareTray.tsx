import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { ExecutableInteractionType, PetLanguage } from '../types/pet'
import { t, type TranslationKey } from '../lib/i18n'
import './CareTray.css'

/** Matches `handleUseInventoryItem` consumable path for snack packs. */
export const CARE_TRAY_SNACK_ITEM_ID = 'snack-pack'

export interface CareTrayDragPayload {
  interaction: ExecutableInteractionType
  inventoryItemId?: string
  ghostEmoji: string
  clientX: number
  clientY: number
}

interface CareTrayProps {
  language: PetLanguage | undefined
  isSleeping: boolean
  snackInventoryCount: number
  onAction: (payload: Omit<CareTrayDragPayload, 'ghostEmoji' | 'clientX' | 'clientY'>) => void
  onDragStart: (payload: CareTrayDragPayload) => void
  onDragMove: (clientX: number, clientY: number) => void
  onDragEnd: (clientX: number, clientY: number) => void
}

type TraySlotDef = {
  interaction: ExecutableInteractionType
  emoji: string
  labelKey: TranslationKey
  /** When true, successful feed drag consumes one snack if inventory has any. */
  usesSnackInventory?: boolean
}

const BASE_SLOTS: TraySlotDef[] = [
  { interaction: 'feed', emoji: '🍞', labelKey: 'care.tray.feed', usesSnackInventory: true },
  { interaction: 'drink', emoji: '💧', labelKey: 'care.tray.drink' },
  { interaction: 'bath', emoji: '🧼', labelKey: 'care.tray.bath' },
  { interaction: 'pet', emoji: '✋', labelKey: 'care.tray.pet' },
  { interaction: 'hold', emoji: '🤗', labelKey: 'care.tray.hold' }
]

export function CareDragGhost({ emoji, x, y, active }: { emoji: string; x: number; y: number; active: boolean }) {
  if (!active) return null
  return (
    <div className="care-drag-ghost" style={{ left: x, top: y }} aria-hidden>
      <span className="care-drag-ghost-inner">{emoji}</span>
    </div>
  )
}

export function CareTray({ language, isSleeping, snackInventoryCount, onAction, onDragStart, onDragMove, onDragEnd }: CareTrayProps) {
  const draggingRef = useRef(false)
  const movedRef = useRef(false)

  const restSlot: TraySlotDef = isSleeping
    ? { interaction: 'wake', emoji: '☀️', labelKey: 'care.tray.wake' }
    : { interaction: 'sleep', emoji: '🌙', labelKey: 'care.tray.sleep' }

  const slots = [...BASE_SLOTS, restSlot]

  const beginDrag = useCallback(
    (slot: TraySlotDef, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      draggingRef.current = true
      movedRef.current = false
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* pointer capture is unavailable in some test/browser contexts */
      }
      const inventoryItemId =
        slot.usesSnackInventory && snackInventoryCount > 0 ? CARE_TRAY_SNACK_ITEM_ID : undefined
      onDragStart({
        interaction: slot.interaction,
        inventoryItemId,
        ghostEmoji: slot.emoji,
        clientX: event.clientX,
        clientY: event.clientY
      })
    },
    [onDragStart, snackInventoryCount]
  )

  const handleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return
    movedRef.current = true
    onDragMove(event.clientX, event.clientY)
  }

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>, slot: TraySlotDef) => {
    if (!draggingRef.current) return
    const moved = movedRef.current
    draggingRef.current = false
    movedRef.current = false
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* pointer capture may already be gone */
    }
    if (moved) {
      onDragEnd(event.clientX, event.clientY)
      return
    }
    onDragEnd(-1, -1)
    onAction({
      interaction: slot.interaction,
      inventoryItemId: slot.usesSnackInventory && snackInventoryCount > 0 ? CARE_TRAY_SNACK_ITEM_ID : undefined
    })
  }

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    movedRef.current = false
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    onDragEnd(-1, -1)
  }

  return (
    <div className="care-tray" role="toolbar" aria-label={t(language, 'care.tray.aria')} data-testid="care-tray">
      {slots.map((slot) => {
        const label = t(language, slot.labelKey)
        const showSnackDot = Boolean(slot.usesSnackInventory && snackInventoryCount > 0)
        return (
          <button
            key={`${slot.interaction}-${slot.labelKey}`}
            type="button"
            className={`care-tray-slot${showSnackDot ? ' care-tray-slot--inventory' : ''}`}
            aria-label={label}
            title={label}
            onPointerDown={(event) => beginDrag(slot, event)}
            onPointerMove={handleMove}
            onPointerUp={(event) => finishDrag(event, slot)}
            onPointerCancel={cancelDrag}
          >
            <span className="care-tray-slot-emoji" aria-hidden>
              {slot.emoji}
            </span>
          </button>
        )
      })}
    </div>
  )
}
