/**
 * Adapter: V1 Wall → ViewerWall.
 *
 * THIS IS THE ONLY FILE in the viewer subsystem that may import the V1 Wall
 * type. It forms the architectural boundary between the V1 data model and the
 * viewer's own input contract (ViewerWall). Keeping this boundary explicit
 * protects V3 evolution: the viewer can be refactored independently of V1.
 *
 * IMPORTANT: stud/rail placement in the viewer is GEOMETRIC and recomputed
 * independently of lib/calculation.ts. The calculation engine produces
 * rounded purchasing quantities; the viewer needs exact centred positions.
 * The two share only the Settings spacing values.
 *
 * STORY-3: getDoorOuterDims is imported from lib/calculation.ts — the adapter
 * is the intended point of contact between the V1 domain (Wall/Door types,
 * opening dimensions) and the viewer subsystem. The builder (useCloisonBuilder)
 * must not import calculation.ts.
 */

import type { Wall, Settings } from '@/types'
import type { ViewerWall, ViewerOpening, ViewerSegment } from '@/types/viewer'
import { segmentsOf, locateOnWall } from '@/lib/geometry'
import { getDoorOuterDims } from '@/lib/calculation'

/**
 * Convert a V1 Wall into a ViewerWall for the 3D viewer.
 *
 * @param wall      The V1 wall from IndexedDB / project state.
 * @param settings  The current Settings (loaded from localStorage).
 * @returns         A ViewerWall ready for consumption by the builder.
 */
export function wallToViewerWall(wall: Wall, settings: Settings): ViewerWall {
  const segs = segmentsOf(wall.points)

  // Build ViewerSegments with world-space placement info.
  // The plan's 2D coordinate system: (x, y) in meters on the floor plan.
  // World-space mapping: plan x → world x, plan y → world z, wall height → world y.
  //
  // angleRad is the Y-axis rotation so the segment runs from its start point in
  // the direction of the plan segment vector. A segment with direction (+1, 0) in
  // the plan runs along world +X (angle = 0). atan2(-dy, dx) gives the correct
  // Y-axis rotation in the Three.js right-handed coordinate system.
  const viewerSegments: ViewerSegment[] = segs.map((seg) => {
    const dx = seg.b.x - seg.a.x
    const dy = seg.b.y - seg.a.y
    return {
      length: seg.length,
      height: wall.height,
      startX: seg.a.x,
      startZ: seg.a.y,  // plan y → world z
      angleRad: Math.atan2(-dy, dx),
    }
  })

  // Resolve door openings: map each door to the segment it sits on, compute
  // its local position along that segment, and compute outer dimensions from
  // getDoorOuterDims (settings-driven — never hardcoded).
  const openings: ViewerOpening[] = []
  for (const door of wall.doors) {
    const located = locateOnWall(wall.points, door.positionOnWall)
    if (!located) continue

    const dims = getDoorOuterDims(door.width, settings.fitTolerance)
    // V1 convention (canonical, see usePlanCanvas.ts / DoorEditSheet.tsx):
    // door.positionOnWall is the door's LEFT EDGE in meters from wall.points[0].
    // The door occupies [positionOnWall, positionOnWall + dims.width].
    //
    // ViewerOpening.positionX must be the door CENTRE's local distance from the
    // segment's left end, because the builder (useCloisonBuilder.ts) derives
    // leftX = positionX - width/2 and rightX = positionX + width/2.
    //
    // So: localLeftEdge = door.positionOnWall - located.segment.startOffset
    //     positionX     = localLeftEdge + dims.width / 2  (centre)
    const positionX =
      (door.positionOnWall - located.segment.startOffset) + dims.width / 2

    openings.push({
      width: dims.width,
      height: dims.height,
      positionX,
      segmentIndex: located.segment.index,
    })
  }

  return {
    segments: viewerSegments,
    studWidthMm: wall.studWidth,
    // settings.studSpacingStandard is in cm — convert to meters.
    entraxeM: settings.studSpacingStandard / 100,
    // V1 uses 'single' / 'double'; ViewerWall uses 'simple' / 'double' (from spec §3.1).
    faces: wall.cladding === 'double' ? 'double' : 'simple',
    openings,
    hasInsulation: wall.hasInsulation ?? false,
  }
}
