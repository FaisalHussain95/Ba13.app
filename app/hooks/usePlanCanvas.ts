'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import type { Wall, Door } from '@/types'
import { generateId } from '@/lib/utils'
import {
  dist,
  pointToSegmentDistance,
  perimeterLength,
  setSegmentLength,
  segmentsOf,
  locateOnWall,
  isPolygonClosed,
} from '@/lib/geometry'
import type { Point } from '@/lib/geometry'
import { useSettings } from '@/hooks/useSettings'
import { getDoorOuterDims } from '@/lib/calculation'

type Mode = 'wall' | 'door' | 'select'

// Canvas pixels per meter
const PIXELS_PER_METER = 60

// How close (in pixels) to snap to the first vertex and close a polygon
const CLOSE_THRESHOLD_PX = 20

interface Viewport {
  x: number
  y: number
  scale: number
}

function metersToPixels(m: Point, vp: Viewport): Point {
  const ppm = PIXELS_PER_METER * vp.scale
  return {
    x: m.x * ppm + vp.x,
    y: m.y * ppm + vp.y,
  }
}

function pixelsToMeters(px: Point, vp: Viewport): Point {
  const ppm = PIXELS_PER_METER * vp.scale
  return {
    x: (px.x - vp.x) / ppm,
    y: (px.y - vp.y) / ppm,
  }
}

function segmentLengthPx(a: Point, b: Point): number {
  return dist(a, b)
}

/**
 * Draws a grid on the canvas.
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  vp: Viewport
) {
  ctx.save()
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 0.5

  const ppm = PIXELS_PER_METER * vp.scale
  const step = ppm / 2 // grid every 0.5m

  // Vertical lines
  for (let x = vp.x % step; x < width; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  // Horizontal lines
  for (let y = vp.y % step; y < height; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Draws a single wall polygon on the canvas, including door markers.
 *
 * doorOuterWidthFn: returns the full outer opening width (m) for a door
 * doorNumberFn: returns the global "P{n}" index for a door
 */
