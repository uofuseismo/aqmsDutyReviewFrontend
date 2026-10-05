import { IconButton, Menu, Portal } from '@chakra-ui/react'
import { LuBookOpen, LuExternalLink, LuLifeBuoy, LuPhone } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { useAppSettings } from '../features/settings/useAppSettings'

/**
 * Help that is not about the reviewer: who to call, and the documentation.
 *
 * Its own icon in the header rather than more lines in the account menu.
 * Everything in that menu is about you - your session, your settings - and a
 * phone number needed in a hurry at 3am is the last thing anyone would look
 * for under their own avatar.
 */
export function ResourcesMenu() {
  const navigate = useNavigate()
  const settings = useAppSettings()
  const documentation = settings?.documentationURL

  return (
    <Menu.Root
      positioning={{ placement: 'bottom-end' }}
      onSelect={(details) => {
        if (details.value === 'contacts') navigate('/contacts')
      }}
    >
      <Menu.Trigger asChild>
        <IconButton variant="ghost" size="sm" aria-label="Resources: who to call and documentation">
          <LuLifeBuoy />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="13rem">
            <Menu.Item value="contacts">
              <LuPhone /> Who to call
            </Menu.Item>
            {/* Only once the settings have said where it is. A real link, so
                it opens like any other - new tab, middle-click, long-press. */}
            {documentation && (
              <Menu.Item value="documentation" asChild>
                <a href={documentation} target="_blank" rel="noopener noreferrer">
                  <LuBookOpen /> Documentation
                  <LuExternalLink aria-hidden style={{ marginInlineStart: 'auto' }} />
                </a>
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
