import { apiGet } from '../../api/client'

/**
 * The rules the server will apply, fetched so the client can say them out
 * loud while somebody types instead of after they submit.
 *
 * The server re-checks all of this on the way in - `passwordPolicyProblem` -
 * so what happens here is courtesy, not enforcement. If the policy grows a
 * rule this build has never heard of, the server still refuses and its
 * message is what gets shown.
 */
export interface PasswordPolicy {
  minimumLength: number
  requiresNumber: boolean
  requiresSpecialCharacter: boolean
  newAndOldPasswordMustBeDifferent: boolean
}

export function fetchPasswordPolicy(token: string | null, signal?: AbortSignal) {
  return apiGet<PasswordPolicy>('/app-settings/password-requirements', token, signal)
}

/**
 * Length as the server measures it: UTF-8 BYTES, not JavaScript characters.
 *
 * The backend compares `password.size()`, and its comment is explicit that
 * this is bytes and that the difference is deliberate - a multi-byte
 * character counts as more than one, so nothing shorter than the minimum
 * slips through. Counting `password.length` here would disagree with the
 * server for any non-ASCII password and show a tick next to a rule the
 * server is about to reject.
 */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length
}

/** Matches the server's per-byte isDigit. */
function hasDigit(password: string): boolean {
  return /[0-9]/.test(password)
}

/**
 * Matches the server's rule, which is "not every byte is alphanumeric"
 * rather than a list of blessed punctuation. Anything that is not an ASCII
 * letter or digit counts - including accented letters, which the server's
 * ASCII isAlphanumeric also treats as special.
 */
function hasSpecial(password: string): boolean {
  return /[^A-Za-z0-9]/.test(password)
}

export interface PasswordRule {
  id: string
  label: string
  satisfied: boolean
}

/**
 * The live checklist. Every applicable rule is returned whether or not it is
 * met, so the list does not jump around as items are satisfied - it ticks in
 * place.
 */
export function evaluatePassword(
  next: string,
  current: string,
  policy: PasswordPolicy | null,
): PasswordRule[] {
  if (policy === null) return []
  const rules: PasswordRule[] = [
    {
      id: 'length',
      label: `At least ${policy.minimumLength} characters`,
      satisfied: passwordByteLength(next) >= policy.minimumLength,
    },
  ]
  if (policy.requiresNumber) {
    rules.push({ id: 'number', label: 'Contains a number', satisfied: hasDigit(next) })
  }
  if (policy.requiresSpecialCharacter) {
    rules.push({
      id: 'special',
      label: 'Contains a special character',
      satisfied: hasSpecial(next),
    })
  }
  if (policy.newAndOldPasswordMustBeDifferent) {
    rules.push({
      id: 'different',
      label: 'Differs from your current password',
      // An empty box is not yet a match; do not accuse someone of reusing a
      // password before they have typed one.
      satisfied: next.length > 0 && next !== current,
    })
  }
  return rules
}
