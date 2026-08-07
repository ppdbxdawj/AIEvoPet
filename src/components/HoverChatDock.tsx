import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'
import { t } from '../lib/i18n'
import type { PetLanguage } from '../types/pet'

interface HoverChatDockProps {
  visible: boolean
  expanded: boolean
  panelOpen: boolean
  isSleeping: boolean
  language?: PetLanguage
  draft: string
  loading?: boolean
  onDraftChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onExpand: () => void
  onCollapse: () => void
}

export function HoverChatDock({
  visible,
  expanded,
  panelOpen,
  isSleeping,
  language,
  draft,
  loading = false,
  onDraftChange,
  onSubmit,
  onExpand,
  onCollapse
}: HoverChatDockProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onDraftChange(event.target.value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && !panelOpen) {
      event.currentTarget.blur()
    }
  }

  return (
    <div
      className={`chat-dock ${visible || panelOpen ? 'visible' : 'hidden'} ${expanded ? 'expanded' : ''}`}
      onPointerEnter={() => {
        if (!panelOpen) onExpand()
      }}
      onPointerLeave={() => {
        if (!panelOpen && !loading && !draft.trim()) onCollapse()
      }}
    >
      {expanded || panelOpen ? (
        <form className={`hover-chat-form${loading ? ' thinking' : ''}`} onSubmit={onSubmit} aria-busy={loading ? 'true' : undefined}>
          <input
            value={draft}
            onChange={handleChange}
            onFocus={() => {
              if (!panelOpen) onExpand()
            }}
            onBlur={() => {
              if (!panelOpen && !loading && !draft.trim()) onCollapse()
            }}
            onKeyDown={handleKeyDown}
            placeholder={loading ? t(language, 'hover.placeholder.loading') : t(language, 'hover.placeholder.idle')}
            autoFocus={expanded && !panelOpen}
            disabled={loading}
          />
          <button type="submit" disabled={loading}>{loading ? t(language, 'hover.button.loading') : t(language, 'hover.button.send')}</button>
        </form>
      ) : (
        <button type="button" className="chat-dock-trigger" onClick={onExpand}>
          <span>{t(language, 'hover.trigger.title')}</span>
          <small>{isSleeping ? t(language, 'hover.trigger.sleeping') : t(language, 'hover.trigger.awake')}</small>
        </button>
      )}
    </div>
  )
}
