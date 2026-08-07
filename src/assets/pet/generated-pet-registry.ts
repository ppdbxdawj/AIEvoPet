import generatedManifest from './generated-manifest.json'

export interface GeneratedPetVariant {
  key: string
  url: string
}

export interface GeneratedPetAppearance {
  id: `prompt-${number}`
  label: string
  labelEn: string
  promptIndex: number
  prompt: string
  variants: GeneratedPetVariant[]
}

interface GeneratedPetManifestEntry {
  id: string
  labelZh: string
  labelEn: string
  promptIndex: number
  prompt: string
  variants: string[]
}

const modules = import.meta.glob('./generated/*.png', {
  eager: true,
  import: 'default'
}) as Record<string, string>

const urlByFilename = new Map(
  Object.entries(modules).map(([path, url]) => [path.split('/').pop() ?? path, url])
)

const parseVariantKey = (fileName: string) => fileName.match(/-(v\d+)\.png$/i)?.[1] ?? fileName.replace(/\.png$/i, '')

export const GENERATED_PET_APPEARANCES = (generatedManifest as GeneratedPetManifestEntry[])
  .map((entry): GeneratedPetAppearance | null => {
    if (!/^prompt-\d+$/.test(entry.id)) return null
    const variants = entry.variants
      .map((fileName) => {
        const url = urlByFilename.get(fileName)
        if (!url) return null
        return {
          key: parseVariantKey(fileName),
          url
        }
      })
      .filter((variant): variant is GeneratedPetVariant => Boolean(variant))

    if (variants.length === 0) return null

    return {
      id: entry.id as `prompt-${number}`,
      label: entry.labelZh,
      labelEn: entry.labelEn,
      promptIndex: entry.promptIndex,
      prompt: entry.prompt,
      variants
    }
  })
  .filter((entry): entry is GeneratedPetAppearance => Boolean(entry))

export const GENERATED_PET_APPEARANCES_BY_ID = Object.freeze(
  Object.fromEntries(GENERATED_PET_APPEARANCES.map((entry) => [entry.id, entry]))
) as Readonly<Record<string, GeneratedPetAppearance>>

export const isGeneratedPetSpecies = (species?: string): species is `prompt-${number}` =>
  Boolean(species && GENERATED_PET_APPEARANCES_BY_ID[species])

export const getGeneratedPetVariants = (species?: string): GeneratedPetVariant[] =>
  species ? GENERATED_PET_APPEARANCES_BY_ID[species]?.variants ?? [] : []

