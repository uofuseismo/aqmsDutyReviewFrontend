import { Alert, Box, Button, Code, Stack, Text } from '@chakra-ui/react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Named in the message, so a report says which part failed. */
  label: string
  /**
   * Changing this remounts the boundary and clears the error.
   *
   * Pass the thing whose change should mean "try again" - an event id,
   * usually. Without it, a route that failed once keeps showing the failure
   * after the reviewer navigates somewhere that would have worked.
   */
  resetKey?: string | number
}

interface State {
  error: Error | null
  detail: string | null
}

/**
 * Keeps one broken section from taking the whole page down.
 *
 * The catalog comes from a live system rather than a curated dump, and a
 * single row with an unexpected shape has already blanked the entire app once
 * - a missing `geographicType` meant `.replace` on undefined, which React
 * answers by unmounting everything. At three in the morning a white screen is
 * indistinguishable from the network being down, and it takes the way back to
 * the event list with it.
 *
 * So: fail in place, say what failed, and leave the rest of the app - the
 * header, the navigation, the other panels - working.
 *
 * This is a CLASS component because React has no hook equivalent; there is no
 * useErrorBoundary.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, detail: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept for the reviewer to paste into a report. Nothing is sent anywhere:
    // there is no error-reporting service in this deployment, and a stack
    // trace from a seismic network is not something to post to one.
    this.setState({ detail: `${error.message}\n${info.componentStack ?? ''}`.trim() })
    console.error(`[${this.props.label}]`, error, info.componentStack)
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null, detail: null })
    }
  }

  render() {
    const { error, detail } = this.state
    if (error === null) return this.props.children

    return (
      <Alert.Root status="error" role="alert" alignItems="flex-start">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{this.props.label} could not be displayed</Alert.Title>
          <Alert.Description>
            <Stack gap="3" align="flex-start">
              <Text>
                Something in this data is shaped in a way the app did not expect. The rest
                of the page still works, and the underlying record is unchanged.
              </Text>
              {detail !== null && (
                <Box maxW="full" overflowX="auto">
                  <Code
                    fontSize="xs"
                    whiteSpace="pre"
                    display="block"
                    p="2"
                    rounded="md"
                    maxH="12rem"
                    overflowY="auto"
                  >
                    {detail}
                  </Code>
                </Box>
              )}
              <Button
                size="xs"
                variant="outline"
                onClick={() => this.setState({ error: null, detail: null })}
              >
                Try again
              </Button>
            </Stack>
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    )
  }
}
