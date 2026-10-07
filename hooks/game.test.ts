import { expect, test } from 'claude-code/testing'

import type { Activity, GameEvent, HatId, Profile, Quest } from '../types'
import {
  ACHIEVEMENTS, HATS, MAX_LEVEL, MILESTONE_LEVELS, PROFILE_VERSION, RECENT_SIZE, STAR_XP, XP, XP_AT,
  achievementProgress, achievementXp, addFresh, applyEvent, availableHats, continues, dailyQuests, dayOf, effectiveStreak, equipHat, isNewerProfile,
  isOpen, levelOf, markSeen, migrateProfile, newProfile, questsForDay, requirementText, streakLabel,
  sweepClaimable, sweepsOf, sweptToday, titleOf, unlockedCount,
} from './game'

const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const NOW = at(2026, 3, 10) // a Tuesday in March, 10:00: no seasonal hats, no time-of-day trophies
const tool = (activity: Activity, opts: { isError?: boolean; ext?: string | null; combo?: number; now?: number } = {}): GameEvent =>
  ({ type: 'tool', tool: 'X', activity, isError: opts.isError ?? false, ext: opts.ext ?? null, combo: opts.combo ?? 1, now: opts.now ?? NOW })

// a profile that already had today's first activity, so the daily bonus does not blur xp checks
function start(now = NOW): Profile {
  return applyEvent(newProfile(), { type: 'session', project: 'demo', now }).profile
}
// ... plus one edit (First Steps / Hello World done) and no quests left today, so xp checks are exact
function warm(now = NOW): Profile {
  const p = applyEvent(start(now), tool('edit', { ext: 'ts', now })).profile
  return { ...p, quests: { day: p.quests.day, items: [] } }
}
function run(p: Profile, events: GameEvent[]): Profile {
  for (const e of events) p = applyEvent(p, e).profile
  return p
}

test('newProfile and migrateProfile give a valid profile from anything', async () => {
  const fresh = newProfile()
  expect(fresh.xp).toBe(0)
  expect(fresh.totals.tools).toBe(0)
  for (const junk of [undefined, null, 42, 'garbage{', [], { xp: 'lots', totals: 7, achievements: 'x', hat: 'fez', streak: null }]) {
    const p = migrateProfile(junk)
    expect(p.version).toBe(2)
    expect(p.xp).toBe(0)
    expect(p.totals.turns).toBe(0)
    expect(p.hat).toBe(null)
    expect(p.fileTypes).toEqual([])
    expect(p.quests.items).toEqual([])
  }
  const old = migrateProfile({ xp: 250, totals: { tools: 12 }, achievements: ['first-steps'], hat: 'party', fileTypes: ['TS', 'ts', 3] })
  expect(old.xp).toBe(250)
  expect(old.totals.tools).toBe(12)
  expect(old.totals.edits).toBe(0)
  expect(old.achievements['first-steps']).toBe(0)
  expect(old.hat).toBe('party')
  expect(old.fileTypes).toEqual(['ts'])
  const roundTrip = migrateProfile(JSON.stringify(run(warm(), [tool('edit', { ext: 'tf' })])))
  expect(roundTrip.totals.tfEdits).toBe(1)
})

test('levelOf follows the 1.0 table', async () => {
  expect(levelOf(0)).toEqual({ level: 1, from: 0, to: 40, stars: 0, isMax: false })
  expect(levelOf(39).level).toBe(1)
  expect(levelOf(40)).toEqual({ level: 2, from: 40, to: 121, stars: 0, isMax: false })
  expect(levelOf(1345).level).toBe(10)
})

test('xp for tool success, light tools, errors and turns', async () => {
  const p = warm()
  expect(applyEvent(p, tool('edit', { ext: 'ts' })).xpGained).toBe(XP.craft)
  expect(applyEvent(p, tool('agent')).xpGained).toBe(XP.agent)
  // light tools pay every second call overall
  const a = applyEvent(p, tool('read'))
  const b = applyEvent(a.profile, tool('read', { combo: 2 }))
  expect(a.xpGained + b.xpGained).toBe(XP.light)
  // the first error teaches you something, the next two do not
  const e1 = applyEvent(p, tool('shell', { isError: true, combo: 0 }))
  const e2 = applyEvent(e1.profile, tool('shell', { isError: true, combo: 0 }))
  expect(e1.xpGained).toBe(XP.error)
  expect(e2.xpGained).toBe(0)
  expect(e2.profile.totals.errors).toBe(2)
  expect(e2.profile.totals.runs).toBe(0)
  expect(applyEvent(p, { type: 'turn', durationMs: 60_000, toolCount: 2, errorCount: 0, now: NOW }).xpGained).toBe(XP.turn + XP.cleanTurn)
})

test('combo bonus every 10th call, capped', async () => {
  const w = warm()
  const p = { ...w, achievements: { ...w.achievements, 'combo-10': 1, 'combo-25': 1, 'combo-50': 1 } }
  const plain = applyEvent(p, tool('edit', { combo: 9 })).xpGained
  expect(applyEvent(p, tool('edit', { combo: 10 })).xpGained).toBe(plain + 1)
  expect(applyEvent(p, tool('edit', { combo: 30 })).xpGained).toBe(plain + 3)
  expect(applyEvent(p, tool('edit', { combo: 90 })).xpGained).toBe(plain + XP.comboMaxBonus)
  expect(applyEvent(p, tool('edit', { combo: 90 })).profile.bestCombo).toBe(90)
})

test('achievements unlock exactly once', async () => {
  const first = applyEvent(start(), tool('read'))
  expect(first.unlocked.map(a => a.id)).toContain('first-steps')
  expect(first.profile.achievements['first-steps']).toBe(NOW)
  const second = applyEvent(first.profile, tool('read', { now: NOW + 1000 }))
  expect(second.unlocked.map(a => a.id).includes('first-steps')).toBe(false)
  expect(second.profile.achievements['first-steps']).toBe(NOW)
  expect(ACHIEVEMENTS.length).toBeGreaterThan(29)
  expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length)
})

test('hidden prompt achievements and the trophy list', async () => {
  const p = warm()
  const said = (text: string) => applyEvent(p, { type: 'prompt', text, now: NOW }).unlocked.map(a => a.id)
  expect(said('works on my machine though')).toContain('my-machine')
  expect(said('LGTM')).toContain('ship-it')
  expect(said('why is this broken!!!')).toContain('rage-quit')
  expect(said('WHY DOES THIS NOT WORK')).toContain('rage-quit')
  expect(said('make me a teapot')).toContain('teapot')
  expect(said('please fix it')).toContain('polite')
  expect(said('why does the plan fail?')).toContain('rubber-duck')
  expect(said('fix the build')).toEqual([])
  const list = achievementProgress(p)
  expect(list.some(a => a.def.id === 'teapot')).toBe(false)
  const unlockedTeapot = applyEvent(p, { type: 'prompt', text: 'teapot', now: NOW }).profile
  expect(achievementProgress(unlockedTeapot).some(a => a.def.id === 'teapot' && a.unlocked)).toBe(true)
  expect(list.find(a => a.def.id === 'hundred-club')?.progress).toEqual({ value: 1, goal: 100 })
})

test('streak across consecutive days and after a gap', async () => {
  let p = newProfile()
  const day1 = applyEvent(p, { type: 'prompt', text: 'hello', now: at(2026, 3, 9) })
  expect(day1.profile.streak).toEqual({ count: 1, lastDay: '2026-03-09' })
  expect(day1.xpGained).toBe(XP.dailyBase)
  p = run(day1.profile, [
    { type: 'prompt', text: 'hi', now: at(2026, 3, 9, 15) },
    { type: 'prompt', text: 'hi', now: at(2026, 3, 10) },
    { type: 'prompt', text: 'hi', now: at(2026, 3, 11) },
  ])
  expect(p.streak).toEqual({ count: 3, lastDay: '2026-03-11' })
  expect(p.achievements['streak-3']).toBeDefined()
  expect(streakLabel(p, at(2026, 3, 11, 20))).toBe('3-day streak')
  expect(streakLabel(p, at(2026, 3, 12))).toContain('keep it alive')
  // just opening a session does not count as a working day
  expect(applyEvent(p, { type: 'session', project: 'x', now: at(2026, 3, 12) }).profile.streak.count).toBe(3)
  p = applyEvent(p, { type: 'prompt', text: 'back', now: at(2026, 3, 14) }).profile
  expect(p.streak).toEqual({ count: 1, lastDay: '2026-03-14' })
})

test('day rollover replaces quests; quests are deterministic', async () => {
  expect(questsForDay('2026-03-10')).toEqual(questsForDay('2026-03-10'))
  expect(questsForDay('2026-03-10')).toHaveLength(3)
  const p = start(at(2026, 3, 10))
  expect(p.quests.day).toBe('2026-03-10')
  expect(p.quests.items).toEqual(questsForDay('2026-03-10'))
  const next = applyEvent(p, { type: 'session', project: 'x', now: at(2026, 3, 11) }).profile
  expect(next.quests.day).toBe('2026-03-11')
  expect(next.quests.items.map(q => q.id)).toEqual(questsForDay('2026-03-11').map(q => q.id))
  // a month of days always gives three distinct quests
  for (let d = 1; d <= 30; d++) {
    const items = questsForDay(`2026-04-${String(d).padStart(2, '0')}`)
    expect(new Set(items.map(q => q.id.split(':')[0])).size).toBe(3)
  }
})

