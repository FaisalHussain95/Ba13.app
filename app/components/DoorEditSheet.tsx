'use client'

import { useState, useEffect, useRef } from 'react'
import type { Door, DoorWidth, Wall, Settings } from '@/types'
import BottomSheet from './BottomSheet'
import NumericKeypad from './NumericKeypad'
import { getDoorOuterDims } from '@/lib/calculation'
import { segmentsOf, locateOnWall } from '@/lib/geometry'

const DOOR_WIDTHS: DoorWidth[] = [73, 83]

interface DoorEditSheetProps {
  isOpen: boolean
  door: Door | null
  wall: Wall | null
  doorNumber: number
  settings: Settings
  onSave: (updates: {
    width?: DoorWidth
    openingDirection?: 'right' | 'left'
    openingSide?: 'front' | 'back'
    positionOnWall?: number
  }) => void
  onClose: () => void
}

export default function DoorEditSheet({
  isOpen,
  door,
  wall,
  doorNumber,
  settings,
  onSave,
  onClose,
}: DoorEditSheetProps) {
  const [width, setWidth] = useState<DoorWidth>(83)
  const [direction, setDirection] = useState<'right' | 'left'>('right')
  const [openingSide, setOpeningSide] = useState<'front' | 'back'>('front')
  const [reference, setReference] = useState<'left' | 'right'>('left')
  const [offsetInput, setOffsetInput] = useState('')
  // The currently computed positionOnWall based on the keypad input
  const [computedPosition, setComputedPosition] = useState(0)
  const [segmentTooShort, setSegmentTooShort] = useState(false)
  const prevOpenRef = useRef(false)

  // When the sheet opens (or door changes), initialise all fields
  useEffect(() => {
    if (isOpen && !prevOpenRef.current && door && wall) {
      setWidth(door.width)
      setDirection(door.openingDirection)
      setOpeningSide(door.openingSide ?? 'front')

      const segs = segmentsOf(wall.points)
      const loc = locateOnWall(wall.points, door.positionOnWall)
      if (!loc || segs.length === 0) {
        setOffsetInput('0.00')
        setComputedPosition(door.positionOnWall)
        setReference('left')
        setSegmentTooShort(false)
        prevOpenRef.current = isOpen
        return
      }

      const seg = loc.segment
      const doorOuterW = getDoorOuterDims(door.width, settings.fitTolerance).width
      const cornerStart = seg.startOffset
      const cornerEnd = seg.startOffset + seg.length

      const offsetFromLeft = door.positionOnWall - cornerStart
      const offsetFromRight = cornerEnd - (door.positionOnWall + doorOuterW)

      // Choose the corner that is closer
      const chosenRef = offsetFromLeft <= offsetFromRight ? 'left' : 'right'
      const chosenOffset = chosenRef === 'left' ? offsetFromLeft : offsetFromRight

      setReference(chosenRef)
      setOffsetInput(Math.max(0, chosenOffset).toFixed(2))
      setComputedPosition(door.positionOnWall)
      setSegmentTooShort(seg.length < doorOuterW)
    }
    prevOpenRef.current = isOpen
  }, [isOpen, door, wall, settings.fitTolerance])

  // Recompute positionOnWall whenever the offset input or reference changes
  useEffect(() => {
    if (!door || !wall) return
    const loc = locateOnWall(wall.points, door.positionOnWall)
    if (!loc) return

    const seg = loc.segment
    const doorOuterW = getDoorOuterDims(width, settings.fitTolerance).width
    const cornerStart = seg.startOffset
    const cornerEnd = seg.startOffset + seg.length

    setSegmentTooShort(seg.length < doorOuterW)

    const typedOffset = parseFloat(offsetInput)
    if (isNaN(typedOffset)) return

    let newPos: number
    if (reference === 'left') {
      newPos = cornerStart + typedOffset
    } else {
      newPos = cornerEnd - doorOuterW - typedOffset
    }
    // Clamp to valid range
    newPos = Math.max(cornerStart, Math.min(cornerEnd - doorOuterW, newPos))
    setComputedPosition(newPos)
  }, [offsetInput, reference, width, door, wall, settings.fitTolerance])

  // When reference toggles, recalculate displayed offset from the current computedPosition
  function handleReferenceToggle(newRef: 'left' | 'right') {
    if (!door || !wall) return
    const loc = locateOnWall(wall.points, door.positionOnWall)
    if (!loc) {
      setReference(newRef)
      return
    }
    const seg = loc.segment
    const doorOuterW = getDoorOuterDims(width, settings.fitTolerance).width
    const cornerStart = seg.startOffset
    const cornerEnd = seg.startOffset + seg.length

    let newOffset: number
    if (newRef === 'left') {
      newOffset = computedPosition - cornerStart
    } else {
      newOffset = cornerEnd - (computedPosition + doorOuterW)
    }
    setReference(newRef)
    setOffsetInput(Math.max(0, newOffset).toFixed(2))
  }

  if (!door || !wall) return null

  const doorOuterW = getDoorOuterDims(width, settings.fitTolerance).width
  const loc = locateOnWall(wall.points, door.positionOnWall)
  const cornerStart = loc ? loc.segment.startOffset : 0
  const cornerEnd = loc ? loc.segment.startOffset + loc.segment.length : 0

  // Helper line offset display
  const displayOffset = parseFloat(offsetInput)
  const offsetLabel = isNaN(displayOffset) ? '—' : displayOffset.toFixed(2)

  function handleSave() {
    if (segmentTooShort) return
    onSave({
      width,
      openingDirection: direction,
      openingSide,
      positionOnWall: computedPosition,
    })
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <h2 className="text-base font-bold text-[#1f2937]">
        Porte P{doorNumber} · modifier
      </h2>

      {/* Section 1: Width and direction */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[#1f2937]">Largeur</p>
        <div className="flex gap-2">
          {DOOR_WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              className={`flex-1 rounded-full border py-2 text-sm font-medium transition-colors ${
                width === w
                  ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white'
                  : 'border-[#cfcfca] bg-white text-[#1f2937]'
              }`}
            >
              {w} cm
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[#1f2937]">Sens d&apos;ouverture</p>
        <div className="flex rounded-xl border border-[#cfcfca] bg-[#f7f7f5] p-1">
          <button
            onClick={() => setDirection('right')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              direction === 'right' ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
            }`}
          >
            Poussant droit
          </button>
          <button
            onClick={() => setDirection('left')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              direction === 'left' ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
            }`}
          >
            Poussant gauche
          </button>
        </div>
      </div>

      {/* Opening face */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[#1f2937]">Face d&apos;ouverture</p>
        <div className="flex rounded-xl border border-[#cfcfca] bg-[#f7f7f5] p-1">
          <button
            onClick={() => setOpeningSide('front')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              openingSide === 'front' ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
            }`}
          >
            Intérieur
          </button>
          <button
            onClick={() => setOpeningSide('back')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              openingSide === 'back' ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
            }`}
          >
            Extérieur
          </button>
        </div>
      </div>

      {/* Section 2: Position offset */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[#1f2937]">Position sur le segment</p>

        {/* Corner reference toggle */}
        <div className="mb-3 flex rounded-xl border border-[#cfcfca] bg-[#f7f7f5] p-1">
          <button
            onClick={() => handleReferenceToggle('left')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              reference === 'left' ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
            }`}
          >
            Depuis le coin gauche
          </button>
          <button
            onClick={() => handleReferenceToggle('right')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              reference === 'right' ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
            }`}
          >
            Depuis le coin droit
          </button>
        </div>

        {/* Numeric display */}
        <div className="mb-3 rounded-xl border border-[#cfcfca] bg-[#f7f7f5] px-4 py-3 text-right">
          <span className="text-3xl font-bold tracking-tight text-[#1f2937]">
            {offsetInput !== '' ? offsetInput + ' m' : '—'}
          </span>
        </div>

        {/* Helper line */}
        <p className="mb-3 text-xs text-[#6b7280]">
          Battant à{' '}
          <strong>{offsetLabel} m</strong>{' '}
          du coin {reference === 'left' ? 'gauche' : 'droit'}{' '}
          · segment [{cornerStart.toFixed(2)} – {cornerEnd.toFixed(2)} m]
        </p>

        {/* Keypad — no OK cell (actions are below) */}
        <NumericKeypad value={offsetInput} onChange={setOffsetInput} />

        {/* Segment too short warning */}
        {segmentTooShort && (
          <div className="mt-3 rounded-xl border border-[#991b1b] bg-[#fef2f2] px-3 py-2">
            <p className="text-xs text-[#991b1b]">
              Segment trop court pour cette porte ({loc ? loc.segment.length.toFixed(2) : '?'} m &lt;{' '}
              {doorOuterW.toFixed(2)} m requis).
            </p>
          </div>
        )}
      </div>

      {/* Section 3: Actions */}
      <div className="mt-5 flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-xl border border-[#cfcfca] py-3.5 text-sm font-semibold text-[#6b7280]"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={segmentTooShort}
          className={`flex-1 rounded-xl py-3.5 text-sm font-semibold text-white transition-opacity ${
            segmentTooShort ? 'opacity-40' : ''
          }`}
          style={{ backgroundColor: '#1d4ed8' }}
        >
          Valider
        </button>
      </div>
    </BottomSheet>
  )
}
