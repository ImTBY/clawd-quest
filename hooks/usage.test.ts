import { expect, test } from 'claude-code/testing'

import type { UsageState } from '../types'
import {
  compactLimit, compactUsage, measureUsage, migrateLimits, readLimits, resetLabel, sceneUsage, seedUsage, step5, stepsOf, USAGE_START, usageAlt, usageNote,
} from './usage'
import type { Measure } from './usage'

const NOW = new Date(2026, 9, 5, 10, 0).getTime() // a Monday
const iso = (ms: number): string => new Date(ms).toISOString()
const HOUR = 3_600_000

function measure(over: Partial<Measure> = {}): Measure {
  return {
    context: { window: 200000, percent: 40 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 30, resetsAt: iso(NOW + 2 * HOUR) }, { kind: 'seven_day', percentUsed: 10, resetsAt: iso(NOW + 72 * HOUR) }],
    changed: ['context', 'rateLimits'],
    ...over,
  }
}

const withPct = (u: UsageState, ctx: number | null, five?: number, resetsAt = 'r1'): UsageState => ({
  ...u, context: { pct: ctx, window: 200000 }, fiveHour: five === undefined ? null : { pct: five, resetsAt },
})

test('step5 buckets', async () => {
  expect(step5(2)).toBe(0)
  expect(step5(2.5)).toBe(5)
  expect(step5(97.6)).toBe(100)
  expect(step5(-4)).toBe(0)
  expect(step5(250)).toBe(100)
})

test('readLimits picks the two windows and ignores spend limits', async () => {
  const got = readLimits([{ kind: 'spend_limit', percentUsed: 120 }, { kind: 'seven_day', percentUsed: 12.5, resetsAt: 'x' }])
  expect(got.fiveHour).toBe(null)
  expect(got.sevenDay).toEqual({ pct: 12.5, resetsAt: 'x' })
  expect(readLimits([{ kind: 'five_hour', percentUsed: 140 }]).fiveHour?.pct).toBe(100)
})

test('resetLabel is absolute local time', async () => {
  const now = new Date(2026, 9, 5, 10, 0).getTime()
  expect(resetLabel(new Date(2026, 9, 5, 15, 40).toISOString(), now)).toBe('at 15:40')
  expect(resetLabel(new Date(2026, 9, 9, 9, 0).toISOString(), now)).toBe('Fri 09:00')
  // 6 or more days away, or on today's weekday: the date makes it unambiguous
  expect(resetLabel(new Date(2026, 9, 11, 9, 0).toISOString(), now)).toBe('Sun 09:00')
  expect(resetLabel(new Date(2026, 9, 11, 10, 0).toISOString(), now)).toBe('Sun 11 Oct 10:00')
  expect(resetLabel(new Date(2026, 9, 12, 9, 0).toISOString(), now)).toBe('Mon 12 Oct 09:00')
  expect(resetLabel(new Date(2026, 9, 13, 9, 0).toISOString(), now)).toBe('Tue 13 Oct 09:00')
  expect(resetLabel(new Date(2026, 10, 2, 8, 5).toISOString(), now)).toBe('Mon 2 Nov 08:05')
  expect(resetLabel('garbage', now)).toBe(undefined)
  expect(resetLabel(undefined, now)).toBe(undefined)
})

// The days of 2026 on which the test machine's zone changes its UTC offset, as [month, day]: none on a UTC machine.
function localSwitches(): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const d = new Date(2026, 0, 1, 12); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
    const next = new Date(2026, d.getMonth(), d.getDate() + 1, 12)
    if (next.getTimezoneOffset() !== d.getTimezoneOffset()) out.push([next.getMonth() + 1, next.getDate()])
  }
  return out
}

test('resetLabel across a DST switch: the US and EU days, and the real ones of the zone running the tests', async () => {
  // 'Mon 2 Nov 08:05' above crosses the EU switch only on an EU machine; these cross every switch day in local time
  for (const [m, d] of [[3, 8], [3, 29], [10, 25], [11, 1], ...localSwitches()] as Array<[number, number]>) {
    const now = new Date(2026, m - 1, d - 2, 10, 0).getTime()
    const week = new Date(2026, m - 1, d + 5, 10, 0)
    expect(resetLabel(week.toISOString(), now)).toBe(`${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][week.getDay()]} ${week.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][week.getMonth()]} 10:00`)
    expect(resetLabel(new Date(2026, m - 1, d + 1, 9, 30).toISOString(), now)).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) 09:30$/)
    expect(resetLabel(new Date(2026, m - 1, d, 23, 30).toISOString(), new Date(2026, m - 1, d, 0, 30).getTime())).toBe('at 23:30')
  }
})

