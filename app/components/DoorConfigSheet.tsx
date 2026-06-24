'use client'

import { useState } from 'react'
import type { Door, DoorWidth } from '@/types'
import BottomSheet from './BottomSheet'
import { getDoorOuterDims } from '@/lib/calculation'
import { generateId } from '@/lib/utils'
import { useSettings } from '@/hooks/useSettings'

const DOOR_WIDTHS: DoorWidth[] = [73, 83]

interface DoorConfigSheetProps {
  wallId: string | null
  doorIndex: number
  positionOnWall: number
  onSave: (door: Door) => void
  onClose: () => void
}

export default function DoorConfigSheet({
  wallId,
  doorIndex,
  positionOnWall,
  onSave,
  onClose,
}: DoorConfigSheetProps) {
  const [width, setWidth] = useState<DoorWidth>(83)
  const [direction, setDirection] = useState<'right' | 'left'>('right')
  const [openingSide, setOpeningSide] = useState<'front' | 'back'>('front')
  const { settings } = useSettings()

  if (!wallId) return null

  const dims = getDoorOuterDims(width, settings.fitTolerance)

  const handleSave = () => {
    const door: Door = {
      id: generateId(),
      wallId,
      width,
      openingDirection: direction,
      openingSide,
      positionOnWall,
    }
    onSave(door)
    onClose()
  }

  return (
    <BottomSheet isOpen={!!wallId} onClose={onClose}>
      <h2 className="text-base font-bold text-[#1f2937]">
        Porte {doorIndex} · bloc-porte
      </h2>

      {/* Width selection */}
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

      {/* Opening direction */}
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

      {/* Info box */}
      <div className="mt-4 rounded-xl border border-[#bcd0fb] bg-[#eff3fe] px-3 py-3">
        <p className="text-xs text-[#3a4a6b]">
          Réservation hors tout :{' '}
          <strong>
            {(dims.width * 100).toFixed(1)} × {(dims.height * 100).toFixed(0)} cm
          </strong>{' '}
          + jeu de pose. Montants doublés + linteau ajoutés automatiquement au calcul.
        </p>
      </div>

      <button
        onClick={handleSave}
        className="mt-6 w-full rounded-xl py-3.5 text-sm font-semibold text-white"
        style={{ backgroundColor: '#1d4ed8' }}
      >
        Valider la porte
      </button>
    </BottomSheet>
  )
}
