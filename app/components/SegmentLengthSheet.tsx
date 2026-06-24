'use client'

import { useState, useEffect, useRef } from 'react'
import type { Wall } from '@/types'
import BottomSheet from './BottomSheet'
import NumericKeypad from './NumericKeypad'

interface SegmentLengthSheetProps {
  isOpen: boolean
  wallLabel: string
  currentLength: number
  wall: Wall | null
  onSave: (length: number, wallProps: { cladding: 'double' | 'single'; hasInsulation: boolean }) => void
  onClose: () => void
}

const MAX_WALL_LENGTH = 50

export default function SegmentLengthSheet({
  isOpen,
  wallLabel,
  currentLength,
  wall,
  onSave,
  onClose,
}: SegmentLengthSheetProps) {
  const [input, setInput] = useState('')
  const [shake, setShake] = useState(false)
  const [cladding, setCladding] = useState<'double' | 'single'>('double')
  const [hasInsulation, setHasInsulation] = useState(true)
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setInput(currentLength.toFixed(2))
      setShake(false)
      setCladding(wall?.cladding ?? 'double')
      setHasInsulation(wall?.hasInsulation ?? true)
    }
    prevOpenRef.current = isOpen
  }, [isOpen, currentLength, wall])

  function handleValider() {
    const value = parseFloat(input)
    if (!isNaN(value) && value > 0 && value <= MAX_WALL_LENGTH) {
      onSave(value, { cladding, hasInsulation })
    } else {
      setShake(true)
      setTimeout(() => setShake(false), 400)
    }
  }

  const displayText = input !== '' ? input + ' m' : '—'

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <h2 className="text-base font-bold text-[#1f2937]">{wallLabel}</h2>

      {/* Length display */}
      <div
        className={`mt-4 rounded-xl border bg-[#f7f7f5] px-4 py-3 text-right transition-all ${
          shake ? 'border-[#991b1b] bg-[#fef2f2]' : 'border-[#cfcfca]'
        }`}
        style={shake ? { animation: 'shake 0.4s ease' } : {}}
      >
        <span className="text-3xl font-bold tracking-tight text-[#1f2937]">{displayText}</span>
      </div>

      {/* Keypad */}
      <div className="mt-4">
        <NumericKeypad value={input} onChange={setInput} onSubmit={handleValider} />
      </div>

      {/* Cladding */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[#1f2937]">Parement BA13</p>
        <div className="flex rounded-xl border border-[#cfcfca] bg-[#f7f7f5] p-1">
          <button
            onClick={() => setCladding('double')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              cladding === 'double' ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
            }`}
          >
            Double face
          </button>
          <button
            onClick={() => setCladding('single')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              cladding === 'single' ? 'bg-white text-[#1f2937] shadow-sm' : 'text-[#6b7280]'
            }`}
          >
            Simple face
          </button>
        </div>
      </div>

      {/* Insulation */}
      <div className="mt-4 flex items-center justify-between">
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

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </BottomSheet>
  )
}
