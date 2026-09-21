import { AuthError } from './authError'
import type { TokenClaims } from './jwt'

/**
 * How long before expiry to start warning. Two minutes is a real chance to
 * finish a thought without the banner living on screen for most of a short
 * session.
 */
export const WARNING_WINDOW_SECONDS = 120

/**
 * How far ahead of the server's deadline to lock the session.
 *
 * The token dies at a fixed instant on the server. Network latency, a request
 * already in flight, and a timer that fired a moment late all push toward the
 * app still believing a token is good after the backend has stopped taking
 * it - which surfaces as a confusing 401 mid-action rather than an honest
 * lock screen. Retiring the token a few seconds early trades a sliver of
 * session for never being in that state: a 30 minute token locks at 29:45.
 */
export const EXPIRY_SAFETY_MARGIN_MS = 15_000

export interface SessionWindow {
  /** When the app stops treating the session as usable. */
  expiresAtMs: number
  /** When the backend itself stops accepting the token. Always later. */
  serverExpiresAtMs: number
  /** The effective (buffered) lifetime the countdown runs against. */
  lifetimeMs: number
}

/**
 * Works out how long a freshly issued token is good for.
 *
 * Kept free of React so the arithmetic - which decides when a reviewer gets
 * locked out mid-event - can be exercised directly.
 *
 * @param receivedAtMs local wall-clock time the token arrived
 */
export function computeSessionWindow(
  claims: TokenClaims,
  receivedAtMs: number,
): SessionWindow {
  /**
   * The lifetime is a DURATION taken from the token's own iat->exp span, not
   * a comparison of `exp` against the local clock. A browser whose clock is
   * off by minutes - laptops waking from sleep, phones that have never
   * synced - would otherwise be handed a session that looks half spent, or
   * already dead, the instant it is issued. The device clock is not trusted
   * for anything here; only elapsed time since login is.
   *
   * The iat-less fallback is the one case forced to consult the local clock,
   * because a lone `exp` means nothing without a reference point. Every token
   * this backend mints carries `iat`, so it should not be reached.
   */
  const serverLifetimeMs =
    claims.issuedAt !== undefined
      ? (claims.expiresAt - claims.issuedAt) * 1000
      : claims.expiresAt * 1000 - receivedAtMs

  if (serverLifetimeMs <= 0) {
    throw new AuthError(
      'malformed_response',
      'The server issued an expired session.',
    )
  }

  /**
   * Scaled down for tokens shorter than the margin was written for, so a
   * backend configured with, say, a 20 second lifetime still yields a usable
   * session rather than one that is over before it starts.
   */
  const safetyMarginMs = Math.min(EXPIRY_SAFETY_MARGIN_MS, serverLifetimeMs / 4)
  const lifetimeMs = serverLifetimeMs - safetyMarginMs

  return {
    lifetimeMs,
    expiresAtMs: receivedAtMs + lifetimeMs,
    serverExpiresAtMs: receivedAtMs + serverLifetimeMs,
  }
}

/**
 * How many seconds before the (buffered) deadline to start warning, clamped
 * so a very short session is not in a permanent warning state from login.
 */
export function warningWindowSeconds(lifetimeMs: number): number {
  return Math.min(WARNING_WINDOW_SECONDS, Math.floor(lifetimeMs / 2000))
}
