#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const args = process.argv.slice(2)
const species = args.find((arg) => !arg.startsWith('--'))

if (!species) {
  console.error('Usage: node scripts/hatch-emote.mjs <species> [--states=celebrating,failed,waving,jumping,blush] [--frames=8] [--frame-ms=90] [--cell=192x208]')
  process.exit(1)
}

const readOption = (name, fallback) => {
  const prefix = `--${name}=`
  const value = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  return value && value.trim() ? value.trim() : fallback
}

const states = readOption('states', 'celebrating,failed,waving,jumping,blush')
  .split(',')
  .map((state) => state.trim())
  .filter(Boolean)
const frames = Math.max(1, Number(readOption('frames', '8')) || 8)
const frameMs = Math.max(16, Number(readOption('frame-ms', '90')) || 90)
const [cellWidth, cellHeight] = readOption('cell', '192x208')
  .split('x')
  .map((value) => Math.max(1, Number(value) || 0))

if (states.length === 0 || !cellWidth || !cellHeight) {
  console.error('Invalid states or cell size')
  process.exit(1)
}

const outputDir = resolve(ROOT, 'src/assets/pet', species, 'emotes')
const columns = frames
const width = cellWidth * columns
const height = cellHeight * states.length
const rows = Object.fromEntries(states.map((state, row) => [state, { row, frames, frameMs }]))

const manifest = {
  version: 1,
  spritesheet: 'spritesheet.webp',
  cellWidth,
  cellHeight,
  columns,
  rows
}

await mkdir(outputDir, { recursive: true })
await sharp({
  create: {
    width,
    height,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  }
})
  .webp({ lossless: true })
  .toFile(resolve(outputDir, 'spritesheet.webp'))
await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`Created emote scaffold for ${species}: ${outputDir}`)
console.log(`Rows: ${states.join(', ')}`)
