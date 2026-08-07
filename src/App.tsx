import { PetWindowShell } from './windows/PetWindowShell'
import { PanelWindowShell } from './windows/PanelWindowShell'
import { t } from './lib/i18n'
import { usePetAppController } from './windows/usePetAppController'
import './styles.css'

export default function App({ forcedWindowLabel }: { forcedWindowLabel?: string } = {}) {
  const controller = usePetAppController({ forcedWindowLabel })

  if (!controller.pet) {
    return <main className="pet-loading">{t(undefined, 'app.loading')}</main>
  }

  if (controller.isPetWindow && controller.petWindowProps) {
    return <PetWindowShell {...controller.petWindowProps} />
  }

  if (!controller.panelWindowProps) {
    return <main className="pet-loading">{t(undefined, 'app.loading')}</main>
  }

  return <PanelWindowShell {...controller.panelWindowProps} />
}
