/**
 * The who-to-call list, as /contacts sends it:
 * {"message": "...", "data": {"contacts": [...], "links": [...]}}.
 *
 * Every field is treated as possibly missing. The list is maintained by hand
 * on the backend, and a page that throws on one odd row is a page that is
 * blank at exactly the moment somebody needs a phone number.
 */
export interface RawContact {
  agency?: string | null
  name?: string | null
  primaryContact?: string | null
  alternateContact?: string | null
  type?: string | null
  callReason?: string | null
  instructions?: string | null
}

export interface RawContactLink {
  label?: string | null
  description?: string | null
  url?: string | null
}

export interface RawContacts {
  contacts?: RawContact[] | null
  links?: RawContactLink[] | null
}

/** A way to reach someone: a number to dial, an address to mail, or neither. */
export interface Reach {
  /** As written in the list - shown as is, so it matches what others see. */
  text: string
  /** tel: or mailto:, or undefined when it is neither and stays plain text. */
  href?: string
}

export interface Contact {
  agency: string
  name: string
  type: string
  callReason: string
  instructions?: string
  primary?: Reach
  alternate?: Reach
  /** Lower-cased haystack for the search box. */
  searchText: string
}

export interface ContactLink {
  label: string
  description?: string
  url: string
}

export interface ContactGroup {
  reason: string
  contacts: Contact[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Turns "801-718-8645" into a tap-to-call link and "x@ap.org" into a mail
 * link. Anything else - a bare extension, a note - is left as text rather
 * than made into a link that dials the wrong thing.
 */
export function reachOf(value: unknown): Reach | undefined {
  const written = text(value)
  if (written === '') return undefined
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(written)) {
    return { text: written, href: `mailto:${written}` }
  }
  const digits = written.replace(/[^\d+]/g, '')
  // Seven digits is the shortest thing worth dialling; fewer is not a number.
  if (digits.replace(/\D/g, '').length >= 7) return { text: written, href: `tel:${digits}` }
  return { text: written }
}

export function parseContacts(raw: RawContacts | null | undefined): {
  contacts: Contact[]
  links: ContactLink[]
} {
  const contacts = (raw?.contacts ?? []).map((row): Contact => {
    const agency = text(row?.agency)
    const name = text(row?.name)
    const type = text(row?.type)
    const callReason = text(row?.callReason) || 'Other'
    const instructions = text(row?.instructions) || undefined
    return {
      agency,
      name: name || agency || 'Unnamed contact',
      type,
      callReason,
      instructions,
      primary: reachOf(row?.primaryContact),
      alternate: reachOf(row?.alternateContact),
      searchText: [agency, name, type, callReason, instructions]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }
  })
  const links = (raw?.links ?? []).flatMap((row): ContactLink[] => {
    const url = text(row?.url)
    // Only a real web address becomes a link.
    if (!/^https?:\/\//i.test(url)) return []
    return [{ label: text(row?.label) || url, description: text(row?.description) || undefined, url }]
  })
  return { contacts, links }
}

/**
 * Grouped by why you would call, in the order the list gives them.
 *
 * The backend's order is somebody's deliberate order - the sheriffs under
 * "Reporting an Earthquake" first, help further down - so it is kept rather
 * than sorted alphabetically into something nobody chose.
 */
export function groupByReason(contacts: Contact[]): ContactGroup[] {
  const groups = new Map<string, Contact[]>()
  for (const contact of contacts) {
    const group = groups.get(contact.callReason)
    if (group) group.push(contact)
    else groups.set(contact.callReason, [contact])
  }
  return [...groups].map(([reason, members]) => ({ reason, contacts: members }))
}

/** Every word must appear somewhere: "box elder" finds the Box Elder sheriff. */
export function filterContacts(contacts: Contact[], query: string): Contact[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return contacts
  return contacts.filter((contact) => words.every((word) => contact.searchText.includes(word)))
}
