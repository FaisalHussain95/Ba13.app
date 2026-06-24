'use client'

import { useState, useEffect, useRef } from 'react'
import BottomSheet from './BottomSheet'

interface AngleConstraintSheetProps {
  isOpen: boolean
  label: string
  currentAngle: number
  onSave: (angleDeg: number) => void
  onClose: () => void
}

const PRESETS = [45, 90, 135]

export default function AngleConstraintSheet({
  isOpen,
  label,
  currentAngle,
  onSave,
  onClose,
}: AngleConstraintSheetProps) {
  const [input, setInput] = useState('')
  const [shake, setShake] = useState(false)
  const prevOpenRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setInput(String(Math.round(currentAngle)))
      setShake(false)
      setTimeout(() => inputRef.current?.select(), 150)
    }
    prevOpenRef.current = isOpen
  }, [isOpen, currentAngle])

  function handleApply() {
    const value = parseFloat(input)
    if (!isNaN(value) && value > 0 && value < 360) {
      onSave(value)
    } else {
      setShake(true)
      setTimeout(() => setShake(false), 400)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <h2 className="text-base font-bold text-[#1f2937]">{label}</h2>

      {/* Current angle display */}
      <div
        className={`mt-4 rounded-xl border bg-[#f7f7f5] px-4 py-3 text-right transition-all ${
          shake ? 'border-[#991b1b] bg-[#fef2f2]' : 'border-[#cfcfca]'
        }`}
        style={shake ? { animation: 'shake 0.4s ease' } : {}}
      >
        <span className="text-3xl font-bold tracking-tight text-[#1f2937]">
          {input !== '' ? input : '—'}
          <span className="text-xl text-[#6b7280]">°</span>
        </span>
      </div>

      {/* Preset buttons */}
      <div className="mt-4 flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setInput(String(p))}
            className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition-colors ${
              input === String(p)
                ? 'border-[#1d4ed8] bg-[#dbeafe] text-[#1d4ed8]'
                : 'border-[#cfcfca] bg-white text-[#374151] active:bg-gray-50'
            }`}
          >
            {p}°
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div className="mt-3">
        <label className="block text-sm font-medium text-[#6b7280] mb-1.5">Valeur personnalisée</label>
        <input
          ref={inputRef}
          type="number"
          min="1"
          max="359"
          step="1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          className="w-full rounded-xl border border-[#cfcfca] bg-white px-3 py-2.5 text-right text-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
          placeholder="Ex. 120"
        />
      </div>

      {/* Apply */}
      <button
        onClick={handleApply}
        className="mt-5 w-full rounded-xl py-3.5 text-sm font-semibold text-white"
        style={{ backgroundColor: '#1d4ed8' }}
      >
        Appliquer
      </button>

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
