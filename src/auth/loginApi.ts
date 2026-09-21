import { encodeBasicCredentials } from '../api/basicAuth'
import { REQUEST_TIMEOUT_MS, apiUrl } from '../api/config'
import { AuthError } from './authError'

interface LoginResponseBody {
  message?: string
  data?: { jwt?: string }
}

/**
 * Trades a user name and password for a session token.
 *
 * GET /auth/login with an Authorization: Basic header. On success the
 * backend answers 200 with {"message": "...", "data": {"jwt": "..."}}.
 *
 * There is no refresh path by design: the backend explicitly refuses to mint
 * a token from a bearer token, so an expiring session cannot renew itself
 * without the password being presented again.
 */
export async function login(user: string, password: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(apiUrl('/auth/login'), {
      method: 'GET',
      headers: {
        Authorization: `Basic ${encodeBasicCredentials(user, password)}`,
        Accept: 'application/json',
        // Marks this as a scripted request. Browsers suppress the native
        // Basic-auth dialog when the request already carries an
        // Authorization header, and this is the conventional second signal
        // for a proxy or backend that wants to withhold the
        // WWW-Authenticate challenge from XHR.
        'X-Requested-With': 'XMLHttpRequest',
      },
      // No cookies are involved; the token is the whole session.
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new AuthError(
        'timeout',
        'The server timed out. Try again.',
      )
    }
    throw new AuthError(
      'network',
      'Cannot reach the server. Check your connection.',
    )
  }

  // The body is JSON on every documented status, but a proxy failing between
  // the browser and the backend will serve its own HTML error page, so a
  // parse failure here is expected rather than exceptional.
  let body: LoginResponseBody
  try {
    body = (await response.json()) as LoginResponseBody
  } catch {
    body = {}
  }

  if (response.ok) {
    const jwt = body.data?.jwt
    if (typeof jwt !== 'string' || jwt.length === 0) {
      throw new AuthError(
        'malformed_response',
        'The server returned no session token.',
      )
    }
    return jwt
  }

  const serverMessage = typeof body.message === 'string' ? body.message : ''

  if (response.status === 401) {
    throw new AuthError(
      'invalid_credentials',
      // Deliberately not the server's own wording here: it says the same
      // thing at twice the length, and this one has to fit a phone.
      'Incorrect user name or password.',
    )
  }
  if (response.status === 400) {
    throw new AuthError(
      'bad_request',
      serverMessage || 'The server could not read the request.',
    )
  }
  if (response.status >= 500) {
    throw new AuthError(
      'server_error',
      serverMessage || 'Server error - try again in a bit.',
    )
  }
  throw new AuthError(
    'server_error',
    serverMessage || `Unexpected response from the server (${response.status}).`,
  )
}
