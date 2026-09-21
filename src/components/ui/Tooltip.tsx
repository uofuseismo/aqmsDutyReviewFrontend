import { Portal, Tooltip as ChakraTooltip } from '@chakra-ui/react'
import { forwardRef, type ReactNode } from 'react'

export interface TooltipProps extends ChakraTooltip.RootProps {
  content: ReactNode
  showArrow?: boolean
  children: ReactNode
}

/**
 * A tooltip on a focusable control.
 *
 * Worth being clear about what this does and does not buy: a tooltip is
 * wired with aria-describedby only while it is open, so it is a *supplement*
 * to an accessible name, never a replacement for one. Every control still
 * carries its own aria-label - that is what a screen reader announces, and
 * it is the only thing that works on a touch screen, where there is no hover
 * and tooltips effectively do not exist.
 *
 * So: the aria-label says what the control is, and this says the same thing
 * to a sighted user who has paused over it.
 */
export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  function Tooltip({ content, showArrow = true, children, ...rest }, ref) {
    return (
      <ChakraTooltip.Root openDelay={300} closeDelay={100} {...rest}>
        <ChakraTooltip.Trigger asChild>{children}</ChakraTooltip.Trigger>
        <Portal>
          <ChakraTooltip.Positioner>
            <ChakraTooltip.Content ref={ref}>
              {showArrow && (
                <ChakraTooltip.Arrow>
                  <ChakraTooltip.ArrowTip />
                </ChakraTooltip.Arrow>
              )}
              {content}
            </ChakraTooltip.Content>
          </ChakraTooltip.Positioner>
        </Portal>
      </ChakraTooltip.Root>
    )
  },
)
