/**
 * Adapter: PlafondParams → ViewerPlafond.
 *
 * THIS IS THE ONLY FILE in the viewer subsystem that may import PlafondParams.
 * It forms the architectural boundary between the V1/V2 data model and the
 * viewer's own ceiling input contract (ViewerPlafond). Keeping this boundary
 * explicit mirrors the wallToViewerWall pattern and protects future evolution:
 * the viewer ceiling builder can be refactored independently of PlafondParams.
 *
 * Responsibilities:
 *  - Derive room dimensions from the polygon bounding box (wallPoints).
 *  - Convert all dimensions from millimetres to metres (mm → m).
 *  - Produce a ViewerPlafond ready for consumption by usePlafondBuilder.
 *
 * NOT this file's responsibility:
 *  - Span validation (validerPortee) — done in ViewerCanvas BEFORE adapting.
 *  - Debouncing — done in ViewerCanvas after adapting.
 */

import type { PlafondParams } from '@/types'
import type { ViewerPlafond } from '@/types/viewer'
import { mmToM } from '@/lib/viewer/helpers'
import { boundingBox } from '@/lib/geometry'
import type { Point } from '@/lib/geometry'

/**
 * Convert raw PlafondParams (mm) to a ViewerPlafond (meters).
 *
 * The room dimensions (longueurM, largeurM) are derived from the axis-aligned
 * bounding box of the closed polygon defined by wallPoints. This avoids any
 * manual user input for room size — the plan editor is the single source of
 * truth for room geometry.
 *
 * Call this ONLY when validerPortee has already confirmed the span is valid.
 * The adapter itself performs no validation.
 *
 * @param params       - Raw ceiling params from the project (all dims in mm).
 * @param wallPoints   - The polygon points from wall.points (metres, plan space).
 * @returns              A ViewerPlafond with all dims in meters, ready for buildPlafond.
 */
export function plafondToViewer(params: PlafondParams, wallPoints: Point[]): ViewerPlafond {
  const bb = boundingBox(wallPoints)
  return {
    longueurM:           bb.width,
    largeurM:            bb.height,
    hauteurFinieM:       mmToM(params.hauteurFinie),
    entraxeM:            mmToM(params.entraxeFourrure),
    avecIsolation:       params.avecIsolation,
    epaisseurIsolationM: mmToM(params.epaisseurIsolation),
    // plan X → world X, plan Y (width axis) → world Z
    polygonPoints:       wallPoints.map(p => ({ x: p.x, z: p.y })),
  }
}
