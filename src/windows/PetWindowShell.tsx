import { useEffect, useRef } from 'react'
import type { CSSProperties, FormEvent, RefObject } from 'react'
import { ChatBubble } from '../components/ChatBubble'
import { HoverChatDock } from '../components/HoverChatDock'
import { PetCanvas, type PetHeadCue, type PetRendererMode, type PetWardrobeOverlayItem } from '../components/PetCanvas'
import { CareDragGhost, CareTray, type CareTrayDragPayload } from '../components/CareTray'
import { StickerOverlay } from '../components/StickerOverlay'
import { t } from '../lib/i18n'
import type { PetAction, PetBubbleContent, PetCutoutPlacement, PetData, PetLanguage, PetLeanDirection, PetResolvedVisualState } from '../types/pet'

const formatHeadCueLabel = (kind: PetHeadCue['kind'], label: string, language?: PetLanguage) => {
  const isZh = language !== 'en-US'
  if (kind === 'sleepy') return isZh ? '困了' : 'Sleepy'
  if (kind === 'hungry') return isZh ? '有点饿' : 'Hungry'
  if (kind === 'work') return label.includes("'") || label.includes('OK') ? label : (isZh ? '可去打工' : 'Work ready')
  if (kind === 'earn') return isZh ? '爪币不多' : 'Low coins'
  if (kind === 'spend') return isZh ? '可买装扮' : 'Shop ready'
  if (kind === 'hint') return isZh ? '拖到宠物身上' : 'Drop on pet'
  return label
}

interface PetWindowShellProps {
  pet: PetData
  bubble: PetBubbleContent
  action: PetAction
  visualState: PetResolvedVisualState
  paletteStyle: CSSProperties
  draft: string
  chatLoading: boolean
  hoverChatVisible: boolean
  hoverChatExpanded: boolean
  showMeshDebug: boolean
  showAlignmentEditor: boolean
  rendererMode: PetRendererMode
  cutoutPlacements: PetCutoutPlacement[]
  appliedCutoutPlacements: PetCutoutPlacement[]
  appearanceVariantKey?: string
  appearanceResetKey?: string
  dockLeanDirection?: PetLeanDirection
  dockLeanAmount: 'still' | 'soft' | 'active'
  shouldShowFloatingBubble: boolean
  shouldShowFocusPill: boolean
  floatingWindowAnchorStyle?: CSSProperties
  petStageStyle?: CSSProperties
  teleportEffectKey?: number
  petStageRef: RefObject<HTMLElement | null>
  petAnchorRef: RefObject<HTMLDivElement | null>
  stickerId?: string
  stickerTtlMs?: number
  onStickerExpire?: () => void
  wardrobeOverlays?: PetWardrobeOverlayItem[]
  headCue?: PetHeadCue
  careTray: {
    snackInventoryCount: number
    ghost: { emoji: string; clientX: number; clientY: number } | null
    onAction: (payload: Omit<CareTrayDragPayload, 'ghostEmoji' | 'clientX' | 'clientY'>) => void
    onDragStart: (payload: CareTrayDragPayload) => void
    onDragMove: (clientX: number, clientY: number) => void
    onDragEnd: (clientX: number, clientY: number) => void
  }
  onPet: () => void
  onTogglePanel: () => void
  onPetDragStart: (event: PointerEvent) => void
  onDockHoverChange: (hovering: boolean) => void
  onDraftChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onExpand: () => void
  onCollapse: () => void
}

