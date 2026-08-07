import { t } from '../lib/i18n'
import type { PetLanguage } from '../types/pet'

interface StatusPanelProps {
  language?: PetLanguage
  hunger: number
  mood: number
  cleanliness: number
  health: number
  energy: number
}

const Row = ({ label, value }: { label: string; value: number }) => (
  <div className="status-row">
    <span>{label}</span>
    <div className="status-bar">
      <i style={{ width: `${value}%` }} />
    </div>
  </div>
)

export function StatusPanel({ language, hunger, mood, cleanliness, health, energy }: StatusPanelProps) {
  return (
    <div className="status-panel">
      <Row label={t(language, 'status.hunger')} value={100 - hunger} />
      <Row label={t(language, 'status.mood')} value={mood} />
      <Row label={t(language, 'status.cleanliness')} value={cleanliness} />
      <Row label={t(language, 'status.health')} value={health} />
      <Row label={t(language, 'status.energy')} value={energy} />
    </div>
  )
}
