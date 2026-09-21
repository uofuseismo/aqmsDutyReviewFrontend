import { HStack, Icon, Text } from '@chakra-ui/react'
import { LuCheck, LuMinus, LuTriangleAlert, LuX } from 'react-icons/lu'
import { Tooltip } from '../../components/ui/Tooltip'
import type { Criterion } from './autoAccept'

/**
 * The auto-accept rules, one line, with a mark against each.
 *
 * The same bar serves the Location step and the Magnitude step: both are
 * asking the same question - would this have been accepted without me? - and
 * a reviewer should not have to learn two layouts to read the answer.
 *
 * The rules do not fit on screen and nobody wants a paragraph, so each
 * criterion carries its own tooltip: the threshold, the measured value, and
 * on a failure the reason in a sentence. What is always visible is the tick
 * or the cross, which is the part that decides whether to look closer.
 *
 * ONLY FAILURES ARE COLOURED. A green tick beside a red cross is the pair
 * most commonly indistinguishable, and pairing them here would have put that
 * exact problem on the one row a reviewer might act on at a glance. A met
 * criterion is the ordinary case and needs no emphasis; red is spent only on
 * the thing that wants attention - which is the same rule the residual
 * colours follow.
 *
 * The icon still differs from the tick, so the verdict does not depend on
 * seeing the colour at all.
 */
export function CriteriaBar({ criteria }: { criteria: Criterion[] }) {
  const shown = criteria.filter(
    (criterion) => criterion.value !== undefined || criterion.verdict !== 'unknown',
  )
  if (shown.length === 0) return null

  return (
    <HStack gap={{ base: '3', md: '5' }} wrap="wrap" fontSize="sm">
      {shown.map((criterion) => (
        <CriterionItem key={criterion.id} criterion={criterion} />
      ))}
    </HStack>
  )
}

/**
 * Muted when it passes, orange when it wants a person, red when it fails.
 *
 * The warning is not a softer failure - it is a different statement. A large
 * local magnitude says "a human has to do this one", which can be true of a
 * flawless solution, so it must not read as though something is wrong with
 * the numbers.
 */
const LOOK = {
  pass: { color: undefined as string | undefined, icon: <LuCheck />, muted: true },
  warn: { color: 'warningText', icon: <LuTriangleAlert />, muted: false },
  fail: { color: 'attentionText', icon: <LuX />, muted: false },
  unknown: { color: undefined as string | undefined, icon: <LuMinus />, muted: true },
} as const

function CriterionItem({ criterion }: { criterion: Criterion }) {
  const { verdict, label, value, tip } = criterion
  const look = LOOK[verdict]

  return (
    <Tooltip content={tip}>
      <HStack gap="1.5">
        <Text fontSize="2xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
          {label}
        </Text>
        <Text
          fontWeight={look.muted ? 'medium' : 'semibold'}
          color={look.color}
          fontVariantNumeric="tabular-nums"
        >
          {value ?? '—'}
        </Text>
        <Icon
          size="sm"
          color={look.color ?? 'fg.muted'}
          /* The verdict is spelled out for a screen reader: an icon named
             "check" says nothing about which rule it belongs to. */
          aria-label={`${label} ${value ?? 'not reported'}. ${tip}`}
        >
          {look.icon}
        </Icon>
      </HStack>
    </Tooltip>
  )
}
