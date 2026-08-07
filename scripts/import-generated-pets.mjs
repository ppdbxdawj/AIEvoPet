#!/usr/bin/env node
// scripts/import-generated-pets.mjs
//
// One-shot data pipeline for importing 63 generated pet sprites delivered as
// JPEG-with-.png-extension files in a flat folder tree. For each prompt
// index N (1..63) the expected source layout is:
//
//   <SRC_ROOT>/{N}_<prompt-text>/<model-variant-A>/1.png
//   <SRC_ROOT>/{N}_<prompt-text>/<model-variant-B>/1.png
//
// Each "1.png" is a 2560x2560 JPEG (white background, thick black outline
// pixel art). The desktop pet renderer needs PNG with alpha, sized
// reasonably for the bundle. So this script:
//
//   1. Reads the prompt CSV (path overridable via PROMPT_CSV env var) to
//      map prompt index to friendly label text.
//   2. For each prompt index, walks both variant subdirs in deterministic
//      alphabetical order — v1 from the first subdir, v2 from the second.
//   3. For every variant: decodes the JPEG, resizes to a fixed square,
//      flood-fills from the 4 edges with a tolerant near-white threshold
//      so the white background becomes alpha=0 while interior whites
//      (bounded by the black outline) stay opaque. Writes PNG to
//      src/assets/pet/generated/prompt-{N}-v{1|2}.png.
//   4. Emits src/assets/pet/generated-manifest.json with the canonical
//      species id, labels, prompt index, and the variant filenames.
//
// Idempotent: re-running overwrites the same output paths. Safe to invoke
// after asset regeneration.
//
// Usage:
//   SRC_ROOT=/path/to/source node scripts/import-generated-pets.mjs
//   PROMPT_CSV=/path/to/prompts.csv SRC_ROOT=... node scripts/import-generated-pets.mjs
//
// Note: this is a maintainer-side reproduction script. The committed
// src/assets/pet/generated/ already contains the 63 species, so most
// contributors never need to run it. SRC_ROOT must be set explicitly to
// avoid accidentally re-importing from an unrelated path.

import sharp from 'sharp'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const SRC_ROOT = process.env.SRC_ROOT
if (!SRC_ROOT) {
  console.error('SRC_ROOT env var is required, e.g.:')
  console.error('  SRC_ROOT=/path/to/source node scripts/import-generated-pets.mjs')
  process.exit(1)
}
const OUT_DIR = resolve(ROOT, 'src/assets/pet/generated')
const MANIFEST_PATH = resolve(ROOT, 'src/assets/pet/generated-manifest.json')
const CSV_PATH = resolve(ROOT, process.env.PROMPT_CSV ?? 'docs/pet-prompts.csv')

// Resize target. The existing puppy sprite is 844x789 RGBA, so 512x512 keeps
// the same order of magnitude on disk while leaving plenty of fidelity for
// a sprite that renders at ~208 CSS px (≈416 px on Retina).
const TARGET_SIZE = 512

