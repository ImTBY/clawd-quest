import { expect, mock, test } from 'claude-code/testing'
import type { MockClock, Plugin, TestBody } from 'claude-code/testing'

import { fakeFs } from './fakeFs'
import {
  activityFor, addedText, ago, checkCommand, detailFor, fmt, folderKeys, genErrorText, isScratchChat, levelLabel, levelNote, listText, matchTarget, moodFor, normArgs, normProject, petAscii,
  QUESTS_HELP, relativePath, shortReq, streakText, toastText, trophyFold, wallSecs, xpLabel,
} from './register'
import { boardKey, checkHint, projectId, projectKeys } from './projectQuests'
import { ACHIEVEMENTS, availableHats, levelOf, migrateProfile, newProfile, questsForDay, RECENT_SIZE, STAR_XP, titleOf, XP_AT } from './game'
import { unlocksBetween } from './decor'
import { doneBeat, usageQuips } from './quips'
import { stationOf } from './scene'
import type { Profile } from '../types'

const MOODS = ['idle', 'thinking', 'coding', 'reading', 'running', 'working', 'done', 'error', 'sleeping', 'happy'] as const
const PANE = { plugin: 'clawd-quest', component: 'Pane', requestId: 'clawd-quest', props: { title: 'Clawd', isFocused: false, bodyColumns: 60, placement: 'dock' } } as const
const SPINNER = { plugin: 'clawd-quest', component: 'Spinner', requestId: 'main', props: { word: 'Zzorbling', message: null, suffix: '', mode: 'thinking' } } as const
const REF = { helpers: 'helpers', pet: 'pet', stats: 'stats', board: 'board', profile: 'profile', questGen: 'questGen', scene: 'scene' } as const
// A Monday morning, so no weekend or night achievements get in the way.
const START = new Date(2026, 9, 5, 10, 0, 0).getTime()
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type Dollar = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const CWD = '/work/demo-app'
const KEY = boardKey('demo-app', CWD)
const PK = projectKeys('demo-app', CWD)
const OTHER = '/work/other-app'
const OK = projectKeys('other-app', OTHER)
const PRESENTATION = { isFullscreen: false, columns: 100 }

// Reads the mod's $.state through a small inline plugin (the test's own $ has no state noun).
const PROBE: Plugin = {
  name: 'probe',
  register: on => {
    on('command.run', { command: 'probe' }, async ($, e) => {
      let got: { value?: unknown }
      switch (e.args) {
        case 'pet': got = await $.state.get({ plugin: 'clawd-quest', key: 'pet' }); break
        case 'stats': got = await $.state.get({ plugin: 'clawd-quest', key: 'stats' }); break
        case 'board': got = await $.state.get({ plugin: 'clawd-quest', key: 'board' }); break
        case 'profile': got = await $.state.get({ plugin: 'clawd-quest', key: 'profile' }); break
        case 'scene': got = await $.state.get({ plugin: 'clawd-quest', key: 'scene' }); break
        case 'helpers': got = await $.state.get({ plugin: 'clawd-quest', key: 'helpers' }); break
        case 'usage': got = await $.state.get({ plugin: 'clawd-quest', key: 'usage' }); break
        case 'celebrate': got = await $.state.get({ plugin: 'clawd-quest', key: 'celebrate' }); break
        case 'customHat': got = await $.state.get({ plugin: 'clawd-quest', key: 'customHat' }); break
        case 'isHidden': got = await $.state.get({ plugin: 'clawd-quest', key: 'isHidden' }); break
        case 'combo': got = await $.state.get({ plugin: 'clawd-quest', key: 'combo' }); break
        default: got = await $.state.get({ plugin: 'clawd-quest', key: 'questGen' })
      }
      return { text: JSON.stringify(got.value ?? null) }
    })
  },
}
const WITH_PROBE = { plugins: [PROBE], timeoutMs: 20_000 }

// Lets the deferred hook work (clock.after(0) chains) and its timers at 0 ms run to the end.
async function flush(clock: MockClock): Promise<void> {
  for (let i = 0; i < 8; i++) await clock.settle()
}

async function get<T>($: Dollar, key: string): Promise<T> {
  const reply = await $.command.run({ command: 'probe', args: key, origin: { kind: 'composer' }, presentation: PRESENTATION } as never)
  return JSON.parse(String((reply as { text?: string }).text ?? 'null')) as T
}

// The world beneath the mod: a session in CWD, a store, a clock, tools that succeed, toasts recorded.
type Model = (ask: { prompt?: string; model?: string }) => Promise<unknown> | unknown

// One store behind every session of a test, so a test can act as a second session or folder.
function sharedStore(on: On, mem: Map<string, unknown>): void {
  const copy = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)) as unknown)
  on('store.get', (_$, e) => ({ value: copy(mem.get(e.key)) }) as never)
  on('store.set', (_$, e) => {
    mem.set(e.key, copy(e.value))
    return { value: undefined } as never
  })
  on('store.delete', (_$, e) => {
    mem.delete(e.key)
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: [...mem.keys()] }) as never)
}

const SUMMARY = [{ role: 'user', text: 'Summary so far.', toolUses: [] }]

type World = {
  mem?: Map<string, unknown>; cwd?: () => string; compact?: () => unknown; files?: Record<string, string>; reads?: string[]
  panes?: () => unknown[]           // what $.ui.panes() lists
  open?: () => unknown              // what $.ui.open answers
  opens?: unknown[]                 // every $.ui.open call
  closes?: unknown[]                // every $.ui.close call
  tool?: (e: unknown) => unknown    // what a tool call answers
  prompt?: (e: { text: string }) => unknown
  tabs?: boolean                    // a desktop surface is attached (copy names the tabs)
  surfaces?: () => string[]         // the attached surfaces, read each time (overrides tabs)
  headless?: boolean                // a -p run: no surface, no person
  failSet?: boolean                 // every store write fails
  sid?: () => string                // $.session.id()
  listGate?: () => Promise<void>    // holds $.fs.list (the setup) until it resolves
  cwdGate?: () => Promise<void>     // holds $.session.cwd (the setup, before it knows the project) until it resolves
  noStart?: boolean                 // boot without the first session.start
  usage?: (e: unknown) => unknown   // what $.session.usage answers
}

async function boot($: Dollar, on: On, entries: Record<string, unknown> = {}, model?: Model, world?: World): Promise<{ clock: MockClock; toasts: string[]; toastMs: Array<number | undefined> }> {
  const clock = mock.clock(on, { now: START })
  if (world?.failSet) {
    on('store.get', () => ({ value: undefined }) as never)
    on('store.set', () => {
      throw new Error('disk full')
    })
    on('store.delete', () => ({ value: undefined }) as never)
    on('store.keys', () => ({ value: [] }) as never)
  } else if (world?.mem) sharedStore(on, world.mem)
  else mock.store(on, entries)
  const toasts: string[] = []
  const toastMs: Array<number | undefined> = [] // each toast's timeout, in the same order
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    toastMs.push(e.timeoutMs)
    return { value: undefined } as never
  })
  on('session.cwd', async () => {
    await world?.cwdGate?.()
    return { value: world?.cwd?.() ?? CWD } as never
  })
  on('session.turns', () => ({ value: 0 }) as never)
  if (world?.files) fakeFs(on, world.files, world.reads ?? [])
  else on('fs.list', async () => {
    await world?.listGate?.()
    return { value: [] } as never
  })
  if (world?.usage) on('session.usage', (_$, e) => ({ value: world.usage!(e) }) as never)
  on('session.surfaces', () => ({ value: world?.surfaces?.() ?? (world?.headless ? [] : world?.tabs ? ['terminal', 'desktop'] : ['terminal']) }) as never)
  on('session.id', () => ({ value: world?.sid?.() ?? 'session-1' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.open', (_$, e) => {
    world?.opens?.push(e)
    return { value: world?.open?.() ?? { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    world?.closes?.push(e)
    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: world?.panes?.() ?? [] }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('session.attach', (_$, e) => ({ clientId: e.clientId }) as never)
  on('prompt.submit', (_$, e) => (world?.prompt?.(e as { text: string }) ?? { text: e.text }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('turn.start', (_$, e) => ({ turnId: (e as { turnId: string }).turnId }) as never)
  on('tool.call', (_$, e) => (world?.tool?.(e) ?? { result: 'ok' }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }) as never)
  on('session.compact', () => (world?.compact?.() ?? { messages: SUMMARY }) as never)
  if (model) on('model.complete', async (_$, e) => ({ value: await model(e as { prompt?: string; model?: string }) }) as never)
  const headless = world?.headless === true
  if (!world?.noStart) await $.session.start({ cwd: world?.cwd?.() ?? CWD, surface: headless ? null : 'terminal', isInteractive: !headless } as never)
  await flush(clock)
  return { clock, toasts, toastMs }
}

const prompt = ($: Dollar, text: string, turnId?: string) =>
  $.prompt.submit({ text, wait: false, origin: { kind: 'composer' }, ...(turnId ? { turnId } : {}) } as never)

const turnDone = ($: Dollar, reason: 'answer' | 'aborted' | 'error') =>
  $.turn.complete({ answer: '', durationMs: 1000, isAborted: reason === 'aborted', turnId: 't1', reason } as never)

const edit = ($: Dollar, file: string, agentId?: string) =>
  $.tool.call({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b', ...(agentId ? { agentId } : {}) } as never)

const bash = ($: Dollar, command: string) => $.tool.call({ tool: 'Bash', command } as never)

function boardWith(project: string, extra: Record<string, unknown> = {}) {
  return {
    project, campaign: 'Test Run', createdAt: START, isComplete: false, hats: [],
    items: [{ id: 'pq0', title: 'Edit thrice', role: 'warmup', check: { type: 'tally', activity: 'edit', path: '', seen: [] }, goal: 3, progress: 0, xp: 25, why: '', done: false }],
    milestones: [],
    ...extra,
  }
}

// ---------- pure helpers ----------

test('classifies tool calls', async () => {
  expect(activityFor('Edit', {})).toBe('edit')
  expect(activityFor('Grep', {})).toBe('search')
  expect(activityFor('Bash', { command: 'git status' })).toBe('git')
  expect(activityFor('Bash', { command: 'cd x && git push' })).toBe('git')
  expect(activityFor('PowerShell', { command: 'terraform plan' })).toBe('terraform')
  expect(activityFor('Bash', { command: 'npm test' })).toBe('test')
  expect(activityFor('Bash', { command: 'ls -la' })).toBe('shell')
  expect(activityFor('Agent', {})).toBe('agent')
  expect(moodFor('web')).toBe('reading')
  expect(moodFor(activityFor('Write', {}))).toBe('coding')
})

test('terminal sprite keeps its height', async () => {
  for (const mood of MOODS) for (const f of [0, 1, 2, 3]) expect(petAscii(mood, f)).toHaveLength(4)
})

test('R4: the error shake moves the whole sprite and keeps both claws', async () => {
  const blocks = (rows: string[]) => rows.map(l => l.trim())
  const still = petAscii('error', 1)
  const shaken = petAscii('error', 0)
  expect(blocks(shaken)).toEqual(blocks(still))
  expect(shaken[1]).toBe(' ' + still[1]!.slice(0, -1))
  expect(shaken[1]!.includes('▝▜█████▛▘')).toBe(true)
  // every frame of every mood has one width, so the text beside the sprite never jitters
  const widths = new Set(MOODS.flatMap(mood => [0, 1, 2, 3, 8].flatMap(f => petAscii(mood, f).map(l => l.length))))
  expect([...widths]).toEqual([10])
})

test('scratch folders are one project; quest targets per activity', async () => {
  expect(normProject('scratch-2026-01-01-abc123')).toBe('scratch')
  expect(normProject('acme-cicd')).toBe('acme-cicd')
  expect(relativePath('C:\\Work\\App\\src\\main.ts', 'c:/work/app')).toBe('src/main.ts')
  expect(relativePath('/other/x.ts', '/work/app')).toBe('/other/x.ts')
  expect(matchTarget('edit', { file_path: 'C:\\Work\\App\\modules\\a.tf' }, 'C:\\Work\\App\\')).toBe('modules/a.tf')
  expect(matchTarget('search', { path: 'src', pattern: 'TODO' }, '')).toBe('src TODO')
  expect(matchTarget('web', { query: 'terraform docs' }, '')).toBe('terraform docs')
  expect(matchTarget('agent', { description: 'review the module' }, '')).toBe('review the module')
  expect(matchTarget('test', { command: 'npm test' }, '')).toBe('npm test')
  expect(relativePath('/work/app/./src/x.ts', '/work/app')).toBe('./src/x.ts')
  expect(addedText({ edits: [{ new_string: '// eslint-disable' }, { new_string: 'x' }] })).toBe('// eslint-disable\nx')
  expect(addedText({ content: 'a'.repeat(30_000) }).length).toBe(20_000)
  expect(addedText({ command: 'ls' })).toBe('')
})

test('one toast per pass: the most important item leads', async () => {
  expect(toastText([])).toBe(undefined)
  expect(toastText([{ rank: 4, text: 'Quest done: A', short: 'A' }])).toEqual({ text: 'Quest done: A', timeoutMs: 3500 })
  const merged = toastText([
    { rank: 4, text: 'Quest done: A', short: 'A' },
    { rank: 6, text: 'New decor: Tea', short: 'decor Tea' },
    { rank: 0, text: 'Level up!', short: 'level 3' },
    { rank: 2, text: 'Trophy unlocked: B', short: 'B' },
  ])
  expect(merged).toEqual({ text: 'Level up!  ·  Also: B, A (+1 more)', timeoutMs: 3500 })
  // a long line stays up longer, never past 9 s
  expect(toastText([{ rank: 1, text: 'x'.repeat(100), short: 'x' }])?.timeoutMs).toBe(6000)
  expect(toastText([{ rank: 1, text: 'x'.repeat(400), short: 'x' }])?.timeoutMs).toBe(9000)
})

// ---------- the pane ----------

// These two seed the legacy global 'profile' key: the project the pane loads adopts it.
test('progress persists: a stored profile shows its level', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on, { profile: { version: 1, xp: 500 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ text: /^Lv 5 · Apprentice/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /^ *\d+\/\d+ xp$/ })) !== undefined).toBe(true)
})

test('the Daily Sweep waits for its claim button and pays once', async ($, on) => {
  const day = '2026-10-05' // START's day
  const done = (id: string) => ({ id, title: id, goal: 1, progress: 1, xp: 7, done: true })
  const today = { day, items: [done('prompts'), done('turns'), done('tools')] }
  const mem = new Map<string, unknown>([[PK.profile, { version: 1, xp: 50, totals: { tools: 9 }, quests: today, sweeps: 1, sweepClaimed: '' }]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  // the Room shows it where the next quest would be, the Quests tab too
  expect((await ui.find({ key: 'claim-sweep' }))?.props.label).toBe('Claim +15 xp')
  expect((await ui.find({ key: 'all-quests' })) === undefined).toBe(true)
  expect((await ui.find({ key: 'all-trophies' })) === undefined).toBe(true)
  await ui.press({ key: 'tab-quests' })
  expect((await ui.find({ key: 'claim-sweep' })) !== undefined).toBe(true)
  const before = stored(mem, PK.profile)?.xp ?? 0
  await ui.press({ key: 'claim-sweep' })
  await flush(clock)
  const after = stored(mem, PK.profile)?.xp ?? 0
  expect(after - before >= 15).toBe(true) // the bonus, plus any trophy the stored totals already earned
  expect(stored(mem, PK.profile)?.sweepClaimed).toBe(day)
  expect(stored(mem, PK.profile)?.recent?.at(-1)?.verb).toBe('Daily Sweep')
  expect(toasts.some(t => t.includes('Daily Sweep claimed (+15 xp)'))).toBe(true)
  expect(toasts.some(t => /Daily Sweep claimed.*every daily quest done/i.test(t))).toBe(false)
  expect((await ui.find({ key: 'claim-sweep' })) === undefined).toBe(true)
  await prompt($, 'next')
  await flush(clock)
  expect(stored(mem, PK.profile)?.sweepClaimed).toBe(day)
  expect((await ui.find({ key: 'claim-sweep' })) === undefined).toBe(true)
})

test('R4: the Room shows the sweep claim while a project quest is still open', async ($, on) => {
  const done = (id: string) => ({ id, title: id, goal: 1, progress: 1, xp: 7, done: true })
  const mem = new Map<string, unknown>([
    [PK.profile, { version: 2, xp: 50, totals: { tools: 9 }, quests: { day: '2026-10-05', items: [done('prompts'), done('turns'), done('tools')] }, sweeps: 1, sweepClaimed: '' }],
    [KEY, boardWith('demo-app')],
  ])
  await boot($, on, {}, undefined, { mem })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ text: 'Edit thrice' })) !== undefined).toBe(true) // the open project quest is the next quest
  expect((await ui.find({ key: 'claim-sweep' }))?.props.label).toBe('Claim +15 xp')
  expect((await ui.find({ text: /All done for now/ })) === undefined).toBe(true)
})

test('after midnight the pane shows the new day quests before any event rolls them', async ($, on) => {
  // yesterday's quests, all done and unclaimed; no event has run today yet
  const done = (id: string) => ({ id, title: `old ${id}`, goal: 1, progress: 1, xp: 7, done: true })
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: 50, totals: { tools: 9 }, quests: { day: '2026-10-04', items: [done('prompts'), done('turns'), done('tools')] }, sweeps: 1, sweepClaimed: '' }]])
  await boot($, on, {}, undefined, { mem, noStart: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  const fresh = questsForDay('2026-10-05')
  await ui.press({ key: 'tab-quests' })
  expect((await ui.find({ text: /^Daily quests/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /0\/3 · resets at midnight/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /3\/3 · resets at midnight/ })) === undefined).toBe(true)
  expect((await ui.find({ text: /old prompts/ })) === undefined).toBe(true)
  expect((await ui.find({ text: fresh[0]!.title })) !== undefined).toBe(true)
  expect((await ui.find({ key: 'claim-sweep' })) === undefined).toBe(true)
  // the stored list stays untouched until an event rolls it
  expect(stored(mem, PK.profile)?.quests.day).toBe('2026-10-04')
})

