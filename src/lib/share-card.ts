import type { PetData } from '../types/pet'
import type { AchievementState, EconomyState, HomeState } from '../types/domain'
import { getAppearanceAsset } from '../assets/pet/appearance-registry'
import { getAchievementTitle } from './pet-domains'

export interface ShareCardInputs {
  pet: PetData
  achievements: AchievementState
  economy: EconomyState
  home: HomeState
  // Optional small label rendered above the pet's name. Used by growth cards
  // to read e.g. "成长记 · 第 16 天" so the same renderer can produce both the
  // ordinary chat-room share and a stage-up commemorative card.
  eyebrow?: string
  // Overrides the centered title (defaults to pet.personality.name). Lets the
  // growth ceremony print "啵啵 · 长成成熟期了" instead of just the name.
  headline?: string
}

const CARD_WIDTH = 540
const CARD_HEIGHT = 720
const CARD_PADDING = 36
const CARD_BG_TOP = '#fff5fb'
const CARD_BG_BOTTOM = '#ffe4ef'
const CARD_INNER_BG = '#ffffff'
const CARD_INNER_BORDER = 'rgba(255, 174, 207, 0.45)'
const CARD_TITLE_COLOR = '#7a3d61'
const CARD_BODY_COLOR = '#7a5870'
const CARD_ACCENT_COLOR = '#ff5d97'
const CARD_MUTED_COLOR = '#b48ea0'
const STAGE_LABELS: Record<PetData['state']['stage'], Record<'zh-CN' | 'en-US', string>> = {
  egg: { 'zh-CN': '未破壳', 'en-US': 'Unhatched' },
  baby: { 'zh-CN': '幼年期', 'en-US': 'Baby' },
  child: { 'zh-CN': '少年期', 'en-US': 'Child' },
  adult: { 'zh-CN': '成年期', 'en-US': 'Adult' },
  elder: { 'zh-CN': '资深陪伴', 'en-US': 'Longtime companion' }
}

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const lines: string[] = []
  let buffer = ''
  for (const char of text) {
    const candidate = buffer + char
    if (ctx.measureText(candidate).width > maxWidth && buffer) {
      lines.push(buffer)
      buffer = char
    } else {
      buffer = candidate
    }
  }
  if (buffer) lines.push(buffer)
  return lines
}

const loadImage = (src: string): Promise<HTMLImageElement | null> => {
  // Intentionally omit crossOrigin: pet sprites are served by the same Tauri
  // protocol as the webview, so CORS is unnecessary; setting it would force a
  // CORS preflight and fail under tauri:// where the protocol may not emit
  // Access-Control-Allow-Origin headers.
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

const drawImageContainExact = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * ratio
  const drawHeight = image.naturalHeight * ratio
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  )
}

