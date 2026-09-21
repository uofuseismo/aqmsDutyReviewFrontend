# sample-data

Captured API responses, for shaping the UI against real data.

Drop raw JSON here - ideally the *whole* response including the
`{"message": ..., "data": ...}` envelope, exactly as the backend sent it,
rather than a hand-trimmed excerpt. The envelope and the empty/null fields
are the parts that decide what the TypeScript types have to tolerate.

Helpful in a filename or alongside: which route it came from, and whether it
is a full page or a truncated sample.

Git-ignored: these can be large, may reflect a particular database at a
particular moment, and are not the app's source of truth.
