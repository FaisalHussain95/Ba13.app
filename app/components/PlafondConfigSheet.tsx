'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { PlafondParams } from '@/types'
import type { Point } from '@/lib/geometry'
import { boundingBox } from '@/lib/geometry'
import BottomSheet from './BottomSheet'
import NumericKeypad from './NumericKeypad'
import { getPortee, validerPortee, checkPlenumDrop } from '@/lib/plafond/validation'

interface PlafondConfigSheetProps {
  isOpen: boolean
  plafond: PlafondParams | null
  maxSpanMm: number
  wallPoints: Point[]
  onSave: (plafond: PlafondParams) => void
  onClose: () => void
}

type FieldKey = 'hauteurSousDalle' | 'hauteurFinie' | 'entraxeFourrure' | 'epaisseurIsolation'

const FIELD_ORDER: FieldKey[] = ['hauteurSousDalle', 'hauteurFinie', 'entraxeFourrure', 'epaisseurIsolation']

const FIELD_LABELS: Record<FieldKey, string> = {
  hauteurSousDalle: 'Hauteur sous dalle',
  hauteurFinie: 'Hauteur finie',
  entraxeFourrure: 'Entraxe fourrures',
  epaisseurIsolation: 'Epaisseur isolation',
}

const DEFAULT_PARAMS: PlafondParams = {
  hauteurSousDalle: 0,
  hauteurFinie: 0,
  entraxeFourrure: 600,
  avecIsolation: false,
  epaisseurIsolation: 100,
}

function parseFieldValue(s: string): number {
  const n = parseInt(s, 10)
  return isNaN(n) ? 0 : n
}

function buildParams(
  fields: Record<FieldKey, string>,
  avecIsolation: boolean
): PlafondParams {
  return {
    hauteurSousDalle: parseFieldValue(fields.hauteurSousDalle),
    hauteurFinie: parseFieldValue(fields.hauteurFinie),
    entraxeFourrure: parseFieldValue(fields.entraxeFourrure),
    avecIsolation,
    epaisseurIsolation: parseFieldValue(fields.epaisseurIsolation),
  }
}

function areDimensionsReady(fields: Record<FieldKey, string>, avecIsolation: boolean): boolean {
  const required: FieldKey[] = ['hauteurSousDalle', 'hauteurFinie', 'entraxeFourrure']
  if (avecIsolation) required.push('epaisseurIsolation')
  return required.every((k) => {
    const n = parseFieldValue(fields[k])
    return n > 0
  })
}

function fmtM(meters: number): string {
  return meters.toFixed(2).replace('.', ',')
}

