// Gamification engine for Clawd: xp, levels, Encore stars, streaks, daily quests, achievements and hats.
// Pure and deterministic: no Math.random, no Date.now, time arrives on every event as `now`.
import type {
  AchievementDef, Activity, GameEvent, GameResult, HatId, Profile, Quest, Unlock,
} from '../types'

// ---------- tuning ----------

// The level curve is a fixed table (XP_AT below, 40 * (L - 1)^1.6 up to level 100), so xp per action stays
// small: a solid first day (~150 tool calls, ~20 turns) lands around level 4, level 10 takes about a week
// and level 100 about a year of regular use (2-4 h a day, 5 days a week).
export const XP = {
  light: 1,            // read / search / web / shell / git / skill: pays on every 2nd tool call overall (0.5 on average)
  craft: 1,            // successful edit / write / test / terraform: always pays
  agent: 2,            // successful subagent delegation
  error: 1,            // you learn from mistakes: pays on the 1st, 4th, 7th ... error (1/3 on average)
  comboEvery: 10,      // every 10th call of a combo pays a bonus ...
  comboMaxBonus: 3,    // ... of combo/10, capped at 3
  turn: 2,             // finished turn
  cleanTurn: 1,        // extra when the turn used tools and had no errors
  dailyBase: 10,       // first activity of a day
  dailyPerStreakDay: 2, // + 2 per streak day beyond the first ...
  dailyStreakCap: 10,  // ... counting at most 10 extra days (max 30)
  questScale: 0.6,     // quest rewards come out at roughly 10-25 xp
  sweep: 15,           // Daily Sweep: all 3 daily quests done, paid when claimed the same day
  achievement: { easy: 5, medium: 20, hard: 50, secret: 15 } as const,
} as const

type Daily = { day: string; tools: number }

export const RECENT_SIZE = 8

// ---------- time helpers ----------

const pad = (n: number) => String(n).padStart(2, '0')

export function dayOf(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
}

// A calendar day as a plain day count (UTC-based, so no zone and no DST switch can stretch or shrink a day).
function dayNumber(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
}

// Whole calendar days from `from` to `to` (negative when `to` is earlier); Infinity when either is not a day.
// Counted on the day strings alone, so a 23 or 25 hour DST day still counts as one in every zone.
function daysBetween(from: string, to: string): number {
  const a = dayNumber(from), b = dayNumber(to)
  if (a === null || b === null) return Infinity
  return b - a
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
// the same for a day number: day 0 (1970-01-01) was a Thursday, and 0 is Sunday as in getDay()
const isWeekendNumber = (n: number) => {
  const weekday = (((n + 4) % 7) + 7) % 7
  return weekday === 0 || weekday === 6
}

// A streak continues from `last` to `today` when they are consecutive days, or when every day
// strictly between them is a Saturday or Sunday (Friday -> Monday keeps the streak).
export function continues(last: string, today: string): boolean {
  const n = daysBetween(last, today)
  if (n === 1) return true
  if (!Number.isFinite(n) || n < 2 || n > 3) return false
  const first = dayNumber(last)!
  for (let i = 1; i < n; i++) if (!isWeekendNumber(first + i)) return false
  return true
}

// ---------- level ----------

export const MAX_LEVEL = 100
export const STAR_XP = 1000
export const MILESTONE_LEVELS: readonly number[] = [10, 25, 50, 75, 100]

// Total xp to reach level L (index 1..100; index 0 is unused and 0).
export const XP_AT: readonly number[] = Object.freeze(
  Array.from({ length: MAX_LEVEL + 1 }, (_, L) => (L <= 1 ? 0 : Math.round(40 * (L - 1) ** 1.6))),
)

export type LevelInfo = { level: number; from: number; to: number; stars: number; isMax: boolean }

const cleanXp = (xp: number) => (typeof xp === 'number' && Number.isFinite(xp) && xp > 0 ? xp : 0)

export function levelOf(xp: number): LevelInfo {
  const x = cleanXp(xp)
  // largest L in 1..100 with XP_AT[L] <= x
  let lo = 1, hi = MAX_LEVEL
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (XP_AT[mid]! <= x) lo = mid
    else hi = mid - 1
  }
  if (lo < MAX_LEVEL) return { level: lo, from: XP_AT[lo]!, to: XP_AT[lo + 1]!, stars: 0, isMax: false }
  const top = XP_AT[MAX_LEVEL]!
  const stars = Math.floor((x - top) / STAR_XP)
  const from = top + stars * STAR_XP
  return { level: MAX_LEVEL, from, to: from + STAR_XP, stars, isMax: true }
}

const TITLES: ReadonlyArray<readonly [number, string]> = [
  [100, 'Legend'], [75, 'Grandmaster'], [50, 'Master'], [40, 'Veteran'], [25, 'Expert'], [10, 'Journeyman'],
  [5, 'Apprentice'], [1, 'Hatchling'],
]

export function titleOf(level: number): string {
  for (const [min, title] of TITLES) if (level >= min) return title
  return 'Hatchling'
}

// ---------- seeded PRNG ----------

function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- activity helpers ----------

const EDITS: ReadonlySet<Activity> = new Set(['edit', 'write'])
const RUNS: ReadonlySet<Activity> = new Set(['shell', 'git', 'terraform', 'test'])

function normExt(ext: string | null): string | null {
  if (!ext) return null
  const e = ext.trim().replace(/^\.+/, '').toLowerCase()
  return /^[a-z0-9_+-]{1,12}$/.test(e) ? e : null
}

const isTf = (activity: Activity, ext: string | null) =>
  activity === 'terraform' || (EDITS.has(activity) && (ext === 'tf' || ext === 'tfvars'))

const count0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

// ---------- quests ----------

type QuestCtx = { event: GameEvent; daily: Daily }
type QuestTemplate = {
  id: string
  weight: number
  goal: [number, number]
  title: (goal: number, param: number) => string
  xp: (goal: number) => number
  param?: [number, number] // optional second parameter (e.g. seconds); goal is then usually 1
  // progress: return { add } to increment, { set } to raise progress to a value, or null
  track: (ctx: QuestCtx, quest: Quest, param: number) => { add?: number; set?: number } | null
}

const okTool = (e: GameEvent, pred: (a: Activity) => boolean) =>
  e.type === 'tool' && !e.isError && pred(e.activity)

