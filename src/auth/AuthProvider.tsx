import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AuthContext,
  SessionClockContext,
  type AuthContextValue,
  type Session,
  type SessionClockValue,
} from './authContext'
import { decodeToken } from './jwt'
import { login as loginRequest } from './loginApi'
import { satisfies, type Permission } from './permissions'
import { computeSessionWindow, warningWindowSeconds } from './sessionWindow'

interface LapsedSession {
  user: string
  permission: Permission
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  /**
   * Retained across expiry so the lock screen knows whose password to ask for
   * and the app behind it can keep rendering instead of flickering into a
   * signed-out state. `can()` still denies everything - this is for display.
   */
  const [lapsed, setLapsed] = useState<LapsedSession | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  /**
   * Mirrors the live token so outbound requests can read it without every
   * caller subscribing to auth re-renders.
   */
  const tokenRef = useRef<string | null>(null)
  /** Lets expireSession read the live session without re-creating itself. */
  const sessionRef = useRef<Session | null>(null)
  useEffect(() => {
    tokenRef.current = session?.token ?? null
    sessionRef.current = session
  }, [session])

  // Drives the visible countdown. Unmounts itself when the session ends.
  useEffect(() => {
    if (session === null) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [session])

  /**
   * Expiry is driven by a timer aimed at the deadline rather than by watching
   * the countdown reach zero, so it does not depend on the tick still running
   * at the right moment.
   *
   * Timers are unreliable across sleep and in background tabs - they get
   * throttled to roughly once a minute, and a suspended machine runs none at
   * all - so the deadline is also re-checked (and the timer re-aimed) every
   * time the tab is looked at again. Without that, a tab restored after lunch
   * would show time still on the clock for a session that ended long ago.
   */
  useEffect(() => {
    if (session === null) return

    const expire = () => {
      setLapsed({ user: session.user, permission: session.permission })
      setSession(null)
    }

    let timeoutId = 0
    const schedule = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(
        expire,
        Math.max(0, session.expiresAtMs - Date.now()),
      )
    }

    const resync = () => {
      setNowMs(Date.now())
      schedule()
    }

    schedule()
    // visibilitychange is dispatched at the document, not the window.
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    window.addEventListener('pageshow', resync)

    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
      window.removeEventListener('pageshow', resync)
    }
  }, [session])

  const signIn = useCallback(async (user: string, password: string) => {
    const token = await loginRequest(user, password)
    const claims = decodeToken(token)
    const receivedAtMs = Date.now()

    const expiry = computeSessionWindow(claims, receivedAtMs)

    // Set eagerly as well as in the effect, so a request fired immediately
    // after signIn resolves does not race the effect flush.
    tokenRef.current = token

    setSession({
      token,
      user: claims.user,
      permission: claims.permission,
      receivedAtMs,
      ...expiry,
    })
    setLapsed(null)
    setNowMs(receivedAtMs)
  }, [])

  const expireSession = useCallback(() => {
    const current = sessionRef.current
    if (current === null) return
    tokenRef.current = null
    setLapsed({ user: current.user, permission: current.permission })
    setSession(null)
  }, [])

  const signOut = useCallback(() => {
    tokenRef.current = null
    setSession(null)
    setLapsed(null)
  }, [])

  /** Stable across the per-second tick - see AuthContextValue's note. */
  const getToken = useCallback(() => tokenRef.current, [])

  const value = useMemo<AuthContextValue>(() => {
    const status =
      session !== null ? 'active' : lapsed !== null ? 'expired' : 'anonymous'
    return {
      status,
      session,
      user: session?.user ?? lapsed?.user ?? null,
      permission: session?.permission ?? lapsed?.permission ?? 'none',
      signIn,
      signOut,
      can: (required: Permission) =>
        session !== null && satisfies(session.permission, required),
      expireSession,
      getToken,
    }
  }, [session, lapsed, signIn, signOut, expireSession, getToken])

  const clock = useMemo<SessionClockValue>(() => {
    const secondsRemaining =
      session === null
        ? 0
        : Math.max(0, Math.ceil((session.expiresAtMs - nowMs) / 1000))
    return {
      secondsRemaining,
      isExpiring:
        session !== null &&
        secondsRemaining <= warningWindowSeconds(session.lifetimeMs),
    }
  }, [session, nowMs])

  return (
    <AuthContext.Provider value={value}>
      <SessionClockContext.Provider value={clock}>
        {children}
      </SessionClockContext.Provider>
    </AuthContext.Provider>
  )
}
