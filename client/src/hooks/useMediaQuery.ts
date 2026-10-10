import { useState, useEffect } from 'react'

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 *
 * Used to swap dense tables for stacked cards on phones. Doing this in JS
 * (rather than pure CSS) is deliberate: the table and the card list render
 * genuinely different markup, and duplicating both in the DOM would double the
 * number of live elements and confuse screen readers.
 *
 * SSR/first-paint safe: falls back to `false` until the query can be read.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mql = window.matchMedia(query)
    const sync = () => setMatches(mql.matches)

    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [query])

  return matches
}

/**
 * True on viewports narrow enough that a horizontally-scrolling data table is
 * the wrong affordance. 767px matches the Tailwind `md` breakpoint boundary
 * used elsewhere in the app.
 */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