const QUEST_TEMPLATES: QuestTemplate[] = [
  { id: 'edit', weight: 3, goal: [5, 12], title: g => `Make ${g} edits`, xp: g => 15 + g * 2,
    track: ({ event }) => okTool(event, a => EDITS.has(a)) ? { add: 1 } : null },
  { id: 'clean', weight: 3, goal: [3, 5], title: g => `Finish ${g} turns without errors`, xp: g => 15 + g * 5,
    track: ({ event }) => event.type === 'turn' && event.toolCount > 0 && event.errorCount === 0 ? { add: 1 } : null },
  { id: 'read', weight: 2, goal: [10, 20], title: g => `Read ${g} files`, xp: g => 15 + g,
    track: ({ event }) => okTool(event, a => a === 'read') ? { add: 1 } : null },
  // only today's tool calls count, so a combo carried over midnight does not finish it at once
  { id: 'combo', weight: 2, goal: [8, 15], title: g => `Reach a combo of ${g}`, xp: g => 10 + g * 2,
    track: ({ event, daily }) => event.type === 'tool' && !event.isError
      ? { set: Math.min(count0(event.combo), daily.tools) } : null },
  { id: 'fast', weight: 2, goal: [1, 1], param: [3, 6], title: (_g, p) => `Finish a turn with tools in under ${p * 10} seconds`, xp: () => 25,
    track: ({ event }, _q, p) => event.type === 'turn' && event.toolCount > 0 && event.durationMs > 0 && event.durationMs < p * 10_000
      ? { add: 1 } : null },
  { id: 'turns', weight: 2, goal: [5, 10], title: g => `Finish ${g} turns`, xp: g => 15 + g * 2,
    track: ({ event }) => event.type === 'turn' ? { add: 1 } : null },
  { id: 'prompts', weight: 2, goal: [5, 10], title: g => `Send ${g} prompts`, xp: g => 10 + g * 2,
    track: ({ event }) => event.type === 'prompt' ? { add: 1 } : null },
  { id: 'tools', weight: 2, goal: [40, 80], title: g => `Make ${g} tool calls`, xp: g => 15 + Math.round(g / 4),
    track: ({ event }) => event.type === 'tool' ? { add: 1 } : null },
]

const TEMPLATE_BY_ID = new Map(QUEST_TEMPLATES.map(t => [t.id, t]))

// Three quests for a day, deterministic per day. Every quest fits any project (no tests, git or
// codebase searches), so a docs or notes folder gets quests it can finish too.
export function questsForDay(day: string): Quest[] {
  const rnd = mulberry32(hashString(`clawd-quests:${day}`))
  const range = ([lo, hi]: [number, number]) => lo + Math.floor(rnd() * (hi - lo + 1))
  const pool = [...QUEST_TEMPLATES]
  const out: Quest[] = []
  while (out.length < 3 && pool.length > 0) {
    const total = pool.reduce((s, t) => s + t.weight, 0)
    let r = rnd() * total
    let idx = 0
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx]!.weight
      if (r < 0) break
    }
    const t = pool.splice(idx, 1)[0]!
    const goal = range(t.goal)
    const param = t.param ? range(t.param) : 0
    out.push({
      id: t.param ? `${t.id}:${param}` : t.id,
      title: t.title(goal, param),
      goal,
      progress: 0,
      xp: Math.max(5, Math.round(t.xp(goal) * XP.questScale)),
      done: false,
    })
  }
  return out
}

// ---------- achievements ----------

// Things the engine cannot see on its own (decor lives in decor.ts, which imports this module).
export type GameExt = { decorOwned?: (p: Profile, now: number) => number }

type Tier = 'easy' | 'medium' | 'hard' | 'secret'
type TimeInfo = { hour: number; weekday: number; month: number; date: number }
type CheckCtx = {
  event: GameEvent; time: TimeInfo; level: number; stars: number; gapDays: number | null; now: number; ext?: GameExt
}
type GoalCtx = { now: number; ext?: GameExt }
type Achievement = AchievementDef & {
  tier: Tier
  check: (p: Profile, c: CheckCtx) => boolean
  goal?: (p: Profile, c: GoalCtx) => { value: number; goal: number }
}

const count = (id: string, name: string, description: string, tier: Tier, goal: number,
  value: (p: Profile, c: GoalCtx) => number, progress?: (p: Profile, c: GoalCtx) => number): Achievement => ({
  id, name, description, tier,
  check: (p, c) => value(p, c) >= goal,
  goal: (p, c) => ({ value: Math.min((progress ?? value)(p, c), goal), goal }),
})

const levelAch = (id: string, name: string, tier: Tier, level: number): Achievement => ({
  id, name, description: `Reach level ${level}`, tier, check: (_p, c) => c.level >= level,
  goal: p => ({ value: Math.min(levelOf(p.xp).level, level), goal: level }),
})

const streakAch = (id: string, name: string, tier: Tier, days: number): Achievement =>
  count(id, name, `Keep a ${days}-day streak`, tier, days, p => p.streak.count, (p, c) => effectiveStreak(p, c.now))

const promptMatch = (e: GameEvent, f: (text: string) => boolean) => e.type === 'prompt' && f(e.text)
// Real work: opening a session alone does not count.
const working = (e: GameEvent) => e.type === 'tool' || e.type === 'prompt' || e.type === 'turn'
const has = (p: Profile, id: string) => p.achievements[id] !== undefined
const decorOwned = (p: Profile, c: GoalCtx) => (c.ext?.decorOwned ? count0(c.ext.decorOwned(p, c.now)) : 0)

// Shouting = three or more ! in a row, or 12+ letters all in upper case. Code (fenced or inline) is ignored,
// so pasted constants and SQL keywords never count.
function isShouting(text: string): boolean {
  const prose = text.replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ')
  if (/!{3,}/.test(prose)) return true
  const letters = prose.replace(/[^A-Za-z]/g, '')
  return letters.length >= 12 && letters === letters.toUpperCase()
}

