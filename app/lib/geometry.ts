export interface Point { x: number; y: number }

export function dist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

export interface WallSegment {
  index: number
  a: Point
  b: Point
  length: number
  startOffset: number  // cumulative meters from points[0] to a
}

/**
 * Returns all segments of a wall polyline in order.
 * Open polyline (2 pts) → 1 segment.
 * Closed polygon (>2 pts) → n segments including the closing wrap (last→first).
 */
export function segmentsOf(points: Point[]): WallSegment[] {
  if (points.length < 2) return []
  // If the last point is an explicit duplicate of the first (explicitly-closed polygon),
  // the wrap-around segment (last→first) has zero length. Skip it by reducing count.
  const explicitlyClosed =
    points.length > 2 && dist(points[0], points[points.length - 1]) < 0.001
  const count = points.length > 2
    ? (explicitlyClosed ? points.length - 1 : points.length)
    : points.length - 1
  const segs: WallSegment[] = []
  let offset = 0
  for (let i = 0; i < count; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const length = dist(a, b)
    segs.push({ index: i, a, b, length, startOffset: offset })
    offset += length
  }
  return segs
}

/**
 * Locates positionOnWall on a segment. Returns null if points has < 2 vertices.
 * Clamps positionOnWall to [0, perimeter].
 */
export function locateOnWall(
  points: Point[],
  positionOnWall: number
): { segment: WallSegment; t: number } | null {
  const segs = segmentsOf(points)
  if (segs.length === 0) return null
  const total = segs[segs.length - 1].startOffset + segs[segs.length - 1].length
  const clamped = Math.max(0, Math.min(positionOnWall, total))
  for (const seg of segs) {
    if (clamped <= seg.startOffset + seg.length + 1e-9) {
      const t = seg.length > 0 ? Math.min(1, (clamped - seg.startOffset) / seg.length) : 0
      return { segment: seg, t }
    }
  }
  const last = segs[segs.length - 1]
  return { segment: last, t: 1 }
}

/**
 * Converts a segment index + local t back to positionOnWall.
 */
export function offsetToPosition(points: Point[], segIndex: number, t: number): number {
  const segs = segmentsOf(points)
  const seg = segs[segIndex]
  if (!seg) return 0
  return seg.startOffset + t * seg.length
}

export function segmentLengthAt(points: Point[], segIdx: number): number {
  if (points.length < 2) return 0
  const n = points.length
  const a = points[segIdx]
  const b = segIdx < n - 1 ? points[segIdx + 1] : points[0]  // closing segment wraps
  return dist(a, b)
}

/**
 * Returns total perimeter of a polyline.
 * If closed (points.length > 2), includes the closing segment.
 */
export function perimeterLength(points: Point[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += dist(points[i], points[i + 1])
  }
  if (points.length > 2) total += dist(points[points.length - 1], points[0])
  return total
}

/**
 * Sets the length of segment `segIdx`, respecting locked-segment constraints.
 *
 * Propagation rule: starting from the moved endpoint, walk downstream.
 * - Locked segment k: shift its far endpoint by the same delta (rigid, preserves length).
 * - First FREE segment encountered: absorb the delta by letting its length change. Stop.
 * - If all downstream segments are locked: fall back to rigid translation of everything.
 *
 * Closing segment (segIdx = n-1, n > 2): moves points[0] and propagates from segment 0 forward.
 *
 * Returns points unchanged when newLength <= 0 or the segment has zero length.
 */
export function setSegmentLength(
  points: Point[],
  segIdx: number,
  newLength: number,
  lockedSegments: number[] = []
): Point[] {
  if (newLength <= 0 || points.length < 2) return points
  const n = points.length
  const isClosing = segIdx === n - 1 && n > 2

  const a = points[segIdx]
  const b = isClosing ? points[0] : points[segIdx + 1]
  const len = dist(a, b)
  if (len === 0) return points

  const dx = (b.x - a.x) / len
  const dy = (b.y - a.y) / len
  const newB: Point = { x: a.x + dx * newLength, y: a.y + dy * newLength }
  const delta: Point = { x: newB.x - b.x, y: newB.y - b.y }

  if (Math.abs(delta.x) < 1e-10 && Math.abs(delta.y) < 1e-10) return points

  const result = [...points]

  if (isClosing) {
    result[0] = newB
    // Propagate from segment 0 (points[0]→points[1]) toward points[n-2].
    // points[n-1] is the hinge of the closing segment and stays fixed.
    for (let k = 1; k <= n - 2; k++) {
      const prevSeg = k - 1  // segment from result[k-1] to result[k]
      if (lockedSegments.includes(prevSeg)) {
        result[k] = { x: points[k].x + delta.x, y: points[k].y + delta.y }
      } else {
        break  // free segment absorbs the delta; result[k] stays
      }
    }
  } else {
    result[segIdx + 1] = newB
    // Propagate from segment segIdx+1 (points[segIdx+1]→points[segIdx+2]) onward.
    // A free segment absorbs the delta by letting its length change (far endpoint stays put).
    for (let k = segIdx + 2; k < n; k++) {
      const prevSeg = k - 1  // segment from result[k-1] to result[k]
      if (lockedSegments.includes(prevSeg)) {
        result[k] = { x: points[k].x + delta.x, y: points[k].y + delta.y }
      } else {
        break  // free segment absorbs; result[k] and everything beyond stays
      }
    }
  }
  return result
}

