export interface HoverChatState {
  visible: boolean
  expanded: boolean
}

export interface HoverChatDockSchedule {
  kind: 'show' | 'hide'
  delayMs: number
  nextState: HoverChatState
}

export const HOVER_CHAT_DELAY_MS = 360
export const HOVER_CHAT_HIDE_DELAY_MS = 160

export const createCollapsedHoverChatState = (): HoverChatState => ({
  visible: false,
  expanded: false
})

export const createExpandedHoverChatState = (): HoverChatState => ({
  visible: true,
  expanded: true
})

export const shouldCollapseHoverChatAfterSubmit = ({
  hovering,
  panelOpen
}: {
  hovering: boolean
  panelOpen: boolean
}) => !hovering && !panelOpen

export const getHoverChatSubmitCompletionState = ({
  hovering,
  panelOpen
}: {
  hovering: boolean
  panelOpen: boolean
}): HoverChatState => shouldCollapseHoverChatAfterSubmit({ hovering, panelOpen })
  ? createCollapsedHoverChatState()
  : { visible: true, expanded: false }

export const getHoverChatDockSchedule = ({
  hovering,
  panelOpen,
  hasDraft
}: {
  hovering: boolean
  panelOpen: boolean
  hasDraft: boolean
}): HoverChatDockSchedule | null => {
  if (panelOpen) return null

  if (hovering) {
    return {
      kind: 'show',
      delayMs: HOVER_CHAT_DELAY_MS,
      nextState: createExpandedHoverChatState()
    }
  }

  if (hasDraft) return null

  return {
    kind: 'hide',
    delayMs: HOVER_CHAT_HIDE_DELAY_MS,
    nextState: createCollapsedHoverChatState()
  }
}
