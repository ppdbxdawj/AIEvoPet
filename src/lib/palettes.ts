/**
 * Single source of truth for desktop-pet color palettes.
 *
 * Each palette defines a set of theme tokens that drive the panel surface,
 * chat bubble, hover chat dock, accent buttons, and the pet's aura.
 * Applied as CSS variables on the app root so every nested element inherits
 * the look without per-component plumbing.
 */

export interface PaletteTokens {
  /** Primary brand color (chip-active, primary buttons, accent text). */
  accent: string
  /** Soft tint of the accent (focus pill bg, segmented control bg). */
  accentSoft: string
  /** Stronger accent for hover/emphasis (rare). */
  accentDeep: string
  /** Body text color used on light surfaces. */
  textPrimary: string
  /** Secondary/muted text color. */
  textMuted: string
  /** Text rendered on top of the accent color (typically near-white). */
  textOnAccent: string
  /** Panel card background (the big main panel). */
  panelBg: string
  /** Panel inner border / soft outline. */
  panelBorder: string
  /** Inner surface card background (interaction, status, hero). */
  surfaceBg: string
  /** Inner surface card border. */
  surfaceBorder: string
  /** Chat bubble background. */
  bubbleBg: string
  /** Chat bubble border ring. */
  bubbleBorder: string
  /** Hover chat dock collapsed trigger background. */
  dockBg: string
  /** Hover chat dock border. */
  dockBorder: string
  /** Idle chip-button background. */
  chipBg: string
  /** Idle chip-button border. */
  chipBorder: string
  /** Idle chip-button text color. */
  chipText: string
  /** Ghost-button background. */
  ghostBg: string
  /** Pet aura inner color (radial gradient stop). */
  auraColor: string
}

export interface PaletteDefinition {
  id: string
  label: string
  labelEn: string
  description: string
  descriptionEn: string
  tokens: PaletteTokens
}

