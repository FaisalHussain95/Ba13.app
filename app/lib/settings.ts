import type { Settings } from '@/types'

export const DEFAULTS: Settings = {
  maxSpanSingle: 2.00,
  maxSpanDoubled: 4.00,
  studSpacingStandard: 60,
  studSpacingReinforced: 40,
  maxHeightSingleBoard: 6.35,
  maxHeightDoubleBoard: 6.85,
  screwRatio: 25,
  defaultBoardWidth: 1200,
  defaultBoardHeight: 2500,
  fitTolerance: 10,
  maxSpanCeilingMm: 3600,
}

const KEY = 'ba13-settings'

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function resetSettings(): Settings {
  localStorage.removeItem(KEY)
  return { ...DEFAULTS }
}