test('a save from before the claim button does not pay its sweep twice', async ($, on) => {
  const done = (id: string) => ({ id, title: id, goal: 1, progress: 1, xp: 7, done: true })
  const mem = new Map<string, unknown>([[PK.profile, { version: 1, xp: 50, totals: { tools: 9 }, quests: { day: '2026-10-05', items: [done('prompts'), done('turns'), done('tools')] }, sweeps: 1 }]])
  await boot($, on, {}, undefined, { mem })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ key: 'claim-sweep' })) === undefined).toBe(true)
  expect((await ui.find({ text: /All done for now/ })) !== undefined).toBe(true)
})

test('Recent lists what the project earned, newest first, not tool calls', async ($, on) => {
  mock.clock(on, { now: START })
  const recent = [
    { verb: 'Quest done', what: 'Write 3 tests', at: START - 2 * 3_600_000 },
    { verb: 'Trophy', what: 'Night Owl', at: START - 5 * 60_000 },
  ]
  mock.store(on, { profile: { version: 1, xp: 50, totals: { tools: 9 }, recent } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ text: 'Night Owl' })) !== undefined).toBe(true)
  expect((await ui.find({ text: /5m ago/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /2h ago/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /Clawd logs each tool call/ })) === undefined).toBe(true)
})

test('recent entries: short ages, kept through a reload, capped', () => {
  expect(ago(10_000)).toBe('just now')
  expect(ago(5 * 60_000)).toBe('5m ago')
  expect(ago(3 * 3_600_000)).toBe('3h ago')
  expect(ago(50 * 3_600_000)).toBe('2d ago')
  const many = Array.from({ length: 9 }, (_, i) => ({ verb: 'Trophy', what: `T${i}`, at: i }))
  const p = migrateProfile({ version: 1, recent: [...many, { verb: 1 }, 'junk'] })
  expect(p.recent?.length).toBe(RECENT_SIZE)
  expect(p.recent?.at(-1)?.what).toBe('T8')
  expect(migrateProfile({ version: 1 }).recent).toBe(undefined)
})

test('a corrupt stored profile still draws the pane', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on, { profile: 'not a profile {' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ text: /^Lv 1 · Hatchling/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /Most tool calls earn xp/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /Every project folder has its own Clawd level/ })) !== undefined).toBe(true)
})

test('pane draws every tab on desktop and the room on terminal', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  on('tool.call', () => ({ deny: 'nope' }))
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal', props: PANE.props as never })
  expect((await terminal.find({ text: '▐▛███▜▌' })) !== undefined || (await terminal.find({ text: '▐█████▌' })) !== undefined).toBe(true)
  expect((await terminal.find({ text: 'Daily' })) !== undefined).toBe(true)
  expect((await terminal.find({ text: '/clawd' })) !== undefined).toBe(true)
  expect((await terminal.find({ text: /^Trophies \d+\/\d+ · / })) !== undefined).toBe(true)
  await terminal.unmount()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ type: 'Svg' })) !== undefined).toBe(true)
  for (const tab of ['quests', 'trophies', 'wardrobe', 'decor', 'room']) {
    await ui.press({ key: `tab-${tab}` })
    expect((await ui.drawn()) !== undefined).toBe(true)
  }
  await ui.press({ key: 'tab-trophies' })
  expect((await ui.find({ text: 'Trophies' })) !== undefined).toBe(true)
  expect((await ui.find({ text: 'Next up' })) !== undefined).toBe(true)
  // what each next trophy pays, as project trophies show it
  expect((await ui.find({ text: /\d+\/\d+ · \+(5|20|50|15) xp$/ })) !== undefined).toBe(true)
  const toggle = await ui.find({ key: 'toggle-locked' })
  expect(String(toggle?.props.label)).toMatch(/^Show all locked \(\d+\)$/)
  await ui.press({ key: 'toggle-locked' })
  expect((await ui.find({ key: 'toggle-locked' }))?.props.label).toBe('Hide locked')
  await ui.press({ key: 'tab-room' })

  await $.tool.call({ tool: 'Bash', command: 'false' } as never).catch(() => undefined)
  await flush(clock)
  const svg = await ui.find({ type: 'Svg' })
  expect(String(svg?.props.source).length > 1000).toBe(true)
  expect(String(svg?.props.alt)).toMatch(/^Clawd's room, /)
  expect((await ui.find({ text: /^This session|xp this session/ })) === undefined).toBe(true)
  // header line 3: the streak and what unlocks next
  expect((await ui.find({ text: /No streak · Next: Party Hat at Lv 2/ })) !== undefined).toBe(true)
})

test('spinner: own verb on both surfaces, the mini Clawd only on desktop', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  const words: string[] = []
  on('ui.render', { component: 'Spinner' }, (_$, e) => {
    const word = String((e.props as { word?: unknown }).word)
    words.push(word)
    return h('Text', null, word) as never
  })
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...SPINNER, surface, props: SPINNER.props as never })
    expect(words.length > 0).toBe(true)
    expect(words[words.length - 1]).not.toBe('Zzorbling')
    expect((await ui.find({ type: 'Svg' })) !== undefined).toBe(surface === 'desktop')
    await ui.unmount()
  }
})

// ---------- hooks: what counts ----------

test('subagents get mini Clawds and leave the main Clawd alone', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on)
  await prompt($, 'run the workflow')
  await flush(clock)
  await clock.advance(5000)
  await flush(clock)
  const before = (await get<{ mood: string }>($, REF.pet)).mood
  // Two agents of a workflow working: no Agent call in flight, only their own tool calls.
  await edit($, 'a.ts', 'wf-agent-1')
  await edit($, 'b.ts', 'wf-agent-2')
  await flush(clock)
  expect(await get<number>($, REF.helpers)).toBe(2)
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe(before)
  // Gone quiet for long enough: their mini Clawds leave.
  await clock.advance(95_000)
  await flush(clock)
  expect(await get<number>($, REF.helpers)).toBe(0)
})

test('a subagent tool call shows but does not count', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on)
  await prompt($, 'fix the build')
  await edit($, 'a.ts', 'agent-1')
  await flush(clock)
  expect((await get<{ tools: number }>($, REF.stats)).tools).toBe(0)
  await edit($, 'a.ts')
  await flush(clock)
  expect((await get<{ tools: number }>($, REF.stats)).tools).toBe(1)
})

test('an aborted turn earns no speedrun; a prompt with turnId keeps the counters', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on)
  const achievements = async () => Object.keys((await get<{ achievements: Record<string, number> }>($, REF.profile)).achievements)

  await prompt($, 'go')
  for (const f of ['a.ts', 'b.ts', 'c.ts']) await edit($, f)
  await turnDone($, 'aborted')
  await flush(clock)
  expect(await achievements()).not.toContain('speedrun')
  expect((await get<{ turns: number }>($, REF.stats)).turns).toBe(1)

  await clock.advance(60_000)
  await prompt($, 'go again')
  for (const f of ['a.ts', 'b.ts']) await edit($, f)
  await prompt($, 'and also this', 'turn-running') // typed mid-turn: the counters stay
  await edit($, 'c.ts')
  await turnDone($, 'answer')
  await flush(clock)
  expect(await achievements()).toContain('speedrun')
})

test('quick tools in a row do not flicker back to thinking', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on)
  await prompt($, 'refactor')
  await flush(clock)
  await clock.advance(5000)
  for (const f of ['a.ts', 'b.ts', 'c.ts']) {
    await edit($, f)
    await flush(clock)
    expect((await get<{ mood: string }>($, REF.pet)).mood).not.toBe('thinking')
    await clock.advance(300)
  }
  await clock.advance(5000)
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('thinking')
})

test('a burst of tools changes the room calmly, then settles on the latest mood', WITH_PROBE, async ($, on) => {
  type Shown = { mood: string; activity: string; fromX: number | null }
  const { clock } = await boot($, on)
  await prompt($, 'look around and fix it')
  await flush(clock)
  await clock.advance(5000)

  // Five quick tools, 250 ms apart, sampled every 50 ms of mock time.
  const changes: Array<{ at: number; scene: Shown }> = []
  let last = await get<Shown>($, REF.scene)
  let t = 0
  const sample = async (ms: number) => {
    for (let i = 0; i < ms / 50; i++) {
      await clock.advance(50)
      await flush(clock)
      t += 50
      const now = await get<Shown>($, REF.scene)
      if (now.mood !== last.mood || now.activity !== last.activity) changes.push({ at: t, scene: now })
      last = now
    }
  }
  for (const tool of ['Read', 'Grep', 'Edit', 'Read', 'Edit']) {
    if (tool === 'Edit') await edit($, `f${t}.ts`)
    else await $.tool.call({ tool, file_path: 'x.ts', pattern: 'x' } as never)
    await sample(250)
  }
  await sample(8000)

  // Never two scene changes closer than the dwell (less one 50 ms sample), and no flashing per tool.
  for (let i = 1; i < changes.length; i++) expect(changes[i]!.at - changes[i - 1]!.at >= 2350).toBe(true)
  expect(changes.length <= 3).toBe(true)
  // The work got its scene, and the room ended where Clawd really is.
  expect(changes.some(c => c.scene.mood === 'coding' || c.scene.mood === 'reading')).toBe(true)
  expect(last.mood).toBe((await get<{ mood: string }>($, REF.pet)).mood)
  // Moving between spots walks over from the previous one.
  expect(changes.some(c => typeof c.scene.fromX === 'number')).toBe(true)
})

test('every tool goes to its station', async () => {
  const cases: Array<[string, Record<string, string>, string]> = [
    ['Edit', {}, 'coding'], ['MultiEdit', {}, 'coding'], ['Write', {}, 'write'], ['Read', {}, 'reading'],
    ['Grep', {}, 'scan'], ['Glob', {}, 'scan'], ['LSP', {}, 'scan'], ['WebFetch', {}, 'web'], ['WebSearch', {}, 'web'],
    ['Bash', { command: 'ls -la' }, 'running'], ['Bash', { command: 'npm test' }, 'test'], ['Bash', { command: 'cd x && git push' }, 'git'],
    ['PowerShell', { command: 'terraform plan' }, 'crane'], ['Agent', {}, 'agent'], ['Skill', {}, 'skill'], ['TodoWrite', {}, 'working'],
  ]
  for (const [tool, args, station] of cases) {
    const activity = activityFor(tool, args)
    expect(`${tool}:${stationOf(moodFor(activity), activity)}`).toBe(`${tool}:${station}`)
  }
})

test('switching activity walks from the real spot', WITH_PROBE, async ($, on) => {
  type Shown = { mood: string; activity: string; fromX: number | null; fromMood: string | null; fromActivity: string | null }
  const { clock } = await boot($, on)
  await prompt($, 'look it up')
  await flush(clock)
  await clock.advance(5000)
  // the first read earns its own cheer; the next one is plain work
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' } as never)
  await flush(clock)
  await clock.advance(8000)
  await flush(clock)
  await $.tool.call({ tool: 'Read', file_path: 'x.ts' } as never)
  await flush(clock)
  expect(await get<Shown>($, REF.scene)).toMatchObject({ mood: 'reading', activity: 'read' })
  // a fetch inside the read's dwell gets its scene when the dwell is over, walking from the shelf
  await clock.advance(1000)
  await $.tool.call({ tool: 'WebFetch', url: 'https://example.com', prompt: 'x' } as never)
  await flush(clock)
  await clock.advance(2000)
  await flush(clock)
  const scene = await get<Shown>($, REF.scene)
  expect(scene).toMatchObject({ mood: 'reading', activity: 'web', fromX: 10, fromMood: 'reading', fromActivity: 'read' })
})

// ---------- hooks: project quests ----------

test('parallel tools against a goal-3 quest pay once', WITH_PROBE, async ($, on) => {
  const { clock, toasts } = await boot($, on, { [KEY]: boardWith('demo-app') })
  expect((await get<{ items: unknown[] } | null>($, REF.board))?.items.length).toBe(1)
  await prompt($, 'edit stuff')
  await Promise.all(['a.ts', 'b.ts', 'c.ts'].map(f => edit($, f)))
  await flush(clock)
  const b = await get<{ items: Array<{ progress: number; done: boolean }> }>($, REF.board)
  expect(b.items[0]?.progress).toBe(3)
  expect(b.items[0]?.done).toBe(true)
  // the quest and the campaign bonus are paid in one queued pass: one toast names both, once
  // (the level-up they cause leads it)
  expect(toasts.filter(t => t.includes('Edit thrice')).length).toBe(1)
  expect(toasts.filter(t => t.includes('Test Run')).length).toBe(1)
  expect(toasts.find(t => t.includes('Edit thrice'))).toContain('Test Run')
})

test('/quests clear keeps the milestones; /quests reset wipes them', WITH_PROBE, async ($, on) => {
  const milestone = { id: 'm1', name: 'Big One', description: 'Pass a lot', check: { type: 'pass', tool: 'any', fix: false, red: false, edited: false, tainted: false, at: 0 }, goal: 5, progress: 5, xp: 100, done: true, unlockedAt: START }
  await boot($, on, { [KEY]: boardWith('demo-app', { milestones: [milestone] }) })
  const presentation = PRESENTATION
  await $.command.run({ command: 'quests', args: 'clear', origin: { kind: 'composer' }, presentation } as never)
  const cleared = await get<{ items: unknown[]; milestones: Array<{ id: string; done: boolean }> } | null>($, REF.board)
  expect(cleared?.items).toHaveLength(0)
  expect(cleared?.milestones[0]?.id).toBe('m1')
  expect(cleared?.milestones[0]?.done).toBe(true)
  const ask = await $.command.run({ command: 'quests', args: 'reset', origin: { kind: 'composer' }, presentation } as never)
  expect(String((ask as { text?: string }).text)).toMatch(/Run \/quests reset confirm/)
  expect((await get<{ milestones: unknown[] } | null>($, REF.board))?.milestones).toHaveLength(1)
  const reply = await $.command.run({ command: 'quests', args: 'reset confirm', origin: { kind: 'composer' }, presentation } as never)
  expect(String((reply as { text?: string }).text)).toMatch(/wiped/)
  expect(await get<unknown>($, REF.board)).toBe(null)
  const again = await $.command.run({ command: 'quests', args: 'reset', origin: { kind: 'composer' }, presentation } as never)
  expect(String((again as { text?: string }).text)).toBe('Nothing to reset.')
})

