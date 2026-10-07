import type { SceneUsage, UsageLimit, UsageState, UsageWarned } from '../types'

// Usage meters: the engine's session.measure figures, reduced to what the room draws. Pure; Date only in resetLabel.
// Context, the 5-hour and the weekly limit are drawn in 5% steps, so the scene source (and its frame) only
// changes when a drawn step does. The limits are account wide and kept globally in $.store 'limits'.

type Limit = { kind: string; percentUsed: number; resetsAt?: string }
type Context = { percent?: number; tokens?: number; window: number }
export type Measure = { context: Context; rateLimits: readonly Limit[]; cost?: { usd: number }; changed: readonly string[] }
export type LiveUsage = { context?: Context; rateLimits?: readonly Limit[]; cost?: { usd: number } }
export type StoredLimits = { fiveHour: UsageLimit | null; sevenDay: UsageLimit | null; warned: { fiveHour?: string; sevenDay?: string } }
type Steps = { context: number; fiveHour: number; sevenDay: number }
type Kind = 'five_hour' | 'context' | 'seven_day'

export const USAGE_START: UsageState = { context: null, fiveHour: null, sevenDay: null, costUsd: null, compactions: 0, from: {}, at: 0, warned: {} }

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (p: number): number => Math.min(100, Math.max(0, p))

export function step5(p: number): number {
  return fin(p) ? Math.min(100, Math.max(0, Math.round(p / 5) * 5)) : 0
}

function limitOf(l: Limit | undefined): UsageLimit | null {
  if (!l || !fin(l.percentUsed)) return null
  return typeof l.resetsAt === 'string' ? { pct: clamp(l.percentUsed), resetsAt: l.resetsAt } : { pct: clamp(l.percentUsed) }
}

export function readLimits(list: readonly Limit[] | undefined): { fiveHour: UsageLimit | null; sevenDay: UsageLimit | null } {
  const all = Array.isArray(list) ? list : []
  return { fiveHour: limitOf(all.find(l => l?.kind === 'five_hour')), sevenDay: limitOf(all.find(l => l?.kind === 'seven_day')) }
}

export function stepsOf(u: Pick<UsageState, 'context' | 'fiveHour' | 'sevenDay'>): Steps {
  const pct = u.context?.pct
  return {
    context: pct == null ? -1 : step5(pct),
    fiveHour: u.fiveHour ? step5(u.fiveHour.pct) : -1,
    sevenDay: u.sevenDay ? step5(u.sevenDay.pct) : -1,
  }
}

// Moves the meter clock (at, from) only when a drawn step changes, so a redraw does not replay the change.
function stamp(prev: UsageState, next: UsageState, now: number): UsageState {
  const a = stepsOf(prev)
  const b = stepsOf(next)
  const keys = (['context', 'fiveHour', 'sevenDay'] as const).filter(k => a[k] !== b[k])
  if (keys.length === 0) return { ...next, from: prev.from, at: prev.at }
  const from: UsageState['from'] = {}
  for (const k of keys) from[k] = a[k]
  return { ...next, from, at: now }
}

// The usable part of the context window: the window /context measures against minus the auto-compact buffer,
// from a `$.session.usage({ breakdown: 'summary' })` result (or its breakdown). Undefined when there is no
// buffer (auto-compact off) or the figures are missing, so the meter keeps the engine's own percentage.
export function compactLimit(summary: unknown): number | undefined {
  const obj = (v: unknown): Record<string, unknown> | undefined => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined)
  const s = obj(summary)
  if (!s) return undefined
  const ctx = obj(s.context)
  const b = obj(ctx?.breakdown) ?? obj(s.breakdown) ?? (Array.isArray(s.categories) ? s : undefined)
  if (!b || !Array.isArray(b.categories) || b.isAutoCompactEnabled === false) return undefined
  let buffer = 0
  for (const c of b.categories as unknown[]) {
    const row = obj(c)
    if (row?.kind === 'buffer' && fin(row.tokens) && row.tokens > 0) buffer += row.tokens
  }
  const window = [b.rawMaxTokens, b.maxTokens, ctx?.window].find(v => fin(v) && v > 0) as number | undefined
  if (buffer <= 0 || window === undefined || window - buffer <= 0) return undefined
  return window - buffer
}

