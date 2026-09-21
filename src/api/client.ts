import { REQUEST_TIMEOUT_MS, apiUrl } from './config'

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never got an answer. */
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }

  /**
   * The token was refused. The session is over regardless of what the local
   * countdown believes - a clock that disagrees with the server, or a token
   * revoked early, both land here.
   */
  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

interface ApiEnvelope<T> {
  message?: string
  data?: T
}

/**
 * A GET against the API, carrying the session token.
 *
 * Every route but /auth/login is behind bearer auth and answers in the same
 * {"message": ..., "data": ...} envelope, so unwrapping belongs here rather
 * than in each caller.
 */
/**
 * A POST against the API, carrying the session token.
 *
 * The body is wrapped in `data` because that is the envelope the backend's
 * parseRequestData expects on the way in, mirroring the one it answers with.
 */
export async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
  token: string | null,
  signal?: AbortSignal,
): Promise<T> {
  if (!token) throw new ApiError(401, 'Not signed in.')

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ data: body }),
      credentials: 'omit',
      cache: 'no-store',
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new ApiError(0, 'The server timed out. Try again.')
    }
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }

  let envelope: ApiEnvelope<T>
  try {
    envelope = (await response.json()) as ApiEnvelope<T>
  } catch {
    envelope = {}
  }
  const message = typeof envelope.message === 'string' ? envelope.message : ''

  if (!response.ok) {
    if (response.status === 401) throw new ApiError(401, message || 'Your session is no longer valid.')
    if (response.status === 403) throw new ApiError(403, message || 'Your account may not do that.')
    // 400 carries the server's own explanation - the permission wording, the
    // name already taken, the last administrator - and it is better than
    // anything this layer could invent.
    throw new ApiError(response.status, message || `The server returned an error (${response.status}).`)
  }
  return { ...(envelope.data ?? {}), message } as T
}

export async function apiGet<T>(
  path: string,
  token: string | null,
  signal?: AbortSignal,
): Promise<T> {
  if (!token) {
    throw new ApiError(401, 'Not signed in.')
  }

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    // An aborted request is the caller withdrawing interest, not a failure;
    // let it propagate untouched so callers can ignore it.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new ApiError(0, 'The server timed out. Try again.')
    }
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }

  let body: ApiEnvelope<T>
  try {
    body = (await response.json()) as ApiEnvelope<T>
  } catch {
    body = {}
  }

  if (!response.ok) {
    const message = typeof body.message === 'string' ? body.message : ''
    if (response.status === 401) {
      throw new ApiError(401, message || 'Your session is no longer valid.')
    }
    if (response.status === 403) {
      throw new ApiError(403, message || 'Your account may not do that.')
    }
    throw new ApiError(
      response.status,
      message || `The server returned an error (${response.status}).`,
    )
  }

  if (body.data === undefined) {
    throw new ApiError(response.status, 'The server returned no data.')
  }
  return body.data
}