test('quest completion pays once', async () => {
  const p = warm()
  const base = { ...p, quests: { day: p.quests.day, items: [{ id: 'turns', title: 'Finish a turn', goal: 1, progress: 0, xp: 12, done: false }] } }
  const turn = (now: number): GameEvent => ({ type: 'turn', durationMs: 60_000, toolCount: 0, errorCount: 0, now })
  const r1 = applyEvent(base, turn(NOW))
  expect(r1.completedQuests).toHaveLength(1)
  expect(r1.xpGained >= XP.turn + 12).toBe(true)
  const r2 = applyEvent(r1.profile, turn(NOW + 1))
  expect(r2.completedQuests).toHaveLength(0)
  expect(r2.xpGained).toBe(XP.turn)
  expect(r2.profile.quests.items[0]?.progress).toBe(1)
})

test('seasonal hats by month and permanent unlocks', async () => {
  const p = newProfile()
  expect(availableHats(p, at(2026, 10, 15))).toEqual(['pumpkin'])
  expect(availableHats(p, at(2026, 12, 2))).toEqual(['santa'])
  expect(availableHats(p, at(2026, 3, 2))).toEqual([])
  const halloween = applyEvent(p, { type: 'prompt', text: 'boo', now: at(2026, 10, 31, 20) }).profile
  expect(availableHats(halloween, at(2027, 3, 2))).toContain('pumpkin')
  expect(HATS).toHaveLength(44)
  // level 2 unlocks the party hat and reports it
  const r = applyEvent({ ...warm(), xp: 39 }, tool('edit', { ext: 'ts' }))
  expect(r.levelUp).toBe(2)
  expect(r.unlockedHats).toContain('party')
  // an out-of-season hat falls off
  const santa = { ...warm(at(2026, 12, 30)), hat: 'santa' as const }
  expect(applyEvent(santa, { type: 'prompt', text: 'hi', now: at(2027, 1, 2) }).profile.hat).toBe(null)
})

test('applyEvent does not mutate its input', async () => {
  const p = run(warm(), [tool('edit', { ext: 'ts' }), { type: 'prompt', text: 'hi', now: NOW }])
  const snapshot = JSON.stringify(p)
  const events: GameEvent[] = [
    tool('edit', { ext: 'py', combo: 10 }), tool('git'), tool('read', { isError: true, combo: 0 }),
    { type: 'turn', durationMs: 5000, toolCount: 4, errorCount: 0, now: NOW },
    { type: 'session', project: 'other', now: NOW }, { type: 'prompt', text: 'later', now: at(2026, 3, 11) },
    { type: 'prompt', text: 'teapot please', now: at(2026, 3, 12) },
  ]
  for (const e of events) applyEvent(p, e)
  expect(JSON.stringify(p)).toBe(snapshot)
})

test('totals map activities', async () => {
  const p = run(start(), [
    tool('edit', { ext: 'tf' }), tool('write', { ext: '.TS' }), tool('terraform'), tool('git'), tool('test'),
    tool('search'), tool('web'), tool('agent'), tool('read'), tool('shell'),
  ])
  const t = p.totals
  expect([t.tools, t.edits, t.tfEdits, t.runs, t.gitCommands, t.tests, t.searches, t.web, t.agents, t.reads]).toEqual([10, 2, 2, 4, 1, 1, 1, 1, 1, 1])
  expect(p.fileTypes).toEqual(['tf', 'ts'])
})

const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('weekends do not break a streak', async () => {
  // 2026-03-13 is a Friday
  expect(continues('2026-03-13', '2026-03-16')).toBe(true)  // Fri -> Mon
  expect(continues('2026-03-13', '2026-03-15')).toBe(true)  // Fri -> Sun
  expect(continues('2026-03-14', '2026-03-16')).toBe(true)  // Sat -> Mon
  expect(continues('2026-03-13', '2026-03-17')).toBe(false) // Fri -> Tue
  expect(continues('2026-03-11', '2026-03-13')).toBe(false) // Wed -> Fri
  expect(continues('2026-03-13', '2026-03-13')).toBe(false)
  expect(continues('', '2026-03-13')).toBe(false)
  const fri = run(newProfile(), [
    { type: 'prompt', text: 'a', now: at(2026, 3, 12) },
    { type: 'prompt', text: 'b', now: at(2026, 3, 13) },
  ])
  expect(fri.streak.count).toBe(2)
  expect(streakLabel(fri, at(2026, 3, 14))).toBe('Back Monday to keep your 2-day streak')
  expect(streakLabel(fri, at(2026, 3, 15))).toBe('Back Monday to keep your 2-day streak')
  expect(streakLabel(fri, at(2026, 3, 16))).toContain('keep it alive')
  expect(streakLabel(fri, at(2026, 3, 17))).toContain('No streak')
  const mon = applyEvent(fri, tool('read', { now: at(2026, 3, 16) })).profile
  expect(mon.streak).toEqual({ count: 3, lastDay: '2026-03-16' })
  const tue = applyEvent(fri, tool('read', { now: at(2026, 3, 17) })).profile
  expect(tue.streak).toEqual({ count: 1, lastDay: '2026-03-17' })
})

test('opening a session does not start a streak or pay the daily bonus', async () => {
  const r = applyEvent(newProfile(), { type: 'session', project: 'demo', now: NOW })
  expect(r.profile.streak).toEqual({ count: 0, lastDay: '' })
  expect(r.xpGained).toBe(0)
  expect(r.profile.projects).toEqual(['demo'])
  const prompt = applyEvent(r.profile, { type: 'prompt', text: 'go', now: NOW })
  expect(prompt.profile.streak.count).toBe(1)
  expect(prompt.xpGained).toBe(XP.dailyBase)
})

test('bonus xp levels up and unlocks the Party Hat without touching streak or quests', async () => {
  const p = warm()
  const withQuest = { ...p, quests: { day: p.quests.day, items: [{ id: 'tools', title: 'Make 1 tool call', goal: 1, progress: 0, xp: 9, done: false }] } }
  const bonus = (xp: number, now = NOW) => ({ type: 'bonus', xp, now }) as unknown as GameEvent
  const r = applyEvent(withQuest, bonus(40))
  expect(r.levelUp).toBe(2)
  expect(r.unlockedHats).toContain('party')
  expect(r.xpGained).toBe(40)
  expect(r.completedQuests).toHaveLength(0)
  expect(r.profile.quests.items[0]!.progress).toBe(0)
  // a bonus on a new day does not count as a working day
  const later = applyEvent(r.profile, bonus(5, at(2026, 3, 11)))
  expect(later.profile.streak).toEqual(r.profile.streak)
  expect(later.xpGained).toBe(5)
  expect(applyEvent(withQuest, bonus(-10)).xpGained).toBe(0)
  expect(applyEvent(withQuest, bonus(Number.NaN)).xpGained).toBe(0)
})

test('the Daily Sweep counts when the last daily quest completes and pays when claimed', async () => {
  const p = warm()
  const q = (id: string, done: boolean) => ({ id, title: id, goal: 1, progress: done ? 1 : 0, xp: 7, done })
  const base = { ...p, quests: { day: p.quests.day, items: [q('prompts', true), q('turns', true), q('tools', false)] } }
  expect(sweptToday(base, NOW)).toBe(false)
  expect(applyEvent(base, { type: 'claim', now: NOW }).xpGained).toBe(0) // nothing to claim yet
  const r1 = applyEvent(base, tool('edit', { ext: 'ts' }))
  expect(r1.completedQuests).toHaveLength(1)
  expect(r1.xpGained).toBe(XP.craft + 7) // the bonus waits for its claim
  expect(sweepsOf(r1.profile)).toBe(1)
  expect(sweptToday(r1.profile, NOW)).toBe(true)
  expect(sweepClaimable(r1.profile, NOW)).toBe(true)
  // the claim pays once and touches neither the streak nor the quests
  const c1 = applyEvent(r1.profile, { type: 'claim', now: NOW + 1000 })
  expect(c1.xpGained).toBe(XP.sweep)
  expect(c1.profile.streak).toEqual(r1.profile.streak)
  expect(c1.profile.quests).toEqual(r1.profile.quests)
  expect(sweepClaimable(c1.profile, NOW)).toBe(false)
  expect(applyEvent(c1.profile, { type: 'claim', now: NOW + 2000 }).xpGained).toBe(0)
  expect(sweepsOf(c1.profile)).toBe(1)
  expect(sweepClaimable(migrateProfile(JSON.stringify(c1.profile)), NOW)).toBe(false)
  expect(sweepClaimable(migrateProfile(JSON.stringify(r1.profile)), NOW)).toBe(true)
  expect(sweepsOf(migrateProfile(JSON.stringify(c1.profile)))).toBe(1)
  expect(sweepsOf(migrateProfile({}))).toBe(0)
  // an unclaimed bonus expires at midnight
  const tomorrow = at(2026, 3, 11)
  expect(sweepClaimable(r1.profile, tomorrow)).toBe(false)
  expect(applyEvent(r1.profile, { type: 'claim', now: tomorrow }).xpGained).toBe(0)
  // a save from before the claim button was paid on the spot: its day counts as claimed
  const legacy = JSON.parse(JSON.stringify(r1.profile)) as Record<string, unknown>
  delete legacy.sweepClaimed
  expect(sweepClaimable(migrateProfile(legacy), NOW)).toBe(false)
  expect(migrateProfile(legacy).sweepClaimed).toBe(p.quests.day)
  expect(migrateProfile({ xp: 5 }).sweepClaimed).toBe('')
  // not every quest done yet: no sweep
  const partial = { ...p, quests: { day: p.quests.day, items: [q('prompts', false), q('tools', false)] } }
  expect(applyEvent(partial, tool('edit', { ext: 'ts' })).xpGained).toBe(XP.craft + 7)
})

