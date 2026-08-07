export const applySpring = (current: number, target: number, strength = 0.18) => {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return target
  return current + (target - current) * strength
}

export const springTowardPoint = <T extends { x: number, y: number }>(current: T, target: T, strength = 0.18): T => ({
  ...current,
  x: applySpring(current.x, target.x, strength),
  y: applySpring(current.y, target.y, strength)
})
