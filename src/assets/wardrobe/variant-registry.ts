/**
 * Bundled wardrobe variant registry.
 *
 * File contract:
 *   src/assets/wardrobe/variants/<itemId>__<variantKey>.png
 *
 * Example:
 *   hat-baseball-cap__v1.png
 *   hat-baseball-cap__v2.png
 *
 * We keep variant metadata out of manifest.ts on purpose: artists can drop
 * in additional images for an existing item id without touching the main
 * item table (price/mood/slot). Draw logic picks a random variant per item.
 */

export interface WardrobeAssetVariant {
  key: string
  url: string
}

const modules = import.meta.glob('./variants/*.png', {
  eager: true,
  import: 'default'
}) as Record<string, string>

const byItem: Record<string, WardrobeAssetVariant[]> = {}

for (const [path, url] of Object.entries(modules)) {
  const fileName = path.split('/').pop()?.replace(/\.png$/i, '')
  if (!fileName) continue
  const divider = fileName.lastIndexOf('__')
  if (divider <= 0 || divider >= fileName.length - 2) continue
  const itemId = fileName.slice(0, divider)
  const key = fileName.slice(divider + 2)
  if (!byItem[itemId]) byItem[itemId] = []
  byItem[itemId].push({ key, url })
}

for (const itemId of Object.keys(byItem)) {
  byItem[itemId] = byItem[itemId].slice().sort((a, b) => a.key.localeCompare(b.key))
}

export const BUNDLED_WARDROBE_VARIANTS_BY_ITEM: Readonly<Record<string, WardrobeAssetVariant[]>> =
  Object.freeze(byItem)

export const getBundledWardrobeVariants = (itemId: string): WardrobeAssetVariant[] =>
  BUNDLED_WARDROBE_VARIANTS_BY_ITEM[itemId] ?? []