// Friendly labels per prompt index. CSV row N (header excluded) → labels[N-1].
// Hand-curated to keep both languages readable without translating the full
// prompt sentence. Add or correct entries as new prompts are appended.
const labels = [
  { zh: '电系黄鼠狼', en: 'Electric weasel' },
  { zh: '火系小龙', en: 'Fire dragon' },
  { zh: '水系小龟', en: 'Water turtle' },
  { zh: '草系种子蛙', en: 'Grass frog' },
  { zh: '偶像系小猫', en: 'Idol kitten' },
  { zh: '黑白小熊猫', en: 'Panda cub' },
  { zh: '柴犬幼犬', en: 'Shiba puppy' },
  { zh: '奶牛小牛', en: 'Holstein calf' },
  { zh: '小企鹅', en: 'Penguin chick' },
  { zh: '圆胖考拉', en: 'Round koala' },
  { zh: '机械兔子', en: 'Mecha rabbit' },
  { zh: '赛博狐狸', en: 'Cyber fox' },
  { zh: '魔法猫头鹰', en: 'Magic owlet' },
  { zh: '圆胖仓鼠', en: 'Round hamster' },
  { zh: '小浣熊', en: 'Raccoon cub' },
  { zh: '小老虎', en: 'Tiger cub' },
  { zh: '雪原白狐', en: 'Arctic fox' },
  { zh: '沙漠耳廓狐', en: 'Desert fennec' },
  { zh: '热带鹦鹉', en: 'Tropical parrotlet' },
  { zh: '圆胖水獭', en: 'Round otter' },
  { zh: '法斗幼犬', en: 'Frenchie pup' },
  { zh: '羊驼幼崽', en: 'Alpaca calf' },
  { zh: '迷你章鱼', en: 'Mini octopus' },
  { zh: '蘑菇精灵', en: 'Mushroom sprite' },
  { zh: '云朵史莱姆', en: 'Cloud slime' },
  { zh: '小恶魔蝙蝠', en: 'Demon batling' },
  { zh: '柯基幼犬', en: 'Corgi puppy' },
  { zh: '外星小猫', en: 'Alien kitten' },
  { zh: '像素恐龙', en: 'Pixel dino' },
  { zh: '哈士奇幼犬', en: 'Husky puppy' },
  { zh: '长毛小猫', en: 'Longhair kitten' },
  { zh: '朋克小刺猬', en: 'Punk hedgehog' },
  { zh: '圆滚小白兔', en: 'Snow bunny' },
  { zh: '金黑小猫', en: 'Sleek black cat' },
  { zh: '深海灯笼鱼', en: 'Lanternfish fry' },
  { zh: '小鹿', en: 'Spotted fawn' },
  { zh: '太空企鹅', en: 'Space penguin' },
  { zh: '蒸汽小青蛙', en: 'Steam frog' },
  { zh: '独角猫', en: 'Unicorn kitten' },
  { zh: '幽灵小狗', en: 'Ghost puppy' },
  { zh: '圆胖小河马', en: 'Round hippo' },
  { zh: '奶白小熊猫', en: 'Cream panda' },
  { zh: '绿壳小海龟', en: 'Sea turtle hatchling' },
  { zh: '月白小兔', en: 'Moon bunny' },
  { zh: '赛马型小马', en: 'Pony jockey' },
  { zh: '电玩史莱姆', en: 'Arcade slime' },
  { zh: '锦鲤龙猫', en: 'Koi chinchilla' },
  { zh: '北欧驯鹿', en: 'Reindeer calf' },
  { zh: '西部柯基', en: 'Wild west corgi' },
  { zh: '纯黑小猫', en: 'Black kitten' },
  { zh: '狐獴幼崽', en: 'Meerkat cub' },
  { zh: '电竞仓鼠', en: 'Esports hamster' },
  { zh: '纯白鸽子', en: 'White dovelet' },
  { zh: '鸭嘴兽幼崽', en: 'Platypus pup' },
  { zh: '小海豹', en: 'Seal pup' },
  { zh: '粉色小猪', en: 'Pink piglet' },
  { zh: '雷电机械狼', en: 'Thunder wolf' },
  { zh: '蜜蜂猫', en: 'Bee kitten' },
  { zh: '冰淇淋企鹅', en: 'Ice-cream penguin' },
  { zh: '木偶狐狸', en: 'Marionette fox' },
  { zh: '馆主短毛猫', en: 'Trainer cat' },
  { zh: '橘猫上班族', en: 'Office tabby' },
  { zh: '香蕉黄仓鼠', en: 'Banana hamster' }
]

// Background-removal threshold. JPEG compression around the pet outline
// produces faint cream/beige pixels (e.g. 248,247,243) that we still want
// treated as background. >=230 on every channel covers the noise floor
// while preserving genuine off-white pet bodies (those are bounded by the
// thick black outline so flood-fill stops there).
const NEAR_WHITE = 230
const NEAR_BLACK = 42

