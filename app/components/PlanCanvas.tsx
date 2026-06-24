'use client'

import { useRef, useEffect } from 'react'
import type { Wall, Door } from '@/types'
import { usePlanCanvas } from '@/hooks/usePlanCanvas'
import type { PendingSegmentEdit, PendingDoorEdit, PendingAngleEdit } from '@/hooks/usePlanCanvas'

interface SegmentEditHandler {
  apply: (wallId: string, segIdx: number, len: number, wallProps?: { cladding: 'double' | 'single'; hasInsulation: boolean }) => void
  clear: () => void
}

interface DoorEditHandler {
  apply: (doorId: string, wallId: string, pos: number) => void
  clear: () => void
}

interface AngleEditHandler {
  apply: (wallId: string, pointIdx: number, angleDeg: number) => void
  clear: () => void
}

interface PlanCanvasProps {
  walls: Wall[]
  onWallsChange: (walls: Wall[]) => void
  onWallSelect: (wall: Wall | null) => void
  onDoorTarget: (wall: Wall | null, position: number) => void
  externalMode?: 'wall' | 'door' | 'select'
  onModeChange?: (mode: 'wall' | 'door' | 'select') => void
  onUndoReady?: (undoFn: () => void) => void
  onSegmentEditReady?: (handler: SegmentEditHandler) => void
  onPendingSegmentEdit?: (edit: PendingSegmentEdit | null) => void
  onDoorEditReady?: (handler: DoorEditHandler) => void
  onPendingDoorEdit?: (edit: PendingDoorEdit | null) => void
  onAngleEditReady?: (handler: AngleEditHandler) => void
  onPendingAngleEdit?: (edit: PendingAngleEdit | null) => void
}

export default function PlanCanvas({
  walls,
  onWallsChange,
  onWallSelect,
  onDoorTarget,
  externalMode,
  onModeChange,
  onUndoReady,
  onSegmentEditReady,
  onPendingSegmentEdit,
  onDoorEditReady,
  onPendingDoorEdit,
  onAngleEditReady,
  onPendingAngleEdit,
}: PlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    mode,
    setMode,
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
    undo,
    redraw,
    pendingAngleEdit,
    clearAngleEdit,
    applyAngle,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleCanvasPointerCancel,
  } = usePlanCanvas(canvasRef, walls, onWallsChange)

  // Expose undo to parent on mount
  useEffect(() => {
    onUndoReady?.(undo)
  }, [undo, onUndoReady])

  // Expose segment edit handler to parent
  useEffect(() => {
    onSegmentEditReady?.({ apply: applySegmentLength, clear: clearSegmentEdit })
  }, [applySegmentLength, clearSegmentEdit, onSegmentEditReady])

  // Propagate pending segment edit changes upward
  useEffect(() => {
    onPendingSegmentEdit?.(pendingSegmentEdit)
  }, [pendingSegmentEdit, onPendingSegmentEdit])

  // Expose door edit handler to parent
  useEffect(() => {
    onDoorEditReady?.({
      apply: applyDoorPosition,
      clear: () => setPendingDoorEdit(null),
    })
  }, [applyDoorPosition, setPendingDoorEdit, onDoorEditReady])

  // Propagate pending door edit changes upward
  useEffect(() => {
    onPendingDoorEdit?.(pendingDoorEdit)
  }, [pendingDoorEdit, onPendingDoorEdit])

  // Expose angle edit handler to parent
  useEffect(() => {
    onAngleEditReady?.({ apply: applyAngle, clear: clearAngleEdit })
  }, [applyAngle, clearAngleEdit, onAngleEditReady])

  // Propagate pending angle edit changes upward
  useEffect(() => {
    onPendingAngleEdit?.(pendingAngleEdit)
  }, [pendingAngleEdit, onPendingAngleEdit])

  // Sync external mode into hook
  useEffect(() => {
    if (externalMode && externalMode !== mode) {
      setMode(externalMode)
      if (onModeChange) onModeChange(externalMode)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMode])

  // Propagate mode changes upward
  const handleSetMode = (m: 'wall' | 'door' | 'select') => {
    setMode(m)
    if (onModeChange) onModeChange(m)
  }

  // Propagate wall selection upward
  const handleWallSelect = (wall: typeof walls[number] | null) => {
    selectWall(wall)
    onWallSelect(wall)
  }

  // When a door target is found, propagate up and clear it
  useEffect(() => {
    if (pendingDoorWall) {
      onDoorTarget(pendingDoorWall, pendingDoorPosition)
      setPendingDoorWall(null)
    }
  }, [pendingDoorWall, pendingDoorPosition, onDoorTarget, setPendingDoorWall])

  // Resize canvas to container
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      redraw()
    })
    observer.observe(container)
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight
    redraw()
    return () => observer.disconnect()
  }, [redraw])

  // Redraw when walls change
  useEffect(() => {
    redraw()
  }, [walls, redraw])

  // Prevent default touch scroll on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    canvas.addEventListener('touchmove', prevent, { passive: false })
    return () => canvas.removeEventListener('touchmove', prevent)
  }, [])

  void handleSetMode
  void handleWallSelect

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerCancel}
        className="touch-none"
        style={{ display: 'block', cursor: mode === 'wall' ? 'crosshair' : mode === 'select' ? 'pointer' : 'default' }}
      />
    </div>
  )
}

// Re-export types used by consumers
export type { Door }