test('a pre-claim save swept today with a retired quest kind does not sweep the same day twice', async () => {
  const day = dayOf(NOW)
  const draw = questsForDay(day)
  // the older save paid its sweep on the spot; one of its three done quests is a retired kind
  const old = {
    xp: 5000, sweeps: 4, totals: { tools: 500, quests: 12 }, streak: { count: 2, lastDay: day },
    quests: { day, items: [{ ...draw[0]!, progress: draw[0]!.goal, done: true }, { ...draw[1]!, progress: draw[1]!.goal, done: true },
      { id: 'pet', title: 'Pet Clawd 3 times', goal: 3, progress: 3, xp: 10, done: true }] },
  }
  let p = migrateProfile(old)
  expect(p.quests.items.map(i => i.id)).toEqual(draw.map(i => i.id)) // the retired quest's place is refilled, undone
  expect(p.quests.items[2]!.done).toBe(false)
  expect(p.sweepClaimed).toBe(day)
  // finishing the replacement neither counts a second sweep nor opens a second claim
  let t = NOW
  for (let i = 0; i < 120 && !p.quests.items.every(q => q.done); i++) {
    t += 1000
    for (const e of [tool('edit', { ext: 'ts', combo: i + 1, now: t }), tool('read', { combo: i + 2, now: t }), prompt('go', t), turnEv(1, 0, 5000, t)]) {
      p = applyEvent(p, e).profile
    }
  }
  expect(p.quests.items.every(q => q.done)).toBe(true)
  expect(p.sweeps).toBe(4)
  expect(sweepClaimable(p, t)).toBe(false)
  expect(applyEvent(p, { type: 'claim', now: t + 1 }).xpGained).toBe(0)
})

test('dailyQuests shows the new day before an event rolls it, and only moves forward', async () => {
  const p = applyEvent(newProfile(), prompt('hi')).profile
  expect(dailyQuests(p, NOW)).toEqual(p.quests.items)
  const tomorrow = at(2026, 3, 11, 0, 5)
  expect(dailyQuests(p, tomorrow)).toEqual(questsForDay(dayOf(tomorrow)))
  expect(applyEvent(p, prompt('morning', tomorrow)).profile.quests.items).toEqual(dailyQuests(p, tomorrow))
  // a clock set back keeps the stored day, as applyEvent does
  expect(dailyQuests(p, at(2026, 3, 9))).toEqual(p.quests.items)
  expect(dailyQuests(newProfile(), NOW)).toEqual(questsForDay(dayOf(NOW)))
})

test('daily quests fit any project', async () => {
  for (let i = 0; i < 120; i++) {
    const day = dayStr(new Date(2026, 0, 1 + i, 12))
    const items = questsForDay(day)
    expect(items).toHaveLength(3)
    expect(items.some(x => ['tf', 'web', 'agent', 'test', 'git', 'search', 'run', 'types', 'pet'].includes(x.id.split(':')[0]!))).toBe(false)
    expect(questsForDay(day)).toEqual(items)
  }
  expect(questsForDay('2026-03-10').map(x => [x.id, x.goal, x.xp])).toEqual([['turns', 6, 16], ['prompts', 7, 14], ['edit', 12, 23]])
})

test('removed quest kinds are dropped and refilled', async () => {
  expect(ACHIEVEMENTS.some(a => a.id === 'best-friend' || a.id === 'good-boy')).toBe(false)
  // a stored quest of a removed kind gives way to today's draw
  const p = migrateProfile({ version: 1, quests: { day: '2026-03-10', items: [{ id: 'pet', title: 'Pet Clawd', goal: 1, progress: 0, xp: 5, done: false }] } })
  expect(p.quests.items).toEqual(questsForDay('2026-03-10'))
})

test('Explorer counts working days in this project, not other projects', async () => {
  expect(newProfile().totals.days).toBe(0)
  expect(migrateProfile({ totals: {} }).totals.days).toBe(0)
  let p = run(newProfile(), [tool('read', { now: at(2026, 3, 9) }), tool('edit', { now: at(2026, 3, 9, 15) })])
  expect(p.totals.days).toBe(1)
  p = applyEvent(p, tool('read', { now: at(2026, 3, 10) })).profile
  expect(p.totals.days).toBe(2)
  const visits = run(newProfile(), ['a', 'b', 'c', 'd', 'e'].map(project => ({ type: 'session', project, now: NOW }) as GameEvent))
  expect(visits.achievements.explorer).toBeUndefined()
  p = run(p, [11, 12, 13].map(d => tool('read', { now: at(2026, 3, d) })))
  expect(p.totals.days).toBe(5)
  expect(p.achievements.explorer).toBeDefined()
})

test('a save from a newer version is recognised', async () => {
  expect(PROFILE_VERSION).toBe(2)
  expect(isNewerProfile({ version: 3 })).toBe(true)
  expect(isNewerProfile({ version: 2 })).toBe(false)
  expect(isNewerProfile({ version: 1 })).toBe(false)
  expect(isNewerProfile({})).toBe(false)
  expect(isNewerProfile('x')).toBe(false)
  expect(isNewerProfile(undefined)).toBe(false)
})

// ---------- 1.0: level table, Encore stars, titles ----------

const prompt = (text: string, now = NOW): GameEvent => ({ type: 'prompt', text, now })
const bonus = (xp: number, extra: { quests?: number; bosses?: number; campaigns?: number } = {}, now = NOW): GameEvent =>
  ({ type: 'bonus', xp, now, ...extra })
const turnEv = (toolCount: number, errorCount: number, durationMs: number, now = NOW): GameEvent =>
  ({ type: 'turn', durationMs, toolCount, errorCount, now })
const holding = (p: Profile, ...ids: string[]): Profile =>
  ({ ...p, achievements: { ...p.achievements, ...Object.fromEntries(ids.map(id => [id, 1])) } })
const ids = (r: { unlocked: Array<{ id: string }> }) => r.unlocked.map(a => a.id)

test('XP_AT matches the plan table', async () => {
  expect(XP_AT).toHaveLength(MAX_LEVEL + 1)
  expect(MAX_LEVEL).toBe(100)
  expect(STAR_XP).toBe(1000)
  expect([XP_AT[0], XP_AT[1], XP_AT[2], XP_AT[10], XP_AT[25], XP_AT[50], XP_AT[75], XP_AT[100]])
    .toEqual([0, 0, 40, 1345, 6462, 20248, 39159, 62384])
  expect([XP_AT[3], XP_AT[17], XP_AT[54], XP_AT[99]]).toEqual([121, 3378, 22956, 61379])
  for (let L = 1; L <= 100; L++) {
    expect(Number.isInteger(XP_AT[L])).toBe(true)
    // the same xp never gives a lower level than the original curve, floor(sqrt(xp / 40)) + 1
    expect(XP_AT[L]! <= 40 * (L - 1) ** 2).toBe(true)
  }
  // a level never gets cheaper than the one before
  for (let L = 2; L < 100; L++) expect(XP_AT[L + 1]! - XP_AT[L]! >= XP_AT[L]! - XP_AT[L - 1]!).toBe(true)
  expect(MILESTONE_LEVELS).toEqual([10, 25, 50, 75, 100])
})