const LIST: Achievement[] = [
  // getting started
  count('first-steps', 'First Steps', 'Make your first tool call', 'easy', 1, p => p.totals.tools),
  count('hello-world', 'Hello World', 'Edit your first file', 'easy', 1, p => p.totals.edits),
  // volume
  count('hundred-club', 'Hundred Club', 'Make 100 tool calls', 'easy', 100, p => p.totals.tools),
  count('thousand-hands', 'Thousand Hands', 'Make 1,000 tool calls', 'medium', 1000, p => p.totals.tools),
  count('legion', 'Legion', 'Make 10,000 tool calls', 'hard', 10000, p => p.totals.tools),
  count('tools-50k', 'Leviathan', 'Make 50,000 tool calls', 'hard', 50000, p => p.totals.tools),
  count('bookworm', 'Bookworm', 'Read 100 files', 'medium', 100, p => p.totals.reads),
  count('librarian', 'Librarian', 'Read 1,000 files', 'hard', 1000, p => p.totals.reads),
  count('sherlock', 'Sherlock', 'Search the codebase 100 times', 'medium', 100, p => p.totals.searches),
  count('cartographer', 'Cartographer', 'Search the codebase 1,000 times', 'hard', 1000, p => p.totals.searches),
  count('wordsmith', 'Wordsmith', 'Make 500 edits', 'hard', 500, p => p.totals.edits),
  count('novelist', 'Novelist', 'Make 2,500 edits', 'hard', 2500, p => p.totals.edits),
  count('surfer', 'Web Surfer', 'Look things up on the web 25 times', 'medium', 25, p => p.totals.web),
  count('deep-diver', 'Deep Diver', 'Look things up on the web 250 times', 'hard', 250, p => p.totals.web),
  count('chatterbox', 'Chatterbox', 'Finish 100 turns', 'medium', 100, p => p.totals.turns),
  count('storyteller', 'Storyteller', 'Finish 1,000 turns', 'hard', 1000, p => p.totals.turns),
  count('fail-forward', 'Fail Forward', 'Hit 100 errors and keep going', 'medium', 100, p => p.totals.errors),
  // specialties
  count('polyglot', 'Polyglot', 'Edit 5 different file types', 'medium', 5, p => p.fileTypes.length),
  count('babel', 'Tower of Babel', 'Edit 12 different file types', 'hard', 12, p => p.fileTypes.length),
  count('terraformer', 'Terraformer', 'Make 25 Terraform changes', 'medium', 25, p => p.totals.tfEdits),
  count('git-gud', 'Git Gud', 'Run 50 git commands', 'medium', 50, p => p.totals.gitCommands),
  count('release-train', 'Release Train', 'Run 500 git commands', 'hard', 500, p => p.totals.gitCommands),
  count('test-pilot', 'Test Pilot', 'Run the tests 25 times', 'medium', 25, p => p.totals.tests),
  count('qa-lead', 'QA Lead', 'Run the tests 250 times', 'hard', 250, p => p.totals.tests),
  count('manager', 'Manager Material', 'Delegate to subagents 10 times', 'medium', 10, p => p.totals.agents),
  count('director', 'Director', 'Delegate to subagents 100 times', 'hard', 100, p => p.totals.agents),
  count('explorer', 'Explorer', 'Work in this project on 5 different days', 'medium', 5, p => p.totals.days),
  count('regular', 'Regular', 'Work in this project on 30 different days', 'medium', 30, p => p.totals.days),
  count('resident', 'Resident', 'Work in this project on 100 different days', 'hard', 100, p => p.totals.days),
  count('lifer', 'Lifer', 'Work in this project on 250 different days', 'hard', 250, p => p.totals.days),
  // flow
  count('combo-10', 'On a Roll', 'Reach a 10-combo', 'easy', 10, p => p.bestCombo),
  count('combo-25', 'Unstoppable', 'Reach a 25-combo', 'medium', 25, p => p.bestCombo),
  count('combo-50', 'In the Zone', 'Reach a 50-combo', 'hard', 50, p => p.bestCombo),
  count('combo-100', 'Transcendent', 'Reach a 100-combo', 'hard', 100, p => p.bestCombo),
  { id: 'clean-sweep', name: 'Clean Sweep', description: 'Finish a turn with 10+ tool calls and no errors', tier: 'medium',
    check: (_p, { event: e }) => e.type === 'turn' && e.toolCount >= 10 && e.errorCount === 0 },
  { id: 'deep-work', name: 'Deep Work', description: 'Finish a turn with 50+ tool calls and no errors', tier: 'hard',
    check: (_p, { event: e }) => e.type === 'turn' && e.toolCount >= 50 && e.errorCount === 0 },
  { id: 'speedrun', name: 'Speedrun', description: 'Finish a turn with 3+ tool calls in under 15 seconds', tier: 'easy',
    check: (_p, { event: e }) => e.type === 'turn' && e.toolCount >= 3 && e.durationMs > 0 && e.durationMs < 15_000 },
  { id: 'marathon', name: 'Marathon', description: 'Finish a turn that ran longer than 20 minutes', tier: 'medium',
    check: (_p, { event: e }) => e.type === 'turn' && e.durationMs > 0 && e.durationMs > 20 * 60_000 },
  { id: 'persistence', name: 'Persistence', description: 'Finish a turn despite 5+ errors', tier: 'easy',
    check: (_p, { event: e }) => e.type === 'turn' && e.errorCount >= 5 },
  // time of day
  { id: 'night-owl', name: 'Night Owl', description: 'Work between midnight and 5 am', tier: 'easy',
    check: (_p, { event, time }) => working(event) && time.hour < 5 },
  { id: 'early-bird', name: 'Early Bird', description: 'Work between 5 and 7 am', tier: 'easy',
    check: (_p, { event, time }) => working(event) && time.hour >= 5 && time.hour < 7 },
  { id: 'weekend', name: 'Weekend Warrior', description: 'Work on a Saturday or Sunday', tier: 'easy',
    check: (_p, { event, time }) => working(event) && (time.weekday === 0 || time.weekday === 6) },
  // listed after both parts, so it sees an unlock from earlier in the same event
  { id: 'round-the-clock', name: 'Round the Clock', description: 'Earn both Night Owl and Early Bird', tier: 'medium',
    check: p => has(p, 'night-owl') && has(p, 'early-bird'),
    goal: p => ({ value: (has(p, 'night-owl') ? 1 : 0) + (has(p, 'early-bird') ? 1 : 0), goal: 2 }) },
  // streaks (progress shows the streak that is still alive, B05)
  streakAch('streak-3', 'Habit Forming', 'easy', 3),
  streakAch('streak-7', 'Seven Days Strong', 'medium', 7),
  streakAch('streak-14', 'Fortnight', 'medium', 14),
  streakAch('streak-30', 'Unbreakable', 'hard', 30),
  streakAch('streak-60', 'Two Moons', 'hard', 60),
  streakAch('streak-100', 'Centurion', 'hard', 100),
  // quests
  count('sweep-10', 'Tidy', 'Earn 10 Daily Sweeps', 'medium', 10, p => sweepsOf(p)),
  count('sweep-50', 'Spotless', 'Earn 50 Daily Sweeps', 'hard', 50, p => sweepsOf(p)),
  count('questaholic', 'Questaholic', 'Complete 100 quests (daily or /quests)', 'hard', 100, p => p.totals.quests),
  count('boss-slayer', 'Boss Slayer', 'Defeat a /quests boss', 'medium', 1, p => p.totals.bosses),
  count('campaigner', 'Campaigner', 'Complete 10 /quests campaigns', 'hard', 10, p => p.totals.campaigns),
  // collections
  count('fashionista', 'Fashionista', 'Own 20 hats', 'medium', 20, (p, c) => availableHats(p, c.now).length),
  count('fashion-icon', 'Fashion Icon', 'Own 35 hats', 'hard', 35, (p, c) => availableHats(p, c.now).length),
  count('collector', 'Collector', 'Own 40 pieces of decor', 'medium', 40, decorOwned),
  count('curator', 'Curator', 'Own 80 pieces of decor', 'hard', 80, decorOwned),
  // prompts
  { id: 'polite', name: 'Polite', description: 'Say please or thank you to Claude', tier: 'easy',
    check: (_p, { event }) => promptMatch(event, t => /\b(please|pls|thanks|thank you|thx|cheers)\b/i.test(t)) },
  { id: 'rubber-duck', name: 'Rubber Duck', description: 'Ask Claude a why question', tier: 'easy',
    check: (_p, { event }) => promptMatch(event, t => /\bwhy\b/i.test(t) && t.trim().endsWith('?')) },
  // levels
  levelAch('level-5', 'Apprentice', 'easy', 5),
  levelAch('level-10', 'Journeyman', 'medium', 10),
  levelAch('level-25', 'Expert', 'hard', 25),
  levelAch('level-40', 'Veteran', 'hard', 40),
  levelAch('level-50', 'Master', 'hard', 50),
  levelAch('level-75', 'Grandmaster', 'hard', 75),
  levelAch('level-100', 'Legend of Clawd', 'hard', 100),
  { id: 'encore', name: 'Encore', description: 'Earn 10 Encore stars past level 100', tier: 'hard',
    check: (_p, c) => c.stars >= 10,
    goal: p => ({ value: Math.min(levelOf(p.xp).stars, 10), goal: 10 }) },
  // hidden
  { id: 'my-machine', name: 'It Works on My Machine', description: 'Blame the environment', tier: 'secret', hidden: true,
    check: (_p, { event }) => promptMatch(event, t => /works on my machine/i.test(t)) },
  { id: 'ship-it', name: 'Ship It', description: 'Approve with confidence', tier: 'secret', hidden: true,
    check: (_p, { event }) => promptMatch(event, t => /\bship it\b|\blgtm\b/i.test(t)) },
  { id: 'rage-quit', name: 'Rage Quit Averted', description: 'Shout at Claude and stay anyway', tier: 'secret', hidden: true,
    check: (_p, { event }) => promptMatch(event, isShouting) },
  { id: 'teapot', name: '418', description: 'I am a teapot', tier: 'secret', hidden: true,
    check: (_p, { event }) => promptMatch(event, t => /teapot/i.test(t)) },
  { id: 'welcome-back', name: 'Welcome Back', description: 'Return after two weeks away', tier: 'secret', hidden: true,
    check: (_p, c) => c.gapDays !== null && c.gapDays >= 14 },
  { id: 'trick-or-commit', name: 'Trick or Commit', description: 'Work on Halloween', tier: 'secret', hidden: true,
    check: (_p, { event, time }) => working(event) && time.month === 10 && time.date === 31 },
  { id: 'holiday-coder', name: 'Holiday Coder', description: 'Work between December 24 and 26', tier: 'secret', hidden: true,
    check: (_p, { event, time }) => working(event) && time.month === 12 && time.date >= 24 && time.date <= 26 },
  { id: 'valentine', name: 'Heart Eyes', description: "Work on Valentine's Day", tier: 'secret', hidden: true,
    check: (_p, { event, time }) => working(event) && time.month === 2 && time.date === 14 },
  { id: 'april-fools', name: 'Gotcha', description: "Work on April Fools' Day", tier: 'secret', hidden: true,
    check: (_p, { event, time }) => working(event) && time.month === 4 && time.date === 1 },
  { id: 'new-year', name: 'Fresh Start', description: "Work on New Year's Day", tier: 'secret', hidden: true,
    check: (_p, { event, time }) => working(event) && time.month === 1 && time.date === 1 },
  { id: 'touch-grass', name: 'Touch Grass', description: 'Talk about touching grass', tier: 'secret', hidden: true,
    check: (_p, { event }) => promptMatch(event, t => /\btouch(ing)? grass\b/i.test(t)) },
  { id: 'meow', name: 'Meow', description: "Speak Clawd's other language", tier: 'secret', hidden: true,
    check: (_p, { event }) => promptMatch(event, t => /\bmeow\b/i.test(t)) },
]