const PALETTE_LIST: readonly PaletteDefinition[] = [
  {
    id: 'cotton-candy',
    label: '棉花糖粉',
    labelEn: 'Cotton candy pink',
    description: '默认配色，甜软的粉色调，适合日常陪伴。',
    descriptionEn: 'The default soft pink palette for everyday companionship.',
    tokens: {
      accent: '#ff5d97',
      accentSoft: 'rgba(255, 174, 207, 0.55)',
      accentDeep: '#d23a78',
      textPrimary: '#6b526c',
      textMuted: '#957388',
      textOnAccent: '#ffffff',
      panelBg: 'rgba(255, 255, 255, 0.92)',
      panelBorder: 'rgba(236, 215, 226, 0.95)',
      surfaceBg: 'rgba(255, 248, 251, 0.98)',
      surfaceBorder: 'rgba(236, 215, 226, 0.95)',
      bubbleBg: 'rgba(255, 252, 254, 0.96)',
      bubbleBorder: 'rgba(238, 223, 232, 0.9)',
      dockBg: 'rgba(255, 248, 251, 0.99)',
      dockBorder: 'rgba(236, 215, 226, 0.98)',
      chipBg: 'rgba(255, 242, 248, 0.95)',
      chipBorder: 'rgba(236, 215, 226, 0.85)',
      chipText: '#7a5870',
      ghostBg: 'rgba(255, 242, 248, 0.95)',
      auraColor: 'rgba(255, 210, 231, 0.42)'
    }
  },
  {
    id: 'blueberry-milk',
    label: '蓝莓奶',
    labelEn: 'Blueberry milk',
    description: '冷调蓝紫，安静专注的氛围。',
    descriptionEn: 'A cool blue-purple palette for quiet focus.',
    tokens: {
      accent: '#5e85ff',
      accentSoft: 'rgba(181, 202, 255, 0.55)',
      accentDeep: '#3c5ed1',
      textPrimary: '#4d556d',
      textMuted: '#8893b3',
      textOnAccent: '#ffffff',
      panelBg: 'rgba(248, 250, 255, 0.94)',
      panelBorder: 'rgba(212, 222, 246, 0.95)',
      surfaceBg: 'rgba(244, 248, 255, 0.98)',
      surfaceBorder: 'rgba(212, 222, 246, 0.95)',
      bubbleBg: 'rgba(248, 250, 255, 0.96)',
      bubbleBorder: 'rgba(216, 225, 248, 0.9)',
      dockBg: 'rgba(247, 250, 255, 0.99)',
      dockBorder: 'rgba(212, 222, 246, 0.98)',
      chipBg: 'rgba(232, 238, 255, 0.95)',
      chipBorder: 'rgba(212, 222, 246, 0.85)',
      chipText: '#5a6892',
      ghostBg: 'rgba(232, 238, 255, 0.95)',
      auraColor: 'rgba(181, 202, 255, 0.42)'
    }
  },
  {
    id: 'matcha-cloud',
    label: '抹茶云',
    labelEn: 'Matcha cloud',
    description: '清新的草绿色，放松又自然。',
    descriptionEn: 'A fresh grassy green palette that feels relaxed and natural.',
    tokens: {
      accent: '#5fb87a',
      accentSoft: 'rgba(194, 233, 191, 0.55)',
      accentDeep: '#3f9259',
      textPrimary: '#4f6655',
      textMuted: '#82998a',
      textOnAccent: '#ffffff',
      panelBg: 'rgba(248, 253, 247, 0.94)',
      panelBorder: 'rgba(214, 232, 211, 0.95)',
      surfaceBg: 'rgba(244, 251, 243, 0.98)',
      surfaceBorder: 'rgba(214, 232, 211, 0.95)',
      bubbleBg: 'rgba(248, 253, 247, 0.96)',
      bubbleBorder: 'rgba(216, 233, 213, 0.9)',
      dockBg: 'rgba(247, 253, 246, 0.99)',
      dockBorder: 'rgba(214, 232, 211, 0.98)',
      chipBg: 'rgba(232, 245, 230, 0.95)',
      chipBorder: 'rgba(214, 232, 211, 0.85)',
      chipText: '#5a7560',
      ghostBg: 'rgba(232, 245, 230, 0.95)',
      auraColor: 'rgba(194, 233, 191, 0.42)'
    }
  },
  {
    id: 'peach-toast',
    label: '蜜桃吐司',
    labelEn: 'Peach toast',
    description: '温暖橙桃色，秋日下午的微光感。',
    descriptionEn: 'Warm peach-orange tones with an autumn-afternoon glow.',
    tokens: {
      accent: '#ff8a5b',
      accentSoft: 'rgba(255, 198, 168, 0.6)',
      accentDeep: '#d96135',
      textPrimary: '#6b4f44',
      textMuted: '#a48275',
      textOnAccent: '#ffffff',
      panelBg: 'rgba(255, 250, 245, 0.94)',
      panelBorder: 'rgba(244, 222, 206, 0.95)',
      surfaceBg: 'rgba(255, 248, 241, 0.98)',
      surfaceBorder: 'rgba(244, 222, 206, 0.95)',
      bubbleBg: 'rgba(255, 250, 245, 0.96)',
      bubbleBorder: 'rgba(245, 222, 206, 0.9)',
      dockBg: 'rgba(255, 250, 245, 0.99)',
      dockBorder: 'rgba(244, 222, 206, 0.98)',
      chipBg: 'rgba(255, 234, 220, 0.95)',
      chipBorder: 'rgba(244, 222, 206, 0.85)',
      chipText: '#85594a',
      ghostBg: 'rgba(255, 234, 220, 0.95)',
      auraColor: 'rgba(255, 198, 168, 0.42)'
    }
  },
  {
    id: 'lavender-mist',
    label: '薰衣草雾',
    labelEn: 'Lavender mist',
    description: '柔和淡紫，午后小睡的宁静。',
    descriptionEn: 'A soft lavender palette with a quiet nap-time feeling.',
    tokens: {
      accent: '#a982ff',
      accentSoft: 'rgba(213, 197, 255, 0.6)',
      accentDeep: '#7c54de',
      textPrimary: '#5d4d70',
      textMuted: '#8c7da3',
      textOnAccent: '#ffffff',
      panelBg: 'rgba(252, 250, 255, 0.94)',
      panelBorder: 'rgba(225, 218, 244, 0.95)',
      surfaceBg: 'rgba(250, 247, 255, 0.98)',
      surfaceBorder: 'rgba(225, 218, 244, 0.95)',
      bubbleBg: 'rgba(252, 250, 255, 0.96)',
      bubbleBorder: 'rgba(225, 218, 244, 0.9)',
      dockBg: 'rgba(251, 249, 255, 0.99)',
      dockBorder: 'rgba(225, 218, 244, 0.98)',
      chipBg: 'rgba(238, 232, 254, 0.95)',
      chipBorder: 'rgba(225, 218, 244, 0.85)',
      chipText: '#6f5d8c',
      ghostBg: 'rgba(238, 232, 254, 0.95)',
      auraColor: 'rgba(213, 197, 255, 0.42)'
    }
  },
  {
    id: 'midnight-mocha',
    label: '暮色摩卡',
    labelEn: 'Midnight mocha',
    description: '低饱和深咖，夜间陪伴的氛围。',
    descriptionEn: 'A muted deep mocha palette for nighttime companionship.',
    tokens: {
      accent: '#e29a76',
      accentSoft: 'rgba(226, 154, 118, 0.3)',
      accentDeep: '#c97c54',
      textPrimary: '#f5e9dd',
      textMuted: '#c4a995',
      textOnAccent: '#3a2118',
      panelBg: 'rgba(50, 41, 38, 0.92)',
      panelBorder: 'rgba(120, 88, 70, 0.55)',
      surfaceBg: 'rgba(63, 51, 47, 0.95)',
      surfaceBorder: 'rgba(120, 88, 70, 0.5)',
      bubbleBg: 'rgba(54, 44, 40, 0.96)',
      bubbleBorder: 'rgba(120, 88, 70, 0.55)',
      dockBg: 'rgba(54, 44, 40, 0.96)',
      dockBorder: 'rgba(120, 88, 70, 0.55)',
      chipBg: 'rgba(82, 65, 58, 0.95)',
      chipBorder: 'rgba(120, 88, 70, 0.55)',
      chipText: '#e8d7c8',
      ghostBg: 'rgba(82, 65, 58, 0.95)',
      auraColor: 'rgba(226, 154, 118, 0.4)'
    }
  }
] as const