test('levelOf boundaries, cap and Encore stars', async () => {
  for (let L = 2; L <= 100; L++) {
    const info = levelOf(XP_AT[L]!)
    expect(info.level).toBe(L)
    expect(info.from).toBe(XP_AT[L])
    expect(levelOf(XP_AT[L]! - 1).level).toBe(L - 1)
    expect(levelOf(XP_AT[L]! - 0.25).level).toBe(L - 1)
    expect(levelOf(XP_AT[L]! + 0.5).level).toBe(L)
    if (L < 100) {
      expect(info.to).toBe(XP_AT[L + 1])
      expect(info.isMax).toBe(false)
    }
  }
  for (const junk of [-5, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
    expect(levelOf(junk)).toEqual({ level: 1, from: 0, to: 40, stars: 0, isMax: false })
  }
  expect(levelOf(XP_AT[99]!)).toEqual({ level: 99, from: 61379, to: 62384, stars: 0, isMax: false })
  expect(levelOf(62384)).toEqual({ level: 100, from: 62384, to: 63384, stars: 0, isMax: true })
  expect(levelOf(63383)).toEqual({ level: 100, from: 62384, to: 63384, stars: 0, isMax: true })
  expect(levelOf(63384)).toEqual({ level: 100, from: 63384, to: 64384, stars: 1, isMax: true })
  expect(levelOf(62384 + 12_345)).toEqual({ level: 100, from: 74384, to: 75384, stars: 12, isMax: true })
  expect(levelOf(1e9).level).toBe(100)
})

test('titles', async () => {
  const bands: Array<[number, string]> = [[1, 'Hatchling'], [4, 'Hatchling'], [5, 'Apprentice'], [9, 'Apprentice'],
    [10, 'Journeyman'], [24, 'Journeyman'], [25, 'Expert'], [39, 'Expert'], [40, 'Veteran'], [49, 'Veteran'],
    [50, 'Master'], [74, 'Master'], [75, 'Grandmaster'], [99, 'Grandmaster'], [100, 'Legend']]
  for (const [lv, title] of bands) expect(titleOf(lv)).toBe(title)
  expect(titleOf(0)).toBe('Hatchling')
})

test('applyEvent reports levelUp, titleUp and starUp', async () => {
  const p = warm()
  const to5 = applyEvent({ ...p, xp: XP_AT[5]! - 1 }, bonus(1))
  expect(to5.levelUp).toBe(5)
  expect(to5.titleUp).toBe('Apprentice')
  expect(to5.starUp).toBe(null)
  const to6 = applyEvent(holding({ ...p, xp: XP_AT[6]! - 1 }, 'level-5'), bonus(1))
  expect(to6.levelUp).toBe(6)
  expect(to6.titleUp).toBe(null)
  const none = applyEvent(p, bonus(0))
  expect([none.levelUp, none.titleUp, none.starUp]).toEqual([null, null, null])
  const top = holding({ ...p, xp: XP_AT[100]! - 1 }, 'level-5', 'level-10', 'level-25', 'level-40', 'level-50', 'level-75')
  const legend = applyEvent(top, bonus(1))
  expect(legend.levelUp).toBe(100)
  expect(legend.titleUp).toBe('Legend')
  expect(ids(legend)).toContain('level-100')
  const star = applyEvent(legend.profile, bonus(XP_AT[100]! + STAR_XP - legend.profile.xp))
  expect(star.starUp).toBe(1)
  expect(star.levelUp).toBe(null)
  expect(star.titleUp).toBe(null)
  const encore = applyEvent(star.profile, bonus(XP_AT[100]! + 10 * STAR_XP - star.profile.xp))
  expect(encore.starUp).toBe(10)
  expect(ids(encore)).toContain('encore')
  expect(applyEvent(encore.profile, bonus(1)).starUp).toBe(null)
})

// ---------- 1.0: save migration ----------

// The original hat rules on the original curve, verbatim: no hat they ever offered may close on an older save.
const oldCurve = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1

function legacyHats(p: Profile, now: number): HatId[] {
  const has = (id: string) => p.achievements[id] !== undefined
  const level = oldCurve(p.xp)
  const month = new Date(now).getMonth() + 1
  const ok: Array<[HatId, boolean]> = [
    ['party', level >= 2], ['beanie', has('streak-3')], ['headphones', has('hundred-club')], ['sunglasses', has('speedrun')],
    ['tophat', has('polite')], ['hardhat', has('terraformer') || has('test-pilot')], ['propeller', has('combo-25')],
    ['wizard', has('polyglot') || level >= 10], ['halo', has('clean-sweep') && has('streak-7')],
    ['crown', level >= 25 || has('streak-30')], ['pumpkin', month === 10 || has('trick-or-commit')],
    ['santa', month === 12 || has('holiday-coder')],
  ]
  return ok.filter(([, v]) => v).map(([id]) => id)
}

function legacySave(xp: number, achievements: string[]): Record<string, unknown> {
  return {
    version: 1, xp,
    totals: { tools: 300, edits: 80, reads: 90, runs: 40, searches: 30, web: 3, errors: 12, turns: 60, gitCommands: 10,
      tfEdits: 0, tests: 5, agents: 1, days: 6 },
    fileTypes: ['ts', 'md'], projects: ['demo'],
    achievements: Object.fromEntries(achievements.map(id => [id, 5])),
    streak: { count: 1, lastDay: '2026-03-09' },
    quests: { day: '2026-03-09', items: questsForDay('2026-03-09') },
    hat: 'party', bestCombo: 12,
    daily: { day: '2026-03-09', exts: ['ts', 'md'] },
    sweeps: 4, sweepClaimed: '2026-03-08',
    recent: Array.from({ length: 12 }, (_, i) => ({ verb: 'Quest', what: `q${i}`, at: i })),
  }
}

test('an old v1 save migrates silently: same xp, a level never lower than before, everything kept', async () => {
  const cases: Array<[number, number, number, string[]]> = [
    [150, 2, 3, ['first-steps', 'hello-world', 'hundred-club', 'combo-10']],
    [3500, 10, 17, ['first-steps', 'hello-world', 'hundred-club', 'combo-10', 'level-5', 'level-10', 'polite', 'retired-trophy']],
    [23100, 25, 54, ['first-steps', 'hello-world', 'hundred-club', 'combo-10', 'level-5', 'level-10', 'level-25', 'trick-or-commit', 'streak-3']],
  ]
  for (const [xp, oldLevel, newLevel, held] of cases) {
    // a stale `notice` field from a pre-release build is dropped
    const raw = { ...legacySave(xp, held), notice: { kind: 'upgrade', fromLevel: oldLevel, toLevel: newLevel } }
    const p = migrateProfile(raw)
    expect(p.version).toBe(2)
    expect(p.xp).toBe(xp)
    expect(oldCurve(xp)).toBe(oldLevel)
    expect(levelOf(p.xp).level).toBe(newLevel)
    expect('notice' in p).toBe(false)
    expect([p.totals.quests, p.totals.bosses, p.totals.campaigns]).toEqual([12, 0, 0])
    expect(p.totals.tools).toBe(300)
    expect(p.daily).toEqual({ day: '2026-03-09', tools: 0 })
    expect(p.fresh).toEqual([])
    expect(p.hat).toBe('party')
    expect(p.recent).toHaveLength(RECENT_SIZE)
    expect(p.recent![RECENT_SIZE - 1]!.what).toBe('q11')
    for (const id of held) expect(p.achievements[id]).toBe(5) // unknown ids are kept ...
    expect(unlockedCount(p)).toBe(held.filter(id => id !== 'retired-trophy').length) // ... but not counted
    // every old unlock is still open, in and out of season
    for (const now of [NOW, at(2026, 10, 15), at(2026, 12, 25)]) {
      const after = availableHats(p, now)
      for (const h of legacyHats(p, now)) expect(after).toContain(h)
    }
    // a save and load changes nothing, and the first real event brings no level or hat cascade
    expect(migrateProfile(JSON.parse(JSON.stringify(p)))).toEqual(p)
    const r = applyEvent(p, prompt('hello'))
    expect(r.levelUp).toBe(null)
    expect(r.unlockedHats).toEqual([])
    expect('notice' in r.profile).toBe(false)
  }
  // the L25 save picks up its retroactive level trophies on that event
  const big = applyEvent(migrateProfile(legacySave(23100, ['level-5', 'level-10', 'level-25'])), prompt('hello'))
  expect(ids(big)).toContain('level-40')
  expect(ids(big)).toContain('level-50')
})

test('the original hat rules stay open for any save', async () => {
  const trophySets = [[], ['polyglot'], ['streak-30', 'streak-3'], ['clean-sweep', 'streak-7', 'trick-or-commit', 'holiday-coder'],
    ['hundred-club', 'speedrun', 'polite', 'terraformer', 'combo-25']]
  for (let xp = 0; xp <= 40_000; xp += 97) {
    for (const set of trophySets) {
      const p = holding({ ...newProfile(), xp }, ...set)
      for (const now of [NOW, at(2026, 10, 2), at(2026, 12, 2)]) {
        const after = availableHats(p, now)
        for (const h of legacyHats(p, now)) expect(after).toContain(h)
      }
    }
  }
})

test('migration adds no notice, drops a stale one, and fills new field defaults', async () => {
  const stale = { kind: 'upgrade', fromLevel: 10, toLevel: 17, toasted: true }
  for (const raw of [{ xp: 3500 }, { version: 1, xp: 3500 }, { version: 1, xp: 0 }, { version: 2, xp: 3500, notice: stale },
    { version: 1, xp: 3500, notice: stale }, { version: 3, xp: 5000, notice: stale }, { version: '3', xp: 5000 }]) {
    expect('notice' in migrateProfile(raw)).toBe(false)
  }
  // stored counters win over the seed
  const v2 = migrateProfile({ version: 2, sweeps: 4, totals: { quests: 30, bosses: 2, campaigns: 1 }, daily: { day: '2026-03-10', tools: 7 } })
  expect([v2.totals.quests, v2.totals.bosses, v2.totals.campaigns]).toEqual([30, 2, 1])
  expect(v2.daily).toEqual({ day: '2026-03-10', tools: 7 })
  expect(migrateProfile({ sweeps: 3 }).totals.quests).toBe(9)
  // fresh keys: valid ones only, deduplicated, newest 60
  const fresh = migrateProfile({ fresh: ['hat:cap', 'hat:cap', 'decor:plant:fern', 'bogus', 7, ...Array.from({ length: 70 }, (_, i) => `hat:h${i}`)] })
  expect(fresh.fresh).toHaveLength(60)
  expect(fresh.fresh![59]).toBe('hat:h69')
  expect(migrateProfile({ fresh: ['hat:cap', 'nope', 'decor:plant:fern'] }).fresh).toEqual(['hat:cap', 'decor:plant:fern'])
  // new hat ids survive, unknown ones do not
  expect(migrateProfile({ version: 2, hat: 'viking' }).hat).toBe('viking')
  expect(migrateProfile({ version: 2, hat: 'fez' }).hat).toBe(null)
  const np = newProfile()
  expect(np.version).toBe(2)
  expect([np.totals.quests, np.totals.bosses, np.totals.campaigns]).toEqual([0, 0, 0])
  expect(np.fresh).toEqual([])
  expect('notice' in np).toBe(false)
})

// ---------- 1.0: hats ----------

test('HATS has the 44 hats of table 2.1 in order, with the original rules unchanged', async () => {
  expect(HATS.map(h => h.id)).toEqual([
    'party', 'beanie', 'headphones', 'sunglasses', 'tophat', 'hardhat', 'propeller', 'wizard', 'halo', 'crown', 'pumpkin', 'santa',
    'cap', 'chef', 'beret', 'viking', 'cowboy', 'captain', 'pirate', 'ninja', 'laurel', 'kabuto', 'knight', 'jester', 'archmage',
    'astronaut', 'ufo', 'dragonhorns', 'phoenix', 'starcrown', 'graduation', 'deerstalker', 'miner', 'nightcap', 'firefighter',
    'flower', 'unicorn', 'divemask', 'bandana', 'tinfoil', 'teapot', 'catears', 'boppers', 'bunny',
  ])
  expect(HATS.slice(0, 12).map(h => [h.id, h.unlock])).toEqual([
    ['party', { level: 2 }], ['beanie', { anyOf: ['streak-3'] }], ['headphones', { anyOf: ['hundred-club'] }],
    ['sunglasses', { anyOf: ['speedrun'] }], ['tophat', { anyOf: ['polite'] }], ['hardhat', { anyOf: ['terraformer', 'test-pilot'] }],
    ['propeller', { anyOf: ['combo-25'] }], ['wizard', { level: 10, anyOf: ['polyglot'] }],
    ['halo', { allOf: ['clean-sweep', 'streak-7'] }], ['crown', { level: 25, anyOf: ['streak-30'] }],
    ['pumpkin', { month: 10, keep: 'trick-or-commit' }], ['santa', { month: 12, keep: 'holiday-coder' }],
  ])
  const byId = new Map(HATS.map(h => [h.id, h]))
  const levels: Array<[HatId, number]> = [['cap', 7], ['chef', 13], ['beret', 17], ['viking', 20], ['cowboy', 28], ['captain', 33],
    ['pirate', 38], ['ninja', 43], ['laurel', 50], ['kabuto', 55], ['knight', 60], ['jester', 65], ['archmage', 70],
    ['astronaut', 75], ['ufo', 80], ['dragonhorns', 85], ['phoenix', 90], ['starcrown', 100]]
  for (const [id, level] of levels) expect(byId.get(id)?.unlock).toEqual({ level })
  const trophies: Array<[HatId, string]> = [['graduation', 'librarian'], ['deerstalker', 'sherlock'], ['miner', 'cartographer'],
    ['nightcap', 'round-the-clock'], ['firefighter', 'fail-forward'], ['flower', 'streak-14'], ['unicorn', 'combo-100'],
    ['divemask', 'deep-work'], ['bandana', 'sweep-10'], ['tinfoil', 'my-machine'], ['teapot', 'teapot'], ['catears', 'meow']]
  for (const [id, trophy] of trophies) expect(byId.get(id)?.unlock).toEqual({ anyOf: [trophy] })
  expect(byId.get('boppers')?.unlock).toEqual({ month: 2, keep: 'valentine' })
  expect(byId.get('bunny')?.unlock).toEqual({ month: 4, keep: 'april-fools' })
  // every trophy a hat names exists
  const known = new Set(ACHIEVEMENTS.map(a => a.id))
  for (const h of HATS) for (const id of [...(h.unlock.anyOf ?? []), ...(h.unlock.allOf ?? []), ...(h.unlock.keep ? [h.unlock.keep] : [])]) {
    expect(known.has(id)).toBe(true)
  }
  // kind: seasonal if month, level if level, trophy otherwise
  for (const h of HATS) {
    expect(h.kind).toBe(h.unlock.month !== undefined ? 'seasonal' : h.unlock.level !== undefined ? 'level' : 'trophy')
  }
  expect(HATS.filter(h => h.kind === 'seasonal').map(h => h.id)).toEqual(['pumpkin', 'santa', 'boppers', 'bunny'])
  expect(byId.get('wizard')?.kind).toBe('level')
  expect([byId.get('chef')?.name, byId.get('starcrown')?.name, byId.get('divemask')?.name]).toEqual(["Chef's Toque", 'Starlight Crown', 'Dive Mask'])
  expect(new Set(HATS.map(h => h.name)).size).toBe(44)
})

test('isOpen: levels, trophies, seasons and keep', async () => {
  const p = newProfile()
  expect(isOpen({}, p, NOW)).toBe(true)
  expect(isOpen({ level: 2 }, p, NOW)).toBe(false)
  expect(isOpen({ level: 2 }, { ...p, xp: 40 }, NOW)).toBe(true)
  expect(isOpen({ level: 10, anyOf: ['polyglot'] }, holding(p, 'polyglot'), NOW)).toBe(true)
  expect(isOpen({ anyOf: ['terraformer', 'test-pilot'] }, holding(p, 'test-pilot'), NOW)).toBe(true)
  expect(isOpen({ allOf: ['clean-sweep', 'streak-7'] }, holding(p, 'clean-sweep'), NOW)).toBe(false)
  expect(isOpen({ allOf: ['clean-sweep', 'streak-7'] }, holding(p, 'clean-sweep', 'streak-7'), NOW)).toBe(true)
  const pumpkin = { month: 10, keep: 'trick-or-commit' }
  // the local month decides, right up to midnight
  expect(isOpen(pumpkin, p, at(2026, 9, 30, 23, 59))).toBe(false)
  expect(isOpen(pumpkin, p, at(2026, 10, 1, 0, 1))).toBe(true)
  expect(isOpen(pumpkin, p, at(2026, 10, 31, 23, 59))).toBe(true)
  expect(isOpen(pumpkin, p, at(2026, 11, 1, 0, 1))).toBe(false)
  // keep makes it permanent
  expect(isOpen(pumpkin, holding(p, 'trick-or-commit'), at(2027, 3, 1))).toBe(true)
  expect(availableHats(p, at(2026, 2, 10))).toEqual(['boppers'])
  expect(availableHats(p, at(2026, 4, 10))).toEqual(['bunny'])
  expect(availableHats(holding(p, 'valentine', 'april-fools'), NOW)).toEqual(['boppers', 'bunny'])
})

test('requirementText grammar', async () => {
  const byId = new Map(HATS.map(h => [h.id, h.unlock]))
  const req = (id: HatId, p?: Profile) => requirementText(byId.get(id)!, p)
  expect(req('chef')).toBe('Reach Lv 13')
  expect(req('wizard')).toBe('Reach Lv 10 or trophy: Polyglot')
  expect(req('crown')).toBe('Reach Lv 25 or trophy: Unbreakable')
  expect(req('hardhat')).toBe('Trophy: Terraformer or Test Pilot')
  expect(req('beanie')).toBe('Trophy: Habit Forming')
  expect(req('halo')).toBe('Trophies: Clean Sweep + Seven Days Strong')
  // hidden trophies stay secret until held
  expect(req('pumpkin')).toBe('Seasonal: any day in October (a secret trophy keeps it)')
  expect(req('pumpkin', holding(newProfile(), 'trick-or-commit'))).toBe('Seasonal: any day in October (Trick or Commit keeps it)')
  expect(req('santa', newProfile())).toBe('Seasonal: any day in December (a secret trophy keeps it)')
  expect(req('boppers')).toBe('Seasonal: any day in February (a secret trophy keeps it)')
  expect(req('bunny', holding(newProfile(), 'april-fools'))).toBe('Seasonal: any day in April (Gotcha keeps it)')
  expect(req('tinfoil')).toBe('A secret trophy')
  expect(req('teapot', newProfile())).toBe('A secret trophy')
  expect(req('catears', holding(newProfile(), 'meow'))).toBe('Trophy: Meow')
  expect(requirementText({})).toBe('Always available')
  expect(requirementText({ level: 5, anyOf: ['meow'] })).toBe('Reach Lv 5 or a secret trophy')
  expect(requirementText({ anyOf: ['polite', 'meow'] })).toBe('Trophy: Polite or a secret trophy')
  expect(requirementText({ month: 7 })).toBe('Seasonal: any day in July')
  // every hat has a readable line
  for (const h of HATS) expect(requirementText(h.unlock).length > 5).toBe(true)
})

test('equipHat only equips open hats', async () => {
  const p = { ...warm(), xp: XP_AT[13]! }
  expect(equipHat(p, 'chef', NOW).hat).toBe('chef')
  expect(equipHat(p, 'beret', NOW)).toBe(p)
  expect(equipHat(p, 'pumpkin', NOW)).toBe(p)
  expect(equipHat(p, 'pumpkin', at(2026, 10, 3)).hat).toBe('pumpkin')
  expect(equipHat({ ...p, hat: 'chef' }, null, NOW).hat).toBe(null)
})

test('seasonal hats are announced to new players (B09) and on a new month only', async () => {
  // a brand-new player in October hears about the pumpkin
  const first = applyEvent(newProfile(), { type: 'session', project: 'demo', now: at(2026, 10, 5) })
  expect(first.unlockedHats).toEqual(['pumpkin'])
  // later in the month it is old news
  expect(applyEvent(first.profile, prompt('hi', at(2026, 10, 6))).unlockedHats).toEqual([])
  // a returning player gets it when the month turns
  const sep = start(at(2026, 9, 30))
  expect(applyEvent(sep, prompt('hi', at(2026, 10, 1))).unlockedHats).toEqual(['pumpkin'])
  // a new player outside any season hears nothing
  expect(applyEvent(newProfile(), { type: 'session', project: 'demo', now: NOW }).unlockedHats).toEqual([])
})

// ---------- 1.0: achievements ----------

test('the trophy catalog has 80 entries, 12 hidden', async () => {
  expect(ACHIEVEMENTS).toHaveLength(80)
  expect(ACHIEVEMENTS.filter(a => a.hidden)).toHaveLength(12)
  expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(80)
  const byId = new Map(ACHIEVEMENTS.map(a => [a.id, a]))
  expect(byId.get('level-25')?.name).toBe('Expert')
  expect(byId.get('level-75')?.name).toBe('Grandmaster')
  expect(byId.get('level-100')?.name).toBe('Legend of Clawd')
  expect(byId.get('wordsmith')?.description).toBe('Make 500 edits')
  for (const id of ['valentine', 'april-fools', 'new-year', 'touch-grass', 'meow']) expect(byId.get(id)?.hidden).toBe(true)
  const added = ['level-40', 'level-50', 'level-75', 'level-100', 'encore', 'tools-50k', 'librarian', 'cartographer', 'novelist',
    'deep-diver', 'storyteller', 'release-train', 'qa-lead', 'director', 'babel', 'regular', 'resident', 'lifer', 'streak-14',
    'streak-60', 'streak-100', 'combo-100', 'deep-work', 'sweep-10', 'sweep-50', 'questaholic', 'boss-slayer', 'campaigner',
    'fashionista', 'fashion-icon', 'collector', 'curator', 'round-the-clock', 'valentine', 'april-fools', 'new-year', 'touch-grass', 'meow']
  expect(added).toHaveLength(38)
  for (const id of added) expect(byId.has(id)).toBe(true)
})

test('new count trophies unlock exactly at their goal', async () => {
  const base = holding(warm(), 'hundred-club', 'thousand-hands', 'legion', 'bookworm', 'sherlock', 'wordsmith', 'surfer', 'chatterbox',
    'git-gud', 'test-pilot', 'manager', 'polyglot', 'combo-10', 'combo-25', 'combo-50')
  type Case = [string, (p: Profile, n: number) => Profile, GameEvent, number]
  const tot = (key: keyof Profile['totals']) => (p: Profile, n: number): Profile => ({ ...p, totals: { ...p.totals, [key]: n } })
  const cases: Case[] = [
    ['tools-50k', tot('tools'), tool('read'), 50000],
    ['librarian', tot('reads'), tool('read'), 1000],
    ['cartographer', tot('searches'), tool('search'), 1000],
    ['novelist', tot('edits'), tool('edit'), 2500],
    ['deep-diver', tot('web'), tool('web'), 250],
    ['storyteller', tot('turns'), turnEv(0, 0, 0), 1000],
    ['release-train', tot('gitCommands'), tool('git'), 500],
    ['qa-lead', tot('tests'), tool('test'), 250],
    ['director', tot('agents'), tool('agent'), 100],
    ['babel', (p, n) => ({ ...p, fileTypes: Array.from({ length: n }, (_, i) => `x${i}`) }), tool('edit', { ext: 'rs' }), 12],
    ['questaholic', tot('quests'), bonus(0, { quests: 1 }), 100],
    ['boss-slayer', tot('bosses'), bonus(0, { bosses: 1 }), 1],
    ['campaigner', tot('campaigns'), bonus(0, { campaigns: 1 }), 10],
  ]
  for (const [id, set, ev, goal] of cases) {
    expect(ids(applyEvent(set(base, goal - 1), ev))).toContain(id)
    if (goal > 1) expect(ids(applyEvent(set(base, goal - 2), ev)).includes(id)).toBe(false)
  }
  expect(ids(applyEvent(base, tool('edit', { combo: 100 })))).toContain('combo-100')
  expect(ids(applyEvent(base, tool('edit', { combo: 99 }))).includes('combo-100')).toBe(false)
  expect(ids(applyEvent({ ...base, bestCombo: 100 }, tool('edit', { combo: 1 })))).toContain('combo-100')
})

test('working-day and streak trophies', async () => {
  const y = warm(at(2026, 3, 9)) // active yesterday (Monday)
  for (const [id, goal] of [['regular', 30], ['resident', 100], ['lifer', 250]] as const) {
    const p = { ...y, totals: { ...y.totals, days: goal - 1 } }
    expect(ids(applyEvent(p, prompt('hi')))).toContain(id)
    expect(ids(applyEvent({ ...p, totals: { ...p.totals, days: goal - 2 } }, prompt('hi'))).includes(id)).toBe(false)
  }
  for (const [id, goal] of [['streak-14', 14], ['streak-60', 60], ['streak-100', 100]] as const) {
    const p = holding({ ...y, streak: { count: goal - 1, lastDay: '2026-03-09' } }, 'streak-3', 'streak-7', 'streak-30')
    const r = applyEvent(p, prompt('hi'))
    expect(r.profile.streak.count).toBe(goal)
    expect(ids(r)).toContain(id)
  }
})

test('Deep Work, Speedrun and Marathon need real turns (B03)', async () => {
  const p = warm()
  expect(ids(applyEvent(p, turnEv(50, 0, 60_000)))).toContain('deep-work')
  expect(ids(applyEvent(p, turnEv(49, 0, 60_000))).includes('deep-work')).toBe(false)
  expect(ids(applyEvent(p, turnEv(50, 1, 60_000))).includes('deep-work')).toBe(false)
  expect(ids(applyEvent(p, turnEv(3, 0, 5_000)))).toContain('speedrun')
  for (const d of [0, -5, Number.NaN]) {
    const got = ids(applyEvent(p, turnEv(3, 0, d)))
    expect(got.includes('speedrun')).toBe(false)
    expect(got.includes('marathon')).toBe(false)
  }
  expect(ids(applyEvent(p, turnEv(1, 0, 21 * 60_000)))).toContain('marathon')
  // the fast quest ignores unknown durations too
  const fast: Quest = { id: 'fast:3', title: 'x', goal: 1, progress: 0, xp: 15, done: false }
  const withFast = { ...p, quests: { day: p.quests.day, items: [fast] } }
  expect(applyEvent(withFast, turnEv(2, 0, 0)).completedQuests).toHaveLength(0)
  expect(applyEvent(withFast, turnEv(2, 0, -100)).completedQuests).toHaveLength(0)
  expect(applyEvent(withFast, turnEv(0, 0, 1000)).completedQuests).toHaveLength(0)
  expect(applyEvent(withFast, turnEv(2, 0, 29_000)).completedQuests).toHaveLength(1)
  expect(applyEvent(withFast, turnEv(2, 0, 31_000)).completedQuests).toHaveLength(0)
})

test('Daily Sweep, quest and bonus counters feed trophies', async () => {
  const p = warm()
  const q = (id: string, done: boolean): Quest => ({ id, title: id, goal: 1, progress: done ? 1 : 0, xp: 7, done })
  const almost = { ...p, sweeps: 9, quests: { day: p.quests.day, items: [q('prompts', true), q('turns', true), q('tools', false)] } }
  const r = applyEvent(almost, tool('read'))
  expect(r.profile.totals.quests).toBe(p.totals.quests + 1)
  expect(sweepsOf(r.profile)).toBe(10)
  expect(ids(r)).toContain('sweep-10')
  expect(ids(applyEvent({ ...almost, sweeps: 49 }, tool('read')))).toContain('sweep-50')
  // bonus events add the project counters and pay the trophy tier
  const b = applyEvent(p, bonus(30, { quests: 3, bosses: 1, campaigns: 1 }))
  expect([b.profile.totals.quests, b.profile.totals.bosses, b.profile.totals.campaigns])
    .toEqual([p.totals.quests + 3, 1, 1])
  expect(ids(b)).toEqual(['boss-slayer'])
  expect(b.xpGained).toBe(30 + XP.achievement.medium)
  const junk = applyEvent(p, bonus(5, { quests: -2, bosses: Number.NaN, campaigns: 1.7 }))
  expect([junk.profile.totals.quests, junk.profile.totals.bosses, junk.profile.totals.campaigns]).toEqual([p.totals.quests, 0, 1])
  // a plain bonus without counters still works
  expect(applyEvent(p, bonus(5)).profile.totals).toEqual(p.totals)
})

test('Fashionista counts hats after the level update', async () => {
  const eight = ['streak-3', 'hundred-club', 'speedrun', 'polite', 'terraformer', 'combo-25', 'sherlock', 'fail-forward']
  // level 49 + 8 trophy hats = 19 hats; the bonus reaches level 50 (Golden Laurel), the 20th hat, in the same event
  const p = holding({ ...warm(), xp: XP_AT[50]! - 1 }, ...eight, 'level-5', 'level-10', 'level-25', 'level-40')
  expect(availableHats(p, NOW)).toHaveLength(19)
  expect(ids(applyEvent(p, bonus(0))).includes('fashionista')).toBe(false)
  const r = applyEvent(p, bonus(1))
  expect(ids(r)).toContain('level-50')
  expect(ids(r)).toContain('fashionista')
  expect(r.unlockedHats).toEqual(['laurel'])
  // 21 level hats + 14 trophy hats = 35
  const icon = holding({ ...warm(), xp: XP_AT[100]! }, ...eight, 'clean-sweep', 'streak-7', 'librarian', 'cartographer',
    'round-the-clock', 'streak-14', 'combo-100', 'level-5', 'level-10', 'level-25', 'level-40', 'level-50', 'level-75', 'level-100')
  expect(availableHats(icon, NOW)).toHaveLength(35)
  const got = ids(applyEvent(icon, prompt('hi')))
  expect(got).toContain('fashionista')
  expect(got).toContain('fashion-icon')
  expect(achievementProgress(p, NOW).find(a => a.def.id === 'fashion-icon')?.progress).toEqual({ value: 19, goal: 35 })
})

test('Collector and Curator need the decor count from ext', async () => {
  const p = warm()
  const owning = (n: number) => ({ decorOwned: (_p: Profile, _now: number) => n })
  expect(ids(applyEvent(p, prompt('hi'))).some(id => id === 'collector' || id === 'curator')).toBe(false)
  expect(ids(applyEvent(p, prompt('hi'), {})).includes('collector')).toBe(false)
  expect(ids(applyEvent(p, prompt('hi'), owning(39))).includes('collector')).toBe(false)
  const c = ids(applyEvent(p, prompt('hi'), owning(40)))
  expect(c).toContain('collector')
  expect(c.includes('curator')).toBe(false)
  const both = ids(applyEvent(p, prompt('hi'), owning(80)))
  expect(both).toContain('collector')
  expect(both).toContain('curator')
  expect(achievementProgress(p, NOW, owning(25)).find(a => a.def.id === 'curator')?.progress).toEqual({ value: 25, goal: 80 })
  expect(achievementProgress(p, NOW).find(a => a.def.id === 'collector')?.progress).toEqual({ value: 0, goal: 40 })
})

test('Round the Clock, date trophies and prompt secrets', async () => {
  const owl = holding(warm(at(2026, 3, 10, 3)), 'night-owl')
  const dawn = ids(applyEvent(owl, prompt('morning', at(2026, 3, 10, 6))))
  expect(dawn).toContain('early-bird')
  expect(dawn).toContain('round-the-clock')
  // B08: opening a session at night or on a holiday is not work
  for (const now of [at(2026, 3, 10, 3), at(2026, 2, 14), at(2026, 4, 1), at(2027, 1, 1), at(2026, 10, 31), at(2026, 12, 25), at(2026, 3, 14)]) {
    expect(applyEvent(newProfile(), { type: 'session', project: 'x', now }).unlocked).toEqual([])
  }
  const dates: Array<[string, number]> = [['valentine', at(2026, 2, 14)], ['april-fools', at(2026, 4, 1)], ['new-year', at(2027, 1, 1)]]
  for (const [id, now] of dates) {
    expect(ids(applyEvent(newProfile(), prompt('hi', now)))).toContain(id)
    expect(ids(applyEvent(newProfile(), prompt('hi', now - 86_400_000))).includes(id)).toBe(false)
  }
  expect(ids(applyEvent(newProfile(), tool('read', { now: at(2026, 2, 14, 15) })))).toContain('valentine')
  const p = warm()
  const said = (text: string) => ids(applyEvent(p, prompt(text)))
  expect(said('maybe go touch grass')).toContain('touch-grass')
  expect(said('I was touching grass all day')).toContain('touch-grass')
  expect(said('touchgrass.ts is broken').includes('touch-grass')).toBe(false)
  expect(said('meow')).toContain('meow')
  expect(said('Meow, fix the build')).toContain('meow')
  expect(said('the homeowner page').includes('meow')).toBe(false)
})

test('Rage Quit ignores code (B04)', async () => {
  const p = warm()
  const rage = (text: string) => ids(applyEvent(p, prompt(text))).includes('rage-quit')
  expect(rage('why is this broken!!!')).toBe(true)
  expect(rage('WHY DOES THIS NOT WORK')).toBe(true)
  expect(rage('stop!!! see `x`')).toBe(true)
  expect(rage('rename `MAX_RETRY_COUNT_LIMIT` please')).toBe(false)
  expect(rage('run this:\n```\nSELECT NAME FROM USERS WHERE ID = 1\n```')).toBe(false)
  expect(rage('look `!!!` here')).toBe(false)
  expect(rage('```\nCONST ARRAY = UNCLOSED BLOCK')).toBe(false)
  expect(rage('a! b! c!')).toBe(false)
  expect(rage('OK THEN')).toBe(false)
})

test('achievementProgress: unlockedAt, live streaks and default now', async () => {
  const p = holding({ ...warm(), streak: { count: 10, lastDay: '2026-03-02' } }, 'streak-3', 'streak-7')
  const stale = achievementProgress(p, at(2026, 3, 20))
  const s14 = stale.find(a => a.def.id === 'streak-14')!
  expect(s14.progress).toEqual({ value: 0, goal: 14 })
  expect(s14.unlocked).toBe(false)
  expect(s14.unlockedAt).toBeUndefined()
  const s7 = stale.find(a => a.def.id === 'streak-7')!
  expect(s7.unlockedAt).toBe(1)
  expect(s7.progress).toEqual({ value: 7, goal: 7 })
  expect(achievementProgress(p, at(2026, 3, 3)).find(a => a.def.id === 'streak-14')?.progress).toEqual({ value: 10, goal: 14 })
  expect(achievementProgress(p).find(a => a.def.id === 'streak-14')?.progress).toEqual({ value: 10, goal: 14 })
  const lv = achievementProgress({ ...p, xp: XP_AT[30]! }, NOW)
  expect(lv.find(a => a.def.id === 'level-40')?.progress).toEqual({ value: 30, goal: 40 })
  expect(lv.find(a => a.def.id === 'encore')?.progress).toEqual({ value: 0, goal: 10 })
  expect(achievementProgress({ ...p, xp: XP_AT[100]! + 3 * STAR_XP }, NOW).find(a => a.def.id === 'encore')?.progress).toEqual({ value: 3, goal: 10 })
  expect(achievementProgress(p, NOW).find(a => a.def.id === 'round-the-clock')?.progress).toEqual({ value: 0, goal: 2 })
  expect(achievementProgress(newProfile())).toHaveLength(68)
})

test('unlockedCount counts known trophies only', async () => {
  expect(unlockedCount(newProfile())).toBe(0)
  expect(unlockedCount(holding(newProfile(), 'polite', 'meow', 'pet-clawd', 'from-the-future'))).toBe(2)
})

// ---------- 1.0: streaks and the clock (B02, B05) ----------

test('a clock set back counts as the same day, then moving forward resumes', async () => {
  let p = run(newProfile(), [prompt('a', at(2026, 3, 9)), prompt('b', at(2026, 3, 10)), prompt('c', at(2026, 3, 11))])
  expect(p.streak).toEqual({ count: 3, lastDay: '2026-03-11' })
  const before = p
  const back = applyEvent(p, prompt('back in time', at(2026, 3, 10, 15)))
  expect(back.profile.streak).toEqual(before.streak)
  expect(back.profile.totals.days).toBe(before.totals.days)
  expect(back.xpGained).toBe(0)
  expect(back.profile.quests.day).toBe('2026-03-11')
  expect(back.profile.quests.items.map(q => q.id)).toEqual(before.quests.items.map(q => q.id))
  expect(back.profile.daily?.day).toBe('2026-03-11')
  expect(streakLabel(back.profile, at(2026, 3, 10, 15))).toBe('3-day streak')
  expect(effectiveStreak(back.profile, at(2026, 3, 10, 15))).toBe(3)
  // tools during the odd hour still count for today's quests
  const tb = applyEvent(back.profile, tool('read', { now: at(2026, 3, 10, 16) }))
  expect(tb.profile.daily?.tools).toBe((back.profile.daily?.tools ?? 0) + 1)
  p = applyEvent(tb.profile, prompt('tomorrow', at(2026, 3, 12))).profile
  expect(p.streak).toEqual({ count: 4, lastDay: '2026-03-12' })
  expect(p.quests.day).toBe('2026-03-12')
  expect(p.totals.days).toBe(4)
})

// The days of `year` on which the zone running the tests changes its UTC offset, as [month, day]: none on a UTC
// machine. `at()` and dayOf() work in that zone, so only these days give the local-time checks a real 23 or 25 hour day.
function localSwitches(year: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const d = new Date(year, 0, 1, 12); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)
    if (next.getTimezoneOffset() !== d.getTimezoneOffset()) out.push([next.getMonth() + 1, next.getDate()])
  }
  return out
}
// The US (Mar 8 / Nov 1) and EU (Mar 29 / Oct 25) switch days of 2026, plus whatever the test machine's zone uses.
const DST_DAYS: Array<[number, number]> = [[3, 8], [3, 29], [10, 25], [11, 1], ...localSwitches(2026)]

