import { useSyncExternalStore } from 'react'

/**
 * Subscribes to a media query.
 *
 * useSyncExternalStore rather than state-set-in-an-effect, so the very first
 * render already has the right answer - otherwise the wrong layout renders
 * and is immediately swapped.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Chakra's `lg` breakpoint - where the event table replaces the card list. */
export function useIsWideScreen(): boolean {
  return useMediaQuery('(min-width: 62em)')
}

/**
 * Chakra's `md` breakpoint. Used by the arrivals table, whose columns are
 * narrow enough to survive a tablet even though the event list's cannot.
 */
export function useIsMediumScreen(): boolean {
  return useMediaQuery('(min-width: 48em)')
}
