import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { actionToClipChain, mapActionToMotionProfile, PetCanvas, petAnimationManifest } from './PetCanvas'
import type { PetResolvedVisualState } from '../types/pet'

vi.mock('./PetCutoutCanvas', () => ({
  PetCutoutCanvas: () => <div data-testid="pet-cutout-canvas" />
}))

vi.mock('./PetMeshCanvas', () => ({
  PetMeshCanvas: () => <div data-testid="pet-mesh-canvas" />
}))

const visualState: PetResolvedVisualState = {
  palette: 'cotton-candy',
  overlayIds: [],
  expression: { eyes: 'neutral', mouth: 'neutral' },
  animKey: 'idle'
}

const renderPetCanvas = (handlers?: {
  onPet?: () => void
  onTogglePanel?: () => void
  onPetDragStart?: (event: PointerEvent) => void
  onDockHoverChange?: (hovering: boolean) => void
}) => render(
  <PetCanvas
    action="idle"
    isSleeping={false}
    showDebug={false}
    rendererMode="cutout"
    species="puppy"
    stage="child"
    leanAmount="still"
    visualState={visualState}
    onPet={handlers?.onPet ?? vi.fn()}
    onTogglePanel={handlers?.onTogglePanel ?? vi.fn()}
    onPetDragStart={handlers?.onPetDragStart ?? vi.fn()}
    onDockHoverChange={handlers?.onDockHoverChange ?? vi.fn()}
  />
)

describe('PetCanvas motion scheduling', () => {
  it('maps coding actions to dedicated animation chains', () => {
    expect(actionToClipChain('thinking', false).sequence).toContain('thinking')
    expect(actionToClipChain('celebrating', false).sequence).toContain('celebrating')
    expect(actionToClipChain('failed', false).sequence).toContain('failed')
    expect(actionToClipChain('waiting', false).sequence).toContain('waiting')
    expect(petAnimationManifest.events?.['task-start']).toBe('thinking')
    expect(petAnimationManifest.events?.['task-done']).toBe('celebrating')
    expect(petAnimationManifest.events?.['test-fail']).toBe('failed')
  })

  it('returns richer motion profiles for coding states', () => {
    expect(mapActionToMotionProfile('thinking', false).mode).toBe('thinking')
    expect(mapActionToMotionProfile('reviewing', false).mode).toBe('reviewing')
    expect(mapActionToMotionProfile('failed', false).mode).toBe('failed')
    expect(mapActionToMotionProfile('waiting', false).mode).toBe('waiting')
    expect(mapActionToMotionProfile('celebrating', false).mode).toBe('excited')
  })
})

describe('PetCanvas hover capture', () => {
  it('uses the invisible capture range only for hover state', () => {
    const onDockHoverChange = vi.fn()
    const onTogglePanel = vi.fn()
    const onPet = vi.fn()
    const onPetDragStart = vi.fn()

    renderPetCanvas({ onDockHoverChange, onTogglePanel, onPet, onPetDragStart })

    const hoverCapture = screen.getByTestId('pet-hover-capture')
    fireEvent.pointerEnter(hoverCapture)
    fireEvent.pointerLeave(hoverCapture)
    fireEvent.click(hoverCapture)
    fireEvent.doubleClick(hoverCapture)
    fireEvent.pointerDown(hoverCapture)

    expect(onDockHoverChange).toHaveBeenNthCalledWith(1, true)
    expect(onDockHoverChange).toHaveBeenNthCalledWith(2, false)
    expect(onDockHoverChange).toHaveBeenCalledTimes(2)
    expect(onTogglePanel).not.toHaveBeenCalled()
    expect(onPet).not.toHaveBeenCalled()
    expect(onPetDragStart).not.toHaveBeenCalled()
  })

  it('keeps visible pet interactions on the pet body', () => {
    const onTogglePanel = vi.fn()
    const onPet = vi.fn()
    const onPetDragStart = vi.fn()

    renderPetCanvas({ onTogglePanel, onPet, onPetDragStart })

    const petBody = screen.getByTestId('pet-body')
    fireEvent.pointerDown(petBody)
    fireEvent.click(petBody)
    fireEvent.doubleClick(petBody)

    expect(onPetDragStart).toHaveBeenCalledTimes(1)
    expect(onTogglePanel).toHaveBeenCalledTimes(1)
    expect(onPet).toHaveBeenCalledTimes(1)
  })
})
