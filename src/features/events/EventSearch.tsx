import { CloseButton, Input, InputGroup } from '@chakra-ui/react'
import { LuSearch } from 'react-icons/lu'

export function EventSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <InputGroup
      maxW={{ base: 'full', sm: '18rem' }}
      startElement={<LuSearch aria-hidden />}
      endElement={
        value ? (
          <CloseButton
            size="xs"
            variant="plain"
            aria-label="Clear the filter"
            onClick={() => onChange('')}
            // Keeps the clear button out of the path between the box and the
            // list; Escape does the same job from the keyboard.
            tabIndex={-1}
          />
        ) : undefined
      }
    >
      <Input
        /*
          Named and identified explicitly. This input is not inside a
          Field.Root, so nothing generates an id for it, and Chrome reports an
          input with neither id nor name as a form issue - autofill and
          assistive tech both use one to refer to a control.
        */
        id="event-filter"
        name="event-filter"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            onChange('')
          }
        }}
        placeholder="Filter by event ID"
        aria-label="Filter events by identifier"
        // Not inputMode="numeric": the box also takes ^ and $ to anchor a
        // search, and a numeric keypad would hide them on a phone.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        size="sm"
      />
    </InputGroup>
  )
}
