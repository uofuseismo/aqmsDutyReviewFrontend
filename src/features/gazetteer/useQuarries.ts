import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { parseQuarries, type Quarry, type RawQuarry } from './quarries'

/**
 * Fetched once per session and kept.
 *
 * The gazetteer has not changed in four years, so this is about as static as
 * data gets - but it is still fetched rather than compiled in. The route
 * exists, the backend stays the single source of truth, and a new quarry
 * needs a backend row rather than a frontend release. The cost is one 58 KB
 * response per session, once.
 */
let cache: Quarry[] | null = null

export function useQuarries() {
  const { getToken, expireSession } = useAuth()
  const [quarries, setQuarries] = useState<Quarry[]>(() => cache ?? [])
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (cache !== null) return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    try {
      const rows = await apiGet<RawQuarry[]>('/gazetteer/quarries', getToken(), controller.signal)
      if (controller.signal.aborted) return
      cache = parseQuarries(rows)
      setQuarries(cache)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (cause instanceof ApiError && cause.isUnauthorized) {
        expireSession()
        return
      }
      /*
        A quiet failure would be the wrong kind: a missing quarry marker looks
        exactly like "there is no quarry here", which is the opposite of what
        it means. The caller shows the difference.
      */
      setError('Could not load the quarry gazetteer.')
    }
  }, [getToken, expireSession])

  useEffect(() => {
    if (cache !== null) return
    const start = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [load])

  return { quarries, error }
}
