import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SpeciesGalleryPanel, type SpeciesGalleryOption } from './SpeciesGalleryPanel'

const baseOptions: SpeciesGalleryOption[] = [
  { value: 'puppy' as never, label: '小狗', labelEn: 'Puppy' },
  { value: 'piglet' as never, label: '小猪', labelEn: 'Piglet' },
  { value: 'prompt-1' as never, label: '生成宠物 1', labelEn: 'Generated 1' },
  { value: 'prompt-2' as never, label: '生成宠物 2', labelEn: 'Generated 2' }
]

beforeEach(() => {
  // jsdom doesn't implement scrollTo / scrollBy on Element. Stub them so
  // the component's auto-scroll-on-mount and arrow-button handlers don't
  // crash the render. We assert calls separately further down.
  Element.prototype.scrollTo = vi.fn() as never
  Element.prototype.scrollBy = vi.fn() as never
})

describe('SpeciesGalleryPanel', () => {
  it('renders one button per species option with the localized label', () => {
    render(
      <SpeciesGalleryPanel
        options={baseOptions}
        selected={'puppy' as never}
        language="zh-CN"
        onSelect={() => undefined}
      />
    )

    expect(screen.getByRole('radio', { name: /小狗/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /小猪/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /生成宠物 1/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /生成宠物 2/ })).toBeTruthy()
  })

  it('marks the selected card aria-checked and fires onSelect on tap', () => {
    const onSelect = vi.fn()
    render(
      <SpeciesGalleryPanel
        options={baseOptions}
        selected={'piglet' as never}
        language="zh-CN"
        onSelect={onSelect}
      />
    )

    const piglet = screen.getByRole('radio', { name: /小猪/ })
    expect(piglet.getAttribute('aria-checked')).toBe('true')
    const puppy = screen.getByRole('radio', { name: /小狗/ })
    expect(puppy.getAttribute('aria-checked')).toBe('false')

    fireEvent.pointerDown(puppy, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(puppy, { clientX: 10, clientY: 10 })
    expect(onSelect).toHaveBeenCalledWith('puppy')
  })

  it('skips onSelect when the active card is clicked again (no-op)', () => {
    const onSelect = vi.fn()
    render(
      <SpeciesGalleryPanel
        options={baseOptions}
        selected={'puppy' as never}
        language="zh-CN"
        onSelect={onSelect}
      />
    )
    const puppy = screen.getByRole('radio', { name: /小狗/ })
    fireEvent.pointerDown(puppy, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(puppy, { clientX: 10, clientY: 10 })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('lets onBeforeSelect cancel the change by returning false', async () => {
    const onSelect = vi.fn()
    const onBeforeSelect = vi.fn(async () => false)
    render(
      <SpeciesGalleryPanel
        options={baseOptions}
        selected={'puppy' as never}
        language="zh-CN"
        onSelect={onSelect}
        onBeforeSelect={onBeforeSelect}
      />
    )
    const piglet = screen.getByRole('radio', { name: /小猪/ })
    fireEvent.pointerDown(piglet, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(piglet, { clientX: 10, clientY: 10 })
    // onBeforeSelect runs first; awaiting a tick flushes the microtask.
    await Promise.resolve()
    await Promise.resolve()
    expect(onBeforeSelect).toHaveBeenCalledWith('piglet')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ignores drag gestures on cards so scrolling does not accidentally select', () => {
    const onSelect = vi.fn()
    render(
      <SpeciesGalleryPanel
        options={baseOptions}
        selected={'puppy' as never}
        language="zh-CN"
        onSelect={onSelect}
      />
    )
    const piglet = screen.getByRole('radio', { name: /小猪/ })
    fireEvent.pointerDown(piglet, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(piglet, { clientX: 42, clientY: 10 })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders both nav arrows and calls scrollBy when they are clicked', () => {
    const scrollBy = vi.fn()
    Element.prototype.scrollBy = scrollBy as never
    render(
      <SpeciesGalleryPanel
        options={baseOptions}
        selected={'puppy' as never}
        language="zh-CN"
        onSelect={() => undefined}
      />
    )

    const prev = screen.getByRole('button', { name: /向左滚动/ })
    const next = screen.getByRole('button', { name: /向右滚动/ })
    fireEvent.click(next)
    fireEvent.click(prev)

    expect(scrollBy).toHaveBeenCalledTimes(2)
    const [firstCall, secondCall] = scrollBy.mock.calls as Array<[ScrollToOptions]>
    expect(firstCall[0]?.left).toBeGreaterThan(0)
    expect(secondCall[0]?.left).toBeLessThan(0)
  })

  it('exposes English labels when language is en-US', () => {
    render(
      <SpeciesGalleryPanel
        options={baseOptions}
        selected={'puppy' as never}
        language="en-US"
        onSelect={() => undefined}
      />
    )

    expect(screen.getByRole('radio', { name: /Puppy/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Scroll gallery left/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Scroll gallery right/ })).toBeTruthy()
  })
})
