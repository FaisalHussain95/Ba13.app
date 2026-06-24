// Singleton MeshStandardMaterial factory — per spec §4.3.
//
// Three.js is dynamically imported (never at module top-level) so we cannot
// construct materials at module evaluation time.  getMaterials() is called
// once after the dynamic import resolves and the result is memoized.

import type * as THREE_NS from 'three'

export interface ViewerMaterials {
  MAT_ACIER: THREE_NS.MeshStandardMaterial
  MAT_PLATRE: THREE_NS.MeshStandardMaterial
  MAT_RAIL: THREE_NS.MeshStandardMaterial
  MAT_EDGE: THREE_NS.LineBasicMaterial       // plate outline (neutral gray)
  MAT_EDGE_CUT: THREE_NS.LineBasicMaterial   // cut/notched plate outline (accent)
  /**
   * STORY-6a: Glass-wool insulation look — yellow, semi-transparent.
   * Visibility is toggled by STORY-7; the material itself is a singleton
   * like all others and must NEVER be disposed by a builder.
   */
  MAT_LAINE: THREE_NS.MeshStandardMaterial
}

let cached: ViewerMaterials | null = null

export function getMaterials(THREE: typeof THREE_NS): ViewerMaterials {
  if (cached) return cached

  const MAT_ACIER = new THREE.MeshStandardMaterial({
    color: 0xc0c8d0,
    metalness: 0.7,
    roughness: 0.4,
  })

  const MAT_PLATRE = new THREE.MeshStandardMaterial({
    color: 0xf5f0e8,
    metalness: 0.0,
    roughness: 0.9,
    transparent: true,
    opacity: 0.98,
    side: THREE.DoubleSide,
  })

  const MAT_RAIL = new THREE.MeshStandardMaterial({
    color: 0xa8b4bc,
    metalness: 0.8,
    roughness: 0.3,
  })

  const MAT_EDGE = new THREE.LineBasicMaterial({ color: 0xd90f31, linewidth: 5 })
  const MAT_EDGE_CUT = new THREE.LineBasicMaterial({ color: 0xd9ff31, linewidth: 5 })

  // STORY-6a: glass-wool insulation material (yellow, semi-transparent).
  // Used by the ceiling insulation mesh (STORY-6b). Toggled by STORY-7.
  const MAT_LAINE = new THREE.MeshStandardMaterial({
    color: 0xe8d44a,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity: 0.6,
  })

  cached = { MAT_ACIER, MAT_PLATRE, MAT_RAIL, MAT_EDGE, MAT_EDGE_CUT, MAT_LAINE }
  return cached
}

/**
 * Dispose all singleton materials and clear the cache.
 * Call this when the viewer is permanently torn down (e.g., route change).
 */
export function disposeMaterials(): void {
  if (!cached) return
  cached.MAT_ACIER.dispose()
  cached.MAT_PLATRE.dispose()
  cached.MAT_RAIL.dispose()
  cached.MAT_EDGE.dispose()
  cached.MAT_EDGE_CUT.dispose()
  cached.MAT_LAINE.dispose()
  cached = null
}
