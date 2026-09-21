import { parsePermission, type Permission } from './permissions'

/**
 * The claims aqmsDutyReviewBackend puts in a token
 * (see src/auth/jsonWebToken.cpp).
 */
export interface TokenClaims {
  /** `sub` - the authenticated user. The backend rejects a token without one. */
  user: string
  /** `iss` - always "aqmsDutyReviewBackend". */
  issuer?: string
  /** `iat`, in seconds since the epoch. */
  issuedAt?: number
  /** `exp`, in seconds since the epoch. */
  expiresAt: number
  /**
   * The `permission` claim. Absent in a token minted by createToken(user),
   * which verifies as authenticated but entitled to nothing.
   */
  permission: Permission
}

function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  // atob yields one char per byte; re-decode as UTF-8 so a non-ASCII user
  // name survives the round trip.
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Reads the claims out of a token.
 *
 * This does NOT verify the signature - it cannot, the key is server side.
 * The payload is read only to drive the UI: whose name to show, what to
 * enable, and when to stop counting. Every request is re-verified by the
 * backend, which is the sole authority on whether the token is genuine.
 */
export function decodeToken(token: string): TokenClaims {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Malformed session token: expected three segments')
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>
  } catch {
    throw new Error('Malformed session token: payload is not readable JSON')
  }

  const user = typeof payload.sub === 'string' ? payload.sub : ''
  if (!user) {
    throw new Error('Session token names no user')
  }
  if (typeof payload.exp !== 'number') {
    throw new Error('Session token carries no expiry')
  }

  return {
    user,
    issuer: typeof payload.iss === 'string' ? payload.iss : undefined,
    issuedAt: typeof payload.iat === 'number' ? payload.iat : undefined,
    expiresAt: payload.exp,
    permission: parsePermission(payload.permission),
  }
}
