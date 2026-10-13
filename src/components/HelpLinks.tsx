import { IconButton } from '@chakra-ui/react'
import { LuCircleHelp, LuPhone } from 'react-icons/lu'
import { Link as RouterLink, useMatch } from 'react-router'
import { useAppSettings } from '../features/settings/useAppSettings'
import { Tooltip } from './ui/Tooltip'

/**
 * Who to call, and the documentation - one icon each.
 *
 * They were a single life-ring opening a two-item menu, and the life-ring
 * was forgotten by the next morning: "help" does not say which help. A phone
 * and a question mark each say what they are, and going straight there saves
 * the menu in between.
 *
 * Both are links, not buttons, so they behave like links - a new tab on
 * middle-click, the address shown on hover, a long-press menu on a phone.
 */
export function HelpLinks() {
  const settings = useAppSettings()
  const documentation = settings?.documentationURL
  const onContacts = useMatch('/contacts') !== null

  return (
    <>
      <Tooltip content="Who to call">
        <IconButton
          asChild
          // Marked while on the page, so the icon also says where you are.
          variant={onContacts ? 'subtle' : 'ghost'}
          size="sm"
          aria-label="Who to call"
        >
          <RouterLink to="/contacts" aria-current={onContacts ? 'page' : undefined}>
            <LuPhone />
          </RouterLink>
        </IconButton>
      </Tooltip>
      {/* Only once the settings have said where it is. */}
      {documentation && (
        <Tooltip content="Documentation (opens in a new tab)">
          <IconButton asChild variant="ghost" size="sm" aria-label="Documentation, opens in a new tab">
            <a href={documentation} target="_blank" rel="noopener noreferrer">
              <LuCircleHelp />
            </a>
          </IconButton>
        </Tooltip>
      )}
    </>
  )
}
