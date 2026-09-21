#!/usr/bin/env node
/**
 * Profiles a catalog dump before trusting it.
 *
 *   node scripts/audit-catalog.mjs sample-data/sept9-catalog.json
 *
 * Written after a production dump blanked the event list: a field the tame
 * database always carried was absent on 93 of 1768 rows, and the type said it
 * was required. The point of this script is to answer "what is in this file
 * that was not in the last one" in one pass, rather than discovering it a
 * component at a time.
 *
 * It reports, it does not judge. Anything it flags is a question for whoever
 * knows the pipeline, not automatically a bug.
 */
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (path === undefined) {
  console.error('usage: node scripts/audit-catalog.mjs <catalog.json>')
  process.exit(2)
}

const payload = JSON.parse(readFileSync(path, 'utf8'))
// Accepts the raw reply, its data envelope, or a bare array - dumps get saved
// at whichever level the person had in hand.
const events = payload?.data?.events ?? payload?.events ?? payload?.data ?? payload
if (!Array.isArray(events)) {
  console.error('no event array found in', path)
  process.exit(2)
}

const pct = (n) => `${((100 * n) / events.length).toFixed(1)}%`
const tally = (fn) => {
  const counts = new Map()
  for (const event of events) {
    const key = String(fn(event))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}
const show = (rows, limit = 12) =>
  rows.slice(0, limit).map(([k, n]) => `${k}=${n}`).join('  ') +
  (rows.length > limit ? `  (+${rows.length - limit} more)` : '')

console.log(`${path}\n${events.length} events\n`)

/* Which fields are actually optional, as opposed to optional in the type. */
console.log('FIELD PRESENCE')
const fields = new Map()
for (const event of events) {
  for (const [key, value] of Object.entries(event)) {
    const seen = fields.get(key) ?? { count: 0, types: new Set() }
    seen.count += 1
    seen.types.add(value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)
    fields.set(key, seen)
  }
}
for (const [key, seen] of [...fields].sort((a, b) => b[1].count - a[1].count)) {
  const missing = events.length - seen.count
  const flag = missing > 0 ? `  MISSING on ${missing} (${pct(missing)})` : ''
  console.log(`  ${key.padEnd(30)} ${String(seen.count).padStart(5)}  ${[...seen.types].join('|')}${flag}`)
}

/* Values that are placeholders rather than measurements. */
console.log('\nSENTINELS AND PLACEHOLDERS')
const unlocated = events.filter((e) => e.latitude === 0 && e.longitude === 0 && e.depth === 0)
const halfZero = events.filter(
  (e) => (e.latitude === 0) !== (e.longitude === 0),
)
console.log(`  lat/lon/depth all zero      ${unlocated.length} (${pct(unlocated.length)})`)
console.log(`  lat or lon zero, not both   ${halfZero.length}  <- would break the all-three rule`)
const mags = events.map((e) => e.magnitude).filter((m) => typeof m === 'number')
if (mags.length > 0) {
  const sorted = [...mags].sort((a, b) => a - b)
  console.log(`  magnitude range             ${sorted[0]} .. ${sorted[sorted.length - 1]}`)
  const suspicious = tally((e) => e.magnitude).filter(
    ([value, n]) => n > 5 && (Number(value) <= -9 || Number(value) === 0),
  )
  if (suspicious.length > 0) console.log(`  repeated round values       ${show(suspicious)}`)
}

/* Enumerations, where a new value is the thing to notice. */
console.log('\nDOMAINS')
for (const key of [
  'eventType',
  'reviewStatus',
  'originSource',
  'geographicType',
  'magnitudeType',
  'version',
]) {
  if (!fields.has(key)) continue
  console.log(`  ${key.padEnd(16)} ${show(tally((e) => e[key] ?? '(absent)'))}`)
}

/* Two rows for one instant means two ids for one earthquake. */
console.log('\nDUPLICATE ORIGIN TIMES')
const byTime = new Map()
for (const event of events) {
  const ms = Math.round(event.originTime / 1e6)
  if (!byTime.has(ms)) byTime.set(ms, [])
  byTime.get(ms).push(event)
}
const collisions = [...byTime.values()].filter((rows) => rows.length > 1)
const rowsInCollisions = collisions.reduce((n, rows) => n + rows.length, 0)
console.log(`  instants with more than one event   ${collisions.length}`)
console.log(`  events involved                     ${rowsInCollisions} (${pct(rowsInCollisions)})`)
if (collisions.length > 0) {
  console.log(
    `  sources that collide                ${show(
      [...collisions.reduce((counts, rows) => {
        const key = rows.map((r) => r.originSource).sort().join(' + ')
        counts.set(key, (counts.get(key) ?? 0) + 1)
        return counts
      }, new Map())].sort((a, b) => b[1] - a[1]),
    )}`,
  )
  const example = collisions[0]
  console.log('  example:')
  for (const row of example) {
    console.log(
      `    id ${row.eventIdentifier}  ${String(row.eventType).padEnd(12)} ${String(row.reviewStatus).padEnd(11)}` +
        ` ${String(row.originSource).padEnd(7)} located=${!(row.latitude === 0 && row.longitude === 0)}`,
    )
  }
}

/* A source contributing only unlocated rows is a source worth questioning. */
console.log('\nBY ORIGIN SOURCE')
for (const [source] of tally((e) => e.originSource)) {
  const rows = events.filter((e) => String(e.originSource) === source)
  const un = rows.filter((e) => e.latitude === 0 && e.longitude === 0 && e.depth === 0).length
  const noPhases = rows.filter((e) => e.numberOfDefiningPhases === undefined).length
  console.log(
    `  ${source.padEnd(8)} ${String(rows.length).padStart(5)}   unlocated ${String(un).padStart(4)}` +
      `   no phase count ${String(noPhases).padStart(4)}`,
  )
}

console.log('\nTIME SPAN')
const times = events.map((e) => e.originTime / 1e6).sort((a, b) => a - b)
console.log(`  ${new Date(times[0]).toISOString()} .. ${new Date(times[times.length - 1]).toISOString()}`)
