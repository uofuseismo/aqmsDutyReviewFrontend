import { Avatar, Box, IconButton, Menu, Portal, Stack, Text } from '@chakra-ui/react'
import { Suspense, lazy, useState } from 'react'
import { LuLogOut, LuSettings, LuUsers } from 'react-icons/lu'
import { formatCountdownCoarse } from '../auth/formatCountdown'
import { PermissionBadge } from './PermissionBadge'
import { useAuth } from '../auth/useAuth'
import { useSessionClock } from '../auth/useSessionClock'
import { useIsWideScreen } from '../hooks/useMediaQuery'
import { SettingsDialog } from '../features/settings/SettingsDialog'

/**
 * Loaded on demand, and only ever on a wide screen.
 *
 * User administration is desk work - adding and removing accounts is not
 * something anyone does from a phone at 3am - so it is hidden below the table
 * breakpoint. Splitting it out of the main bundle means a phone never pays to
 * download an admin table it is not allowed to open, and neither does a
 * non-administrator on any device.
 */
const UserManagementDialog = lazy(() =>
  import('../features/admin/UserManagementDialog').then((module) => ({
    default: module.UserManagementDialog,
  })),
)

/**
 * Its own component so only this line re-renders on the per-second tick.
 *
 * Coarse on purpose - see formatCountdownCoarse. The toast that fires two
 * minutes out is where seconds start to matter, and it keeps them.
 */
function SessionRemaining() {
  const { secondsRemaining } = useSessionClock()
  return (
    <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
      Session ends in {formatCountdownCoarse(secondsRemaining)}
    </Text>
  )
}

/**
 * The account menu, and the only thing left in the top-right besides the
 * theme toggle.
 *
 * The name, access level and countdown moved in here from the header, where
 * on a phone they crowded the title down to "D...". The countdown is worth
 * keeping somewhere - there is no way to renew a session - but it does not
 * need to be on screen at all times, because the warning toast and the lock
 * are what actually catch an expiry.
 */
export function UserMenu() {
  const { user, permission, signOut, can } = useAuth()
  const isWide = useIsWideScreen()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  /** Kept mounted after the first open so closing still animates. */
  const [usersEverOpened, setUsersEverOpened] = useState(false)

  // Administrator AND on a screen big enough for a table of accounts.
  const canManageUsers = can('admin') && isWide

  return (
    <>
      <Menu.Root
        positioning={{ placement: 'bottom-end' }}
        onSelect={(details) => {
          if (details.value === 'sign-out') signOut()
          if (details.value === 'settings') setSettingsOpen(true)
          if (details.value === 'users') {
            setUsersEverOpened(true)
            setUsersOpen(true)
          }
        }}
      >
        <Menu.Trigger asChild>
          <IconButton
            variant="ghost"
            rounded="full"
            size="sm"
            aria-label={`Account menu for ${user ?? 'the current user'}`}
          >
            <Avatar.Root size="xs" colorPalette="utahRed">
              <Avatar.Fallback name={user ?? undefined} />
            </Avatar.Root>
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="14rem">
              {/* Identity, not an action - deliberately outside the item list
                  so it is not focusable or selectable. */}
              <Box px="3" py="2">
                <Stack gap="0.5">
                  <Text fontWeight="semibold" truncate>
                    {user}
                  </Text>
                  {/* alignSelf so the badge hugs its text instead of
                      stretching the width of the menu. */}
                  <PermissionBadge permission={permission} alignSelf="flex-start" />
                  <SessionRemaining />
                </Stack>
              </Box>

              <Menu.Separator />
              <Menu.Item value="sign-out">
                <LuLogOut /> Sign out
              </Menu.Item>

              <Menu.Separator />
              <Menu.Item value="settings">
                <LuSettings /> Settings
              </Menu.Item>

              {canManageUsers && (
                <>
                  <Menu.Separator />
                  <Menu.Item value="users">
                    <LuUsers /> User management
                  </Menu.Item>
                </>
              )}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      {/* Never mounted - and its chunk never fetched - unless an administrator
          on a wide screen actually opens it. The backend gates the route
          regardless; this only keeps the UI and the download honest. */}
      {canManageUsers && usersEverOpened && (
        <Suspense fallback={null}>
          <UserManagementDialog open={usersOpen} onOpenChange={setUsersOpen} />
        </Suspense>
      )}
    </>
  )
}