const BY_ID = new Map(LIST.map(a => [a.id, a]))
const defOf = (a: Achievement): AchievementDef =>
  a.hidden ? { id: a.id, name: a.name, description: a.description, hidden: true } : { id: a.id, name: a.name, description: a.description }

export const ACHIEVEMENTS: AchievementDef[] = LIST.map(defOf)

// The xp a catalog trophy pays when it unlocks (its tier's), 0 for an unknown id.
export function achievementXp(id: string): number {
  const a = BY_ID.get(id)
  return a ? XP.achievement[a.tier] : 0
}

type ProgressEntry = { def: AchievementDef; unlocked: boolean; unlockedAt?: number; progress?: { value: number; goal: number } }

// The Trophies list: every known trophy except hidden ones not yet held, in catalog order.
export function achievementProgress(profile: Profile, now = 0, ext?: GameExt): ProgressEntry[] {
  const out: ProgressEntry[] = []
  const c: GoalCtx = ext ? { now, ext } : { now }
  for (const a of LIST) {
    const at = profile.achievements[a.id]
    const unlocked = at !== undefined
    if (a.hidden && !unlocked) continue
    const entry: ProgressEntry = { def: defOf(a), unlocked }
    if (unlocked) entry.unlockedAt = at
    if (a.goal) {
      const g = a.goal(profile, c)
      entry.progress = unlocked ? { value: g.goal, goal: g.goal } : g
    }
    out.push(entry)
  }
  return out
}

