import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { petPlatform } from '../platform/pet-platform'
import type { InteractionType, PetData, PetLeanDirection, ReminderItem, WalkTick } from '../types/pet'

interface UseWindowPlatformSubscriptionsParams {
  currentWindowLabel?: string
  petRef: MutableRefObject<PetData | null>
  runInteraction: (type: InteractionType) => Promise<void>
  updatePanelState: (open: boolean) => void
  triggerReminder: (reminder: ReminderItem) => Promise<void>
  syncPet: (next: PetData) => void
  handleWalkTick: (tick: WalkTick) => void
  setReminders: Dispatch<SetStateAction<ReminderItem[]>>
  setDockLeanDirection: Dispatch<SetStateAction<PetLeanDirection | undefined>>
  setDockLeanAmount: Dispatch<SetStateAction<'still' | 'soft' | 'active'>>
  setBubbleVisible: Dispatch<SetStateAction<boolean>>
  collapseFloatingSurfaces: () => void
  collapseHoverChatOnly: () => void
  inferLeanDirection: (position?: PetData['ui']['position']) => PetLeanDirection | undefined
}

export function useWindowPlatformSubscriptions({
  currentWindowLabel,
  petRef,
  runInteraction,
  updatePanelState,
  triggerReminder,
  syncPet,
  handleWalkTick,
  setReminders,
  setDockLeanDirection,
  setDockLeanAmount,
  setBubbleVisible,
  collapseFloatingSurfaces,
  collapseHoverChatOnly,
  inferLeanDirection
}: UseWindowPlatformSubscriptionsParams) {
  const runInteractionRef = useRef(runInteraction)
  const updatePanelStateRef = useRef(updatePanelState)
  const triggerReminderRef = useRef(triggerReminder)
  const syncPetRef = useRef(syncPet)
  const handleWalkTickRef = useRef(handleWalkTick)
  const collapseFloatingSurfacesRef = useRef(collapseFloatingSurfaces)
  const collapseHoverChatOnlyRef = useRef(collapseHoverChatOnly)
  const inferLeanDirectionRef = useRef(inferLeanDirection)

  useEffect(() => {
    runInteractionRef.current = runInteraction
    updatePanelStateRef.current = updatePanelState
    triggerReminderRef.current = triggerReminder
    syncPetRef.current = syncPet
    handleWalkTickRef.current = handleWalkTick
    collapseFloatingSurfacesRef.current = collapseFloatingSurfaces
    collapseHoverChatOnlyRef.current = collapseHoverChatOnly
    inferLeanDirectionRef.current = inferLeanDirection
  }, [collapseFloatingSurfaces, collapseHoverChatOnly, handleWalkTick, inferLeanDirection, runInteraction, syncPet, triggerReminder, updatePanelState])

  useEffect(() => {
    const stopTray = petPlatform.onTrayAction((trayAction) => {
      if (trayAction === 'feed') void runInteractionRef.current('feed')
      if (trayAction === 'toggleSleep') {
        const current = petRef.current
        if (!current) return
        void runInteractionRef.current(current.state.isSleeping ? 'wake' : 'sleep')
      }
      if (trayAction === 'openPanel') {
        const current = petRef.current
        setDockLeanAmount('still')
        setDockLeanDirection(undefined)
        if (!current?.ui.panelOpen) updatePanelStateRef.current(true)
      }
      if (trayAction === 'edgeCollapse') {
        const current = petRef.current
        const direction = inferLeanDirectionRef.current(current?.ui.position)
        setDockLeanDirection(direction)
        setDockLeanAmount('active')
        collapseHoverChatOnlyRef.current()
        if (current?.ui.panelOpen) {
          setBubbleVisible(false)
          collapseFloatingSurfacesRef.current()
          updatePanelStateRef.current(false)
        }
      }
      if (trayAction === 'closePanel') {
        // Panel was closed via OS chrome (red traffic light). Sync state so
        // a subsequent click on the pet re-opens the panel cleanly instead of
        // believing it's still open.
        const current = petRef.current
        if (current?.ui.panelOpen) updatePanelStateRef.current(false)
      }
      if (trayAction === 'edgeReveal') {
        const current = petRef.current
        setDockLeanDirection(inferLeanDirectionRef.current(current?.ui.position))
        setDockLeanAmount('soft')
        setBubbleVisible(true)
      }
    })

    const stopReminder = petPlatform.onReminderTrigger((reminder) => {
      void triggerReminderRef.current(reminder)
    })

    const stopPetUpdates = petPlatform.onPetUpdated((incomingPet) => {
      if (!incomingPet || typeof incomingPet !== 'object') return
      syncPetRef.current(incomingPet as PetData)
    })

    const stopReminderUpdates = petPlatform.onRemindersUpdated((nextReminders) => {
      setReminders(nextReminders)
    })

    const stopWalkTick = petPlatform.onWalkTick((tick) => {
      handleWalkTickRef.current(tick)
    })

    return () => {
      stopTray()
      stopReminder()
      stopPetUpdates()
      stopReminderUpdates()
      stopWalkTick()
    }
  }, [currentWindowLabel, petRef, setBubbleVisible, setDockLeanAmount, setDockLeanDirection, setReminders])
}
