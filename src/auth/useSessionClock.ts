import { useContext } from 'react'
import { SessionClockContext, type SessionClockValue } from './authContext'

/**
 * The ticking part of the session. Subscribing re-renders once a second, so
 * use it only where the seconds are actually shown or acted on.
 */
export function useSessionClock(): SessionClockValue {
  const value = useContext(SessionClockContext)
  if (value === null) {
    throw new Error('useSessionClock must be used within an <AuthProvider>')
  }
  return value
}
