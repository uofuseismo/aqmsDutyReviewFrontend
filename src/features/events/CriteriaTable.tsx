import { HStack, Icon, Stack, Table, Text } from '@chakra-ui/react'
import { LuCheck, LuMinus, LuTriangleAlert, LuX } from 'react-icons/lu'
import type { Criterion } from './autoAccept'

/**
 * The auto-accept rules again, laid out to be read rather than glanced at.
 *
 * The bar on the Location and Magnitude steps is for working: it sits beside
 * the thing being judged and says pass or fail in one row. This is for
 * deciding, and the reviewer is about to commit, so the threshold each value
 * was measured against is written out instead of hidden in a tooltip - the
 * Summary is the one screen where nobody should have to hover to find out
 * why something is marked wrong.
 *
 * Same `Criterion` objects, so the two can never disagree about a verdict.
 */
export function CriteriaTable({
  groups,
}: {
  groups: { title: string; criteria: Criterion[] }[]
}) {
  const shown = groups.filter((group) => group.criteria.length > 0)
  if (shown.length === 0) return null

  return (
    <Table.Root size="sm">
      <Table.Body>
        {shown.map((group) => (
          <Group key={group.title} title={group.title} criteria={group.criteria} />
        ))}
      </Table.Body>
    </Table.Root>
  )
}

function Group({ title, criteria }: { title: string; criteria: Criterion[] }) {
  return (
    <>
      <Table.Row>
        <Table.Cell colSpan={3} borderBottomWidth="0" pb="0" pt="3">
          <Text
            fontSize="2xs"
            color="fg.muted"
            textTransform="uppercase"
            letterSpacing="wide"
          >
            {title}
          </Text>
        </Table.Cell>
      </Table.Row>
      {criteria.map((criterion) => (
        <Row key={criterion.id} criterion={criterion} />
      ))}
    </>
  )
}

const MARK = {
  pass: { icon: <LuCheck />, color: undefined as string | undefined },
  warn: { icon: <LuTriangleAlert />, color: 'warningText' },
  fail: { icon: <LuX />, color: 'attentionText' },
  unknown: { icon: <LuMinus />, color: undefined as string | undefined },
} as const

function Row({ criterion }: { criterion: Criterion }) {
  const mark = MARK[criterion.verdict]
  return (
    <Table.Row>
      <Table.Cell width="1" pr="3">
        <Icon
          size="sm"
          color={mark.color ?? 'fg.muted'}
          aria-label={`${criterion.label} ${criterion.value ?? 'not reported'}. ${criterion.tip}`}
        >
          {mark.icon}
        </Icon>
      </Table.Cell>
      <Table.Cell>
        <Stack gap="0">
          <Text fontSize="sm">{criterion.label}</Text>
          {/* The rule, spelled out. On the bar this is the tooltip; here it is
              the point of the row. */}
          <Text fontSize="xs" color={mark.color ?? 'fg.muted'}>
            {criterion.tip}
          </Text>
        </Stack>
      </Table.Cell>
      <Table.Cell textAlign="end" whiteSpace="nowrap">
        <HStack gap="1" justify="flex-end">
          <Text
            fontSize="sm"
            fontWeight={criterion.verdict === 'pass' || criterion.verdict === 'unknown' ? 'medium' : 'semibold'}
            color={mark.color}
            fontVariantNumeric="tabular-nums"
          >
            {criterion.value ?? '—'}
          </Text>
        </HStack>
      </Table.Cell>
    </Table.Row>
  )
}
