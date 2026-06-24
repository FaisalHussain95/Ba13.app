'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useThreeScene } from '@/hooks/useThreeScene'
import type { ThreeSceneAPI, HitInfo, ViewPreset } from '@/hooks/useThreeScene'
import { useSettings } from '@/hooks/useSettings'
import { wallToViewerWall } from '@/lib/viewer/wallToViewerWall'
import { plafondToViewer } from '@/lib/viewer/plafondToViewer'
import { validerPortee } from '@/lib/plafond/validation'
import { boundingBox } from '@/lib/geometry'
import type { Wall, PlafondParams } from '@/types'
import type { ViewerWall, ViewerPlafond } from '@/types/viewer'

interface ViewerCanvasProps {
  /** The V1 wall to visualise. Converted to ViewerWall before passing to the scene hook. */
  wall: Wall | null
  /**
   * STORY-6b: ceiling params from the project, or null when none configured.
   * Span-gate (validerPortee) and mm→m conversion (plafondToViewer) are applied
   * here; the scene hook receives a ViewerPlafond (metres) or null.
   */
  plafond?: PlafondParams | null
}

// ── Debounce hook ─────────────────────────────────────────────────────────────

/**
 * Returns a debounced version of `value` that only updates after `delay` ms
 * of quiet time.
 *
 * PART B: Coalesces rapid viewerWall changes (e.g. keystrokes in the wall form)
 * into a single geometry rebuild. The first value is returned immediately
 * (no delay on initial mount) so the first paint is never deferred.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  // Track whether this is the first render so we skip the delay on mount.
  const isFirstRef = useRef(true)

  useEffect(() => {
    if (isFirstRef.current) {
      // First mount: apply immediately, no delay.
      isFirstRef.current = false
      setDebounced(value)
      return
    }

    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

// ── Preset view button labels ─────────────────────────────────────────────────

const PRESET_BUTTONS: { preset: ViewPreset; label: string }[] = [
  { preset: 'face', label: 'Face' },
  { preset: '3-4', label: '3/4' },
  { preset: 'dessus', label: 'Dessus' },
  { preset: 'reset', label: 'Reset' },
]

// ── Tooltip component ─────────────────────────────────────────────────────────

interface TooltipProps {
  info: HitInfo
  onClose: () => void
}

function HitTooltip({ info, onClose }: TooltipProps) {
  return (
    /*
     * Fixed positioning with pointer-events:none on the backdrop so OrbitControls
     * can still receive events through the transparent overlay. The tooltip card
     * itself intercepts its own pointer events so the close button works.
     *
     * We anchor the tooltip to the bottom-left of the canvas (mobile-first:
     * always reachable with a thumb) rather than to the tap position, which
     * avoids the tooltip appearing behind the keyboard or off-screen.
     */
    <div
      className="pointer-events-none absolute inset-0 flex items-end justify-start p-3"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-[#cfcfca] bg-white/90 backdrop-blur-sm px-3 py-2 shadow-lg max-w-[220px]"
        role="tooltip"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-[#1f2937] leading-snug">
            {info.designation}
          </p>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-0.5 text-[#6b7280] hover:bg-gray-100 active:bg-gray-200"
            aria-label="Fermer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-[#6b7280] font-mono">{info.catalogId}</p>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Inner Three.js canvas component.
 *
 * This component is dynamically imported (ssr:false) by Ba13Viewer so that the
 * `three` library is code-split out of the initial bundle.
 *
 * Responsibilities:
 * - Own the <canvas> element ref.
 * - Read settings (from localStorage via useSettings) and convert the V1 Wall
 *   into a ViewerWall using the adapter (wallToViewerWall).
 * - Debounce (300ms) rapid viewerWall changes before passing to useThreeScene
 *   so the geometry is not rebuilt on every keystroke.
 * - Render preset view buttons (Face / 3/4 / Dessus / Reset) via the
 *   ThreeSceneAPI returned by useThreeScene.
 * - Render the tap-to-identify tooltip when a mesh is hit.
 */
export default function ViewerCanvas({ wall, plafond = null }: ViewerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [webglUnavailable, setWebglUnavailable] = useState(false)

  // WebGL support is probed synchronously on first render (useState initialiser).
  // It is declared before the hook call so it is in scope when passed to useThreeScene.
  const [webglSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true // SSR guard (shouldn't reach here)
    try {
      const probe = document.createElement('canvas')
      const ctx = probe.getContext('webgl2') ?? probe.getContext('webgl')
      return ctx !== null
    } catch {
      return false
    }
  })

  const { settings } = useSettings()

  // ── PART D: tooltip state ─────────────────────────────────────────────────
  const [hitInfo, setHitInfo] = useState<HitInfo | null>(null)

  // ── Convert V1 Wall → ViewerWall at the component boundary ────────────────
  // wallToViewerWall is the only viewer-subsystem file that imports the V1 type.
  // useMemo avoids unnecessary re-conversions when neither wall nor settings changed.
  const viewerWall: ViewerWall | null = useMemo(
    () => (wall ? wallToViewerWall(wall, settings) : null),
    [wall, settings]
  )

  // ── PART B: debounce viewerWall before passing to the scene hook ──────────
  // First mount is immediate (no delay); subsequent changes coalesce to 300ms.
  const debouncedViewerWall = useDebouncedValue(viewerWall, 300)

  // ── STORY-6b: span-gate + adapter + debounce for plafond ─────────────────
  // Order: validate on raw mm params (validerPortee) → if valid, adapt to
  // ViewerPlafond (plafondToViewer, mm→m) → debounce → pass to hook.
  // The hook receives ViewerPlafond (all metres) or null — it is kept dumb.
  //
  // Room dimensions come from the bounding box of the closed polygon (wall.points).
  // boundingBox returns metres (same coordinate space as the plan editor).
  // validerPortee expects mm, so we convert: metres × 1000 → mm.
  const validPlafond: ViewerPlafond | null = useMemo(() => {
    if (!plafond) return null
    const wallPoints = wall?.points ?? []
    const bb = boundingBox(wallPoints)
    const widthMm = Math.round(bb.width * 1000)
    const heightMm = Math.round(bb.height * 1000)
    return validerPortee(widthMm, heightMm, settings.maxSpanCeilingMm).valide
      ? plafondToViewer(plafond, wallPoints)
      : null
  }, [plafond, wall, settings.maxSpanCeilingMm])
  const debouncedPlafond = useDebouncedValue(validPlafond, 300)

  // ── PART D: hit/miss callbacks ────────────────────────────────────────────
  const handleHit = useCallback((info: HitInfo) => {
    setHitInfo(info)
  }, [])

  const handleMiss = useCallback(() => {
    setHitInfo(null)
  }, [])

  // ── Scene hook — returns the ThreeSceneAPI ────────────────────────────────
  // Pass a null-current ref when WebGL is unavailable so the mount effect
  // exits cleanly without attempting to create a renderer.
  // STORY-6a: debouncedPlafond (pre-validated, null when invalid) is the third arg.
  const sceneAPI: ThreeSceneAPI = useThreeScene(
    webglSupported && !webglUnavailable ? canvasRef : { current: null },
    debouncedViewerWall,
    debouncedPlafond,
    handleHit,
    handleMiss
  )

  // ── PART C: stable setView handler ───────────────────────────────────────
  const handleSetView = useCallback((preset: ViewPreset) => {
    sceneAPI.setView(preset)
  }, [sceneAPI])

  // ── PART D: clear highlight + tooltip ────────────────────────────────────
  const handleClearHighlight = useCallback(() => {
    sceneAPI.clearHighlight()
    setHitInfo(null)
  }, [sceneAPI])

  // ── STORY-5A: transparency toggle ────────────────────────────────────────
  // false = normal view (plates semi-transparent at 0.55, both faces visible)
  // true  = ossature / x-ray view (plates at 0.12, frame fully visible)
  const [transparent, setTransparent] = useState(false)

  const handleTransparencyToggle = useCallback(() => {
    setTransparent((prev) => {
      const next = !prev
      sceneAPI.setTransparency(next)
      return next
    })
  }, [sceneAPI])

  // ── STORY-5B: PNG capture ─────────────────────────────────────────────────
  const handleCapturePNG = useCallback(() => {
    sceneAPI.capturePNG()
  }, [sceneAPI])

  // ── STORY-7: Plafond structure visibility toggle ──────────────────────────
  // Default ON (ceiling structure visible). Only shown when a plafond is present.
  const [plafondVisible, setPlafondVisibleState] = useState(true)

  const handlePlafondToggle = useCallback(() => {
    setPlafondVisibleState((prev) => {
      const next = !prev
      sceneAPI.setPlafondVisible(next)
      return next
    })
  }, [sceneAPI])

  // ── STORY-7: Isolation layer visibility toggle ────────────────────────────
  // Default OFF (hidden per spec §7). Only shown when a plafond is present.
  const [isolationVisible, setIsolationVisibleState] = useState(false)

  const handleIsolationToggle = useCallback(() => {
    setIsolationVisibleState((prev) => {
      const next = !prev
      sceneAPI.setIsolationVisible(next)
      return next
    })
  }, [sceneAPI])

  // Listen for runtime WebGL context loss — must use addEventListener because
  // React's synthetic event system does not expose onContextLost on <canvas>.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleContextLost = (e: Event) => {
      e.preventDefault()
      setWebglUnavailable(true)
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)
    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost)
    }
  }, [])

  if (!webglSupported || webglUnavailable) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-center text-sm text-gray-500 px-4">
        Apercu 3D indisponible sur cet appareil
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {/* ── Canvas ── */}
      <canvas
        ref={canvasRef}
        className="h-full w-full block"
        aria-label="Visualisation 3D de la cloison"
      />

      {/* ── PART C: Preset view buttons ────────────────────────────────────
          Row of small pill buttons anchored at the top-right of the canvas.
          Positioned absolute inside the relative wrapper so they float over
          the canvas without affecting layout. Min touch target: 44×44 px via
          padding. Works in both the mobile BottomSheet and the desktop panel.
      ── */}
      <div
        className="absolute top-2 right-2 flex gap-1.5"
        aria-label="Vues prédéfinies"
      >
        {PRESET_BUTTONS.map(({ preset, label }) => (
          <button
            key={preset}
            onClick={() => handleSetView(preset)}
            className="rounded-lg border border-[#cfcfca] bg-white/85 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-[#374151] shadow-sm hover:bg-white active:bg-gray-100 select-none"
            aria-label={`Vue ${label}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="absolute top-2 left-2 flex gap-1.5"
        aria-label="Options de vue"
      >
        <button
          onClick={handleTransparencyToggle}
          className={
            transparent
              ? "rounded-lg border border-blue-400 bg-blue-100/90 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-200 active:bg-blue-300 select-none"
              : "rounded-lg border border-[#cfcfca] bg-white/85 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-[#374151] shadow-sm hover:bg-white active:bg-gray-100 select-none"
          }
          aria-pressed={transparent}
          aria-label={transparent ? "Vue plaques normales" : "Vue ossature (rayons X)"}
        >
          {transparent ? "Normal" : "Ossature"}
        </button>

        {/* ── STORY-5B: PNG capture button ──────────────────────────────── */}
        <button
          onClick={handleCapturePNG}
          className="rounded-lg border border-[#cfcfca] bg-white/85 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-[#374151] shadow-sm hover:bg-white active:bg-gray-100 select-none"
          aria-label="Capturer une image PNG"
        >
          Capturer
        </button>

        {/* ── STORY-7: Ceiling visibility toggles (only when plafond present) ── */}
        {plafond && (
          <>
            <button
              onClick={handlePlafondToggle}
              className={
                plafondVisible
                  ? "rounded-lg border border-blue-400 bg-blue-100/90 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-200 active:bg-blue-300 select-none"
                  : "rounded-lg border border-[#cfcfca] bg-white/85 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-[#374151] shadow-sm hover:bg-white active:bg-gray-100 select-none"
              }
              aria-pressed={plafondVisible}
              aria-label={plafondVisible ? "Masquer le plafond" : "Afficher le plafond"}
            >
              Plafond
            </button>
            <button
              onClick={handleIsolationToggle}
              className={
                isolationVisible
                  ? "rounded-lg border border-blue-400 bg-blue-100/90 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-200 active:bg-blue-300 select-none"
                  : "rounded-lg border border-[#cfcfca] bg-white/85 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-[#374151] shadow-sm hover:bg-white active:bg-gray-100 select-none"
              }
              aria-pressed={isolationVisible}
              aria-label={isolationVisible ? "Masquer l'isolation" : "Afficher l'isolation"}
            >
              Isolation
            </button>
          </>
        )}
      </div>

      {/* ── PART D: Tap-to-identify tooltip ─────────────────────────────── */}
      {hitInfo && (
        <HitTooltip
          info={hitInfo}
          onClose={handleClearHighlight}
        />
      )}
    </div>
  )
}
