import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useWindowPlatformSubscriptions } from './useWindowPlatformSubscriptions'
import { petPlatform } from '../platform/pet-platform'
import { createDefaultPet } from '../lib/default-pet'
import type { InteractionType, PetData, PetLeanDirection, ReminderItem, WalkTick } from '../types/pet'

const renderSubscriptions = (pet: PetData) => {
  let trayCallback: ((action: string) => void) | undefined
  const stops = {
    tray: vi.fn(),
    reminder: vi.fn(),
    petUpdates: vi.fn(),
    reminderUpdates: vi.fn(),
    walkTick: vi.fn()
  }

  vi.spyOn(petPlatform, 'onTrayAction').mockImplementation((callback) => {
    trayCallback = callback
    return stops.tray
  })
  vi.spyOn(petPlatform, 'onReminderTrigger').mockImplementation(() => stops.reminder)
  vi.spyOn(petPlatform, 'onPetUpdated').mockImplementation(() => stops.petUpdates)
  vi.spyOn(petPlatform, 'onRemindersUpdated').mockImplementation(() => stops.reminderUpdates)
  vi.spyOn(petPlatform, 'onWalkTick').mockImplementation(() => stops.walkTick)

  const props = {
    petRef: { current: pet } as MutableRefObject<PetData | null>,
    runInteraction: vi.fn<(type: InteractionType) => Promise<void>>(),
    updatePanelState: vi.fn<(open: boolean) => void>(),
    triggerReminder: vi.fn<(reminder: ReminderItem) => Promise<void>>(),
    syncPet: vi.fn<(next: PetData) => void>(),
    handleWalkTick: vi.fn<(tick: WalkTick) => void>(),
    setReminders: vi.fn(),
    setDockLeanDirection: vi.fn<Dispatch<SetStateAction<PetLeanDirection | undefined>>>(),
    setDockLeanAmount: vi.fn<Dispatch<SetStateAction<'still' | 'soft' | 'active'>>>(),
    setBubbleVisible: vi.fn<Dispatch<SetStateAction<boolean>>>(),
    collapseFloatingSurfaces: vi.fn<() => void>(),
    collapseHoverChatOnly: vi.fn<() => void>(),
    inferLeanDirection: vi.fn<(position?: PetData['ui']['position']) => PetLeanDirection | undefined>(() => 'left')
  }

  const Harness = () => {
    useWindowPlatformSubscriptions(props)
    return null
  }

  const view = render(<Harness />)
  return { ...props, getTrayCallback: () => trayCallback, stops, view }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('useWindowPlatformSubscriptions', () => {
  it('collapses only hover chat when native hover collapse fires with the panel closed', () => {
    const pet = {
      ...createDefaultPet(),
      ui: {
        ...createDefaultPet().ui,
        panelOpen: false,
        position: { x: 12, y: 34 }
      }
    }

    const { getTrayCallback, inferLeanDirection, setDockLeanDirection, setDockLeanAmount, setBubbleVisible, collapseFloatingSurfaces, collapseHoverChatOnly, updatePanelState } = renderSubscriptions(pet)

    act(() => {
      getTrayCallback()?.('edgeCollapse')
    })

    expect(inferLeanDirection).toHaveBeenCalledWith(pet.ui.position)
    expect(setDockLeanDirection).toHaveBeenCalledWith('left')
    expect(setDockLeanAmount).toHaveBeenCalledWith('active')
    expect(collapseHoverChatOnly).toHaveBeenCalledTimes(1)
    expect(setBubbleVisible).not.toHaveBeenCalledWith(false)
    expect(collapseFloatingSurfaces).not.toHaveBeenCalled()
    expect(updatePanelState).not.toHaveBeenCalled()
  })

  it('hides all floating surfaces when native hover collapse closes the panel', () => {
    const pet = {
      ...createDefaultPet(),
      ui: {
        ...createDefaultPet().ui,
        panelOpen: true,
        position: { x: 12, y: 34 }
      }
    }

    const { getTrayCallback, setBubbleVisible, collapseFloatingSurfaces, collapseHoverChatOnly, updatePanelState } = renderSubscriptions(pet)

    act(() => {
      getTrayCallback()?.('edgeCollapse')
    })

    expect(collapseHoverChatOnly).toHaveBeenCalledTimes(1)
    expect(setBubbleVisible).toHaveBeenCalledWith(false)
    expect(collapseFloatingSurfaces).toHaveBeenCalledTimes(1)
    expect(updatePanelState).toHaveBeenCalledWith(false)
  })

  it('unsubscribes all platform listeners on unmount', () => {
    const { stops, view } = renderSubscriptions(createDefaultPet())

    view.unmount()

    expect(stops.tray).toHaveBeenCalledTimes(1)
    expect(stops.reminder).toHaveBeenCalledTimes(1)
    expect(stops.petUpdates).toHaveBeenCalledTimes(1)
    expect(stops.reminderUpdates).toHaveBeenCalledTimes(1)
    expect(stops.walkTick).toHaveBeenCalledTimes(1)
  })
})
