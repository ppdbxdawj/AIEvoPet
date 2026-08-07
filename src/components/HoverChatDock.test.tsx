import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HoverChatDock } from './HoverChatDock'

describe('HoverChatDock', () => {
  it('renders the compact trigger when collapsed', () => {
    render(
      <HoverChatDock
        visible
        expanded={false}
        panelOpen={false}
        isSleeping={false}
        draft=""
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
        onExpand={() => undefined}
        onCollapse={() => undefined}
      />
    )

    expect(screen.getByRole('button', { name: /聊聊/i })).toBeTruthy()
    expect(screen.getByText('hover 就会展开')).toBeTruthy()
  })

  it('renders the input form when expanded', () => {
    render(
      <HoverChatDock
        visible
        expanded
        panelOpen={false}
        isSleeping={false}
        draft="hi"
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
        onExpand={() => undefined}
        onCollapse={() => undefined}
      />
    )

    expect(screen.getByPlaceholderText('和它搭句话…')).toBeTruthy()
    expect(screen.getByRole('button', { name: '发送' })).toBeTruthy()
  })

  it('shows a disabled thinking state while a reply is loading', () => {
    render(
      <HoverChatDock
        visible
        expanded
        panelOpen={false}
        isSleeping={false}
        draft=""
        loading
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
        onExpand={() => undefined}
        onCollapse={() => undefined}
      />
    )

    expect((screen.getByPlaceholderText('它正在想…') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '思考中' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('propagates draft changes and collapse on escape blur', () => {
    const onDraftChange = vi.fn()
    const onCollapse = vi.fn()

    render(
      <HoverChatDock
        visible
        expanded
        panelOpen={false}
        isSleeping={false}
        draft=""
        onDraftChange={onDraftChange}
        onSubmit={() => undefined}
        onExpand={() => undefined}
        onCollapse={onCollapse}
      />
    )

    const input = screen.getByPlaceholderText('和它搭句话…') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'test' } })
    expect(onDraftChange).toHaveBeenCalledWith('test')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('expands when the compact trigger is clicked', () => {
    const onExpand = vi.fn()

    render(
      <HoverChatDock
        visible
        expanded={false}
        panelOpen={false}
        isSleeping
        draft=""
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
        onExpand={onExpand}
        onCollapse={() => undefined}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /聊聊/i }))
    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(screen.getByText('轻轻叫它一声')).toBeTruthy()
  })

  it('does not keep the dock alive as a pet hover target', () => {
    const onExpand = vi.fn()
    const onCollapse = vi.fn()

    render(
      <HoverChatDock
        visible
        expanded
        panelOpen={false}
        isSleeping={false}
        draft=""
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
        onExpand={onExpand}
        onCollapse={onCollapse}
      />
    )

    const dock = screen.getByPlaceholderText('和它搭句话…').closest('.chat-dock')
    expect(dock).toBeTruthy()
    onExpand.mockClear()

    fireEvent.pointerEnter(dock as Element)
    fireEvent.pointerLeave(dock as Element)

    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })
})
