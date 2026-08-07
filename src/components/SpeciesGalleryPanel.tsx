import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAppearanceAsset } from '../assets/pet/appearance-registry'
import type { PetData, PetLanguage } from '../types/pet'

export interface SpeciesGalleryOption {
  value: PetData['personality']['species']
  label: string
  labelEn?: string
}

export interface SpeciesGalleryPanelProps {
  options: readonly SpeciesGalleryOption[]
  selected: PetData['personality']['species']
  // Which sprite form to preview. The asset registry maps any non-egg stage
  // back to the pet form internally, so passing the live `pet.state.stage` is
  // safe.
  previewStage?: PetData['state']['stage']
  language: PetLanguage
  onSelect: (value: PetData['personality']['species']) => void
  // Optional pre-select hook so callers (e.g. settings post-hatch) can intercept
  // the click for a confirmation dialog. Return false to abort the change.
  onBeforeSelect?: (value: PetData['personality']['species']) => boolean | Promise<boolean>
  ariaLabel?: string
}

const renderLabel = (option: SpeciesGalleryOption, language: PetLanguage) => (
  language === 'en-US' ? option.labelEn ?? option.label : option.label
)

// One "page" of the gallery is roughly three card-widths. We keep this in a
// constant rather than computing it from `clientWidth` because cards are a
// fixed 96px and feeling small chunks land more predictably than "one full
// viewport worth", which on wide windows would skip 6-7 cards at a time.
const PAGE_SCROLL_PX = 96 * 3 + 10 * 3