test('/quests on a fresh unfinished campaign says why instead of scouting', WITH_PROBE, async ($, on) => {
  let calls = 0
  await boot($, on, { [KEY]: boardWith('demo-app') }, () => {
    calls += 1
    return { isAnswered: false, reason: 'empty-reply', usage: USAGE }
  })
  const reply = await $.command.run({ command: 'quests', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION } as never)
  expect(String((reply as { text?: string }).text)).toMatch(/come back tomorrow/)
  expect(calls).toBe(0)
})

test('a scheduled prompt does not count as a prompt of the person', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on)
  await $.prompt.submit({ text: 'please thanks', wait: false, origin: { kind: 'scheduled-trigger' } } as never)
  await flush(clock)
  expect(Object.keys((await get<{ achievements: Record<string, number> }>($, REF.profile)).achievements)).not.toContain('polite')
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('thinking')
  await prompt($, 'please and thanks')
  await flush(clock)
  expect(Object.keys((await get<{ achievements: Record<string, number> }>($, REF.profile)).achievements)).toContain('polite')
})

test('a double press of gen-quests asks the model once', WITH_PROBE, async ($, on) => {
  let calls = 0
  let wake: () => void = () => undefined
  const held = new Promise<void>(resolve => {
    wake = resolve
  })
  const text = JSON.stringify({ campaign: 'Two Clicks', quests: ['pytest', 'tsc', 'eslint', 'mypy'].map(tool => ({ title: `Green ${tool}`, why: 'because', role: 'quest', check: { type: 'pass', tool, goal: 2 } })) })
  const { clock } = await boot($, on, {}, async ask => {
    // a repair ask for the same generation is not a second generation
    if (!String(ask.prompt ?? '').includes('These were rejected')) calls += 1
    await held
    return { isAnswered: true, text, usage: USAGE }
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  const first = ui.press({ key: 'gen-quests' })
  const second = ui.press({ key: 'gen-quests' })
  await second
  wake()
  await first
  await flush(clock)
  expect(calls).toBe(1)
  expect((await get<{ campaign: string } | null>($, REF.board))?.campaign).toBe('Two Clicks')
  expect((await get<{ status: string }>($, REF.questGen)).status).toBe('idle')
})

// A campaign from yesterday with progress on its open quest: a new one may start, and would drop it.
const OLD_CAMPAIGN = () => boardWith('demo-app', {
  createdAt: START - 86_400_000,
  items: [{ id: 'pq0', title: 'Edit thrice', role: 'warmup', check: { type: 'tally', activity: 'edit', path: '', seen: ['x.ts', 'y.ts'] }, goal: 3, progress: 2, xp: 25, why: '', done: false }],
})
const NEXT_CAMPAIGN = JSON.stringify({ campaign: 'Next Up', quests: ['pytest', 'tsc', 'eslint', 'mypy'].map(tool => ({ title: `Green ${tool}`, why: 'because', role: 'quest', check: { type: 'pass', tool, goal: 2 } })) })

test('a new campaign over open quests with progress asks for a second press first', WITH_PROBE, async ($, on) => {
  let calls = 0
  const { clock } = await boot($, on, { [KEY]: OLD_CAMPAIGN() }, ask => {
    // a repair ask for the same generation is not a second generation
    if (!String(ask.prompt ?? '').includes('These were rejected')) calls += 1
    return { isAnswered: true, text: NEXT_CAMPAIGN, usage: USAGE }
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  expect((await ui.find({ key: 'gen-quests' }))?.props.label).toBe('Replace campaign')
  await ui.press({ key: 'gen-quests' })
  await flush(clock)
  expect(calls).toBe(0)
  expect((await get<{ campaign: string }>($, REF.board)).campaign).toBe('Test Run')
  expect((await ui.find({ key: 'gen-quests' }))?.props.label).toBe('Replace campaign? Progress is lost')
  // leaving the tab disarms it
  await ui.press({ key: 'tab-room' })
  await ui.press({ key: 'tab-quests' })
  expect((await ui.find({ key: 'gen-quests' }))?.props.label).toBe('Replace campaign')
  await ui.press({ key: 'gen-quests' })
  await ui.press({ key: 'gen-quests' })
  await flush(clock)
  expect(calls).toBe(1)
  expect((await get<{ campaign: string }>($, REF.board)).campaign).toBe('Next Up')
})

test('/quests says the open quests of the current campaign will be replaced', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on, { [KEY]: OLD_CAMPAIGN() }, () => ({ isAnswered: true, text: NEXT_CAMPAIGN, usage: USAGE }))
  expect(await run($, 'quests')).toMatch(/The new campaign replaces Test Run and its 1 open quest \(their progress is lost\)\./)
  await flush(clock)
  expect((await get<{ campaign: string }>($, REF.board)).campaign).toBe('Next Up')
  // the new campaign is all open, but made today: nothing is replaced, the cooldown answers instead
  expect(await run($, 'quests')).not.toMatch(/replaces/)
})

test('an empty project section on the Trophies and Wardrobe tabs only points at the Quests tab', WITH_PROBE, async ($, on) => {
  await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-trophies' })
  expect((await ui.find({ key: 'goto-quests-trophies' }))?.props.label).toBe('Go to Quests')
  await ui.press({ key: 'goto-quests-trophies' })
  expect((await ui.find({ key: 'gen-quests' }))?.props.label).toBe('Generate project quests')
  // the help says reset wipes the project's own trophies and hats, not the catalog ones
  expect(QUESTS_HELP).toContain("/quests reset: wipe this project's quests, project trophies and project hats (asks first)")
})

test('an unanswered quest request ends in error', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on, {}, () => ({ isAnswered: false, reason: 'empty-reply', usage: USAGE }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  await ui.press({ key: 'gen-quests' })
  await flush(clock)
  expect((await get<{ status: string }>($, REF.questGen)).status).toBe('error')
  expect((await ui.find({ text: /quest scroll caught fire\. The answer was not readable\./ })) !== undefined).toBe(true)
  // the error goes back to idle after a minute
  await clock.advance(61_000)
  await flush(clock)
  expect((await get<{ status: string }>($, REF.questGen)).status).toBe('idle')
})

const passBoard = (tool = 'pytest', extra: Record<string, unknown> = {}) => boardWith('demo-app', {
  items: [{ id: 'pq0', title: 'Green twice', role: 'quest', check: { type: 'pass', tool, fix: false, red: false, edited: false, tainted: false, at: 0 }, goal: 2, progress: 0, xp: 10, why: '', done: false }],
  ...extra,
})
const items = async ($: Dollar) => (await get<{ items: Array<{ id: string; progress: number; role: string; check: { type: string; at?: number; base?: number } }> }>($, REF.board)).items

test('parallel check runs against a pass quest pay once', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on, { [KEY]: passBoard() })
  await prompt($, 'fix it')
  await edit($, 'src/a.ts')
  await Promise.all([bash($, 'pytest'), bash($, 'pytest -q'), bash($, 'cd api && pytest')])
  await flush(clock)
  expect((await items($))[0]?.progress).toBe(1)
  // plain shell turns never count
  for (let i = 0; i < 15; i++) {
    await clock.advance(1000)
    await prompt($, 'look')
    await bash($, 'ls')
    await turnDone($, 'answer')
  }
  await flush(clock)
  expect((await items($))[0]?.progress).toBe(1)
})

test('/quests allow makes a repo script count', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on, { [KEY]: passBoard('any') })
  await prompt($, 'go')
  await edit($, 'src/a.ts')
  await bash($, 'npm test')
  await flush(clock)
  expect((await items($))[0]?.progress).toBe(0)
  const reply = await $.command.run({ command: 'quests', args: 'allow npm test', origin: { kind: 'composer' }, presentation: PRESENTATION } as never)
  expect(String((reply as { text?: string }).text)).toBe('Clawd counts "npm test" as a check now.')
  const bad = await $.command.run({ command: 'quests', args: 'allow rm -rf /', origin: { kind: 'composer' }, presentation: PRESENTATION } as never)
  expect(String((bad as { text?: string }).text)).toMatch(/only counts a plain repo script/)
  await bash($, 'npm test')
  await flush(clock)
  expect((await items($))[0]?.progress).toBe(1)
  expect((await get<{ approved: string[] }>($, REF.board)).approved).toEqual(['npm test'])
})

test('measured quests are read once at the end of every turn', WITH_PROBE, async ($, on) => {
  const files: Record<string, string> = { 'src/a.ts': 'TODO TODO', 'README.md': '# Demo' }
  const reads: string[] = []
  const board = boardWith('demo-app', {
    items: [{ id: 'pq0', title: 'Fewer TODOs', role: 'quest', check: { type: 'probe', probe: 'fewer', path: 'src/', pattern: 'TODO', base: 0, baseFiles: {}, at: -1 }, goal: 2, progress: 0, xp: 10, why: '', done: false }],
  })
  const { clock } = await boot($, on, { [KEY]: board }, undefined, { files, reads })
  const turn = async (work: () => Promise<unknown>) => {
    await clock.advance(1000)
    await prompt($, 'go')
    await work()
    await turnDone($, 'answer')
    await flush(clock)
  }
  await turn(() => edit($, 'src/a.ts'))
  expect(reads).toEqual(['src/a.ts']) // the baseline
  expect((await items($))[0]?.check.base).toBe(2)
  files['src/a.ts'] = 'TODO done'
  await turn(() => edit($, 'src/a.ts'))
  expect(reads).toEqual(['src/a.ts', 'src/a.ts'])
  expect((await items($))[0]?.progress).toBe(1)
  // the person fixed one in their own editor: a turn without edits still measures it, once
  files['src/a.ts'] = 'done done'
  await turn(() => $.tool.call({ tool: 'Read', file_path: 'src/a.ts' } as never))
  expect(reads).toEqual(['src/a.ts', 'src/a.ts', 'src/a.ts'])
  expect((await items($))[0]?.progress).toBe(2)
})

test('R4: a file too big to read keeps its trophy progress; a trophy whose file is gone is retired', WITH_PROBE, async ($, on) => {
  const doc = Array.from({ length: 40 }, (_, i) => `line ${i} alpha beta gamma delta epsilon zeta eta theta`).join('\n') // 400 words
  const files: Record<string, string> = { 'docs/guide.md': doc, 'docs/old.md': doc, 'src/a.ts': 'x', 'README.md': '# Demo' }
  const reads: string[] = []
  const words = (id: string, path: string) => ({
    id, name: `Bard ${id}`, description: 'Write a lot', goal: 300, progress: 4, xp: 150, done: false, unlockedAt: null,
    check: { type: 'probe', probe: 'words', path, pattern: '', base: 0, baseFiles: {}, at: 1 },
  })
  const board = boardWith('demo-app', { items: [], milestones: [words('m1', 'docs/guide.md'), words('m2', 'docs/old.md')] })
  const { clock, toasts } = await boot($, on, { [KEY]: board }, undefined, { files, reads })
  const milestones = async () => (await get<{ milestones: Array<{ id: string; progress: number }> }>($, REF.board)).milestones
  files['docs/guide.md'] = `${doc}\n${'y'.repeat(300 * 1024)}`
  delete files['docs/old.md']
  await clock.advance(1000)
  await prompt($, 'go')
  await edit($, 'src/a.ts')
  await turnDone($, 'answer')
  await flush(clock)
  expect(reads.includes('docs/guide.md')).toBe(false) // too big: not read, so not measured as empty
  expect(await milestones()).toEqual([expect.objectContaining({ id: 'm1', progress: 4 })])
  expect(toasts.some(t => t.includes('Trophy retired: Bard m2'))).toBe(true)
})

const GEN_FILES: Record<string, string> = {
  'src/a.ts': 'TODO a', 'src/b.ts': 'TODO b', 'tests/test_a.py': 'def test(): pass', 'docs/guide.md': '# Guide\nhello world', 'README.md': '# Demo app', '.env': 'SECRET=1',
}
const GEN_REPLY = JSON.stringify({
  campaign: 'Seven Seas',
  quests: [
    { title: 'Read the sources', why: 'Know them', role: 'warmup', check: { type: 'tally', activity: 'read', path: 'src/', goal: 2 } },
    { title: 'Green pytest', why: 'Tests', role: 'quest', check: { type: 'pass', tool: 'pytest', goal: 2 } },
    { title: 'Fewer TODOs', why: 'Debt', role: 'quest', check: { type: 'probe', probe: 'fewer', path: 'src/', pattern: 'TODO', goal: 2 } },
    { title: 'Guide grows', why: 'Docs', role: 'quest', check: { type: 'probe', probe: 'words', path: 'docs/guide.md', goal: 1 } },
    { title: 'Boss: red to green', why: 'Fix', role: 'boss', check: { type: 'pass', tool: 'pytest', fix: true, goal: 2 } },
    { title: 'Peek at secrets', why: 'No', role: 'quest', check: { type: 'probe', probe: 'fewer', path: '.env', pattern: 'TODO', goal: 1 } },
    { title: 'Deploy it', why: 'No', role: 'quest', check: { type: 'pass', tool: 'pytest', goal: 1 } },
  ],
})

test('generation: 7 candidates, the bad ones dropped, baselines taken', WITH_PROBE, async ($, on) => {
  const reads: string[] = []
  let calls = 0
  const { clock } = await boot($, on, {}, () => {
    calls += 1
    return { isAnswered: true, text: GEN_REPLY, usage: USAGE }
  }, { files: { ...GEN_FILES }, reads })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  await ui.press({ key: 'gen-quests' })
  await flush(clock)
  expect(calls).toBe(1)
  const list = await items($)
  expect(list.map(q => q.role)).toEqual(['warmup', 'quest', 'quest', 'quest', 'boss'])
  expect(list.filter(q => q.check.type === 'probe').every(q => (q.check.at ?? -1) >= 0)).toBe(true)
  expect(list.find(q => q.id === 'pq2')?.check.base).toBe(2)
  expect(reads).not.toContain('.env')
})

test('generation: no valid candidate asks for one repair, then fills from templates', WITH_PROBE, async ($, on) => {
  let calls = 0
  const prompts: string[] = []
  const bad = JSON.stringify({ campaign: 'Nope', quests: [{ title: 'Edit a file', kind: 'edit', match: '', goal: 2 }, { title: 'Push it', role: 'quest', check: { type: 'pass', tool: 'git push' } }] })
  const { clock } = await boot($, on, {}, ask => {
    calls += 1
    prompts.push(ask.prompt ?? '')
    return { isAnswered: true, text: bad, usage: USAGE }
  }, { files: { ...GEN_FILES } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  await ui.press({ key: 'gen-quests' })
  await flush(clock)
  expect(calls).toBe(2)
  expect(prompts.at(-1) ?? '').toMatch(/These were rejected: .*"Push it": not safe/)
  expect((await items($)).map(q => q.role)).toEqual(['warmup', 'quest', 'quest', 'quest', 'boss'])
  expect((await get<{ status: string }>($, REF.questGen)).status).toBe('idle')
})

// ---------- per-project progress ----------

const restart = async ($: Dollar, clock: MockClock, cwd: string) => {
  await $.session.start({ cwd, surface: 'terminal', isInteractive: true } as never)
  await flush(clock)
}
const stored = (mem: Map<string, unknown>, key: string) => mem.get(key) as Profile | undefined

test('two projects stay separate', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>()
  let dir = CWD
  const { clock } = await boot($, on, {}, undefined, { mem, cwd: () => dir })
  await prompt($, 'go')
  for (const f of ['a.ts', 'b.ts', 'c.ts']) await edit($, f)
  await flush(clock)
  const demoXp = stored(mem, PK.profile)?.xp ?? 0
  expect(demoXp > 0).toBe(true)

  dir = OTHER
  await restart($, clock, OTHER)
  expect((await get<Profile>($, REF.profile)).xp).toBe(0)
  expect(stored(mem, OK.profile)?.xp ?? 0).toBe(0)
  expect(stored(mem, PK.profile)?.xp).toBe(demoXp)
  await edit($, 'x.ts')
  await flush(clock)
  expect((stored(mem, OK.profile)?.xp ?? 0) > 0).toBe(true)
  expect(stored(mem, PK.profile)?.xp).toBe(demoXp)
  expect(mem.has('profile')).toBe(false)
})

test('two sessions in one project both keep their xp', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>()
  const { clock } = await boot($, on, {}, undefined, { mem })
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  const a = stored(mem, PK.profile)?.xp ?? 0
  // session B, in the same folder, earns a lot meanwhile
  const old = stored(mem, PK.profile)!
  mem.set(PK.profile, { ...old, xp: a + 1000, achievements: { ...old.achievements, polite: START } })
  await edit($, 'b.ts')
  await flush(clock)
  const both = stored(mem, PK.profile)!
  expect(both.xp > a + 1000).toBe(true)
  expect(both.achievements.polite).toBe(START)

  // B earns again; A's pane catches up on its own within a few seconds
  mem.set(PK.profile, { ...both, xp: both.xp + 500 })
  await clock.advance(6000)
  await flush(clock)
  expect((await get<Profile>($, REF.profile)).xp).toBe(both.xp + 500)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ text: levelLabel(both.xp + 500) })) !== undefined).toBe(true)
})

