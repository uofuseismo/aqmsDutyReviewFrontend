import { encodeBasicCredentials } from '../../api/basicAuth'
import { ApiError } from '../../api/client'
import { REQUEST_TIMEOUT_MS, apiUrl } from '../../api/config'

/**
 * Changes your own password.
 *
 * POST /account/password, and unlike every other call in this app
 * it authenticates with **Basic**, not the bearer token. That is the point of
 * the route: everywhere else a live token is proof enough because the worst a
 * stolen one can do is expire, but here it could set a new password and lock
 * the real user out of their own account. So the person has to present the
 * password itself, and the server reads the old password back out of that
 * same header to check the new one actually differs.
 *
 * The new password goes in the body; the current one never does.
 */
export async function changePassword(
  user: string,
  currentPassword: string,
  newPassword: string,
): Promise<string> {
  let response: Response
  try {
    response = await fetch(apiUrl('/account/password'), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encodeBasicCredentials(user, currentPassword)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      /*
        Wrapped in `data`, which is the envelope parseRequestData requires on
        every POST - the same shape apiPost sends. This call is hand-rolled
        rather than going through apiPost only because it authenticates with
        Basic instead of the bearer token, and it originally missed the
        wrapper: the server answered 400 "Body must carry a \"data\" object".
      */
      body: JSON.stringify({ data: { newPassword } }),
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new ApiError(0, 'The server timed out. Try again.')
    }
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }

  let body: { message?: string }
  try {
    body = (await response.json()) as { message?: string }
  } catch {
    body = {}
  }
  const message = typeof body.message === 'string' ? body.message : ''

  if (response.ok) return message || 'Your password has been changed.'

  /*
    A 401 here does NOT mean the session lapsed - it means the Basic
    credential was refused, i.e. the current password is wrong. Treating it
    like an expired token would throw up the lock screen and lose what the
    person had typed, for a simple typo.
  */
  if (response.status === 401) {
    throw new ApiError(401, 'That is not your current password.')
  }
  // The server applies the same policy again and answers 400 with the reason;
  // its wording is the authority, so it is shown rather than reinterpreted.
  if (response.status === 400) {
    throw new ApiError(400, message || 'That password was refused.')
  }
  throw new ApiError(
    response.status,
    message || `Could not change the password (${response.status}).`,
  )
}
