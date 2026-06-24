'use client'

/**
 * Cloison geometry builder for the 3D viewer.
 *
 * This module exports `buildCloison`, a pure builder function (not a React
 * hook despite the filename — it is called from inside useThreeScene's async
 * init() which already provides the Three module and scene reference).
 *
 * STORY-3 scope: ALL segments of the polygon (multi-segment walls), plus door
 * openings (board masking, doubled jamb studs, horizontal lintel).
 *
 * Per-segment framing (rails, studs, BA13 boards) is built in local space and
 * then placed into world space with a position + Y-axis rotation derived from
 * the segment's startX/startZ/angleRad (set by the adapter wallToViewerWall).
 *
 * NO corner mitring in V2.0 — studs/boards may slightly overlap or gap at
 * corners. This is acceptable per the locked architecture decision.
 *
 * S1 — DISPOSE CONTRACT
 * Every BufferGeometry and InstancedMesh created here is tracked in the
 * returned `dispose` function. The caller (useThreeScene) must call dispose()
 * before rebuilding or on unmount. Meshes are removed from the scene inside
 * dispose() so the scene stays clean.
 *
 * S2 — MATERIAL OWNERSHIP
 * Materials (MAT_ACIER, MAT_PLATRE, MAT_RAIL) are MODULE-LEVEL SINGLETONS
 * shared across all viewer instances (mobile sheet + desktop panel). We NEVER
 * call material.dispose() here — the materials live for the page lifetime.
 * Only geometries are per-instance and disposed here.
 */

import type * as THREE_NS from 'three'
import type { ViewerMaterials } from '@/lib/viewer/materials'
import type { ViewerWall, ViewerOpening } from '@/types/viewer'
import { mmToM, studPositions } from '@/lib/viewer/helpers'
import { layoutPlates } from '@/lib/viewer/plateLayout'
import type { Opening } from '@/lib/viewer/plateLayout'

// ── Dimensions from spec §5.1 / §5.2 / §5.3 (all in meters) ─────────────

/** Rail web depth in meters (1 mm simplified for visual). */
const RAIL_WEB_DEPTH_M = mmToM(1.0)
/** Rail flange height in meters (28 mm standard). */
const RAIL_FLANGE_H_M = mmToM(28.0)

/** Board width (horizontal) in meters. */
const BOARD_W_M = mmToM(1200)
/** Board height (vertical) in meters. */
const BOARD_H_M = mmToM(2500)
/** Board thickness in meters. */
const BOARD_T_M = mmToM(12.5)

/**
 * Z offset from the stud centreline to the board centre (board sits flush
 * against the outer stud face along Z).
 *
 * The stud box depth along Z is studD = 35 mm (C-profile return, constant).
 * The board thickness along Z is BOARD_T_M = 12.5 mm.
 *
 *   offset = studD/2 + BOARD_T_M/2  =  17.5 mm + 6.25 mm  =  23.75 mm
 *
 * Flush-board sanity: board inner face Z = offset - BOARD_T_M/2 = studD/2
 * = 17.5 mm — exactly the outer stud face. ✓
 *
 * Note: studWidthMm (the X-axis profile width, e.g. 48 mm) plays NO role here;
 * the Z offset is driven solely by the stud's Z-depth (studD) and the board
 * thickness. The constant is computed from module-level meters values so units
 * stay consistent throughout.
 */
const FACE_OFFSET_M = mmToM(35) / 2 + BOARD_T_M / 2

// ── Catalog ID helpers ────────────────────────────────────────────────────

/** Length key for catalog IDs — nearest commercial stud length (m). */
function studLengthKey(heightM: number): string {
  // Common commercial lengths in cm: 270, 300, 350, 400, 450, 500, 600
  const commercial = [2.7, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0]
  const chosen = commercial.find((l) => l >= heightM) ?? 6.0
  return String(Math.round(chosen * 100))
}

/** e.g. 48 mm stud, 3.00 m → 'montant-48-300' */
function studCatalogId(studWidthMm: number, heightM: number): string {
  return `montant-${studWidthMm}-${studLengthKey(heightM)}`
}

