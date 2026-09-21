import {
  Alert,
  Box,
  Field,
  IconButton,
  Input,
  InputGroup,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { LuEye, LuEyeOff } from 'react-icons/lu'
import { AuthError } from '../auth/authError'
import { useAuth } from '../auth/useAuth'
import { HiddenUsernameField } from './HiddenUsernameField'
import { PrimaryButton } from './ui/PrimaryButton'
import { Tooltip } from './ui/Tooltip'

interface LoginFormProps {
  /**
   * When set, the user is fixed and shown as static text rather than an
   * editable field. Used by the lock screen, which already knows who lapsed
   * and only needs the password.
   */
  lockedUser?: string
  submitLabel?: string
  /** Rendered under the submit button - e.g. the lock screen's "Sign out". */
  secondaryAction?: ReactNode
  onSuccess?: () => void
}

/** Which field the message is about, so it can be marked and focused. */
type FormError = { message: string; field?: 'user' | 'password' }

export function LoginForm({
  lockedUser,
  submitLabel = 'Sign in',
  secondaryAction,
  onSuccess,
}: LoginFormProps) {
  const { signIn } = useAuth()
  const [user, setUser] = useState(lockedUser ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const userRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const errorId = useId()

  useEffect(() => {
    // Autofocus only where there is a real keyboard. On a phone it would
    // throw up the on-screen keyboard and hide half the screen before the
    // reviewer has decided to type anything.
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (lockedUser) {
      passwordRef.current?.focus()
    } else {
      userRef.current?.focus()
    }
  }, [lockedUser])

  /**
   * The affordance the whole form hangs on: with anything missing, the
   * button is visibly lowered, so nobody is invited to press it and be told
   * off. That removes the empty-field errors entirely - the ones that used
   * to appear and shove the form around - rather than finding somewhere
   * tidier to put them.
   */
  const trimmedUser = user.trim()
  const canSubmit = trimmedUser.length > 0 && password.length > 0

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    // Reachable, because the button is aria-disabled rather than disabled and
    // so can still be clicked and focused. Say nothing; just put the cursor
    // where the missing piece goes.
    if (!canSubmit) {
      ;(trimmedUser.length === 0 ? userRef : passwordRef).current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await signIn(trimmedUser, password)
      setPassword('')
      onSuccess?.()
    } catch (cause) {
      const message =
        cause instanceof AuthError
          ? cause.message
          : 'Something went wrong signing in. Try again.'
      // A rejected credential is about the password field as far as the form
      // is concerned; the backend deliberately will not say which half was
      // wrong, so pointing at the password is the best guess available.
      const field =
        cause instanceof AuthError && cause.kind === 'invalid_credentials'
          ? 'password'
          : undefined
      setError({ message, field })
      // Clear the password but keep the user name: a mistyped password is far
      // more likely than a mistyped user, and retyping both is a tax.
      setPassword('')
      passwordRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  // Safe to clear as soon as they start fixing it: the slot below holds its
  // height whether or not a message is in it, so nothing moves.
  const clearError = () => setError(null)

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="4">
        {lockedUser ? (
          /*
            Deliberately NOT a Field.Root. Field renders its label with a
            `for` pointing at the input it expects to wrap, and here the user
            is static text - so the label pointed at an id that never existed.
            A plain caption says the same thing and dangles nothing.
          */
          <Stack gap="1">
            <Text fontSize="sm" fontWeight="medium">
              User
            </Text>
            <Text fontWeight="medium" fontSize="md">
              {lockedUser}
            </Text>
            {/* Shown as text, so the form would otherwise carry no username
                field for a password manager to match the stored credential
                against. */}
            <HiddenUsernameField user={lockedUser} />
          </Stack>
        ) : (
          <Field.Root required invalid={error?.field === 'user'}>
            <Field.Label>
              User <Field.RequiredIndicator />
            </Field.Label>
            <Input
              ref={userRef}
              name="username"
              value={user}
              onChange={(event) => {
                setUser(event.target.value)
                clearError()
              }}
              aria-describedby={error?.field === 'user' ? errorId : undefined}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              disabled={submitting}
              size="lg"
            />
          </Field.Root>
        )}

        <Field.Root required invalid={error?.field === 'password'}>
          <Field.Label>
            Password <Field.RequiredIndicator />
          </Field.Label>
          <InputGroup
            width="full"
            endElement={
              <Tooltip content={showPassword ? 'Hide password' : 'Show password'}>
                <IconButton
                  variant="ghost"
                  size="sm"
                  // The accessible name, not the tooltip, is what a screen
                  // reader announces and what a touch user gets.
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  {showPassword ? <LuEyeOff /> : <LuEye />}
                </IconButton>
              </Tooltip>
            }
          >
            <Input
              ref={passwordRef}
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                clearError()
              }}
              aria-describedby={error?.field === 'password' ? errorId : undefined}
              autoComplete="current-password"
              enterKeyHint="go"
              disabled={submitting}
              size="lg"
            />
          </InputGroup>
        </Field.Root>

        {/*
          The message sits with the button, not above the fields, and that
          placement is what stops it shoving the form around.

          On a phone the card is anchored to the top of the screen, so an
          error appearing here grows the card downwards: the two fields being
          typed into do not move at all, only the button below slides down.
          Nothing is reserved, so there is no empty gap in the common case.

          On a wider screen the card is vertically centred, so any growth
          re-centres it and everything drifts. There, and only there, a
          single line is held open - the messages are short enough to fit
          one - so the layout is completely still.
        */}
        <Box
          display={{ base: error ? 'flex' : 'none', sm: 'flex' }}
          alignItems="center"
          minH={{ sm: '3rem' }}
          width="full"
        >
          {error && (
            <Alert.Root status="error" size="sm" role="alert" width="full">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description id={errorId}>{error.message}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
        </Box>

        {/* Signing in is the entire point of this screen, so the primary
            action gets the full width and sits alone; anything secondary goes
            underneath it, quieter, rather than competing beside it. */}
        <Stack gap="2" pt="2">
          <PrimaryButton
            type="submit"
            loading={submitting}
            loadingText="Signing in"
            aria-disabled={!canSubmit}
          >
            {submitLabel}
          </PrimaryButton>
          {secondaryAction}
        </Stack>
      </Stack>
    </form>
  )
}