test('measureUsage moves the meter clock only when a drawn step changes', async () => {
  const a = measureUsage(USAGE_START, measure(), NOW)
  expect(a.context).toEqual({ pct: 40, window: 200000 })
  expect(a.fiveHour?.pct).toBe(30)
  expect(a.at).toBe(NOW)
  expect(a.from).toEqual({ context: -1, fiveHour: -1, sevenDay: -1 })
  const b = measureUsage(a, measure({ context: { window: 200000, percent: 41 }, changed: ['context'] }), NOW + 1000)
  expect(b.at).toBe(NOW)
  expect(b.from).toEqual(a.from)
  const c = measureUsage(b, measure({ context: { window: 200000, percent: 48 }, changed: ['context'] }), NOW + 2000)
  expect(c.at).toBe(NOW + 2000)
  expect(c.from).toEqual({ context: 40 })
  // limits stay when the measure does not name them
  const d = measureUsage(c, measure({ context: { window: 200000, percent: 48 }, rateLimits: [], changed: ['context', 'cost'], cost: { usd: 1.5 } }), NOW + 3000)
  expect(d.fiveHour?.pct).toBe(30)
  expect(d.costUsd).toBe(1.5)
  // a window that left the list is gone
  const e = measureUsage(d, measure({ context: { window: 200000, percent: 48 }, rateLimits: [{ kind: 'seven_day', percentUsed: 10 }], changed: ['rateLimits'] }), NOW + 4000)
  expect(e.fiveHour).toBe(null)
  expect(e.from).toEqual({ fiveHour: 30 })
  expect(stepsOf(e)).toEqual({ context: 50, fiveHour: -1, sevenDay: 10 })
})

test('compactUsage files the context away', async () => {
  const u = { ...withPct(USAGE_START, 90), warned: { context: true } }
  const c = compactUsage(u, NOW)
  expect(c.context?.pct).toBe(null)
  expect(c.compactions).toBe(1)
  expect(c.from).toEqual({ context: 90 })
  expect(c.at).toBe(NOW)
  expect(c.warned.context).toBe(false)
})

test('usageNote warns once per crossing', async () => {
  expect(usageNote(withPct(USAGE_START, 10, 79)).kind).toBe(undefined)
  const first = usageNote(withPct(USAGE_START, 10, 80))
  expect(first.kind).toBe('five_hour')
  expect(first.warned.fiveHour).toBe('r1')
  const again = usageNote({ ...withPct(USAGE_START, 10, 85), warned: first.warned })
  expect(again.kind).toBe(undefined)
  expect(usageNote({ ...withPct(USAGE_START, 10, 85, 'r2'), warned: first.warned }).kind).toBe('five_hour')
  // context fires once, re-arms below 60 or after a compaction
  const ctx = usageNote(withPct(USAGE_START, 85))
  expect(ctx.kind).toBe('context')
  expect(usageNote({ ...withPct(USAGE_START, 95), warned: ctx.warned }).kind).toBe(undefined)
  const low = usageNote({ ...withPct(USAGE_START, 50), warned: ctx.warned })
  expect(low.warned.context).toBe(false)
  expect(usageNote({ ...withPct(USAGE_START, 86), warned: low.warned }).kind).toBe('context')
  const compacted = compactUsage({ ...withPct(USAGE_START, 90), warned: ctx.warned }, NOW)
  expect(usageNote({ ...compacted, context: { pct: 88, window: 200000 } }).kind).toBe('context')
  // both at once: the 5-hour line speaks and only it is marked; the context line follows at the next chance
  const both = usageNote(withPct(USAGE_START, 90, 90))
  expect(both.kind).toBe('five_hour')
  expect(both.warned.context).toBe(undefined)
  expect(both.warned.fiveHour).toBe('r1')
  const next = usageNote({ ...withPct(USAGE_START, 90, 90), warned: both.warned })
  expect(next.kind).toBe('context')
  expect(usageNote({ ...withPct(USAGE_START, 90, 90), warned: next.warned }).kind).toBe(undefined)
  // the weekly limit
  const week = usageNote({ ...USAGE_START, sevenDay: { pct: 80, resetsAt: 'w1' } })
  expect(week.kind).toBe('seven_day')
  expect(usageNote({ ...USAGE_START, sevenDay: { pct: 90, resetsAt: 'w1' }, warned: week.warned }).kind).toBe(undefined)
})