function drawWall(
  ctx: CanvasRenderingContext2D,
  wall: Wall,
  isSelected: boolean,
  vp: Viewport,
  mode: Mode,
  doorOuterWidthFn: (door: Door) => number,
  doorNumberFn: (door: Door) => number,
  lockedSegments: number[]
) {
  if (wall.points.length < 2) return

  const pxPoints = wall.points.map((p) => metersToPixels(p, vp))

  ctx.save()

  // Fill
  ctx.beginPath()
  ctx.moveTo(pxPoints[0].x, pxPoints[0].y)
  for (let i = 1; i < pxPoints.length; i++) {
    ctx.lineTo(pxPoints[i].x, pxPoints[i].y)
  }
  if (wall.points.length > 2) ctx.closePath()
  ctx.fillStyle = 'rgba(239,243,254,0.5)'
  ctx.fill()

  // Stroke
  ctx.beginPath()
  ctx.moveTo(pxPoints[0].x, pxPoints[0].y)
  for (let i = 1; i < pxPoints.length; i++) {
    ctx.lineTo(pxPoints[i].x, pxPoints[i].y)
  }
  if (wall.points.length > 2) ctx.closePath()
  ctx.strokeStyle = isSelected ? '#1d4ed8' : '#555555'
  ctx.lineWidth = isSelected ? 4 : 2
  ctx.stroke()

  // Vertex dots
  for (const pt of pxPoints) {
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = isSelected ? '#1d4ed8' : '#555555'
    ctx.fill()
  }

  // Segment length labels
  ctx.font = '11px system-ui'

  const drawLabel = (a: Point, b: Point, lenM: number, segIdx: number) => {
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const isLocked = lockedSegments.includes(segIdx)
    const label = lenM.toFixed(2) + ' m'

    const metrics = ctx.measureText(label)
    const bgW = metrics.width + 6
    const bgH = 15

    if (isLocked) {
      // Locked: blue-tinted pill with blue text
      ctx.fillStyle = '#dbeafe'
      ctx.strokeStyle = '#1d4ed8'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect?.(mx - bgW / 2, my - bgH / 2, bgW, bgH, 3)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#1d4ed8'
    } else {
      // Free: white pill with gray text
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillRect(mx - bgW / 2, my - bgH / 2, bgW, bgH)
      ctx.fillStyle = '#374151'
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, mx, my)

    // Editable underline in select mode (only for free segments — locked ones already have a border)
    if (mode === 'select' && !isLocked) {
      const underlineY = my + 5
      ctx.strokeStyle = '#1d4ed8'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(mx - metrics.width / 2, underlineY)
      ctx.lineTo(mx + metrics.width / 2, underlineY)
      ctx.stroke()
    }
  }

  for (let i = 0; i < pxPoints.length - 1; i++) {
    const lenM = segmentLengthPx(wall.points[i], wall.points[i + 1])
    drawLabel(pxPoints[i], pxPoints[i + 1], lenM, i)
  }

  // If closed polygon, also draw last segment label
  if (wall.points.length > 2) {
    const a = pxPoints[pxPoints.length - 1]
    const b = pxPoints[0]
    const lenM = segmentLengthPx(wall.points[wall.points.length - 1], wall.points[0])
    drawLabel(a, b, lenM, wall.points.length - 1)
  }

  // --- Door markers ---
  // positionOnWall = left jamb / hinge edge (meters from wall.points[0])

  // Determine which perpendicular side of each segment is interior.
  // Signed area of the wall polygon in world meter coords (y-down, same as canvas):
  //   > 0 → CW on screen → interior is to the LEFT of each A→B direction (-uy, ux)
  //   < 0 → CCW on screen → interior is to the RIGHT (uy, -ux)
  // For open / degenerate polygons (|area| small, or first≠last point), the
  // signed area is unreliable — default to left (same as original behaviour).
  const pts = wall.points
  const closed = isPolygonClosed(pts)
  let signedAreaM2 = 0
  if (closed) {
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      signedAreaM2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y
    }
    signedAreaM2 *= 0.5
  }
  // interior is left-of-direction when area ≥ 0 (CW) or polygon is open
  const interiorIsLeft = signedAreaM2 >= 0

  for (const door of wall.doors) {
    const wM = doorOuterWidthFn(door)
    const loc = locateOnWall(wall.points, door.positionOnWall)
    if (!loc) continue

    const seg = loc.segment
    const ppm = PIXELS_PER_METER * vp.scale
    const segLenPx = seg.length * ppm

    // Pixel coordinates of the segment endpoints
    const pxA = metersToPixels(seg.a, vp)
    const pxB = metersToPixels(seg.b, vp)

    // Unit direction along wall segment (A → B)
    const ux = segLenPx > 0 ? (pxB.x - pxA.x) / segLenPx : 1
    const uy = segLenPx > 0 ? (pxB.y - pxA.y) / segLenPx : 0

    // Door pixel width
    const wPx = wM * ppm

    // Left jamb pixel position (hinge side) — positionOnWall is in meters from points[0]
    const hingeOffsetPx = (door.positionOnWall - seg.startOffset) * ppm
    const J1 = { x: pxA.x + hingeOffsetPx * ux, y: pxA.y + hingeOffsetPx * uy }
    // Right jamb
    const J2 = { x: J1.x + wPx * ux, y: J1.y + wPx * uy }

    // Hinge side: 'right' (poussant droit) → pivot at J1 (left jamb)
    //             'left' (poussant gauche) → pivot at J2 (right jamb)
    const hinge = door.openingDirection === 'right' ? J1 : J2

    // Inward normal toward the interior of the polygon.
    // interiorIsLeft: left-of-A→B = (-uy, ux); otherwise right = (uy, -ux).
    // 'back' (exterior) flips whichever direction is interior.
    const wantsInterior = (door.openingSide ?? 'front') === 'front'
    const goLeft = interiorIsLeft ? wantsInterior : !wantsInterior
    const nx = goLeft ? -uy : uy
    const ny = goLeft ?  ux : -ux

    // Angle from hinge toward the opposite jamb (arc endpoint)
    const latchAngle = door.openingDirection === 'right'
      ? Math.atan2(uy, ux)    // hinge=J1 → latch=J2, along A→B
      : Math.atan2(-uy, -ux)  // hinge=J2 → latch=J1, against A→B

    // 1. Erase wall line in the opening (white overdraw)
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(J1.x, J1.y)
    ctx.lineTo(J2.x, J2.y)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = (isSelected ? 4 : 2) + 2
    ctx.stroke()

    // 2. Jamb ticks (perpendicular to wall at each jamb, 4px into room)
    const tickLen = 4
    ctx.beginPath()
    ctx.moveTo(J1.x, J1.y)
    ctx.lineTo(J1.x + nx * tickLen, J1.y + ny * tickLen)
    ctx.moveTo(J2.x, J2.y)
    ctx.lineTo(J2.x + nx * tickLen, J2.y + ny * tickLen)
    ctx.strokeStyle = '#1d4ed8'
    ctx.lineWidth = 2
    ctx.stroke()

    // 3. Door panel: from hinge outward in the inward normal direction
    const panelEnd = { x: hinge.x + nx * wPx, y: hinge.y + ny * wPx }
    ctx.beginPath()
    ctx.moveTo(hinge.x, hinge.y)
    ctx.lineTo(panelEnd.x, panelEnd.y)
    ctx.strokeStyle = '#1d4ed8'
    ctx.lineWidth = 2
    ctx.stroke()

    // 4. Swing arc: center=hinge, radius=wPx, sweeps 90° to latchAngle
    // cross < 0 → CCW in canvas (correct 90° arc); cross > 0 → CW (would draw 270°).
    const startAngle = Math.atan2(ny, nx)
    const endAngle   = latchAngle
    const cross = nx * uy - ny * ux
    const anticlockwise = cross < 0

    ctx.beginPath()
    ctx.arc(hinge.x, hinge.y, wPx, startAngle, endAngle, anticlockwise)
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = '#1d4ed8'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.setLineDash([])

    // 5. Label "P{n}" at the door center, offset slightly inward
    const doorNum = doorNumberFn(door)
    const centerPx = { x: (J1.x + J2.x) / 2 + nx * 12, y: (J1.y + J2.y) / 2 + ny * 12 }
    const label = `P${doorNum}`
    ctx.font = 'bold 11px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(centerPx.x - tw / 2 - 3, centerPx.y - 8, tw + 6, 16)
    ctx.fillStyle = '#1d4ed8'
    ctx.fillText(label, centerPx.x, centerPx.y)

    ctx.restore()
  }

  ctx.restore()
}

