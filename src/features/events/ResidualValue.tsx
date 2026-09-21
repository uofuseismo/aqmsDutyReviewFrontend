import { HStack, Icon, Text } from '@chakra-ui/react'
import { LuTriangleAlert, LuCircleAlert } from 'react-icons/lu'
import { Tooltip } from '../../components/ui/Tooltip'
import type { ResidualLevel } from './eventDetail'

/**
 * A residual, coloured by how far out it is.
 *
 * Three steps, because the analysts asked for the middle one: plain when it
 * is fine, orange when it is worth a look, red when something is wrong. The
 * icon differs too - colour alone would leave the distinction invisible to
 * anyone who cannot separate orange from red, which is the commonest form of
 * colour blindness there is.
 *
 * The tooltip and the aria-label both name the threshold that was crossed,
 * so the number is never just "red" with no reason attached.
 */
export function ResidualValue({
  level,
  value,
  unit,
  thresholds,
}: {
  level: ResidualLevel
  /** Already formatted, with its sign. */
  value: string
  /** "s" or "" - what the threshold is measured in. */
  unit: string
  thresholds: { warning: number; alert: number }
}) {
  if (level === 'ok') {
    return (
      <Text as="span" fontVariantNumeric="tabular-nums">
        {value}
      </Text>
    )
  }
  const crossed = level === 'alert' ? thresholds.alert : thresholds.warning
  const wording =
    level === 'alert'
      ? `Over the ±${thresholds.alert}${unit} alert threshold`
      : `Over the ±${thresholds.warning}${unit} warning threshold`
  return (
    <Tooltip content={wording}>
      <HStack
        gap="1"
        justify="flex-end"
        color={level === 'alert' ? 'attentionText' : 'warningText'}
        fontWeight="semibold"
      >
        <Icon size="xs" aria-hidden>
          {level === 'alert' ? <LuCircleAlert /> : <LuTriangleAlert />}
        </Icon>
        <Text
          as="span"
          fontVariantNumeric="tabular-nums"
          aria-label={`Residual ${value}${unit}, over the ${crossed}${unit} ${level} threshold`}
        >
          {value}
        </Text>
      </HStack>
    </Tooltip>
  )
}
