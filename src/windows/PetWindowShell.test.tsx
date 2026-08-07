import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'
import { createDefaultPet } from '../lib/default-pet'
import { PetWindowShell } from './PetWindowShell'
import type { PetResolvedVisualState } from '../types/pet'

vi.mock('../components/PetCanvas', () => ({
  PetCanvas: ({ headCue, onDockHoverChange }: { headCue?: unknown; onDockHoverChange: (hovering: boolean) => void }) => (
    <div
      data-testid="pet-canvas"
      data-head-cue={headCue ? 'yes' : 'no'}
      onPointerEnter={() => onDockHoverChange(true)}
      onPointerLeave={() => onDockHoverChange(false)}
    />
  )
}))

vi.mock('../components/ChatBubble', () => ({
  ChatBubble: ({ bubble }: { bubble: { text: string } }) => <div data-testid="chat-bubble">{bubble.text}</div>
}))

vi.mock('../components/HoverChatDock', () => ({
  HoverChatDock: ({ onCollapse }: { onCollapse: () => void }) => <div className="chat-dock" data-testid="hover-chat-dock" onPointerLeave={onCollapse} />
}))

vi.mock('../components/CareTray', () => ({
  CareTray: () => <div data-testid="care-tray" />,
  CareDragGhost: () => <div data-testid="care-drag-ghost" />
}))

vi.mock('../components/StickerOverlay', () => ({
  StickerOverlay: () => <div data-testid="sticker-overlay" />
}))

const visualState: PetResolvedVisualState = {
  palette: 'cotton-candy',
  overlayIds: [],
  expression: { eyes: 'neutral', mouth: 'neutral' },
  animKey: 'idle'
}

