import type { PetMotionProfile } from '../types/pet'
import type { RigMotionState } from './rig-types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const cycle = (time: number, speed: number, phase = 0) => Math.sin(time * speed + phase)
const levelValue = (value: PetMotionProfile['earWiggle']) => value === 'active' ? 1 : value === 'soft' ? 0.55 : 0

const lerp = (left: number, right: number, progress: number) => left + (right - left) * progress

export const blendRigMotionStates = (from: RigMotionState, to: RigMotionState, progress: number): RigMotionState => {
  const eased = clamp(progress * progress * (3 - 2 * progress), 0, 1)
  return Object.fromEntries(
    Object.entries(to).map(([key, value]) => [key, lerp(from[key as keyof RigMotionState], value, eased)])
  ) as unknown as RigMotionState
}

export const createRigMotionState = (profile: PetMotionProfile, elapsedMs: number): RigMotionState => {
  const time = elapsedMs / 1000
  const talk = profile.mode === 'talk'
  const bounce = profile.mode === 'bounce'
  const hungry = profile.mode === 'hungry'
  const sleepy = profile.mode === 'sleepy'
  const alert = profile.mode === 'alert'
  const thinking = profile.mode === 'thinking'
  const reviewing = profile.mode === 'reviewing'
  const failed = profile.mode === 'failed'
  const waiting = profile.mode === 'waiting'

  const earSoft = profile.earWiggle === 'soft' ? 1 : 0
  const earActive = profile.earWiggle === 'active' ? 1 : 0
  const snoutSoft = profile.snoutPulse === 'soft' ? 1 : 0
  const snoutActive = profile.snoutPulse === 'active' ? 1 : 0
  const cheekSoft = profile.cheekPulse === 'soft' ? 1 : 0
  const cheekActive = profile.cheekPulse === 'active' ? 1 : 0
  const highlightSoft = profile.highlightPulse === 'soft' ? 1 : 0
  const highlightActive = profile.highlightPulse === 'active' ? 1 : 0

  const bodyFloat = sleepy
    ? cycle(time, 1.05) * 1.2 + 0.85
    : bounce
      ? cycle(time, 4.4) * 2.6
      : hungry
        ? cycle(time, 2) * 1.05
        : alert
          ? cycle(time, 4.2) * 1.3
          : failed
            ? cycle(time, 1.25) * 0.42 + 0.9
            : waiting
              ? cycle(time, 0.92) * 0.5 + 0.5
              : thinking || reviewing
                ? cycle(time, reviewing ? 1.9 : 1.25) * 0.72
                : cycle(time, 1.45) * 0.55

  const bodyScaleX = bounce ? 1 + cycle(time, 4.4, Math.PI * 0.2) * 0.03 : sleepy ? 0.985 : failed ? 1.012 : 1 + cycle(time, 1.2, 0.4) * 0.008
  const bodyScaleY = sleepy ? 0.982 : bounce ? 1 - cycle(time, 4.4, Math.PI * 0.2) * 0.03 : failed ? 0.986 : 1 - cycle(time, 1.2, 0.4) * 0.008
  const bodyRotation = sleepy ? cycle(time, 0.88) * 0.018 : alert ? cycle(time, 3.6) * 0.03 : failed ? -0.035 + cycle(time, 1.2) * 0.01 : thinking ? cycle(time, 0.82) * 0.025 : reviewing ? cycle(time, 1.6) * 0.026 : cycle(time, 1.3) * 0.01
  const bodyOffsetX = hungry ? cycle(time, 2, Math.PI / 2) * 1.6 : alert ? cycle(time, 3.1) * 1.4 : reviewing ? cycle(time, 2.8, Math.PI / 2) * 1.2 : cycle(time, 1.4, Math.PI / 2) * 0.6

  const earWave = cycle(time, alert ? 7.8 : bounce ? 5.6 : hungry ? 2.6 : reviewing ? 3.4 : thinking ? 2.2 : 1.8)
  const earMotion = earSoft * 0.14 + earActive * 0.28
  const leftEarRotation = earWave * earMotion
  const rightEarRotation = -earWave * earMotion
  const leftEarLift = -Math.max(0, earWave) * (earSoft * 2.2 + earActive * 4.8)
  const rightEarLift = -Math.max(0, -earWave) * (earSoft * 2.2 + earActive * 4.8)

  const snoutWave = cycle(time, talk ? 9.6 : hungry ? 3.4 : alert ? 4.2 : failed ? 2.4 : reviewing ? 3.2 : 1.8)
  const snoutScaleX = 1 + snoutWave * (snoutSoft * 0.028 + snoutActive * 0.06)
  const snoutScaleY = 1 - snoutWave * (snoutSoft * 0.03 + snoutActive * 0.08)
  const snoutOffsetY = snoutWave * (snoutSoft * 0.9 + snoutActive * 2.2)

  const sleepyEye = profile.blink === 'sleepy'
  const alertEye = profile.blink === 'alert'
  const softBlink = profile.blink === 'soft'
  const blinkPulse = softBlink
    ? 1 - Math.pow(Math.max(0, cycle(time, 2.15, -1.25)), 18)
    : sleepyEye
      ? 0.08 + (cycle(time, 1.05) + 1) * 0.015
      : alertEye
        ? 0.86 + Math.max(0, cycle(time, 6.8)) * 0.08
        : 1

  const leftEyeScaleY = clamp(blinkPulse, 0.04, 1)
  const rightEyeScaleY = clamp(alertEye ? blinkPulse + 0.03 : blinkPulse, 0.04, 1)
  const leftEyeOffsetY = sleepyEye ? 3 : alertEye ? -0.6 : 0
  const rightEyeOffsetY = sleepyEye ? 3 : alertEye ? -0.6 : 0

  const cheekWave = cycle(time, bounce ? 4.8 : hungry ? 2 : failed ? 1.15 : 1.4)
  const cheekScale = 1 + cheekWave * (cheekSoft * 0.028 + cheekActive * 0.05)
  const cheekOffsetY = cheekWave * (cheekSoft * 0.35 + cheekActive * 0.8)

  const highlightWave = cycle(time, alert ? 5.4 : bounce ? 4.3 : talk ? 2.5 : waiting ? 1.1 : thinking ? 1.6 : 1.4)
  const highlightOffsetY = highlightWave * (highlightSoft * 0.6 + highlightActive * 1.4)
  const highlightAlpha = clamp(0.12 + highlightSoft * 0.06 + highlightActive * 0.1 + highlightWave * 0.03, 0.09, 0.36)

  const headBob = levelValue(profile.headBob)
  const headTilt = levelValue(profile.headTilt)
  const bodySquash = levelValue(profile.bodySquash)
  const limbBounce = levelValue(profile.limbBounce)
  const eyeFocus = levelValue(profile.eyeFocus)
  const lean = levelValue(profile.leanAmount)
  const leanDirection = profile.leanDirection === 'left' ? -1 : profile.leanDirection === 'right' ? 1 : 0

  const headOffsetX = cycle(time, talk ? 2.7 : sleepy ? 0.75 : bounce ? 3.8 : reviewing ? 3.1 : thinking ? 1.2 : 1.35, Math.PI / 2) * (headTilt * 3.6 + headBob * 0.9)
  const headOffsetY = cycle(time, talk ? 3.2 : sleepy ? 0.95 : bounce ? 4.2 : waiting ? 1.05 : 1.6, 0.25) * (headBob * 5.8)
  const headRotation = (failed ? -0.06 : 0) + cycle(time, talk ? 2.8 : sleepy ? 0.82 : hungry ? 1.8 : thinking ? 0.95 : reviewing ? 2.1 : 1.35) * (headTilt * 0.085)
  const headScaleX = 1 + cycle(time, 1.5, 0.4) * (bodySquash * 0.026)
  const headScaleY = 1 - cycle(time, 1.5, 0.4) * (bodySquash * 0.026)
  const limbsOffsetX = -cycle(time, bounce ? 4.4 : talk ? 2.3 : 1.7, Math.PI / 2) * (limbBounce * 3.8)
  const limbsOffsetY = cycle(time, bounce ? 4.5 : talk ? 2.4 : 1.6, 1) * (limbBounce * 7.2)
  const limbsRotation = cycle(time, bounce ? 4.2 : 1.8) * (limbBounce * 0.075)
  const limbsScaleX = 1 + cycle(time, 2.1, 0.8) * (limbBounce * 0.034)
  const limbsScaleY = 1 - cycle(time, 2.1, 0.8) * (limbBounce * 0.028)
  const leanOffsetX = leanDirection * lean * 6.2
  const leanOffsetY = lean * 1.6
  const leanRotation = leanDirection * lean * 0.09
  const eyeFocusOffsetY = cycle(time, talk ? 3.4 : 1.8, 0.7) * (eyeFocus * 1.8)

  return {
    bodyFloat,
    bodyScaleX,
    bodyScaleY,
    bodyRotation,
    bodyOffsetX,
    leftEarRotation,
    rightEarRotation,
    leftEarLift,
    rightEarLift,
    snoutScaleX,
    snoutScaleY,
    snoutOffsetY,
    leftEyeScaleY,
    rightEyeScaleY,
    leftEyeOffsetY,
    rightEyeOffsetY,
    cheekScale,
    cheekOffsetY,
    highlightOffsetY,
    highlightAlpha,
    headOffsetX,
    headOffsetY,
    headRotation,
    headScaleX,
    headScaleY,
    limbsOffsetX,
    limbsOffsetY,
    limbsRotation,
    limbsScaleX,
    limbsScaleY,
    leanOffsetX,
    leanOffsetY,
    leanRotation,
    eyeFocusOffsetY
  }
}