test('legacy progress is adopted once', WITH_PROBE, async ($, on) => {
  const hat = { name: 'Old Hat', rows: ['..aa..', '.aaaa.', 'aaaaaa'], palette: { a: '#FF0000' } }
  const legacy = { version: 1, xp: 500 }
  const mem = new Map<string, unknown>([['profile', legacy], ['customHat', hat], ['decor', { shelf: 'globe' }]])
  let dir = CWD
  const { clock } = await boot($, on, {}, undefined, { mem, cwd: () => dir })
  // adopted (plus any trophy the old totals earn on the first event)
  const adopted = stored(mem, PK.profile)?.xp ?? 0
  expect(adopted >= 500 && adopted < 600).toBe(true)
  expect(mem.get(PK.hat)).toEqual({ id: 'old-hat', name: 'Old Hat', rows: hat.rows, palette: hat.palette })
  expect(mem.get(PK.decor)).toEqual({ shelf: 'globe' })
  const claim = mem.get('legacyClaim') as { by: string; at: number }
  expect(claim.by).toBe(PK.id)
  expect(mem.get('profile')).toEqual(legacy)
  expect(mem.get('customHat')).toEqual(hat)

  dir = OTHER
  await restart($, clock, OTHER)
  expect(stored(mem, OK.profile)?.xp ?? 0).toBe(0)
  expect(mem.get(OK.hat)).toBe(undefined)
  expect(mem.get(OK.decor)).toBe(undefined)
  expect(mem.get('legacyClaim')).toEqual(claim)

  mem.set('profile', { version: 1, xp: 9999 })
  dir = CWD
  await restart($, clock, CWD)
  expect(stored(mem, PK.profile)?.xp).toBe(adopted)
  mem.delete(PK.profile)
  await restart($, clock, CWD)
  expect(stored(mem, PK.profile)?.xp ?? 0).toBe(0)
})

test('a save from a newer version is never overwritten', WITH_PROBE, async ($, on) => {
  const future = { version: 99, xp: 700, futureField: true }
  const mem = new Map<string, unknown>([[PK.profile, future]])
  const { clock } = await boot($, on, {}, undefined, { mem })
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  expect(mem.get(PK.profile)).toEqual(future)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ text: levelLabel(700) })) !== undefined).toBe(true)
  expect((await ui.find({ text: /saved by a newer Clawd Quest\. Progress is read-only until you update\./ })) !== undefined).toBe(true)
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal', props: PANE.props as never })
  expect((await terminal.find({ text: /saved by a newer Clawd Quest/ })) !== undefined).toBe(true)
})

test('decor changes do not clobber another session', WITH_PROBE, async ($, on) => {
  // level 3: the Striped Rug is open and shows by default
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: 130, totals: { tools: 9 } }]])
  const { clock } = await boot($, on, {}, undefined, { mem })
  mem.set(PK.decor, { poster: 'space' }) // session B
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-decor' })
  await ui.press({ key: 'decor-rug-none' })
  await flush(clock)
  expect(mem.get(PK.decor)).toEqual({ poster: 'space', rug: 'none' })
  // pressing the piece the slot already shows writes nothing
  mem.set(PK.decor, { rug: 'none', marker: true })
  await ui.press({ key: 'decor-rug-none' })
  await flush(clock)
  expect(mem.get(PK.decor)).toEqual({ rug: 'none', marker: true })
})

test('board progress from another session is kept', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[KEY, boardWith('demo-app')]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem })
  const b = mem.get(KEY) as ReturnType<typeof boardWith>
  mem.set(KEY, { ...b, items: b.items.map(q => ({ ...q, progress: 2 })) }) // session B
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  const after = mem.get(KEY) as ReturnType<typeof boardWith>
  expect(after.items[0]?.progress).toBe(3)
  expect(after.items[0]?.done).toBe(true)
  expect(toasts.filter(t => t.includes('Edit thrice')).length).toBe(1)
})

// ---------- usage meters ----------

const iso = (ms: number): string => new Date(ms).toISOString()
const HOUR = 3_600_000
const measure = ($: Dollar, over: Record<string, unknown> = {}) =>
  $.session.measure({
    context: { window: 200000, tokens: 124000, percent: 62 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 81, resetsAt: iso(START + 2 * HOUR) }, { kind: 'seven_day', percentUsed: 12, resetsAt: iso(START + 72 * HOUR) }],
    cost: { usd: 1.2 },
    changed: ['context', 'rateLimits', 'cost'],
    ...over,
  } as never)
const roomAlt = async (ui: { find: (q: { type: string }) => Promise<{ props: Record<string, unknown> } | undefined> }) =>
  String((await ui.find({ type: 'Svg' }))?.props.alt ?? '')
const roomSource = async (ui: { find: (q: { type: string }) => Promise<{ props: Record<string, unknown> } | undefined> }) =>
  String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
type Usage = { compactions: number; context: { pct: number | null } | null; warned: { fiveHour?: string } }

test('measure fills the meters and warns once', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>()
  const { clock, toasts } = await boot($, on, {}, undefined, { mem })
  const startToasts = toasts.length // October greets a new player with the Pumpkin
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await measure($)
  await flush(clock)
  const alt = await roomAlt(ui)
  expect(alt.includes('5-hour limit 80% used')).toBe(true)
  expect(alt.includes('Context 60% full')).toBe(true)
  expect(alt.includes('Weekly limit 10% used')).toBe(true)
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toMatch(/^Clawd's room, .*Session cost \$1\.20\.$/)
  const quip = (await get<{ quip: string }>($, REF.pet)).quip
  expect(usageQuips('five_hour').includes(quip)).toBe(true)
  expect(toasts.length).toBe(startToasts) // a usage warning is a line from Clawd, never a toast
  const limits = mem.get('limits') as { warned: { fiveHour?: string } }
  expect(limits.warned.fiveHour).toBe(iso(START + 2 * HOUR))
  // a second reading in the same window: no new warning
  await prompt($, 'go')
  await flush(clock)
  await measure($, { rateLimits: [{ kind: 'five_hour', percentUsed: 83, resetsAt: iso(START + 2 * HOUR) }], changed: ['rateLimits'] })
  await flush(clock)
  expect((mem.get('limits') as { warned: unknown }).warned).toEqual(limits.warned)
  expect(usageQuips('five_hour').includes((await get<{ quip: string }>($, REF.pet)).quip)).toBe(false)
})

for (const order of ['turn first', 'measure first'] as const) {
  test(`the usage warning and the turn's line both show (${order})`, WITH_PROBE, async ($, on) => {
    const { clock } = await boot($, on)
    const quip = async () => (await get<{ quip: string }>($, REF.pet)).quip
    await prompt($, 'go')
    await flush(clock)
    if (order === 'measure first') {
      await measure($)
      await flush(clock)
      expect(usageQuips('five_hour').includes(await quip())).toBe(true)
    }
    await turnDone($, 'answer')
    if (order === 'turn first') await measure($)
    await flush(clock)
    expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('done')
    expect(usageQuips('five_hour').includes(await quip())).toBe(false)
    await clock.advance(6000)
    await flush(clock)
    expect(usageQuips('five_hour').includes(await quip())).toBe(true)
  })
}

test('no rate limits for API-key users', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await measure($, { rateLimits: [] })
  await flush(clock)
  const alt = await roomAlt(ui)
  expect(alt.includes('5-hour')).toBe(false)
  expect(alt.includes('Weekly')).toBe(false)
  expect(alt.includes('Context 60% full')).toBe(true)
})

test('stored limits leave once an API-key session measures', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on, { limits: { v: 1, fiveHour: { pct: 50, resetsAt: iso(START + HOUR) }, sevenDay: { pct: 20, resetsAt: iso(START + 48 * HOUR) }, warned: {} } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await roomAlt(ui)).includes('5-hour limit 50% used')).toBe(true)
  await measure($, { rateLimits: [], changed: ['context', 'cost'] })
  await flush(clock)
  const alt = await roomAlt(ui)
  expect(alt.includes('5-hour')).toBe(false)
  expect(alt.includes('Weekly')).toBe(false)
})

test('/compact tidies the papers', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await measure($, { context: { window: 200000, tokens: 180000, percent: 90 }, rateLimits: [] })
  await flush(clock)
  expect(usageQuips('context').includes((await get<{ quip: string }>($, REF.pet)).quip)).toBe(true)
  await $.session.compact({ messages: SUMMARY } as never)
  await flush(clock)
  const svg = await roomSource(ui)
  expect(svg.includes('class="pfl"')).toBe(true)
  const u = await get<Usage>($, 'usage')
  expect(u.compactions).toBe(1)
  expect(u.context?.pct).toBe(null)
  expect(usageQuips('compact').includes((await get<{ quip: string }>($, REF.pet)).quip)).toBe(true)
})

test('a skipped or ahead-of-time compaction changes nothing', WITH_PROBE, async ($, on) => {
  let reply: unknown = { messages: SUMMARY }
  const { clock } = await boot($, on, {}, undefined, { compact: () => reply })
  await measure($, { rateLimits: [] })
  await flush(clock)
  await $.session.compact({ trigger: 'precompute', messages: SUMMARY } as never)
  reply = { skip: 'no' }
  await $.session.compact({ messages: SUMMARY } as never)
  await flush(clock)
  const u = await get<Usage>($, 'usage')
  expect(u.compactions).toBe(0)
  expect(u.context?.pct).toBe(62)
})

