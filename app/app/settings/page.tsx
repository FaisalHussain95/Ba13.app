'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/hooks/useSettings'
import type { Settings } from '@/types'

function NumericInput({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string
  value: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="flex-1 text-sm text-[#1f2937]">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value.replace(',', '.'))
            if (!isNaN(parsed)) onChange(parsed)
          }}
          className="w-20 rounded-lg border border-[#cfcfca] bg-white px-2 py-1.5 text-right text-sm text-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
        />
        <span className="text-sm text-[#6b7280]">{suffix}</span>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-[#cfcfca] bg-white px-4 py-1">
      <p className="border-b border-[#cfcfca] py-2 text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
        {title}
      </p>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { settings, update, reset } = useSettings()

  const handleReset = useCallback(() => {
    const confirmed = window.confirm('Réinitialiser tous les réglages aux valeurs DTU 25.41 ?')
    if (confirmed) reset()
  }, [reset])

  const field = useCallback(
    <K extends keyof Settings>(key: K) =>
      (v: number) =>
        update({ [key]: v } as Pick<Settings, K>),
    [update]
  )

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#f7f7f5' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-12">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cfcfca] bg-white text-[#1f2937]"
          aria-label="Retour"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-[#1f2937]">Réglages</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        <Section title="Portée plafond autoportant">
          <NumericInput
            label="Montant simple (max)"
            value={settings.maxSpanSingle}
            suffix="m"
            onChange={field('maxSpanSingle')}
          />
          <NumericInput
            label="Montants doublés (max)"
            value={settings.maxSpanDoubled}
            suffix="m"
            onChange={field('maxSpanDoubled')}
          />
          <NumericInput
            label="Portée max plafond (fourrure CD 60/27)"
            value={settings.maxSpanCeilingMm}
            suffix="mm"
            onChange={field('maxSpanCeilingMm')}
          />
        </Section>

        <Section title="Cloison">
          <NumericInput
            label="Entraxe standard"
            value={settings.studSpacingStandard}
            suffix="cm"
            onChange={field('studSpacingStandard')}
          />
          <NumericInput
            label="Entraxe renforcé"
            value={settings.studSpacingReinforced}
            suffix="cm"
            onChange={field('studSpacingReinforced')}
          />
          <NumericInput
            label="Hauteur max (1 plaque)"
            value={settings.maxHeightSingleBoard}
            suffix="m"
            onChange={field('maxHeightSingleBoard')}
          />
          <NumericInput
            label="Hauteur max (2 plaques)"
            value={settings.maxHeightDoubleBoard}
            suffix="m"
            onChange={field('maxHeightDoubleBoard')}
          />
          <NumericInput
            label="Ratio vis"
            value={settings.screwRatio}
            suffix="/m²"
            onChange={field('screwRatio')}
          />
        </Section>

        <Section title="Plaque BA13">
          <NumericInput
            label="Largeur"
            value={settings.defaultBoardWidth}
            suffix="mm"
            onChange={field('defaultBoardWidth')}
          />
          <NumericInput
            label="Hauteur"
            value={settings.defaultBoardHeight}
            suffix="mm"
            onChange={field('defaultBoardHeight')}
          />
        </Section>

        <Section title="Pose">
          <NumericInput
            label="Jeu de pose (tolérance)"
            value={settings.fitTolerance}
            suffix="mm"
            onChange={field('fitTolerance')}
          />
        </Section>

        {/* Reset */}
        <button
          onClick={handleReset}
          className="mt-2 w-full rounded-xl border border-[#cfcfca] bg-white py-3 text-sm font-semibold text-[#6b7280] active:bg-gray-50"
        >
          Réinitialiser aux valeurs DTU 25.41
        </button>

        <p className="mt-4 text-center text-xs text-[#6b7280]">
          Valeurs stockées localement sur cet appareil.
        </p>
      </div>
    </div>
  )
}
