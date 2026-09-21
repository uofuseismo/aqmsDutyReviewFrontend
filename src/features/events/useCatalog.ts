import { useContext } from 'react'
import { CatalogContext, type CatalogContextValue } from './catalogContext'

/**
 * The catalog held by <CatalogProvider>, shared by every page.
 *
 * Consumers get the same events, the same poll and the same fetch, so moving
 * between the list and a review costs nothing.
 */
export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext)
  if (value === null) {
    throw new Error('useCatalog must be used within a <CatalogProvider>')
  }
  return value
}
