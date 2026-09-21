import { Text } from '@chakra-ui/react'
import { Tooltip } from '../../components/ui/Tooltip'

export type GeometrySource = 'reported' | 'computed' | 'unknown'

/**
 * A distance or azimuth, which may be reported, computed here, or unknown.
 *
 * A computed value looks the same as a reported one - it is close enough to
 * be used the same way - but says so on hover, so anyone comparing against
 * another tool can find out why the last decimal disagrees.
 */
export function GeometryValue({
  value,
  source,
  format,
}: {
  value: number | undefined
  source: GeometrySource
  format: (value: number) => string
}) {
  if (value === undefined) {
    return (
      <Tooltip content="No geometry supplied, and this station is not in the station list">
        <Text as="span" color="fg.muted">
          —
        </Text>
      </Tooltip>
    )
  }
  if (source !== 'computed') {
    return <Text as="span" fontVariantNumeric="tabular-nums">{format(value)}</Text>
  }
  return (
    <Tooltip content="Computed from the origin and the station's position - not supplied by the database">
      <Text
        as="span"
        fontVariantNumeric="tabular-nums"
        // A hint, not a warning: the value is good, its provenance is just
        // worth being able to discover.
        borderBottomWidth="1px"
        borderBottomStyle="dotted"
        borderColor="fg.muted"
      >
        {format(value)}
      </Text>
    </Tooltip>
  )
}

