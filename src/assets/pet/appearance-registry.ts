import puppySprite from './user-provided/puppy.png'
import puppyEggSprite from './user-provided/puppy-egg.png'
import pigletSprite from './user-provided/piglet.png'
import pigletEggSprite from './user-provided/piglet-egg.png'
import { GENERATED_PET_APPEARANCES, GENERATED_PET_APPEARANCES_BY_ID, getGeneratedPetVariants } from './generated-pet-registry'
import { getImportedAppearanceAsset, isImportedPetSpecies, resolveImportedAppearanceLabel } from './imported-pet-registry'
import type { ImportedPetSpecies, PetCutoutPartDefinition, PetCutoutPlacement, PetData } from '../../types/pet'
import type { PetRigDefinition } from '../../pet-renderer/rig-types'

const VISIBLE_LEFT = 250
const VISIBLE_TOP = 204
const VISIBLE_WIDTH = 2049
const VISIBLE_HEIGHT = 2164

type LegacySpecies = 'blob' | 'cat' | 'ghost'
type ModernSpecies = 'puppy' | 'piglet'
type GeneratedSpecies = `prompt-${number}`
export type PetAppearanceSpecies = LegacySpecies | ModernSpecies | GeneratedSpecies | ImportedPetSpecies
type StaticAppearanceKey = 'puppy' | 'piglet'
export type PetAppearanceKey = StaticAppearanceKey | GeneratedSpecies | ImportedPetSpecies

