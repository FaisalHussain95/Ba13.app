'use client'

import React, { use, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useProject } from '@/hooks/useProjects'
import { saveProject, deleteProject } from '@/lib/db'
import type { Wall, Door } from '@/types'
import PlanCanvas from '@/components/PlanCanvas'
import WallConfigSheet from '@/components/WallConfigSheet'
import DoorConfigSheet from '@/components/DoorConfigSheet'
import DoorEditSheet from '@/components/DoorEditSheet'
import SegmentLengthSheet from '@/components/SegmentLengthSheet'
import type { PendingSegmentEdit, PendingDoorEdit } from '@/hooks/usePlanCanvas'
import { useSettings } from '@/hooks/useSettings'
import Ba13Viewer from '@/components/visualiser/Ba13Viewer'
import PlafondConfigSheet from '@/components/PlafondConfigSheet'
import type { PlafondParams } from '@/types'
import { isPolygonClosed } from '@/lib/geometry'

type ToolMode = 'wall' | 'door' | 'select'

interface PlanEditorPageProps {
  params: Promise<{ id: string }>
}

export default function PlanEditorPage({ params }: PlanEditorPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { project, loading, error, save } = useProject(id)
  const { settings } = useSettings()

  const [walls, setWallsLocal] = useState<Wall[]>([])
  const [mode, setMode] = useState<ToolMode>('wall')
  const [selectedWall, setSelectedWall] = useState<Wall | null>(null)
  const [showWallSheet, setShowWallSheet] = useState(false)
  const [doorWallId, setDoorWallId] = useState<string | null>(null)
  const [doorPosition, setDoorPosition] = useState(0)
  const [doorCount, setDoorCount] = useState(0)
  const undoRef = useRef<(() => void) | null>(null)
  const [pendingSegEdit, setPendingSegEdit] = useState<PendingSegmentEdit | null>(null)
  const segEditRef = useRef<{
    apply: (wallId: string, segIdx: number, len: number, wallProps?: { cladding: 'double' | 'single'; hasInsulation: boolean }) => void
    clear: () => void
  } | null>(null)
  const [pendingDoorEditState, setPendingDoorEditState] = useState<PendingDoorEdit | null>(null)
  const doorEditRef = useRef<{
    apply: (doorId: string, wallId: string, pos: number) => void
    clear: () => void
  } | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showPlafondSheet, setShowPlafondSheet] = useState(false)

  // Debounce auto-save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to latest walls so the unmount flush can read the current value without stale closure
  const wallsRef = useRef<Wall[]>([])

  useEffect(() => {
    if (project) {
      setWallsLocal(project.walls)
      wallsRef.current = project.walls
      setNameValue(project.name)
      // Count all doors across all walls
      setDoorCount(project.walls.reduce((s, w) => s + w.doors.length, 0))
    }
  }, [project])

  // Flush any pending debounced save when the component unmounts
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        // project stabilises after initial load; best-effort sync save on unmount
        if (project && wallsRef.current.length > 0) {
          saveProject({ ...project, walls: wallsRef.current, updatedAt: Date.now() }).catch(() => {
            // best-effort — nothing to surface here
          })
        }
      }
    }
  }, [project])

  const handleWallsChange = useCallback(
    (newWalls: Wall[]) => {
      setWallsLocal(newWalls)
      wallsRef.current = newWalls
      setDoorCount(newWalls.reduce((s, w) => s + w.doors.length, 0))
      if (!project) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        save({ ...project, walls: newWalls })
      }, 300)
    },
    [project, save]
  )

  const handleWallSelect = useCallback(
    (wall: Wall | null) => {
      setSelectedWall(wall)
      if (wall) setShowWallSheet(true)
    },
    []
  )

  const handleWallSave = useCallback(
    (updated: Wall) => {
      const newWalls = walls.map((w) => (w.id === updated.id ? updated : w))
      handleWallsChange(newWalls)
      setSelectedWall(null)
      setShowWallSheet(false)
    },
    [walls, handleWallsChange]
  )

  const handleDoorTarget = useCallback((wall: Wall | null, position: number) => {
    if (wall) {
      setDoorWallId(wall.id)
      setDoorPosition(position)
    }
  }, [])

  const handleDoorSave = useCallback(
    (door: Door) => {
      const newWalls = walls.map((w) => {
        if (w.id === door.wallId) {
          return { ...w, doors: [...w.doors, door] }
        }
        return w
      })
      handleWallsChange(newWalls)
      setDoorWallId(null)
    },
    [walls, handleWallsChange]
  )

  const handleNameSave = useCallback(() => {
    if (!project || !nameValue.trim()) return
    save({ ...project, name: nameValue.trim(), walls })
    setEditingName(false)
  }, [project, nameValue, walls, save])

  const handlePlafondSave = useCallback(
    (newPlafond: PlafondParams) => {
      if (!project) return
      save({ ...project, plafond: newPlafond, updatedAt: Date.now() })
      setShowPlafondSheet(false)
    },
    [project, save]
  )

  const handlePlafondRemove = useCallback(() => {
    if (!project) return
    // No confirmation: removal is recoverable by reconfiguring the ceiling.
    save({ ...project, plafond: undefined, updatedAt: Date.now() })
  }, [project, save])

  const handleDelete = useCallback(async () => {
    if (!project) return
    const confirmed = window.confirm(`Supprimer le chantier "${project.name}" ?`)
    if (!confirmed) return
    await deleteProject(project.id)
    router.push('/')
  }, [project, router])

  // Compute global door number for the door being edited
  const pendingDoorNumber = (() => {
    if (!pendingDoorEditState) return 1
    let n = 0
    for (const w of walls) {
      for (const d of w.doors) {
        n++
        if (d.id === pendingDoorEditState.door.id) return n
      }
    }
    return n
  })()

  const shapeClosed = isPolygonClosed(walls[0]?.points ?? [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d4ed8] border-t-transparent" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-[#991b1b]">Chantier introuvable.</p>
        <button onClick={() => router.push('/')} className="text-sm text-[#1d4ed8] underline">
          Retour
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: '#f7f7f5' }}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#cfcfca] bg-white px-4 pb-3 pt-10">
        <button
          onClick={() => router.push('/')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#cfcfca]"
          aria-label="Retour"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {editingName ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
            className="flex-1 rounded-lg border border-[#1d4ed8] bg-white px-2 py-1 text-base font-semibold text-[#1f2937] focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex-1 truncate text-left text-base font-semibold text-[#1f2937]"
          >
            {project.name}
          </button>
        )}

        {/* Menu button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cfcfca] text-[#1f2937]"
            aria-label="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="5" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="19" r="1" fill="currentColor" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-10 z-50 min-w-[160px] rounded-xl border border-[#cfcfca] bg-white shadow-lg">
              <button
                onClick={() => { setEditingName(true); setShowMenu(false) }}
                className="block w-full px-4 py-3 text-left text-sm text-[#1f2937] hover:bg-[#f7f7f5]"
              >
                Renommer
              </button>
              <button
                onClick={() => { router.push('/settings'); setShowMenu(false) }}
                className="block w-full px-4 py-3 text-left text-sm text-[#1f2937] hover:bg-[#f7f7f5]"
              >
                Réglages
              </button>
              {shapeClosed && (
                <button
                  onClick={() => { setShowPlafondSheet(true); setShowMenu(false) }}
                  className="block w-full px-4 py-3 text-left text-sm text-[#1f2937] hover:bg-[#f7f7f5]"
                >
                  {project.plafond ? 'Modifier le plafond' : 'Configurer le plafond'}
                </button>
              )}
              {project.plafond && (
                <button
                  onClick={() => { handlePlafondRemove(); setShowMenu(false) }}
                  className="block w-full px-4 py-3 text-left text-sm text-[#991b1b] hover:bg-[#fef2f2]"
                >
                  Supprimer le plafond
                </button>
              )}
              <button
                onClick={() => { handleDelete(); setShowMenu(false) }}
                className="block w-full px-4 py-3 text-left text-sm text-[#991b1b] hover:bg-[#fef2f2]"
              >
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Canvas + 3D viewer */}
      <div className="flex flex-1 overflow-hidden">
        {/* Plan canvas — always full-width on mobile, flex-1 on desktop */}
        <div className="flex-1 overflow-hidden">
          <PlanCanvas
            walls={walls}
            onWallsChange={handleWallsChange}
            onWallSelect={handleWallSelect}
            onDoorTarget={handleDoorTarget}
            externalMode={mode}
            onModeChange={setMode}
            onUndoReady={(fn) => { undoRef.current = fn }}
            onSegmentEditReady={(h) => { segEditRef.current = h }}
            onPendingSegmentEdit={setPendingSegEdit}
            onDoorEditReady={(h) => { doorEditRef.current = h }}
            onPendingDoorEdit={setPendingDoorEditState}
          />
        </div>

        {/* Desktop 3D viewer side panel (hidden on mobile) */}
        <div className="hidden md:block md:w-80 border-l border-[#cfcfca] bg-white">
          <Ba13Viewer wall={walls[0] ?? null} plafond={project.plafond ?? null} variant="desktop" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-t border-[#cfcfca] bg-white">
        <div className="grid grid-cols-3 divide-x divide-[#cfcfca]">
          {(
            [
              { key: 'wall', label: 'Mur' },
              { key: 'door', label: 'Porte' },
              { key: 'select', label: 'Sélect.' },
            ] as const
          ).map(({ key, label }) => {
            const isDisabled = key === 'wall' && shapeClosed
            return (
              <button
                key={key}
                onClick={() => !isDisabled && setMode(key)}
                disabled={isDisabled}
                className={`py-3 text-sm font-medium transition-colors ${
                  isDisabled
                    ? 'bg-white text-[#d1d5db]'
                    : mode === key
                      ? 'bg-[#1d4ed8] text-white'
                      : 'bg-white text-[#6b7280]'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Mobile 3D viewer toggle (hidden on desktop where the side panel is shown) */}
        <div className="md:hidden px-4 pt-2">
          <Ba13Viewer wall={walls[0] ?? null} plafond={project.plafond ?? null} variant="mobile" />
        </div>

        {/* CTA */}
        <div className="px-4 pb-6 pt-3">
          {walls.length === 0 ? (
            <button
              disabled
              className="w-full rounded-xl py-3.5 text-sm font-semibold text-[#6b7280]"
              style={{ backgroundColor: '#e5e7eb' }}
            >
              Calculer le matériel →
            </button>
          ) : (
            <button
              onClick={() => router.push(`/project/${id}/results`)}
              className="w-full rounded-xl py-3.5 text-sm font-semibold text-white"
              style={{ backgroundColor: '#1d4ed8' }}
            >
              Calculer le matériel →
            </button>
          )}
        </div>
      </div>

      {/* Wall config sheet */}
      <WallConfigSheet
        wall={showWallSheet ? selectedWall : null}
        onSave={handleWallSave}
        onClose={() => { setShowWallSheet(false); setSelectedWall(null) }}
      />

      {/* Door config sheet (initial placement) */}
      <DoorConfigSheet
        wallId={doorWallId}
        doorIndex={doorCount + 1}
        positionOnWall={doorPosition}
        onSave={handleDoorSave}
        onClose={() => setDoorWallId(null)}
      />

      {/* Door edit sheet (tap existing door in select mode) */}
      <DoorEditSheet
        isOpen={pendingDoorEditState !== null}
        door={pendingDoorEditState?.door ?? null}
        wall={pendingDoorEditState?.wall ?? null}
        doorNumber={pendingDoorNumber}
        settings={settings}
        onSave={(updates) => {
          if (!pendingDoorEditState) return
          const { door, wall } = pendingDoorEditState

          // Merge ALL updates (meta + position) in one shot to avoid stale-closure races.
          // applyDoorPosition reads a closed-over walls value and would overwrite meta changes.
          const newWalls = walls.map((w) =>
            w.id === wall.id
              ? { ...w, doors: w.doors.map((d) => d.id === door.id ? { ...d, ...updates } : d) }
              : w
          )
          handleWallsChange(newWalls)
          doorEditRef.current?.clear()
          setPendingDoorEditState(null)
        }}
        onClose={() => {
          doorEditRef.current?.clear()
          setPendingDoorEditState(null)
        }}
      />

      {/* Segment length edit sheet */}
      <SegmentLengthSheet
        isOpen={pendingSegEdit !== null}
        wallLabel={pendingSegEdit?.label ?? ''}
        currentLength={pendingSegEdit?.currentLength ?? 0}
        wall={pendingSegEdit?.wall ?? null}
        onSave={(len, wallProps) => {
          if (pendingSegEdit) {
            segEditRef.current?.apply(pendingSegEdit.wallId, pendingSegEdit.segIdx, len, wallProps)
          }
        }}
        onClose={() => {
          segEditRef.current?.clear()
          setPendingSegEdit(null)
        }}
      />

      {/* Plafond config sheet */}
      <PlafondConfigSheet
        isOpen={showPlafondSheet}
        plafond={project.plafond ?? null}
        maxSpanMm={settings.maxSpanCeilingMm}
        wallPoints={walls[0]?.points ?? []}
        onSave={handlePlafondSave}
        onClose={() => setShowPlafondSheet(false)}
      />

      {/* Close menu on outside click */}
      {showMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMenu(false)}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