/** e.g. 48 mm rail → 'rail-48-300' (rails are always 3 m commercial). */
function railCatalogId(studWidthMm: number): string {
  return `rail-${studWidthMm}-300`
}

// ── Return type ──────────────────────────────────────────────────────────

export interface CloisonDisposer {
  /** Remove all meshes from the scene and dispose all geometries. */
  dispose(): void
}

// ── Per-segment straight-run builder ─────────────────────────────────────

/**
 * Context for building a single straight segment's geometry in LOCAL space
 * (X runs along the wall, Y is up, Z is thickness direction), then placing it
 * into world space using startX / startZ / angleRad from the ViewerSegment.
 *
 * The caller accumulates all created meshes/geometries into the provided arrays
 * so the top-level disposer can clean them all up together.
 */
function buildSegment(
  THREE: typeof THREE_NS,
  scene: THREE_NS.Scene,
  runL: number,
  wallH: number,
  studWidthMm: number,
  entraxeM: number,
  faces: 'simple' | 'double',
  openings: ViewerOpening[],   // only openings for this segment (already filtered)
  materials: ViewerMaterials,
  startX: number,
  startZ: number,
  angleRad: number,
  hasInsulation: boolean,
  meshes: THREE_NS.Mesh[],
  instancedMeshes: THREE_NS.InstancedMesh[],
  geometries: THREE_NS.BufferGeometry[]
): void {
  const studW = mmToM(studWidthMm)
  // Stud depth (the 35 mm C-profile return, simplified to a box per spec §5.2).
  const studD = mmToM(35)

  // The segment is built in local space where:
  //   - X runs from 0 to runL along the wall
  //   - Y runs from 0 (floor) to wallH (ceiling)
  //   - Z is the thickness direction (face offset ±FACE_OFFSET_M)
  //
  // We then create a Group, add all geometry to it, and position + rotate the
  // group into world space. The group is not tracked separately — we extract
  // world matrices from it and embed them directly into each mesh/IM.
  //
  // Actually we use a simpler approach: create an Object3D as the parent pivot,
  // set all local positions relative to it, then extract the world matrix into
  // each individual mesh after group.updateWorldMatrix(). This avoids keeping
  // the group in the scene (no extra THREE.Group to track/dispose).

  // Pivot for local→world transform of this segment.
  // Position at the segment start, rotated around Y.
  const pivot = new THREE.Object3D()
  pivot.position.set(startX, 0, startZ)
  pivot.rotation.y = angleRad
  pivot.updateMatrixWorld(true)

  // Helper: create a world-space mesh from a local position.
  function addLocalMesh(
    geo: THREE_NS.BufferGeometry,
    mat: THREE_NS.Material,
    catalogId: string,
    designation: string,
    localX: number,
    localY: number,
    localZ: number
  ): THREE_NS.Mesh {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.userData = { catalogId, designation }
    mesh.castShadow = true
    mesh.receiveShadow = true

    // Build the local transform via a dummy Object3D attached to the pivot.
    const dummy = new THREE.Object3D()
    pivot.add(dummy)
    dummy.position.set(localX, localY, localZ)
    dummy.updateWorldMatrix(true, false)

    // Copy world transform into the mesh's matrix then decompose it.
    mesh.matrix.copy(dummy.matrixWorld)
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
    mesh.matrixAutoUpdate = true

    pivot.remove(dummy)

    scene.add(mesh)
    meshes.push(mesh)
    geometries.push(geo)
    return mesh
  }

  // ── Bottom rail ──────────────────────────────────────────────────────────
  const bottomRailGeo = new THREE.BoxGeometry(runL, RAIL_WEB_DEPTH_M, studW)
  addLocalMesh(
    bottomRailGeo,
    materials.MAT_RAIL,
    railCatalogId(studWidthMm),
    `Rail ${studWidthMm} mm — 3 m`,
    runL / 2,               // local X: centred along the run
    RAIL_WEB_DEPTH_M / 2,  // local Y: sits on ground (y=0)
    0                       // local Z
  )

  // ── Top rail ────────────────────────────────────────────────────────────
  const topRailGeo = new THREE.BoxGeometry(runL, RAIL_WEB_DEPTH_M, studW)
  addLocalMesh(
    topRailGeo,
    materials.MAT_RAIL,
    railCatalogId(studWidthMm),
    `Rail ${studWidthMm} mm — 3 m`,
    runL / 2,
    wallH - RAIL_WEB_DEPTH_M / 2,
    0
  )

  // ── Rail flanges (visual U-profile fidelity) ─────────────────────────────
  for (const isBottomRail of [true, false]) {
    const webY = isBottomRail ? RAIL_WEB_DEPTH_M / 2 : wallH - RAIL_WEB_DEPTH_M / 2
    const flangeSign = isBottomRail ? 1 : -1
    const flangeY = webY + flangeSign * (RAIL_WEB_DEPTH_M / 2 + RAIL_FLANGE_H_M / 2)

    for (const side of [-1, 1] as const) {
      const flangeZ = side * (studW / 2 - RAIL_WEB_DEPTH_M / 2)
      const flangeGeo = new THREE.BoxGeometry(runL, RAIL_FLANGE_H_M, RAIL_WEB_DEPTH_M)
      geometries.push(flangeGeo)
      const flangeMesh = new THREE.Mesh(flangeGeo, materials.MAT_RAIL)
      flangeMesh.userData = {
        catalogId: railCatalogId(studWidthMm),
        designation: `Rail ${studWidthMm} mm — aile`,
      }
      flangeMesh.castShadow = true

      const dummy = new THREE.Object3D()
      pivot.add(dummy)
      dummy.position.set(runL / 2, flangeY, flangeZ)
      dummy.updateWorldMatrix(true, false)
      flangeMesh.matrix.copy(dummy.matrixWorld)
      flangeMesh.matrix.decompose(flangeMesh.position, flangeMesh.quaternion, flangeMesh.scale)
      flangeMesh.matrixAutoUpdate = true
      pivot.remove(dummy)

      scene.add(flangeMesh)
      meshes.push(flangeMesh)
    }
  }

  // ── Build opening lookup: for each opening, track the X interval it occupies
  // so studs and boards can check for intersection/masking.
  //
  // opening.positionX is the LOCAL position of the door centre along this segment.
  // The opening spans [positionX - width/2, positionX + width/2] horizontally.
  interface OpeningInterval {
    leftX: number    // left edge of opening in local X
    rightX: number   // right edge of opening in local X
    topY: number     // top edge of opening in local Y (= opening.height)
    width: number
    height: number
  }
  const openingIntervals: OpeningInterval[] = openings.map((op) => ({
    leftX: op.positionX - op.width / 2,
    rightX: op.positionX + op.width / 2,
    topY: op.height,
    width: op.width,
    height: op.height,
  }))

  // ── Studs ────────────────────────────────────────────────────────────────
  const studHeight = wallH - RAIL_WEB_DEPTH_M * 2  // fits between rails
  const studCatId = studCatalogId(studWidthMm, wallH)
  const studDesignation = `Montant ${studWidthMm} mm — ${studLengthKey(wallH)} cm`

  // Collect ALL stud X positions (regular + jamb studs), dedup, sort.
  const regularStudXs = studPositions(runL, entraxeM)

  // Extra jamb studs: immediately to the left and right of each opening.
  // A jamb stud is placed at the opening edge (left or right), full height.
  // We nudge it half a stud-width inward so it sits just inside the opening edge.
  const jambStudXs: number[] = []
  for (const iv of openingIntervals) {
    // Left jamb: stud centre at leftX - studW/2 (flush with left edge of opening).
    const leftJamb = iv.leftX - studW / 2
    // Right jamb: stud centre at rightX + studW/2 (flush with right edge).
    const rightJamb = iv.rightX + studW / 2
    // Clamp to run bounds.
    if (leftJamb >= 0) jambStudXs.push(leftJamb)
    if (rightJamb <= runL) jambStudXs.push(rightJamb)
  }

  // Filter regular studs that fall inside a door opening zone.
  // Door zone for each opening: [positionX - width/2, positionX + width/2].
  // Only jamb studs (added separately above) should appear in that zone.
  const filteredRegularStudXs = regularStudXs.filter((x) =>
    !openingIntervals.some(
      (iv) => x > iv.leftX && x < iv.rightX
    )
  )

  // Merge and deduplicate (within 5 mm tolerance).
  const allStudXs = [...filteredRegularStudXs, ...jambStudXs].sort((a, b) => a - b)
  const deduped: number[] = []
  for (const x of allStudXs) {
    if (deduped.length === 0 || x - deduped[deduped.length - 1] > 0.005) {
      deduped.push(x)
    }
  }

  for (const studX of deduped) {
    const studGeo = new THREE.BoxGeometry(studW, studHeight, studD)
    addLocalMesh(
      studGeo,
      materials.MAT_ACIER,
      studCatId,
      studDesignation,
      studX,
      wallH / 2,  // centred vertically between rails
      0
    )
  }

  // ── Door lintels ────────────────────────────────────────────────────────
  // A horizontal rail segment spanning each opening width, placed at the top
  // of the opening (opening.height). Uses the rail material/section.
  for (const iv of openingIntervals) {
    const linteldX = iv.width
    const lintelGeo = new THREE.BoxGeometry(linteldX, RAIL_WEB_DEPTH_M, studW)
    addLocalMesh(
      lintelGeo,
      materials.MAT_RAIL,
      railCatalogId(studWidthMm),
      `Linteau ${studWidthMm} mm — ouverture`,
      iv.leftX + linteldX / 2,   // local X: centred on opening
      iv.topY + RAIL_WEB_DEPTH_M / 2,  // local Y: sits on top of the opening
      0
    )
  }

  // ── BA13 boards — individual ShapeGeometry plates with edge outlines ──────
  //
  // STORY-7b: Each 1200×2500 mm sheet is a separate ShapeGeometry so we can
  // show individual plate outlines and represent door notches as Shape holes
  // (no CSG needed). ~30–60 plates for a full room — well within mobile budget.
  //
  // Plate layout: layoutPlates() in lib/viewer/plateLayout.ts.
  // Outlines: batched LineSegments per face built from plate rect coords.

  const boardFaceDirections: number[] = faces === 'double' ? [-1, 1] : [1]

  // Convert openingIntervals to the Opening format expected by layoutPlates.
  // openingIntervals is already computed above: { leftX, rightX, topY }.
  const plateOpenings: Opening[] = openingIntervals.map(iv => ({
    leftX: iv.leftX,
    rightX: iv.rightX,
    topY: iv.topY,
  }))

  const plates = layoutPlates(runL, wallH, BOARD_W_M, BOARD_H_M, plateOpenings)

  // Helper: place a mesh or line object into world space via the pivot transform.
  // The object's local position is (0, 0, z) — the shape coords already encode X/Y.
  function addPlateObject<T extends THREE_NS.Object3D>(obj: T, z: number): T {
    obj.castShadow = true
    const dummy = new THREE.Object3D()
    pivot.add(dummy)
    dummy.position.set(0, 0, z)
    dummy.updateWorldMatrix(true, false)
    obj.matrix.copy(dummy.matrixWorld)
    obj.matrix.decompose(obj.position, obj.quaternion, obj.scale)
    obj.matrixAutoUpdate = true
    pivot.remove(dummy)
    scene.add(obj)
    meshes.push(obj as unknown as THREE_NS.Mesh)
    return obj
  }

  for (const dir of boardFaceDirections) {
    const z = dir * FACE_OFFSET_M

    // Accumulate all outline line-segment positions for this face in one array.
    const edgePositions: number[] = []
    const edgeCutPositions: number[] = []

    for (const plate of plates) {
      // ── Plate mesh (ShapeGeometry with optional holes) ──────────────────
      const shape = new THREE.Shape()
      shape.moveTo(plate.x, plate.y)
      shape.lineTo(plate.x + plate.w, plate.y)
      shape.lineTo(plate.x + plate.w, plate.y + plate.h)
      shape.lineTo(plate.x, plate.y + plate.h)
      shape.closePath()

      for (const hole of plate.holes) {
        const path = new THREE.Path()
        path.moveTo(plate.x + hole.hx, plate.y + hole.hy)
        path.lineTo(plate.x + hole.hx + hole.hw, plate.y + hole.hy)
        path.lineTo(plate.x + hole.hx + hole.hw, plate.y + hole.hy + hole.hh)
        path.lineTo(plate.x + hole.hx, plate.y + hole.hy + hole.hh)
        path.closePath()
        shape.holes.push(path)
      }

      const geo = new THREE.ShapeGeometry(shape)
      geometries.push(geo)

      // ShapeGeometry lies in the XY plane; the shape coords are already in
      // wall-local space. We apply the pivot's world transform via the
      // addPlateObject helper (offset to the face Z only).
      const plateMesh = new THREE.Mesh(geo, materials.MAT_PLATRE)
      plateMesh.userData = {
        catalogId: 'ba13-standard-250x120',
        designation: 'Plaque BA13 LABELPLAC 2500×1200×12.5 mm',
      }
      plateMesh.receiveShadow = true
      addPlateObject(plateMesh, z)

      // ── Edge outline coords (accumulated for batched LineSegments) ───────
      // Outer rect: 4 line segments (8 position entries each × 3 floats)
      const target = plate.isCut ? edgeCutPositions : edgePositions
      const x0 = plate.x, y0 = plate.y, x1 = plate.x + plate.w, y1 = plate.y + plate.h
      // Bottom
      target.push(x0, y0, 0,  x1, y0, 0)
      // Right
      target.push(x1, y0, 0,  x1, y1, 0)
      // Top
      target.push(x1, y1, 0,  x0, y1, 0)
      // Left
      target.push(x0, y1, 0,  x0, y0, 0)

      // Hole outlines
      for (const hole of plate.holes) {
        const hx0 = plate.x + hole.hx, hy0 = plate.y + hole.hy
        const hx1 = hx0 + hole.hw,     hy1 = hy0 + hole.hh
        target.push(hx0, hy0, 0,  hx1, hy0, 0)
        target.push(hx1, hy0, 0,  hx1, hy1, 0)
        target.push(hx1, hy1, 0,  hx0, hy1, 0)
        target.push(hx0, hy1, 0,  hx0, hy0, 0)
      }
    }

    // ── Build batched LineSegments for this face ─────────────────────────
    // Line coords are in XY wall-local space (Z=0); addPlateObject shifts
    // the whole object to the face Z in world space.
    if (edgePositions.length > 0) {
      const edgeGeo = new THREE.BufferGeometry()
      edgeGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(edgePositions, 3)
      )
      geometries.push(edgeGeo)
      const lines = new THREE.LineSegments(edgeGeo, materials.MAT_EDGE)
      addPlateObject(lines, z)
    }

    if (edgeCutPositions.length > 0) {
      const edgeCutGeo = new THREE.BufferGeometry()
      edgeCutGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(edgeCutPositions, 3)
      )
      geometries.push(edgeCutGeo)
      const cutLines = new THREE.LineSegments(edgeCutGeo, materials.MAT_EDGE_CUT)
      addPlateObject(cutLines, z)
    }
  }

  // ── Wall insulation (Rockwool Rockmur 40 mm) — per-bay slabs ────────────
  // Insulation fills the BAYS between studs (not through them). One slab per
  // bay, cut around each stud's X extent and each door opening.
  // Z thickness = studD (the stud cavity depth, 35 mm). Layer = 'isolation'.
  if (hasInsulation) {
    // Build blocked intervals: stud extents + door opening zones.
    const blocked: { lo: number; hi: number }[] = []
    for (const sx of deduped) {
      blocked.push({ lo: sx - studW / 2, hi: sx + studW / 2 })
    }
    for (const iv of openingIntervals) {
      blocked.push({ lo: iv.leftX, hi: iv.rightX })
    }
    blocked.sort((a, b) => a.lo - b.lo)

    // Merge overlapping blocked intervals.
    const merged: { lo: number; hi: number }[] = []
    for (const seg of blocked) {
      if (merged.length > 0 && seg.lo <= merged[merged.length - 1].hi + 0.001) {
        merged[merged.length - 1].hi = Math.max(merged[merged.length - 1].hi, seg.hi)
      } else {
        merged.push({ lo: seg.lo, hi: seg.hi })
      }
    }

    // Available bays = complement of merged within [0, runL].
    const bays: { lo: number; hi: number }[] = []
    let cursor = 0
    for (const { lo, hi } of merged) {
      if (lo > cursor + 0.001) bays.push({ lo: cursor, hi: lo })
      cursor = Math.max(cursor, hi)
    }
    if (cursor < runL - 0.001) bays.push({ lo: cursor, hi: runL })

    for (const { lo, hi } of bays) {
      const bayLen = hi - lo
      if (bayLen < 0.005) continue
      const insoGeo = new THREE.BoxGeometry(bayLen, wallH, studD)
      const insoMesh = addLocalMesh(
        insoGeo,
        materials.MAT_LAINE,
        'rockwool-rockmur-40mm',
        'Laine de roche Rockmur kraft 40mm R1,1',
        (lo + hi) / 2,
        wallH / 2,
        0
      )
      insoMesh.userData = {
        layer: 'isolation',
        designation: 'Laine de roche Rockmur kraft 40mm R1,1',
        catalogId: 'rockwool-rockmur-40mm',
      }
      insoMesh.visible = false
    }
  }
}