// Context fill in percent: of `limit` (the usable window, see compactLimit) when given, else the engine's own.
function contextPct(ctx: Context, limit: number | undefined): number | null {
  if (fin(limit) && limit > 0) {
    const tokens = fin(ctx.tokens) ? ctx.tokens : fin(ctx.percent) ? (ctx.percent / 100) * ctx.window : null
    return tokens === null ? null : clamp((tokens / limit) * 100)
  }
  return fin(ctx.percent) ? clamp(ctx.percent) : null
}

export function measureUsage(prev: UsageState, e: Measure, now: number, limit?: number): UsageState {
  const ctx = e.context
  const context = ctx && fin(ctx.window) ? { pct: contextPct(ctx, limit), window: ctx.window } : prev.context
  const limits = e.changed.includes('rateLimits') ? readLimits(e.rateLimits) : { fiveHour: prev.fiveHour, sevenDay: prev.sevenDay }
  const costUsd = fin(e.cost?.usd) ? e.cost.usd : prev.costUsd
  return stamp(prev, { ...prev, context, ...limits, costUsd }, now)
}

export function compactUsage(u: UsageState, now: number): UsageState {
  return {
    ...u,
    compactions: u.compactions + 1,
    context: u.context ? { ...u.context, pct: null } : null,
    from: { context: stepsOf(u).context },
    at: now,
    warned: { ...u.warned, context: false },
  }
}

