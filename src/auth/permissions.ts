/**
 * The permission levels the backend mints into the `permission` claim.
 * The strings are exactly what IAuthenticator::permissionsToString emits
 * (src/auth/authenticator.cpp) and what the database's users.permission
 * column stores, so token, table and UI all agree on spelling.
 */
export type Permission = 'none' | 'read_only' | 'read_write' | 'admin'

const RANK: Record<Permission, number> = {
  none: 0,
  read_only: 1,
  read_write: 2,
  admin: 3,
}

export function parsePermission(value: unknown): Permission {
  if (typeof value !== 'string') return 'none'
  const normalized = value.trim().toLowerCase()
  return normalized in RANK ? (normalized as Permission) : 'none'
}

/**
 * The client-side twin of IAuthenticator::satisfies. The levels are ranked,
 * not independent: admin implies read_write implies read_only.
 *
 * `none` satisfies nothing - not even a requirement of `none` - because a
 * user with no permissions may do nothing at all. Keep this in step with the
 * C++ side and the database's user_has_permission if the ordering ever moves.
 *
 * This is a UI affordance only. It decides what to disable or hide; the
 * backend re-checks every request and is the actual authority.
 */
export function satisfies(held: Permission, required: Permission): boolean {
  if (held === 'none' || required === 'none') return false
  return RANK[held] >= RANK[required]
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  none: 'No permissions',
  read_only: 'Read',
  read_write: 'Read-Write',
  admin: 'Administrator',
}

/**
 * The levels an administrator may assign, in ascending order.
 *
 * `none` is absent on purpose: it is a state a token can be in, not a level
 * anyone is given. The backend agrees - add-provisional-user and
 * set-user-permission both reject anything outside these three.
 */
export const ASSIGNABLE_PERMISSIONS = ['read_only', 'read_write', 'admin'] as const
export type AssignablePermission = (typeof ASSIGNABLE_PERMISSIONS)[number]