test('the DST checks know which switch days this machine really has', async () => {
  // a zone with DST switches an even number of times a year, and the two days around each switch are not 48 hours
  const local = localSwitches(2026)
  expect(local.length % 2).toBe(0)
  for (const [m, d] of local) {
    const hours = (new Date(2026, m - 1, d, 12).getTime() - new Date(2026, m - 1, d - 1, 12).getTime()) / 3_600_000
    expect(hours).not.toBe(24)
  }
  // the zone-free day count: across a year end, a leap day and a Friday -> Monday over New Year
  expect(continues('2026-12-31', '2027-01-01')).toBe(true)
  expect(continues('2028-02-28', '2028-02-29')).toBe(true)
  expect(continues('2028-02-28', '2028-03-01')).toBe(false) // Mon -> Wed
  expect(continues('2027-12-31', '2028-01-03')).toBe(true) // Fri -> Mon
  expect(continues('2026-03-09', '2026-03-08')).toBe(false)
})

test('streaks survive DST days', async () => {
  // a week either side of each switch day, at the edges of each day: the local zone's switches are real ones
  for (const [m, c] of DST_DAYS) {
    let p = newProfile()
    for (let k = -6; k <= 6; k++) p = run(p, [prompt('late', at(2026, m, c + k, 0, 30)), tool('read', { now: at(2026, m, c + k, 23, 30) })])
    expect(p.streak.count).toBe(13)
    expect(p.totals.days).toBe(13)
    expect(p.streak.lastDay).toBe(dayOf(at(2026, m, c + 6, 12)))
  }
  // the day arithmetic runs on the day strings alone, so these are the US and EU switches in every zone
  const pairs: Array<[string, string]> = [['2026-03-07', '2026-03-08'], ['2026-03-08', '2026-03-09'], ['2026-03-28', '2026-03-29'],
    ['2026-03-29', '2026-03-30'], ['2026-10-24', '2026-10-25'], ['2026-10-25', '2026-10-26'], ['2026-10-31', '2026-11-01'],
    ['2026-11-01', '2026-11-02']]
  for (const [a, b] of pairs) expect(continues(a, b)).toBe(true)
  expect(dayOf(at(2026, 3, 29, 23, 59))).toBe('2026-03-29')
  expect(dayOf(at(2026, 10, 25, 0, 1))).toBe('2026-10-25')
})

