import { Badge } from '@chakra-ui/react'
import { LuLock } from 'react-icons/lu'
import { useNow } from '../../hooks/useNow'
import { Tooltip } from '../../components/ui/Tooltip'
import { formatLockAge, type EventLock } from './locks'
import { formatUtc } from './format'

/**
 * A compact "someone has this" marker for a list row.
 *
 * The age is in the tooltip rather than the badge because a row has no space
 * for it, but it is not optional information: in a real sample five of seven
 * locks were over a month old and two were over a year. A badge that says
 * only "Locked" would report a lock from March 2025 exactly like one from
 * four minutes ago.
 */
export function LockBadge({ lock }: { lock: EventLock }) {
  const now = useNow()
  const age = formatLockAge(lock.acquiredAt, new Date(now))
  const exact = lock.acquiredAt ? ` (${formatUtc(lock.acquiredAt)} UTC)` : ''
  return (
    <Tooltip content={`Locked by ${lock.user} ${age}${exact}`}>
      <Badge
        colorPalette="purple"
        variant="subtle"
        size="sm"
        aria-label={`Locked by ${lock.user} ${age}`}
      >
        <LuLock aria-hidden /> {lock.user}
      </Badge>
    </Tooltip>
  )
}