// One quip per threshold crossing: 5-hour >= 80% and weekly >= 80% once per window (resetsAt; a window without
// one re-arms once it drops below 50%), context >= 85% once per fill (re-armed below 60% or by a compaction).
// When several cross at once only the most important speaks (weekly, then 5-hour, then context) and only it is
// marked; the others stay due and speak at the next chance.
export function usageNote(u: UsageState): { kind?: Kind; warned: UsageWarned } {
  const warned: UsageWarned = { ...u.warned }
  const pct = u.context?.pct
  if (pct != null && pct < 60) warned.context = false
  for (const k of ['fiveHour', 'sevenDay'] as const) {
    const l = u[k]
    if (l && l.resetsAt === undefined && l.pct < 50 && warned[k] === 'none') delete warned[k]
  }
  const due = (l: UsageLimit | null, k: 'fiveHour' | 'sevenDay'): boolean => !!l && l.pct >= 80 && warned[k] !== (l.resetsAt ?? 'none')
  if (due(u.sevenDay, 'sevenDay')) {
    warned.sevenDay = u.sevenDay!.resetsAt ?? 'none'
    return { kind: 'seven_day', warned }
  }
  if (due(u.fiveHour, 'fiveHour')) {
    warned.fiveHour = u.fiveHour!.resetsAt ?? 'none'
    return { kind: 'five_hour', warned }
  }
  if (pct != null && pct >= 85 && !warned.context) {
    warned.context = true
    return { kind: 'context', warned }
  }
  return { warned }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000
const pad = (v: number): string => String(v).padStart(2, '0')

// An absolute local label, so the source does not tick: 'at 15:40' today, 'Fri 09:00' on another day this week,
// and 'Mon 13 Oct 09:00' when the reset is 6 or more days away or falls on today's weekday (a weekday alone
// would be ambiguous then).
export function resetLabel(iso: string | undefined, now: number): string | undefined {
  if (typeof iso !== 'string') return undefined
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return undefined
  const d = new Date(t)
  const n = new Date(now)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  if (same) return `at ${hm}`
  const far = t - now >= 6 * DAY_MS || d.getDay() === n.getDay()
  return far ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}` : `${DAYS[d.getDay()]} ${hm}`
}

const isLive = (l: UsageLimit | null, now: number): l is UsageLimit => {
  if (!l) return false
  const t = l.resetsAt === undefined ? Number.NaN : Date.parse(l.resetsAt)
  return !(Number.isFinite(t) && t <= now) // a window past its reset no longer holds
}

export function sceneUsage(u: UsageState, now: number): SceneUsage {
  const out: SceneUsage = {}
  if (u.context) out.context = u.context.pct == null ? { window: u.context.window } : { pct: Math.round(u.context.pct), window: u.context.window }
  for (const k of ['fiveHour', 'sevenDay'] as const) {
    const l = u[k]
    if (!isLive(l, now)) continue
    const resets = resetLabel(l.resetsAt, now)
    out[k] = resets ? { pct: Math.round(l.pct), resets } : { pct: Math.round(l.pct) }
  }
  if (u.compactions > 0) out.compactions = u.compactions
  if (Object.keys(u.from).length > 0) out.from = { ...u.from }
  return out
}

// A stored limit only counts while its window is known to be open: one without a reset time never expires.
const isOpen = (l: UsageLimit | null, now: number): l is UsageLimit => !!l && l.resetsAt !== undefined && Date.parse(l.resetsAt) > now

// Session setup: values already in the atom win (a hot reload), then the live figures, then stored limits.
export function seedUsage(u: UsageState, stored: StoredLimits, live: LiveUsage | undefined, now: number): UsageState {
  const ctx = live?.context
  const context = u.context ?? (ctx && fin(ctx.window) ? { pct: fin(ctx.percent) ? clamp(ctx.percent) : null, window: ctx.window } : null)
  const fromLive = live?.rateLimits && live.rateLimits.length > 0 ? readLimits(live.rateLimits) : undefined
  const pickLimit = (k: 'fiveHour' | 'sevenDay'): UsageLimit | null =>
    u[k] ?? (fromLive ? fromLive[k] : isOpen(stored[k], now) ? stored[k] : null)
  return {
    ...u,
    context,
    fiveHour: pickLimit('fiveHour'),
    sevenDay: pickLimit('sevenDay'),
    costUsd: u.costUsd ?? (fin(live?.cost?.usd) ? live.cost.usd : null),
    warned: { ...stored.warned, ...u.warned },
  }
}

export function migrateLimits(raw: unknown): StoredLimits {
  const r = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const lim = (v: unknown): UsageLimit | null => {
    const o = (v !== null && typeof v === 'object' ? v : {}) as Record<string, unknown>
    if (!fin(o.pct)) return null
    return typeof o.resetsAt === 'string' ? { pct: clamp(o.pct), resetsAt: o.resetsAt } : { pct: clamp(o.pct) }
  }
  const w = (r.warned !== null && typeof r.warned === 'object' ? r.warned : {}) as Record<string, unknown>
  const warned: StoredLimits['warned'] = {}
  if (typeof w.fiveHour === 'string') warned.fiveHour = w.fiveHour
  if (typeof w.sevenDay === 'string') warned.sevenDay = w.sevenDay
  return { fiveHour: lim(r.fiveHour), sevenDay: lim(r.sevenDay), warned }
}

// The numbers again, for the Svg alt (screen readers and touch surfaces have no hover).
export function usageAlt(u: UsageState, now: number): string {
  const s = stepsOf(u)
  let out = ''
  if (s.context >= 0) out += ` Context ${s.context}% full.`
  if (s.fiveHour >= 0 && isLive(u.fiveHour, now)) out += ` 5-hour limit ${s.fiveHour}% used.`
  if (s.sevenDay >= 0 && isLive(u.sevenDay, now)) out += ` Weekly limit ${s.sevenDay}% used.`
  if (u.costUsd != null) out += ` Session cost $${u.costUsd.toFixed(2)}.`
  return out
}
