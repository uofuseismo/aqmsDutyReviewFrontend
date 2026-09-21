/**
 * Base64 of "user:password" for the Basic scheme.
 *
 * btoa alone throws on any character above U+00FF, so a password with a
 * non-Latin-1 character in it would fail at the keyboard rather than at the
 * server. Encoding to UTF-8 bytes first is what RFC 7617 expects, and the
 * backend base64-decodes then splits on ':', so it reads back correctly.
 *
 * Shared by login and by the change-password route, which deliberately wants
 * the password itself rather than the bearer token.
 */
export function encodeBasicCredentials(user: string, password: string): string {
  const bytes = new TextEncoder().encode(`${user}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