const readPromptCsv = async () => {
  const raw = await readFile(CSV_PATH, 'utf-8')
  const lines = raw.split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
  return lines.map((line) => line.replace(/^"|"$/g, '').replace(/""/g, '"'))
}

const buildFolderIndex = async () => {
  const entries = await readdir(SRC_ROOT)
  const map = new Map()
  for (const entry of entries) {
    const match = entry.match(/^(\d+)_/)
    if (!match) continue
    const fullPath = join(SRC_ROOT, entry)
    if (!statSync(fullPath).isDirectory()) continue
    map.set(Number(match[1]), entry)
  }
  return map
}

const removeWhiteBackground = async (sourcePath, destPath) => {
  // Resize to TARGET_SIZE square first so the flood-fill works on a
  // predictable canvas regardless of source dimensions.
  const { data, info } = await sharp(sourcePath)
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = data[i * channels]
    rgba[i * 4 + 1] = data[i * channels + 1]
    rgba[i * 4 + 2] = data[i * channels + 2]
    rgba[i * 4 + 3] = 255
  }

  const isNearWhite = (idx) => {
    const r = rgba[idx * 4]
    const g = rgba[idx * 4 + 1]
    const b = rgba[idx * 4 + 2]
    return r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE
  }

  const isNearBlack = (idx) => {
    const r = rgba[idx * 4]
    const g = rgba[idx * 4 + 1]
    const b = rgba[idx * 4 + 2]
    return r <= NEAR_BLACK && g <= NEAR_BLACK && b <= NEAR_BLACK
  }

  // Some generations include a dark presentation frame around the white
  // canvas. Remove only the dark pixels connected to the outer border and
  // only while they stay near the frame band, then do the normal white
  // flood-fill. This avoids treating the pet's own black outline as
  // background.
  const FRAME_BAND = 72
  const frameVisited = new Uint8Array(width * height)
  const frameStack = []
  for (let x = 0; x < width; x++) {
    frameStack.push(x)
    frameStack.push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    frameStack.push(y * width)
    frameStack.push(y * width + width - 1)
  }
  while (frameStack.length) {
    const idx = frameStack.pop()
    if (frameVisited[idx]) continue
    frameVisited[idx] = 1
    const x = idx % width
    const y = (idx - x) / width
    const inFrameBand = x < FRAME_BAND || x >= width - FRAME_BAND || y < FRAME_BAND || y >= height - FRAME_BAND
    if (!inFrameBand || !isNearBlack(idx)) continue
    rgba[idx * 4 + 3] = 0
    if (x > 0) frameStack.push(idx - 1)
    if (x < width - 1) frameStack.push(idx + 1)
    if (y > 0) frameStack.push(idx - width)
    if (y < height - 1) frameStack.push(idx + width)
  }

  // Iterative flood-fill (stack-based BFS) seeded from the borders. A few
  // generated outputs come back framed with a dark stylized border, which
  // would block a naive border seed. So instead of seeding raw border
  // indices, we walk inward from every border position until we either (a)
  // hit a near-white pixel — that becomes the seed — or (b) walk more than
  // EDGE_PROBE_DEPTH pixels without finding white, in which case we give
  // up on that probe (the frame is too deep / pet hugs the edge there).
  const visited = new Uint8Array(width * height)
  const stack = []
  const EDGE_PROBE_DEPTH = 96

  const probeFromBorder = (startX, startY, dx, dy) => {
    let x = startX
    let y = startY
    for (let step = 0; step < EDGE_PROBE_DEPTH; step++) {
      if (x < 0 || x >= width || y < 0 || y >= height) return
      const idx = y * width + x
      if (rgba[idx * 4 + 3] === 0) {
        stack.push(idx)
      } else if (isNearWhite(idx)) {
        stack.push(idx)
        return
      }
      x += dx
      y += dy
    }
  }

  for (let x = 0; x < width; x++) {
    probeFromBorder(x, 0, 0, 1)            // top edge → walk down
    probeFromBorder(x, height - 1, 0, -1)  // bottom edge → walk up
  }
  for (let y = 0; y < height; y++) {
    probeFromBorder(0, y, 1, 0)            // left edge → walk right
    probeFromBorder(width - 1, y, -1, 0)   // right edge → walk left
  }

  while (stack.length) {
    const idx = stack.pop()
    if (visited[idx]) continue
    visited[idx] = 1
    const x = idx % width
    const y = (idx - x) / width
    const isTransparentFrame = rgba[idx * 4 + 3] === 0
    if (!isTransparentFrame) {
      if (!isNearWhite(idx)) continue
      rgba[idx * 4 + 3] = 0
    }
    if (x > 0) stack.push(idx - 1)
    if (x < width - 1) stack.push(idx + 1)
    if (y > 0) stack.push(idx - width)
    if (y < height - 1) stack.push(idx + width)
  }

  // Soft edge pass: any opaque pixel whose 4-neighbour includes a
  // transparent pixel AND is itself >215 on every channel gets a half-alpha
  // bevel. This kills the residual JPEG halo around the black outline
  // without eating into the actual line art.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (rgba[idx * 4 + 3] !== 255) continue
      const r = rgba[idx * 4]
      const g = rgba[idx * 4 + 1]
      const b = rgba[idx * 4 + 2]
      if (r < 215 || g < 215 || b < 215) continue
      const neighbours = [idx - 1, idx + 1, idx - width, idx + width]
      const transparentNeighbour = neighbours.some((n) => rgba[n * 4 + 3] === 0)
      if (transparentNeighbour) {
        rgba[idx * 4 + 3] = 96
      }
    }
  }

  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(destPath)
}

