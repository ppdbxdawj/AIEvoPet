import { useEffect, useRef } from 'react'
import type { PetCutoutPlacement, PetMotionProfile, PetShowExpression } from '../types/pet'
import type { OneShotClipState, PetAnimationManifest } from '../types/pet-animation'
import type { PetRigDefinition } from '../pet-renderer/rig-types'
import { PetRigRuntime } from '../pet-renderer/runtime'

interface PetMeshCanvasProps {
  rig: PetRigDefinition
  motionProfile: PetMotionProfile
  placements?: PetCutoutPlacement[]
  expression?: PetShowExpression
  showDebug: boolean
  animationManifest?: PetAnimationManifest
  spriteOverlay?: OneShotClipState | null
}

export function PetMeshCanvas({ rig, motionProfile, placements, expression, showDebug, animationManifest, spriteOverlay }: PetMeshCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<PetRigRuntime | null>(null)
  const className = expression ? `pet-mesh-canvas expression-eyes-${expression.eyes} expression-mouth-${expression.mouth}` : 'pet-mesh-canvas'

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const runtime = new PetRigRuntime()
    runtimeRef.current = runtime
    void runtime.mount(host, rig, motionProfile, placements).then(() => {
      runtime.setDebugVisible(showDebug)
    })

    return () => {
      runtime.destroy()
      runtimeRef.current = null
    }
  }, [rig])

  useEffect(() => {
    runtimeRef.current?.updateProfile(motionProfile)
  }, [motionProfile])

  useEffect(() => {
    runtimeRef.current?.updatePlacements(placements)
  }, [placements])

  useEffect(() => {
    runtimeRef.current?.setDebugVisible(showDebug)
  }, [showDebug])

  useEffect(() => {
    if (!animationManifest) return
    void runtimeRef.current?.playSpriteOverlay(animationManifest, spriteOverlay ?? null)
  }, [animationManifest, spriteOverlay])

  return <div ref={hostRef} className={className} aria-hidden="true" />
}
