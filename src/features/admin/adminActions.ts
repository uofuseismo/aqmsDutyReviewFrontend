import { apiPost } from '../../api/client'
import type { AssignablePermission } from '../../auth/permissions'

/**
 * Creates an account.
 *
 * The server generates a temporary password unless one is supplied, and
 * returns whichever it used. That value is the whole point of the response:
 * it is deliberately kept out of the logs, so this is the one place it
 * legibly exists and the administrator has to pass it on out of band.
 */
export interface AddedUser {
  user: string
  temporaryPassword: string
  message: string
}

/**
 * Gives an account a new temporary password.
 *
 * For the case the self-service change cannot cover: somebody who has
 * forgotten the current password cannot supply it, so they cannot change it.
 *
 * The password is GENERATED, never chosen - the route does not accept one.
 * A reset hands the administrator a credential belonging to someone else, so
 * it had better be one that expires and that they did not pick. The reply is
 * the same shape as adding a user, and for the same reason: the value is kept
 * out of the server's logs, so this response is the only place it legibly
 * exists.
 *
 * Deliberately NOT delete-and-recreate. That would drop the account's keys,
 * lose its permission level, leave the user deleted outright if the second
 * call failed, and log a removal that never conceptually happened. The
 * database does it in one statement, with the expiry applied.
 */
export function resetUserPassword(user: string, token: string | null) {
  return apiPost<AddedUser>('/users/reset-password', { user }, token)
}

export function addProvisionalUser(
  user: string,
  permission: AssignablePermission,
  token: string | null,
) {
  return apiPost<AddedUser>(
    '/users/add',
    { user, permission },
    token,
  )
}

export function setUserPermission(
  user: string,
  permission: AssignablePermission,
  token: string | null,
) {
  return apiPost<{ message: string }>(
    '/users/permission',
    { user, permission },
    token,
  )
}

/**
 * Deletes an account and its keys.
 *
 * Removing the last administrator is refused by the database, not by this
 * call - the UI hides the option to avoid offering a doomed action, but the
 * refusal underneath is the real guard and survives two administrators
 * deleting each other from different sessions at the same moment.
 */
export function removeUser(user: string, token: string | null) {
  return apiPost<{ message: string }>('/users/remove', { user }, token)
}