const main = async () => {
  if (!existsSync(SRC_ROOT)) {
    console.error(`Source root does not exist: ${SRC_ROOT}`)
    process.exit(1)
  }

  await mkdir(OUT_DIR, { recursive: true })
  const promptLines = await readPromptCsv()
  const folderByIndex = await buildFolderIndex()

  const totalIndices = Math.max(folderByIndex.size, promptLines.length, labels.length)
  const manifest = []

  for (let i = 1; i <= totalIndices; i++) {
    const folder = folderByIndex.get(i)
    if (!folder) {
      console.warn(`[skip ${i}] no source folder`)
      continue
    }
    const folderPath = join(SRC_ROOT, folder)
    const subDirs = (await readdir(folderPath))
      .filter((s) => statSync(join(folderPath, s)).isDirectory())
      .sort() // deterministic v1/v2 ordering — first subdir alphabetically wins v1

    const variants = []
    for (let v = 0; v < subDirs.length; v++) {
      const sourceFile = join(folderPath, subDirs[v], '1.png')
      if (!existsSync(sourceFile)) {
        console.warn(`[skip ${i}/v${v + 1}] missing 1.png in ${subDirs[v]}`)
        continue
      }
      const filename = `prompt-${i}-v${v + 1}.png`
      const destPath = join(OUT_DIR, filename)
      const start = Date.now()
      await removeWhiteBackground(sourceFile, destPath)
      const ms = Date.now() - start
      variants.push(filename)
      console.log(`[${i}/${totalIndices}] v${v + 1}  ${filename}  (${ms}ms)`)
    }

    if (!variants.length) continue

    const label = labels[i - 1] ?? { zh: `小宠物 ${i}`, en: `Pixel pet ${i}` }
    manifest.push({
      id: `prompt-${i}`,
      labelZh: label.zh,
      labelEn: label.en,
      promptIndex: i,
      prompt: promptLines[i - 1] ?? '',
      variants
    })
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  console.log(`\nWrote ${manifest.length} entries to ${MANIFEST_PATH}`)
  const totalVariants = manifest.reduce((sum, m) => sum + m.variants.length, 0)
  console.log(`Total variant PNGs: ${totalVariants}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
