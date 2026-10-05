import {
  Alert,
  Badge,
  Box,
  CloseButton,
  Heading,
  HStack,
  Icon,
  Input,
  InputGroup,
  Link,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useDeferredValue, useMemo, useState } from 'react'
import { LuExternalLink, LuMail, LuPhone, LuSearch } from 'react-icons/lu'
import {
  filterContacts,
  groupByReason,
  type Contact,
  type ContactLink,
  type Reach,
} from './contacts'
import { useContacts } from './useContacts'

/**
 * Who to call.
 *
 * A page rather than a popover: fifty-odd contacts, most of them county
 * sheriffs, and instructions that are the rules for making the call -
 * "Call with approval of Senior Staff" - which need room to be read, not a
 * tooltip.
 *
 * Grouped by why you would call, because that is the question in hand ("we
 * have a felt event in Juab") rather than who somebody is. The search box is
 * for the other question: which county.
 */
export function ContactsPage() {
  const { contacts, links, loading, error } = useContacts()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const groups = useMemo(
    () => groupByReason(filterContacts(contacts, deferred)),
    [contacts, deferred],
  )
  const shown = groups.reduce((sum, group) => sum + group.contacts.length, 0)

  return (
    <Stack gap="5">
      <HStack justify="space-between" align="flex-end" wrap="wrap" gap="3">
        <Stack gap="0">
          <Heading as="h1" size="lg" fontWeight="semibold">
            Who to call
          </Heading>
          {!loading && !error && (
            <Text fontSize="sm" color="fg.muted" fontVariantNumeric="tabular-nums">
              {deferred.trim() ? `${shown} of ${contacts.length}` : `${contacts.length} contacts`}
            </Text>
          )}
        </Stack>
        <ContactSearch value={query} onChange={setQuery} />
      </HStack>

      {loading && (
        <HStack gap="3" py="8" justify="center" color="fg.muted">
          <Spinner size="sm" />
          <Text>Loading the contact list…</Text>
        </HStack>
      )}

      {error && (
        <Alert.Root status="error" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Could not load the contact list</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      {!loading && !error && groups.length === 0 && (
        <Text color="fg.muted" py="6" textAlign="center">
          {contacts.length === 0 ? 'The contact list is empty.' : `Nobody matches “${deferred.trim()}”.`}
        </Text>
      )}

      {groups.map((group) => (
        <Stack as="section" key={group.reason} gap="2" aria-label={group.reason}>
          <HStack gap="2">
            <Heading as="h2" size="sm">
              {group.reason}
            </Heading>
            <Badge size="sm" variant="subtle">
              {group.contacts.length}
            </Badge>
          </HStack>
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap="2">
            {group.contacts.map((contact, index) => (
              <ContactCard key={`${contact.agency}:${contact.name}:${index}`} contact={contact} />
            ))}
          </SimpleGrid>
        </Stack>
      ))}

      {links.length > 0 && <LinksCallout links={links} />}
    </Stack>
  )
}

function ContactCard({ contact }: { contact: Contact }) {
  const subtitle = [contact.agency, contact.type].filter(Boolean).join(' · ')
  return (
    <Box borderWidth="1px" rounded="lg" bg="bg.panel" px="3" py="2.5">
      <Stack gap="1.5">
        <Stack gap="0">
          <Text fontWeight="semibold">{contact.name}</Text>
          {subtitle && (
            <Text fontSize="sm" color="fg.muted">
              {subtitle}
            </Text>
          )}
        </Stack>
        {(contact.primary || contact.alternate) && (
          <HStack gap="4" wrap="wrap">
            {contact.primary && <ReachLink reach={contact.primary} who={contact.name} />}
            {contact.alternate && (
              <ReachLink reach={contact.alternate} who={contact.name} label="Alternate" />
            )}
          </HStack>
        )}
        {/* The rule for making the call. In full, every time: it is the one
            part of the card that can change what somebody does. */}
        {contact.instructions && <Text fontSize="sm">{contact.instructions}</Text>}
      </Stack>
    </Box>
  )
}

/**
 * A number to tap or an address to mail - on a phone that is the entire
 * point of the page - shown exactly as the list writes it.
 */
function ReachLink({ reach, who, label }: { reach: Reach; who: string; label?: string }) {
  const mail = reach.href?.startsWith('mailto:')
  const content = (
    <HStack gap="1.5" as="span">
      <Icon size="sm" aria-hidden color="fg.muted">
        {mail ? <LuMail /> : <LuPhone />}
      </Icon>
      {label && (
        <Text as="span" fontSize="xs" color="fg.muted">
          {label}
        </Text>
      )}
      <Text as="span" fontVariantNumeric="tabular-nums" fontWeight="medium">
        {reach.text}
      </Text>
    </HStack>
  )
  if (!reach.href) return content
  return (
    <Link
      href={reach.href}
      // A comfortable thumb target without making the card any taller.
      py="1"
      // Names who: tabbing through fifty "Call 801-…" links, a screen-reader
      // user could not tell one from the next.
      aria-label={`${mail ? 'Email' : 'Call'} ${who}${label ? ` (${label.toLowerCase()})` : ''}, ${reach.text}`}
    >
      {content}
    </Link>
  )
}

/** The backend's extra links, with the "only use for…" that comes with them. */
function LinksCallout({ links }: { links: ContactLink[] }) {
  return (
    <Alert.Root status="info" variant="surface">
      <Alert.Indicator />
      <Alert.Content>
        <Stack gap="2">
          {links.map((link) => (
            <Stack key={link.url} gap="0.5">
              <Link href={link.url} target="_blank" rel="noopener noreferrer" fontWeight="semibold">
                {link.label} <LuExternalLink aria-hidden />
                <Text as="span" srOnly>
                  (opens in a new tab)
                </Text>
              </Link>
              {link.description && <Text fontSize="sm">{link.description}</Text>}
            </Stack>
          ))}
        </Stack>
      </Alert.Content>
    </Alert.Root>
  )
}

/** Built like the event list's filter box, with its own id and wording. */
function ContactSearch({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <InputGroup
      maxW={{ base: 'full', sm: '18rem' }}
      startElement={<LuSearch aria-hidden />}
      endElement={
        value ? (
          <CloseButton
            size="xs"
            variant="plain"
            aria-label="Clear the search"
            onClick={() => onChange('')}
            tabIndex={-1}
          />
        ) : undefined
      }
    >
      <Input
        id="contact-filter"
        name="contact-filter"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            onChange('')
          }
        }}
        placeholder="Search name, county, reason"
        aria-label="Search the contact list"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        size="sm"
      />
    </InputGroup>
  )
}
