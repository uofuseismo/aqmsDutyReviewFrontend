import { Alert, Text } from '@chakra-ui/react'
import { useNow } from '../../hooks/useNow'
import { formatLockAge, type EventLock } from './locks'
import { formatUtc } from './format'

/**
 * The lock, stated plainly above a review.
 *
 * Deliberately not a blocking dialog. The lock is advisory - AQMS does not
 * enforce it and neither does this app - and a modal over an event somebody
 * abandoned eleven months ago would be worse than useless.
 *
 * Freshness decides the tone. A lock taken within a shift means a colleague
 * is probably in this event right now; an old one is almost certainly a row
 * nobody cleaned up, and dressing it as a warning is how people learn to
 * ignore the warnings that matter.
 */
export function LockNotice({
  lock,
  staleAfterHours = 12,
}: {
  lock: EventLock
  staleAfterHours?: number
}) {
  const now = useNow()
  const ageMs = lock.acquiredAt ? now - lock.acquiredAt.getTime() : Number.NaN
  const stale = Number.isNaN(ageMs) || ageMs > staleAfterHours * 3600 * 1000
  const age = formatLockAge(lock.acquiredAt, new Date(now))

  return (
    <Alert.Root status={stale ? 'neutral' : 'warning'} size="sm">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {stale
            ? `Held by ${lock.user}, ${age}`
            : `${lock.user} is working on this event`}
        </Alert.Title>
        <Alert.Description>
          <Text fontSize="sm">
            {stale
              ? 'This lock is old enough that it was most likely left open rather than being actively worked. Check before assuming it is free.'
              : `Locked ${age}. Check with them before making changes.`}
            {lock.acquiredAt && ` (${formatUtc(lock.acquiredAt)} UTC)`}
          </Text>
        </Alert.Description>
      </Alert.Content>
    </Alert.Root>
  )
}