// Trophies held, counting only ids this version knows (retired or future ids are kept but not counted).
export function unlockedCount(profile: Profile): number {
  let n = 0
  for (const a of LIST) if (profile.achievements[a.id] !== undefined) n++
  return n
}

// ---------- hats ----------

export type HatDef = { id: HatId; name: string; unlock: Unlock; kind: 'level' | 'trophy' | 'seasonal' }

const hat = (id: HatId, name: string, unlock: Unlock): HatDef =>
  ({ id, name, unlock, kind: unlock.month !== undefined ? 'seasonal' : unlock.level !== undefined ? 'level' : 'trophy' })

// Wardrobe order (plan table 2.1). Never raise an existing level gate: saves rely on gates only getting cheaper.
export const HATS: readonly HatDef[] = Object.freeze([
  hat('party', 'Party Hat', { level: 2 }),
  hat('beanie', 'Beanie', { anyOf: ['streak-3'] }),
  hat('headphones', 'Headphones', { anyOf: ['hundred-club'] }),
  hat('sunglasses', 'Sunglasses', { anyOf: ['speedrun'] }),
  hat('tophat', 'Top Hat', { anyOf: ['polite'] }),
  hat('hardhat', 'Hard Hat', { anyOf: ['terraformer', 'test-pilot'] }),
  hat('propeller', 'Propeller Cap', { anyOf: ['combo-25'] }),
  hat('wizard', 'Wizard Hat', { level: 10, anyOf: ['polyglot'] }),
  hat('halo', 'Halo', { allOf: ['clean-sweep', 'streak-7'] }),
  hat('crown', 'Crown', { level: 25, anyOf: ['streak-30'] }),
  hat('pumpkin', 'Pumpkin', { month: 10, keep: 'trick-or-commit' }),
  hat('santa', 'Santa Hat', { month: 12, keep: 'holiday-coder' }),
  hat('cap', 'Backwards Cap', { level: 7 }),
  hat('chef', "Chef's Toque", { level: 13 }),
  hat('beret', 'Beret', { level: 17 }),
  hat('viking', 'Viking Helmet', { level: 20 }),
  hat('cowboy', 'Cowboy Hat', { level: 28 }),
  hat('captain', "Captain's Cap", { level: 33 }),
  hat('pirate', 'Pirate Tricorne', { level: 38 }),
  hat('ninja', 'Ninja Headband', { level: 43 }),
  hat('laurel', 'Golden Laurel', { level: 50 }),
  hat('kabuto', 'Samurai Kabuto', { level: 55 }),
  hat('knight', "Knight's Plumed Helm", { level: 60 }),
  hat('jester', 'Jester Hat', { level: 65 }),
  hat('archmage', 'Archmage Hat', { level: 70 }),
  hat('astronaut', 'Space Helmet', { level: 75 }),
  hat('ufo', 'UFO Hat', { level: 80 }),
  hat('dragonhorns', 'Dragon Horns', { level: 85 }),
  hat('phoenix', 'Phoenix Crest', { level: 90 }),
  hat('starcrown', 'Starlight Crown', { level: 100 }),
  hat('graduation', 'Mortarboard', { anyOf: ['librarian'] }),
  hat('deerstalker', 'Deerstalker', { anyOf: ['sherlock'] }),
  hat('miner', "Miner's Helmet", { anyOf: ['cartographer'] }),
  hat('nightcap', 'Nightcap', { anyOf: ['round-the-clock'] }),
  hat('firefighter', 'Fire Helmet', { anyOf: ['fail-forward'] }),
  hat('flower', 'Flower Crown', { anyOf: ['streak-14'] }),
  hat('unicorn', 'Unicorn Horn', { anyOf: ['combo-100'] }),
  hat('divemask', 'Dive Mask', { anyOf: ['deep-work'] }),
  hat('bandana', 'Bandana', { anyOf: ['sweep-10'] }),
  hat('tinfoil', 'Tinfoil Hat', { anyOf: ['my-machine'] }),
  hat('teapot', 'Teapot', { anyOf: ['teapot'] }),
  hat('catears', 'Cat Ears', { anyOf: ['meow'] }),
  hat('boppers', 'Heart Boppers', { month: 2, keep: 'valentine' }),
  hat('bunny', 'Bunny Ears', { month: 4, keep: 'april-fools' }),
])

const monthOf = (now: number) => new Date(Number.isFinite(now) ? now : 0).getMonth() + 1

