import { createContext } from 'react'
import type { Permission } from './permissions'

export interface Session {
  /** The raw JWT. Held in memory only - never written to storage. */
  token: string
  user: string
  permission: Permission
  /** Local wall-clock time the token was received. */
  receivedAtMs: number
  /**
   * When the app stops treating the session as usable. This is deliberately a
   * little earlier than the server's own deadline - see
   * EXPIRY_SAFETY_MARGIN_MS - so a request is never sent with a token the
   * backend has already stopped accepting.
   */
  expiresAtMs: number
  /** When the backend itself stops accepting the token. Always >= expiresAtMs. */
  serverExpiresAtMs: number
  /** The effective (buffered) lifetime the countdown runs against. */
  lifetimeMs: number
}

/**
 * `expired` is distinct from `anonymous`: the token is gone either way, but
 * an expired session still remembers who was using it, so the lock screen can
 * ask only for a password and the view behind it can stay on screen.
 */
export type AuthStatus = 'anonymous' | 'active' | 'expired'

/**
 * Everything about the session that does NOT change on a timer.
 *
 * Deliberately separate from the countdown below. When the two lived in one
 * context, the per-second tick gave every function in it a new identity, and
 * anything that listed one in a dependency array re-ran once a second - which
 * had the catalog re-fetching 273 KB every second and never settling. Keeping
 * this value stable between real session transitions is a correctness
 * property, not a micro-optimisation.
 */
export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  /** The current user, or the one whose session just lapsed. */
  user: string | null
  permission: Permission
  signIn: (user: string, password: string) => Promise<void>
  signOut: () => void
  /** UI affordance only - the backend re-checks every request. */
  can: (required: Permission) => boolean
  /**
   * Ends the session now, as if the countdown had run out.
   *
   * Called when the server refuses the token (401). The local clock is only
   * ever an estimate of the server's - a token revoked early, or a deadline
   * we misjudged, shows up here - and the server's answer wins.
   */
  expireSession: () => void
  /** Current token for outbound Authorization headers, or null. */
  getToken: () => string | null
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * The parts that change every second. Only the countdown display, the warning
 * toast and the lock should subscribe to this.
 */
export interface SessionClockValue {
  /** Whole seconds left on the session; 0 when not active. */
  secondsRemaining: number
  /** True once inside the warning window and still active. */
  isExpiring: boolean
}

export const SessionClockContext = createContext<SessionClockValue | null>(null)
