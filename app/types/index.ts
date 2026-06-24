export type StudWidth = 36 | 48 | 62 | 70 | 90 | 100
export type DoorWidth = 73 | 83

export interface Door {
  id: string
  wallId: string
  width: DoorWidth          // cm
  openingDirection: 'right' | 'left'  // 'right' = pivot left (poussant droit); 'left' = pivot right
  openingSide: 'front' | 'back'       // which face of the wall the door swings toward
  positionOnWall: number    // meters from wall start (always the left jamb of the opening)
}

export interface Wall {
  kind: 'wall'
  id: string
  points: { x: number; y: number }[]  // polygon vertices in meters
  height: number            // meters, default 2.5
  studWidth: StudWidth      // mm, default 48
  cladding: 'double' | 'single'
  hasInsulation: boolean
  hasCeiling: boolean       // default true; unused in V1 calculation, persisted for V2
  doors: Door[]
  lockedSegments: number[]  // segment indices whose length is user-set and must not change
}

/**
 * Parameters for a suspended ceiling (plafond autoportant) attached to a project.
 * All dimensions in mm.
 *
 * NOTE: longueur/largeur are NOT stored here — they are derived from walls[0]
 * bounding box at calculation time (see lib/geometry.ts boundingBox).
 */
export interface PlafondParams {
  hauteurSousDalle: number   // mm — raw slab-to-slab height
  hauteurFinie: number       // mm — desired finished ceiling height (must be ≤ hauteurSousDalle − 30)
  entraxeFourrure: number    // mm — furring channel spacing, default 600
  avecIsolation: boolean
  epaisseurIsolation: number // mm — insulation thickness, default 100
}

/** Result of a span-validation check for a suspended ceiling configuration. portee in mm. */
export interface ValidationResult {
  valide: boolean
  portee: number             // mm — governing span dimension
  message?: string
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  schemaVersion: number          // currently always 1
  walls: Wall[]
  bomOverrides: Record<string, number>  // keyed by BomItem reference string
  thumbnail?: string        // base64 png
  plafond?: PlafondParams   // optional; undefined = no ceiling configured for this project
}

export interface Settings {
  maxSpanSingle: number         // 2.00 m
  maxSpanDoubled: number        // 4.00 m
  studSpacingStandard: number   // 60 cm
  studSpacingReinforced: number // 40 cm
  maxHeightSingleBoard: number  // 6.35 m
  maxHeightDoubleBoard: number  // 6.85 m
  screwRatio: number            // 25 screws/m²
  defaultBoardWidth: number     // 1200 mm
  defaultBoardHeight: number    // 2500 mm
  fitTolerance: number          // 10 mm
  maxSpanCeilingMm: number      // 3600 mm — DTU 25.41 max self-supporting span for CD 60/27 furring
}

export interface BomItem {
  id: string
  category: 'ossature' | 'parement' | 'visserie' | 'portes' | 'finition' | 'isolation'
  designation: string
  reference: string
  catalogId?: string   // matches CatalogItem.id in lib/catalog.ts; undefined when no catalog entry exists
  width?: string
  length?: string
  quantity: number
  unit: string
  manualOverride?: number
}