export function PetWindowShell({
  pet,
  bubble,
  action,
  visualState,
  paletteStyle,
  draft,
  chatLoading,
  hoverChatVisible,
  hoverChatExpanded,
  showMeshDebug,
  showAlignmentEditor,
  rendererMode,
  cutoutPlacements,
  appliedCutoutPlacements,
  appearanceVariantKey,
  appearanceResetKey,
  dockLeanDirection,
  dockLeanAmount,
  shouldShowFloatingBubble,
  shouldShowFocusPill,
  floatingWindowAnchorStyle,
  petStageStyle,
  teleportEffectKey,
  petStageRef,
  petAnchorRef,
  stickerId,
  stickerTtlMs,
  onStickerExpire,
  wardrobeOverlays,
  headCue,
  careTray,
  onPet,
  onTogglePanel,
  onPetDragStart,
  onDockHoverChange,
  onDraftChange,
  onSubmit,
  onExpand,
  onCollapse
}: PetWindowShellProps) {
  const currentSpecies = pet.memory.profile.chosenSpecies ?? pet.personality.species
  const petCanvasKey = `${currentSpecies}:${pet.state.stage}:${appearanceVariantKey ?? 'default'}:${appearanceResetKey ?? 'stable'}`
  const floatingStatusLabel = headCue
    ? formatHeadCueLabel(headCue.kind, headCue.label, pet.ui.language)
    : undefined
  const floatingStatusKind = `cue-${headCue?.kind ?? 'hint'}`
  const isCodingCompletionBubble = shouldShowFloatingBubble && bubble.emphasis === 'high' && /【.+｜(?:完成了任务|需要你操作)】/.test(bubble.text)
  const shouldShowFloatingStatus = !shouldShowFloatingBubble && (shouldShowFocusPill || floatingStatusLabel)
  const shouldCollapseHoverChatOnLeave = hoverChatVisible || hoverChatExpanded
  const collapseRequestedRef = useRef(false)
  const handleFloatingAnchorEnter = () => {
    collapseRequestedRef.current = false
    onDockHoverChange(true)
  }
  const handleFloatingAnchorLeave = () => {
    if (collapseRequestedRef.current) return
    collapseRequestedRef.current = true
    if (!shouldCollapseHoverChatOnLeave) return
    onDockHoverChange(false)
    onCollapse()
  }
  const handlePetCanvasHoverChange = (hovering: boolean) => {
    if (hovering) {
      collapseRequestedRef.current = false
      onDockHoverChange(true)
      return
    }
    if (shouldCollapseHoverChatOnLeave) handleFloatingAnchorLeave()
  }

  useEffect(() => {
    if (!shouldShowFloatingBubble && !hoverChatVisible && !hoverChatExpanded) return

    const targetIsInsideInteractiveSurface = (target: EventTarget | null) => {
      const anchor = petAnchorRef.current
      if (!anchor || !(target instanceof Node) || !anchor.contains(target)) return false
      if (!(target instanceof Element)) return false
      return Boolean(target.closest('.pet-body, .pet-hover-capture, .chat-dock, .hover-chat-form, .care-tray, .care-tray-slot'))
    }

    const hoverStillInsideInteractiveSurface = () => {
      const anchor = petAnchorRef.current
      if (!anchor) return false
      return Boolean(anchor.querySelector('.pet-body:hover, .pet-hover-capture:hover, .chat-dock:hover, .hover-chat-form:hover, .care-tray:hover, .care-tray-slot:hover'))
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (targetIsInsideInteractiveSurface(event.target)) return
      handleFloatingAnchorLeave()
    }

    const handlePointerOut = (event: PointerEvent | MouseEvent) => {
      if (targetIsInsideInteractiveSurface(event.relatedTarget)) return
      handleFloatingAnchorLeave()
    }

    const handleWindowExit = () => {
      handleFloatingAnchorLeave()
    }

    const hoverWatch = window.setInterval(() => {
      if (!hoverChatVisible && !hoverChatExpanded) return
      if (hoverStillInsideInteractiveSurface()) return
      handleFloatingAnchorLeave()
    }, 160)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerout', handlePointerOut)
    window.addEventListener('mouseout', handlePointerOut)
    window.addEventListener('blur', handleWindowExit)
    document.addEventListener('mouseleave', handleWindowExit)
    return () => {
      window.clearInterval(hoverWatch)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerout', handlePointerOut)
      window.removeEventListener('mouseout', handlePointerOut)
      window.removeEventListener('blur', handleWindowExit)
      document.removeEventListener('mouseleave', handleWindowExit)
    }
  }, [hoverChatExpanded, hoverChatVisible, onCollapse, onDockHoverChange, petAnchorRef, shouldCollapseHoverChatOnLeave, shouldShowFloatingBubble])

  return (
    <main className={`pet-app pet-app-pet-window palette-${visualState.palette}`} style={paletteStyle}>
      <section className="pet-stage pet-stage-overlay" style={petStageStyle} ref={petStageRef}>
        <div className={`bubble-slot ${shouldShowFloatingBubble ? 'visible' : 'hidden'} ${isCodingCompletionBubble ? 'bubble-slot-coding' : ''}`} style={floatingWindowAnchorStyle}>
          <ChatBubble bubble={bubble} />
        </div>
        <div className={`floating-status-stack ${shouldShowFloatingStatus ? 'visible' : 'hidden'}`} style={floatingWindowAnchorStyle}>
          {shouldShowFloatingStatus && shouldShowFocusPill ? <span className="floating-status-pill">{t(pet.ui.language, 'focus.pill')}</span> : null}
          {shouldShowFloatingStatus && floatingStatusLabel ? <span className={`floating-status-pill ${floatingStatusKind}`}>{floatingStatusLabel}</span> : null}
        </div>
        <div key={teleportEffectKey ?? 'steady'} className="pet-teleport-effect" aria-hidden />
        <div className="pet-chat-anchor pet-chat-anchor-floating" style={floatingWindowAnchorStyle} ref={petAnchorRef} onPointerEnter={handleFloatingAnchorEnter} onPointerLeave={handleFloatingAnchorLeave}>
          <StickerOverlay stickerId={stickerId} ttlMs={stickerTtlMs} onExpire={onStickerExpire} />
          <PetCanvas
            key={petCanvasKey}
            action={action}
            isSleeping={pet.state.isSleeping}
            showDebug={showMeshDebug}
            rendererMode={showAlignmentEditor ? 'cutout' : rendererMode}
            species={pet.memory.profile.chosenSpecies ?? pet.personality.species}
            stage={pet.state.stage}
            appearanceVariantKey={appearanceVariantKey}
            appearanceResetKey={appearanceResetKey}
            placements={showAlignmentEditor ? cutoutPlacements : appliedCutoutPlacements}
            visualState={visualState}
            wardrobeOverlays={wardrobeOverlays}
            leanDirection={dockLeanDirection}
            leanAmount={dockLeanAmount}
            onPet={onPet}
            onTogglePanel={onTogglePanel}
            onPetDragStart={onPetDragStart}
            onDockHoverChange={handlePetCanvasHoverChange}
          />
          <CareTray
            language={pet.ui.language}
            isSleeping={pet.state.isSleeping}
            snackInventoryCount={careTray.snackInventoryCount}
            onAction={careTray.onAction}
            onDragStart={careTray.onDragStart}
            onDragMove={careTray.onDragMove}
            onDragEnd={careTray.onDragEnd}
          />
          <CareDragGhost
            emoji={careTray.ghost?.emoji ?? ''}
            x={careTray.ghost?.clientX ?? 0}
            y={careTray.ghost?.clientY ?? 0}
            active={Boolean(careTray.ghost)}
          />
          <HoverChatDock
            visible={hoverChatVisible}
            expanded={hoverChatExpanded}
            panelOpen={pet.ui.panelOpen}
            isSleeping={pet.state.isSleeping}
            language={pet.ui.language}
            draft={draft}
            loading={chatLoading}
            onDraftChange={onDraftChange}
            onSubmit={onSubmit}
            onExpand={onExpand}
            onCollapse={onCollapse}
          />
        </div>
      </section>
    </main>
  )
}
