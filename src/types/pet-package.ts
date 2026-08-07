import type { ImportedPetSpecies, PetCutoutPartDefinition, PetStage } from './pet'

export type ImportedPetStage = Extract<PetStage, 'egg' | 'baby' | 'child' | 'adult' | 'elder'>

export interface ImportedPetPackageStage {
  renderer: 'cutout'
  parts: PetCutoutPartDefinition[]
}

export interface ImportedPetPackage {
  speciesId: ImportedPetSpecies
  manifestId: string
  version?: string
  label: string
  labelEn?: string
  author?: string
  license?: string
  stages: Partial<Record<ImportedPetStage, ImportedPetPackageStage>>
}

export interface ImportedPetLoadStatus {
  state: 'idle' | 'loading' | 'ready' | 'error'
  count: number
  message?: string
}
