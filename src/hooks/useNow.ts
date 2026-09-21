import { useSyncExternalStore } from 'react'

/**
 * The current time, as a value React is allowed to read during render.
 *
 * Calling `Date.now()` in a component body is impure - the same render would
 * produce a different answer each time - so it is read through an external
 * store whose snapshot only changes when the tick fires.
 *
 * The store is module-level rather than per-component, so every consumer
 * shares one interval no matter how many rows are on screen, and they all see
 * the same instant. The timer only exists while something is subscribed.
 *
 * A minute is plenty: nothing rendered from this is finer-grained than that,
 * and the point is only that a lock reading "2 minutes ago" eventually reads
 * "an hour ago" without anyone touching the component.
 */
const TICK_MS = 60_000

let current = Date.now()
let timer = 0
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  if (timer === 0) {
    timer = window.setInterval(() => {
      current = Date.now()
      for (const listener of listeners) listener()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0) {
      window.clearInterval(timer)
      timer = 0
    }
  }
}

function getSnapshot(): number {
  return current
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
