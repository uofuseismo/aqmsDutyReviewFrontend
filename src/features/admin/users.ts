import { apiGet } from '../../api/client'

/**
 * A row from /users (administrator only).
 *
 * Field names come from the backend's DRP serializer. The timestamps are
 * optional because an account that has never been signed into has no
 * lastLogin, and only a provisional account has a provisionalUntil.
 */
export interface DrpUser {
  name: string
  permission: string
  /**
   * ISO-8601 with a Z suffix, e.g. "2026-09-02T20:53:53Z".
   *
   * Note this is a different convention from the event catalog, which quotes
   * nanoseconds since the epoch as a number. Two stores, two serializers -
   * do not assume one from the other.
   */
  created?: string
  lastLogin?: string
  passwordUpdated?: string
  provisionalUntil?: string
}

/**
 * Parses one of the ISO-8601 timestamps above.
 *
 * Returns null rather than an Invalid Date for anything missing or
 * unparseable, so a single odd record shows an em dash instead of the string
 * "Invalid Date" in the middle of the table.
 */
export function parseTimestamp(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function listUsers(token: string | null, signal?: AbortSignal) {
  return apiGet<DrpUser[]>('/users', token, signal)
}
