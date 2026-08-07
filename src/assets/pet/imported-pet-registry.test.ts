import { describe, expect, it } from 'vitest'
import { getAppearanceAsset, resolveAppearanceLabel } from './appearance-registry'
import { getImportedPetSpeciesOptions, replaceImportedPetPackages } from './imported-pet-registry'
import type { ImportedPetPackage } from '../../types/pet-package'

const packageFixture: ImportedPetPackage = {
  speciesId: 'petdex:moon-cat',
  manifestId: 'moon-cat',
  label: '月亮猫',
  labelEn: 'Moon Cat',
  stages: {
    baby: {
      renderer: 'cutout',
      parts: [{
        id: 'body',
        slotId: 'body',
        label: 'Body',
        imageSrc: 'data:image/png;base64,aaa',
        motionRole: 'none',
        defaultPlacement: {
          id: 'body',
          slotId: 'body',
          x: 250,
          y: 360,
          width: 512,
          height: 512,
          zIndex: 2,
          visible: true
        }
      }]
    }
  }
}

describe('imported pet registry', () => {
  it('exposes imported pets as species options and appearance assets', () => {
    replaceImportedPetPackages([packageFixture])

    expect(getImportedPetSpeciesOptions()).toEqual([{ value: 'petdex:moon-cat', label: '月亮猫', labelEn: 'Moon Cat' }])
    expect(resolveAppearanceLabel('petdex:moon-cat', 'en-US')).toBe('Moon Cat')

    const asset = getAppearanceAsset('petdex:moon-cat', 'baby')
    expect(asset.key).toBe('petdex:moon-cat:pet')
    expect(asset.partDefinitions[0].imageSrc).toBe('data:image/png;base64,aaa')
  })

  it('preserves missing imported species with a fallback asset', () => {
    replaceImportedPetPackages([])

    expect(resolveAppearanceLabel('petdex:moon-cat', 'en-US')).toBe('Missing imported pet')
    const asset = getAppearanceAsset('petdex:moon-cat', 'baby')
    expect(asset.key).toBe('petdex:moon-cat:missing')
    expect(asset.partDefinitions.length).toBeGreaterThan(0)
  })
})
