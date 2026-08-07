import type { PetBubbleContent } from '../types/pet'

interface ChatBubbleProps {
  bubble: PetBubbleContent
}

const bubbleSymbol = (kind: PetBubbleContent['kind']) => {
  if (kind === 'thought') return '…'
  if (kind === 'dream') return '✦'
  return '·'
}

export function ChatBubble({ bubble }: ChatBubbleProps) {
  return (
    <div className={`chat-bubble bubble-${bubble.kind} bubble-tone-${bubble.tone} bubble-emphasis-${bubble.emphasis ?? 'medium'}${bubble.loading ? ' bubble-loading' : ''}${bubble.typing ? ' bubble-typing' : ''}`} role="status" aria-live="polite" aria-busy={bubble.loading ? 'true' : undefined}>
      <span className="chat-bubble-symbol" aria-hidden="true">{bubbleSymbol(bubble.kind)}</span>
      <span className="chat-bubble-text">{bubble.text}</span>
    </div>
  )
}
