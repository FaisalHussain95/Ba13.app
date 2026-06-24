'use client'

import { useState } from 'react'
import type { BomItem } from '@/types'
import type { PricedItem } from '@/lib/pricing'
import BomItemRow from './BomItemRow'

const CATEGORY_LABELS: Record<BomItem['category'], string> = {
  ossature: 'Ossature',
  parement: 'Parement',
  visserie: 'Visserie',
  portes: 'Portes',
  finition: 'Finition',
  isolation: 'Isolation',
}

interface BomCategorySectionProps {
  category: BomItem['category']
  items: BomItem[]
  onQuantityChange: (id: string, delta: number) => void
  /** Optional map from item.id → PricedItem for inline price display */
  pricingById?: Record<string, PricedItem>
}

export default function BomCategorySection({
  category,
  items,
  onQuantityChange,
  pricingById,
}: BomCategorySectionProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="mb-3 rounded-xl border border-[#cfcfca] bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#1d4ed8]">
            {CATEGORY_LABELS[category]}
          </span>
          <span className="rounded-full border border-[#bcd0fb] bg-[#eff3fe] px-2 py-0.5 text-xs text-[#3a4a6b]">
            {items.length} réf.
          </span>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-[#6b7280] transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Items */}
      {expanded && (
        <div className="divide-y divide-[#cfcfca] px-4">
          {items.map((item) => (
            <BomItemRow
              key={item.id}
              item={item}
              onQuantityChange={onQuantityChange}
              pricedItem={pricingById?.[item.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
