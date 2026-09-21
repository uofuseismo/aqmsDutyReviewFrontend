import {
  Alert, Badge, Box, Button, Clipboard, CloseButton, Dialog, HStack, IconButton,
  Input, Portal, Spinner, Stack, Table, Text,
} from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LuKeyRound, LuPlus, LuTrash2 } from 'react-icons/lu'
import { ApiError } from '../../api/client'
import { parsePermission, type AssignablePermission } from '../../auth/permissions'
import { useAuth } from '../../auth/useAuth'
import { Tooltip } from '../../components/ui/Tooltip'
import { formatLocalDateTime, localZoneAbbreviation } from '../events/format'
import {
  addProvisionalUser,
  removeUser,
  resetUserPassword,
  setUserPermission,
  type AddedUser,
} from './adminActions'
import { PermissionSelect } from './PermissionSelect'
import { listUsers, parseTimestamp, type DrpUser } from './users'

/** Module-level so the arrays keep their identity between renders. */
const DEMOTION_BLOCKED = ['read_only', 'read_write'] as const
const EMPTY = [] as const

function When({ value }: { value: string | undefined }) {
  const parsed = parseTimestamp(value)
  if (parsed === null) return <Text as="span" color="fg.muted">—</Text>
  return <>{formatLocalDateTime(parsed)}</>
}

