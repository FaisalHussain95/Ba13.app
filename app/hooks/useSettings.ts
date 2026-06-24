'use client'

import { useState, useCallback } from 'react'
import type { Settings } from '@/types'
import { loadSettings, saveSettings, resetSettings } from '@/lib/settings'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())

  const update = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      saveSettings(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    const defaults = resetSettings()
    setSettings(defaults)
    return defaults
  }, [])

  return { settings, update, reset }
}
