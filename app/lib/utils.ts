import type { Wall } from '@/types'
import type { PriceSummary } from '@/lib/pricing'

export function generateId(): string {
  return crypto.randomUUID()
}

export function formatRelativeDate(timestamp: number): string {
  const diff = Date.now() - timestamp
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} jours`
  const d = new Date(timestamp)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

export function countWallStats(walls: Wall[]): { walls: number; doors: number } {
  return {
    walls: walls.length,
    doors: walls.reduce((sum, w) => sum + w.doors.length, 0),
  }
}

export function generateCSV(
  items: import('@/types').BomItem[],
  projectName: string,
  pricing?: PriceSummary,
): void {
  const esc = (v: string): string => `"${v.replace(/"/g, '""')}"`

  // French decimal separator for prices
  const frPrice = (n: number): string => n.toFixed(2).replace('.', ',')

  const hasPricing = pricing !== undefined

  const headerCols = [
    'Catégorie', 'Désignation', 'Référence', 'Largeur/Dimension', 'Longueur', 'Quantité', 'Unité',
    ...(hasPricing ? ['Prix unitaire HT (€)', 'Total HT (€)'] : []),
  ]
  const header = headerCols.map(esc).join(',') + '\n'

  // Build a lookup map from item reference → PricedItem for O(1) access
  const pricingByRef = hasPricing
    ? Object.fromEntries(pricing!.items.map((p) => [p.item.reference, p]))
    : {}

  const rows = items
    .map((item) => {
      const baseCols = [
        item.category,
        item.designation,
        item.reference,
        item.width ?? '',
        item.length ?? '',
        String(item.manualOverride ?? item.quantity),
        item.unit,
      ]
      if (hasPricing) {
        const p = pricingByRef[item.reference]
        baseCols.push(
          p?.unitHT !== null && p?.unitHT !== undefined ? frPrice(p.unitHT) : '',
          p?.totalHT !== null && p?.totalHT !== undefined ? frPrice(p.totalHT) : '',
        )
      }
      return baseCols.map(esc).join(',')
    })
    .join('\n')

  // Grand-total rows (only when pricing provided)
  let totalsBlock = ''
  if (hasPricing) {
    const emptyCols = hasPricing ? ['', '', '', '', ''] : []
    const emptyRow = emptyCols.map(esc).join(',')

    totalsBlock =
      '\n' +
      emptyRow +
      '\n' +
      [...emptyCols, 'Total HT', `${frPrice(pricing!.grandTotalHT)} €`]
        .map(esc)
        .join(',') +
      '\n' +
      [...emptyCols, 'Total TTC', `${frPrice(pricing!.grandTotalTTC)} €`]
        .map(esc)
        .join(',')

    if (pricing!.isPartial) {
      totalsBlock +=
        '\n' +
        [...emptyCols, '* Prix partiels', 'hors articles non référencés']
          .map(esc)
          .join(',')
    }
  }

  const blob = new Blob(['﻿' + header + rows + totalsBlock], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `BOM_${projectName}_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