export interface PetAppearanceAsset {
  key: `${PetAppearanceKey}:${string}`
  label: string
  labelEn: string
  partDefinitions: PetCutoutPartDefinition[]
  meshRig?: PetRigDefinition
  referenceSrc?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const centerX = (width: number) => Math.round(VISIBLE_LEFT + (VISIBLE_WIDTH - width) / 2)
const bottomY = (height: number, bottomMargin: number) => Math.round(VISIBLE_TOP + VISIBLE_HEIGHT - height - bottomMargin)

const createCenteredPlacement = (
  id: string,
  slotId: string,
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
  bottomMargin: number,
  zIndex = 2
): PetCutoutPlacement => {
  const width = Math.round(sourceWidth * scale)
  const height = Math.round(sourceHeight * scale)

  return {
    id,
    slotId,
    x: clamp(centerX(width), VISIBLE_LEFT, VISIBLE_LEFT + VISIBLE_WIDTH - width),
    y: clamp(bottomY(height, bottomMargin), VISIBLE_TOP, VISIBLE_TOP + VISIBLE_HEIGHT - height),
    width,
    height,
    zIndex,
    visible: true
  }
}

const createSinglePartDefinition = (
  id: string,
  label: string,
  imageSrc: string,
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
  bottomMargin: number
): PetCutoutPartDefinition[] => [{
  id,
  slotId: id,
  label,
  imageSrc,
  motionRole: 'none',
  defaultPlacement: createCenteredPlacement(id, id, sourceWidth, sourceHeight, scale, bottomMargin)
}]

const puppyPetParts = createSinglePartDefinition('body', '小狗', puppySprite, 844, 789, 2.1, 120)
const puppyEggParts = createSinglePartDefinition('egg', '小狗蛋', puppyEggSprite, 577, 724, 2.55, 220)
const pigletPetParts = createSinglePartDefinition('body', '小猪', pigletSprite, 809, 606, 2.05, 160)
const pigletEggParts = createSinglePartDefinition('egg', '小猪蛋', pigletEggSprite, 688, 740, 2.3, 220)

const createGeneratedPetParts = (
  label: string,
  imageSrc: string
) => createSinglePartDefinition('body', label, imageSrc, 512, 512, 3.7, 120)

const appearanceRegistry: Record<StaticAppearanceKey, {
  label: string
  labelEn: string
  egg?: Omit<PetAppearanceAsset, 'key' | 'label' | 'labelEn'>
  pet: Omit<PetAppearanceAsset, 'key' | 'label' | 'labelEn'>
}> = {
  puppy: {
    label: '奶油小狗',
    labelEn: 'Cream puppy',
    egg: {
      partDefinitions: puppyEggParts
    },
    pet: {
      partDefinitions: puppyPetParts
    }
  },
  piglet: {
    label: '草莓小猪',
    labelEn: 'Strawberry piglet',
    egg: {
      partDefinitions: pigletEggParts
    },
    pet: {
      partDefinitions: pigletPetParts
    }
  }
}

export const speciesOptions = [
  { value: 'puppy', label: appearanceRegistry.puppy.label, labelEn: appearanceRegistry.puppy.labelEn },
  { value: 'piglet', label: appearanceRegistry.piglet.label, labelEn: appearanceRegistry.piglet.labelEn },
  ...GENERATED_PET_APPEARANCES.map((appearance) => ({
    value: appearance.id,
    label: appearance.label,
    labelEn: appearance.labelEn
  }))
] satisfies readonly { value: PetData['personality']['species']; label: string; labelEn: string }[]

export const resolveAppearanceKey = (species?: PetData['personality']['species'] | PetData['memory']['profile']['chosenSpecies']): PetAppearanceKey => {
  if (isImportedPetSpecies(species)) return species
  if (species && GENERATED_PET_APPEARANCES_BY_ID[species]) return species as GeneratedSpecies
  if (species === 'piglet') return 'piglet'
  return 'puppy'
}

export const resolveAppearanceLabel = (species?: PetData['personality']['species'] | PetData['memory']['profile']['chosenSpecies'], language: PetData['ui']['language'] = 'zh-CN') => {
  const importedLabel = resolveImportedAppearanceLabel(species, language)
  if (importedLabel) return importedLabel
  if (species && GENERATED_PET_APPEARANCES_BY_ID[species]) {
    const appearance = GENERATED_PET_APPEARANCES_BY_ID[species]
    return language === 'en-US' ? appearance.labelEn : appearance.label
  }
  const appearance = appearanceRegistry[resolveAppearanceKey(species) as keyof typeof appearanceRegistry]
  return language === 'en-US' ? appearance.labelEn : appearance.label
}

export const getAppearanceAsset = (
  species: PetData['personality']['species'] | PetData['memory']['profile']['chosenSpecies'] | undefined,
  stage: PetData['state']['stage'],
  variantKey?: string
): PetAppearanceAsset => {
  const importedAsset = getImportedAppearanceAsset(species, stage)
  if (importedAsset) return importedAsset
  const key = resolveAppearanceKey(species)
  if (isImportedPetSpecies(key)) {
    return {
      key: `${key}:missing`,
      label: '缺失的导入宠物',
      labelEn: 'Missing imported pet',
      partDefinitions: puppyPetParts
    }
  }
  if (GENERATED_PET_APPEARANCES_BY_ID[key]) {
    const appearance = GENERATED_PET_APPEARANCES_BY_ID[key]
    const variants = getGeneratedPetVariants(key)
    const variant = variantKey
      ? variants.find((item) => item.key === variantKey) ?? variants[0]
      : variants[0]
    return {
      key: `${key}:pet`,
      label: appearance.label,
      labelEn: appearance.labelEn,
      partDefinitions: createGeneratedPetParts(appearance.label, variant?.url ?? '')
    }
  }
  const appearance = appearanceRegistry[key as keyof typeof appearanceRegistry]
  const mode = stage === 'egg' && appearance.egg ? 'egg' : 'pet'
  const asset = appearance[mode] ?? appearance.pet

  return {
    key: `${key}:${mode}`,
    label: appearance.label,
    labelEn: appearance.labelEn,
    partDefinitions: asset.partDefinitions,
    meshRig: asset.meshRig,
    referenceSrc: asset.referenceSrc
  }
}

export const createDefaultPlacementsForParts = (partDefinitions: PetCutoutPartDefinition[]) => {
  return partDefinitions.map((part) => ({ ...part.defaultPlacement }))
}

export const createDefaultPlacementsForAppearance = (
  species: PetData['personality']['species'] | PetData['memory']['profile']['chosenSpecies'] | undefined,
  stage: PetData['state']['stage']
) => createDefaultPlacementsForParts(getAppearanceAsset(species, stage).partDefinitions)
