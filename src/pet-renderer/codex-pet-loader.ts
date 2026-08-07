import type { ClipChain, PetAnimationManifest, SpriteAtlasRow, SpriteClip } from '../types/pet-animation'

export interface CodexPetStateDefinition {
  row: number
  durationMs?: number
  lastFrameDurationMs?: number
}

export type CodexPetChainDefinition = string[] | {
  mode?: 'loop' | 'once' | 'idleFallback'
  sequence?: string[]
  states?: string[]
}

export interface CodexPetJson {
  states: Record<string, CodexPetStateDefinition>
  chains?: Record<string, CodexPetChainDefinition>
  events?: Record<string, string>
}

interface CodexPetLoaderOptions {
  spritesheetPath: string
  columns?: number
  cellWidth?: number
  cellHeight?: number
  defaultFrameMs?: number
}

const normalizeChain = (definition: CodexPetChainDefinition, fallbackMode: ClipChain['mode']): ClipChain => {
  if (Array.isArray(definition)) return { mode: fallbackMode, sequence: definition }
  return {
    mode: definition.mode ?? fallbackMode,
    sequence: definition.sequence ?? definition.states ?? []
  }
}

export const loadCodexPetAnimationManifest = (
  pet: CodexPetJson,
  options: CodexPetLoaderOptions
): PetAnimationManifest => {
  const columns = options.columns ?? 8
  const defaultFrameMs = options.defaultFrameMs ?? 90
  const clips: Record<string, SpriteClip> = {}
  const rows: Record<string, SpriteAtlasRow> = {}

  for (const [name, state] of Object.entries(pet.states)) {
    const frameMs = state.durationMs ? Math.max(16, Math.round(state.durationMs / columns)) : defaultFrameMs
    clips[name] = {
      kind: 'sprite',
      name,
      textureSetId: name,
      frameCount: columns,
      frameMs,
      blockBase: true
    }
    rows[name] = {
      row: state.row,
      frames: columns,
      frameMs
    }
  }

  const chains: Record<string, ClipChain> = {}
  for (const [name, definition] of Object.entries(pet.chains ?? {})) {
    const chain = normalizeChain(definition, name === 'idle' ? 'idleFallback' : 'loop')
    if (chain.sequence.length > 0) chains[name] = chain
  }
  for (const name of Object.keys(clips)) {
    chains[name] ??= { mode: name === 'idle' ? 'idleFallback' : 'once', sequence: [name] }
  }

  return {
    version: 1,
    clips,
    chains,
    events: pet.events,
    emoteSheetPath: options.spritesheetPath,
    emoteAtlas: {
      rows,
      cellWidth: options.cellWidth ?? 192,
      cellHeight: options.cellHeight ?? 208,
      columns
    }
  }
}