test('Thursday to Saturday breaks a streak; labels and effectiveStreak agree', async () => {
  // 2026-03-12 is a Thursday
  expect(continues('2026-03-12', '2026-03-14')).toBe(false)
  const thu = run(newProfile(), [prompt('a', at(2026, 3, 11)), prompt('b', at(2026, 3, 12))])
  expect(streakLabel(thu, at(2026, 3, 14))).toBe('No streak yet, start one today')
  expect(effectiveStreak(thu, at(2026, 3, 14))).toBe(0)
  expect(applyEvent(thu, prompt('sat', at(2026, 3, 14))).profile.streak).toEqual({ count: 1, lastDay: '2026-03-14' })
  const fri = applyEvent(thu, prompt('c', at(2026, 3, 13))).profile
  expect(streakLabel(fri, at(2026, 3, 14))).toBe('Back Monday to keep your 3-day streak')
  expect(effectiveStreak(fri, at(2026, 3, 14))).toBe(3)
  expect(effectiveStreak(fri, at(2026, 3, 16))).toBe(3)
  expect(effectiveStreak(fri, at(2026, 3, 17))).toBe(0)
  expect(effectiveStreak(fri, at(2026, 3, 13))).toBe(3)
  expect(effectiveStreak(fri, at(2026, 3, 1))).toBe(3) // clock behind the last day
  expect(effectiveStreak(newProfile(), NOW)).toBe(0)
  expect(effectiveStreak({ ...fri, streak: { count: 4, lastDay: 'garbage' } }, NOW)).toBe(0)
})