// True when ANY present clause holds; an unlock without clauses is always open.
export function isOpen(unlock: Unlock, profile: Profile, now: number): boolean {
  let any = false
  if (unlock.level !== undefined) {
    any = true
    if (levelOf(profile.xp).level >= unlock.level) return true
  }
  if (unlock.anyOf !== undefined) {
    any = true
    if (unlock.anyOf.some(id => has(profile, id))) return true
  }
  if (unlock.allOf !== undefined) {
    any = true
    if (unlock.allOf.every(id => has(profile, id))) return true
  }
  if (unlock.month !== undefined) {
    any = true
    if (monthOf(now) === unlock.month) return true
  }
  if (unlock.keep !== undefined) {
    any = true
    if (has(profile, unlock.keep)) return true
  }
  return !any
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December']

// A trophy's display name, or null for a hidden trophy the profile does not hold (it stays a secret).
function trophyName(id: string, profile?: Profile): string | null {
  const a = BY_ID.get(id)
  if (!a) return id
  if (a.hidden && !(profile && has(profile, id))) return null
  return a.name
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

// How to get it, in one line: 'Reach Lv 13', 'Reach Lv 10 or trophy: Polyglot', 'Trophy: Terraformer or Test Pilot',
// 'Trophies: Clean Sweep + Seven Days Strong', 'Seasonal: any day in October (Trick or Commit keeps it)',
// 'A secret trophy'. Hidden trophies are only named once the profile holds them.
export function requirementText(unlock: Unlock, profile?: Profile): string {
  const parts: string[] = []
  if (unlock.level !== undefined) parts.push(`Reach Lv ${unlock.level}`)
  if (unlock.anyOf && unlock.anyOf.length > 0) {
    const names = unlock.anyOf.map(id => trophyName(id, profile))
    const known = names.filter((n): n is string => n !== null)
    if (known.length === 0) parts.push('A secret trophy')
    else parts.push(`Trophy: ${[...known, ...(known.length < names.length ? ['a secret trophy'] : [])].join(' or ')}`)
  }
  if (unlock.allOf && unlock.allOf.length > 0) {
    const names = unlock.allOf.map(id => trophyName(id, profile) ?? 'a secret trophy')
    parts.push(`${names.length === 1 ? 'Trophy' : 'Trophies'}: ${names.join(' + ')}`)
  }
  if (unlock.month !== undefined) {
    const month = MONTHS[unlock.month - 1] ?? `month ${unlock.month}`
    let s = `Seasonal: any day in ${month}`
    if (unlock.keep !== undefined) {
      const name = trophyName(unlock.keep, profile)
      s += name === null ? ' (a secret trophy keeps it)' : ` (${name} keeps it)`
    }
    parts.push(s)
  } else if (unlock.keep !== undefined) {
    const name = trophyName(unlock.keep, profile)
    parts.push(name === null ? 'A secret trophy' : `Trophy: ${name}`)
  }
  if (parts.length === 0) return 'Always available'
  return parts.map((s, i) => (i === 0 ? s : lowerFirst(s))).join(' or ')
}

export function availableHats(profile: Profile, now: number): HatId[] {
  return HATS.filter(h => isOpen(h.unlock, profile, now)).map(h => h.id)
}

const NON_SEASONAL = HATS.filter(h => h.kind !== 'seasonal')

// The time an event's unlocks are compared against: the previous active (quest) day when this event rolls the day
// over, so a seasonal item that opens with a new month is news; `now` within a day; null for a brand-new player
// (no previous day, every seasonal item open today is news). Used for hats here and for decor in register.
export function prevActiveNow(before: Profile, now: number): number | null {
  const day = before.quests.day
  if (day === '') return null
  return dayOf(now) > day ? parseDay(day)?.getTime() ?? now : now
}

// ---------- streaks ----------

// The streak that is still alive today: its count when the last active day is today (or a later day after the
// clock went back) or the streak can still continue today; 0 once it lapsed.
export function effectiveStreak(profile: Profile, now: number): number {
  const { count: n, lastDay } = profile.streak
  if (!(n > 0) || !lastDay) return 0
  const today = dayOf(now)
  const gap = daysBetween(lastDay, today)
  if (!Number.isFinite(gap)) return 0
  return gap <= 0 || continues(lastDay, today) ? n : 0
}

export function streakLabel(profile: Profile, now: number): string {
  const today = dayOf(now)
  const { count: n, lastDay } = profile.streak
  const gap = lastDay ? daysBetween(lastDay, today) : Infinity
  if (n > 0 && Number.isFinite(gap) && gap <= 0) return n === 1 ? 'Day 1 of a new streak' : `${n}-day streak`
  if (n > 0 && lastDay && continues(lastDay, today)) {
    const d = parseDay(today)
    if (d && isWeekend(d)) return `Back Monday to keep your ${n}-day streak`
    return `${n}-day streak, keep it alive today`
  }
  return 'No streak yet, start one today'
}

// ---------- profile creation / migration ----------

const TOTAL_KEYS = ['tools', 'edits', 'reads', 'runs', 'searches', 'web', 'errors', 'turns',
  'gitCommands', 'tfEdits', 'tests', 'agents', 'days', 'bosses', 'campaigns'] as const
const HAT_IDS: ReadonlySet<string> = new Set(HATS.map(h => h.id))
const FRESH_MAX = 60

export const PROFILE_VERSION = 2

// A save written by a newer clawd-quest: shown as far as we understand it, never overwritten.
export function isNewerProfile(raw: unknown): boolean {
  return isObj(raw) && typeof raw.version === 'number' && raw.version > PROFILE_VERSION
}

export function newProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    xp: 0,
    totals: {
      tools: 0, edits: 0, reads: 0, runs: 0, searches: 0, web: 0, errors: 0, turns: 0, gitCommands: 0, tfEdits: 0,
      tests: 0, agents: 0, days: 0, quests: 0, bosses: 0, campaigns: 0,
    },
    fileTypes: [],
    projects: [],
    achievements: {},
    streak: { count: 0, lastDay: '' },
    quests: { day: '', items: [] },
    hat: null,
    bestCombo: 0,
    sweepClaimed: '',
    fresh: [],
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback)
const strList = (v: unknown, max = 200) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120))].slice(0, max) : []
const dayStr = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
const isFreshKey = (k: unknown): k is string =>
  typeof k === 'string' && k.length <= 120 && (/^hat:[a-z0-9-]+$/.test(k) || /^decor:[a-z]+:[a-z0-9-]+$/.test(k))

function migrateQuest(v: unknown): Quest | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.title !== 'string') return null
  const goal = Math.max(1, num(v.goal, 1))
  const progress = Math.min(goal, num(v.progress))
  return { id: v.id, title: v.title, goal, progress, xp: num(v.xp), done: v.done === true }
}

