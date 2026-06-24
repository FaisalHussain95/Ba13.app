import type { PlafondParams, ValidationResult } from '@/types'

/**
 * Returns the governing span (portée) in mm.
 * CD 60/27 furring runs along the longest room dimension, spanning wall-to-wall
 * across the shortest. The shortest dimension is therefore the structural span.
 *
 * @param widthMm  - Room width in mm (derived from polygon bounding box).
 * @param heightMm - Room height (depth) in mm (derived from polygon bounding box).
 */
export function getPortee(widthMm: number, heightMm: number): number {
  return Math.min(widthMm, heightMm)
}

/**
 * Validates that the governing span does not exceed the user-configured maximum
 * for a self-supporting (autoportant) ceiling assembly.
 *
 * @param widthMm   - Room width in mm (derived from polygon bounding box).
 * @param heightMm  - Room height (depth) in mm (derived from polygon bounding box).
 * @param maxSpanMm - Maximum allowed span in mm, read from Settings.maxSpanCeilingMm.
 *                    Never hardcoded here — the DTU 25.41 limit is a regulatory threshold
 *                    the user may override per product or site condition.
 */
export function validerPortee(widthMm: number, heightMm: number, maxSpanMm: number): ValidationResult {
  const portee = getPortee(widthMm, heightMm)
  const valide = portee <= maxSpanMm

  if (valide) {
    return { valide: true, portee }
  }

  return {
    valide: false,
    portee,
    message:
      `La portée calculée (${portee} mm) dépasse la limite autoportante de ${maxSpanMm} mm ` +
      `(DTU 25.41 / CD 60/27). Envisagez un plafond suspendu sur suspentes, ` +
      `la pose d'un refend intermédiaire, ou contactez votre fournisseur pour un ` +
      `profilé adapté à cette portée.`,
  }
}

/**
 * Returns a warning message when the available plenum drop is less than 30 mm,
 * which is the minimum clearance required to fit CD 60/27 furring.
 * Returns undefined when the drop is sufficient.
 *
 * This is a pure helper for STORY-5's form UI — no side effects.
 */
export function checkPlenumDrop(params: PlafondParams): string | undefined {
  const drop = params.hauteurSousDalle - params.hauteurFinie
  if (drop < 30) {
    return (
      `La hauteur de plénum disponible (${drop} mm) est inférieure aux 30 mm ` +
      `nécessaires pour la fourrure CD 60/27. Réduisez la hauteur finie ou ` +
      `vérifiez les cotes de la dalle.`
    )
  }
  return undefined
}