const formatDate = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export const renderShareCardBlob = async (inputs: ShareCardInputs): Promise<Blob> => {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')

  const language = inputs.pet.ui.language === 'en-US' ? 'en-US' : 'zh-CN'
  const english = language === 'en-US'

  const gradient = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT)
  gradient.addColorStop(0, CARD_BG_TOP)
  gradient.addColorStop(1, CARD_BG_BOTTOM)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  const innerX = CARD_PADDING
  const innerY = CARD_PADDING
  const innerWidth = CARD_WIDTH - CARD_PADDING * 2
  const innerHeight = CARD_HEIGHT - CARD_PADDING * 2

  drawRoundedRect(ctx, innerX, innerY, innerWidth, innerHeight, 28)
  ctx.fillStyle = CARD_INNER_BG
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = CARD_INNER_BORDER
  ctx.stroke()

  const avatarBoxSize = 200
  const avatarX = innerX + (innerWidth - avatarBoxSize) / 2
  const avatarY = innerY + 32
  drawRoundedRect(ctx, avatarX, avatarY, avatarBoxSize, avatarBoxSize, 24)
  ctx.fillStyle = '#fff0f6'
  ctx.fill()

  const asset = getAppearanceAsset(
    inputs.pet.memory.profile.chosenSpecies ?? inputs.pet.personality.species,
    inputs.pet.state.stage
  )
  const avatarImage = asset.referenceSrc ? await loadImage(asset.referenceSrc) : null
  if (avatarImage) {
    drawImageContainExact(ctx, avatarImage, avatarX + 12, avatarY + 12, avatarBoxSize - 24, avatarBoxSize - 24)
  } else {
    ctx.fillStyle = CARD_MUTED_COLOR
    ctx.font = '500 18px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(english ? asset.labelEn : asset.label, avatarX + avatarBoxSize / 2, avatarY + avatarBoxSize / 2)
  }

  let nameY = avatarY + avatarBoxSize + 28
  if (inputs.eyebrow) {
    ctx.fillStyle = CARD_ACCENT_COLOR
    ctx.font = '600 13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(inputs.eyebrow, innerX + innerWidth / 2, nameY)
    nameY += 22
  }
  ctx.fillStyle = CARD_TITLE_COLOR
  ctx.font = '700 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const headline = inputs.headline ?? inputs.pet.personality.name ?? (english ? 'My desktop pet' : '我的桌宠')
  const headlineLines = wrapText(ctx, headline, innerWidth - 64).slice(0, 2)
  headlineLines.forEach((line, index) => {
    ctx.fillText(line, innerX + innerWidth / 2, nameY + index * 36)
  })
  if (headlineLines.length > 1) {
    nameY += 36
  }

  const subY = nameY + 42
  ctx.fillStyle = CARD_BODY_COLOR
  ctx.font = '400 14px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  const subtitle = english
    ? `${asset.labelEn} · ${STAGE_LABELS[inputs.pet.state.stage]['en-US']} · Day ${inputs.pet.state.ageDays + 1}`
    : `${asset.label} · ${STAGE_LABELS[inputs.pet.state.stage]['zh-CN']} · 第 ${inputs.pet.state.ageDays + 1} 天`
  ctx.fillText(subtitle, innerX + innerWidth / 2, subY)

  const statsY = subY + 36
  const statsRowHeight = 56
  const statColumnWidth = (innerWidth - 64) / 2
  const stats: Array<{ label: string; value: string }> = [
    { label: english ? 'Relationship' : '关系阶段', value: inputs.pet.memory.relationship.summary || (english ? 'Getting familiar' : '正在熟络起来') },
    { label: english ? 'Comfort' : '舒适度', value: `${inputs.home.comfort} / 100` },
    { label: english ? 'Pawcoin' : '爪币', value: `${inputs.economy.pawcoin}` },
    { label: english ? 'Achievements' : '成就', value: english ? `${inputs.achievements.unlocked.length} unlocked` : `${inputs.achievements.unlocked.length} 个解锁` }
  ]
  stats.forEach((stat, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = innerX + 32 + col * (statColumnWidth + 0)
    const y = statsY + row * statsRowHeight
    ctx.textAlign = 'left'
    ctx.fillStyle = CARD_MUTED_COLOR
    ctx.font = '500 12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText(stat.label, x, y)
    ctx.fillStyle = CARD_TITLE_COLOR
    ctx.font = '600 16px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    const valueLines = wrapText(ctx, stat.value, statColumnWidth - 16)
    ctx.fillText(valueLines[0] ?? '', x, y + 18)
  })

  const achievementsY = statsY + statsRowHeight * 2 + 16
  ctx.fillStyle = CARD_TITLE_COLOR
  ctx.font = '600 16px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(english ? 'Recent achievements' : '近期成就', innerX + 32, achievementsY)

  const recentAchievements = inputs.achievements.unlocked.slice(0, 4)
  const achievementListY = achievementsY + 28
  const achievementLineHeight = 26
  if (recentAchievements.length === 0) {
    ctx.fillStyle = CARD_MUTED_COLOR
    ctx.font = '400 13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText(english ? 'Companionship is just getting started; achievements will build up slowly.' : '陪伴还在起步，慢慢攒成就吧。', innerX + 32, achievementListY)
  } else {
    recentAchievements.forEach((entry, index) => {
      const y = achievementListY + index * achievementLineHeight
      const dotX = innerX + 36
      const textX = innerX + 50
      ctx.beginPath()
      ctx.fillStyle = CARD_ACCENT_COLOR
      ctx.arc(dotX, y + 9, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = CARD_BODY_COLOR
      ctx.font = '500 13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
      const title = getAchievementTitle(entry.id, language)
      const truncatedTitle = wrapText(ctx, title, innerWidth - 96)[0] ?? title
      ctx.fillText(truncatedTitle, textX, y + 4)
    })
  }

  const footerY = innerY + innerHeight - 40
  ctx.fillStyle = CARD_MUTED_COLOR
  ctx.font = '400 12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`AIEvoPet · ${english ? 'Desktop companion' : '桌面陪伴'} · ${formatDate(new Date())}`, innerX + innerWidth / 2, footerY)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('failed to encode share card png'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

export const blobToUint8Array = async (blob: Blob): Promise<Uint8Array> => {
  const buffer = await blob.arrayBuffer()
  return new Uint8Array(buffer)
}

export const tryWriteImageToClipboard = async (blob: Blob): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
    return false
  }
  if (typeof navigator.clipboard.write !== 'function') {
    return false
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}
