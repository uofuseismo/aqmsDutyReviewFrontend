import { createContext } from 'react'
import type { EventLock } from './locks'

export interface LocksContextValue {
  /** Keyed by event id; the only question asked is "is this one locked?". */
  locks: Map<number, EventLock>
  loading: boolean
  error: string | null
  fetchedAt: Date | null
  /** Stable identity - safe in a dependency array. */
  reload: () => void
}

export const LocksContext = createContext<LocksContextValue | null>(null)