export default function PlafondConfigSheet({
  isOpen,
  plafond,
  maxSpanMm,
  wallPoints,
  onSave,
  onClose,
}: PlafondConfigSheetProps) {
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    hauteurSousDalle: '',
    hauteurFinie: '',
    entraxeFourrure: '600',
    epaisseurIsolation: '100',
  })
  const [avecIsolation, setAvecIsolation] = useState(false)
  const [activeField, setActiveField] = useState<FieldKey>('hauteurSousDalle')
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      if (plafond) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFields({
          hauteurSousDalle: plafond.hauteurSousDalle > 0 ? String(plafond.hauteurSousDalle) : '',
          hauteurFinie: plafond.hauteurFinie > 0 ? String(plafond.hauteurFinie) : '',
          entraxeFourrure: plafond.entraxeFourrure > 0 ? String(plafond.entraxeFourrure) : '600',
          epaisseurIsolation: plafond.epaisseurIsolation > 0 ? String(plafond.epaisseurIsolation) : '100',
        })
        setAvecIsolation(plafond.avecIsolation)
      } else {
        setFields({
          hauteurSousDalle: '',
          hauteurFinie: '',
          entraxeFourrure: String(DEFAULT_PARAMS.entraxeFourrure),
          epaisseurIsolation: String(DEFAULT_PARAMS.epaisseurIsolation),
        })
        setAvecIsolation(DEFAULT_PARAMS.avecIsolation)
      }
      setActiveField('hauteurSousDalle')
    }
    prevOpenRef.current = isOpen
  }, [isOpen, plafond])

  const setField = useCallback((key: FieldKey, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Derive room dimensions from the polygon bounding box (in metres from the canvas).
  // boundingBox returns width/height in metres (canvas uses metres as its unit).
  const bb = boundingBox(wallPoints)
  const widthMm = Math.round(bb.width * 1000)
  const heightMm = Math.round(bb.height * 1000)

  function handleOk() {
    const visibleFields = FIELD_ORDER.filter(
      (k) => k !== 'epaisseurIsolation' || avecIsolation
    )
    const currentIdx = visibleFields.indexOf(activeField)
    const nextIdx = currentIdx + 1

    if (nextIdx < visibleFields.length) {
      setActiveField(visibleFields[nextIdx])
    } else {
      handleSave()
    }
  }

  function handleSave() {
    const ready = areDimensionsReady(fields, avecIsolation)
    if (!ready) return

    const spanResult = validerPortee(widthMm, heightMm, maxSpanMm)
    if (!spanResult.valide) return

    const params = buildParams(fields, avecIsolation)
    onSave(params)
    onClose()
  }

  // Derived validation state (computed on every render — pure functions, cheap)
  const params = buildParams(fields, avecIsolation)
  const ready = areDimensionsReady(fields, avecIsolation)

  const spanResult = validerPortee(widthMm, heightMm, maxSpanMm)
  const portee = getPortee(widthMm, heightMm)
  const dropWarning = ready ? checkPlenumDrop(params) : null

  const canSave = ready && spanResult.valide

  const visibleFields = FIELD_ORDER.filter(
    (k) => k !== 'epaisseurIsolation' || avecIsolation
  )

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <h2 className="text-base font-bold text-[#1f2937]">Plafond autoportant</h2>

      {/* Read-only room dimensions and portee info card */}
      <div className="mt-4 rounded-xl border border-[#cfcfca] bg-[#f7f7f5] px-4 py-3 flex flex-col gap-1">
        <p className="text-sm text-[#6b7280]">
          {'Piece : '}
          <span className="font-semibold text-[#1f2937]">
            {fmtM(bb.width)} m &times; {fmtM(bb.height)} m
          </span>
        </p>
        <p className="text-sm text-[#6b7280]">
          {'Portee : '}
          <span className="font-semibold text-[#1f2937]">
            {fmtM(portee / 1000)} m
          </span>
          {' — '}
          {spanResult.valide ? (
            <span className="font-medium text-[#166534]">OK</span>
          ) : (
            <span className="font-medium text-[#991b1b]">Hors limite</span>
          )}
        </p>
      </div>

      {/* Field list */}
      <div className="mt-4 flex flex-col gap-2">
        {visibleFields.map((key) => {
          const isActive = activeField === key
          return (
            <button
              key={key}
              onClick={() => setActiveField(key)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                isActive
                  ? 'border-[#1d4ed8] bg-white'
                  : 'border-[#cfcfca] bg-[#f7f7f5]'
              }`}
            >
              <span
                className={`text-sm font-medium ${
                  isActive ? 'text-[#1d4ed8]' : 'text-[#6b7280]'
                }`}
              >
                {FIELD_LABELS[key]}
              </span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  isActive ? 'text-[#1d4ed8]' : 'text-[#1f2937]'
                }`}
              >
                {fields[key] !== '' ? `${fields[key]} mm` : '—'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Isolation toggle */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-medium text-[#1f2937]">Avec isolation</p>
        <button
          onClick={() => {
            const next = !avecIsolation
            setAvecIsolation(next)
            if (next && !visibleFields.includes('epaisseurIsolation')) {
              setActiveField('epaisseurIsolation')
            }
          }}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            avecIsolation ? 'bg-[#1d4ed8]' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={avecIsolation}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              avecIsolation ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Blocking span error */}
      {!spanResult.valide && spanResult.message && (
        <div className="mt-3 rounded-xl border border-[#991b1b] bg-[#fef2f2] px-4 py-3">
          <p className="text-sm font-medium text-[#991b1b]">{spanResult.message}</p>
        </div>
      )}

      {/* Non-blocking plenum drop warning */}
      {dropWarning && (
        <div className="mt-3 rounded-xl border border-[#b45309] bg-[#fffbeb] px-4 py-3">
          <p className="text-sm font-medium text-[#92400e]">{dropWarning}</p>
        </div>
      )}

      {/* Keypad */}
      <div className="mt-4">
        <NumericKeypad
          value={fields[activeField]}
          onChange={(v) => setField(activeField, v)}
          onSubmit={handleOk}
          maxDecimalPlaces={0}
        />
      </div>

      {/* Save button */}
      <div className="mt-4">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`w-full rounded-xl py-3.5 text-sm font-semibold transition-colors ${
            canSave
              ? 'bg-[#1d4ed8] text-white active:bg-[#1e40af]'
              : 'bg-[#e5e7eb] text-[#6b7280]'
          }`}
        >
          Enregistrer le plafond
        </button>
      </div>
    </BottomSheet>
  )
}
