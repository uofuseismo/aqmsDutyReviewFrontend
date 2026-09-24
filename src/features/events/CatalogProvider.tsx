import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { CATALOG_POLL_SECONDS } from '../../api/config'
import { useAuth } from '../../auth/useAuth'
import { CatalogContext, type CatalogContextValue } from './catalogContext'
import { mergeCatalog } from './mergeCatalog'
import { parseCatalog } from './parseCatalog'
import type { CatalogEvent, RawCatalogPayload } from './types'

interface CatalogState {
  events: CatalogEvent[]
  hash: string | null
  loading: boolean
  error: string | null
  fetchedAt: Date | null
}

/**
 * Holds the catalog for the whole signed-in app.
 *
 * It lives above the router on purpose. Held inside a page, the state unmounts
 * with that page, so walking from the list into an event and back re-fetched
 * the entire catalog twice - three database round trips for one round trip
 * through the UI - and discarded the reviewer's sort, filter and scroll
 * position on the way.
 *
 * There is no paging and no query parameters; the route returns everything in
 * the server's window in one response. On the busiest fortnight measured that
 * was ~670 events in 29 KB gzipped, so it is held in memory and every filter
 * and sort runs on the client.
 *
 * NOTE ON THE HASH: it arrives inside the catalog payload, so it cannot save
 * the request - only the parse and the re-render. Making it save the round
 * trip needs /events/hash to return the hash on its own;
 * today that route answers 200 with an empty body.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const { getToken, expireSession } = useAuth()
  const [state, setState] = useState<CatalogState>({
    events: [],
    hash: null,
    loading: true,
    error: null,
    fetchedAt: null,
  })

  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(
    async (background = false) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller

      if (!background) setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const catalog = await apiGet<RawCatalogPayload>(
          '/events',
          getToken(),
          controller.signal,
        )
        if (controller.signal.aborted) return

        setState((prev) => {
          /*
            Only a non-empty string counts as a baseline. Testing `!== null`
            was not enough: if the server ever omitted the field, `undefined`
            would be stored and then match `undefined` on every later poll, and
            the catalog would freeze on screen for as long as the tab stayed
            open - the worst possible failure for a duty screen, because it
            would look like a quiet night.
          */
          const usable = typeof catalog.hash === 'string' && catalog.hash !== ''
          if (usable && catalog.hash === prev.hash) {
            return { ...prev, loading: false, error: null, fetchedAt: new Date() }
          }
          return {
            events: mergeCatalog(prev.events, parseCatalog(catalog.events)),
            hash: usable ? catalog.hash : null,
            loading: false,
            error: null,
            fetchedAt: new Date(),
          }
        })
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.isUnauthorized) {
          expireSession()
          return
        }
        const message =
          cause instanceof ApiError ? cause.message : 'Could not load the catalog.'
        setState((prev) => ({
          ...prev,
          loading: false,
          /*
            A background poll that fails must not put a red banner over a
            perfectly good catalog. The events on screen are still the best
            answer available, and a blip on a two-minute timer is not news.
            A foreground load - first visit, or the Refresh button - is
            different: somebody asked, and deserves to be told it failed.
          */
          error: background && prev.events.length > 0 ? prev.error : message,
        }))
      }
    },
    [getToken, expireSession],
  )

  useEffect(() => {
    // Deferred a tick so the first render paints before the fetch begins and
    // flips the loading flag; also keeps the synchronous setState inside
    // `load` out of React's commit phase.
    const start = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [load])

  // Polling, paused while the tab is hidden.
  useEffect(() => {
    if (CATALOG_POLL_SECONDS === 0) return

    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      if (document.hidden) return
      timer = window.setTimeout(() => {
        void load(true)
        schedule()
      }, CATALOG_POLL_SECONDS * 1000)
    }
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer)
        return
      }
      // Back in view: the catalog may have moved on, so confirm once now
      // rather than waiting out a full interval.
      void load(true)
      schedule()
    }

    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  /** Stable, so a consumer can list it in a dependency array safely. */
  const reload = useCallback(() => void load(false), [load])
  /** The poll's quiet re-read, on demand: no spinner, rows swapped in place. */
  const revalidate = useCallback(() => void load(true), [load])

  const value = useMemo<CatalogContextValue>(
    () => ({ ...state, reload, revalidate }),
    [state, reload, revalidate],
  )

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}
