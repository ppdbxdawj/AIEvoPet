#!/usr/bin/env node
import { mkdir, readdir, readFile, copyFile, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const sourceDir = process.argv[2]
if (!sourceDir) {
  console.error('Usage: node scripts/import-cutout-variants.mjs <cutout_output_dir>')
  process.exit(1)
}

const sourceRoot = resolve(sourceDir)
const manifestPath = resolve(ROOT, 'src/assets/wardrobe/manifest.ts')
const targetDir = resolve(ROOT, 'src/assets/wardrobe/variants')

const exists = async (path) => {
  try {
    await access(path, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

const readManifestItemIds = async () => {
  const content = await readFile(manifestPath, 'utf8')
  const ids = []
  const regex = /^\s*\{\s*id:\s*'([^']+)'/gm
  for (const match of content.matchAll(regex)) {
    ids.push(match[1])
  }
  if (ids.length === 0) throw new Error('No wardrobe ids found in manifest.ts')
  return ids
}

const main = async () => {
  const ids = await readManifestItemIds()
  await mkdir(targetDir, { recursive: true })

  // Source layout: each item folder contains two model-variant subfolders
  // (e.g. one per image-gen model used during the prompt sweep). Their
  // exact directory names are vendor-specific, so we don't hard-code them
  // — pick the first two subdirectories alphabetically and label them v1/v2.
  // Override with WARDROBE_VARIANT_DIRS=name1,name2 if you need a specific
  // pairing.
  const variantOverride = process.env.WARDROBE_VARIANT_DIRS
  const overridePair = variantOverride ? variantOverride.split(',').map((s) => s.trim()).filter(Boolean) : null
  let resolvedBuckets = null

  const entries = await readdir(sourceRoot, { withFileTypes: true })
  const indexedDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = entry.name.match(/^(\d+)_/)
      if (!match) return null
      return { index: Number(match[1]), name: entry.name }
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)

  let copied = 0
  const missing = []

  for (const entry of indexedDirs) {
    const itemId = ids[entry.index - 1]
    if (!itemId) continue

    // Resolve the two model-variant subdirectories on first use. Either
    // pick them up from the env override, or auto-detect by listing the
    // first item's subfolders alphabetically.
    if (!resolvedBuckets) {
      const subEntries = await readdir(join(sourceRoot, entry.name), { withFileTypes: true })
      const subDirs = subEntries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
      const [a, b] = overridePair && overridePair.length === 2 ? overridePair : subDirs
      if (!a || !b) {
        console.error(`Expected at least two variant subdirs in ${entry.name}, found ${subDirs.length}`)
        process.exit(1)
      }
      resolvedBuckets = [
        { dirName: a, key: 'v1' },
        { dirName: b, key: 'v2' }
      ]
    }

    for (const bucket of resolvedBuckets) {
      const input = join(sourceRoot, entry.name, bucket.dirName, '1_cutout.png')
      if (!(await exists(input))) {
        missing.push(`${itemId} (${bucket.key})`)
        continue
      }
      const output = join(targetDir, `${itemId}__${bucket.key}.png`)
      await copyFile(input, output)
      copied += 1
    }
  }

  console.log(`Imported ${copied} variant images into ${targetDir}`)
  if (missing.length > 0) {
    console.log(`Missing ${missing.length} expected variants:`)
    for (const item of missing) console.log(`  - ${item}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