/**
 * Finds the wall that is closest to a canvas-pixel point (click target).
 * Returns the wall and segment index, or null.
 */
function findNearestWall(
  px: Point,
  walls: Wall[],
  vp: Viewport
): { wall: Wall; segIdx: number } | null {
  let best: { wall: Wall; segIdx: number; d: number } | null = null

  for (const wall of walls) {
    const pxPoints = wall.points.map((p) => metersToPixels(p, vp))
    const segments = pxPoints.length > 2
      ? [...Array(pxPoints.length).keys()].map((i) => [pxPoints[i], pxPoints[(i + 1) % pxPoints.length]])
      : pxPoints.slice(0, -1).map((_, i) => [pxPoints[i], pxPoints[i + 1]])

    for (let i = 0; i < segments.length; i++) {
      const [a, b] = segments[i]
      const d = pointToSegmentDistance(px, a, b)
      if (d < 20 && (!best || d < best.d)) {
        best = { wall, segIdx: i, d }
      }
    }
  }

  return best ? { wall: best.wall, segIdx: best.segIdx } : null
}

export interface PendingSegmentEdit {
  wallId: string
  segIdx: number
  currentLength: number
  label: string
  wall: Wall
}

export interface PendingDoorEdit {
  door: Door
  wall: Wall
}

