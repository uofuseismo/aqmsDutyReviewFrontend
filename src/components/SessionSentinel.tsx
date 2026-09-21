import { Button, Dialog, Portal, Stack, Text } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useSessionClock } from '../auth/useSessionClock'
import { LoginForm } from './LoginForm'
import { SessionCountdown } from './SessionCountdown'
import { toaster } from './ui/toasterStore'

const EXPIRY_TOAST_ID = 'session-expiry'

/**
 * Owns everything about a session running out: the warning toast on the way
 * down, and the lock over the app once it has lapsed.
 *
 * The app behind the lock stays mounted. There is no refresh endpoint - the
 * backend refuses to mint a token from a bearer token - so the only way
 * forward is the password, but that is no reason to throw away whatever the
 * reviewer was looking at.
 */
export function SessionSentinel() {
  const { status, user } = useAuth()
  const { isExpiring } = useSessionClock()
  const [reauthOpen, setReauthOpen] = useState(false)

  useEffect(() => {
    if (!isExpiring) return
    /*
      Both the create and the dismiss are deferred out of React's commit
      phase. The toast store notifies its subscribers synchronously through
      flushSync, and these run inside the same commit that crosses into the
      warning window (and later flips to expired and opens the lock) - so
      calling either inline means calling flushSync while React is already
      rendering. React only complains about this in development, but the
      advice in the warning is exactly this: move it to a microtask.
    */
    queueMicrotask(() => {
      toaster.create({
        id: EXPIRY_TOAST_ID,
        type: 'warning',
        title: 'Session ending soon',
        description: <SessionCountdown />,
        duration: Number.POSITIVE_INFINITY,
        closable: true,
        action: {
          label: 'Sign in again',
          onClick: () => setReauthOpen(true),
        },
      })
    })
    // Covers every way out of the warning window: signing in again, signing
    // out, and the session actually lapsing.
    return () => {
      queueMicrotask(() => toaster.dismiss(EXPIRY_TOAST_ID))
    }
  }, [isExpiring])

  const expired = status === 'expired'
  const open = expired || reauthOpen

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        // An expired session is not dismissible - there is nothing usable
        // behind it. An early re-auth is.
        if (!expired) setReauthOpen(details.open)
      }}
      role={expired ? 'alertdialog' : 'dialog'}
      placement="center"
      motionPreset="slide-in-bottom"
      closeOnInteractOutside={!expired}
      closeOnEscape={!expired}
    >
      <Portal>
        <Dialog.Backdrop backdropFilter="blur(2px)" />
        <Dialog.Positioner p="4">
          <Dialog.Content maxW="24rem" borderTopWidth="4px" borderTopColor="utahRed.solid">
            <Dialog.Header pb="2">
              <Stack gap="1">
                <Dialog.Title>
                  {expired ? 'Session expired' : 'Sign in again'}
                </Dialog.Title>
                <Dialog.Description fontSize="sm" color="fg.muted">
                  {expired
                    ? 'Your session has ended. Enter your password to pick up where you left off.'
                    : 'Start a fresh session now so you are not interrupted mid-review.'}
                </Dialog.Description>
              </Stack>
            </Dialog.Header>
            <Dialog.Body pb="6">
              {user ? (
                <LoginForm
                  lockedUser={user}
                  submitLabel={expired ? 'Unlock' : 'Sign in'}
                  onSuccess={() => setReauthOpen(false)}
                  secondaryAction={<SignOutButton />}
                />
              ) : (
                <Text>Your session has ended. Reload the page to sign in.</Text>
              )}
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

function SignOutButton() {
  const { signOut } = useAuth()
  return (
    <Button variant="ghost" size="md" onClick={signOut}>
      Sign out
    </Button>
  )
}
