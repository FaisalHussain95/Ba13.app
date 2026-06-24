'use client'

import { useState, useEffect } from 'react'

/**
 * Returns true when the viewport is >= 768 px (the Tailwind `md` breakpoint).
 *
 * SSR-safe: initialises to `false` (mobile-first default) and updates in a
 * useEffect once the browser is available. This means the very first render
 * always takes the mobile path, matching what a server would emit, so there
 * is never a hydration mismatch — the value corrects itself after mount.
 *
 * A `change` listener keeps the value in sync across resize / orientation
 * changes for as long as the component using this hook is mounted.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDesktop(mq.matches)

    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isDesktop
}
