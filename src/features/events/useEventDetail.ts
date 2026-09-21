import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { parseEventDetail, type EventDetail, type RawEventDetail } from './eventDetail'

/**
 * Detail already fetched this session, keyed by event id.
 *
 * Module-level so it survives the review page unmounting - walking back to
 * the list and into the same event again should not re-query the database.
 * That is the mistake the catalog made before it moved above the router.
 */
const cache = new Map<number, EventDetail>()

interface DetailState {
  detail: EventDetail | null
  loading: boolean
  error: string | null
}

/**
 * Loads one event's parametric data.
 *
 * Stale-while-revalidate: a cached event renders immediately and is refreshed
 * in the background, because an event's solution changes when somebody
 * reviews it and a duty screen showing yesterday's picks would be worse than
 * a moment's wait.
 */
export function useEventDetail(eventId: number | undefined) {
  const { getToken, expireSession } = useAuth()
  const [state, setState] = useState<DetailState>(() => ({
    detail: eventId !== undefined ? (cache.get(eventId) ?? null) : null,
    loading: eventId !== undefined && !cache.has(eventId),
    error: null,
  }))
  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(
    async (id: number, background: boolean) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      if (!background) setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const raw = await apiGet<RawEventDetail>(
          `/events/${id}`,
          getToken(),
          controller.signal,
        )
        if (controller.signal.aborted) return
        const parsed = parseEventDetail(raw)
        cache.set(id, parsed)
        setState({ detail: parsed, loading: false, error: null })
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.isUnauthorized) {
          expireSession()
          return
        }
        const message =
          cause instanceof ApiError ? cause.message : 'Could not load the event.'
        setState((prev) => ({
          ...prev,
          loading: false,
          // A failed refresh of something already on screen stays quiet; the
          // cached solution is still the best answer available.
          error: background && prev.detail !== null ? prev.error : message,
        }))
      }
    },
    [getToken, expireSession],
  )

  useEffect(() => {
    if (eventId === undefined) return
    const cached = cache.get(eventId) ?? null
    // Show whatever is cached at once, then confirm it against the server.
    const start = window.setTimeout(() => void load(eventId, cached !== null), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [eventId, load])

  return {
    ...state,
    detail: eventId !== undefined ? (state.detail ?? cache.get(eventId) ?? null) : null,
    reload: () => {
      if (eventId !== undefined) void load(eventId, false)
    },
  }
}