/**
 * Returns the axis-aligned bounding box of a list of points.
 * For empty or single-point arrays, returns { width: 0, height: 0 }.
 */
export function boundingBox(points: Point[]): { width: number; height: number } {
  if (points.length < 2) return { width: 0, height: 0 }
  let minX = points[0].x, maxX = points[0].x
  let minY = points[0].y, maxY = points[0].y
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < minX) minX = points[i].x
    if (points[i].x > maxX) maxX = points[i].x
    if (points[i].y < minY) minY = points[i].y
    if (points[i].y > maxY) maxY = points[i].y
  }
  return { width: maxX - minX, height: maxY - minY }
}

/**
 * Single source of truth for the closed-polygon test used across the app.
 *
 * A wall is closed when it has ≥ 3 stored points. The canvas only persists a
 * wall object via the close-snap gesture, so any saved wall with 3+ points is
 * a closed polygon by construction. We also accept an explicit trailing
 * duplicate of the first point (distance = 0) for newly-drawn walls.
 */
export function isPolygonClosed(points: Point[]): boolean {
  return points.length >= 3
}

/**
 * Returns the interior angle in degrees at vertex `idx` of a closed polygon.
 * Expects `points[0] ≈ points[n-1]` (closing duplicate). Returns null when
 * the vertex or its neighbours have zero-length edges.
 */
export function angleAtVertex(points: Point[], idx: number): number | null {
  const n = points.length
  if (n < 3) return null
  const m = n - 1  // distinct vertex count
  if (idx < 0 || idx >= m) return null

  const prev = points[(idx - 1 + m) % m]
  const curr = points[idx]
  const next = points[(idx + 1) % m]

  const v1x = prev.x - curr.x, v1y = prev.y - curr.y  // incoming reversed
  const v2x = next.x - curr.x, v2y = next.y - curr.y  // outgoing

  const len1 = Math.hypot(v1x, v1y)
  const len2 = Math.hypot(v2x, v2y)
  if (len1 < 1e-9 || len2 < 1e-9) return null

  const cosA = (v1x * v2x + v1y * v2y) / (len1 * len2)
  return Math.acos(Math.max(-1, Math.min(1, cosA))) * 180 / Math.PI
}

/**
 * Rotates the outgoing segment at vertex `idx` so the interior angle equals
 * `targetDeg`, preserving the CW/CCW turn direction.
 *
 * Only the immediate next vertex moves; the segment after it absorbs the change
 * in length (same propagation contract as setSegmentLength).
 */
export function setVertexAngle(points: Point[], idx: number, targetDeg: number): Point[] {
  const n = points.length
  if (n < 3) return points
  const m = n - 1
  if (idx < 0 || idx >= m) return points

  const prev = points[(idx - 1 + m) % m]
  const curr = points[idx]
  const nextIdx = (idx + 1) % m
  const next = points[nextIdx]

  const v1x = prev.x - curr.x, v1y = prev.y - curr.y
  const v2x = next.x - curr.x, v2y = next.y - curr.y

  const len1 = Math.hypot(v1x, v1y)
  const len2 = Math.hypot(v2x, v2y)
  if (len1 < 1e-9 || len2 < 1e-9) return points

  // Signed angle from v1 to v2 (positive = CCW in maths coords)
  const cross = v1x * v2y - v1y * v2x
  const dotP  = v1x * v2x + v1y * v2y
  const signedAngle = Math.atan2(cross, dotP)

  const targetRad    = targetDeg * Math.PI / 180
  const newSigned    = (Math.sign(signedAngle) || 1) * targetRad
  const rotDelta     = newSigned - signedAngle

  const cosR = Math.cos(rotDelta), sinR = Math.sin(rotDelta)
  const newV2x = v2x * cosR - v2y * sinR
  const newV2y = v2x * sinR + v2y * cosR

  const result = [...points]
  result[nextIdx] = { x: curr.x + newV2x, y: curr.y + newV2y }
  result[n - 1]   = { ...result[0] }  // keep closing duplicate in sync
  return result
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}
