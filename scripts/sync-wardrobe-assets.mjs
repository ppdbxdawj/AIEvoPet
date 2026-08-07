#!/usr/bin/env node
// scripts/sync-wardrobe-assets.mjs
//
// Scans src/assets/wardrobe/{category}/{item-id}.png and rewrites the
// `assetUrl: undefined` → `assetUrl: <import-name>` entries in
// src/assets/wardrobe/manifest.ts. Idempotent — running it twice with no
// new files is a no-op.
//
// Usage:
//   node scripts/sync-wardrobe-assets.mjs           # scan + rewrite
//   node scripts/sync-wardrobe-assets.mjs --check   # exit 1 if rewrite needed
//
// What it does:
//   1. Reads manifest.ts to collect every WARDROBE_ITEMS entry's id +
//      category. Source of truth for "what is this asset's name".
//   2. For each id, looks for src/assets/wardrobe/<category>/<id>.png on
//      disk. Missing → keeps the existing manifest line as-is (still
//      undefined → renders placeholder).
//   3. For each found PNG, generates an import alias (camelCased + Url
//      suffix) and:
//        - inserts/updates an `import <alias> from './<category>/<id>.png'`
//          line at the top of the file
//        - swaps `assetUrl: undefined` (or any existing `assetUrl: xxx`) in
//          the matching item entry to `assetUrl: <alias>`
//
// We deliberately do NOT add new manifest entries — adding new wardrobe
// items still requires hand-editing manifest.ts so id/name/mood/price get
// reviewed. This script's only job is wiring already-declared items to
// their freshly-cut PNGs.

import { readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const MANIFEST_PATH = resolve(ROOT, 'src/assets/wardrobe/manifest.ts')
const ASSETS_ROOT = resolve(ROOT, 'src/assets/wardrobe')

const args = new Set(process.argv.slice(2))
const checkOnly = args.has('--check')

const idToAlias = (id) => {
  const camel = id.split(/[-_]/).map((part, i) => i === 0 ? part : part[0].toUpperCase() + part.slice(1)).join('')
  return `${camel}Url`
}

const fileExists = async (path) => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const main = async () => {
  let manifest = await readFile(MANIFEST_PATH, 'utf-8')

  // Pull every (id, category) pair out of the WARDROBE_ITEMS array. Regex
  // is intentionally narrow — we only match entries that look like our
  // hand-written records, not arbitrary objects.
  const itemRegex = /\{\s*id:\s*'([^']+)',\s*nameZh:\s*'[^']+',\s*category:\s*'([^']+)'/g
  const items = []
  let match
  while ((match = itemRegex.exec(manifest)) !== null) {
    items.push({ id: match[1], category: match[2] })
  }
  if (items.length === 0) {
    console.error('no items parsed from manifest — has the format drifted?')
    process.exit(1)
  }

  const presentImports = new Map()
  const importRegex = /^import\s+(\w+)\s+from\s+'\.\/([^']+\.png)'$/gm
  while ((match = importRegex.exec(manifest)) !== null) {
    presentImports.set(match[2], match[1])
  }

  let changed = false
  const importsToAdd = []

  for (const item of items) {
    const relativePngPath = `${item.category}/${item.id}.png`
    const absolutePngPath = join(ASSETS_ROOT, relativePngPath)
    const exists = await fileExists(absolutePngPath)
    if (!exists) continue

    const alias = idToAlias(item.id)

    if (!presentImports.has(relativePngPath)) {
      importsToAdd.push(`import ${alias} from './${relativePngPath}'`)
      changed = true
    }

    // Swap the assetUrl line in the matching item entry. We anchor on
    // `id: '<id>'` and replace the *first* `assetUrl:` after it within
    // the same entry block (closing brace).
    const entryRegex = new RegExp(`(id:\\s*'${item.id}'[\\s\\S]*?assetUrl:\\s*)([^,\\n}]+)`, 'm')
    const entryMatch = manifest.match(entryRegex)
    if (entryMatch) {
      const currentValue = entryMatch[2].trim()
      if (currentValue !== alias) {
        manifest = manifest.replace(entryRegex, `$1${alias}`)
        changed = true
      }
    } else {
      // No assetUrl field at all — inject one before the closing brace.
      const injectRegex = new RegExp(`(id:\\s*'${item.id}'[^}]*?)(\\s*\\})`)
      const injection = manifest.match(injectRegex)
      if (injection) {
        manifest = manifest.replace(injectRegex, `$1, assetUrl: ${alias}$2`)
        changed = true
      }
    }
  }

  if (importsToAdd.length > 0) {
    // Place new imports right after the existing top import block so we
    // don't fight Prettier / TS over import ordering.
    const lastImportRegex = /(^import[\s\S]*?\n)(\n)/m
    const importBlockMatch = manifest.match(lastImportRegex)
    if (importBlockMatch) {
      manifest = manifest.replace(lastImportRegex, `$1${importsToAdd.join('\n')}\n$2`)
    } else {
      manifest = `${importsToAdd.join('\n')}\n${manifest}`
    }
  }

  if (!changed) {
    console.log(`✓ wardrobe manifest already in sync (${items.length} items checked)`)
    return
  }

  if (checkOnly) {
    console.error('✗ wardrobe manifest is out of sync. Run `node scripts/sync-wardrobe-assets.mjs` to fix.')
    process.exit(1)
  }

  await writeFile(MANIFEST_PATH, manifest, 'utf-8')
  console.log(`✓ wardrobe manifest updated (${importsToAdd.length} new imports)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