test('stored limits show on start, expired ones do not', WITH_PROBE, async ($, on) => {
  await boot($, on, { limits: { v: 1, fiveHour: { pct: 50, resetsAt: iso(START + HOUR) }, sevenDay: { pct: 20, resetsAt: iso(START - HOUR) }, warned: {} } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  const alt = await roomAlt(ui)
  expect(alt.includes('5-hour limit 50% used')).toBe(true)
  expect(alt.includes('Weekly')).toBe(false)
})

// ---------- 1.0: helpers ----------

test('MCP arguments: only strings count, edits only as objects', () => {
  const args = normArgs({ tool: 'mcp__docs__search', query: { q: 'a' }, command: ['ls', '-la'], file_path: 'src/a.ts', edits: [{ new_string: 'x', old_string: 5 }, 'junk', null] })
  expect(args.file_path).toBe('src/a.ts')
  expect(args.query).toBe(undefined)
  expect(args.command).toBe(undefined)
  expect(args.edits).toEqual([{ new_string: 'x', old_string: undefined }])
  expect(normArgs(null)).toEqual({})
  expect(normArgs({ edits: 'nope' }).edits).toBe(undefined)
  expect(detailFor('mcp__docs__search', normArgs({ query: { q: 1 } }))).toBe('mcp__docs__search')
  const long = detailFor('Bash', { command: 'x'.repeat(100) })
  expect(long.length).toBe(60)
  expect(long.endsWith('...')).toBe(true)
  expect(detailFor('Read', { file_path: 'C:\\work\\app\\src\\main.ts' })).toBe('main.ts')
})

test('the room clock runs on across the hour (no hourly wrap that makes every loop jump)', () => {
  const at = (h: number, m: number, s: number) => Date.UTC(2026, 9, 5, h, m, s) // the old clock wrapped at every whole UTC hour
  expect(wallSecs(at(11, 0, 30)) - wallSecs(at(10, 59, 30))).toBe(60)
  expect(wallSecs(at(23, 0, 30)) - wallSecs(at(22, 59, 30))).toBe(60)
  // R4: nor at UTC midnight (the day wrap moved a 46 s loop by 86400 mod 46 = 12 s)
  expect(wallSecs(Date.UTC(2026, 9, 6, 0, 0, 30)) - wallSecs(Date.UTC(2026, 9, 5, 23, 59, 30))).toBe(60)
  expect(wallSecs(Date.UTC(2026, 9, 6, 0, 0, 0, 250)) - wallSecs(Date.UTC(2026, 9, 5, 23, 59, 59))).toBe(1.25)
})

test('numbers, lists and requirements read well', () => {
  expect(fmt(1234)).toBe('1,234')
  expect(fmt(62384)).toBe('62,384')
  expect(fmt(183_400)).toBe('183.4k')
  expect(fmt(100_000)).toBe('100k')
  expect(fmt(Number.NaN)).toBe('0')
  expect(listText(['A'])).toBe('A')
  expect(listText(['A', 'B'])).toBe('A and B')
  expect(listText(['A', 'B', 'C'])).toBe('A, B and C')
  expect(listText(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toBe('A, B, C, D and 3 more')
  expect(shortReq('Reach Lv 13')).toBe('Lv 13')
  expect(shortReq('Trophy: Night Owl')).toBe('trophy Night Owl')
  expect(shortReq('Reach Lv 10 or trophy: Polyglot')).toBe('Lv 10 or trophy Polyglot')
  expect(shortReq('Trophies: Clean Sweep + Seven Days Strong')).toBe('trophies Clean Sweep + Seven Days Strong')
  expect(trophyFold(['Librarian', 'Regular', 'Fortnight', 'Tidy', 'Resident'])).toBe('+5 trophies from your history: Librarian, Regular, Fortnight (+2 more)')
  expect(genErrorText('timeout')).toBe('Claude did not answer in time.')
  expect(genErrorText('no-model')).toBe('No model is available for /quests.')
  expect(genErrorText('unreadable')).toBe('The answer was not readable.')
  for (const sub of ['/quests clear', '/quests reset', '/quests allow <script>', '/quests help']) expect(QUESTS_HELP.includes(sub)).toBe(true)
})

test('header labels: titles, Encore stars at the cap, xp counts', () => {
  expect(levelLabel(0)).toBe('Lv 1 · Hatchling')
  expect(levelLabel(XP_AT[17]!)).toBe('Lv 17 · Journeyman')
  expect(xpLabel(XP_AT[10]! + 5)).toBe(`5/${fmt(XP_AT[11]! - XP_AT[10]!)} xp`)
  expect(levelLabel(XP_AT[100]!)).toBe('Lv 100 · Legend')
  expect(levelLabel(XP_AT[100]! + 3420)).toBe('Lv 100 · Legend ★3')
  expect(xpLabel(XP_AT[100]! + 3420)).toBe('420/1,000 to the next star')
})

test('streak text: per project, weekend-aware', () => {
  expect(streakText({ ...newProfile(), streak: { count: 5, lastDay: '2026-10-05' } }, START)).toBe('5-day streak')
  // Friday's streak, read on Saturday
  expect(streakText({ ...newProfile(), streak: { count: 5, lastDay: '2026-10-09' } }, new Date(2026, 9, 10, 10).getTime())).toBe('5-day streak (safe till Monday)')
  expect(streakText(newProfile(), START)).toBe('No streak')
  // lapsed: a stale count is no streak
  expect(streakText({ ...newProfile(), streak: { count: 5, lastDay: '2026-09-01' } }, START)).toBe('No streak')
})

test('the level-up toast names unlocks, the next one and a new title; milestones celebrate', () => {
  const normal = levelNote({ from: 16, to: 17, titleUp: null, unlocks: unlocksBetween(16, 17), next: { kind: 'decor', id: 'succulents', name: 'Succulent Trio', slot: 'plant', level: 18 }, hasTabs: true })
  expect(normal.text).toBe('Level 17 · Journeyman! Unlocked: Beret. Next: Succulent Trio at Lv 18.')
  expect(normal.verb).toBe('Level up')
  expect(normal.celebrate).toBe(undefined)
  const titled = levelNote({ from: 4, to: 5, titleUp: 'Apprentice', unlocks: unlocksBetween(4, 5), hasTabs: true }).text
  expect(titled).toMatch(/^Level 5! New title: Apprentice\. Unlocked: [^]*\.$/)
  expect(titled.split('Apprentice').length - 1).toBe(1) // the title once, not twice
  expect(levelNote({ from: 39, to: 40, titleUp: 'Veteran', unlocks: [], hasTabs: false }).text).toBe('Level 40! New title: Veteran.')
  const milestone = levelNote({ from: 24, to: 25, titleUp: 'Expert', unlocks: unlocksBetween(24, 25), hasTabs: true })
  expect(milestone.text).toBe('Milestone! Level 25 · Expert. Crown, Velvet Throne and a gold-trimmed trophy shelf.')
  expect(milestone).toMatchObject({ verb: 'Milestone', celebrate: 'milestone', celebrateMs: 6000, timeoutMs: 9000 })
  const legend = levelNote({ from: 99, to: 100, titleUp: 'Legend', unlocks: unlocksBetween(99, 100), hasTabs: true })
  expect(legend.text).toMatch(/^LEGEND! Level 100\. Starlight Crown, .* are yours\. Encore stars start now\.$/)
  expect(legend).toMatchObject({ verb: 'Legend', celebrate: 'legend', celebrateMs: 8000 })
  // the terminal draws no hats or decor: it only hears "New hat: X"
  expect(levelNote({ from: 16, to: 17, titleUp: null, unlocks: unlocksBetween(16, 17), hasTabs: false }).text).toBe('Level 17 · Journeyman! New hat: Beret.')
  expect(levelNote({ from: 17, to: 18, titleUp: null, unlocks: unlocksBetween(17, 18), hasTabs: false }).text).toBe('Level 18 · Journeyman!')
  expect(levelNote({ from: 24, to: 25, titleUp: 'Expert', unlocks: unlocksBetween(24, 25), hasTabs: false }).text).toBe('Milestone! Level 25 · Expert. New hat: Crown.')
})

// ---------- 1.0: the pane and the hooks ----------

const run = async ($: Dollar, command: string, args = '') =>
  String(((await $.command.run({ command, args, origin: { kind: 'composer' }, presentation: PRESENTATION } as never)) as { text?: string }).text)
const paneRow = (over: Record<string, unknown>) => ({ id: 'clawd-quest', title: 'Clawd', isShown: true, isFocused: false, isPlaced: true, ...over })

test('/clawd closes a pane on screen, brings back one that is not, and remembers', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>()
  let panes: unknown[] = []
  let placed = true
  const opens: unknown[] = []
  const closes: unknown[] = []
  await boot($, on, {}, undefined, { mem, panes: () => panes, open: () => ({ isPlaced: placed }), opens, closes })
  panes = [paneRow({})]
  expect(await run($, 'clawd')).toBe('Clawd went for a walk.')
  expect(closes).toHaveLength(1)
  expect(mem.get('paneHidden')).toBe(true)
  expect(await get<boolean>($, 'isHidden')).toBe(true)
  // open, but behind another pane's tab: shown again, never closed
  panes = [paneRow({ isShown: false })]
  expect(await run($, 'clawd')).toBe('Clawd is back.')
  expect(closes).toHaveLength(1)
  expect(opens.at(-1)).toMatchObject({ id: 'clawd-quest', focus: true })
  expect(mem.get('paneHidden')).toBe(false)
  // waiting undrawn on a narrow terminal
  panes = [paneRow({ isShown: false, isPlaced: false })]
  placed = false
  expect(await run($, 'clawd')).toBe('Widen the terminal to see Clawd.')
  expect(closes).toHaveLength(1)
})

test('a closed pane stays closed across sessions until /clawd', WITH_PROBE, async ($, on) => {
  // a person's close (ui.close, origin person) stores the same flag as /clawd; the test engine cannot raise one
  const mem = new Map<string, unknown>([['paneHidden', true]])
  const opens: unknown[] = []
  const { clock } = await boot($, on, {}, undefined, { mem, opens })
  expect(opens).toHaveLength(0)
  expect(await get<boolean>($, 'isHidden')).toBe(true)
  await restart($, clock, CWD)
  expect(opens).toHaveLength(0)
  expect(await run($, 'clawd')).toBe('Clawd is back.')
  expect(opens).toHaveLength(1)
  expect(mem.get('paneHidden')).toBe(false)
  await restart($, clock, CWD)
  expect(opens).toHaveLength(2)
})

test('the spinner verb holds 2 s, then catches up with the scene by itself (B19)', WITH_PROBE, async ($, on) => {
  const words: string[] = []
  on('ui.render', { component: 'Spinner' }, (_$, e) => {
    words.push(String((e.props as { word?: unknown }).word))
    return h('Text', null, String((e.props as { word?: unknown }).word)) as never
  })
  const { clock } = await boot($, on)
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal', props: SPINNER.props as never })
  await prompt($, 'go')
  await clock.advance(3000)
  await ui.redraw()
  const thinking = words.at(-1)
  // a test run changes the scene at once; the verb drawn right after still holds
  await bash($, 'npm test')
  await clock.settle()
  expect(await get<{ mood: string; activity: string }>($, REF.scene)).toMatchObject({ mood: 'running', activity: 'test' })
  await ui.redraw()
  expect(words.at(-1)).toBe(thinking)
  // when the hold ends the spinner redraws on its own with the new scene's verb
  const draws = words.length
  await clock.advance(2100)
  await clock.settle()
  expect(words.length > draws).toBe(true)
  expect(words.at(-1)).not.toBe(thinking)
  expect(words.at(-1)).not.toBe('Zzorbling')
  await ui.unmount()
})

test('agent.list is polled only while a mini Clawd is about (B23)', WITH_PROBE, async ($, on) => {
  let lists = 0
  on('agent.list', () => {
    lists += 1
    return { value: [] } as never
  })
  const { clock } = await boot($, on)
  await prompt($, 'go')
  await clock.advance(6000)
  await flush(clock)
  expect(lists).toBe(0)
  // a workflow agent's tool call brings a mini Clawd, and with it the list
  await edit($, 'a.ts', 'wf-agent-1')
  await clock.advance(3000)
  await flush(clock)
  expect(lists > 0).toBe(true)
})

test('a headless run opens no pane', WITH_PROBE, async ($, on) => {
  const opens: unknown[] = []
  await boot($, on, {}, undefined, { opens, headless: true })
  expect(opens).toHaveLength(0)
})

test('an SDK session (desktop, VS Code) starts headless, then a client attaches: pane, ticker and tab copy follow', WITH_PROBE, async ($, on) => {
  const opens: unknown[] = []
  let attached: string[] = []
  const { clock } = await boot($, on, {}, undefined, { opens, headless: true, surfaces: () => attached })
  expect(opens).toHaveLength(0)
  attached = ['desktop']
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as never)
  await flush(clock)
  expect(opens).toHaveLength(1)
  // the ticker runs: Clawd falls asleep when nothing happens
  await clock.advance(4 * 60_000)
  await flush(clock)
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('sleeping')
  // a second client opens no second pane
  await $.session.attach({ surface: 'mobile', clientId: 'mobile:default' } as never)
  await flush(clock)
  expect(opens).toHaveLength(1)
  // the copy knows the pane has tabs
  const reply = await $.command.run({ command: 'quests', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION } as never)
  expect(String((reply as { text?: string }).text)).toContain('Watch the Quests tab.')
})

test('a headless session whose pane gets drawn (an attach missed in a reload) starts the ticker, and a closed pane stays closed', WITH_PROBE, async ($, on) => {
  const opens: unknown[] = []
  const mem = new Map<string, unknown>([['paneHidden', true]])
  let attached: string[] = []
  const { clock } = await boot($, on, {}, undefined, { mem, opens, headless: true, surfaces: () => attached })
  attached = ['desktop']
  await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await flush(clock)
  await clock.advance(4 * 60_000)
  await flush(clock)
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('sleeping')
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as never)
  await flush(clock)
  expect(opens).toHaveLength(0)
})

test('an SDK session whose client attached before the start hook ran opens the pane at start', WITH_PROBE, async ($, on) => {
  const opens: unknown[] = []
  await boot($, on, {}, undefined, { opens, headless: true, surfaces: () => ['desktop'] })
  expect(opens).toHaveLength(1)
})

test('hat buttons: only owned hats, a press is worn and kept through a restart', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: 50, totals: { tools: 9 }, streak: { count: 1, lastDay: '2026-10-05' } }]])
  const { clock } = await boot($, on, {}, undefined, { mem })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-wardrobe' })
  const owned = availableHats(stored(mem, PK.profile)!, START).length // party, plus October's pumpkin
  expect((await ui.find({ text: `Hats ${owned}/44` })) !== undefined).toBe(true)
  // a locked hat has no button to press
  expect(await ui.find({ key: 'hat-crown' })).toBe(undefined)
  expect((await ui.find({ text: /Backwards Cap · Lv 7 \(you: 2\)/ })) !== undefined).toBe(true)
  expect(String((await ui.find({ key: 'toggle-wardrobe' }))?.props.label)).toBe(`Show all locked (${44 - owned})`)
  // level hats that a trophy opens too name that route
  await ui.press({ key: 'toggle-wardrobe' })
  expect((await ui.find({ text: /Wizard Hat · Lv 10 or trophy: Polyglot \d+\/5/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /Crown · Lv 25 or trophy: Unbreakable/ })) !== undefined).toBe(true)
  await ui.press({ key: 'toggle-wardrobe' })
  await ui.press({ key: 'hat-party' })
  await flush(clock)
  expect(stored(mem, PK.profile)?.hat).toBe('party')
  expect((await ui.find({ key: 'hat-party' }))?.props.variant).toBe('primary')
  await restart($, clock, CWD)
  expect((await get<Profile>($, REF.profile)).hat).toBe('party')
  // pressing the worn hat again writes nothing
  const before = JSON.stringify(mem.get(PK.profile))
  await ui.press({ key: 'hat-party' })
  await flush(clock)
  expect(JSON.stringify(mem.get(PK.profile))).toBe(before)
})

test('a level-up toast names what it unlocked; new pieces wear a star until seen', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: XP_AT[7]! - 1, totals: { tools: 9 }, streak: { count: 1, lastDay: '2026-10-05' } }]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem, tabs: true })
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  const p = stored(mem, PK.profile)!
  expect(levelOf(p.xp).level).toBe(7)
  const t = toasts.find(x => x.startsWith(`Level 7 · ${titleOf(7)}!`))
  expect(t).toContain(`Unlocked: ${listText(unlocksBetween(6, 7).map(u => u.name))}.`)
  expect(t).toContain('Next: Hot Cocoa at Lv 8.')
  expect(p.recent?.some(r => r.verb === 'Level up' && r.what === 'level 7')).toBe(true)
  expect(p.fresh).toContain('hat:cap')
  expect(p.fresh).toContain('decor:ceiling:bunting')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ key: 'tab-wardrobe' }))?.props.label).toBe('Wardrobe •')
  expect((await ui.find({ key: 'tab-decor' }))?.props.label).toBe('Decor •')
  await ui.press({ key: 'tab-wardrobe' })
  await flush(clock)
  // seen: the marker is gone from the save, the star stays for this visit
  expect(stored(mem, PK.profile)?.fresh ?? []).not.toContain('hat:cap')
  expect((await ui.find({ key: 'hat-cap' }))?.props.label).toBe('★ Backwards Cap')
  expect((await ui.find({ key: 'tab-wardrobe' }))?.props.label).toBe('Wardrobe')
  await ui.press({ key: 'tab-decor' })
  await flush(clock)
  expect((await ui.find({ key: 'decor-ceiling-bunting' }))?.props.label).toBe('★ Party Bunting')
  await ui.press({ key: 'tab-room' })
  await ui.press({ key: 'tab-decor' })
  expect((await ui.find({ key: 'decor-ceiling-bunting' }))?.props.label).toBe('Party Bunting')
})

test('a milestone level celebrates in the room for a while', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: XP_AT[10]! - 1, totals: { tools: 9 }, streak: { count: 1, lastDay: '2026-10-05' } }]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem, tabs: true })
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  expect(levelOf(stored(mem, PK.profile)!.xp).level).toBe(10)
  expect((await get<{ kind: string } | null>($, 'celebrate'))?.kind).toBe('milestone')
  expect(toasts.some(t => /^Milestone! Level 10 · Journeyman\. .*a bronze level badge\./.test(t))).toBe(true)
  expect(stored(mem, PK.profile)?.recent?.some(r => r.verb === 'Milestone' && r.what === 'level 10')).toBe(true)
  await clock.advance(6500)
  await flush(clock)
  expect(await get<unknown>($, 'celebrate')).toBe(null)
})

// Level 7 on the original curve (1,600 xp) reads as level 11 now; a stale `notice` from a pre-release build is dropped.
const silentMigration = (tabs: boolean): TestBody => async ($, on) => {
  const old = { version: 1, xp: 1600, totals: { tools: 9 }, notice: { kind: 'upgrade', fromLevel: 7, toLevel: 11 } }
  const mem = new Map<string, unknown>([[PK.profile, old]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem, tabs })
  await flush(clock)
  const p = stored(mem, PK.profile)!
  expect(p.xp >= 1600).toBe(true)
  expect(levelOf(p.xp).level >= 11).toBe(true)
  expect('notice' in p).toBe(false)
  expect(toasts.some(t => /Clawd Quest 1\.0|levels now go to 100|Lv 7/i.test(t))).toBe(false)
  expect(p.recent?.some(r => r.verb === 'Upgrade') ?? false).toBe(false)
  const ui = await $.ui.mount({ ...PANE, surface: tabs ? 'desktop' : 'terminal', props: PANE.props as never })
  expect(await ui.find({ key: 'notice-ok' })).toBe(undefined)
  expect(await ui.find({ text: /Levels now go to 100|recalculated/ })).toBe(undefined)
}

test('an old v1 save migrates silently: no upgrade toast, card or notice field', WITH_PROBE, silentMigration(true))
test('an old v1 save migrates silently on the terminal too', WITH_PROBE, silentMigration(false))

test('a refused permission prompt is neutral', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on, { [KEY]: boardWith('demo-app') }, undefined, { tool: () => ({ deny: 'The user said no' }) })
  await prompt($, 'go')
  await edit($, 'a.ts')
  await bash($, 'npm test')
  await flush(clock)
  const s = await get<{ tools: number; errors: number }>($, REF.stats)
  expect(s.tools).toBe(0)
  expect(s.errors).toBe(0)
  expect((await get<number | null>($, 'combo')) ?? 0).toBe(0)
  const p = await get<Profile>($, REF.profile)
  expect(p.totals.tools).toBe(0)
  expect(p.totals.errors).toBe(0)
  expect((await items($))[0]?.progress).toBe(0)
  expect((await get<{ mood: string }>($, REF.pet)).mood).not.toBe('error')
})

test('an MCP tool with object or array arguments still counts', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await prompt($, 'look it up')
  await $.tool.call({ tool: 'mcp__docs__search', query: { text: 'hooks' }, command: ['ls', '-la'], path: 42 } as never)
  await flush(clock)
  expect((await get<{ tools: number }>($, REF.stats)).tools).toBe(1)
  expect(typeof (await get<{ detail: unknown }>($, REF.pet)).detail).toBe('string')
  expect((await ui.drawn()) !== undefined).toBe(true)
})

