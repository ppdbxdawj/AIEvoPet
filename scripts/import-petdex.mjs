#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const TARGET_ROOT = resolve(ROOT, 'src/assets/pet/imported')

const source = process.argv[2]
if (!source) {
  console.error('Usage: node scripts/import-petdex.mjs <local_codex_pet_dir|pet_json_url|slug>')
  console.error('For slug imports, set PETDEX_BASE_URL to a base containing <slug>/pet.json and <slug>/spritesheet.webp.')
  process.exit(1)
}

const exists = async (path) => {
  try {
    await access(path, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

const safeId = (value) => {
  const id = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 64)
  return id && /^[a-z0-9]/.test(id) ? id : `pet-${Date.now()}`
}

const readLocalSource = async (sourceDir) => {
  const petJsonPath = resolve(sourceDir, 'pet.json')
  const sheetPath = resolve(sourceDir, 'spritesheet.webp')
  if (!(await exists(petJsonPath))) throw new Error(`Missing ${petJsonPath}`)
  if (!(await exists(sheetPath))) throw new Error(`Missing ${sheetPath}`)
  return {
    pet: JSON.parse(await readFile(petJsonPath, 'utf8')),
    spritesheetPath: sheetPath,
    sourceName: basename(resolve(sourceDir))
  }
}

const fetchBytes = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

const readRemoteSource = async (petJsonUrl) => {
  const petUrl = new URL(petJsonUrl)
  const sheetUrl = new URL('spritesheet.webp', petUrl)
  const pet = JSON.parse((await fetchBytes(petUrl)).toString('utf8'))
  return {
    pet,
    spritesheetBytes: await fetchBytes(sheetUrl),
    sourceName: petUrl.pathname.split('/').filter(Boolean).at(-2) ?? petUrl.pathname.split('/').pop() ?? 'petdex-pet'
  }
}

const readSource = async () => {
  if (/^https?:\/\//i.test(source)) return readRemoteSource(source)
  const localPath = resolve(source)
  if (await exists(localPath)) return readLocalSource(localPath)
  const base = process.env.PETDEX_BASE_URL
  if (!base) throw new Error('Slug import needs PETDEX_BASE_URL; pass a local directory or pet.json URL instead.')
  const url = new URL(`${source.replace(/^\/+|\/+$/g, '')}/pet.json`, base.endsWith('/') ? base : `${base}/`)
  return readRemoteSource(String(url))
}

const stateEntries = (pet) => Object.entries(pet.states ?? {})
const rowForState = (pet, preferred) => {
  for (const name of preferred) {
    const state = pet.states?.[name]
    if (state && Number.isFinite(Number(state.row))) return Number(state.row)
  }
  const first = stateEntries(pet)[0]?.[1]
  return Number(first?.row ?? 0)
}

const localizedName = (pet, fallback) => {
  const raw = pet.name ?? pet.displayName ?? fallback
  if (typeof raw === 'string') return { 'zh-CN': raw, 'en-US': raw }
  return {
    'zh-CN': raw?.['zh-CN'] ?? raw?.zh ?? raw?.en ?? fallback,
    'en-US': raw?.['en-US'] ?? raw?.en ?? raw?.['zh-CN'] ?? fallback
  }
}

const main = async () => {
  const input = await readSource()
  const id = safeId(input.pet.id ?? input.pet.slug ?? input.sourceName)
  const outputDir = resolve(TARGET_ROOT, id)
  const emoteDir = join(outputDir, 'emotes')
  const cellWidth = Number(input.pet.cellWidth ?? 192)
  const cellHeight = Number(input.pet.cellHeight ?? 208)
  const columns = Number(input.pet.columns ?? 8)
  const bodyRow = rowForState(input.pet, ['idle', 'default', 'standing'])

  await mkdir(emoteDir, { recursive: true })
  const sheetInput = input.spritesheetBytes ?? input.spritesheetPath
  if (!sheetInput) throw new Error('Missing spritesheet')
  if (input.spritesheetBytes) {
    await writeFile(join(emoteDir, 'spritesheet.webp'), input.spritesheetBytes)
  } else {
    await copyFile(input.spritesheetPath, join(emoteDir, 'spritesheet.webp'))
  }
  await sharp(sheetInput)
    .extract({ left: 0, top: bodyRow * cellHeight, width: cellWidth, height: cellHeight })
    .webp({ lossless: true })
    .toFile(join(outputDir, 'body.webp'))

  const rows = Object.fromEntries(stateEntries(input.pet).map(([name, state]) => {
    const durationMs = Number(state.durationMs ?? 720)
    return [name, { row: Number(state.row ?? 0), frames: columns, frameMs: Math.max(16, Math.round(durationMs / columns)) }]
  }))
  await writeFile(join(emoteDir, 'manifest.json'), `${JSON.stringify({ version: 1, spritesheet: 'spritesheet.webp', cellWidth, cellHeight, columns, rows }, null, 2)}\n`)

  const placement = {
    id: 'body',
    slotId: 'body',
    x: 350,
    y: 438,
    width: 1850,
    height: 1850,
    zIndex: 2,
    visible: true
  }
  const part = {
    id: 'body',
    slotId: 'body',
    label: 'Body',
    image: 'body.webp',
    motionRole: 'none',
    defaultPlacement: placement
  }
  const stage = { renderer: 'cutout', parts: [part] }
  const manifest = {
    format: 'aievopet.petdex.v1',
    id,
    version: input.pet.version ?? '1.0.0',
    name: localizedName(input.pet, id),
    author: input.pet.author,
    license: input.pet.license,
    codex: {
      source: source,
      emotes: 'emotes/manifest.json'
    },
    stages: {
      baby: stage,
      child: stage,
      adult: stage,
      elder: stage
    }
  }
  await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Imported ${id} into ${outputDir}`)
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
