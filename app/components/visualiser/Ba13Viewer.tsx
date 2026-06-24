'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import BottomSheet from '@/components/BottomSheet'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import type { Wall, PlafondParams } from '@/types'

// ViewerCanvas is dynamically imported with ssr:false so that `three` (~600 KB gz)
// is code-split out of the initial bundle and only loaded when the viewer is needed.
const ViewerCanvas = dynamic(() => import('./ViewerCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-50 text-sm text-gray-400">
      Chargement de la vue 3D...
    </div>
  ),
})

interface Ba13ViewerProps {
  /** The wall to visualise. STORY-2 will render geometry from this; for now it is plumbed through. */
  wall: Wall | null
  /**
   * STORY-6a: ceiling params from the project, or null/undefined when none
   * configured. Threaded through to ViewerCanvas which applies the span-gate.
   */
  plafond?: PlafondParams | null
  /**
   * Which layout slot this instance occupies.
   *
   * The page mounts TWO Ba13Viewer instances simultaneously — one in the
   * desktop side-panel and one in the mobile toolbar — and hides the
   * irrelevant one with CSS (md:hidden / hidden md:block). CSS display:none
   * does NOT unmount React, so without this prop both instances would render
   * a live ViewerCanvas, giving two WebGLRenderer / useThreeScene instances
   * sharing the MAT_PLATRE singleton.
   *
   * The `variant` prop makes the instances mutually exclusive at the React
   * tree level: each returns null when its variant does not match the current
   * viewport, guaranteeing at most ONE ViewerCanvas mounts at any time.
   *
   * - 'desktop': render nothing on mobile (isDesktop === false → return null).
   * - 'mobile' : render nothing on desktop (isDesktop === true  → return null).
   */
  variant: 'desktop' | 'mobile'
}

// ── Maximise toggle button ─────────────────────────────────────────────────────

interface MaximiseButtonProps {
  isMaximised: boolean
  onToggle: () => void
}

/**
 * Floating toggle button rendered at the top-right of the viewer container.
 * Positioned absolute — the parent must be relative.
 */
function MaximiseButton({ isMaximised, onToggle }: MaximiseButtonProps) {
  return (
    <button
      onClick={onToggle}
      className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-[#cfcfca] bg-white/90 backdrop-blur-sm px-2 py-1 text-xs font-medium text-[#374151] shadow-sm hover:bg-white active:bg-gray-100 select-none"
      aria-label={isMaximised ? 'Réduire la vue 3D' : 'Agrandir la vue 3D'}
    >
      {isMaximised ? (
        // Close / reduce icon
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span>Réduire</span>
        </>
      ) : (
        // Expand icon (two diagonal arrows)
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          <span>Agrandir</span>
        </>
      )}
    </button>
  )
}

// ── Main viewer shell ──────────────────────────────────────────────────────────

/**
 * User-facing viewer shell.
 *
 * Uses a viewport-driven conditional mount so that exactly ONE ViewerCanvas
 * (and therefore one WebGLRenderer / useThreeScene instance) is live at a time.
 *
 * The page places two instances in the tree (one per layout slot). The
 * `variant` prop makes them mutually exclusive: the one whose variant does
 * not match the current viewport returns null immediately and mounts no
 * ViewerCanvas at all.
 *
 * `isDesktop` starts as `false` (SSR-safe mobile-first default) and flips to
 * the real value in a useEffect.  On first paint both instances compute
 * isDesktop=false, so variant="desktop" returns null and variant="mobile"
 * renders — exactly one ViewerCanvas.  On desktop, after mount the effect
 * flips isDesktop=true: variant="mobile" returns null and variant="desktop"
 * renders — again exactly one ViewerCanvas.  No hydration mismatch occurs
 * because server and first-client render agree (both use isDesktop=false).
 *
 * `isMaximised` expands the viewer to cover the full viewport (fixed inset-0)
 * regardless of which layout branch (desktop panel / mobile sheet) is active.
 * The ResizeObserver already wired into ViewerCanvas triggers a Three.js
 * viewport recalculation automatically when the container dimensions change.
 */
export default function Ba13Viewer({ wall, plafond = null, variant }: Ba13ViewerProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isMaximised, setIsMaximised] = useState(false)
  const isDesktop = useIsDesktop()

  // Mutual-exclusion guard: return nothing when this slot does not own the
  // current viewport.  This ensures at most one ViewerCanvas is ever mounted.
  if (variant === 'desktop' && !isDesktop) return null
  if (variant === 'mobile' && isDesktop) return null

  const toggleMaximise = () => setIsMaximised((prev) => !prev)

  // When maximised, both desktop and mobile branches render the same fullscreen
  // overlay so the ViewerCanvas fills the entire viewport.
  if (isMaximised) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col">
        <div className="relative flex-1 overflow-hidden">
          <ViewerCanvas wall={wall} plafond={plafond} />
          <MaximiseButton isMaximised={true} onToggle={toggleMaximise} />
        </div>
      </div>
    )
  }

  if (isDesktop) {
    // ── Desktop: inline side panel (only this branch is mounted) ──
    return (
      <div className="flex flex-col h-full w-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#cfcfca]">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Vue 3D
          </span>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <ViewerCanvas wall={wall} plafond={plafond} />
          <MaximiseButton isMaximised={false} onToggle={toggleMaximise} />
        </div>
      </div>
    )
  }

  // ── Mobile: floating toggle button + BottomSheet (only this branch is mounted) ──
  return (
    <>
      <button
        onClick={() => setSheetOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-[#cfcfca] bg-white px-4 py-2.5 text-sm font-medium text-[#1f2937] shadow-sm active:bg-gray-50"
        aria-label="Ouvrir la visualisation 3D"
      >
        {/* Cube icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        Voir en 3D
      </button>

      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)}>
        {/* BottomSheet max-w-sm; give the canvas a fixed height inside the sheet */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-[#1f2937]">Visualisation 3D</p>
          <div className="relative h-64 w-full overflow-hidden rounded-xl bg-gray-50">
            {sheetOpen && <ViewerCanvas wall={wall} plafond={plafond} />}
            {sheetOpen && (
              <MaximiseButton isMaximised={false} onToggle={toggleMaximise} />
            )}
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
