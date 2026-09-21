import { Select, createListCollection } from '@chakra-ui/react'
import { Tooltip } from '../../components/ui/Tooltip'
import { useMemo } from 'react'
import {
  ASSIGNABLE_PERMISSIONS,
  PERMISSION_LABELS,
  type AssignablePermission,
} from '../../auth/permissions'
import { PermissionBadge } from '../../components/PermissionBadge'

/**
 * Picks an access level, showing each option as the same badge the level is
 * displayed as everywhere else.
 *
 * The badge is the point: a level is recognisable by its colour in the
 * account menu and in this table, so the control that changes it should
 * offer the same objects rather than a list of bare words.
 */
export function PermissionSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
  unavailable = [],
  unavailableReason,
}: {
  value: AssignablePermission
  onChange: (next: AssignablePermission) => void
  disabled?: boolean
  ariaLabel: string
  /** Levels this particular user may not be moved to. */
  unavailable?: readonly AssignablePermission[]
  /** Why, shown on the control so the greyed-out options are not a mystery. */
  unavailableReason?: string
}) {
  // Keyed on the contents rather than the array, which is rebuilt by the
  // caller on every render and would otherwise discard the collection each
  // time.
  const blocked = unavailable.join(',')
  const collection = useMemo(
    () =>
      createListCollection({
        items: ASSIGNABLE_PERMISSIONS.map((permission) => ({
          value: permission,
          label: PERMISSION_LABELS[permission],
        })),
        isItemDisabled: (item) => blocked.split(',').includes(item.value),
      }),
    [blocked],
  )

  const trigger = (
    <Select.Trigger
      aria-label={unavailableReason ? `${ariaLabel}. ${unavailableReason}` : ariaLabel}
    >
      <Select.ValueText>
        <PermissionBadge permission={value} />
      </Select.ValueText>
    </Select.Trigger>
  )

  return (
    <Select.Root
      collection={collection}
      value={[value]}
      disabled={disabled}
      size="sm"
      width="11rem"
      onValueChange={(details) => {
        const next = details.value[0] as AssignablePermission | undefined
        // Ark clears the value when an open selector is dismissed; ignore
        // that rather than reporting a change to nothing.
        if (next && next !== value) onChange(next)
      }}
    >
      <Select.Control>
        {unavailableReason ? (
          <Tooltip content={unavailableReason}>{trigger}</Tooltip>
        ) : (
          trigger
        )}
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      {/*
        Deliberately NOT portalled. This select lives inside a modal dialog,
        and a portalled popup is a sibling of the dialog rather than a
        descendant - so clicking an option counted as interacting OUTSIDE the
        dialog and dismissed the whole thing before the choice registered.
        Rendering in place keeps the click inside.
      */}
      <Select.Positioner>
        <Select.Content>
          {/*
            Iterate the COLLECTION's items, not the bare permission strings.
            Ark matches an item back to its collection entry by identity; hand
            it a string and it renders happily but is never associated with
            the entry, so isItemDisabled is never consulted and a blocked
            option stays selectable.
          */}
          {collection.items.map((item) => (
            <Select.Item item={item} key={item.value}>
              <PermissionBadge permission={item.value} />
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  )
}
