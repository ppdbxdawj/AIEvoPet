import type { PetAppearanceAsset } from './appearance-registry'
import type { ImportedPetSpecies, PetData, PetStage } from '../../types/pet'
import type { ImportedPetPackage } from '../../types/pet-package'

const IMPORTED_PET_ID_PATTERN = /^petdex:[a-z0-9][a-z0-9._-]{1,63}$/
const HATCHED_STAGE_ORDER: PetStage[] = ['baby', 'child', 'adult', 'elder']

let packagesBySpecies = new Map<ImportedPetSpecies, ImportedPetPackage>()

export const isImportedPetSpecies = (value: unknown): value is ImportedPetSpecies => (
  typeof value === 'string' && IMPORTED_PET_ID_PATTERN.test(value)
)

export const replaceImportedPetPackages = (packages: ImportedPetPackage[]) => {
  packagesBySpecies = new Map()
  for (const petPackage of packages) {
    if (!isImportedPetSpecies(petPackage.speciesId)) continue
    packagesBySpecies.set(petPackage.speciesId, petPackage)
  }
}

export const getImportedPetSpeciesOptions = () => Array.from(packagesBySpecies.values()).map((petPackage) => ({
  value: petPackage.speciesId as PetData['personality']['species'],
  label: petPackage.label,
  labelEn: petPackage.labelEn ?? petPackage.label
}))

export const resolveImportedAppearanceLabel = (
  species: PetData['personality']['species'] | PetData['memory']['profile']['chosenSpecies'] | undefined,
  language: PetData['ui']['language'] = 'zh-CN'
) => {
  if (!isImportedPetSpecies(species)) return undefined
  const petPackage = packagesBySpecies.get(species)
  if (!petPackage) return language === 'en-US' ? 'Missing imported pet' : '缺失的导入宠物'
  return language === 'en-US' ? petPackage.labelEn ?? petPackage.label : petPackage.label
}

const resolveImportedStage = (petPackage: ImportedPetPackage, stage: PetStage) => {
  if (stage === 'egg') {
    return petPackage.stages.egg ?? HATCHED_STAGE_ORDER.map((item) => petPackage.stages[item]).find(Boolean)
  }
  return petPackage.stages[stage] ?? HATCHED_STAGE_ORDER.map((item) => petPackage.stages[item]).find(Boolean)
}

export const getImportedAppearanceAsset = (
  species: PetData['personality']['species'] | PetData['memory']['profile']['chosenSpecies'] | undefined,
  stage: PetStage
): PetAppearanceAsset | undefined => {
  if (!isImportedPetSpecies(species)) return undefined
  const petPackage = packagesBySpecies.get(species)
  if (!petPackage) return undefined
  const stageEntry = resolveImportedStage(petPackage, stage)
  if (!stageEntry) return undefined

  return {
    key: `${species}:${stage === 'egg' && petPackage.stages.egg ? 'egg' : 'pet'}` as PetAppearanceAsset['key'],
    label: petPackage.label,
    labelEn: petPackage.labelEn ?? petPackage.label,
    partDefinitions: stageEntry.parts
  }
}
