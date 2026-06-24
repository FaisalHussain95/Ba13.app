'use client'

import React, { use, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useProject } from '@/hooks/useProjects'
import { useSettings } from '@/hooks/useSettings'
import { calculateBOM } from '@/lib/calculation'
import { generateCSV } from '@/lib/utils'
import { computePricing } from '@/lib/pricing'
import { CATALOG_DISCLAIMER } from '@/lib/catalog'
import type { BomItem } from '@/types'
import type { PricedItem } from '@/lib/pricing'
import BomCategorySection from '@/components/BomCategorySection'

interface ResultsPageProps {
  params: Promise<{ id: string }>
}

const CATEGORY_ORDER: BomItem['category'][] = [
  'ossature',
  'parement',
  'visserie',
  'portes',
  'finition',
  'isolation',
]

function formatFR(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { project, loading, save } = useProject(id)
  const { settings } = useSettings()

  // Recalculate BOM whenever walls, settings, or ceiling params change
  const calculatedItems = useMemo(() => {
    if (!project) return []
    return calculateBOM(project.walls, settings, project.plafond)
  }, [project, settings])

  // Merge calculated items with persisted overrides from project.bomOverrides
  const bomItems: BomItem[] = useMemo(() => {
    if (!project) return calculatedItems
    return calculatedItems.map((item) => {
      const overrideQty = project.bomOverrides[item.reference]
      if (overrideQty !== undefined) {
        return { ...item, manualOverride: overrideQty }
      }
      return item
    })
  }, [calculatedItems, project])

  // Compute pricing summary (catalog prices + totals)
  const priceSummary = useMemo(() => {
    if (!project) return null
    return computePricing(bomItems, project.bomOverrides)
  }, [bomItems, project])

  // Build a lookup map from item.id → PricedItem for O(1) access in child components
  const pricingById = useMemo((): Record<string, PricedItem> => {
    if (!priceSummary) return {}
    return Object.fromEntries(priceSummary.items.map((p) => [p.item.id, p]))
  }, [priceSummary])

  const handleQuantityChange = useCallback((itemId: string, delta: number) => {
    if (!project) return
    const item = bomItems.find((i) => i.id === itemId)
    if (!item) return
    const current = item.manualOverride ?? item.quantity
    const next = Math.max(0, current + delta)
    const updatedOverrides = { ...project.bomOverrides, [item.reference]: next }
    save({ ...project, bomOverrides: updatedOverrides })
  }, [project, bomItems, save])

  const handleExportCSV = useCallback(() => {
    if (!project) return
    generateCSV(bomItems, project.name, priceSummary ?? undefined)
  }, [bomItems, project, priceSummary])

  const handleShare = useCallback(async () => {
    if (!project) return
    const text = bomItems
      .map(
        (i) =>
          `${i.category} — ${i.designation}: ${i.manualOverride ?? i.quantity} ${i.unit}`
      )
      .join('\n')
    const shareData = {
      title: `BOM — ${project.name}`,
      text,
    }
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // user cancelled or not supported
      }
    } else {
      await navigator.clipboard.writeText(text)
      alert('Liste copiée dans le presse-papier.')
    }
  }, [bomItems, project])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d4ed8] border-t-transparent" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-[#991b1b]">Chantier introuvable.</p>
        <button onClick={() => router.push('/')} className="text-sm text-[#1d4ed8] underline">
          Retour
        </button>
      </div>
    )
  }

  // Group by category
  const byCategory = CATEGORY_ORDER.reduce<Record<BomItem['category'], BomItem[]>>(
    (acc, cat) => {
      acc[cat] = bomItems.filter((i) => i.category === cat)
      return acc
    },
    {
      ossature: [],
      parement: [],
      visserie: [],
      portes: [],
      finition: [],
      isolation: [],
    }
  )

  const activeCategories = CATEGORY_ORDER.filter((c) => byCategory[c].length > 0)

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#f7f7f5' }}>
      {/* Header */}
      <div className="border-b border-[#cfcfca] bg-white px-4 pb-3 pt-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#cfcfca]"
            aria-label="Retour"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-[#1f2937]">Matériel à commander</h1>
            <p className="text-xs text-[#6b7280] truncate">
              {project.name} · {activeCategories.length} catégorie{activeCategories.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* BOM list */}
      <div className="flex-1 overflow-y-auto px-4 pb-36 pt-4">
        {bomItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-16 text-center">
            <p className="font-semibold text-[#1f2937]">Aucun matériel calculé</p>
            <p className="text-sm text-[#6b7280]">
              Ajoutez des murs dans l&apos;éditeur pour générer la liste.
            </p>
            <button
              onClick={() => router.back()}
              className="mt-2 rounded-xl border border-[#1d4ed8] px-5 py-2.5 text-sm font-semibold text-[#1d4ed8]"
            >
              Retour au plan
            </button>
          </div>
        ) : (
          <>
            {activeCategories.map((cat) => (
              <BomCategorySection
                key={cat}
                category={cat}
                items={byCategory[cat]}
                onQuantityChange={handleQuantityChange}
                pricingById={pricingById}
              />
            ))}

            {/* Totals card */}
            {priceSummary && (
              <div className="mt-2 rounded-xl border border-[#cfcfca] bg-white px-4 py-4">
                {priceSummary.isPartial && (
                  <p className="mb-3 text-xs font-medium text-[#b45309]">
                    Prix partiels — portes et isolant non référencés
                  </p>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#6b7280]">
                      {priceSummary.isPartial ? 'Total HT' : 'Total HT'}
                    </span>
                    <span className="text-sm font-semibold text-[#1f2937]">
                      {formatFR(priceSummary.grandTotalHT)} €
                      {priceSummary.isPartial && (
                        <span className="ml-1 text-xs font-normal text-[#9ca3af]">(sur articles référencés)</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#6b7280]">TVA 20 %</span>
                    <span className="text-sm text-[#1f2937]">
                      {formatFR(+(priceSummary.grandTotalHT * 0.20).toFixed(2))} €
                    </span>
                  </div>

                  <div className="mt-2 border-t border-[#cfcfca] pt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-[#1f2937]">Total TTC</span>
                    <span className="text-base font-bold text-[#1d4ed8]">
                      {formatFR(priceSummary.grandTotalTTC)} €
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            {priceSummary && (
              <p className="mt-3 px-1 text-xs text-[#9ca3af]">{CATALOG_DISCLAIMER}</p>
            )}
          </>
        )}
      </div>

      {/* Sticky footer */}
      {bomItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-sm border-t border-[#cfcfca] bg-white px-4 pb-8 pt-3">
          <div className="flex gap-3">
            <button
              onClick={handleShare}
              className="flex-1 rounded-xl border-2 border-[#1d4ed8] py-3 text-sm font-semibold text-[#1d4ed8] active:bg-[#eff3fe]"
            >
              Partager
            </button>
            <button
              onClick={handleExportCSV}
              className="flex-1 rounded-xl py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: '#1d4ed8' }}
            >
              Exporter CSV
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
