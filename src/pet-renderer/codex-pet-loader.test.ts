import { describe, expect, it } from 'vitest'
import { loadCodexPetAnimationManifest } from './codex-pet-loader'

describe('codex pet loader', () => {
  it('maps Codex states, chains, and events into an animation manifest', () => {
    const manifest = loadCodexPetAnimationManifest({
      states: {
        idle: { row: 0, durationMs: 720 },
        waving: { row: 2, durationMs: 360 }
      },
      chains: {
        idle: ['idle', 'waving']
      },
      events: {
        hover: 'waving'
      }
    }, {
      spritesheetPath: '/pets/datachan/spritesheet.webp'
    })

    const idleClip = manifest.clips.idle
    const wavingClip = manifest.clips.waving
    expect(idleClip.kind).toBe('sprite')
    expect(idleClip.kind === 'sprite' ? idleClip.frameMs : 0).toBe(90)
    expect(wavingClip.kind).toBe('sprite')
    expect(manifest.chains.idle).toEqual({ mode: 'idleFallback', sequence: ['idle', 'waving'] })
    expect(manifest.events?.hover).toBe('waving')
    expect(manifest.emoteSheetPath).toBe('/pets/datachan/spritesheet.webp')
    expect(manifest.emoteAtlas?.rows.waving).toEqual({ row: 2, frames: 8, frameMs: 45 })
  })
})