// ---------- 1.0: daily quests (B07) ----------

test('daily quest titles say what they count', async () => {
  const seen = new Map<string, string>()
  for (let i = 0; i < 200; i++) {
    for (const q of questsForDay(dayOf(new Date(2026, 0, 1 + i, 12).getTime()))) seen.set(q.id.split(':')[0]!, q.title)
  }
  expect(/^Make \d+ edits$/.test(seen.get('edit') ?? '')).toBe(true)
  expect(/^Read \d+ files$/.test(seen.get('read') ?? '')).toBe(true)
  expect(/^Finish a turn with tools in under \d+ seconds$/.test(seen.get('fast') ?? '')).toBe(true)
  expect(/^Reach a combo of \d+$/.test(seen.get('combo') ?? '')).toBe(true)
})

test('daily quest titles never put "a" before a number ("Reach a 8-combo")', async () => {
  for (let i = 0; i < 400; i++) {
    for (const q of questsForDay(dayOf(new Date(2026, 0, 1 + i, 12).getTime()))) {
      expect(/\ban? \d/.test(q.title)).toBe(false)
    }
  }
})

test("the combo quest only counts today's tool calls", async () => {
  const y = warm(at(2026, 3, 9))
  const combo: Quest = { id: 'combo', title: 'Reach a combo of 8', goal: 8, progress: 0, xp: 15, done: false }
  // a combo of 20 carried over midnight
  let p: Profile = { ...y, quests: { day: '2026-03-10', items: [combo] }, daily: { day: '2026-03-09', tools: 30 } }
  const r = applyEvent(p, tool('edit', { combo: 20 }))
  expect(r.profile.daily).toEqual({ day: '2026-03-10', tools: 1 })
  expect(r.profile.quests.items[0]!.progress).toBe(1)
  p = r.profile
  // errors count as tool calls today but do not advance the quest
  p = applyEvent(p, tool('shell', { isError: true, combo: 0 })).profile
  expect(p.daily?.tools).toBe(2)
  expect(p.quests.items[0]!.progress).toBe(1)
  for (let i = 0; i < 6; i++) p = applyEvent(p, tool('read', { combo: 21 + i })).profile
  expect(p.quests.items[0]!.done).toBe(true)
  expect(p.totals.quests).toBe(y.totals.quests + 1)
  // prompts and turns are not tool calls
  expect(applyEvent(p, prompt('x')).profile.daily?.tools).toBe(8)
})

