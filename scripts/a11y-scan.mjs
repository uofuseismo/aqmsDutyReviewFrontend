#!/usr/bin/env node
/*
  Runs axe-core over the app's real screens, in a real browser.

    npx vite preview --port 4173
    google-chrome --headless=new --remote-debugging-port=9222 about:blank
    node scripts/a11y-scan.mjs          # W=430 DARK=1 for the phone, dark case

  Every API call is intercepted and answered from sample-data, so the scan
  needs no backend and always sees the same screens.

  Written because these are far easier to fix the day the markup is written
  than the day a scan report arrives. It has already found seven unnamed
  Leaflet markers, a tablist whose aria-owns pointed at ids that did not
  exist, and - only at phone width - three step buttons whose labels are
  hidden below `md`. Run it at both widths and both themes: they differ.
*/
import { readFileSync } from 'node:fs'
const ROOT = new URL('..', import.meta.url).pathname
const D = `${ROOT}sample-data/`
const AXE = readFileSync(`${ROOT}node_modules/axe-core/axe.min.js`, 'utf8')
const CAT = JSON.parse(readFileSync(D + 'sept9-catalog.json', 'utf8'))
const DETAIL = JSON.parse(readFileSync(D + 'event-31152986.json', 'utf8'))
const WAVES = JSON.parse(readFileSync(D + '31152986-waveforms.json', 'utf8'))
const STATIONS = JSON.parse(readFileSync(D + 'stations.json', 'utf8'))
// A 1x1 png, so tile requests resolve without reaching Stadia.
const TILE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
CAT.data.events.unshift({ ...CAT.data.events.find(e => e.latitude !== 0), eventIdentifier: 31152986 })

const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const iat = Math.floor(Date.now() / 1000)
const JWT = `${b64({ alg: 'EdDSA', typ: 'JWT' })}.${b64({ sub: 'bbaker', iss: 'aqms', iat, exp: iat + 7200, permission: 'admin' })}.c3R1Yg`

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
let id = 0; const pending = new Map(); const seen = []
const send = (m, p = {}) => new Promise((res, rej) => { const my = ++id
  pending.set(my, x => x.error ? rej(new Error(x.error.message)) : res(x.result))
  ws.send(JSON.stringify({ id: my, method: m, params: p })) })
ws.addEventListener('message', async (msg) => {
  const x = JSON.parse(msg.data)
  if (x.id && pending.has(x.id)) { pending.get(x.id)(x); pending.delete(x.id); return }
  if (x.method) seen.push(x.method)
  if (x.method === 'Fetch.requestPaused') {
    const { requestId, request } = x.params
    const json = (b) => send('Fetch.fulfillRequest', { requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(b)).toString('base64') }).catch(() => {})
    const u = request.url
    if (u.includes('stadiamaps.com')) await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: TILE }).catch(() => {})
    else if (u.includes('/auth/login')) await json({ message: 'ok', data: { jwt: JWT } })
    else if (u.includes('/station-information')) await json(STATIONS)
    else if (u.includes('/settings')) await json({ message: 'ok', data: { stadiaMapKey: 'k' } })
    else if (u.includes('/event-information/locks')) await json({ message: 'ok', data: [] })
    else if (u.includes('/event-information/catalog')) await json(CAT)
    else if (u.includes('/waveforms/')) await json(WAVES)
    else if (/\/event-information\/\d+/.test(u)) await json(DETAIL)
    else await send('Fetch.continueRequest', { requestId }).catch(() => {})
  }
})
await new Promise(r => ws.addEventListener('open', r))
const js = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value
await send('Page.enable'); await send('Runtime.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
await send('Emulation.setDeviceMetricsOverride', { width: +(process.env.W || 1440), height: 1000, deviceScaleFactor: 1, mobile: (+(process.env.W || 1440)) < 600 })
if (process.env.DARK) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })

const scan = async (name) => {
  /*
    Re-injected before EVERY scan, deliberately.

    This is a single-page app, so the document survives every navigation and
    so does axe - along with the DOM tree it cached on the first page it saw.
    Reusing that instance made `aria-required-children` report
    "inapplicable" on a page carrying two tablists: a clean bill of health
    for markup it had never looked at. A fresh instance per scan costs a few
    hundred milliseconds and measures the page actually on screen.
  */
  const injected = await js(AXE + ';typeof axe')
  if (injected !== 'object' && injected !== 'function') {
    console.log(`\n### ${name}\n   AXE DID NOT INJECT (typeof axe = ${JSON.stringify(injected)})`)
    failures += 1
    return
  }
  /*
    Three outcomes, kept apart: axe found nothing, axe found something, axe
    never ran. Collapsing the third into the first is how a broken scan
    reports a clean bill of health - it happened here, from an unbalanced
    try block, and every page came back "no violations" for a run that threw
    before axe was reached.
  */
  const raw = await js(`(async () => {
    try {
      const r = await axe.run(document, { resultTypes: ['violations'],
        runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'] } })
      return JSON.stringify({ ok: true, violations: r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help, n: v.nodes.length,
        example: v.nodes[0] ? v.nodes[0].target.join(' ').slice(0, 90) : '',
        /* Double-escaped on purpose: this source is inside a template
           literal, so a single backslash-n would become a real newline in
           the string sent to the browser and break the string literal. */
        why: v.nodes[0] ? (v.nodes[0].failureSummary || '').split('\\n').filter(Boolean).slice(-1)[0].slice(0, 120) : ''
      })) })
    } catch (error) {
      return JSON.stringify({ ok: false, error: String((error && error.message) || error) })
    }
  })()`)

  /* The URL and a landmark, so a scan of the wrong page is visible. */
  const where = await js(`JSON.stringify({ path: location.pathname,
    heading: (document.querySelector('h1') || {}).textContent || '',
    steps: !!document.querySelector('[id$=":list"][role=tablist]') })`)
  console.log(`\n### ${name}  ${where}`)

  if (raw === undefined || raw === null) {
    console.log('   AXE DID NOT RUN - the page evaluate returned nothing')
    failures += 1
    return
  }
  const result = JSON.parse(raw)
  if (result.ok !== true) {
    console.log('   AXE FAILED:', result.error)
    failures += 1
    return
  }
  /*
    A canary, because this script has already lied twice.

    If the page contains a role=tablist, then `aria-required-children` MUST at
    least be applicable - it either passes or fails, but it cannot be
    "inapplicable". When it is, axe measured something other than the document
    on screen, and every other rule in that run is equally untrustworthy. This
    happens reproducibly here and the cause is not yet understood: a
    hand-driven injection into the same page, same build, same server finds
    the violation that this script does not.

    Until that is resolved, treat a warned run as no run.
  */
  const canary = await js(`(async () => {
    if (document.querySelectorAll('[role=tablist]').length === 0) return 'n/a'
    const r = await axe.run(document, { runOnly: { type: 'rule', values: ['aria-required-children'] } })
    return r.inapplicable.length > 0 && r.violations.length === 0 && r.passes.length === 0
      ? 'inapplicable'
      : 'ok'
  })()`)
  if (canary === 'inapplicable') {
    console.log('   UNRELIABLE: axe called aria-required-children inapplicable on a page')
    console.log('               containing a tablist. This run measured the wrong DOM.')
    failures += 1
  }

  const violations = result.violations
  if (violations.length === 0) {
    console.log('   no violations')
    return
  }
  const rank = { critical: 0, serious: 1, moderate: 2, minor: 3 }
  for (const v of violations.sort((a, b) => rank[a.impact] - rank[b.impact])) {
    console.log(`   [${String(v.impact).padEnd(8)}] ${v.id.padEnd(28)} x${String(v.n).padStart(3)}  ${v.help}`)
    console.log(`              ${v.example}`)
    if (v.why) console.log(`              ${v.why}`)
  }
}

let failures = 0

const goto = async (url) => {
  await send('Page.navigate', { url })
  const dl = Date.now() + 20000
  while (!seen.includes('Page.loadEventFired') && Date.now() < dl) await new Promise(r => setTimeout(r, 100))
  seen.length = 0
  await new Promise(r => setTimeout(r, 900))
}

/*
  ONE fresh document per scan, and exactly one axe.run in it.

  axe-core misbehaves when it is injected repeatedly into a single-page app's
  long-lived document: after the first scan it reported
  `aria-required-children` as INAPPLICABLE on a page carrying two tablists -
  a clean result for markup it never examined. Reloading between scans is
  slower and is the only arrangement measured to give the same answer as a
  hand-driven browser.

  The token lives in memory, so every reload lands on the login screen and
  then on the address that was asked for. That is the app's own behaviour.
*/
const set = (sel, v) => js(`(()=>{const el=document.querySelector('${sel}')
  if(!el) return
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(v)})
  el.dispatchEvent(new Event('input',{bubbles:true}))})()`)

const signIn = async () => {
  await set('input[name=username]', 'bbaker')
  await set('input[name=password]', 'stub')
  await js(`document.querySelector('button[type=submit]')?.click()`)
  await new Promise(r => setTimeout(r, 2500))
}

/** Loads a screen from scratch and scans it once. */
let visitCount = 0
const visit = async ({ name, url, signedIn = true, settle = 1200, before }) => {
  /*
    A unique query on every navigation. Page.navigate to the URL already
    showing does not reload - no load event fires, the wait times out, and the
    scan silently runs on the previous document with axe already injected into
    it. The app's router ignores the query.
  */
  visitCount += 1
  const separator = url.includes('?') ? '&' : '?'
  await goto(`${url}${separator}scan=${visitCount}`)
  if (signedIn) await signIn()
  if (before) { await before(); }
  await new Promise(r => setTimeout(r, settle))
  await scan(name)
}

const EVENT = 'http://127.0.0.1:4173/events/31152986'
const clickTab = (pattern) =>
  js(`(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(e=>/${pattern}/.test(e.textContent)); if(t) t.click()})()`)

await visit({ name: 'Login screen', url: 'http://127.0.0.1:4173/', signedIn: false })
await visit({ name: 'Event list', url: 'http://127.0.0.1:4173/' })
await visit({ name: 'Event review - Location, waveforms', url: EVENT, settle: 3000 })
await visit({
  name: 'Event review - Location, map',
  url: EVENT,
  settle: 2000,
  before: async () => { await clickTab('Map') },
})
await visit({
  name: 'Event review - Magnitude',
  url: EVENT,
  settle: 2000,
  before: async () => { await clickTab('^Magnitude') },
})
await visit({
  name: 'Event review - Summary',
  url: EVENT,
  settle: 1600,
  before: async () => { await clickTab('^Summary') },
})
await visit({
  name: 'Event review - Summary, confirmation open',
  url: EVENT,
  settle: 1600,
  before: async () => {
    await clickTab('^Summary')
    await new Promise(r => setTimeout(r, 900))
    await js(`[...document.querySelectorAll('button')].find(b=>/^Accept$/.test(b.textContent.trim()))?.click()`)
  },
})

if (failures > 0) {
  console.log(`\n${failures} scan(s) did not run. Treat this report as incomplete.`)
  process.exitCode = 1
}
