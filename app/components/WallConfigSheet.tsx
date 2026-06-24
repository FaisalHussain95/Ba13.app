'use client'

import { useState, useEffect } from 'react'
import type { Wall, StudWidth } from '@/types'
import BottomSheet from './BottomSheet'
import { perimeterLength } from '@/lib/geometry'

const STUD_WIDTHS: StudWidth[] = [36, 48, 62, 70, 90, 100]

interface WallConfigSheetProps {
  wall: Wall | null
  onSave: (updated: Wall) => void
  onClose: () => void
}

export default function WallConfigSheet({ wall, onSave, onClose }: WallConfigSheetProps) {
  const [height, setHeight] = useState(2.5)
  const [studWidth, setStudWidth] = useState<StudWidth>(48)
  const [cladding, setCladding] = useState<'double' | 'single'>('double')
  const [hasInsulation, setHasInsulation] = useState(true)
  const [hasCeiling, setHasCeiling] = useState(true)

  useEffect(() => {
    if (wall) {
      setHeight(wall.height)
      setStudWidth(wall.studWidth)
      setCladding(wall.cladding)
      setHasInsulation(wall.hasInsulation)
      setHasCeiling(wall.hasCeiling)
    }
  }, [wall])

  if (!wall) return null

  const len = perimeterLength(wall.points).toFixed(2)

  const handleSave = () => {
    onSave({ ...wall, height, studWidth, cladding, hasInsulation, hasCeiling })
    onClose()
  }

  return (
    <BottomSheet isOpen={!!wall} onClose={onClose}>
      <h2 className="text-base font-bold text-[#1f2937]">Mur · {len} m</h2>

      {/* Height stepper */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[#1f2937]">Hauteur</p>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHeight((h) => Math.max(1.0, parseFloat((h - 0.05).toFixed(2))))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#cfcfca] bg-[#f7f7f5] text-lg font-semibold text-[#1f2937]"
          >
            −
          </button>
          <span className="flex-1 text-center text-lg font-bold text-[#1f2937]">
            {height.toFixed(2)} m
          </span>
          <button
            onClick={() => setHeight((h) => Math.min(8.0, parseFloat((h + 0.05).toFixed(2))))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#cfcfca] bg-[#f7f7f5] text-lg font-semibold text-[#1f2937]"
          >
            +
          </button>
        </div>
      </div>

      {/* Stud width */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[#1f2937]">Ossature</p>
        <div className="flex flex-wrap gap-2">
          {STUD_WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setStudWidth(w)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                studWidth === w
                  ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white'
                  : 'border-[#cfcfca] bg-white text-[#1f2937]'
              }`}
            >
              {w} mm
            </button>
          ))}
        </div>
      </div>

      {/* Cladding */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[#1f2937]">Parement</p>
        <div className="flex rounded-xl border border-[#cfcfca] bg-[#f7f7f5] p-1">
          {(['double', 'single'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCladding(c)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                cladding === c ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
              }`}
            >
              {c === 'double' ? 'Double face' : 'Simple face'}
            </button>
          ))}
        </div>
      </div>

      {/* Isolation */}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm font-medium text-[#1f2937]">Isolation</p>
        <button
          onClick={() => setHasInsulation((v) => !v)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            hasInsulation ? 'bg-[#1d4ed8]' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={hasInsulation}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              hasInsulation ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Plafond existant */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[#1f2937]">Plafond existant</p>
        <div className="flex rounded-xl border border-[#cfcfca] bg-[#f7f7f5] p-1">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => setHasCeiling(v)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                hasCeiling === v ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
              }`}
            >
              {v ? 'Oui' : 'Non'}
            </button>
          ))}
        </div>
        {!hasCeiling && (
          <p className="mt-2 rounded-lg border border-[#bcd0fb] bg-[#eff3fe] px-3 py-2 text-xs text-[#3a4a6b]">
            Le calcul du faux plafond sera disponible en V2.
          </p>
        )}
      </div>

      <button
        onClick={handleSave}
        className="mt-6 w-full rounded-xl py-3.5 text-sm font-semibold text-white"
        style={{ backgroundColor: '#1d4ed8' }}
      >
        Valider le mur
      </button>
    </BottomSheet>
  )
}
