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

/** At most one focus-driven re-check this often. */
const FOCUS_RECHECK_MS = 5_000

interface DetailState {
  detail: EventDetail | null
  loading: boolean
  error: string | null
  /**
   * The event whose first fetch on this visit has come back - with an answer
   * or an error. Until then, `detail` may be the cached copy from an earlier
   * visit, shown while the server is asked.
   */
  settledId?: number
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
        setState({ detail: parsed, loading: false, error: null, settledId: id })
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
          // Settled even so: if the server cannot be reached, the cached
          // copy IS what the analyst goes on looking at.
          settledId: id,
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

  /*
    Re-check when the analyst comes back to this window.

    The workflow this exists for: open an event here, leave to repick it in
    the processing tool, save, come back to accept. That save makes a new
    preferred origin, and without this the screen goes on showing the old one
    until the page is reopened.

    Focus as well as visibilitychange: the processing tool is a separate
    application, and switching to it often leaves this window "visible" -
    only focus says the analyst has come back. Throttled, because focus
    fires on every click back into the window, and one event's detail
    every few seconds is plenty.
  */
  const lastCheck = useRef(0)
  useEffect(() => {
    if (eventId === undefined) return
    const recheck = () => {
      if (document.hidden) return
      const now = Date.now()
      if (now - lastCheck.current < FOCUS_RECHECK_MS) return
      lastCheck.current = now
      if (cache.has(eventId)) void load(eventId, true)
    }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [eventId, load])

  return {
    ...state,
    detail: eventId !== undefined ? (state.detail ?? cache.get(eventId) ?? null) : null,
    reload: () => {
      if (eventId !== undefined) void load(eventId, false)
    },
    /**
     * Whether `detail` is what the analyst is actually looking at on this
     * visit, rather than a cached copy about to be replaced. Anything that
     * compares "now" against "when they opened it" must wait for this.
     */
    settled: eventId !== undefined && state.settledId === eventId,
    /** Confirm against the server without blanking what is on screen. */
    revalidate: () => {
      if (eventId !== undefined && cache.has(eventId)) void load(eventId, true)
    },
  }
}
