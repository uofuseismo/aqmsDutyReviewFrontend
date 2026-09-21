import { Badge, type BadgeProps } from '@chakra-ui/react'
import { PERMISSION_LABELS, type Permission } from '../auth/permissions'

/**
 * A user's access level, styled the one way it is styled everywhere.
 *
 * Shared rather than repeated so the account menu and the user-management
 * table cannot drift apart - the level is the same fact in both places and
 * should be recognisable at a glance as the same thing.
 *
 * `none` is deliberately grey rather than crimson: it is the absence of
 * access, and colouring it like a granted level would read as a permission
 * rather than the lack of one.
 */
export function PermissionBadge({
  permission,
  ...props
}: { permission: Permission } & BadgeProps) {
  return (
    <Badge
      colorPalette={permission === 'none' ? 'gray' : 'utahRed'}
      variant="subtle"
      size="sm"
      {...props}
    >
      {PERMISSION_LABELS[permission]}
    </Badge>
  )
}
