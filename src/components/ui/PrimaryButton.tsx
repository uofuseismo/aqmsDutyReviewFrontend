import { Button, type ButtonProps } from '@chakra-ui/react'
import { forwardRef } from 'react'

/**
 * The primary action, given a little weight by a shadow alone.
 *
 * No transform and no transition: an button that lifts and presses draws the
 * eye every time the pointer crosses it, and on a screen someone is reading
 * at 3am that is noise. The shadow is enough to separate it from the panel;
 * Chakra's own hover darkening still confirms the pointer is on target.
 *
 * Sized for a thumb as much as a mouse - the face clears the 44px touch
 * target comfortably.
 *
 * Pass `aria-disabled` rather than `disabled` to lower it: Chakra's disabled
 * styling matches [aria-disabled=true], so the look is identical, but the
 * button stays focusable and keeps announcing itself. A truly `disabled`
 * button is skipped by the tab order entirely, which leaves a keyboard or
 * screen-reader user tabbing past the main action with no idea it is there
 * or why it will not go.
 */
export const PrimaryButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function PrimaryButton(props, ref) {
    return (
      <Button
        ref={ref}
        colorPalette="utahRed"
        size="2xl"
        fontWeight="semibold"
        width="full"
        shadow="md"
        // Lowered means lowered: a disabled control should not float.
        _disabled={{ shadow: 'none' }}
        {...props}
      />
    )
  },
)