export function migrateProfile(raw: unknown): Profile {
  let src: unknown = raw
  if (typeof src === 'string') {
    try { src = JSON.parse(src) } catch { src = null }
  }
  const p = newProfile()
  if (!isObj(src)) return p
  p.xp = num(src.xp)
  p.sweeps = num(src.sweeps)
  const totals = isObj(src.totals) ? src.totals : {}
  for (const k of TOTAL_KEYS) p.totals[k] = num(totals[k])
  // daily quests were not counted before 1.0: three per Daily Sweep is an honest lower bound
  p.totals.quests = typeof totals.quests === 'number' ? num(totals.quests) : 3 * p.sweeps
  p.fileTypes = [...new Set(strList(src.fileTypes).map(normExt).filter((s): s is string => s !== null))]
  p.projects = strList(src.projects)
  // unknown ids are kept (a newer or older version may know them); counts use unlockedCount()
  if (isObj(src.achievements)) {
    for (const [k, v] of Object.entries(src.achievements)) {
      if (typeof v === 'number' && Number.isFinite(v)) p.achievements[k] = v
      else if (v === true) p.achievements[k] = 0 // older shape: id -> true
    }
  } else if (Array.isArray(src.achievements)) {
    for (const k of src.achievements) if (typeof k === 'string') p.achievements[k] = 0 // older shape: id list
  }
  if (isObj(src.streak)) p.streak = { count: num(src.streak.count), lastDay: dayStr(src.streak.lastDay) }
  // the stored day as it was saved, before retired quest kinds are replaced (the legacy sweep check below)
  let storedSwept = ''
  if (isObj(src.quests) && Array.isArray(src.quests.items)) {
    const day = dayStr(src.quests.day)
    // A stored quest whose kind is gone (petting, tests, git, ...) could never finish: today's draw fills its place.
    const known = (q: Quest | null): q is Quest => q !== null && TEMPLATE_BY_ID.has(q.id.split(':')[0] ?? '')
    const all = src.quests.items.map(migrateQuest).filter((q): q is Quest => q !== null)
    const items = all.filter(known)
    if (day && all.length >= 3 && all.every(q => q.done)) storedSwept = day
    if (day && items.length < all.length) {
      for (const q of questsForDay(day)) if (items.length < 3 && !items.some(i => i.id === q.id)) items.push(q)
    }
    p.quests = day ? { day, items } : { day: '', items: [] }
  }
  p.hat = typeof src.hat === 'string' && HAT_IDS.has(src.hat) ? (src.hat as HatId) : null
  p.bestCombo = num(src.bestCombo)
  // older saves stored {day, exts}: only the day survives
  if (isObj(src.daily) && dayStr(src.daily.day)) p.daily = { day: dayStr(src.daily.day), tools: num(src.daily.tools) }
  // A save from before the claim button got its sweep paid on the spot: that day counts as claimed. Judged on the
  // stored list, since a retired quest's replacement starts undone and would let the same day sweep twice.
  p.sweepClaimed = typeof src.sweepClaimed === 'string' ? dayStr(src.sweepClaimed) : storedSwept
  if (Array.isArray(src.recent)) {
    p.recent = src.recent
      .filter((r): r is Record<string, unknown> => isObj(r) && typeof r.verb === 'string' && typeof r.what === 'string')
      .map(r => ({ verb: String(r.verb), what: String(r.what), at: num(r.at) }))
      .slice(-RECENT_SIZE)
  }
  if (Array.isArray(src.fresh)) p.fresh = [...new Set(src.fresh.filter(isFreshKey))].slice(-FRESH_MAX)
  // xp is never changed: an older save simply reads its level off the current curve
  return p
}

function clone(p: Profile): Profile {
  const out: Profile = {
    ...p,
    totals: { ...p.totals },
    fileTypes: [...p.fileTypes],
    projects: [...p.projects],
    achievements: { ...p.achievements },
    streak: { ...p.streak },
    quests: { day: p.quests.day, items: p.quests.items.map(q => ({ ...q })) },
  }
  if (p.daily) out.daily = { day: p.daily.day, tools: p.daily.tools }
  if (p.recent) out.recent = p.recent.map(r => ({ ...r }))
  if (p.fresh) out.fresh = [...p.fresh]
  return out
}

// ---------- the core ----------

// `tools` and `errors` are the running totals after this call; they spread the half-point
// (light tools) and third-point (errors) rewards deterministically.
function toolXp(activity: Activity, isError: boolean, combo: number, tools: number, errors: number): number {
  if (isError) return errors % 3 === 1 ? XP.error : 0
  let xp = activity === 'agent' ? XP.agent
    : EDITS.has(activity) || activity === 'test' || activity === 'terraform' ? XP.craft
    : tools % 2 === 0 ? XP.light : 0
  if (combo > 0 && combo % XP.comboEvery === 0) xp += Math.min(combo / XP.comboEvery, XP.comboMaxBonus)
  return xp
}

function timeInfo(now: number): TimeInfo {
  const d = new Date(now)
  return { hour: d.getHours(), weekday: d.getDay(), month: d.getMonth() + 1, date: d.getDate() }
}

