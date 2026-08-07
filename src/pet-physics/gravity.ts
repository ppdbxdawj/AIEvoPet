const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const settleToFloor = (y: number, floorY: number, bounce = 0.12) => {
  if (y < floorY) return Math.min(floorY, y + Math.max(6, (floorY - y) * 0.2))
  return clamp(floorY - (y - floorY) * bounce, floorY - 6, floorY)
}
