import {
  Alert, Button, CloseButton, Dialog, Field, HStack, Icon, Input, List,
  Portal, Spinner, Stack, Text,
} from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { LuCheck, LuCircleCheck, LuDot } from 'react-icons/lu'
import { toaster } from '../../components/ui/toasterStore'

/** Long enough to read "Password changed", short enough not to feel stuck. */
const SUCCESS_DWELL_MS = 1400
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { HiddenUsernameField } from '../../components/HiddenUsernameField'
import { changePassword } from './changePassword'
import { evaluatePassword, fetchPasswordPolicy, type PasswordPolicy } from './passwordPolicy'

/** One live rule. Ticks in place rather than appearing and disappearing. */
function Rule({ label, satisfied }: { label: string; satisfied: boolean }) {
  return (
    <List.Item
      display="flex"
      alignItems="center"
      gap="2"
      color={satisfied ? 'green.fg' : 'fg.muted'}
      fontSize="sm"
    >
      <Icon size="sm" aria-hidden>
        {satisfied ? <LuCheck /> : <LuDot />}
      </Icon>
      {label}
    </List.Item>
  )
}

/**
 * Settings: changing your own password.
 *
 * The rules are fetched rather than hardcoded, so this cannot drift from the
 * server's policy, and they are shown while typing rather than after
 * submitting. The server checks all of it again - what happens here is
 * courtesy, and its refusal is what gets displayed if the two ever disagree.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const { getToken } = useAuth()
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  const loadPolicy = useCallback(async () => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setPolicyError(null)
    try {
      const fetched = await fetchPasswordPolicy(getToken(), controller.signal)
      if (!controller.signal.aborted) setPolicy(fetched)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setPolicyError(
        cause instanceof ApiError ? cause.message : 'Could not load the password rules.',
      )
    }
  }, [getToken])

  useEffect(() => {
    if (!open) return
    // Deferred a tick so the dialog paints before the request starts.
    const start = window.setTimeout(() => void loadPolicy(), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [open, loadPolicy])

  /**
   * Closing clears everything typed - a password should not sit in component
   * state behind a closed dialog. Done here rather than in an effect watching
   * `open` because closing is an event, not state to synchronise against, and
   * every route out (the buttons, Escape, the backdrop) comes through here.
   */
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCurrent('')
      setNext('')
      setConfirm('')
      setError(null)
      setDone(null)
    }
    onOpenChange(nextOpen)
  }

  /*
    On success the dialog says so, then closes itself.

    It used to leave the empty form up behind a success banner, and a reviewer
    read that as "did it not take? should I do it again?". A form you have
    finished with should go away. The toast is what carries the confirmation
    out past the closing dialog, so the answer is still on screen afterwards.
  */
  useEffect(() => {
    if (done === null) return
    const close = window.setTimeout(() => {
      toaster.create({ type: 'success', title: 'Password changed', description: done })
      handleOpenChange(false)
    }, SUCCESS_DWELL_MS)
    return () => window.clearTimeout(close)
    // handleOpenChange is rebuilt each render but only closes over setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  const rules = evaluatePassword(next, current, policy)
  const rulesMet = rules.length > 0 && rules.every((rule) => rule.satisfied)
  const mismatch = confirm !== '' && next !== confirm
  const canSubmit =
    !submitting && current !== '' && rulesMet && confirm !== '' && !mismatch

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || !user) return
    setSubmitting(true)
    setError(null)
    try {
      setDone(await changePassword(user, current, next))
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Could not change the password.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => handleOpenChange(details.open)}
      placement="center"
      size="sm"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner p="4">
          <Dialog.Content>
            <form onSubmit={submit} noValidate>
              <Dialog.Header>
                <Stack gap="0">
                  <Dialog.Title>Change password</Dialog.Title>
                  <Dialog.Description fontSize="sm" color="fg.muted">
                    Signed in as {user}
                  </Dialog.Description>
                </Stack>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Dialog.CloseTrigger>
              </Dialog.Header>

              <Dialog.Body>
                <Stack gap="4">
                  {user && <HiddenUsernameField user={user} />}
                  {done ? (
                    /* The form is finished with, so it goes. Leaving it up
                       under a success banner is what made a reviewer ask
                       whether they needed to do it again. */
                    <Stack align="center" gap="2" py="6" role="status">
                      <Icon color="green.fg" boxSize="8" aria-hidden>
                        <LuCircleCheck />
                      </Icon>
                      <Text fontWeight="semibold">Password changed</Text>
                      <Text fontSize="sm" color="fg.muted" textAlign="center">
                        {done}
                      </Text>
                    </Stack>
                  ) : (
                  <>
                  {error && (
                    <Alert.Root status="error" size="sm" role="alert">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}
                  {policyError && (
                    <Alert.Root status="warning" size="sm" role="alert">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{policyError}</Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}

                  <Field.Root required>
                    <Field.Label>Current password</Field.Label>
                    <Input
                      type="password"
                      name="current-password"
                      autoComplete="current-password"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                      disabled={submitting}
                    />
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label>New password</Field.Label>
                    <Input
                      type="password"
                      name="new-password"
                      autoComplete="new-password"
                      value={next}
                      onChange={(e) => setNext(e.target.value)}
                      disabled={submitting}
                    />
                  </Field.Root>

                  {policy === null && !policyError ? (
                    <HStack gap="2" color="fg.muted" fontSize="sm">
                      <Spinner size="xs" />
                      <Text>Loading the password rules…</Text>
                    </HStack>
                  ) : (
                    <List.Root gap="1" variant="plain">
                      {rules.map((rule) => (
                        <Rule key={rule.id} label={rule.label} satisfied={rule.satisfied} />
                      ))}
                    </List.Root>
                  )}

                  <Field.Root required invalid={mismatch}>
                    <Field.Label>Confirm new password</Field.Label>
                    <Input
                      type="password"
                      name="confirm-new-password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      disabled={submitting}
                    />
                    {mismatch && <Field.ErrorText>The passwords do not match.</Field.ErrorText>}
                  </Field.Root>
                  </>
                  )}
                </Stack>
              </Dialog.Body>

              {/* No actions once it has succeeded: the dialog is closing. */}
              {done === null && (
                <Dialog.Footer>
                  <Dialog.ActionTrigger asChild>
                    <Button variant="outline" size="sm" disabled={submitting}>
                      Close
                    </Button>
                  </Dialog.ActionTrigger>
                  <Button
                    type="submit"
                    colorPalette="utahRed"
                    size="sm"
                    loading={submitting}
                    loadingText="Changing"
                    aria-disabled={!canSubmit}
                  >
                    Change password
                  </Button>
                </Dialog.Footer>
              )}
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
