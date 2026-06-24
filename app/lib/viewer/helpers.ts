/**
 * Viewer geometry helpers — unit conversion and stud placement math.
 *
 * All public functions are pure and unit-testable.
 * No Three.js imports here — this file is safe to import from anywhere.
 */

/** Convert millimetres to meters. */
export function mmToM(mm: number): number {
  return mm / 1000
}

/**
 * Compute X-axis positions (in meters, along the wall run) for all studs
 * in a straight run.
 *
 * Placement rules (from DTU 25.41 / spec §5.2):
 *  - Stud at x=0 (left end).
 *  - Studs at each full entraxe interval: entraxeM, 2×entraxeM, …
 *  - Stud at x=runLength (right end) — only if not already placed.
 *
 * The array is sorted ascending and contains no duplicate positions
 * (within a 1 mm tolerance).
 *
 * @param runLength  Length of the wall run in meters.
 * @param entraxeM   Centre-to-centre stud spacing in meters.
 * @returns          Sorted array of stud centre positions in meters.
 */
export function studPositions(runLength: number, entraxeM: number): number[] {
  if (runLength <= 0 || entraxeM <= 0) return []

  const positions: number[] = [0]

  let x = entraxeM
  while (x < runLength - 0.001) {
    positions.push(x)
    x += entraxeM
  }

  // Always add the far-end stud (guard against floating-point near-equality).
  if (runLength - positions[positions.length - 1] > 0.001) {
    positions.push(runLength)
  }

  return positions
}

/**
 * Compute how many full boards fit along a run dimension, and the residual.
 *
 * Returns { count, residualM } where residualM >= 0.
 * If the run fills exactly N boards, residualM is 0.
 *
 * @param runM      Run dimension in meters.
 * @param boardDimM Board dimension in the same axis (m).
 */
export function boardTiling(
  runM: number,
  boardDimM: number
): { count: number; residualM: number } {
  if (boardDimM <= 0) return { count: 0, residualM: 0 }
  const count = Math.floor(runM / boardDimM)
  const residualM = runM - count * boardDimM
  return { count, residualM }
}
