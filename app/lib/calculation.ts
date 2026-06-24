import type { Wall, Settings, BomItem, StudWidth, DoorWidth, PlafondParams } from '@/types'
import { generateId } from '@/lib/utils'
import { perimeterLength, boundingBox, isPolygonClosed } from '@/lib/geometry'
import { ROCKWOOL_PAQUET_M2 } from '@/lib/catalog'
import { validerPortee } from '@/lib/plafond/validation'

// Base door outer dimensions (Bricoman bloc-porte with 72mm huisserie) in meters, before fit tolerance
const BASE_DOOR_OUTER: Record<DoorWidth, { width: number; height: number }> = {
  73: { width: 0.797, height: 2.08 },
  83: { width: 0.897, height: 2.08 },
}

/**
 * Returns door outer dimensions in meters, including the fit tolerance from settings.
 */
function getDoorOuterDimsWithTolerance(
  doorWidth: DoorWidth,
  fitToleranceMm: number
): { width: number; height: number } {
  const base = BASE_DOOR_OUTER[doorWidth]
  const tol = fitToleranceMm / 1000
  return { width: base.width + tol, height: base.height + tol }
}

// Commercial stud lengths by width (meters)
const STUD_LENGTHS: Record<StudWidth, number[]> = {
  36: [3.0],
  48: [2.5, 2.6, 2.7, 2.8, 3.0, 4.0],
  62: [3.0, 3.5],
  70: [2.5, 3.0, 4.0],
  90: [3.0],
  100: [3.0],
}

const CATEGORY_ORDER: BomItem['category'][] = [
  'ossature',
  'parement',
  'visserie',
  'portes',
  'finition',
  'isolation',
]

// Fabrication / packaging constants for suspended ceiling (plafond autoportant).
// These are product-fixed facts (NOT user thresholds) — keep them here, not in Settings.
const CEILING_SCREWS_PER_BOARD = 32   // screws consumed per BA13 board (fixation fourrure + board)
const CEILING_BOARD_WASTE      = 1.10 // +10% cutting waste on BA13 boards
const CEILING_ISO_OVERLAP      = 1.05 // +5% overlap/waste on insulation rolls
const CEILING_ROLL_M2          = 6.0  // m² of insulation per roll (100 mm glass wool standard)
const BOARD_M2                 = 3.0  // m² per BA13 2500×1200 board

// Maps BomItem.reference → CatalogItem.id (lib/catalog.ts).
const REF_TO_CATALOG_ID: Record<string, string> = {
  'LABELPLAC-BA13-250120':      'ba13-standard-250x120',
  'ISOLPRO-RAIL-48-3M':         'rail-48-300',
  'ISOLPRO-MONTANT-48-2P5M':    'montant-48-250',
  'ISOLPRO-MONTANT-48-2P6M':    'montant-48-260',
  'ISOLPRO-MONTANT-48-2P7M':    'montant-48-270',
  'ISOLPRO-MONTANT-48-2P8M':    'montant-48-280',
  'ISOLPRO-MONTANT-48-3M':      'montant-48-300',
  'ISOLPRO-MONTANT-48-4M':      'montant-48-400',
  'ISOLPRO-VIS-35X25-B1000':    'vis-3.5x25-b1000',
  'BRICOMAN-PORTE-73-DROIT':    'porte-postforme-73-droit',
  'BRICOMAN-PORTE-73-GAUCHE':   'porte-isoplan-73-gauche',
  'BRICOMAN-PORTE-83-GAUCHE':   'porte-isoplan-83-gauche',
  'BRICOMAN-PORTE-83-DROIT':    'porte-postforme-83-droit',
  'ROCKWOOL-ROCKMUR-40MM':      'rockwool-rockmur-40mm',
}

function doorCatalogLabel(width: DoorWidth, direction: 'right' | 'left'): string {
  if (width === 73 && direction === 'right') return 'Bloc-porte postformé prépeint — 73 cm poussant droit'
  if (width === 73 && direction === 'left')  return 'Bloc-porte isoplan prépeint — 73 cm poussant gauche'
  if (width === 83 && direction === 'left')  return 'Bloc-porte isoplan prépeint — 83 cm poussant gauche'
  return 'Bloc-porte postformé prépeint — 83 cm poussant droit'
}

/**
 * Returns the smallest commercial stud length >= wallHeight.
 * Falls back to the largest available if none is large enough.
 */
function selectStudLength(studWidth: StudWidth, wallHeight: number): number {
  const lengths = STUD_LENGTHS[studWidth]
  const suitable = lengths.filter((l) => l >= wallHeight)
  if (suitable.length > 0) return suitable[0]
  return lengths[lengths.length - 1]
}


interface AggKey {
  designation: string
  category: BomItem['category']
  unit: string
}

function aggKeyStr(k: AggKey): string {
  return `${k.category}||${k.designation}||${k.unit}`
}