test('sceneUsage drops expired windows and labels resets', async () => {
  const u: UsageState = {
    ...USAGE_START, context: { pct: 61.6, window: 200000 }, compactions: 2, from: { context: 50 },
    fiveHour: { pct: 40, resetsAt: new Date(2026, 9, 5, 15, 40).toISOString() },
    sevenDay: { pct: 20, resetsAt: iso(NOW) },
  }
  const s = sceneUsage(u, NOW)
  expect(s.context).toEqual({ pct: 62, window: 200000 })
  expect(s.fiveHour).toEqual({ pct: 40, resets: 'at 15:40' })
  expect(s.sevenDay).toBe(undefined)
  expect(s.compactions).toBe(2)
  expect(s.from).toEqual({ context: 50 })
  expect(sceneUsage(USAGE_START, NOW)).toEqual({})
  expect(usageAlt({ ...u, costUsd: 1.2 }, NOW)).toBe(' Context 60% full. 5-hour limit 40% used. Session cost $1.20.')
})

test('migrateLimits and seedUsage', async () => {
  for (const junk of [null, undefined, 42, 'x', [], { fiveHour: 'x', sevenDay: { pct: 'y' }, warned: 5 }]) {
    expect(migrateLimits(junk)).toEqual({ fiveHour: null, sevenDay: null, warned: {} })
  }
  const stored = migrateLimits({ v: 1, fiveHour: { pct: 50, resetsAt: iso(NOW + HOUR) }, sevenDay: { pct: 20, resetsAt: iso(NOW - HOUR) }, warned: { fiveHour: 'a' } })
  const seeded = seedUsage(USAGE_START, stored, { context: { window: 200000 }, rateLimits: [] }, NOW)
  expect(seeded.fiveHour?.pct).toBe(50)
  expect(seeded.sevenDay).toBe(null)
  expect(seeded.context).toEqual({ pct: null, window: 200000 })
  expect(seeded.warned).toEqual({ fiveHour: 'a' })
  // live limits win over stored ones; values already in the atom win over both
  const live = seedUsage(USAGE_START, stored, { context: { window: 200000, percent: 30 }, rateLimits: [{ kind: 'five_hour', percentUsed: 12 }], cost: { usd: 2 } }, NOW)
  expect(live.fiveHour).toEqual({ pct: 12 })
  expect(live.costUsd).toBe(2)
  // a stored limit without a reset time never expires, so it is not seeded
  expect(seedUsage(USAGE_START, migrateLimits({ fiveHour: { pct: 50 } }), undefined, NOW).fiveHour).toBe(null)
  const kept = seedUsage({ ...USAGE_START, fiveHour: { pct: 70 } }, stored, undefined, NOW)
  expect(kept.fiveHour).toEqual({ pct: 70 })
  expect(kept.context).toBe(null)
})

test('usageNote ranks weekly over 5-hour over context and marks only the speaker', async () => {
  const all: UsageState = { ...withPct(USAGE_START, 90, 90), sevenDay: { pct: 85, resetsAt: 'w1' } }
  const a = usageNote(all)
  expect(a.kind).toBe('seven_day')
  expect(a.warned).toEqual({ sevenDay: 'w1' })
  const b = usageNote({ ...all, warned: a.warned })
  expect(b.kind).toBe('five_hour')
  expect(b.warned).toEqual({ sevenDay: 'w1', fiveHour: 'r1' })
  const c = usageNote({ ...all, warned: b.warned })
  expect(c.kind).toBe('context')
  expect(c.warned).toEqual({ sevenDay: 'w1', fiveHour: 'r1', context: true })
  expect(usageNote({ ...all, warned: c.warned }).kind).toBe(undefined)
  // weekly and context together: the weekly line speaks first
  expect(usageNote({ ...withPct(USAGE_START, 95), sevenDay: { pct: 90, resetsAt: 'w2' } }).kind).toBe('seven_day')
})