const getHoverSelectorSpy = (matches: boolean) => vi.spyOn(HTMLDivElement.prototype, 'querySelector').mockImplementation((selector: string) => {
  if (selector === '.pet-body:hover, .pet-hover-capture:hover, .chat-dock:hover, .hover-chat-form:hover, .care-tray:hover, .care-tray-slot:hover') {
    return matches ? document.createElement('button') : null
  }
  return null
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const renderPetWindow = (pet = createDefaultPet(), appearanceResetKey?: string) => render(
  <PetWindowShell
    pet={pet}
    bubble={{ kind: 'speech', text: '', tone: 'warm' }}
    action="idle"
    visualState={visualState}
    paletteStyle={{}}
    draft=""
    chatLoading={false}
    hoverChatVisible={false}
    hoverChatExpanded={false}
    showMeshDebug={false}
    showAlignmentEditor={false}
    rendererMode="cutout"
    cutoutPlacements={[]}
    appliedCutoutPlacements={[]}
    appearanceResetKey={appearanceResetKey}
    dockLeanAmount="still"
    shouldShowFloatingBubble={false}
    shouldShowFocusPill={false}
    petStageRef={{ current: null }}
    petAnchorRef={{ current: null }}
    careTray={{
      snackInventoryCount: 0,
      ghost: null,
      onAction: vi.fn(),
      onDragStart: vi.fn(),
      onDragMove: vi.fn(),
      onDragEnd: vi.fn()
    }}
    onPet={vi.fn()}
    onTogglePanel={vi.fn()}
    onPetDragStart={vi.fn()}
    onDockHoverChange={vi.fn()}
    onDraftChange={vi.fn()}
    onSubmit={vi.fn()}
    onExpand={vi.fn()}
    onCollapse={vi.fn()}
  />
)

const renderPetWindowWithBubbleAndCue = () => render(
  <PetWindowShell
    pet={createDefaultPet()}
    bubble={{ kind: 'speech', text: '提醒：开会', tone: 'alert' }}
    action="idle"
    visualState={visualState}
    paletteStyle={{}}
    draft=""
    chatLoading={false}
    hoverChatVisible={true}
    hoverChatExpanded={false}
    showMeshDebug={false}
    showAlignmentEditor={false}
    rendererMode="cutout"
    cutoutPlacements={[]}
    appliedCutoutPlacements={[]}
    dockLeanAmount="still"
    shouldShowFloatingBubble
    shouldShowFocusPill={true}
    petStageRef={{ current: null }}
    petAnchorRef={{ current: null }}
    headCue={{ kind: 'hungry', label: '饿' }}
    careTray={{
      snackInventoryCount: 0,
      ghost: null,
      onAction: vi.fn(),
      onDragStart: vi.fn(),
      onDragMove: vi.fn(),
      onDragEnd: vi.fn()
    }}
    onPet={vi.fn()}
    onTogglePanel={vi.fn()}
    onPetDragStart={vi.fn()}
    onDockHoverChange={vi.fn()}
    onDraftChange={vi.fn()}
    onSubmit={vi.fn()}
    onExpand={vi.fn()}
    onCollapse={vi.fn()}
  />
)

describe('PetWindowShell appearance refresh', () => {
  it('remounts the pet canvas when the selected species changes', () => {
    const pet = createDefaultPet()
    const { rerender } = renderPetWindow(pet, 'first')
    const firstCanvas = screen.getByTestId('pet-canvas')

    const nextPet = {
      ...pet,
      personality: { ...pet.personality, species: 'piglet' as const },
      memory: {
        ...pet.memory,
        profile: {
          ...pet.memory.profile,
          chosenSpecies: 'piglet' as const
        }
      },
      ui: {
        ...pet.ui,
        speciesChangedAt: '2026-05-01T00:00:00.000Z'
      }
    }

    rerender(
      <PetWindowShell
        pet={nextPet}
        bubble={{ kind: 'speech', text: '', tone: 'warm' }}
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        draft=""
        chatLoading={false}
        hoverChatVisible={false}
        hoverChatExpanded={false}
        showMeshDebug={false}
        showAlignmentEditor={false}
        rendererMode="cutout"
        cutoutPlacements={[]}
        appliedCutoutPlacements={[]}
        appearanceResetKey={nextPet.ui.speciesChangedAt}
        dockLeanAmount="still"
        shouldShowFloatingBubble={false}
        shouldShowFocusPill={false}
        petStageRef={{ current: null }}
        petAnchorRef={{ current: null }}
        careTray={{
          snackInventoryCount: 0,
          ghost: null,
          onAction: vi.fn(),
      onDragStart: vi.fn(),
          onDragMove: vi.fn(),
          onDragEnd: vi.fn()
        }}
        onPet={vi.fn()}
        onTogglePanel={vi.fn()}
        onPetDragStart={vi.fn()}
        onDockHoverChange={vi.fn()}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
      />
    )

    expect(screen.getByTestId('pet-canvas')).not.toBe(firstCanvas)
  })
})

describe('PetWindowShell standalone task-done bubble', () => {
  it('keeps reminder text in one chat bubble instead of duplicating it as a status pill', () => {
    renderPetWindowWithBubbleAndCue()

    expect(screen.getByText('提醒：开会')).toBeTruthy()
    expect(screen.queryByText('低打扰陪着你')).toBeNull()
    expect(screen.queryByText('有点饿')).toBeNull()
    expect(screen.getByText('提醒：开会').closest('.floating-status-pill')).toBeNull()
    expect(screen.getByTestId('pet-canvas').getAttribute('data-head-cue')).toBe('no')
  })

  it('keeps a standalone task-completion bubble visible when pointer leaves the pet anchor', () => {
    const onDockHoverChange = vi.fn()
    const onCollapse = vi.fn()
    const petAnchorRef = { current: null } as RefObject<HTMLDivElement | null>

    const { container } = render(
      <PetWindowShell
        pet={createDefaultPet()}
        bubble={{ kind: 'speech', text: '【Claude Code｜完成了任务】\n任务：修复提醒气泡', tone: 'playful', emphasis: 'high' }}
        action="happy"
        visualState={visualState}
        paletteStyle={{}}
        draft=""
        chatLoading={false}
        hoverChatVisible={false}
        hoverChatExpanded={false}
        showMeshDebug={false}
        showAlignmentEditor={false}
        rendererMode="cutout"
        cutoutPlacements={[]}
        appliedCutoutPlacements={[]}
        dockLeanAmount="still"
        shouldShowFloatingBubble
        shouldShowFocusPill={false}
        petStageRef={{ current: null }}
        petAnchorRef={petAnchorRef}
        careTray={{
          snackInventoryCount: 0,
          ghost: null,
          onAction: vi.fn(),
          onDragStart: vi.fn(),
          onDragMove: vi.fn(),
          onDragEnd: vi.fn()
        }}
        onPet={vi.fn()}
        onTogglePanel={vi.fn()}
        onPetDragStart={vi.fn()}
        onDockHoverChange={onDockHoverChange}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onExpand={vi.fn()}
        onCollapse={onCollapse}
      />
    )

    const floatingAnchor = container.querySelector('.pet-chat-anchor-floating')
    expect(floatingAnchor).toBeTruthy()

    fireEvent.pointerLeave(floatingAnchor as Element)

    expect(screen.getByTestId('chat-bubble').textContent).toBe('【Claude Code｜完成了任务】\n任务：修复提醒气泡')
    expect(container.querySelector('.bubble-slot-coding')).toBeTruthy()
    expect(onDockHoverChange).not.toHaveBeenCalled()
    expect(onCollapse).not.toHaveBeenCalled()
  })
})

describe('PetWindowShell hover chat bubble', () => {
  it('collapses the full floating dialog when the pointer leaves the pet body', () => {
    const onDockHoverChange = vi.fn()
    const onCollapse = vi.fn()
    const petAnchorRef = { current: null } as RefObject<HTMLDivElement | null>

    render(
      <PetWindowShell
        pet={createDefaultPet()}
        bubble={{ kind: 'speech', text: '提醒：开会', tone: 'alert' }}
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        draft=""
        chatLoading={false}
        hoverChatVisible
        hoverChatExpanded
        showMeshDebug={false}
        showAlignmentEditor={false}
        rendererMode="cutout"
        cutoutPlacements={[]}
        appliedCutoutPlacements={[]}
        dockLeanAmount="still"
        shouldShowFloatingBubble
        shouldShowFocusPill={false}
        petStageRef={{ current: null }}
        petAnchorRef={petAnchorRef}
        careTray={{
          snackInventoryCount: 0,
          ghost: null,
          onAction: vi.fn(),
          onDragStart: vi.fn(),
          onDragMove: vi.fn(),
          onDragEnd: vi.fn()
        }}
        onPet={vi.fn()}
        onTogglePanel={vi.fn()}
        onPetDragStart={vi.fn()}
        onDockHoverChange={onDockHoverChange}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onExpand={vi.fn()}
        onCollapse={onCollapse}
      />
    )

    fireEvent.pointerLeave(screen.getByTestId('pet-canvas'))

    expect(onDockHoverChange).toHaveBeenCalledWith(false)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('collapses the full floating dialog when pointer leave events are swallowed by the shell window', () => {
    vi.useFakeTimers()
    const onDockHoverChange = vi.fn()
    const onCollapse = vi.fn()
    const petAnchorRef = { current: null } as RefObject<HTMLDivElement | null>

    render(
      <PetWindowShell
        pet={createDefaultPet()}
        bubble={{ kind: 'speech', text: '提醒：开会', tone: 'alert' }}
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        draft=""
        chatLoading={false}
        hoverChatVisible
        hoverChatExpanded
        showMeshDebug={false}
        showAlignmentEditor={false}
        rendererMode="cutout"
        cutoutPlacements={[]}
        appliedCutoutPlacements={[]}
        dockLeanAmount="still"
        shouldShowFloatingBubble
        shouldShowFocusPill={false}
        petStageRef={{ current: null }}
        petAnchorRef={petAnchorRef}
        careTray={{
          snackInventoryCount: 0,
          ghost: null,
          onAction: vi.fn(),
          onDragStart: vi.fn(),
          onDragMove: vi.fn(),
          onDragEnd: vi.fn()
        }}
        onPet={vi.fn()}
        onTogglePanel={vi.fn()}
        onPetDragStart={vi.fn()}
        onDockHoverChange={onDockHoverChange}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onExpand={vi.fn()}
        onCollapse={onCollapse}
      />
    )
    getHoverSelectorSpy(false)

    act(() => {
      vi.advanceTimersByTime(161)
    })

    expect(onDockHoverChange).toHaveBeenCalledWith(false)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('collapses the full floating dialog when the pointer leaves the pet anchor', () => {
    const onDockHoverChange = vi.fn()
    const onCollapse = vi.fn()
    const petAnchorRef = { current: null } as RefObject<HTMLDivElement | null>

    const { container } = render(
      <PetWindowShell
        pet={createDefaultPet()}
        bubble={{ kind: 'speech', text: '提醒：开会', tone: 'alert' }}
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        draft=""
        chatLoading={false}
        hoverChatVisible
        hoverChatExpanded
        showMeshDebug={false}
        showAlignmentEditor={false}
        rendererMode="cutout"
        cutoutPlacements={[]}
        appliedCutoutPlacements={[]}
        dockLeanAmount="still"
        shouldShowFloatingBubble
        shouldShowFocusPill={false}
        petStageRef={{ current: null }}
        petAnchorRef={petAnchorRef}
        careTray={{
          snackInventoryCount: 0,
          ghost: null,
          onAction: vi.fn(),
          onDragStart: vi.fn(),
          onDragMove: vi.fn(),
          onDragEnd: vi.fn()
        }}
        onPet={vi.fn()}
        onTogglePanel={vi.fn()}
        onPetDragStart={vi.fn()}
        onDockHoverChange={onDockHoverChange}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onExpand={vi.fn()}
        onCollapse={onCollapse}
      />
    )

    const floatingAnchor = container.querySelector('.pet-chat-anchor-floating')
    expect(floatingAnchor).toBeTruthy()

    fireEvent.pointerLeave(floatingAnchor as Element)

    expect(onDockHoverChange).toHaveBeenCalledWith(false)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('collapses the full floating dialog when the pointer moves outside without an anchor leave event', () => {
    const onDockHoverChange = vi.fn()
    const onCollapse = vi.fn()
    const petAnchorRef = { current: null } as RefObject<HTMLDivElement | null>

    const outside = document.createElement('div')
    document.body.appendChild(outside)

    const { container, unmount } = render(
      <PetWindowShell
        pet={createDefaultPet()}
        bubble={{ kind: 'speech', text: '提醒：开会', tone: 'alert' }}
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        draft=""
        chatLoading={false}
        hoverChatVisible
        hoverChatExpanded
        showMeshDebug={false}
        showAlignmentEditor={false}
        rendererMode="cutout"
        cutoutPlacements={[]}
        appliedCutoutPlacements={[]}
        dockLeanAmount="still"
        shouldShowFloatingBubble
        shouldShowFocusPill={false}
        petStageRef={{ current: null }}
        petAnchorRef={petAnchorRef}
        careTray={{
          snackInventoryCount: 0,
          ghost: null,
          onAction: vi.fn(),
          onDragStart: vi.fn(),
          onDragMove: vi.fn(),
          onDragEnd: vi.fn()
        }}
        onPet={vi.fn()}
        onTogglePanel={vi.fn()}
        onPetDragStart={vi.fn()}
        onDockHoverChange={onDockHoverChange}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onExpand={vi.fn()}
        onCollapse={onCollapse}
      />
    )

    const floatingAnchor = container.querySelector('.pet-chat-anchor-floating')
    expect(floatingAnchor).toBeTruthy()
    expect(petAnchorRef.current).toBe(floatingAnchor)

    fireEvent.pointerMove(window, { target: outside })

    expect(onDockHoverChange).toHaveBeenCalledWith(false)
    expect(onCollapse).toHaveBeenCalledTimes(1)

    unmount()
    outside.remove()
  })

  it('collapses the full floating dialog when the pointer leaves the window chrome', () => {
    const onDockHoverChange = vi.fn()
    const onCollapse = vi.fn()
    const petAnchorRef = { current: null } as RefObject<HTMLDivElement | null>

    const { container } = render(
      <PetWindowShell
        pet={createDefaultPet()}
        bubble={{ kind: 'speech', text: '提醒：开会', tone: 'alert' }}
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        draft=""
        chatLoading={false}
        hoverChatVisible
        hoverChatExpanded
        showMeshDebug={false}
        showAlignmentEditor={false}
        rendererMode="cutout"
        cutoutPlacements={[]}
        appliedCutoutPlacements={[]}
        dockLeanAmount="still"
        shouldShowFloatingBubble
        shouldShowFocusPill={false}
        petStageRef={{ current: null }}
        petAnchorRef={petAnchorRef}
        careTray={{
          snackInventoryCount: 0,
          ghost: null,
          onAction: vi.fn(),
          onDragStart: vi.fn(),
          onDragMove: vi.fn(),
          onDragEnd: vi.fn()
        }}
        onPet={vi.fn()}
        onTogglePanel={vi.fn()}
        onPetDragStart={vi.fn()}
        onDockHoverChange={onDockHoverChange}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onExpand={vi.fn()}
        onCollapse={onCollapse}
      />
    )

    const floatingAnchor = container.querySelector('.pet-chat-anchor-floating')
    expect(floatingAnchor).toBeTruthy()

    fireEvent.pointerOut(window, { target: floatingAnchor, relatedTarget: null })

    expect(onDockHoverChange).toHaveBeenCalledWith(false)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('keeps the full floating dialog while moving between pet and chat dock', () => {
    const onDockHoverChange = vi.fn()
    const onCollapse = vi.fn()
    const petAnchorRef = { current: null } as RefObject<HTMLDivElement | null>

    const { container } = render(
      <PetWindowShell
        pet={createDefaultPet()}
        bubble={{ kind: 'speech', text: '提醒：开会', tone: 'alert' }}
        action="idle"
        visualState={visualState}
        paletteStyle={{}}
        draft=""
        chatLoading={false}
        hoverChatVisible
        hoverChatExpanded
        showMeshDebug={false}
        showAlignmentEditor={false}
        rendererMode="cutout"
        cutoutPlacements={[]}
        appliedCutoutPlacements={[]}
        dockLeanAmount="still"
        shouldShowFloatingBubble
        shouldShowFocusPill={false}
        petStageRef={{ current: null }}
        petAnchorRef={petAnchorRef}
        careTray={{
          snackInventoryCount: 0,
          ghost: null,
          onAction: vi.fn(),
          onDragStart: vi.fn(),
          onDragMove: vi.fn(),
          onDragEnd: vi.fn()
        }}
        onPet={vi.fn()}
        onTogglePanel={vi.fn()}
        onPetDragStart={vi.fn()}
        onDockHoverChange={onDockHoverChange}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onExpand={vi.fn()}
        onCollapse={onCollapse}
      />
    )

    const petCanvas = screen.getByTestId('pet-canvas')
    const dock = screen.getByTestId('hover-chat-dock')
    expect(container.querySelector('.pet-chat-anchor-floating')).toBeTruthy()

    fireEvent.pointerOut(window, { target: petCanvas, relatedTarget: dock })

    expect(onDockHoverChange).not.toHaveBeenCalledWith(false)
    expect(onCollapse).not.toHaveBeenCalled()
  })
})