// ---------- 1.0: fresh markers, recent ----------

test('addFresh and markSeen', async () => {
  const p = newProfile()
  const a = addFresh(p, ['hat:cap', 'decor:plant:fern', 'hat:cap', 'junk'])
  expect(a.fresh).toEqual(['hat:cap', 'decor:plant:fern'])
  expect(p.fresh).toEqual([]) // input untouched
  const b = addFresh(a, ['hat:cap'])
  expect(b.fresh).toEqual(['decor:plant:fern', 'hat:cap']) // re-added moves to the newest end
  expect(addFresh(b, ['decor:plant:fern', 'hat:cap'])).toBe(b)
  expect(addFresh(b, [])).toBe(b)
  const many = addFresh(p, Array.from({ length: 75 }, (_, i) => `hat:h${i}`))
  expect(many.fresh).toHaveLength(60)
  expect(many.fresh![0]).toBe('hat:h15')
  expect(many.fresh![59]).toBe('hat:h74')
  const seen = markSeen(b, 'hat:')
  expect(seen.fresh).toEqual(['decor:plant:fern'])
  expect(markSeen(seen, 'hat:')).toBe(seen)
  expect(markSeen(seen, 'decor:').fresh).toEqual([])
  const old: Profile = { ...p }
  delete old.fresh
  expect(addFresh(old, ['hat:party']).fresh).toEqual(['hat:party'])
  expect(markSeen(old, 'hat:')).toBe(old)
  // fresh markers survive events
  expect(applyEvent(a, tool('read')).profile.fresh).toEqual(['hat:cap', 'decor:plant:fern'])
  expect(RECENT_SIZE).toBe(8)
})

// ---------- regressions ----------

test('welcome-back: a return after 14 days or more, across a DST switch; 13 days or a clock set back is not', async () => {
  const has = (p: Profile) => p.achievements['welcome-back'] !== undefined
  // two weeks that start just before each switch day (the US and EU ones, and the test machine's own, which are
  // real 23 or 25 hour days in local time)
  for (const [y, m, d] of DST_DAYS.map(([sm, sd]) => [2026, sm, sd - 3] as const)) {
    const day0 = at(y, m, d, 10)
    const p0 = applyEvent(newProfile(), prompt('hi', day0)).profile
    const later = (days: number) => new Date(y, m - 1, d + days, 9).getTime()
    expect(has(applyEvent(p0, prompt('back', later(13))).profile)).toBe(false)
    expect(has(applyEvent(p0, prompt('back', later(14))).profile)).toBe(true)
    // a tool call counts as a return too
    expect(has(applyEvent(p0, tool('read', { now: later(15) })).profile)).toBe(true)
    // a clock set back two weeks is no return
    expect(has(applyEvent(p0, prompt('back', new Date(y, m - 1, d - 14, 9).getTime())).profile)).toBe(false)
  }
  // opening a session after the gap is not activity: the first real prompt is
  const p0 = applyEvent(newProfile(), prompt('hi', at(2026, 3, 1))).profile
  expect(has(applyEvent(p0, { type: 'session', project: 'demo', now: at(2026, 3, 20) }).profile)).toBe(false)
  expect(ACHIEVEMENTS.find(a => a.id === 'welcome-back')?.hidden).toBe(true)
})

test('persistence: a turn finished despite 5 errors or more', async () => {
  const has = (p: Profile) => p.achievements.persistence !== undefined
  expect(has(applyEvent(warm(), turnEv(9, 4, 60_000)).profile)).toBe(false)
  expect(has(applyEvent(warm(), turnEv(9, 5, 60_000)).profile)).toBe(true)
  expect(has(applyEvent(warm(), turnEv(12, 8, 60_000)).profile)).toBe(true)
})

test('Questaholic counts daily and /quests quests, and says so', async () => {
  const q = ACHIEVEMENTS.find(a => a.id === 'questaholic')!
  expect(q.description).toBe('Complete 100 quests (daily or /quests)')
  const p = { ...warm(), totals: { ...warm().totals, quests: 97 } }
  const r = applyEvent(p, bonus(30, { quests: 3 }))
  expect(r.profile.totals.quests).toBe(100)
  expect(r.unlocked.map(a => a.id)).toContain('questaholic')
})

test('achievementXp is the tier xp the unlock pays', async () => {
  expect(achievementXp('wordsmith')).toBe(XP.achievement.hard)
  expect(achievementXp('bookworm')).toBe(XP.achievement.medium)
  expect(achievementXp('no-such-trophy')).toBe(0)
  const p = { ...newProfile(), totals: { ...newProfile().totals, edits: 499 } }
  const r = applyEvent(applyEvent(p, prompt('hi')).profile, tool('edit', { ext: 'ts' }))
  expect(r.unlocked.map(a => a.id)).toContain('wordsmith')
})

// ---------- regressions ----------

test('a later level trophy never pays less than an earlier one', async () => {
  const levels = ACHIEVEMENTS.filter(a => /^level-\d+$/.test(a.id)).sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6)))
  expect(levels.map(a => a.id)).toEqual(['level-5', 'level-10', 'level-25', 'level-40', 'level-50', 'level-75', 'level-100'])
  const pay = levels.map(a => achievementXp(a.id))
  for (let i = 1; i < pay.length; i++) expect([levels[i]!.id, pay[i]! >= pay[i - 1]!]).toEqual([levels[i]!.id, true])
})

test('Touch Grass says what unlocks it: the person mentions touching grass', async () => {
  const grass = ACHIEVEMENTS.find(a => a.id === 'touch-grass')!
  expect(grass.description).toBe('Talk about touching grass')
})