export function SpeciesGalleryPanel({
  options,
  selected,
  previewStage,
  language,
  onSelect,
  onBeforeSelect,
  ariaLabel
}: SpeciesGalleryPanelProps) {
  // Default to the hatched pet sprite when no stage is supplied so the gallery
  // works in standalone previews.
  const stageForPreview = previewStage ?? 'baby'
  const trackRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const pointerStateRef = useRef({ x: 0, y: 0 })
  const [pendingValue, setPendingValue] = useState<PetData['personality']['species'] | null>(null)

  const cards = useMemo(() => options.map((option) => {
    const asset = getAppearanceAsset(option.value, stageForPreview)
    const previewSrc = asset.partDefinitions[0]?.imageSrc
    return {
      option,
      label: renderLabel(option, language),
      previewSrc
    }
  }), [options, stageForPreview, language])

  const scrollCardIntoView = useCallback((value: PetData['personality']['species']) => {
    const track = trackRef.current
    const card = cardRefs.current.get(String(value))
    if (!track || !card) return
    const target = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2
    const max = Math.max(0, track.scrollWidth - track.clientWidth)
    track.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: 'smooth' })
  }, [])

  // On first render and whenever `selected` changes, scroll the active card
  // into view so users always see what they currently have picked, even when
  // the gallery overflows. We do this by manually adjusting the track's
  // scrollLeft instead of `scrollIntoView`, because the latter walks every
  // ancestor scroll container and would yank the entire panel around.
  useEffect(() => {
    scrollCardIntoView(selected)
  }, [selected, scrollCardIntoView])

  // Most users hover the gallery and scroll the wheel up/down expecting the
  // row to move horizontally; without a non-passive listener the panel
  // scrolls vertically instead and they think the row is stuck.
  //
  // CRITICAL: we deliberately use the native addEventListener with
  // `{ passive: false }` instead of React's JSX `onWheel` prop because
  // React 18 attaches its delegated wheel listener at the root with
  // `passive: true`. With a passive listener `event.preventDefault()` is
  // silently ignored and the page (or any ancestor) keeps scrolling
  // vertically — which is exactly the "无法横向滚动" complaint that prompted
  // this rewrite.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const handler = (event: WheelEvent) => {
      if (track.scrollWidth <= track.clientWidth) return
      const dominantDelta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (dominantDelta === 0) return
      event.preventDefault()
      track.scrollBy({ left: dominantDelta, behavior: 'auto' })
    }
    track.addEventListener('wheel', handler, { passive: false })
    return () => { track.removeEventListener('wheel', handler) }
  }, [])

  // Click-and-drag horizontal scroll. Trackpad-less mouse users on Windows
  // and many Linux setups have no easy way to scroll a horizontal row even
  // with the wheel fix above (some mice only emit deltaY very small). The
  // drag affordance is the carousel pattern they already know.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let isDragging = false
    let startX = 0
    let startLeft = 0
    let pointerId = -1

    const onPointerDown = (event: PointerEvent) => {
      // Only trigger drag from the track background — clicks on the
      // card buttons themselves should still select normally.
      if ((event.target as HTMLElement)?.closest('.species-gallery-card')) return
      if (event.button !== 0) return
      isDragging = true
      startX = event.clientX
      startLeft = track.scrollLeft
      pointerId = event.pointerId
      try { track.setPointerCapture(pointerId) } catch { /* noop */ }
      track.classList.add('is-dragging')
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!isDragging) return
      track.scrollLeft = startLeft - (event.clientX - startX)
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!isDragging) return
      isDragging = false
      try { track.releasePointerCapture(event.pointerId) } catch { /* noop */ }
      track.classList.remove('is-dragging')
    }

    track.addEventListener('pointerdown', onPointerDown)
    track.addEventListener('pointermove', onPointerMove)
    track.addEventListener('pointerup', onPointerUp)
    track.addEventListener('pointercancel', onPointerUp)
    return () => {
      track.removeEventListener('pointerdown', onPointerDown)
      track.removeEventListener('pointermove', onPointerMove)
      track.removeEventListener('pointerup', onPointerUp)
      track.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])

  const scrollByPage = (direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: PAGE_SCROLL_PX * direction, behavior: 'smooth' })
  }

  const handleClick = async (value: PetData['personality']['species']) => {
    if (value === selected || pendingValue) return
    if (onBeforeSelect) {
      setPendingValue(value)
      try {
        const ok = await onBeforeSelect(value)
        if (!ok) return
      } finally {
        setPendingValue(null)
      }
    }
    onSelect(value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = Math.min(options.length - 1, Math.max(0, index + delta))
    const nextOption = options[nextIndex]
    if (!nextOption) return
    const nextCard = cardRefs.current.get(String(nextOption.value))
    nextCard?.focus()
    // Mirror the auto-scroll-on-select effect for keyboard nav too —
    // otherwise pressing arrow keys past the visible window moves focus
    // off-screen and the user stops seeing the highlight ring.
    scrollCardIntoView(nextOption.value)
  }

  return (
    <div
      className="species-gallery"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="species-gallery-nav-button prev"
        onClick={() => scrollByPage(-1)}
        aria-label={language === 'en-US' ? 'Scroll gallery left' : '向左滚动'}
      >
        ◀
      </button>
      <div ref={trackRef} className="species-gallery-track" data-testid="species-gallery-track">
        {cards.map(({ option, label, previewSrc }, index) => {
          const isActive = option.value === selected
          return (
            <button
              key={option.value}
              ref={(el) => {
                if (el) cardRefs.current.set(String(option.value), el)
                else cardRefs.current.delete(String(option.value))
              }}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-busy={pendingValue === option.value ? true : undefined}
              tabIndex={isActive ? 0 : -1}
              className={`species-gallery-card ${isActive ? 'active' : ''}`}
              disabled={Boolean(pendingValue)}
              onPointerDown={(event) => {
                pointerStateRef.current = { x: event.clientX, y: event.clientY }
              }}
              onPointerUp={(event) => {
                const start = pointerStateRef.current
                if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) return
                void handleClick(option.value)
              }}
              onClick={(event) => {
                if (event.detail === 0) void handleClick(option.value)
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <div className="species-gallery-thumb">
                {previewSrc ? (
                  <img src={previewSrc} alt={label} loading="lazy" draggable={false} />
                ) : (
                  <span className="species-gallery-thumb-fallback" aria-hidden="true">{label.slice(0, 1)}</span>
                )}
              </div>
              <span className="species-gallery-label">{label}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className="species-gallery-nav-button next"
        onClick={() => scrollByPage(1)}
        aria-label={language === 'en-US' ? 'Scroll gallery right' : '向右滚动'}
      >
        ▶
      </button>
    </div>
  )
}