export function UserManagementDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { getToken, expireSession, user: me } = useAuth()
  const [users, setUsers] = useState<DrpUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  /** The one-time password to show, and which action produced it. */
  const [created, setCreated] = useState<(AddedUser & { wasReset?: boolean }) | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DrpUser | null>(null)
  const [confirmReset, setConfirmReset] = useState<DrpUser | null>(null)
  const zone = localZoneAbbreviation()
  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setLoading(true)
    setError(null)
    try {
      const rows = await listUsers(getToken(), controller.signal)
      if (!controller.signal.aborted) setUsers(rows)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (cause instanceof ApiError && cause.isUnauthorized) return expireSession()
      setError(cause instanceof ApiError ? cause.message : 'Could not list the users.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [getToken, expireSession])

  useEffect(() => {
    if (!open) return
    const start = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [open, load])

  /** An action that changes the list, then re-reads it as the server sees it. */
  const run = async (who: string, action: () => Promise<unknown>) => {
    setBusy(who)
    setError(null)
    try {
      await action()
      await load()
    } catch (cause) {
      // The server's wording is the authority here - "the name may already be
      // taken", the last-administrator refusal - so it is shown as sent.
      setError(cause instanceof ApiError ? cause.message : 'That did not work.')
    } finally {
      setBusy(null)
    }
  }

  const isSelf = confirmReset !== null && me !== null && confirmReset.name === me

  const administrators = users.filter((u) => parsePermission(u.permission) === 'admin')
  const lastAdministrator = administrators.length <= 1

  /**
   * The levels this row may not be moved to.
   *
   * The only administrator cannot step down: doing so would leave the
   * application with nobody able to add users, reset passwords or promote
   * anyone back - including themselves. The backend refuses it, so this only
   * declines to open the door.
   *
   * Guarded on "is an administrator and is the only one" rather than on "is
   * me", so it still holds if the list is a moment stale.
   */
  const demotionBlocked = (candidate: DrpUser): boolean =>
    parsePermission(candidate.permission) === 'admin' && lastAdministrator

  /**
   * Why a delete might not be offered.
   *
   * The database refuses to remove the last administrator regardless, so this
   * only avoids presenting an action that is certain to fail. Two
   * administrators deleting each other at the same instant from different
   * sessions is a race this cannot see, and does not need to - it is settled
   * underneath.
   */
  const deleteBlockedBecause = (candidate: DrpUser): string | null => {
    if (candidate.name === me) return 'You cannot delete your own account'
    if (parsePermission(candidate.permission) === 'admin' && lastAdministrator) {
      return 'The last administrator cannot be removed'
    }
    return null
  }

  const close = (next: boolean) => {
    if (!next) {
      setCreated(null)
      setNewName('')
      setAdding(false)
      setError(null)
      setConfirmDelete(null)
    }
    onOpenChange(next)
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(d) => close(d.open)} size={{ base: 'full', md: 'xl' }} scrollBehavior="inside" placement="center">
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Stack gap="0">
                  <Dialog.Title>User management</Dialog.Title>
                  <Dialog.Description fontSize="sm" color="fg.muted">
                    Accounts held by this application, not by AQMS.
                  </Dialog.Description>
                </Stack>
                <Dialog.CloseTrigger asChild><CloseButton size="sm" /></Dialog.CloseTrigger>
              </Dialog.Header>

              <Dialog.Body>
                <Stack gap="4">
                  {error && (
                    <Alert.Root status="error" role="alert">
                      <Alert.Indicator />
                      <Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content>
                    </Alert.Root>
                  )}

                  {/* Shown once, for a new account and for a reset alike. The
                      server keeps this out of its logs on purpose, so if it is
                      lost here the only way back is another reset. */}
                  {created && (
                    <Alert.Root status="success">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>
                          {created.wasReset ? 'Reset' : 'Added'} {created.user}
                        </Alert.Title>
                        <Alert.Description>
                          <Stack gap="2" align="flex-start">
                            <Text fontSize="sm">
                              Give them this temporary password out of band. It is shown
                              only now, expires, and must be changed on their next
                              sign-in.
                            </Text>
                            <Clipboard.Root value={created.temporaryPassword}>
                              <HStack gap="2">
                                <Box
                                  fontFamily="mono"
                                  fontSize="sm"
                                  px="2"
                                  py="1"
                                  rounded="sm"
                                  borderWidth="1px"
                                  bg="bg.panel"
                                >
                                  {created.temporaryPassword}
                                </Box>
                                <Clipboard.Trigger asChild>
                                  <Button size="xs" variant="outline">
                                    <Clipboard.Indicator /> Copy
                                  </Button>
                                </Clipboard.Trigger>
                              </HStack>
                            </Clipboard.Root>
                          </Stack>
                        </Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}

                  {adding && (
                    <HStack gap="2" align="flex-end">
                      <Input
                        size="sm"
                        placeholder="New user name"
                        value={newName}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-label="New user name"
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false) }}
                      />
                      <Button
                        size="sm"
                        colorPalette="utahRed"
                        loading={busy === '__add__'}
                        aria-disabled={newName.trim() === ''}
                        onClick={() => {
                          const name = newName.trim()
                          if (!name) return
                          void run('__add__', async () => {
                            // Everyone starts read-only and is promoted from
                            // the row above; nobody is created an administrator.
                            setCreated(await addProvisionalUser(name, 'read_only', getToken()))
                            setNewName('')
                            setAdding(false)
                          })
                        }}
                      >
                        Create
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                        Cancel
                      </Button>
                    </HStack>
                  )}

                  {loading && users.length === 0 ? (
                    <HStack gap="3" py="10" justify="center" color="fg.muted">
                      <Spinner size="sm" /><Text>Loading users…</Text>
                    </HStack>
                  ) : (
                    <Table.Root size="sm" stickyHeader>
                      <Table.Header>
                        <Table.Row bg="bg.panel">
                          <Table.ColumnHeader>User</Table.ColumnHeader>
                          <Table.ColumnHeader>Access</Table.ColumnHeader>
                          <Table.ColumnHeader whiteSpace="nowrap">Last login ({zone})</Table.ColumnHeader>
                          <Table.ColumnHeader whiteSpace="nowrap">Created ({zone})</Table.ColumnHeader>
                          <Table.ColumnHeader />
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {users.map((row) => {
                          const permission = parsePermission(row.permission)
                          const blocked = deleteBlockedBecause(row)
                          const rowBusy = busy === row.name
                          return (
                            <Table.Row key={row.name}>
                              <Table.Cell fontWeight="medium">
                                <HStack gap="2">
                                  <Text>{row.name}</Text>
                                  {row.name === me && <Badge size="sm" variant="outline">You</Badge>}
                                  {row.provisionalUntil !== undefined && (
                                    <Badge colorPalette="orange" variant="subtle" size="sm">Provisional</Badge>
                                  )}
                                </HStack>
                              </Table.Cell>
                              <Table.Cell>
                                <PermissionSelect
                                  value={(permission === 'none' ? 'read_only' : permission) as AssignablePermission}
                                  disabled={rowBusy}
                                  ariaLabel={`Access level for ${row.name}`}
                                  unavailable={
                                    demotionBlocked(row) ? DEMOTION_BLOCKED : EMPTY
                                  }
                                  unavailableReason={
                                    demotionBlocked(row)
                                      ? 'The only administrator cannot be demoted'
                                      : undefined
                                  }
                                  onChange={(next) =>
                                    void run(row.name, () => setUserPermission(row.name, next, getToken()))
                                  }
                                />
                              </Table.Cell>
                              <Table.Cell whiteSpace="nowrap" fontVariantNumeric="tabular-nums">
                                <When value={row.lastLogin} />
                              </Table.Cell>
                              <Table.Cell whiteSpace="nowrap" fontVariantNumeric="tabular-nums">
                                <When value={row.created} />
                              </Table.Cell>
                              <Table.Cell textAlign="end" whiteSpace="nowrap">
                                {/*
                                  Reset is offered on every row, including the
                                  last administrator and yourself: forgetting
                                  your own password is the commonest reason to
                                  need this, and unlike deletion it takes
                                  nothing away that cannot be handed back.
                                */}
                                <Tooltip content={`Reset ${row.name}'s password`}>
                                  <IconButton
                                    size="xs"
                                    variant="ghost"
                                    aria-label={`Reset ${row.name}'s password`}
                                    aria-disabled={rowBusy}
                                    onClick={() => { if (!rowBusy) setConfirmReset(row) }}
                                  >
                                    <LuKeyRound />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip content={blocked ?? `Delete ${row.name}`}>
                                  <IconButton
                                    size="xs"
                                    variant="ghost"
                                    colorPalette="red"
                                    aria-label={blocked ?? `Delete ${row.name}`}
                                    aria-disabled={blocked !== null || rowBusy}
                                    onClick={() => { if (!blocked && !rowBusy) setConfirmDelete(row) }}
                                  >
                                    <LuTrash2 />
                                  </IconButton>
                                </Tooltip>
                              </Table.Cell>
                            </Table.Row>
                          )
                        })}
                      </Table.Body>
                    </Table.Root>
                  )}
                </Stack>
              </Dialog.Body>

              <Dialog.Footer>
                <Text fontSize="sm" color="fg.muted" mr="auto">
                  {!loading && users.length > 0 && `${users.length} user(s)`}
                </Text>
                <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
                  <LuPlus /> Add user
                </Button>
                <Button size="sm" variant="outline" onClick={() => void load()} loading={loading}>
                  Refresh
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Resetting your own account is allowed - forgetting your own password
          is the commonest reason to want this - but it is worth saying out
          loud that you are about to do it to yourself. */}
      <Dialog.Root
        open={confirmReset !== null}
        onOpenChange={(d) => { if (!d.open) setConfirmReset(null) }}
        role="alertdialog"
        placement="center"
        size="sm"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner p="4">
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Reset {confirmReset?.name}&rsquo;s password?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text fontSize="sm">
                  {isSelf ? 'Your' : 'Their'} current password stops working immediately. You will be given a
                  temporary one to pass on out of band, shown only once.
                  {isSelf
                    ? ' This is your own account: the temporary password is what you will sign in with next time, and you will have to change it.'
                    : ''}
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button size="sm" variant="outline">Cancel</Button>
                </Dialog.ActionTrigger>
                <Button
                  size="sm"
                  colorPalette="utahRed"
                  loading={busy === confirmReset?.name}
                  onClick={() => {
                    const target = confirmReset
                    if (!target) return
                    setConfirmReset(null)
                    void run(target.name, async () => {
                      setCreated({ ...(await resetUserPassword(target.name, getToken())), wasReset: true })
                    })
                  }}
                >
                  Reset password
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Naming the account in the confirmation, not just "this user" - the
          rows look alike and the action does not come back. */}
      <Dialog.Root
        open={confirmDelete !== null}
        onOpenChange={(d) => { if (!d.open) setConfirmDelete(null) }}
        role="alertdialog"
        placement="center"
        size="sm"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner p="4">
            <Dialog.Content>
              <Dialog.Header><Dialog.Title>Delete {confirmDelete?.name}?</Dialog.Title></Dialog.Header>
              <Dialog.Body>
                <Text fontSize="sm">
                  This removes the account and its keys. It cannot be undone.
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button size="sm" variant="outline">Cancel</Button>
                </Dialog.ActionTrigger>
                <Button
                  size="sm"
                  colorPalette="red"
                  loading={busy === confirmDelete?.name}
                  onClick={() => {
                    const target = confirmDelete
                    if (!target) return
                    setConfirmDelete(null)
                    void run(target.name, () => removeUser(target.name, getToken()))
                  }}
                >
                  Delete {confirmDelete?.name}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  )
}
