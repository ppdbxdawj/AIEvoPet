import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CareTray } from './CareTray'

describe('CareTray', () => {
  it('keeps care actions available for hover-revealed drag controls', () => {
    const onAction = vi.fn()
    const onDragStart = vi.fn()
    const onDragMove = vi.fn()
    const onDragEnd = vi.fn()

    render(
      <CareTray
        language="zh-CN"
        isSleeping={false}
        snackInventoryCount={1}
        onAction={onAction}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />
    )

    expect(screen.getByTestId('care-tray')).toBeTruthy()
    const feedButton = screen.getByRole('button', { name: '食物' })
    fireEvent.pointerDown(feedButton, { pointerId: 1, clientX: 10, clientY: 20 })
    fireEvent.pointerMove(feedButton, { pointerId: 1, clientX: 12, clientY: 24 })
    fireEvent.pointerUp(feedButton, { pointerId: 1, clientX: 14, clientY: 28 })

    expect(onDragStart).toHaveBeenCalledWith(expect.objectContaining({ interaction: 'feed', inventoryItemId: 'snack-pack' }))
    expect(onDragMove).toHaveBeenCalledWith(12, 24)
    expect(onDragEnd).toHaveBeenCalledWith(14, 28)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('runs the care action directly on a tap without leaving drag state behind', () => {
    const onAction = vi.fn()
    const onDragStart = vi.fn()
    const onDragEnd = vi.fn()

    render(
      <CareTray
        language="zh-CN"
        isSleeping={false}
        snackInventoryCount={0}
        onAction={onAction}
        onDragStart={onDragStart}
        onDragMove={vi.fn()}
        onDragEnd={onDragEnd}
      />
    )

    const petButton = screen.getByRole('button', { name: '摸摸' })
    fireEvent.pointerDown(petButton, { pointerId: 1, clientX: 10, clientY: 20 })
    fireEvent.pointerUp(petButton, { pointerId: 1, clientX: 10, clientY: 20 })

    expect(onDragEnd).toHaveBeenCalledWith(-1, -1)
    expect(onAction).toHaveBeenCalledWith({ interaction: 'pet', inventoryItemId: undefined })
  })
})
