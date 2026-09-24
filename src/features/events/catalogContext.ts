import { createContext } from 'react'
import type { CatalogEvent } from './types'

export interface CatalogContextValue {
  events: CatalogEvent[]
  /** Hash of the catalog currently held; the baseline for change detection. */
  hash: string | null
  loading: boolean
  error: string | null
  /** When the held catalog was last confirmed fresh. */
  fetchedAt: Date | null
  /** Stable identity - safe to put in a dependency array. */
  reload: () => void
  /**
   * Re-read without a spinner, keeping what is on screen until the answer
   * arrives. Cheap when nothing moved: the hash matches and the list is left
   * alone. Stable identity.
   */
  revalidate: () => void
}

export const CatalogContext = createContext<CatalogContextValue | null>(null)