test('every scratch folder shares one save, adopting the best old one; stale scratch saves go', WITH_PROBE, async ($, on) => {
  const A = '/tmp/scratch-2026-10-05-aaaaaa'
  const B = '/tmp/scratch-2026-10-06-bbbbbb'
  const best = projectKeys('scratch', '/tmp/scratch-2026-09-01-best')
  const low = projectKeys('scratch', '/tmp/scratch-2026-09-02-low')
  const stale = projectKeys('scratch', '/tmp/scratch-2025-01-01-stale')
  const real = projectKeys('real-app', '/work/real-app')
  const long = START - 200 * 24 * HOUR
  const mem = new Map<string, unknown>([
    [best.profile, { version: 2, xp: 900, totals: { tools: 9 } }],
    [best.decor, { rug: 'none' }],
    [low.profile, { version: 2, xp: 100 }],
    [stale.profile, { version: 2, xp: 10, recent: [{ verb: 'Trophy', what: 'Old', at: long }] }],
    [stale.decor, { rug: 'none' }],
    [real.profile, { version: 2, xp: 10, recent: [{ verb: 'Trophy', what: 'Old', at: long }] }],
  ])
  let dir = A
  const { clock } = await boot($, on, {}, undefined, { mem, cwd: () => dir })
  const shared = projectKeys('scratch', 'scratch')
  expect(shared.id).toBe(projectId('scratch', 'scratch'))
  expect((stored(mem, shared.profile)?.xp ?? 0) >= 900).toBe(true)
  expect(mem.get(shared.decor)).toEqual({ rug: 'none' })
  expect(mem.has(best.profile)).toBe(true) // copied, never moved
  expect(mem.has(stale.profile)).toBe(false)
  expect(mem.has(stale.decor)).toBe(false)
  expect(mem.has(real.profile)).toBe(true) // real projects are never pruned
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  const xp = stored(mem, shared.profile)!.xp
  dir = B
  await restart($, clock, B)
  expect((await get<Profile>($, REF.profile)).xp).toBe(xp)
  await edit($, 'b.ts')
  await flush(clock)
  expect(stored(mem, shared.profile)!.xp > xp).toBe(true)
  expect(mem.has(projectKeys('scratch', B).profile)).toBe(false)
  expect(mem.has(projectKeys('scratch', A).profile)).toBe(false)
})

test('a real folder named scratch is a project of its own; each scratch chat keeps its own board', WITH_PROBE, async ($, on) => {
  expect(isScratchChat('scratch')).toBe(false)
  expect(isScratchChat('scratch-2026-01-01-abc123')).toBe(true)
  const A = '/tmp/scratch-2026-10-05-aaaaaa'
  const B = '/tmp/scratch-2026-10-06-bbbbbb'
  const HOME = '/home/me/scratch'
  const WORK = '/work/scratch'
  // the same save for every chat, a board per chat, and per-path keys for real 'scratch' folders
  const shared = projectKeys('scratch', 'scratch')
  expect(folderKeys('scratch-2026-10-05-aaaaaa', A)).toEqual({ ...shared, board: projectKeys('scratch', A).board })
  expect(folderKeys('scratch-2026-10-06-bbbbbb', B).board).not.toBe(folderKeys('scratch-2026-10-05-aaaaaa', A).board)
  expect(folderKeys('scratch', HOME)).toEqual(projectKeys('scratch', HOME))
  expect(folderKeys('scratch', HOME).id).not.toBe(shared.id)
  const home = projectKeys('scratch', HOME)
  const oldChat = projectKeys('scratch', '/tmp/scratch-2025-01-01-old')
  const long = START - 200 * 24 * HOUR
  const mem = new Map<string, unknown>([
    // an older save of the real folder, idle for 200 days, and a better old chat save
    [home.profile, { version: 2, xp: 2000, recent: [{ verb: 'Trophy', what: 'Old', at: long }] }],
    [home.decor, { rug: 'none' }],
    [oldChat.profile, { version: 2, xp: 900, recent: [{ verb: 'Trophy', what: 'Old', at: long }] }],
  ])
  let dir = HOME
  const { clock } = await boot($, on, {}, undefined, { mem, cwd: () => dir })
  const loaded = (await get<Profile>($, REF.profile)).xp
  expect(loaded >= 2000).toBe(true) // its own save (plus what loading it paid), not a fresh one
  expect(mem.has(shared.profile)).toBe(false)
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  const homeXp = stored(mem, home.profile)!.xp
  expect(homeXp > loaded).toBe(true)
  // another real 'scratch' folder starts its own save
  dir = WORK
  await restart($, clock, WORK)
  expect((await get<Profile>($, REF.profile)).xp).toBe(0)
  // a scratch chat adopts the old chat save, never the real folder's, and prunes only old chat saves
  dir = A
  await restart($, clock, A)
  const adopted = stored(mem, shared.profile)!.xp
  expect(adopted >= 900 && adopted < 1000).toBe(true)
  expect(stored(mem, home.profile)!.xp).toBe(homeXp)
  expect(mem.get(home.decor)).toEqual({ rug: 'none' })
  expect(mem.has(oldChat.profile)).toBe(false)
  // a chat's board lives under its own folder: another chat does not see its path quests
  mem.set(projectKeys('scratch', A).board, boardWith('scratch'))
  await restart($, clock, A)
  expect((await get<{ items: unknown[] } | null>($, REF.board))?.items.length ?? 0).toBeGreaterThan(0)
  dir = B
  await restart($, clock, B)
  expect((await get<{ items: unknown[] } | null>($, REF.board))?.items.length ?? 0).toBe(0)
  expect(mem.has(shared.board)).toBe(false)
})

test('/quests reset asks first; reset confirm also takes off a worn project hat', WITH_PROBE, async ($, on) => {
  const hat = { id: 'big-hat', name: 'Big Hat', rows: ['..aa..', '.aaaa.', 'aaaaaa'], palette: { a: '#FF0000' } }
  const mem = new Map<string, unknown>([[KEY, boardWith('demo-app')], [PK.hat, hat]])
  await boot($, on, {}, undefined, { mem })
  expect(await get<{ name: string } | null>($, 'customHat')).toMatchObject({ name: 'Big Hat' })
  expect(await run($, 'quests', 'reset')).toMatch(/project quests, project trophies and project hats of demo-app.*\/quests reset confirm/)
  expect(mem.has(KEY)).toBe(true)
  expect(await run($, 'quests', 'RESET confirm')).toMatch(/wiped/)
  expect(mem.has(KEY)).toBe(false)
  expect(mem.has(PK.hat)).toBe(false)
  expect(await get<unknown>($, 'customHat')).toBe(null)
})

test('/quests help lists the subcommands; the first word is case-insensitive; an empty campaign shows no name', WITH_PROBE, async ($, on) => {
  await boot($, on, { [KEY]: boardWith('demo-app') })
  expect(await run($, 'quests', 'help')).toBe(QUESTS_HELP)
  expect(await run($, 'quests', 'HELP')).toBe(QUESTS_HELP)
  expect(await run($, 'quests', 'Clear')).toBe('Project quests cleared. Project trophies and hats stay.')
  expect(await run($, 'quests', 'clear')).toBe('No project quests to clear.')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  expect((await ui.find({ text: /No active campaign\. Clawd can scout new quests\./ })) !== undefined).toBe(true)
  expect(await ui.find({ text: /Project quests: Test Run/ })).toBe(undefined)
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal', props: PANE.props as never })
  expect(await terminal.find({ text: /^Project: / })).toBe(undefined)
})

test('/quests allow works before any campaign', WITH_PROBE, async ($, on) => {
  await boot($, on)
  expect(await run($, 'quests', 'allow npm test')).toBe('Clawd counts "npm test" as a check now.')
  const b = await get<{ approved: string[]; items: unknown[] } | null>($, REF.board)
  expect(b?.approved).toEqual(['npm test'])
  expect(b?.items).toHaveLength(0)
})

type SwapBoard = { swapUsed?: boolean; items: Array<{ id: string; title: string; progress: number }> }

test('project quests show their check hint and a one-time Swap', WITH_PROBE, async ($, on) => {
  const { clock, toasts } = await boot($, on, { [KEY]: passBoard() }, undefined, { files: { ...GEN_FILES } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  const hint = checkHint((await items($))[0]!.check as never)
  expect(hint.length > 0).toBe(true)
  expect((await ui.find({ text: hint })) !== undefined).toBe(true)
  // the button and a dim line say there is one swap and that progress is lost
  expect((await ui.find({ key: 'swap-pq0' }))?.props.label).toBe('Swap (1 left)')
  expect((await ui.find({ text: /One swap per campaign; the swapped quest's progress is lost\./ })) !== undefined).toBe(true)
  await ui.press({ key: 'swap-pq0' })
  await flush(clock)
  // a quest without progress swaps on the first press: replaced, saved, and every Swap button gone
  const b = await get<SwapBoard>($, REF.board)
  expect(b.swapUsed).toBe(true)
  expect(b.items[0]!.id).toBe('pq0s')
  expect(b.items[0]!.title).not.toBe('Green twice')
  expect((await ui.find({ key: 'swap-pq0s' })) === undefined).toBe(true)
  expect((await ui.find({ key: 'swap-pq0' })) === undefined).toBe(true)
  expect((await ui.find({ text: /One swap per campaign/ })) === undefined).toBe(true)
  expect(toasts).not.toContain('No other quest fits this project right now.')
  expect(toasts).toContain(`Swapped: Green twice → ${b.items[0]!.title}. No swaps left this campaign.`)
})

test('Swap on a quest with progress asks for a second press', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on, { [KEY]: passBoard('pytest', { items: [{ ...passBoard().items[0], progress: 1 }] }) }, undefined, { files: { ...GEN_FILES } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  await ui.press({ key: 'swap-pq0' })
  await flush(clock)
  expect((await get<SwapBoard>($, REF.board)).swapUsed).not.toBe(true)
  expect((await ui.find({ key: 'swap-pq0' }))?.props.label).toBe('Swap? Progress is lost')
  // leaving the tab disarms it
  await ui.press({ key: 'tab-room' })
  await ui.press({ key: 'tab-quests' })
  expect((await ui.find({ key: 'swap-pq0' }))?.props.label).toBe('Swap (1 left)')
  await ui.press({ key: 'swap-pq0' })
  await ui.press({ key: 'swap-pq0' })
  await flush(clock)
  const b = await get<SwapBoard>($, REF.board)
  expect(b.swapUsed).toBe(true)
  expect(b.items[0]!.id).toBe('pq0s')
  expect(b.items[0]!.progress).toBe(0)
})

test('Swap with no other quest that fits says so and keeps the swap', WITH_PROBE, async ($, on) => {
  // an empty tree's only warm-up is the one already on the board
  const warmup = boardWith('demo-app', { items: [{ id: 'pq0', title: 'Read 3 project files', role: 'warmup', check: { type: 'tally', activity: 'read', path: '', seen: [] }, goal: 3, progress: 0, xp: 25, why: '', done: false }] })
  const { clock, toasts } = await boot($, on, { [KEY]: warmup }, undefined, { files: {} })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  await ui.press({ key: 'swap-pq0' })
  await flush(clock)
  expect(toasts).toContain('No other quest fits this project right now.')
  const b = await get<SwapBoard>($, REF.board)
  expect(b.swapUsed).not.toBe(true)
  expect(b.items[0]!.id).toBe('pq0')
  expect((await ui.find({ key: 'swap-pq0' })) !== undefined).toBe(true)
})

test('a failing store is told once', WITH_PROBE, async ($, on) => {
  const { clock, toasts } = await boot($, on, {}, undefined, { failSet: true })
  await prompt($, 'go')
  await edit($, 'a.ts')
  await edit($, 'b.ts')
  await flush(clock)
  expect(toasts.filter(t => t === 'Clawd could not save progress (storage full or unavailable).')).toHaveLength(1)
})

test('a dropped prompt starts nothing', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on, {}, undefined, { prompt: () => ({ drop: 'blocked' }) })
  await prompt($, 'please and thanks')
  await flush(clock)
  expect(Object.keys((await get<{ achievements: Record<string, number> }>($, REF.profile)).achievements)).not.toContain('polite')
  expect((await get<{ mood: string } | null>($, REF.pet))?.mood).not.toBe('thinking')
})

test('desktop spinner keeps the engine step text; the terminal gets the flavour verb', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  const words: string[] = []
  on('ui.render', { component: 'Spinner' }, (_$, e) => {
    const word = String((e.props as { word?: unknown }).word)
    words.push(word)
    return h('Text', null, word) as never
  })
  const props = { ...SPINNER.props, word: 'Reading notes.md', mode: 'tool-use' }
  const desk = await $.ui.mount({ ...SPINNER, surface: 'desktop', props: props as never })
  expect(words.at(-1)).toBe('Reading notes.md')
  await desk.unmount()
  const term = await $.ui.mount({ ...SPINNER, surface: 'terminal', props: props as never })
  expect(words.at(-1)).not.toBe('Reading notes.md')
  await term.unmount()
})

test('a respawn keeps the usage meters; a new session starts them over', WITH_PROBE, async ($, on) => {
  let sid = 'session-1'
  const { clock } = await boot($, on, {}, undefined, { sid: () => sid })
  await measure($, { rateLimits: [] })
  await flush(clock)
  expect((await get<Usage>($, 'usage')).context?.pct).toBe(62)
  await restart($, clock, CWD)
  expect((await get<Usage>($, 'usage')).context?.pct).toBe(62)
  sid = 'session-2'
  await restart($, clock, CWD)
  expect((await get<Usage>($, 'usage')).context).toBe(null)
})

test('decor tab: counts, the next piece, far-off slots fold to one line', WITH_PROBE, async ($, on) => {
  await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-decor' })
  expect((await ui.find({ text: /^Decor \d+\/\d+$/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /^Desk lamp · first piece at Lv 16$/ })) !== undefined).toBe(true)
  expect((await ui.find({ text: /^Next: Tea · Lv 3$/ })) !== undefined).toBe(true)
  const toggle = await ui.find({ key: 'toggle-decor:drink' })
  expect(String(toggle?.props.label)).toMatch(/^\+\d+ locked$/)
  await ui.press({ key: 'toggle-decor:drink' })
  expect((await ui.find({ text: /^Triple Espresso · trophy Night Owl$/ })) !== undefined).toBe(true)
})

test('decor tab: an empty slot shows no blank preview box', WITH_PROBE, async ($, on) => {
  // level 1: the Wall row is open (its pennant is 10 levels off) and shows 'Nothing'; the drink shows its coffee
  await boot($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-decor' })
  expect((await ui.find({ key: 'decor-wall-none' })) !== undefined).toBe(true)
  const previews = (await ui.findAll({ type: 'Svg' })).map(e => String(e.props.alt ?? ''))
  expect(previews).toContain('Desk drink: Coffee')
  expect(previews.some(alt => alt.startsWith('Wall hanging'))).toBe(false)
  expect(previews.some(alt => alt.startsWith('Roommate'))).toBe(false)
})

test('trophies tab: the count uses known trophies only', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: 50, totals: { tools: 9 }, achievements: { 'hello-world': START - 1000, 'retired-id': START } }]])
  await boot($, on, {}, undefined, { mem })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-trophies' })
  const shown = await ui.find({ text: /^Trophies \d+\/80$/ })
  const known = Object.keys(stored(mem, PK.profile)!.achievements).filter(id => id !== 'retired-id').length
  expect(String(shown?.text)).toBe(`Trophies ${known}/80`)
})

test('a continuation turn starts its own count', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on)
  const achievements = async () => Object.keys((await get<{ achievements: Record<string, number> }>($, REF.profile)).achievements)
  await prompt($, 'go')
  for (const f of ['a.ts', 'b.ts']) await edit($, f)
  await turnDone($, 'answer')
  await flush(clock)
  // a continuation (no prompt): one tool is one tool, not three
  await $.turn.start({ text: '', turnId: 't2' } as never)
  await edit($, 'c.ts')
  await turnDone($, 'answer')
  await flush(clock)
  expect(await achievements()).not.toContain('speedrun')
  await $.turn.start({ text: '', turnId: 't3' } as never)
  for (const f of ['d.ts', 'e.ts', 'f.ts']) await edit($, f)
  await turnDone($, 'answer')
  await flush(clock)
  expect(await achievements()).toContain('speedrun')
})

test('a catalog trophy toast shows the xp it pays, like every other reward toast', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: 50, totals: { tools: 9, edits: 499 }, streak: { count: 1, lastDay: '2026-10-05' } }]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem })
  await prompt($, 'go')
  await flush(clock)
  toasts.length = 0
  await edit($, 'a.ts')
  await flush(clock)
  expect(toasts.some(t => t.includes('Trophy unlocked: Wordsmith (+50 xp)'))).toBe(true)
})

