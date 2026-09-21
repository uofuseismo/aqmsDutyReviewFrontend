import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { LOCKS_POLL_SECONDS } from '../../api/config'
import { useAuth } from '../../auth/useAuth'
import { indexLocks, type EventLock, type RawEventLock } from './locks'
import { LocksContext, type LocksContextValue } from './locksContext'

interface LocksState {
  locks: Map<number, EventLock>
  loading: boolean
  error: string | null
  fetchedAt: Date | null
}

const EMPTY: Map<number, EventLock> = new Map()

/**
 * Holds who is working on what.
 *
 * Above the router alongside the catalog, because both the list and a review
 * ask the question. Polled faster than the catalog: a stale catalog row is a
 * cosmetic annoyance, a stale lock is two analysts on one event. The backend
 * refuses to cache this for the same reason.
 *
 * The whole table comes back - a handful of rows - and is intersected client
 * side. Most locks will not match anything on screen: they name events either
 * older than the catalog window or newer than the last catalog poll. That is
 * expected, not an error.
 */
export function LocksProvider({ children }: { children: ReactNode }) {
  const { getToken, expireSession } = useAuth()
  const [state, setState] = useState<LocksState>({
    locks: EMPTY,
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
        const rows = await apiGet<RawEventLock[]>(
          '/events/locks',
          getToken(),
          controller.signal,
        )
        if (controller.signal.aborted) return
        setState({
          locks: indexLocks(rows),
          loading: false,
          error: null,
          fetchedAt: new Date(),
        })
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.isUnauthorized) {
          expireSession()
          return
        }
        const message =
          cause instanceof ApiError ? cause.message : 'Could not load the event locks.'
        setState((prev) => ({
          ...prev,
          loading: false,
          /*
            A failed lock poll is deliberately quiet. There is nowhere honest
            to put the error - the answer is not "no locks", it is "unknown" -
            and a banner over the event list about a background poll would be
            noise. The review screen says so where it matters.
          */
          error: background ? prev.error : message,
        }))
      }
    },
    [getToken, expireSession],
  )

  useEffect(() => {
    const start = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [load])

  useEffect(() => {
    if (LOCKS_POLL_SECONDS === 0) return
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      if (document.hidden) return
      timer = window.setTimeout(() => {
        void load(true)
        schedule()
      }, LOCKS_POLL_SECONDS * 1000)
    }
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer)
        return
      }
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

  const reload = useCallback(() => void load(false), [load])
  const value = useMemo<LocksContextValue>(() => ({ ...state, reload }), [state, reload])

  return <LocksContext.Provider value={value}>{children}</LocksContext.Provider>
}
