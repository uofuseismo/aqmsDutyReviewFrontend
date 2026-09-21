export type AuthErrorKind =
  | 'invalid_credentials'
  | 'bad_request'
  | 'server_error'
  | 'network'
  | 'timeout'
  | 'malformed_response'

export class AuthError extends Error {
  readonly kind: AuthErrorKind

  constructor(kind: AuthErrorKind, message: string) {
    super(message)
    this.name = 'AuthError'
    this.kind = kind
  }
}

/**
 * Whether the message is safe to show verbatim next to the password field.
 * The backend deliberately does not say whether the user name or the
 * password was wrong - that distinction is what lets someone enumerate
 * accounts - so its 401 text is fine to surface as-is.
 */
export function isCredentialProblem(error: unknown): boolean {
  return error instanceof AuthError && error.kind === 'invalid_credentials'
}
