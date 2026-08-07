export type RigMotionGroup = 'body' | 'head' | 'limbs' | 'ears' | 'snout' | 'cheeks' | 'eyes' | 'highlight'
export type RigPartKind = 'base' | 'overlay'
export type RigDeformMode = 'mesh' | 'rotation' | 'scaleY' | 'warp' | 'static'
export type RigRegionRole = 'body' | 'head' | 'limb' | 'ear' | 'eye' | 'snout' | 'cheek' | 'highlight'

export interface Point2D {
  x: number
  y: number
}

export interface Rect2D {
  x: number
  y: number
  width: number
  height: number
}

export interface RigMeshWarp {
  topLeft?: Point2D
  topRight?: Point2D
  bottomRight?: Point2D
  bottomLeft?: Point2D
}

export interface RigMeshResolution {
  x: number
  y: number
}

export interface RigPartTransform {
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  visible: boolean
}

export interface PetRigPart {
  id: string
  kind: RigPartKind
  regionRole: RigRegionRole
  motionGroup: RigMotionGroup
  deformMode: RigDeformMode
  texture?: string
  polygon?: Point2D[]
  excludePolygons?: Point2D[][]
  pivot?: Point2D
  pivotRatio?: Point2D
  drawOrder: number
  followBase?: boolean
  basePosition?: Point2D
  warp?: RigMeshWarp
  opacity?: number
  blendMode?: 'normal' | 'screen'
  meshResolution?: RigMeshResolution
  textureFrame?: Rect2D
  placementId?: string
  defaultTransform: RigPartTransform
}

export interface PetRigDefinition {
  id: string
  width: number
  height: number
  texture?: string
  parts: PetRigPart[]
}

export interface RigMotionState {
  bodyFloat: number
  bodyScaleX: number
  bodyScaleY: number
  bodyRotation: number
  bodyOffsetX: number
  leftEarRotation: number
  rightEarRotation: number
  leftEarLift: number
  rightEarLift: number
  snoutScaleX: number
  snoutScaleY: number
  snoutOffsetY: number
  leftEyeScaleY: number
  rightEyeScaleY: number
  leftEyeOffsetY: number
  rightEyeOffsetY: number
  cheekScale: number
  cheekOffsetY: number
  highlightOffsetY: number
  highlightAlpha: number
  headOffsetX: number
  headOffsetY: number
  headRotation: number
  headScaleX: number
  headScaleY: number
  limbsOffsetX: number
  limbsOffsetY: number
  limbsRotation: number
  limbsScaleX: number
  limbsScaleY: number
  leanOffsetX: number
  leanOffsetY: number
  leanRotation: number
  eyeFocusOffsetY: number
}
