/**
 * Pure plate-layout function for BA13 plasterboard sheets.
 * No Three.js — safe to import anywhere.
 */

export interface Opening {
  leftX: number   // meters from wall left edge
  rightX: number
  topY: number    // meters from wall bottom (= opening height, since all openings start at floor)
}

export interface PlateHole {
  hx: number  // left edge of hole relative to plate origin
  hy: number  // bottom edge of hole relative to plate origin
  hw: number  // hole width
  hh: number  // hole height
}

export interface Plate {
  x: number       // left edge in wall-local coords (m)
  y: number       // bottom edge (m)
  w: number       // actual width (m) — may be < boardW for cut plates
  h: number       // actual height (m) — may be < boardH for cut plates
  holes: PlateHole[]
  isCut: boolean  // true when w < boardW, h < boardH, OR has holes
}

/**
 * Lay out BA13 plates over a wall face.
 *
 * @param wallLength  Wall run length in meters.
 * @param wallHeight  Wall height in meters.
 * @param boardW      Board width in meters (default 1.2).
 * @param boardH      Board height in meters (default 2.5).
 * @param openings    Door/opening rectangles (all start at y=0).
 */
export function layoutPlates(
  wallLength: number,
  wallHeight: number,
  boardW: number,
  boardH: number,
  openings: Opening[]
): Plate[] {
  const plates: Plate[] = []

  const colCount = Math.floor(wallLength / boardW) + (wallLength % boardW > 0.001 ? 1 : 0)
  const rowCount = Math.floor(wallHeight / boardH) + (wallHeight % boardH > 0.001 ? 1 : 0)

  for (let col = 0; col < colCount; col++) {
    const px = col * boardW
    const pw = Math.min(boardW, wallLength - px)
    if (pw <= 0.001) continue

    for (let row = 0; row < rowCount; row++) {
      const py = row * boardH
      const ph = Math.min(boardH, wallHeight - py)
      if (ph <= 0.001) continue

      // Find any openings that intersect this plate cell
      const holes: PlateHole[] = []
      for (const op of openings) {
        // Opening goes from floor (y=0) to op.topY
        const oxL = op.leftX
        const oxR = op.rightX
        const oyB = 0
        const oyT = op.topY

        // Intersect with plate bounds
        const ix1 = Math.max(oxL, px)
        const ix2 = Math.min(oxR, px + pw)
        const iy1 = Math.max(oyB, py)
        const iy2 = Math.min(oyT, py + ph)

        if (ix2 - ix1 > 0.001 && iy2 - iy1 > 0.001) {
          // Snap hole edges that touch the plate edge to avoid earcut slivers
          const hx = ix1 - px < 0.005 ? 0 : ix1 - px
          const hx2 = (px + pw) - ix2 < 0.005 ? pw : ix2 - px
          const hy = iy1 - py < 0.005 ? 0 : iy1 - py
          const hy2 = (py + ph) - iy2 < 0.005 ? ph : iy2 - py

          const hw = hx2 - hx
          const hh = hy2 - hy
          if (hw > 0.001 && hh > 0.001) {
            holes.push({ hx, hy, hw, hh })
          }
        }
      }

      // Skip plates that are entirely inside an opening (hole covers the whole plate)
      const isFullyCovered = holes.some(
        h => h.hx <= 0.001 && h.hy <= 0.001 && h.hw >= pw - 0.001 && h.hh >= ph - 0.001
      )
      if (isFullyCovered) continue

      plates.push({
        x: px,
        y: py,
        w: pw,
        h: ph,
        holes,
        isCut: pw < boardW - 0.001 || ph < boardH - 0.001 || holes.length > 0,
      })
    }
  }

  return plates
}
