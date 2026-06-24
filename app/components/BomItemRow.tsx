'use client'

import type { BomItem } from '@/types'
import type { PricedItem } from '@/lib/pricing'

interface BomItemRowProps {
  item: BomItem
  onQuantityChange: (id: string, delta: number) => void
  pricedItem?: PricedItem
}

export default function BomItemRow({ item, onQuantityChange, pricedItem }: BomItemRowProps) {
  const displayed = item.manualOverride ?? item.quantity

  return (
    <div className="flex items-start gap-2 py-2.5">
      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#1f2937] leading-snug">
          {item.designation}
          {pricedItem?.url && (
            <a
              href={pricedItem.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Voir ${item.designation} sur Bricoman`}
              className="ml-1.5 text-[#1d4ed8] hover:underline"
            >
              ↗
            </a>
          )}
        </p>
        <p className="text-xs text-[#6b7280]">
          {item.category}
          {item.width ? ` · ${item.width}` : ''}
          {item.length ? ` · ${item.length}` : ''}
          {' · '}{item.unit}
        </p>
        {pricedItem?.unitHT !== null && pricedItem?.unitHT !== undefined && (
          <p className="mt-0.5 text-xs text-[#9ca3af]">
            {pricedItem.unitHT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/u
          </p>
        )}
      </div>

      {/* Right column: stepper + optional line total */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {/* Quantity adjuster */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onQuantityChange(item.id, -1)}
            disabled={displayed <= 0}
            aria-label="Diminuer"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#cfcfca] bg-[#f7f7f5] text-base font-semibold text-[#1f2937] disabled:opacity-40"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-bold text-[#1f2937]">{displayed}</span>
          <button
            onClick={() => onQuantityChange(item.id, 1)}
            aria-label="Augmenter"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#cfcfca] bg-[#f7f7f5] text-base font-semibold text-[#1f2937]"
          >
            +
          </button>
        </div>

        {/* Line total */}
        {pricedItem?.totalHT !== null && pricedItem?.totalHT !== undefined && (
          <span className="text-xs font-semibold text-[#1d4ed8]">
            {pricedItem.totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT
          </span>
        )}
      </div>
    </div>
  )
}
