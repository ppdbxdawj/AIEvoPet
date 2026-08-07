import { petPlatform } from '../platform/pet-platform'
import type { PetWindowBounds } from '../types/pet'

let lastSent: PetWindowBounds | null = null
let frameHandle: number | null = null

const differsEnough = (next: PetWindowBounds) => {
  if (!lastSent) return true
  return Math.abs(lastSent.x - next.x) > 2
    || Math.abs(lastSent.y - next.y) > 2
    || Math.abs(lastSent.width - next.width) > 2
    || Math.abs(lastSent.height - next.height) > 2
}

export const reportPetWindowBounds = (bounds: PetWindowBounds) => {
  if (frameHandle !== null) window.cancelAnimationFrame(frameHandle)
  frameHandle = window.requestAnimationFrame(() => {
    if (!differsEnough(bounds)) return
    lastSent = bounds
    petPlatform.setPetWindowBounds(bounds)
  })
}

export const resetReportedPetWindowBounds = () => {
  lastSent = null
  if (frameHandle !== null) {
    window.cancelAnimationFrame(frameHandle)
    frameHandle = null
  }
}
