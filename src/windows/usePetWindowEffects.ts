import { useCallback, useEffect, useLayoutEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { springTowardPoint } from '../pet-physics/spring'
import { reportPetWindowBounds, resetReportedPetWindowBounds } from '../pet-physics/hit-region-reporter'
import type { PetAction, PetData, PetWindowBounds } from '../types/pet'

export interface PetStageCanvasState {
  x: number
  y: number
}

export interface FloatingWindowInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface FloatingWindowDebugState {
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  insets: FloatingWindowInsets
  hoverChatExpanded: boolean
  hoverChatVisible: boolean
  measured: boolean
  dragging: boolean
}

interface UsePetWindowEffectsParams {
  currentWindowLabel?: string
  petWindowLabel: string
  pet: PetData | null
  walkTarget: PetStageCanvasState | null
  stagePosition: PetStageCanvasState
  setStagePosition: Dispatch<SetStateAction<PetStageCanvasState>>
  clampStagePosition: (position: PetStageCanvasState) => PetStageCanvasState
  clampFloatingStagePosition: (position: PetStageCanvasState, insets: FloatingWindowInsets) => PetStageCanvasState
  floatingWindowInsets: FloatingWindowInsets
  floatingWindowMeasured: boolean
  setFloatingWindowInsets: Dispatch<SetStateAction<FloatingWindowInsets>>
  setFloatingWindowMeasured: Dispatch<SetStateAction<boolean>>
  floatingWindowBounds: PetWindowBounds
  hoverChatExpanded: boolean
  hoverChatVisible: boolean
  shouldShowFloatingBubble: boolean
  shouldShowFocusPill: boolean
  bubbleText: string
  draft: string
  action: PetAction
  petStageRef: RefObject<HTMLElement | null>
  petAnchorRef: RefObject<HTMLDivElement | null>
  dragPositionRef: MutableRefObject<PetStageCanvasState | null>
  isDraggingRef: MutableRefObject<boolean>
  floatingMeasureSettleMs: number
  hoverCapturePadding: number
  /** Whole window stays clickable during tray drag so drops register on transparent chrome. */
  careTrayDragging: boolean
}

const HOVER_CHAT_FORM_BOTTOM_RESERVE = 98

export function usePetWindowEffects({
  currentWindowLabel,
  petWindowLabel,
  pet,
  walkTarget,
  stagePosition,
  setStagePosition,
  clampStagePosition,
  clampFloatingStagePosition,
  floatingWindowInsets,
  floatingWindowMeasured,
  setFloatingWindowInsets,
  setFloatingWindowMeasured,
  floatingWindowBounds,
  hoverChatExpanded,
  hoverChatVisible,
  shouldShowFloatingBubble,
  shouldShowFocusPill,
  bubbleText,
  draft,
  action,
  petStageRef,
  petAnchorRef,
  dragPositionRef,
  isDraggingRef,
  floatingMeasureSettleMs,
  hoverCapturePadding,
  careTrayDragging
}: UsePetWindowEffectsParams) {
  const measureFloatingWindow = useCallback(() => {
    const stage = petStageRef.current
    const anchor = petAnchorRef.current
    if (!stage || !anchor) return false

    const petBody = anchor.querySelector<HTMLElement>('[data-testid="pet-body"]')
    if (!petBody) return false

    const petRect = petBody.getBoundingClientRect()
    const codingBubbleHold = stage.querySelector<HTMLElement>('.bubble-slot.visible .chat-bubble.bubble-emphasis-high') ? 84 : 0
    const petCaptureRect = new DOMRect(
      petRect.left - hoverCapturePadding,
      petRect.top - hoverCapturePadding,
      petRect.width + hoverCapturePadding * 2,
      petRect.height + hoverCapturePadding * 2
    )
    const bubbleRect = shouldShowFloatingBubble ? stage.querySelector<HTMLElement>('.bubble-slot.visible .chat-bubble')?.getBoundingClientRect() : null
    const focusRect = shouldShowFocusPill ? stage.querySelector<HTMLElement>('.floating-status-stack.visible')?.getBoundingClientRect() : null
    const dockRect = anchor.querySelector<HTMLElement>('.chat-dock')?.getBoundingClientRect() ?? null
    const formRect = anchor.querySelector<HTMLElement>('.hover-chat-form')?.getBoundingClientRect() ?? null
    const trayRect = anchor.querySelector<HTMLElement>('.care-tray')?.getBoundingClientRect() ?? null

    const rects = [petRect, petCaptureRect, bubbleRect, focusRect, dockRect, formRect, trayRect].filter((value): value is DOMRect => Boolean(value))
    if (careTrayDragging) rects.push(stage.getBoundingClientRect())
    if (!rects.length) return false

    const minLeft = Math.min(...rects.map((rect) => rect.left))
    const minTop = Math.min(...rects.map((rect) => rect.top))
    const maxRight = Math.max(...rects.map((rect) => rect.right))
    const maxBottom = Math.max(...rects.map((rect) => rect.bottom))
    const hoverFormReserve = hoverChatExpanded || hoverChatVisible ? HOVER_CHAT_FORM_BOTTOM_RESERVE : 0

    const nextInsets = {
      top: Math.max(codingBubbleHold, Math.ceil(petRect.top - minTop)),
      right: Math.max(0, Math.ceil(maxRight - petRect.right)),
      bottom: Math.max(0, Math.ceil(maxBottom - petRect.bottom + hoverFormReserve)),
      left: Math.max(0, Math.ceil(petRect.left - minLeft))
    }

    setFloatingWindowInsets((currentInsets) => {
      if (
        currentInsets.top === nextInsets.top
        && currentInsets.right === nextInsets.right
        && currentInsets.bottom === nextInsets.bottom
        && currentInsets.left === nextInsets.left
      ) {
        return currentInsets
      }
      return nextInsets
    })
    setFloatingWindowMeasured(true)
    return true
  }, [careTrayDragging, hoverCapturePadding, hoverChatExpanded, hoverChatVisible, petAnchorRef, petStageRef, setFloatingWindowInsets, setFloatingWindowMeasured, shouldShowFloatingBubble, shouldShowFocusPill])

  useEffect(() => {
    if (currentWindowLabel !== petWindowLabel || !walkTarget) return
    let frame = 0
    const tick = () => {
      frame = window.requestAnimationFrame(tick)
      setStagePosition((current) => {
        const next = springTowardPoint(current, walkTarget, 0.16)
        return clampStagePosition(next)
      })
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [clampStagePosition, currentWindowLabel, petWindowLabel, setStagePosition, walkTarget])

  useLayoutEffect(() => {
    if (currentWindowLabel !== petWindowLabel || !pet) return

    let settleTimer: number | null = null
    let frameHandle: number | null = null
    let resizeObserver: ResizeObserver | null = null

    const clearScheduledMeasure = () => {
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle)
        frameHandle = null
      }
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer)
        settleTimer = null
      }
    }

    const runMeasure = () => {
      if (measureFloatingWindow()) return
      frameHandle = window.requestAnimationFrame(() => {
        if (measureFloatingWindow()) return
        settleTimer = window.setTimeout(() => {
          measureFloatingWindow()
        }, 32)
      })
    }

    const scheduleMeasure = (delayMs = 0) => {
      clearScheduledMeasure()
      if (delayMs > 0) {
        settleTimer = window.setTimeout(runMeasure, delayMs)
        return
      }
      runMeasure()
    }

    scheduleMeasure()
    if (hoverChatExpanded) scheduleMeasure(floatingMeasureSettleMs)

    const stage = petStageRef.current
    const anchor = petAnchorRef.current
    if (stage && anchor) {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasure(hoverChatExpanded ? floatingMeasureSettleMs : 0)
      })
      resizeObserver.observe(stage)
      resizeObserver.observe(anchor)
      const dock = anchor.querySelector<HTMLElement>('.chat-dock')
      if (dock) resizeObserver.observe(dock)
      const tray = anchor.querySelector<HTMLElement>('.care-tray')
      if (tray) resizeObserver.observe(tray)
    }

    window.addEventListener('resize', runMeasure)
    return () => {
      clearScheduledMeasure()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', runMeasure)
    }
  }, [action, bubbleText, careTrayDragging, currentWindowLabel, draft, floatingMeasureSettleMs, hoverChatExpanded, hoverChatVisible, measureFloatingWindow, pet, petAnchorRef, petStageRef, petWindowLabel])

  useLayoutEffect(() => {
    if (currentWindowLabel !== petWindowLabel || !hoverChatExpanded) return
    let secondFrame: number | null = null
    const firstFrame = window.requestAnimationFrame(() => {
      measureFloatingWindow()
      secondFrame = window.requestAnimationFrame(() => {
        measureFloatingWindow()
      })
    })
    const settleTimer = window.setTimeout(() => {
      measureFloatingWindow()
    }, floatingMeasureSettleMs)

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
      window.clearTimeout(settleTimer)
    }
  }, [currentWindowLabel, floatingMeasureSettleMs, hoverChatExpanded, measureFloatingWindow, petWindowLabel])

  useEffect(() => {
    if (currentWindowLabel !== petWindowLabel) return
    const clamped = clampFloatingStagePosition(stagePosition, floatingWindowInsets)
    if (clamped.x === stagePosition.x && clamped.y === stagePosition.y) return
    dragPositionRef.current = clamped
    setStagePosition(clamped)
  }, [clampFloatingStagePosition, currentWindowLabel, dragPositionRef, floatingWindowInsets, petWindowLabel, setStagePosition, stagePosition])

  useEffect(() => {
    if (currentWindowLabel !== petWindowLabel || !floatingWindowMeasured) return
    reportPetWindowBounds(floatingWindowBounds)
  }, [currentWindowLabel, floatingWindowBounds, floatingWindowMeasured, petWindowLabel])

  useEffect(() => {
    if (currentWindowLabel !== petWindowLabel) return
    ;(window as typeof window & {
      __AI_PET_FLOATING_WINDOW__?: FloatingWindowDebugState
    }).__AI_PET_FLOATING_WINDOW__ = {
      bounds: floatingWindowBounds,
      insets: floatingWindowInsets,
      hoverChatExpanded,
      hoverChatVisible,
      measured: floatingWindowMeasured,
      dragging: isDraggingRef.current
    }
  }, [currentWindowLabel, floatingWindowBounds, floatingWindowInsets, floatingWindowMeasured, hoverChatExpanded, hoverChatVisible, isDraggingRef, petWindowLabel])

  useEffect(() => {
    if (currentWindowLabel !== petWindowLabel) return
    return () => {
      resetReportedPetWindowBounds()
    }
  }, [currentWindowLabel, petWindowLabel])
}
