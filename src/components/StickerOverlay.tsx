/**
 * Sticker overlay. Sits beside the sprite (or above the bubble) and
 * pops in/out via CSS. Pure visual — selection / lifecycle live in the
 * controller, this just renders whatever id it's given.
 *
 * The overlay intentionally does *not* block clicks on the sprite or
 * bubble: it's pointer-events: none in CSS. Otherwise the sticker
 * would steal clicks away from the pet itself, which is the worst
 * possible UX failure mode for something meant to feel additive.
 */

import { useEffect, useState } from 'react'
import { getStickerById } from '../lib/sticker-registry'
import './StickerOverlay.css'

interface StickerOverlayProps {
  stickerId?: string
  // Time-to-live in ms. The component fades out after this and signals
  // up via onExpire so the caller can clear PetShowState.stickerId.
  ttlMs?: number
  onExpire?: () => void
}

const DEFAULT_TTL_MS = 6000

export function StickerOverlay({ stickerId, ttlMs = DEFAULT_TTL_MS, onExpire }: StickerOverlayProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!stickerId) {
      setVisible(false)
      return
    }
    setVisible(true)
    const handle = window.setTimeout(() => {
      setVisible(false)
      // give the fade-out animation a beat before signaling expiry
      window.setTimeout(() => { onExpire?.() }, 240)
    }, ttlMs)
    return () => { window.clearTimeout(handle) }
  }, [stickerId, ttlMs, onExpire])

  if (!stickerId) return null
  const sticker = getStickerById(stickerId)
  if (!sticker) return null

  return (
    <div className={`sticker-overlay ${visible ? 'visible' : 'hidden'}`} aria-hidden={!visible}>
      <img
        className="sticker-overlay-image"
        src={sticker.src}
        alt={sticker.alt ?? sticker.caption ?? ''}
        draggable={false}
      />
      {sticker.caption ? <span className="sticker-overlay-caption">{sticker.caption}</span> : null}
    </div>
  )
}
