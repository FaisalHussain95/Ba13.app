'use client'

/**
 * Ceiling geometry builder for the 3D viewer — STORY-6b scope.
 *
 * Consumes ViewerPlafond (all dimensions already in metres — conversion is done
 * by the adapter lib/viewer/plafondToViewer.ts). Does NOT import PlafondParams.
 *
 * Geometry built:
 *  - CD 60/27 furring channels (one BoxGeometry per clipped segment per row,
 *    scanline-clipped to the actual polygon, MAT_ACIER)
 *  - BA13 ceiling board (grid of BoxGeometry 2500×1200 mm plates, MAT_PLATRE)
 *  - Glass-wool insulation slab (BoxGeometry spanning the bounding box,
 *    MAT_LAINE) — ONLY when viewerPlafond.avecIsolation is true.
 *
 * S1 — DISPOSE CONTRACT (unchanged from 6a, mirrors useCloisonBuilder.ts)
 * Every BufferGeometry created is tracked in geometries[].
 * Every Mesh created is tracked in meshes[].
 * dispose() removes every mesh from the scene and disposes every geometry.
 * MAT_ACIER / MAT_PLATRE / MAT_LAINE are SINGLETONS — NEVER disposed here (S2).
 *
 * S2 — MATERIAL OWNERSHIP
 * All materials come from getMaterials() in lib/viewer/materials.ts. They
 * outlive any single builder call and must never be disposed by the builder.
 *
 * COORDINATE SYSTEM (unchanged from 6a)
 * Matches the cloison builder:
 *   plan X → world X (longueur runs along X)
 *   plan Y (width)   → world Z (largeur runs along Z)
 *   height           → world Y, floor at y = 0
 *
 * Ceiling footprint: governed by polygonPoints (X-Z plane).
 * Furring rows run along X, spaced along Z by entraxeM, clipped to polygon.
 *
 * LAYER STACKING (from floor up, at the ceiling plane):
 *   BA13 board: grid of 2500×1200 mm BoxGeometry plates, each 12.5 mm thick.
 *     bottom face at y = hauteurFinieM → mesh centre y = hauteurFinieM - BA13_THICKNESS_M/2
 *   Furring sits on top of the board:
 *     → furring centre y = hauteurFinieM + MONTANT_HEIGHT_M/2
 *   Insulation sits on top of the furring (when avecIsolation=true):
 *     → insulation centre y = hauteurFinieM + MONTANT_HEIGHT_M + epaisseurIsolationM/2
 *        (simplified: spec §7 gives position as hauteurFinie + 27 mm + epaisseurIsolation/2)
 */

import type * as THREE_NS from 'three'
import type { ViewerMaterials } from '@/lib/viewer/materials'
import type { ViewerPlafond } from '@/types/viewer'

// ── Fixed dimensions (metres) ─────────────────────────────────────────────────

/** Montant 48/35 ISOLPRO used as ceiling runner: 48 mm depth (Y), 35 mm flange (Z per unit). */
const MONTANT_HEIGHT_M = 0.048
const MONTANT_WIDTH_M  = 0.035

/** BA13 board thickness = 12.5 mm. Board hangs below hauteurFinieM. */
const BA13_THICKNESS_M = 0.0125
/** BA13 plate width along world X (2500 mm). */
const PLATE_X_M = 2.5
/** BA13 plate depth along world Z (1200 mm). */
const PLATE_Z_M = 1.2

// ── Return type (mirrors CloisonDisposer) ─────────────────────────────────────

export interface PlafondDisposer {
  /** Remove all ceiling meshes from the scene and dispose all geometries. */
  dispose(): void
}

// ── Polygon helpers ───────────────────────────────────────────────────────────

type PolyPoint = { x: number; z: number }

/**
 * Deduplicate the polygon's closing point if it duplicates the first point
 * (distance < 1 mm). The draw gesture appends a closing duplicate — we remove
 * it before feeding the polygon to Three.js Shape or the scanline clipper.
 */
function dedupePolygon(pts: PolyPoint[]): PolyPoint[] {
  if (pts.length > 1) {
    const first = pts[0]
    const last  = pts[pts.length - 1]
    if (Math.hypot(first.x - last.x, first.z - last.z) < 0.001) {
      return pts.slice(0, -1)
    }
  }
  return pts
}

/**
 * Scanline intersection: given a horizontal line at world-Z = zWorld,
 * return all [xMin, xMax] segments inside the polygon.
 *
 * Uses the standard even-odd crossing rule: cast a ray along Z at the given
 * zWorld, collect X-intercepts with every polygon edge, sort them, and pair
 * them up as (in, out) segments.
 *
 * @param zWorld  - Z position of the scanline row.
 * @param poly    - Deduplicated, non-closing polygon.
 */