export function applyEvent(profile: Profile, event: GameEvent, ext?: GameExt): GameResult {
  const before = profile
  const p = clone(profile)
  const now = Number.isFinite(event.now) ? event.now : 0
  const today = dayOf(now)
  let xp = 0
  let gapDays: number | null = null

  // day rollover: fresh quests and per-day counters, only moving forward (a clock set back keeps today's state)
  const prevQuestDay = p.quests.day
  const rolled = prevQuestDay === '' || today > prevQuestDay
  if (rolled) p.quests = { day: today, items: questsForDay(today) }
  if (!p.daily || p.daily.day === '' || today > p.daily.day) p.daily = { day: today, tools: 0 }
  const daily = p.daily

  // streak + daily bonus on the first real activity of a day (a prompt or a tool call;
  // opening a session, bonus xp and a claim do not count). An earlier day than the last one counts as the same day.
  const ev = event
  if ((ev.type === 'prompt' || ev.type === 'tool') && p.streak.lastDay !== today) {
    const last = p.streak.lastDay
    const n = last ? daysBetween(last, today) : Infinity
    if (!(last && n < 0)) {
      if (last && Number.isFinite(n)) gapDays = n
      p.streak = { count: last && continues(last, today) ? p.streak.count + 1 : 1, lastDay: today }
      p.totals.days++
      xp += XP.dailyBase + XP.dailyPerStreakDay * Math.min(p.streak.count - 1, XP.dailyStreakCap)
    }
  }

  switch (ev.type) {
    case 'bonus':
      xp += count0(ev.xp)
      p.totals.quests += count0(ev.quests)
      p.totals.bosses += count0(ev.bosses)
      p.totals.campaigns += count0(ev.campaigns)
      break
    case 'claim':
      // the Daily Sweep bonus, once, only on the day its quests were done (the rollover above expired it)
      if (sweepClaimable(p, now)) {
        xp += XP.sweep
        p.sweepClaimed = today
      }
      break
    case 'session': {
      const name = ev.project.trim().slice(0, 120)
      if (name && !p.projects.includes(name)) p.projects.push(name)
      break
    }
    case 'prompt':
      break
    case 'tool': {
      const t = p.totals
      const ext = normExt(ev.ext)
      t.tools++
      daily.tools++
      if (ev.isError) {
        t.errors++
      } else {
        const a = ev.activity
        if (EDITS.has(a)) {
          t.edits++
          if (ext && !p.fileTypes.includes(ext)) p.fileTypes.push(ext)
        }
        if (a === 'read') t.reads++
        if (a === 'search') t.searches++
        if (a === 'web') t.web++
        if (RUNS.has(a)) t.runs++
        if (a === 'git') t.gitCommands++
        if (a === 'test') t.tests++
        if (a === 'agent') t.agents++
        if (isTf(a, ext)) t.tfEdits++
        p.bestCombo = Math.max(p.bestCombo, count0(ev.combo))
      }
      xp += toolXp(ev.activity, ev.isError, count0(ev.combo), t.tools, t.errors)
      break
    }
    case 'turn':
      p.totals.turns++
      xp += XP.turn
      if (ev.toolCount > 0 && ev.errorCount === 0) xp += XP.cleanTurn
      break
  }

  // quests
  const completedQuests: Quest[] = []
  for (const q of p.quests.items) {
    if (q.done || ev.type === 'bonus' || ev.type === 'claim') continue
    const [tid, param] = q.id.split(':')
    const tpl = TEMPLATE_BY_ID.get(tid ?? '')
    if (!tpl) continue
    const r = tpl.track({ event, daily }, q, Number(param) || 0)
    if (!r) continue
    const next = r.set !== undefined ? Math.max(q.progress, r.set) : q.progress + (r.add ?? 0)
    q.progress = Math.min(q.goal, next)
    if (q.progress >= q.goal) {
      q.done = true
      xp += q.xp
      p.totals.quests++
      completedQuests.push({ ...q })
    }
  }
  // Daily Sweep: the event that finishes the last daily quest counts the sweep (so a trophy built on it
  // never hangs on a click); its bonus waits for the claim button until midnight
  if (completedQuests.length > 0 && p.sweepClaimed !== p.quests.day && p.quests.items.length >= 3 && p.quests.items.every(q => q.done)) {
    p.sweeps = (p.sweeps ?? 0) + 1
  }

  // achievements (looped: their xp may unlock a level trophy, a level may open hats for Fashionista, ...)
  const time = timeInfo(now)
  const unlocked: AchievementDef[] = []
  p.xp = before.xp + xp
  for (let round = 0; round < 6; round++) {
    const lv = levelOf(p.xp)
    const ctx: CheckCtx = { event, time, level: lv.level, stars: lv.stars, gapDays, now }
    if (ext) ctx.ext = ext
    let found = false
    for (const a of LIST) {
      if (p.achievements[a.id] !== undefined) continue
      if (!a.check(p, ctx)) continue
      p.achievements[a.id] = now
      p.xp += XP.achievement[a.tier]
      xp += XP.achievement[a.tier]
      unlocked.push(defOf(a))
      found = true
    }
    if (!found) break
  }

  // hats: compare with what was available the previous active day, so seasonal hats get announced too.
  // A brand-new player had no previous day: every seasonal hat open today is news.
  const prevNow = prevActiveNow(before, now)
  const had = new Set(prevNow === null
    ? NON_SEASONAL.filter(h => isOpen(h.unlock, before, now)).map(h => h.id)
    : availableHats(before, prevNow))
  const avail = availableHats(p, now)
  const unlockedHats = avail.filter(h => !had.has(h))
  if (p.hat && !avail.includes(p.hat)) p.hat = null // a seasonal hat went out of season

  const oldLv = levelOf(before.xp)
  const newLv = levelOf(p.xp)
  const levelUp = newLv.level !== oldLv.level ? newLv.level : null
  const titleUp = newLv.level > oldLv.level && titleOf(newLv.level) !== titleOf(oldLv.level) ? titleOf(newLv.level) : null
  const starUp = newLv.stars > oldLv.stars ? newLv.stars : null
  return { profile: p, xpGained: xp, unlocked, levelUp, starUp, titleUp, completedQuests, unlockedHats }
}

// ---------- small UI helpers ----------

// The daily quests to show at `now`: past midnight the stored list is yesterday's until the next event rolls it,
// so a later day shows the draw that event will store (the same forward-only rule as applyEvent).
export function dailyQuests(profile: Profile, now: number): Quest[] {
  const today = dayOf(now)
  return profile.quests.day === '' || today > profile.quests.day ? questsForDay(today) : profile.quests.items
}

// True when every daily quest of today is done (the Daily Sweep was earned, claimed or not).
export function sweptToday(profile: Profile, now: number): boolean {
  return profile.quests.day === dayOf(now) && profile.quests.items.length >= 3 && profile.quests.items.every(q => q.done)
}

// True while today's Daily Sweep bonus waits for its claim; it expires at midnight.
export function sweepClaimable(profile: Profile, now: number): boolean {
  return sweptToday(profile, now) && profile.sweepClaimed !== dayOf(now)
}

// How many Daily Sweeps the profile has collected.
export function sweepsOf(profile: Profile): number {
  return profile.sweeps ?? 0
}

export function equipHat(profile: Profile, hat: HatId | null, now: number): Profile {
  if (hat !== null && !availableHats(profile, now).includes(hat)) return profile
  return { ...clone(profile), hat }
}

// Marks unlocks as not seen yet ('hat:<id>' | 'decor:<slot>:<id>'): deduplicated, newest last, at most 60.
export function addFresh(profile: Profile, keys: readonly string[]): Profile {
  const add = [...new Set(keys.filter(isFreshKey))]
  if (add.length === 0) return profile
  const old = profile.fresh ?? []
  const fresh = [...old.filter(k => !add.includes(k)), ...add].slice(-FRESH_MAX)
  if (fresh.length === old.length && fresh.every((k, i) => k === old[i])) return profile
  return { ...clone(profile), fresh }
}

// Clears the 'new' markers of one kind (opening the Wardrobe or Decor tab).
export function markSeen(profile: Profile, prefix: 'hat:' | 'decor:'): Profile {
  const old = profile.fresh ?? []
  const fresh = old.filter(k => !k.startsWith(prefix))
  if (fresh.length === old.length) return profile
  return { ...clone(profile), fresh }
}
