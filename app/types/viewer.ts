/**
 * Viewer-subsystem input contract — decoupled from the V1 data model.
 *
 * These types are the ONLY things the viewer builders ever see:
 *  - ViewerWall  → consumed by useCloisonBuilder
 *  - ViewerPlafond → consumed by usePlafondBuilder (STORY-6b)
 *
 * Adapter boundaries:
 *  - lib/viewer/wallToViewerWall.ts   — only file importing V1 Wall
 *  - lib/viewer/plafondToViewer.ts    — only file importing PlafondParams
 *
 * Both adapters are the sole cross-boundary files; builders are pure geometry.
 *
 * Modelled as arrays so STORY-3 can extend without a type change:
 * - segments: STORY-2 consumes [0]; STORY-3 consumes all of them.
 * - openings: STORY-3 fills these per segment.
 */

export interface ViewerSegment {
  /** Run length in meters. */
  length: number
  /** Wall height in meters. */
  height: number
  /**
   * STORY-3: World-space start position of this segment.
   * The plan's 2D (x, y) maps to world (x, z); wall height is world y.
   * Derived from wall.points by the adapter (wallToViewerWall.ts).
   */
  startX: number
  startZ: number
  /**
   * STORY-3: Rotation angle (radians) around the Y axis for this segment.
   * 0 = segment runs along world +X. Computed from atan2 of the segment
   * direction vector in the plan (dx, dy) → atan2(-dy, dx) for world space.
   */
  angleRad: number
}

export interface ViewerOpening {
  /** Opening width in meters (hors-tout including tolerances). */
  width: number
  /** Opening height in meters. */
  height: number
  /**
   * The door CENTRE's local distance in meters from the left end of the segment
   * this opening sits on.
   *
   * Convention note: the V1 model stores `door.positionOnWall` as the door's
   * LEFT EDGE (meters from wall.points[0]). The adapter (wallToViewerWall.ts)
   * converts to centre by adding `dims.width / 2` before writing this field.
   * The builder (useCloisonBuilder.ts) then recovers edges as:
   *   leftX  = positionX - width / 2
   *   rightX = positionX + width / 2
   * which equals [positionOnWall, positionOnWall + width] — matching the plan editor.
   */
  positionX: number
  /**
   * STORY-3: Which segment (by index into ViewerWall.segments) this opening
   * belongs to. The builder uses this to place openings on the right segment.
   */
  segmentIndex: number
}

export interface ViewerWall {
  /** One entry per straight run. STORY-3 renders all of them. */
  segments: ViewerSegment[]
  /** Stud profile width in mm (e.g. 48). */
  studWidthMm: number
  /** Stud spacing (centre-to-centre) in meters (e.g. 0.60). */
  entraxeM: number
  /** Single or double face cladding. */
  faces: 'simple' | 'double'
  /**
   * Door openings. Each carries a segmentIndex so the builder places it on
   * the correct segment. Positions are local (from the segment's left end).
   */
  openings: ViewerOpening[]
  /**
   * Whether the wall cavity is filled with insulation (e.g. Rockwool Rockmur
   * 40 mm). When true, the builder adds an insulation slab mesh with
   * userData.layer = 'isolation' so the Isolation toggle controls it.
   */
  hasInsulation: boolean
}

/**
 * STORY-6b: Viewer-domain ceiling params — all dimensions in METERS (already
 * converted by the adapter lib/viewer/plafondToViewer.ts).
 *
 * The builder (usePlafondBuilder.ts) consumes this type exclusively; it never
 * imports PlafondParams. The adapter is the ONLY viewer file that may import
 * PlafondParams (mirrors the wallToViewerWall decoupling pattern).
 */
export interface ViewerPlafond {
  /** Room length in meters (world X axis). */
  longueurM: number
  /** Room width in meters (world Z axis). */
  largeurM: number
  /** Desired finished ceiling height in meters (world Y). */
  hauteurFinieM: number
  /** Furring channel centre-to-centre spacing in meters. */
  entraxeM: number
  /** Whether to render the isolation layer (glass wool mesh). */
  avecIsolation: boolean
  /**
   * Insulation thickness in meters. Only meaningful when avecIsolation is true.
   * Present regardless so the builder signature stays stable.
   */
  epaisseurIsolationM: number
  /**
   * Polygon outline of the room floor plan in world space (meters, X-Z plane).
   * Derived from wall.points by the adapter (plafondToViewer.ts).
   * plan X → world X, plan Y → world Z.
   * May include a trailing duplicate of points[0] (the closing point added by
   * the draw gesture) — the builder deduplicates before use.
   * When empty (no wall points), the builder falls back to the bounding-box
   * rectangle [longueurM × largeurM].
   */
  polygonPoints: { x: number; z: number }[]
}