function clipRowToPolygon(
  zWorld: number,
  poly: PolyPoint[]
): Array<{ xMin: number; xMax: number }> {
  const xs: number[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const zLo = Math.min(a.z, b.z)
    const zHi = Math.max(a.z, b.z)
    // Skip horizontal edges (degenerate) and scanlines outside the edge span.
    if (zHi === zLo) continue
    if (zWorld < zLo || zWorld > zHi) continue
    const t = (zWorld - a.z) / (b.z - a.z)
    xs.push(a.x + t * (b.x - a.x))
  }
  xs.sort((a, b) => a - b)
  const segs: Array<{ xMin: number; xMax: number }> = []
  for (let i = 0; i + 1 < xs.length; i += 2) {
    segs.push({ xMin: xs[i], xMax: xs[i + 1] })
  }
  return segs
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build 3D ceiling geometry (furring grid + BA13 board + optional insulation)
 * and add all meshes to `scene`. Returns a disposer whose dispose() is
 * MANDATORY to call before rebuilding or on unmount.
 *
 * Guard: if longueurM <= 0 or largeurM <= 0, returns a no-op disposer.
 *
 * @param THREE          - The lazily-imported Three.js module.
 * @param scene          - The Three.js Scene to add meshes to.
 * @param viewerPlafond  - Pre-adapted ceiling params (all dims in metres).
 * @param materials      - Singleton materials from getMaterials().
 */
export function buildPlafond(
  THREE: typeof THREE_NS,
  scene: THREE_NS.Scene,
  viewerPlafond: ViewerPlafond,
  materials: ViewerMaterials
): PlafondDisposer {
  const { longueurM, largeurM, hauteurFinieM, entraxeM, avecIsolation, epaisseurIsolationM } = viewerPlafond
  const mats = materials

  // S1 guard: degenerate dimensions → no-op disposer (nothing to dispose).
  if (longueurM <= 0 || largeurM <= 0) {
    return { dispose: () => undefined }
  }

  // S1: every created object is tracked here for disposal.
  const meshes: THREE_NS.Mesh[] = []
  const geometries: THREE_NS.BufferGeometry[] = []
  const lines: THREE_NS.Object3D[] = []

  // ── Helper: create, track, and add a box mesh ─────────────────────────────
  // All geometries are pushed to geometries[] and all meshes to meshes[] so
  // the disposer can free them all without knowing which objects were built.
  function addBox(
    geo: THREE_NS.BoxGeometry,
    mat: THREE_NS.MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    catalogId: string,
    designation: string,
    extraUserData?: Record<string, string>
  ): void {
    geometries.push(geo)                            // S1: track geometry
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData = { catalogId, designation, ...extraUserData }
    scene.add(mesh)
    meshes.push(mesh)                               // S1: track mesh
  }

  // ── Determine polygon to use ──────────────────────────────────────────────
  //
  // Prefer the polygon from polygonPoints (derived from wall.points in the
  // adapter). Fall back to the bounding-box rectangle when no polygon was
  // supplied (e.g. ceiling-only mode with no wall drawn).
  const rawPoly = viewerPlafond.polygonPoints
  const deduped: PolyPoint[] = rawPoly.length >= 3
    ? dedupePolygon(rawPoly)
    : [
        { x: 0,          z: 0          },
        { x: longueurM,  z: 0          },
        { x: longueurM,  z: largeurM   },
        { x: 0,          z: largeurM   },
      ]

  // Bounding box of the polygon (used for row count and insulation slab).
  const xVals   = deduped.map(p => p.x)
  const zVals   = deduped.map(p => p.z)
  const polyMinX = Math.min(...xVals)
  const polyMaxX = Math.max(...xVals)
  const polyMinZ = Math.min(...zVals)
  const polyMaxZ = Math.max(...zVals)
  const polyWidthZ = polyMaxZ - polyMinZ

  // Sorted unique Z-coords of all polygon vertices. Each consecutive pair defines
  // a horizontal "zone" with a constant polygon cross-section. Used by the BA13
  // and insulation loops so that tile boundaries never straddle a polygon edge
  // (which would cause plates to overflow through internal wall faces, e.g. the
  // step wall of an L-shaped room).
  const zoneZs = Array.from(new Set(deduped.map(p => p.z))).sort((a, b) => a - b)

  // ── BA13 ceiling board — zone-aware scanline-clipped plate grid ───────────
  //
  // The 50 mm INSET is applied to ALL zone boundaries (not just polyMinZ/polyMaxZ)
  // so plates also stay clear of internal horizontal wall faces (L-step, T-junction…).
  // Within each inset zone, plates are tiled in Z (PLATE_Z_M) and X (PLATE_X_M).
  //
  // Y positioning:  board centre y = hauteurFinieM - BA13_THICKNESS_M / 2

  const boardY  = hauteurFinieM - BA13_THICKNESS_M / 2
  const edgeY   = boardY + BA13_THICKNESS_M / 2   // top face of ceiling BA13
  const INSET   = 0.05

  const ceilingEdgePositions: number[] = []

  if (deduped.length >= 3) {
    for (let zi = 0; zi < zoneZs.length - 1; zi++) {
      const zLo    = zoneZs[zi]
      const zHi    = zoneZs[zi + 1]
      const zStart = zLo + INSET
      const zEnd   = zHi - INSET
      if (zEnd <= zStart + 0.001) continue   // zone too narrow

      const xSegs = clipRowToPolygon((zLo + zHi) / 2, deduped)

      for (const { xMin: segXMin, xMax: segXMax } of xSegs) {
        const xStart = segXMin + INSET
        const xEnd   = segXMax - INSET
        if (xEnd - xStart < 0.01) continue

        let zTileStart = zStart
        while (zTileStart < zEnd) {
          const zTileEnd   = Math.min(zTileStart + PLATE_Z_M, zEnd)
          const zTileDepth = zTileEnd - zTileStart
          if (zTileDepth < 0.001) break

          const cz = (zTileStart + zTileEnd) / 2

          let plateXStart = xStart
          while (plateXStart < xEnd) {
            const plateWidth = Math.min(PLATE_X_M, xEnd - plateXStart)
            if (plateWidth < 0.01) break

            const plateGeo = new THREE.BoxGeometry(plateWidth, BA13_THICKNESS_M, zTileDepth)
            addBox(
              plateGeo,
              mats.MAT_PLATRE,
              plateXStart + plateWidth / 2,
              boardY,
              cz,
              'ba13-standard-250x120',
              'Plaque BA13 2500×1200 — plafond',
              { layer: 'plafond', reference: 'BA13-PLAFOND' }
            )

            // Accumulate top-face outline for this plate (world XZ, at edgeY).
            const x0 = plateXStart, x1 = plateXStart + plateWidth
            const z0 = zTileStart,  z1 = zTileEnd
            ceilingEdgePositions.push(
              x0, edgeY, z0,  x1, edgeY, z0,
              x1, edgeY, z0,  x1, edgeY, z1,
              x1, edgeY, z1,  x0, edgeY, z1,
              x0, edgeY, z1,  x0, edgeY, z0,
            )

            plateXStart += PLATE_X_M
          }

          zTileStart += PLATE_Z_M
        }
      }
    }
  }

  // Build a single batched LineSegments for all ceiling plate outlines.
  if (ceilingEdgePositions.length > 0) {
    const edgeGeo = new THREE.BufferGeometry()
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ceilingEdgePositions, 3))
    geometries.push(edgeGeo)
    const edgeLines = new THREE.LineSegments(edgeGeo, mats.MAT_EDGE)
    edgeLines.userData = { layer: 'plafond' }
    scene.add(edgeLines)
    lines.push(edgeLines)
  }

  // ── Furring grid (Montant 48/35 ISOLPRO — 3 m) ───────────────────────────
  //
  // Each runner row runs along X, at a Z position spaced by entraxeM.
  // Edge rows (row 0 and row nbRows) use a SINGLE Montant 48/35.
  // Interior rows use TWO Montants side-by-side (MONTANT_WIDTH_M × 2 in Z).
  // Each row is scanline-clipped to the polygon.
  //
  // Y centre: runner sits on top of the BA13 board (top at hauteurFinieM).
  //   runner centre y = hauteurFinieM + MONTANT_HEIGHT_M / 2

  const furringY = hauteurFinieM + MONTANT_HEIGHT_M / 2
  const nbRows = Math.ceil(polyWidthZ / entraxeM) + 1

  for (let row = 0; row <= nbRows; row++) {
    const zRow   = polyMinZ + row * entraxeM
    const isEdge = (row === 0 || row === nbRows)
    const runnerZ = isEdge ? MONTANT_WIDTH_M : MONTANT_WIDTH_M * 2
    const clips  = clipRowToPolygon(zRow, deduped)

    for (const { xMin, xMax } of clips) {
      const segLen = xMax - xMin
      if (segLen < 0.01) continue

      const furringGeom = new THREE.BoxGeometry(segLen, MONTANT_HEIGHT_M, runnerZ)
      addBox(
        furringGeom,
        mats.MAT_ACIER,
        (xMin + xMax) / 2,
        furringY,
        zRow,
        'montant-48-35-300',
        isEdge
          ? 'Montant 48/35 ISOLPRO — 3,00 m'
          : 'Montant 48/35 ISOLPRO — 3,00 m (×2)',
        { layer: 'plafond', reference: 'MONTANT-48-35-3M' }
      )
    }
  }

  // ── Isolation layer (STORY-6b) ────────────────────────────────────────────
  //
  // Built ONLY when avecIsolation is true. Sits on top of the furring.
  // Spans the bounding box of the polygon (simpler geometry, acceptable for V1).
  //
  // Y centre (spec §7):
  //   insulation y_centre = hauteurFinieM + MONTANT_HEIGHT_M + epaisseurIsolationM/2
  //   i.e.  hauteurFinieM + 27 mm (furring web) + epaisseurIsolationM/2
  //
  // DISPOSE: the geo+mesh are tracked via addBox() in geometries[]/meshes[],
  // so the existing dispose() already frees them on rebuild and unmount.

  if (avecIsolation) {
    // Insulation sits in the BAYS between runner rows, resting on the BA13 board.
    // Y: centred from hauteurFinieM (board top) upward by epaisseurIsolationM.
    const insulationY = hauteurFinieM + epaisseurIsolationM / 2
    const insulationDesignation = `Laine de verre ${Math.round(epaisseurIsolationM * 1000)} mm — plafond`

    for (let zi = 0; zi < zoneZs.length - 1; zi++) {
      const zLo    = zoneZs[zi]
      const zHi    = zoneZs[zi + 1]
      const zStart = zLo + INSET
      const zEnd   = zHi - INSET
      if (zEnd <= zStart + 0.001) continue

      // Build the list of runner-occupied intervals within [zStart, zEnd] so
      // insulation slabs can be cut around each runner.
      const blocked: { lo: number; hi: number }[] = []
      for (let r = 0; r <= nbRows; r++) {
        const zRow    = polyMinZ + r * entraxeM
        const halfGap = (r === 0 || r === nbRows) ? MONTANT_WIDTH_M / 2 : MONTANT_WIDTH_M
        const lo      = zRow - halfGap
        const hi      = zRow + halfGap
        if (hi > zStart && lo < zEnd) {
          blocked.push({ lo: Math.max(lo, zStart), hi: Math.min(hi, zEnd) })
        }
      }
      blocked.sort((a, b) => a.lo - b.lo)

      // Compute insulation bays: complement of blocked intervals within [zStart, zEnd].
      const bays: { lo: number; hi: number }[] = []
      let cursor = zStart
      for (const { lo, hi } of blocked) {
        if (lo > cursor + 0.001) bays.push({ lo: cursor, hi: lo })
        cursor = Math.max(cursor, hi)
      }
      if (cursor < zEnd - 0.001) bays.push({ lo: cursor, hi: zEnd })

      const xSegs = clipRowToPolygon((zLo + zHi) / 2, deduped)

      for (const { lo: insZ0, hi: insZ1 } of bays) {
        const insDepth = insZ1 - insZ0
        if (insDepth < 0.001) continue

        for (const { xMin, xMax } of xSegs) {
          const xStart = xMin + INSET
          const xEnd   = xMax - INSET
          const segLen = xEnd - xStart
          if (segLen < 0.01) continue

          const insulationGeo = new THREE.BoxGeometry(segLen, epaisseurIsolationM, insDepth)
          addBox(
            insulationGeo,
            mats.MAT_LAINE,
            (xStart + xEnd) / 2,
            insulationY,
            (insZ0 + insZ1) / 2,
            'laine-verre-100',
            insulationDesignation,
            { layer: 'isolation', reference: 'LAINE-VERRE-100' }
          )
        }
      }
    }
  }

  // ── S1 Disposer ──────────────────────────────────────────────────────────
  //
  // Mirrors the cloison disposer contract exactly:
  //   1. Remove every mesh from the scene (furring rows + board + optional insulation).
  //   2. Dispose every BufferGeometry.
  //   3. NEVER dispose MAT_ACIER / MAT_PLATRE / MAT_LAINE (S2 — singletons).

  return {
    dispose() {
      for (const mesh of meshes) scene.remove(mesh)
      for (const line of lines) scene.remove(line)
      for (const geo of geometries) geo.dispose()
    },
  }
}