test('old totals meeting several new trophies fold into one toast', WITH_PROBE, async ($, on) => {
  const totals = { tools: 9, reads: 1000, searches: 1000, edits: 2500, turns: 1000 }
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: 50, totals, streak: { count: 1, lastDay: '2026-10-05' } }]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem })
  await prompt($, 'go')
  await flush(clock)
  // the fold leads the toast, or follows a level-up the trophies paid for
  const folded = toasts.find(t => /(^|Also: )\+\d+ trophies from your history: /.test(t))
  expect(folded !== undefined).toBe(true)
  expect(toasts.some(t => t.startsWith('Trophy unlocked: Librarian'))).toBe(false)
  const recent = stored(mem, PK.profile)?.recent ?? []
  // one Recent entry per trophy, capped like every Recent list
  expect(recent.length).toBe(RECENT_SIZE)
  expect(recent.some(r => r.verb === 'Trophy')).toBe(true)
})

test('level 100 is a legend; every 1,000 xp past it is an Encore star', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: XP_AT[100]! - 1, totals: { tools: 9 }, streak: { count: 1, lastDay: '2026-10-05' } }]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem, tabs: true })
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  expect(toasts.some(t => /^LEGEND! Level 100\..*Encore stars start now\./.test(t))).toBe(true)
  expect((await get<{ kind: string } | null>($, 'celebrate'))?.kind).toBe('legend')
  expect(stored(mem, PK.profile)?.recent?.some(r => r.verb === 'Legend' && r.what === 'level 100')).toBe(true)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  expect((await ui.find({ text: /^Lv 100 · Legend +[\d,]+\/1,000 to the next star$/ })) !== undefined).toBe(true)

  // one star short of the first Encore star
  await clock.advance(10_000)
  mem.set(PK.profile, { ...stored(mem, PK.profile)!, xp: XP_AT[100]! + 999 })
  await edit($, 'b.ts')
  await flush(clock)
  expect(toasts.some(t => t.startsWith('Encore star ★1!'))).toBe(true)
  expect((await get<{ kind: string } | null>($, 'celebrate'))?.kind).toBe('star')
  expect((await ui.find({ text: /^Lv 100 · Legend ★1/ })) !== undefined).toBe(true)
})

test('an inline terminal pane keeps to a compact layout', WITH_PROBE, async ($, on) => {
  await boot($, on)
  const full = await $.ui.mount({ ...PANE, surface: 'terminal', props: PANE.props as never })
  expect((await full.find({ text: 'Daily' })) !== undefined).toBe(true)
  expect((await full.find({ text: /^Lv 1 Hatchling · \d+\/\d+ xp · No streak$/ })) !== undefined).toBe(true)
  expect((await full.find({ text: /^Next: Party Hat at Lv 2$/ })) !== undefined).toBe(true)
  await full.unmount()
  const inline = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, placement: 'inline' } as never })
  expect(await inline.find({ text: 'Daily' })).toBe(undefined)
  expect((await inline.find({ text: /^Lv 1 Hatchling · / })) !== undefined).toBe(true)
  expect((await inline.find({ text: /^\[ \] / })) !== undefined).toBe(true)
})

// ---------- regressions ----------

const reply = async ($: Dollar, args: string) =>
  String(((await $.command.run({ command: 'quests', args, origin: { kind: 'composer' }, presentation: PRESENTATION } as never)) as { text?: string }).text)

test('only a foreground Bash or PowerShell run is a check', async () => {
  expect(normArgs({ command: 'pytest', run_in_background: true }).run_in_background).toBe(true)
  expect(normArgs({ command: 'pytest', run_in_background: 'yes' }).run_in_background).toBe(undefined)
  expect(checkCommand('Bash', { command: 'pytest' })).toBe('pytest')
  expect(checkCommand('PowerShell', { command: 'Invoke-Pester' })).toBe('Invoke-Pester')
  expect(checkCommand('Bash', { command: 'pytest', run_in_background: true })).toBe('')
  expect(checkCommand('Monitor', { command: 'pytest' })).toBe('')
  expect(checkCommand('mcp__terminal__run_in_terminal', { command: 'npm test' })).toBe('')
})

test('a backgrounded, watched or MCP-started command never counts as a passing check', WITH_PROBE, async ($, on) => {
  const { clock } = await boot($, on, { [KEY]: passBoard() })
  await prompt($, 'fix it')
  await edit($, 'src/a.ts')
  await turnDone($, 'answer')
  await clock.advance(1000)
  await prompt($, 'test it')
  await $.tool.call({ tool: 'Bash', command: 'pytest', run_in_background: true } as never)
  await $.tool.call({ tool: 'Monitor', command: 'pytest -q' } as never)
  await $.tool.call({ tool: 'mcp__terminal__run_in_terminal', command: 'pytest' } as never)
  await flush(clock)
  expect((await items($))[0]?.progress).toBe(0)
  // the same check run in the foreground does
  await bash($, 'pytest')
  await flush(clock)
  expect((await items($))[0]?.progress).toBe(1)
})

// A save where one more tool call announces nothing: today's quests done and claimed, every trophy held, mid-level.
const quietSave = () => {
  const done = (id: string) => ({ id, title: id, goal: 1, progress: 1, xp: 7, done: true })
  return {
    version: 2, xp: XP_AT[40]! + 50, totals: { tools: 900 }, achievements: Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, START - 1000])),
    quests: { day: '2026-10-05', items: [done('prompts'), done('turns'), done('tools')] }, sweeps: 1, sweepClaimed: '2026-10-05',
    streak: { count: 1, lastDay: '2026-10-05' },
  }
}
const beatPool = (activity: Parameters<typeof doneBeat>[0], command: string) =>
  new Set(Array.from({ length: 200 }, (_, i) => doneBeat(activity, command, () => i / 200)))

test('a finished commit gets its done cheer; a plain ls and a background run do not (B90)', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, quietSave()]])
  const { clock } = await boot($, on, {}, undefined, { mem })
  await prompt($, 'commit it')
  await bash($, 'git commit -m x')
  await flush(clock)
  const pet = await get<{ mood: string; quip: string }>($, REF.pet)
  expect(pet.mood).toBe('happy')
  expect(beatPool(activityFor('Bash', { command: 'git commit -m x' }), 'git commit -m x').has(pet.quip)).toBe(true)
  await clock.advance(4000)
  await bash($, 'ls')
  await flush(clock)
  expect((await get<{ mood: string }>($, REF.pet)).mood).not.toBe('happy')
  await clock.advance(4000)
  await $.tool.call({ tool: 'Bash', command: 'pytest', run_in_background: true } as never)
  await flush(clock)
  expect((await get<{ mood: string }>($, REF.pet)).mood).not.toBe('happy')
  await $.tool.call({ tool: 'Agent', description: 'look around', run_in_background: true } as never)
  await flush(clock)
  expect((await get<{ mood: string }>($, REF.pet)).mood).not.toBe('happy')
})

test('seasonal decor is announced and starred when its month starts', WITH_PROBE, async ($, on) => {
  // the last active day was 30 September; START is in October
  const old = { day: '2026-09-30', items: [] }
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: 50, totals: { tools: 9 }, quests: old, streak: { count: 1, lastDay: '2026-09-30' } }]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem, tabs: true })
  await prompt($, 'go')
  await flush(clock)
  const p = stored(mem, PK.profile)!
  expect(p.fresh).toContain('decor:companion:ghost')
  expect(p.fresh).toContain('hat:pumpkin')
  expect(p.recent?.some(r => r.verb === 'New decor' && r.what === 'Friendly Ghost')).toBe(true)
  expect(toasts.some(t => t.includes('Friendly Ghost'))).toBe(true)
  // announced once
  const before = toasts.filter(t => t.includes('Friendly Ghost')).length
  await edit($, 'a.ts')
  await flush(clock)
  expect(toasts.filter(t => t.includes('Friendly Ghost')).length).toBe(before)
})

test('the terminal keeps decor out of its toasts (B26) but still remembers it', WITH_PROBE, async ($, on) => {
  const old = { day: '2026-09-30', items: [] }
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: 50, totals: { tools: 9 }, quests: old, streak: { count: 1, lastDay: '2026-09-30' } }]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem })
  await prompt($, 'go')
  await flush(clock)
  expect(toasts.some(t => /decor|Friendly Ghost/.test(t))).toBe(false)
  expect(toasts.some(t => t.includes('Wardrobe'))).toBe(false)
  expect(stored(mem, PK.profile)?.recent?.some(r => r.verb === 'New hat' && r.what === 'Pumpkin')).toBe(true)
  expect(stored(mem, PK.profile)?.recent?.some(r => r.verb === 'New decor' && r.what === 'Friendly Ghost')).toBe(true)
})

test('session.start waits for a setup another hook started, so the session still saves', WITH_PROBE, async ($, on) => {
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  let held = true
  const mem = new Map<string, unknown>()
  const { clock } = await boot($, on, {}, undefined, { mem, noStart: true, listGate: () => (held ? gate : Promise.resolve()) })
  // a hot reload: a prompt reaches the fresh module first and starts the setup, then session.start runs alone
  const first = prompt($, 'hello')
  await clock.settle()
  const start = $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
  await clock.settle()
  held = false
  release()
  await first
  await start
  await flush(clock)
  await prompt($, 'go')
  for (const f of ['a.ts', 'b.ts', 'c.ts']) await edit($, f)
  await flush(clock)
  expect((stored(mem, PK.profile)?.xp ?? 0) > 0).toBe(true)
  expect((await get<Profile>($, REF.profile)).xp).toBe(stored(mem, PK.profile)?.xp)
})

test('a game event queued while session.start reloads is never applied to a blank profile', WITH_PROBE, async ($, on) => {
  let release: () => void = () => undefined
  let gate: Promise<void> | undefined
  let reached: () => void = () => undefined
  const atGate = new Promise<void>(resolve => {
    reached = resolve // the reloaded setup is held before it knows the project
  })
  const saved = { version: 2, xp: XP_AT[12]!, totals: { tools: 40, edits: 20 }, achievements: { 'first-steps': START - 86_400_000 } }
  const mem = new Map<string, unknown>([[PK.profile, saved]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem, noStart: true, cwdGate: () => {
    if (gate) reached()
    return gate ?? Promise.resolve()
  } })
  // a hot reload: tool calls reach the fresh module first (its setup loads the project) and queue their game work
  await edit($, 'a.ts')
  await edit($, 'b.ts')
  // then session.start runs alone: it resets the module and loads the project again (held here), and the
  // queued game work runs meanwhile
  gate = new Promise<void>(resolve => {
    release = resolve
  })
  const start = $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
  await atGate
  for (let i = 0; i < 10; i++) await clock.settle()
  gate = undefined
  release()
  await start
  await flush(clock)
  // no false unlock from a blank profile (First Steps on its first tool call), and the pane never fell to Lv 1
  expect(toasts.filter(t => /First Steps/.test(t))).toEqual([])
  expect((await get<Profile>($, REF.profile)).xp >= XP_AT[12]!).toBe(true)
  expect((stored(mem, PK.profile)?.xp ?? 0) >= XP_AT[12]!).toBe(true)
})

test('a decor pick cheers, then Clawd rests and later falls asleep (the greeting and project hat tests check the rest too)', WITH_PROBE, async ($, on) => {
  // level 6: the Round Rug is open
  const mem = new Map<string, unknown>([[PK.profile, { version: 2, xp: XP_AT[6]!, totals: { tools: 9 } }]])
  const { clock } = await boot($, on, {}, undefined, { mem })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-decor' })
  await ui.press({ key: 'decor-rug-round' })
  await flush(clock)
  expect(await get<{ mood: string; quip: string }>($, REF.pet)).toMatchObject({ mood: 'happy', quip: 'Round Rug. Nice touch.' })
  await clock.advance(4000)
  await flush(clock)
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('idle')
  await clock.advance(4 * 60_000)
  await flush(clock)
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('sleeping')
})

