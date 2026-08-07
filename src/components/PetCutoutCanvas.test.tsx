import { describe, expect, it } from 'vitest'
import { calculateFrameCenterOffset, normalizeCutoutPlacement, referenceFrame } from './PetCutoutCanvas'
import type { PetCutoutPlacement } from '../types/pet'

const createPlacement = (overrides: Partial<PetCutoutPlacement>): PetCutoutPlacement => ({
  id: 'body',
  slotId: 'body',
  x: referenceFrame.visibleLeft,
  y: referenceFrame.visibleTop,
  width: 512,
  height: 512,
  zIndex: 1,
  visible: true,
  ...overrides
})

describe('PetCutoutCanvas visual centering', () => {
  it('centers the rendered source frame inside the larger pet shell on both axes', () => {
    expect(calculateFrameCenterOffset()).toBe(20)
  })

  it('normalizes oversized right-pinned placements within the source frame', () => {
    const placement = normalizeCutoutPlacement(createPlacement({
      x: referenceFrame.visibleLeft + referenceFrame.visibleWidth,
      width: 900
    }))

    expect(placement.x + placement.width).toBe(referenceFrame.visibleLeft + referenceFrame.visibleWidth)
  })
})
