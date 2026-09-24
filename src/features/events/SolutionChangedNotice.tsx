import { Alert, Button } from '@chakra-ui/react'
import { describeChange, type SolutionPrint } from './solutionPrint'

/**
 * Said out loud when the event changed under an open review.
 *
 * The screen has already swapped to the new solution by the time this shows
 * - that is the point, the checks must describe what Accept would act on -
 * and content changing silently under someone mid-read is exactly the kind of
 * thing that gets a wrong solution accepted. So the swap is announced, with
 * the identifiers an analyst can match against the processing tool.
 *
 * role="alert": it arrives on its own, not in answer to anything the reader
 * did, and it changes what they should do next.
 */
export function SolutionChangedNotice({
  from,
  to,
  onAcknowledge,
}: {
  from: SolutionPrint
  to: SolutionPrint
  /** The reviewer has looked at the new solution - Accept and Cancel unlock. */
  onAcknowledge: () => void
}) {
  return (
    /*
      Solid, not the pale subtle tint: the first real run found the subtle
      one easy to read past on the way to Accept. It sits in the sticky bar,
      so it is on screen from every step at every scroll position.

      One shade darker than Chakra's solid orange in the light theme: white
      on orange.600 measured 3.56:1, under the 4.5:1 body text needs. On
      orange.700 it clears it. The dark theme's solid (dark text on
      orange.500, 7.49:1) is left alone.
    */
    <Alert.Root status="warning" variant="solid" role="alert" bg="orange.700" _dark={{ bg: 'orange.500' }}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title fontWeight="bold">This event changed since you opened it</Alert.Title>
        <Alert.Description>
          {describeChange(from, to)}. Now showing the new solution. Review it, then confirm here
          before you accept or cancel.
        </Alert.Description>
      </Alert.Content>
      {/*
        An acknowledgement, not a close button. Accept and Cancel stay locked
        until this is pressed: in testing, the click after a 409 went straight
        through and accepted the new solution - which a reflexive double-click
        would do without anybody having looked at it.
      */}
      <Button size="sm" variant="surface" colorPalette="gray" alignSelf="center" onClick={onAcknowledge}>
        Reviewed
      </Button>
    </Alert.Root>
  )
}