test('a worn project hat keeps its board id through a restart (B46)', WITH_PROBE, async ($, on) => {
  const milestone = { id: 'm1', name: 'Big One', description: 'Pass a lot', check: { type: 'pass', tool: 'any', fix: false, red: false, edited: false, tainted: false, at: 0 }, goal: 5, progress: 5, xp: 100, done: true, unlockedAt: START }
  // a board id keeps the project name's case and runs past 32 characters
  const hat = { id: 'Demo-App-crystal-crown-of-ages-supreme', name: 'Crystal Crown', rows: ['..aa..', '.abba.', 'aaaaaa'], palette: { a: '#4F8BD8', b: '#F6D365' }, milestoneId: 'm1' }
  const mem = new Map<string, unknown>([[KEY, boardWith('demo-app', { milestones: [milestone], hats: [hat] })]])
  const { clock } = await boot($, on, {}, undefined, { mem, tabs: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-wardrobe' })
  await ui.press({ key: `phat-${hat.id}` })
  await flush(clock)
  expect((await ui.find({ key: `phat-${hat.id}` }))?.props.variant).toBe('primary')
  // the custom-made line cheers, then Clawd rests
  expect((await get<{ mood: string; quip: string }>($, REF.pet)).quip.includes('Custom made')).toBe(true)
  await clock.advance(4000)
  await flush(clock)
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('idle')
  await restart($, clock, CWD)
  expect((await get<{ id: string } | null>($, 'customHat'))?.id).toBe(hat.id)
  expect((await ui.find({ key: `phat-${hat.id}` }))?.props.variant).toBe('primary')
  // pressing it again changes nothing: no second happy line
  await clock.advance(10_000)
  await prompt($, 'next')
  await flush(clock)
  expect((await get<{ quip: string }>($, REF.pet)).quip.includes('Custom made')).toBe(false)
  await ui.press({ key: `phat-${hat.id}` })
  await flush(clock)
  expect((await get<{ quip: string }>($, REF.pet)).quip.includes('Custom made')).toBe(false)
})

test('No hat and a catalog hat both take off a worn project hat, also after a restart', WITH_PROBE, async ($, on) => {
  const milestone = { id: 'm1', name: 'Big One', description: 'Pass a lot', check: { type: 'pass', tool: 'any', fix: false, red: false, edited: false, tainted: false, at: 0 }, goal: 5, progress: 5, xp: 100, done: true, unlockedAt: START }
  const hat = { id: 'demo-app-crystal-crown', name: 'Crystal Crown', rows: ['..aa..', '.abba.', 'aaaaaa'], palette: { a: '#4F8BD8', b: '#F6D365' }, milestoneId: 'm1' }
  const mem = new Map<string, unknown>([
    [KEY, boardWith('demo-app', { milestones: [milestone], hats: [hat] })],
    [PK.profile, { version: 2, xp: 50, totals: { tools: 9 }, streak: { count: 1, lastDay: '2026-10-05' } }],
  ])
  const { clock } = await boot($, on, {}, undefined, { mem, tabs: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  const mirrorAlt = async () => (await ui.findAll({ type: 'Svg' })).map(e => String(e.props.alt)).find(a => a.startsWith('Clawd in the mirror'))
  await ui.press({ key: 'tab-wardrobe' })
  for (const off of ['hat-none', 'hat-party']) {
    await ui.press({ key: `phat-${hat.id}` })
    await flush(clock)
    expect((await get<{ id: string } | null>($, 'customHat'))?.id).toBe(hat.id)
    expect(mem.has(PK.hat)).toBe(true)
    expect(await mirrorAlt()).toBe('Clawd in the mirror, wearing the Crystal Crown')
    await ui.press({ key: off })
    await flush(clock)
    const want = off === 'hat-party' ? 'party' : null
    const check = async () => {
      expect(await get<unknown>($, 'customHat')).toBe(null)
      expect(mem.has(PK.hat)).toBe(false)
      expect(stored(mem, PK.profile)?.hat ?? null).toBe(want)
      expect((await ui.find({ key: `phat-${hat.id}` }))?.props.variant).not.toBe('primary')
    }
    await check()
    expect(await mirrorAlt()).toBe(want === null ? 'Clawd in the mirror' : 'Clawd in the mirror, wearing the Party Hat')
    // a new session finds the same hat (or none), not the project hat
    await restart($, clock, CWD)
    await check()
  }
})

test('a generation an earlier module left working is cleared on load', WITH_PROBE, async ($, on) => {
  // $.state survives a hot reload, the generation promise does not: the new module finds 'working'
  let leftover = true
  on('state.get', async (_$, e, next) => {
    const r = await next(e) as { value?: { value?: unknown; version?: number } }
    if (!leftover || (e as { key?: string }).key !== 'questGen') return r as never
    return { ...r, value: { ...r.value, value: { status: 'working', message: 'Clawd is scouting demo-app for quests...', startedAt: START } } } as never
  })
  on('state.set', (_$, e, next) => {
    if ((e as { key?: string }).key === 'questGen') leftover = false
    return next(e)
  })
  let calls = 0
  const { clock } = await boot($, on, {}, () => {
    calls += 1
    return { isAnswered: true, text: GEN_REPLY, usage: USAGE }
  }, { files: { ...GEN_FILES } })
  expect((await get<{ status: string }>($, REF.questGen)).status).toBe('idle')
  expect(await reply($, '')).toMatch(/^Clawd is scouting demo-app for quests\./)
  await flush(clock)
  expect(calls).toBe(1)
  expect((await get<{ campaign: string } | null>($, REF.board))?.campaign).toBe('Seven Seas')
})

// The first model call is held open until release(); later calls answer at once.
function heldModel(answer: () => unknown) {
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const asked: string[] = []
  const model: Model = async ask => {
    asked.push(ask.model ?? '')
    if (asked.length === 1) await gate
    return answer()
  }
  return { model, asked, release: () => release() }
}

test('/quests <focus> while a generation runs says so instead of claiming the focus', WITH_PROBE, async ($, on) => {
  const m = heldModel(() => ({ isAnswered: true, text: GEN_REPLY, usage: USAGE }))
  const { clock } = await boot($, on, {}, m.model, { files: { ...GEN_FILES } })
  expect(await reply($, '')).toMatch(/^Clawd is scouting/)
  await clock.settle()
  expect(await reply($, 'tests')).toBe('Clawd is already scouting demo-app for quests. Try /quests tests again when this campaign arrives.')
  m.release()
  await flush(clock)
  expect(m.asked).toHaveLength(1)
  expect((await get<{ campaign: string } | null>($, REF.board))?.campaign).toBe('Seven Seas')
})

test('/quests reset confirm drops a generation still running (B18)', WITH_PROBE, async ($, on) => {
  const m = heldModel(() => ({ isAnswered: true, text: GEN_REPLY, usage: USAGE }))
  const milestone = { id: 'm1', name: 'Big One', description: 'Pass a lot', check: { type: 'pass', tool: 'any', fix: false, red: false, edited: false, tainted: false, at: 0 }, goal: 5, progress: 5, xp: 100, done: true, unlockedAt: START }
  const { clock } = await boot($, on, { [KEY]: boardWith('demo-app', { items: [], milestones: [milestone] }) }, m.model, { files: { ...GEN_FILES } })
  expect(await reply($, '')).toMatch(/^Clawd is scouting/)
  await clock.settle()
  expect(await reply($, 'reset confirm')).toMatch(/wiped/)
  m.release()
  await flush(clock)
  expect(await get<unknown>($, REF.board)).toBe(null)
  expect((await get<{ status: string }>($, REF.questGen)).status).toBe('idle')
})

// A reset while the model is out: the late reply (or failure) is dropped, and Clawd still leaves the scouting scene.
async function resetMidGeneration($: Dollar, on: On, answer: () => unknown): Promise<void> {
  const m = heldModel(answer)
  // a finished milestone gives the reset something to wipe while the new campaign is being written
  const milestone = { id: 'm1', name: 'Big One', description: 'Pass a lot', check: { type: 'pass', tool: 'any', fix: false, red: false, edited: false, tainted: false, at: 0 }, goal: 5, progress: 5, xp: 100, done: true, unlockedAt: START }
  const { clock } = await boot($, on, { [KEY]: boardWith('demo-app', { items: [], milestones: [milestone] }) }, m.model, { files: { ...GEN_FILES } })
  expect(await reply($, '')).toMatch(/^Clawd is scouting/)
  await clock.settle()
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('reading')
  expect(await reply($, 'reset confirm')).toMatch(/wiped/)
  m.release()
  await flush(clock)
  expect(await get<unknown>($, REF.board)).toBe(null)
  await clock.advance(5500)
  await flush(clock)
  expect((await get<{ mood: string }>($, REF.pet)).mood).toBe('idle')
}

test('/quests reset confirm during a generation still sends Clawd back to rest', WITH_PROBE, async ($, on) => {
  await resetMidGeneration($, on, () => ({ isAnswered: true, text: GEN_REPLY, usage: USAGE }))
})

test('/quests reset confirm during a failing generation still sends Clawd back to rest', WITH_PROBE, async ($, on) => {
  await resetMidGeneration($, on, () => {
    throw new Error('offline')
  })
})

test('a generation stuck past GEN_STALE_MS can be started again; the late reply is dropped (B18)', WITH_PROBE, async ($, on) => {
  let n = 0
  const m = heldModel(() => ({ isAnswered: true, text: n++ === 0 ? GEN_REPLY : GEN_REPLY.replace('Seven Seas', 'Stale Seas'), usage: USAGE }))
  const { clock } = await boot($, on, {}, m.model, { files: { ...GEN_FILES } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  const first = ui.press({ key: 'gen-quests' })
  await clock.settle()
  expect((await get<{ status: string }>($, REF.questGen)).status).toBe('working')
  // not stale yet: a second press is a no-op
  await ui.press({ key: 'gen-quests' })
  expect(m.asked).toHaveLength(1)
  // past GEN_STALE_MS /quests no longer says it is busy and starts over
  await clock.advance(241_000)
  expect(await reply($, '')).toMatch(/^Clawd is scouting demo-app for quests\./)
  await flush(clock)
  expect(m.asked).toHaveLength(2)
  expect((await get<{ campaign: string } | null>($, REF.board))?.campaign).toBe('Seven Seas')
  // the first, stale generation answers at last: dropped
  m.release()
  await first
  await flush(clock)
  expect((await get<{ campaign: string } | null>($, REF.board))?.campaign).toBe('Seven Seas')
})

test('quest generation falls back from sonnet to haiku and keeps haiku for the repair ask (B50)', WITH_PROBE, async ($, on) => {
  const asked: string[] = []
  const bad = JSON.stringify({ campaign: 'Nope', quests: [{ title: 'Push it', role: 'quest', check: { type: 'pass', tool: 'git push' } }] })
  const { clock } = await boot($, on, {}, ask => {
    asked.push(ask.model ?? '')
    if (ask.model === 'sonnet') return { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE }
    return { isAnswered: true, text: bad, usage: USAGE }
  }, { files: { ...GEN_FILES } })
  expect(await reply($, '')).toMatch(/^Clawd is scouting/)
  await flush(clock)
  expect(asked).toEqual(['sonnet', 'haiku', 'haiku'])
  expect((await items($)).length).toBeGreaterThan(0)
})

test('quest generation: no model answers, or the call is cut, each tells why (B50)', WITH_PROBE, async ($, on) => {
  const asked: string[] = []
  let cut = false
  const { clock } = await boot($, on, {}, ask => {
    asked.push(ask.model ?? '')
    return cut ? { isAnswered: false, reason: 'aborted', usage: USAGE } : { isAnswered: false, reason: 'api-error', status: 403, error: 'authentication_failed', usage: USAGE }
  }, { files: { ...GEN_FILES } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-quests' })
  await ui.press({ key: 'gen-quests' })
  await flush(clock)
  expect(asked).toEqual(['sonnet', 'haiku'])
  expect((await ui.find({ text: /No model is available for \/quests\./ })) !== undefined).toBe(true)
  // an aborted call is a timeout: no other model is tried
  await clock.advance(61_000)
  await flush(clock)
  cut = true
  asked.length = 0
  await ui.press({ key: 'gen-quests' })
  await flush(clock)
  expect(asked).toEqual(['sonnet'])
  expect((await ui.find({ text: /Claude did not answer in time\./ })) !== undefined).toBe(true)
})

test('the context meter measures against the usable window, read again after /compact (B95)', WITH_PROBE, async ($, on) => {
  let buffer = 33000
  const summary = () => ({
    startedAt: 0, rateLimits: [],
    context: { window: 200000, tokens: 0, percent: 0, breakdown: { categories: [{ name: 'Autocompact buffer', tokens: buffer, kind: 'buffer' }], maxTokens: 200000, rawMaxTokens: 200000, isAutoCompactEnabled: true } },
  })
  const { clock } = await boot($, on, {}, undefined, { usage: summary })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  const pct = async () => Number(/Context (\d+)% full/.exec(await roomAlt(ui))?.[1] ?? NaN)
  await measure($)
  await flush(clock)
  // 124k of 167k usable is 74%, drawn in 5% steps: well above the raw 62%
  expect(await pct()).toBe(75)
  // after /compact the limit is read again: with no buffer the engine's own 62% stands
  buffer = 0
  await $.session.compact({ messages: SUMMARY } as never)
  await flush(clock)
  await clock.advance(10_000)
  await measure($)
  await flush(clock)
  expect(await pct()).toBe(60)
})

test('every 5th Encore star gets the milestone celebration', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, { ...quietSave(), xp: XP_AT[100]! + 5 * STAR_XP - 1 }]])
  const { clock, toasts, toastMs } = await boot($, on, {}, undefined, { mem, tabs: true })
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  const at5 = toasts.findIndex(t => t.startsWith('Encore star ★5!'))
  expect(at5 >= 0).toBe(true)
  expect(toastMs[at5]).toBe(9000)
  expect((await get<{ kind: string } | null>($, 'celebrate'))?.kind).toBe('milestone')
  // star 6: the small one again
  await clock.advance(10_000)
  mem.set(PK.profile, { ...stored(mem, PK.profile)!, xp: XP_AT[100]! + 6 * STAR_XP - 1 })
  await edit($, 'b.ts')
  await flush(clock)
  const at6 = toasts.findIndex(t => t.startsWith('Encore star ★6!'))
  expect(at6 >= 0).toBe(true)
  expect(toastMs[at6]).not.toBe(9000)
  expect((await get<{ kind: string } | null>($, 'celebrate'))?.kind).toBe('star')
})

test('the level-up toast does not re-announce a hat already owned some other way', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, { ...quietSave(), xp: XP_AT[10]! - 1, achievements: { polyglot: START - 1000 } }]])
  const { clock, toasts } = await boot($, on, {}, undefined, { mem })
  await prompt($, 'go')
  await edit($, 'a.ts')
  await flush(clock)
  const level = toasts.find(t => t.startsWith('Milestone! Level 10'))
  expect(level !== undefined).toBe(true)
  expect(level?.includes('Wizard Hat')).toBe(false)
})

// ---------- section 5 paths at other widths and on the terminal ----------

const lv18 = () => {
  const ids = ACHIEVEMENTS.filter(a => !a.hidden).slice(0, 10).map(a => a.id)
  return { ...quietSave(), xp: XP_AT[18]! + 20, achievements: Object.fromEntries(ids.map((id, i) => [id, START - 100_000 + i * 1000])) }
}
const at = (cols: number) => ({ ...PANE.props, bodyColumns: cols }) as never

test('trophies tab: newest first, 8 shown, Show all (N); narrow panes use two lines everywhere (B36, B38)', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, lv18()]])
  await boot($, on, {}, undefined, { mem, tabs: true })
  const p = stored(mem, PK.profile)!
  const newest = Object.entries(p.achievements)
    .filter(([id]) => ACHIEVEMENTS.some(a => a.id === id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => ACHIEVEMENTS.find(a => a.id === id)!.name)
  const wide = await $.ui.mount({ ...PANE, surface: 'desktop', props: at(100) })
  await wide.press({ key: 'tab-trophies' })
  const rows = (await wide.findAll({ text: /^★ .+ — / })).map(t => String(t.text))
  expect(rows).toHaveLength(8)
  expect(rows[0]?.startsWith(`★ ${newest[0]} — `)).toBe(true)
  expect(rows[7]?.startsWith(`★ ${newest[7]} — `)).toBe(true)
  expect((await wide.find({ key: 'toggle-unlocked' }))?.props.label).toBe(`Show all (${newest.length})`)
  await wide.press({ key: 'toggle-unlocked' })
  expect(await wide.findAll({ text: /^★ .+ — / })).toHaveLength(newest.length)
  expect((await wide.find({ key: 'toggle-unlocked' }))?.props.label).toBe('Show fewer')
  // the expanded locked list: one line when wide, the hidden ones as one line
  await wide.press({ key: 'toggle-locked' })
  expect((await wide.findAll({ text: /^☆ .+ — .+ {2}[\d,]+\/[\d,]+$/ })).length > 0).toBe(true)
  expect((await wide.find({ text: /^☆ \?\?\? — \d+ hidden trophies left to find$/ })) !== undefined).toBe(true)

  // narrow: every list puts the description (and the progress) on its own line
  await wide.unmount()
  const narrow = await $.ui.mount({ ...PANE, surface: 'desktop', props: at(40) })
  await narrow.press({ key: 'tab-trophies' })
  expect(await narrow.findAll({ text: /^★ .+ — / })).toHaveLength(0)
  expect(await narrow.findAll({ text: /^☆ [^?].+ — / })).toHaveLength(0)
  expect((await narrow.findAll({ text: /^ {4}.+ {2}[\d,]+\/[\d,]+$/ })).length > 0).toBe(true)
})

test('decor tab: slot counts use the header base (defaults do not count)', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, lv18()]])
  await boot($, on, {}, undefined, { mem, tabs: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PANE.props as never })
  await ui.press({ key: 'tab-decor' })
  const header = /^Decor (\d+)\/(\d+)$/.exec(String((await ui.find({ text: /^Decor \d+\/\d+$/ }))?.text))
  expect(Number(header?.[2])).toBe(98)
  // Desk drink at Lv 18: Tea, Clawd Energy, Hot Cocoa and Boba Tea of the 8 real pieces (Coffee does not count)
  expect((await ui.find({ text: 'Desk drink 4/8' })) !== undefined).toBe(true)
})

test('terminal: the Next line names hats only; the claim button, its footer and the questGen line show (B26)', WITH_PROBE, async ($, on) => {
  const save = lv18()
  const done = (id: string) => ({ id, title: id, goal: 1, progress: 1, xp: 7, done: true })
  const mem = new Map<string, unknown>([[PK.profile, { ...save, quests: { day: '2026-10-05', items: [done('prompts'), done('turns'), done('tools')] }, sweepClaimed: '' }]])
  const m = heldModel(() => ({ isAnswered: true, text: GEN_REPLY, usage: USAGE }))
  const { clock } = await boot($, on, {}, m.model, { mem, files: { ...GEN_FILES } })
  const term = await $.ui.mount({ ...PANE, surface: 'terminal', props: at(60) })
  expect((await term.find({ text: 'Next: Viking Helmet at Lv 20' })) !== undefined).toBe(true)
  expect(await term.find({ text: /Cuckoo Clock/ })).toBe(undefined)
  expect((await term.find({ key: 'claim-sweep' }))?.props.label).toBe('Claim +15 xp (c)')
  expect((await term.find({ text: 'Daily Sweep' })) !== undefined).toBe(true) // says what the button claims
  expect((await term.find({ text: /ctrl\+x tab, then c to claim$/ })) !== undefined).toBe(true)
  expect(await reply($, '')).toMatch(/^Clawd is scouting/)
  await clock.settle()
  expect((await term.find({ text: 'Clawd is scouting demo-app for quests...' })) !== undefined).toBe(true)
  m.release()
  await flush(clock)
})

test('terminal at level 100 shows the xp in all instead of a Next line', WITH_PROBE, async ($, on) => {
  const mem = new Map<string, unknown>([[PK.profile, { ...quietSave(), xp: XP_AT[100]! + 1234 }]])
  await boot($, on, {}, undefined, { mem })
  const term = await $.ui.mount({ ...PANE, surface: 'terminal', props: at(60) })
  expect((await term.find({ text: /^[\d,]+ xp in all$/ })) !== undefined).toBe(true)
  expect(await term.find({ text: /^Next: / })).toBe(undefined)
})
