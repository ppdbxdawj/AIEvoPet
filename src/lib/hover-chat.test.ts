import { describe, expect, it } from 'vitest'
import {
  HOVER_CHAT_DELAY_MS,
  HOVER_CHAT_HIDE_DELAY_MS,
  createCollapsedHoverChatState,
  createExpandedHoverChatState,
  getHoverChatDockSchedule,
  getHoverChatSubmitCompletionState,
  shouldCollapseHoverChatAfterSubmit
} from './hover-chat'

describe('hover chat state helpers', () => {
  it('creates the collapsed dock state', () => {
    expect(createCollapsedHoverChatState()).toEqual({
      visible: false,
      expanded: false
    })
  })

  it('creates the expanded dock state', () => {
    expect(createExpandedHoverChatState()).toEqual({
      visible: true,
      expanded: true
    })
  })

  it('schedules expanded state on hover enter', () => {
    expect(getHoverChatDockSchedule({ hovering: true, panelOpen: false, hasDraft: false })).toEqual({
      kind: 'show',
      delayMs: HOVER_CHAT_DELAY_MS,
      nextState: { visible: true, expanded: true }
    })
  })

  it('schedules collapsed state on hover leave without draft', () => {
    expect(getHoverChatDockSchedule({ hovering: false, panelOpen: false, hasDraft: false })).toEqual({
      kind: 'hide',
      delayMs: HOVER_CHAT_HIDE_DELAY_MS,
      nextState: { visible: false, expanded: false }
    })
  })

  it('does not schedule changes while panel is open', () => {
    expect(getHoverChatDockSchedule({ hovering: true, panelOpen: true, hasDraft: false })).toBeNull()
    expect(getHoverChatDockSchedule({ hovering: false, panelOpen: true, hasDraft: false })).toBeNull()
  })

  it('does not auto-hide while draft exists', () => {
    expect(getHoverChatDockSchedule({ hovering: false, panelOpen: false, hasDraft: true })).toBeNull()
  })

  it('collapses after chat submit completes when no pointer or panel keeps it open', () => {
    expect(shouldCollapseHoverChatAfterSubmit({ hovering: false, panelOpen: false })).toBe(true)
    expect(getHoverChatSubmitCompletionState({ hovering: false, panelOpen: false })).toEqual({
      visible: false,
      expanded: false
    })
  })

  it('keeps the compact trigger after submit when pointer or panel still owns it', () => {
    expect(shouldCollapseHoverChatAfterSubmit({ hovering: true, panelOpen: false })).toBe(false)
    expect(shouldCollapseHoverChatAfterSubmit({ hovering: false, panelOpen: true })).toBe(false)
    expect(getHoverChatSubmitCompletionState({ hovering: true, panelOpen: false })).toEqual({
      visible: true,
      expanded: false
    })
    expect(getHoverChatSubmitCompletionState({ hovering: false, panelOpen: true })).toEqual({
      visible: true,
      expanded: false
    })
  })
})