export interface UsePlanCanvasReturn {
  mode: Mode
  setMode: (m: Mode) => void
  walls: Wall[]
  setWalls: (w: Wall[]) => void
  selectedWall: Wall | null
  selectWall: (w: Wall | null) => void
  pendingDoorWall: Wall | null
  pendingDoorPosition: number
  setPendingDoorWall: (w: Wall | null) => void
  pendingSegmentEdit: PendingSegmentEdit | null
  clearSegmentEdit: () => void
  applySegmentLength: (wallId: string, segIdx: number, newLength: number) => void
  pendingDoorEdit: PendingDoorEdit | null
  setPendingDoorEdit: (edit: PendingDoorEdit | null) => void
  applyDoorPosition: (doorId: string, wallId: string, newPosition: number) => void
  viewport: Viewport
  resetViewport: () => void
  undo: () => void
  redraw: () => void
  handleCanvasPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void
  handleCanvasPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void
  handleCanvasPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void
  handleCanvasPointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => void
}

const DEFAULT_VIEWPORT: Viewport = { x: 40, y: 40, scale: 1 }

export function usePlanCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  walls: Wall[],
  setWalls: (w: Wall[]) => void
): UsePlanCanvasReturn {
  const [mode, setMode] = useState<Mode>('wall')
  const [selectedWall, setSelectedWall] = useState<Wall | null>(null)
  const [pendingDoorWall, setPendingDoorWall] = useState<Wall | null>(null)
  const [pendingDoorPosition, setPendingDoorPosition] = useState(0)
  const [pendingSegmentEdit, setPendingSegmentEdit] = useState<PendingSegmentEdit | null>(null)
  const [pendingDoorEdit, setPendingDoorEdit] = useState<PendingDoorEdit | null>(null)
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const { settings } = useSettings()

  // In-progress draw: list of vertices not yet forming a wall
  const draftPoints = useRef<Point[]>([])
  // Mouse position for live preview
  const mousePos = useRef<Point | null>(null)

  // Multi-touch pointer tracking for pan/zoom
  const activePointers = useRef<Map<number, Point>>(new Map())
  // Previous pointer positions for delta computation
  const prevPointers = useRef<Map<number, Point>>(new Map())

  // Use a ref for viewport so that redraw always reads the current value
  const viewportRef = useRef<Viewport>(DEFAULT_VIEWPORT)
  const updateViewport = useCallback((updater: (v: Viewport) => Viewport) => {
    const next = updater(viewportRef.current)
    viewportRef.current = next
    setViewport(next)
  }, [])

  // Returns the full outer opening width (m) for a door, using current settings
  const doorOuterWidthM = useCallback(
    (door: Door) => getDoorOuterDims(door.width, settings.fitTolerance).width,
    [settings.fitTolerance]
  )

  // Stable global index "P1", "P2" etc across all walls
  const doorNumberMap = useMemo(() => {
    const map = new Map<string, number>()
    let n = 0
    for (const wall of walls) {
      for (const door of wall.doors) {
        map.set(door.id, ++n)
      }
    }
    return map
  }, [walls])

  const doorNumberFn = useCallback(
    (door: Door) => doorNumberMap.get(door.id) ?? 0,
    [doorNumberMap]
  )

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    const vp = viewportRef.current

    ctx.clearRect(0, 0, width, height)
    drawGrid(ctx, width, height, vp)

    // Draw completed walls — read mode from ref to avoid stale closure
    for (const wall of walls) {
      drawWall(ctx, wall, selectedWall?.id === wall.id, vp, mode, doorOuterWidthM, doorNumberFn, wall.lockedSegments ?? [])
    }

    // Draw in-progress draft
    const draft = draftPoints.current
    if (draft.length > 0 && mode === 'wall') {
      const draftPx = draft.map((p) => metersToPixels(p, vp))
      ctx.save()
      ctx.strokeStyle = '#1d4ed8'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(draftPx[0].x, draftPx[0].y)
      for (let i = 1; i < draftPx.length; i++) {
        ctx.lineTo(draftPx[i].x, draftPx[i].y)
      }
      // Live preview to mouse
      if (mousePos.current) {
        ctx.lineTo(mousePos.current.x, mousePos.current.y)
      }
      ctx.stroke()
      ctx.setLineDash([])

      // First vertex highlight (snap target)
      ctx.beginPath()
      ctx.arc(draftPx[0].x, draftPx[0].y, CLOSE_THRESHOLD_PX, 0, Math.PI * 2)
      ctx.strokeStyle = '#1d4ed8'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])

      // Vertex dots
      for (const pt of draftPx) {
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#1d4ed8'
        ctx.fill()
      }
      ctx.restore()
    }
  }, [canvasRef, walls, selectedWall, mode, doorOuterWidthM, doorNumberFn])

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const current: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top }

      // Update pointer tracking
      prevPointers.current.set(e.pointerId, activePointers.current.get(e.pointerId) ?? current)
      activePointers.current.set(e.pointerId, current)

      if (activePointers.current.size >= 2) {
        // Pan + zoom from two-finger gesture
        const pointerIds = [...activePointers.current.keys()]
        const id0 = pointerIds[0]
        const id1 = pointerIds[1]
        const cur0 = activePointers.current.get(id0)!
        const cur1 = activePointers.current.get(id1)!
        const prev0 = prevPointers.current.get(id0)!
        const prev1 = prevPointers.current.get(id1)!

        const prevMid: Point = { x: (prev0.x + prev1.x) / 2, y: (prev0.y + prev1.y) / 2 }
        const curMid: Point = { x: (cur0.x + cur1.x) / 2, y: (cur0.y + cur1.y) / 2 }
        const prevD = dist(prev0, prev1)
        const curD = dist(cur0, cur1)

        const panDx = curMid.x - prevMid.x
        const panDy = curMid.y - prevMid.y
        const zoomFactor = prevD === 0 ? 1 : curD / prevD

        updateViewport((v) => ({
          x: v.x + panDx,
          y: v.y + panDy,
          scale: Math.min(4, Math.max(0.25, v.scale * zoomFactor)),
        }))
        redraw()
        return
      }

      // Single pointer — existing move logic (draft preview)
      mousePos.current = current
      if (mode === 'wall' && draftPoints.current.length > 0) {
        redraw()
      }
    },
    [canvasRef, mode, redraw, updateViewport]
  )

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Capture pointer so events keep firing if finger drifts off element
      canvas.setPointerCapture(e.pointerId)

      const rect = canvas.getBoundingClientRect()
      const px: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top }

      // Track this pointer
      activePointers.current.set(e.pointerId, px)
      prevPointers.current.set(e.pointerId, px)

      // If 2+ pointers now active, enter pan/zoom mode — don't process as draw/select
      if (activePointers.current.size >= 2) return

      const vp = viewportRef.current
      const mPoint = pixelsToMeters(px, vp)

      if (mode === 'wall') {
        // Block drawing once the polygon is already closed
        if (isPolygonClosed(walls[0]?.points ?? [])) return

        const draft = draftPoints.current

        if (draft.length >= 2) {
          const firstPx = metersToPixels(draft[0], vp)
          if (dist(px, firstPx) <= CLOSE_THRESHOLD_PX) {
            const newWall: Wall = {
              kind: 'wall',
              id: generateId(),
              points: [...draft, { ...draft[0] }],
              height: 2.5,
              studWidth: 48,
              cladding: 'double',
              hasInsulation: true,
              hasCeiling: true,
              doors: [],
              lockedSegments: [],
            }
            setWalls([...walls, newWall])
            draftPoints.current = []
            mousePos.current = null
            redraw()
            return
          }
        }

        draftPoints.current = [...draft, mPoint]
        redraw()
      } else if (mode === 'door') {
        const hit = findNearestWall(px, walls, vp)
        if (hit) {
          const pxPoints = hit.wall.points.map((p) => metersToPixels(p, vp))
          let accumulated = 0
          for (let i = 0; i < hit.wall.points.length - 1; i++) {
            if (i === hit.segIdx) {
              const a = pxPoints[i]
              const b = pxPoints[i + 1]
              const dx = b.x - a.x
              const dy = b.y - a.y
              const lenSq = dx * dx + dy * dy
              const t = Math.max(0, Math.min(1, ((px.x - a.x) * dx + (px.y - a.y) * dy) / lenSq))
              const segLenM = segmentLengthPx(hit.wall.points[i], hit.wall.points[i + 1])
              // positionOnWall = left jamb / hinge edge — store tap position directly
              const pos = accumulated + t * segLenM
              setPendingDoorPosition(pos)
              setPendingDoorWall(hit.wall)
              return
            }
            accumulated += segmentLengthPx(hit.wall.points[i], hit.wall.points[i + 1])
          }
          // Handle the closing segment of a polygon
          if (hit.segIdx === hit.wall.points.length - 1 && hit.wall.points.length > 2) {
            const i = hit.wall.points.length - 1
            const a = pxPoints[i]
            const b = pxPoints[0]
            const dx = b.x - a.x
            const dy = b.y - a.y
            const lenSq = dx * dx + dy * dy
            const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px.x - a.x) * dx + (px.y - a.y) * dy) / lenSq))
            const segLenM = segmentLengthPx(hit.wall.points[i], hit.wall.points[0])
            const pos = accumulated + t * segLenM
            setPendingDoorPosition(pos)
            setPendingDoorWall(hit.wall)
          }
        }
      } else if (mode === 'select') {
        // Check if tap is on a door — hit area: anywhere near the door opening center
        for (const wall of walls) {
          const ppm = PIXELS_PER_METER * vp.scale
          for (const door of wall.doors) {
            const wM = doorOuterWidthM(door)
            const loc = locateOnWall(wall.points, door.positionOnWall)
            if (!loc) continue

            const seg = loc.segment
            const segLenPx = seg.length * ppm

            const pxA = metersToPixels(seg.a, vp)
            const pxB = metersToPixels(seg.b, vp)

            const ux = segLenPx > 0 ? (pxB.x - pxA.x) / segLenPx : 1
            const uy = segLenPx > 0 ? (pxB.y - pxA.y) / segLenPx : 0

            const wPx = wM * ppm

            // Pixel position of the left jamb (hinge side)
            const hingeOffsetPx = (door.positionOnWall - seg.startOffset) * ppm
            const j1Px = {
              x: pxA.x + hingeOffsetPx * ux,
              y: pxA.y + hingeOffsetPx * uy,
            }

            // Center of door opening in pixels (midpoint along wall direction)
            const centerPx = {
              x: j1Px.x + ux * wPx / 2,
              y: j1Px.y + uy * wPx / 2,
            }

            if (dist(px, centerPx) < Math.max(24, wPx / 2)) {
              setPendingDoorEdit({ door, wall })
              return
            }
          }
        }

        // Check if tap is on a segment length label
        for (const wall of walls) {
          const pxPoints = wall.points.map((p) => metersToPixels(p, vp))
          const n = pxPoints.length

          // Check each segment midpoint
          const checkMid = (a: Point, b: Point, segIdx: number, isClosing: boolean) => {
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2
            if (dist(px, { x: mx, y: my }) < 24) {
              const currentLength = segmentLengthPx(
                wall.points[segIdx],
                isClosing ? wall.points[0] : wall.points[segIdx + 1]
              )
              const label = isClosing
                ? 'Mur · mur de fermeture'
                : `Mur · segment ${segIdx + 1}`
              setPendingSegmentEdit({ wallId: wall.id, segIdx, currentLength, label, wall })
              return true
            }
            return false
          }

          let hit = false
          for (let i = 0; i < n - 1; i++) {
            if (checkMid(pxPoints[i], pxPoints[i + 1], i, false)) {
              hit = true
              break
            }
          }
          if (!hit && n > 2) {
            if (checkMid(pxPoints[n - 1], pxPoints[0], n - 1, true)) {
              hit = true
            }
          }
          if (hit) return
        }

        // Fall through to wall select
        const hit = findNearestWall(px, walls, vp)
        setSelectedWall(hit ? hit.wall : null)
        redraw()
      }
    },
    [canvasRef, mode, walls, setWalls, redraw, doorOuterWidthM]
  )

  const handleCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      activePointers.current.delete(e.pointerId)
      prevPointers.current.delete(e.pointerId)
    },
    []
  )

  const handleCanvasPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      activePointers.current.delete(e.pointerId)
      prevPointers.current.delete(e.pointerId)
    },
    []
  )

  const clearSegmentEdit = useCallback(() => {
    setPendingSegmentEdit(null)
  }, [])

  const applySegmentLength = useCallback(
    (
      wallId: string,
      segIdx: number,
      newLength: number,
      wallProps?: { cladding: 'double' | 'single'; hasInsulation: boolean }
    ) => {
      const wall = walls.find((w) => w.id === wallId)
      if (!wall) return
      const locked = wall.lockedSegments ?? []
      const newPoints = setSegmentLength(wall.points, segIdx, newLength, locked)
      const newLocked = locked.includes(segIdx) ? locked : [...locked, segIdx]
      const newWalls = walls.map((w) =>
        w.id === wallId
          ? { ...w, points: newPoints, lockedSegments: newLocked, ...(wallProps ?? {}) }
          : w
      )
      setWalls(newWalls)
      setPendingSegmentEdit(null)
      redraw()
    },
    [walls, setWalls, redraw]
  )

  const applyDoorPosition = useCallback(
    (doorId: string, wallId: string, newPosition: number) => {
      const newWalls = walls.map((w) => {
        if (w.id !== wallId) return w
        return {
          ...w,
          doors: w.doors.map((d) =>
            d.id === doorId ? { ...d, positionOnWall: newPosition } : d
          ),
        }
      })
      setWalls(newWalls)
      setPendingDoorEdit(null)
      redraw()
    },
    [walls, setWalls, redraw]
  )

  const resetViewport = useCallback(() => {
    viewportRef.current = DEFAULT_VIEWPORT
    setViewport(DEFAULT_VIEWPORT)
  }, [])

  const undo = useCallback(() => {
    if (mode === 'wall' && draftPoints.current.length > 0) {
      draftPoints.current = draftPoints.current.slice(0, -1)
      redraw()
    } else if (mode === 'select') {
      setSelectedWall(null)
      redraw()
    }
  }, [mode, redraw])

  const selectWall = useCallback(
    (wall: Wall | null) => {
      setSelectedWall(wall)
      redraw()
    },
    [redraw]
  )

  // Keep perimeterLength available for callers that import it via this hook
  void perimeterLength
  // Keep segmentsOf available
  void segmentsOf

  return {
    mode,
    setMode,
    walls,
    setWalls,
    selectedWall,
    selectWall,
    pendingDoorWall,
    pendingDoorPosition,
    setPendingDoorWall,
    pendingSegmentEdit,
    clearSegmentEdit,
    applySegmentLength,
    pendingDoorEdit,
    setPendingDoorEdit,
    applyDoorPosition,
    viewport,
    resetViewport,
    undo,
    redraw,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleCanvasPointerCancel,
  }
}