// ── Main builder ─────────────────────────────────────────────────────────

/**
 * Build the 3D framing geometry for ALL segments of a wall polygon and add
 * all meshes to `scene`.
 *
 * STORY-3: Iterates every segment, builds its straight-run framing in local
 * space, then places + rotates it into world space using the segment's
 * startX / startZ / angleRad (set by the adapter wallToViewerWall.ts).
 *
 * Returns a `dispose` function that removes all created meshes from the scene
 * and disposes all geometries (but NOT materials — see S2 note above).
 */
export function buildCloison(
  THREE: typeof THREE_NS,
  scene: THREE_NS.Scene,
  viewerWall: ViewerWall,
  materials: ViewerMaterials
): CloisonDisposer {
  // Guard: we need at least one segment.
  if (viewerWall.segments.length === 0) {
    return { dispose: () => undefined }
  }

  const { studWidthMm, entraxeM, faces, openings, hasInsulation } = viewerWall

  // All meshes and geometries tracked for disposal across ALL segments.
  const meshes: THREE_NS.Mesh[] = []
  const instancedMeshes: THREE_NS.InstancedMesh[] = []
  const geometries: THREE_NS.BufferGeometry[] = []

  for (let segIdx = 0; segIdx < viewerWall.segments.length; segIdx++) {
    const seg = viewerWall.segments[segIdx]
    if (seg.length < 0.001) continue  // skip zero-length degenerate segments

    // Openings that belong to this segment.
    const segOpenings = openings.filter((op) => op.segmentIndex === segIdx)

    buildSegment(
      THREE,
      scene,
      seg.length,
      seg.height,
      studWidthMm,
      entraxeM,
      faces,
      segOpenings,
      materials,
      seg.startX,
      seg.startZ,
      seg.angleRad,
      hasInsulation,
      meshes,
      instancedMeshes,
      geometries
    )
  }

  // ── Disposer ──────────────────────────────────────────────────────────
  return {
    dispose() {
      // Remove all regular meshes from the scene.
      for (const mesh of meshes) {
        scene.remove(mesh)
      }
      // Remove all instanced meshes from the scene and free the GPU instance
      // matrix buffer. im.dispose() frees instanceMatrix only — geometry is
      // already in `geometries` and disposed below; material is a shared
      // singleton and is NOT disposed here (see S2 above).
      for (const im of instancedMeshes) {
        scene.remove(im)
        im.dispose()
      }
      // Dispose all tracked geometries.
      // S2: we do NOT dispose materials — they are shared module-level
      // singletons (getMaterials() in lib/viewer/materials.ts) that may be
      // in use by another viewer instance (mobile sheet + desktop panel).
      for (const geo of geometries) {
        geo.dispose()
      }
    },
  }
}