/**
 * Pure BOM calculation function.
 * All thresholds are read from settings — nothing is hardcoded.
 *
 * When plafond is provided the ceiling material lines are appended to the SAME
 * aggregator so they share category sort, override keys, and CSV export for free.
 * When the span check fails (validerPortee returns !valide) no ceiling lines are
 * emitted — the form (STORY-5) surfaces the blocking message to the user.
 */
export function calculateBOM(walls: Wall[], settings: Settings, plafond?: PlafondParams): BomItem[] {
  // Accumulator: key → { item, quantity }
  const agg = new Map<string, { base: Omit<BomItem, 'id' | 'quantity'>; quantity: number }>()

  function add(
    category: BomItem['category'],
    designation: string,
    reference: string,
    quantity: number,
    unit: string,
    extra?: { width?: string; length?: string }
  ): void {
    if (quantity <= 0) return
    const key = aggKeyStr({ designation, category, unit })
    const existing = agg.get(key)
    if (existing) {
      existing.quantity += quantity
    } else {
      const catalogId = REF_TO_CATALOG_ID[reference]
      agg.set(key, {
        base: { category, designation, reference, ...(catalogId ? { catalogId } : {}), unit, ...extra },
        quantity,
      })
    }
  }

  for (const wall of walls) {
    if (wall.points.length < 2) continue

    const wallLength = perimeterLength(wall.points)
    if (wallLength <= 0) continue

    const wallSurface = wallLength * wall.height

    // Calculate door deductions and extra elements
    let doorOpeningArea = 0
    let extraStuds = 0
    let extraRails = 0 // lintel rails above door openings

    for (const door of wall.doors) {
      const dims = getDoorOuterDimsWithTolerance(door.width, settings.fitTolerance)
      doorOpeningArea += dims.width * dims.height

      // 4 extra studs (doubled on each side) + studs above lintel
      const aboveLintelHeight = Math.max(0, wall.height - dims.height)
      const studsAboveLintel = Math.ceil(
        aboveLintelHeight / (settings.studSpacingStandard / 100)
      )
      extraStuds += 4 + studsAboveLintel

      // 1 lintel rail per door (cut to door width, but we count 1 rail unit)
      extraRails += 1
    }

    const netSurface = Math.max(0, wallSurface - doorOpeningArea)

    // --- Parement (plasterboard) ---
    const boardAreaM2 =
      (settings.defaultBoardWidth / 1000) * (settings.defaultBoardHeight / 1000)
    const plaqueArea = wall.cladding === 'double' ? netSurface * 2 : netSurface
    const plaqueUnits = Math.ceil(plaqueArea / boardAreaM2)

    if (plaqueUnits > 0) {
      const boardWCm = Math.round(settings.defaultBoardWidth / 10)
      const boardHCm = Math.round(settings.defaultBoardHeight / 10)
      const plaqueDesig = `Plaque BA13 ${boardHCm}×${boardWCm} NF LABELPLAC`
      add(
        'parement',
        plaqueDesig,
        'LABELPLAC-BA13-250120',
        plaqueUnits,
        'u',
        { width: `${settings.defaultBoardWidth} mm`, length: `${settings.defaultBoardHeight} mm` }
      )
    }

    // --- Ossature: rails (top + bottom) ---
    const railQty = Math.ceil((wallLength * 2) / 3) + extraRails
    const railDesig =
      wall.studWidth === 62
        ? `Rail ${wall.studWidth}/35 ISOLPRO — 3 m`
        : `Rail ${wall.studWidth}/28 ISOLPRO — 3 m`
    const railRef = `ISOLPRO-RAIL-${wall.studWidth}-3M`

    add('ossature', railDesig, railRef, railQty, 'u', {
      width: `${wall.studWidth} mm`,
      length: '3 m',
    })

    // --- Ossature: studs ---
    const studSpacingM = settings.studSpacingStandard / 100
    const baseStudCount = Math.ceil(wallLength / studSpacingM) + 1
    const totalStudCount = baseStudCount + extraStuds
    const studLength = selectStudLength(wall.studWidth, wall.height)
    const studDesig = `Montant ${wall.studWidth}/35 ISOLPRO — ${studLength} m`
    const studRef = `ISOLPRO-MONTANT-${wall.studWidth}-${String(studLength).replace('.', 'P')}M`

    add('ossature', studDesig, studRef, totalStudCount, 'u', {
      width: `${wall.studWidth} mm`,
      length: `${studLength} m`,
    })

    // --- Visserie (screws) ---
    const screwBoxes = Math.ceil((netSurface * settings.screwRatio) / 1000)
    if (screwBoxes > 0) {
      add(
        'visserie',
        'Vis plâtre 3,5×25 mm ISOLPRO — boîte 1000',
        'ISOLPRO-VIS-35X25-B1000',
        screwBoxes,
        'boîte'
      )
    }

    // --- Portes ---
    for (const door of wall.doors) {
      const dirKey = door.openingDirection === 'right' ? 'DROIT' : 'GAUCHE'
      const doorRef = `BRICOMAN-PORTE-${door.width}-${dirKey}`
      const doorDesig = doorCatalogLabel(door.width, door.openingDirection)
      add('portes', doorDesig, doorRef, 1, 'u', { width: `${door.width} cm` })
    }

    // --- Isolation ---
    if (wall.hasInsulation) {
      // Sold per package of 14 panels 135×60 cm (= ROCKWOOL_PAQUET_M2 m²/pkg).
      const paquets = Math.ceil(netSurface / ROCKWOOL_PAQUET_M2)
      if (paquets > 0) {
        add(
          'isolation',
          'Laine de roche Rockmur kraft 40mm R1,1 — lot de 14 panneaux (11,34 m²)',
          'ROCKWOOL-ROCKMUR-40MM',
          paquets,
          'paquet'
        )
      }
    }
  }

  // --- Plafond autoportant (suspended ceiling) ---
  // Ceiling lines use DISTINCT designations and references from all wall lines to
  // prevent silent quantity merging in the agg map and reference-keyed bomOverrides.
  // Dimensions are derived from the bounding box of walls[0] (the closed polygon).
  // No ceiling lines are emitted if the polygon is not yet closed or doesn't exist.
  if (plafond !== undefined && walls[0] !== undefined && isPolygonClosed(walls[0].points)) {
    const bb = boundingBox(walls[0].points)  // metres
    const longueurM = bb.width
    const largeurM  = bb.height
    const validation = validerPortee(bb.width * 1000, bb.height * 1000, settings.maxSpanCeilingMm)
    if (validation.valide) {
      const entraxeM  = plafond.entraxeFourrure / 1000

      // Montant 48/35 ISOLPRO — ossature plafond
      // Edge rows (first + last): 1 Montant per row.
      // Interior rows: 2 Montants side-by-side per row.
      const nbRangeesFourrure  = Math.ceil(largeurM / entraxeM) + 1
      const nbEdgeRows         = Math.min(2, nbRangeesFourrure)
      const nbInteriorRows     = Math.max(0, nbRangeesFourrure - 2)
      const totalMontants_ml   = (nbEdgeRows + nbInteriorRows * 2) * longueurM
      const nbMontants3m       = Math.ceil(totalMontants_ml / 3.0)
      add(
        'ossature',
        'Montant 48/35 ISOLPRO — 3,00 m',
        'MONTANT-48-35-3M',
        nbMontants3m,
        'u',
        { width: '48 mm', length: '3 m' }
      )

      // BA13 boards — parement
      // Designation intentionally differs from wall plasterboard ("Plaque BA13 2500×1200 NF LABELPLAC")
      const surfacePlafond_m2 = longueurM * largeurM
      const nbPlaques = Math.ceil((surfacePlafond_m2 / BOARD_M2) * CEILING_BOARD_WASTE)
      add(
        'parement',
        'Plaque BA13 2500×1200 — plafond',
        'BA13-PLAFOND',
        nbPlaques,
        'u',
        { width: '1200 mm', length: '2500 mm' }
      )

      // Screws — visserie
      // Designation intentionally differs from wall screws ("Vis plâtre 3,5×25 mm ISOLPRO — boîte 1000")
      const nbVisTotal  = nbPlaques * CEILING_SCREWS_PER_BOARD
      const nbBoitesVis = Math.ceil(nbVisTotal / 1000)
      if (nbBoitesVis > 0) {
        add(
          'visserie',
          'Vis plâtre 3,5×25 — plafond',
          'VIS-35X25-PLAFOND',
          nbBoitesVis,
          'boîte'
        )
      }

      // Insulation rolls — isolation (only when requested)
      if (plafond.avecIsolation) {
        const surfaceIsolation_m2 = surfacePlafond_m2 * CEILING_ISO_OVERLAP
        const nbRouleaux = Math.ceil(surfaceIsolation_m2 / CEILING_ROLL_M2)
        if (nbRouleaux > 0) {
          add(
            'isolation',
            `Laine de verre ${plafond.epaisseurIsolation} mm — plafond`,
            'LAINE-VERRE-100',
            nbRouleaux,
            'rouleau'
          )
        }
      }
    }
    // If !validation.valide → emit zero ceiling lines (STORY-5 form surfaces the blocking message)
  }

  // Build final sorted array
  const items: BomItem[] = []
  for (const [, entry] of agg) {
    items.push({
      id: generateId(),
      ...entry.base,
      quantity: entry.quantity,
    })
  }

  // Sort by category order
  items.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category)
    const bi = CATEGORY_ORDER.indexOf(b.category)
    return ai - bi
  })

  return items
}

/**
 * Returns door outer dimensions in meters for display purposes.
 * fitToleranceMm defaults to 0 so callers without settings can still use this.
 */
export function getDoorOuterDims(
  width: DoorWidth,
  fitToleranceMm = 0
): { width: number; height: number } {
  return getDoorOuterDimsWithTolerance(width, fitToleranceMm)
}