export const PALETTES: Readonly<Record<string, PaletteDefinition>> = Object.fromEntries(
  PALETTE_LIST.map((palette) => [palette.id, palette])
)

export const DEFAULT_PALETTE_ID: string = 'cotton-candy'

export const paletteOptions: readonly { value: string; label: string; labelEn: string }[] = PALETTE_LIST.map((palette) => ({
  value: palette.id,
  label: palette.label,
  labelEn: palette.labelEn
}))

export const resolvePaletteId = (id: string | undefined | null): string => {
  if (id && PALETTES[id]) return id
  return DEFAULT_PALETTE_ID
}

export const getPalette = (id: string | undefined | null): PaletteDefinition => {
  return PALETTES[resolvePaletteId(id)]
}

const TOKEN_TO_VAR: Readonly<Record<keyof PaletteTokens, string>> = {
  accent: '--pet-accent',
  accentSoft: '--pet-accent-soft',
  accentDeep: '--pet-accent-deep',
  textPrimary: '--pet-text-primary',
  textMuted: '--pet-text-muted',
  textOnAccent: '--pet-text-on-accent',
  panelBg: '--pet-panel-bg',
  panelBorder: '--pet-panel-border',
  surfaceBg: '--pet-surface-bg',
  surfaceBorder: '--pet-surface-border',
  bubbleBg: '--pet-bubble-bg',
  bubbleBorder: '--pet-bubble-border',
  dockBg: '--pet-dock-bg',
  dockBorder: '--pet-dock-border',
  chipBg: '--pet-chip-bg',
  chipBorder: '--pet-chip-border',
  chipText: '--pet-chip-text',
  ghostBg: '--pet-ghost-bg',
  auraColor: '--pet-aura-color'
}

export const getPaletteCssVars = (id: string | undefined | null): Record<string, string> => {
  const palette = getPalette(id)
  const out: Record<string, string> = {}
  for (const key of Object.keys(palette.tokens) as (keyof PaletteTokens)[]) {
    out[TOKEN_TO_VAR[key]] = palette.tokens[key]
  }
  return out
}
