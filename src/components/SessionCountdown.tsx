import { Text } from '@chakra-ui/react'
import { formatCountdown, formatCountdownWords } from '../auth/formatCountdown'
import { useSessionClock } from '../auth/useSessionClock'

/**
 * Lives inside the warning toast. It subscribes to auth itself so the toast
 * body ticks without the toast having to be torn down and recreated each
 * second.
 */
export function SessionCountdown() {
  const { secondsRemaining } = useSessionClock()
  return (
    /* The visible digits tick every second and are hidden from assistive
       tech; without an aria-label the spoken sentence would read "Your
       session ends in . Sessions cannot be renewed" - with a hole in it. */
    <Text
      fontSize="sm"
      aria-label={`Your session ends in ${formatCountdownWords(secondsRemaining)}. Sessions cannot be renewed automatically.`}
    >
      Your session ends in{' '}
      <Text
        as="span"
        fontWeight="bold"
        fontVariantNumeric="tabular-nums"
        // Deliberately hidden from assistive tech: a value announced every
        // second would make the page unusable with a screen reader. The
        // toast's title announces once, which is the part that matters.
        aria-hidden="true"
      >
        {formatCountdown(secondsRemaining)}
      </Text>
      . Sessions cannot be renewed automatically.
    </Text>
  )
}
