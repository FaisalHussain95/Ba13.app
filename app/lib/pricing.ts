// lib/pricing.ts
// Pure pricing helper — no React, no component imports.
// Merges BOM items with catalog prices from lib/catalog.ts.

import { CATALOG, TVA } from '@/lib/catalog'
import type { BomItem } from '@/types'

export interface PricedItem {
  item: BomItem
  qty: number           // manualOverride ?? quantity (or override from bomOverrides)
  unitHT: number | null // null when no catalogId match
  totalHT: number | null
  url: string | null
}

export interface PriceSummary {
  items: PricedItem[]
  grandTotalHT: number  // sum of totalHT for priced items only
  grandTotalTTC: number // grandTotalHT * (1 + TVA)
  isPartial: boolean    // true when any item has no catalogId
}

/**
 * Compute pricing for a BOM item list.
 *
 * @param items      - BOM items (already merged with persisted manualOverrides)
 * @param overrides  - project.bomOverrides map (reference → qty) used as the
 *                     authoritative quantity source; falls back to item.manualOverride
 *                     then item.quantity.
 */
export function computePricing(
  items: BomItem[],
  overrides: Record<string, number>,
): PriceSummary {
  const priced: PricedItem[] = items.map((item) => {
    const qty = overrides[item.reference] ?? item.manualOverride ?? item.quantity
    const catalogEntry = item.catalogId ? CATALOG[item.catalogId] : null
    const unitHT = catalogEntry ? catalogEntry.prixHT : null
    return {
      item,
      qty,
      unitHT,
      totalHT: unitHT !== null ? +(unitHT * qty).toFixed(2) : null,
      url: catalogEntry ? catalogEntry.url : null,
    }
  })

  const grandTotalHT = +priced
    .filter((p) => p.totalHT !== null)
    .reduce((sum, p) => sum + (p.totalHT ?? 0), 0)
    .toFixed(2)

  return {
    items: priced,
    grandTotalHT,
    grandTotalTTC: +(grandTotalHT * (1 + TVA)).toFixed(2),
    isPartial: priced.some((p) => p.totalHT === null),
  }
}