test('a limit without a reset time re-arms once it drops below 50%', async () => {
  const at = (pct: number, warned = {}): UsageState => ({ ...USAGE_START, fiveHour: { pct }, warned })
  const first = usageNote(at(85))
  expect(first.kind).toBe('five_hour')
  expect(first.warned.fiveHour).toBe('none')
  // still high, or dipped only a little: no repeat
  expect(usageNote(at(95, first.warned)).kind).toBe(undefined)
  const dip = usageNote(at(60, first.warned))
  expect(dip.kind).toBe(undefined)
  expect(dip.warned.fiveHour).toBe('none')
  // below 50: re-armed, so the next crossing warns again
  const low = usageNote(at(40, first.warned))
  expect(low.kind).toBe(undefined)
  expect(low.warned.fiveHour).toBe(undefined)
  expect(usageNote(at(82, low.warned)).kind).toBe('five_hour')
  // a window with a reset time is not re-armed by a dip (its reset does that)
  const timed = usageNote({ ...USAGE_START, sevenDay: { pct: 80, resetsAt: 'w1' } })
  const timedLow = usageNote({ ...USAGE_START, sevenDay: { pct: 10, resetsAt: 'w1' }, warned: timed.warned })
  expect(timedLow.warned.sevenDay).toBe('w1')
  expect(usageNote({ ...USAGE_START, sevenDay: { pct: 81, resetsAt: 'w1' }, warned: timedLow.warned }).kind).toBe(undefined)
})

test('compactLimit is the window minus the auto-compact buffer', async () => {
  const breakdown = {
    categories: [
      { name: 'System prompt', tokens: 12000, kind: 'used' },
      { name: 'Messages', tokens: 50000, kind: 'used' },
      { name: 'Free space', tokens: 105000, kind: 'free' },
      { name: 'Autocompact buffer', tokens: 33000, kind: 'buffer' },
      { name: 'MCP tools', tokens: 9000, kind: 'deferred' },
    ],
    totalTokens: 62000, maxTokens: 200000, rawMaxTokens: 200000, isAutoCompactEnabled: true,
  }
  const usage = { startedAt: 0, context: { window: 200000, tokens: 62000, percent: 31, breakdown }, rateLimits: [] }
  expect(compactLimit(usage)).toBe(167000)
  expect(compactLimit(breakdown)).toBe(167000)
  expect(compactLimit({ breakdown })).toBe(167000)
  // a compaction window smaller than the model's: measured against rawMaxTokens
  expect(compactLimit({ context: { window: 1000000, breakdown: { ...breakdown, rawMaxTokens: 400000, maxTokens: 400000 } } })).toBe(367000)
  // no buffer (auto-compact off), no breakdown, junk
  expect(compactLimit({ context: { window: 200000, breakdown: { ...breakdown, categories: breakdown.categories.filter(c => c.kind !== 'buffer') } } })).toBe(undefined)
  expect(compactLimit({ context: { window: 200000, breakdown: { ...breakdown, isAutoCompactEnabled: false } } })).toBe(undefined)
  expect(compactLimit({ context: { window: 200000, percent: 10 } })).toBe(undefined)
  for (const junk of [null, undefined, 42, 'x', [], {}, { context: null }, { categories: 'x' }, { categories: [{ kind: 'buffer', tokens: 'lots' }], rawMaxTokens: 1000 }]) {
    expect(compactLimit(junk)).toBe(undefined)
  }
  expect(compactLimit({ categories: [{ kind: 'buffer', tokens: 5000 }], rawMaxTokens: 4000 })).toBe(undefined)
})

test('measureUsage measures the context against the usable window when a limit is given', async () => {
  // 62,000 of 200,000 tokens: 31% of the window, but 37% of the 167,000 before auto-compact
  const m = measure({ context: { window: 200000, tokens: 62000, percent: 31 } })
  expect(measureUsage(USAGE_START, m, NOW).context).toEqual({ pct: 31, window: 200000 })
  const limited = measureUsage(USAGE_START, m, NOW, 167000)
  expect(Math.round(limited.context!.pct!)).toBe(37)
  expect(limited.context!.window).toBe(200000)
  // without a token count the percentage is converted
  const noTokens = measureUsage(USAGE_START, measure({ context: { window: 200000, percent: 50 } }), NOW, 160000)
  expect(noTokens.context!.pct).toBe(62.5)
  // past the limit it reads full; no reading stays no reading; a bad limit is ignored
  expect(measureUsage(USAGE_START, measure({ context: { window: 200000, tokens: 190000, percent: 95 } }), NOW, 167000).context!.pct).toBe(100)
  expect(measureUsage(USAGE_START, measure({ context: { window: 200000 } }), NOW, 167000).context!.pct).toBe(null)
  expect(measureUsage(USAGE_START, m, NOW, 0).context!.pct).toBe(31)
  expect(measureUsage(USAGE_START, m, NOW, Number.NaN).context!.pct).toBe(31)
  // so the 85% warning fires before auto-compact would run
  const near = measureUsage(USAGE_START, measure({ context: { window: 200000, tokens: 145000, percent: 72.5 } }), NOW, 167000)
  expect(usageNote(near).kind).toBe('context')
})
