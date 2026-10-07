// Shared contract for the clawd-quest mod. scene.ts, game.ts, quips.ts and register.tsx all build on it.

export type Mood =
  | 'idle' | 'thinking' | 'coding' | 'reading' | 'running' | 'working' | 'done' | 'error'
  | 'sleeping' // idle for a long while: Clawd naps, Zzz
  | 'happy'    // celebrating or praised: hearts

// Finer than Mood: what exactly Clawd is doing, so the room can show a matching prop.
export type Activity =
  | 'none' | 'edit' | 'write' | 'read' | 'search' | 'web' | 'shell' | 'git' | 'terraform' | 'test' | 'agent' | 'skill'

// Where Clawd is and what he does, derived from Mood + Activity (scene.ts stationOf). Mood names double
// as stations: coding = Edit typing, reading = Read with a book, running = Bash at the terminal, working = errand.
export type Station = Mood | 'write' | 'scan' | 'web' | 'test' | 'git' | 'crane' | 'agent' | 'skill'

export type HatId =
  | 'party' | 'crown' | 'wizard' | 'headphones' | 'sunglasses' | 'hardhat' | 'santa'
  | 'pumpkin' | 'beanie' | 'tophat' | 'halo' | 'propeller'
  | 'cap' | 'chef' | 'beret' | 'viking' | 'cowboy' | 'captain' | 'pirate' | 'ninja' | 'laurel'
  | 'kabuto' | 'knight' | 'jester' | 'archmage' | 'astronaut' | 'ufo' | 'dragonhorns' | 'phoenix' | 'starcrown'
  | 'graduation' | 'deerstalker' | 'miner' | 'nightcap' | 'firefighter' | 'flower' | 'unicorn'
  | 'divemask' | 'bandana' | 'tinfoil' | 'teapot' | 'catears'
  | 'boppers' | 'bunny'

// A hat Claude designed for a project: pixel rows over a palette, '.' = empty, last row sits on the head.
export type CustomHat = { id: string; name: string; rows: string[]; palette: Record<string, string> }

export type AnyHat = HatId | CustomHat | null

// Swappable room decor: one variant id per slot (see hooks/decor.ts for the catalog).
export type DecorSlot =
  | 'drink' | 'plant' | 'poster' | 'rug' | 'shelf' | 'companion'
  | 'bed' | 'lamp' | 'clock' | 'ceiling' | 'wall' | 'view'
export type DecorChoice = Partial<Record<DecorSlot, string>>

// The window's light, derived from the local hour.
export type DayPhase = 'night' | 'morning' | 'day' | 'sunset'

// When a hat or decor piece is available: true when ANY present clause holds; no clause = always.
export type Unlock = {
  level?: number    // reached this level
  anyOf?: string[]  // holds any of these trophy ids
  allOf?: string[]  // holds all of these trophy ids
  month?: number    // 1..12: available any day of this month ...
  keep?: string     // ... and for good once this trophy is held
}

// A short overlay in the room after a milestone level, level 100 or an Encore star.
export type Celebration = 'milestone' | 'legend' | 'star'

// Usage meters in the room (hooks/meterArt.ts). Raw percentages 0..100; the scene draws them in 5% steps.
export type MeterWindow = { pct?: number; resets?: string } // resets: a local label 'at HH:MM' | 'Ddd HH:MM'
export type SceneUsage = {
  context?: { pct?: number; window: number } // pct absent: no reading yet (new session or just compacted)
  fiveHour?: MeterWindow
  sevenDay?: MeterWindow
  compactions?: number                         // this session; >= 1 draws the archive box
  from?: { context?: number; fiveHour?: number; sevenDay?: number } // previous 5% steps (-1 = no reading); the change animates once
}

// Everything the room drawing needs. Pure data; scene.ts turns it into one SVG string.
export type SceneInput = {
  mood: Mood
  activity: Activity
  hat: AnyHat
  hour: number        // 0..23 local time: drives the window (day, sunset, night)
  minute?: number     // 0..59 local time: sets the wall clock's hands
  month: number       // 1..12: seasonal decoration (October pumpkins, December snow)
  day?: number        // 1..31: today's date on the wall calendar
  helpers: number     // subagents running right now, 0..3 drawn as mini Clawds
  combo: number       // successful tool calls in a row, 0 = none; >= 5 shows a flame
  trophies: number    // achievements unlocked: fills the trophy shelf
  plantStage: number  // 0..4, grows with total turns ever
  level: number       // player level; may unlock small room upgrades
  coffee: number      // 0..3 cups left in the mug; refills on 'done'
  decor?: DecorChoice // chosen variants; a missing slot shows the level-based default
  fromX?: number      // where Clawd stood in the previous scene: he walks over from there
  fromY?: number      // how high he stood there (on the stool, in bed): he hops up or down
  fromMood?: Mood     // the previous scene's mood: its overhead fades out, the new pose settles in
  fromActivity?: Activity // the previous scene's activity: its props fade out as the new ones fade in
  usage?: SceneUsage  // context, rate limits and compactions; a meter without data is not drawn
  celebrate?: Celebration // a short overlay after a milestone level, level 100 or an Encore star
}

// ---------- persistent game profile (in $.store, across sessions) ----------

export type Quest = {
  id: string
  title: string       // short, e.g. 'Edit 5 files'
  goal: number
  progress: number
  xp: number
  done: boolean
}

export type Profile = {
  version: 2
  xp: number
  totals: {
    tools: number; edits: number; reads: number; runs: number; searches: number; web: number
    errors: number; turns: number; gitCommands: number; tfEdits: number; tests: number; agents: number
    days: number      // distinct days with a prompt or tool call
    quests: number    // quests completed: daily ones plus finished /quests ones (bonus events)
    bosses: number    // /quests bosses defeated
    campaigns: number // /quests campaigns completed
  }
  fileTypes: string[]          // extensions ever edited, e.g. ['tf', 'ts']
  projects: string[]           // folder names seen
  achievements: Record<string, number> // id -> unlocked at (ms epoch)
  streak: { count: number; lastDay: string } // lastDay 'YYYY-MM-DD' local
  quests: { day: string; items: Quest[] }
  hat: HatId | null
  bestCombo: number
  daily?: { day: string; tools: number } // tool events today (the combo quest counts only today's combo)
  sweeps?: number                         // Daily Sweeps earned
  recent?: RecentEntry[]                  // newest last, at most RECENT_SIZE (8)
  sweepClaimed?: string        // 'YYYY-MM-DD' the Daily Sweep bonus was last claimed; '' = never (absent only on old saves)
  fresh?: string[]                        // unlocks not yet seen: 'hat:<id>' | 'decor:<slot>:<id>', at most 60
}

export type GameEvent =
  | { type: 'session'; project: string; now: number }
  | { type: 'prompt'; text: string; now: number }
  | { type: 'tool'; tool: string; activity: Activity; isError: boolean; ext: string | null; combo: number; now: number }
  | { type: 'turn'; durationMs: number; toolCount: number; errorCount: number; now: number } // durationMs 0 = unknown
  // xp from outside the game rules (project quests); no streak or daily work. The counters add to totals.
  | { type: 'bonus'; xp: number; now: number; quests?: number; bosses?: number; campaigns?: number }
  | { type: 'claim'; now: number } // the Quests tab's claim button: pays today's Daily Sweep bonus once; no streak or daily work

export type AchievementDef = { id: string; name: string; description: string; hidden?: boolean }

export type GameResult = {
  profile: Profile
  xpGained: number
  unlocked: AchievementDef[]
  levelUp: number | null       // new level when it changed
  starUp: number | null        // new Encore star count when it rose
  titleUp: string | null       // new title when the level crossed a title band
  completedQuests: Quest[]
  unlockedHats: HatId[]        // hats that became available with this event
}

// ---------- project quests (generated by /quests, stored per project) ----------

// Old stored boards counted tool kinds; they are only read to migrate them (see migrateItem).
export type LegacyKind = 'edit' | 'read' | 'search' | 'run' | 'test' | 'git' | 'web' | 'agent' | 'turn' | 'clean-turn'

export type QuestRole = 'warmup' | 'quest' | 'boss'
export type ProbeKind = 'fewer' | 'more-files' | 'heading' | 'words'

// How Clawd measures a quest (docs/QUEST_RULES.md). Paths are project-relative with forward slashes:
// a file, a 'dir/' prefix or an '.ext' suffix, compared case-insensitively.
export type TallyCheck = {
  type: 'tally'; activity: 'edit' | 'read' | 'search'
  path: string    // '' only on migrated legacy items (any file)
  seen: string[]  // hashes of the files already counted (distinct files), at most 50
}
export type PassCheck = {
  type: 'pass'
  tool: string    // a check id ('pytest', 'tsc', ...), 'script:<cmd>' (approved repo script) or 'any'
  fix: boolean    // only a failing run made green counts (boss)
  red: boolean; edited: boolean; tainted: boolean // since the last pass: a failing run, a clean edit, a silencing edit
  redOf?: string  // the failing command (normalized); only that same command passing is red to green
  at: number      // when the last pass counted
}
export type ProbeCheck = {
  type: 'probe'; probe: ProbeKind; path: string
  pattern: string // fewer: TODO|FIXME|XXX|HACK; more-files: name suffix; heading: heading text; words: ''
  base: number    // baseline measure; -1 = target absent at the start
  baseFiles: Record<string, number> // fewer: per-file counts at the start (path hash -> count), at most 60
  at: number      // last read; -1 = baseline still to take
}
export type QuestCheck = TallyCheck | PassCheck | ProbeCheck

export type ProjectQuest = Quest & {
  role: QuestRole
  check: QuestCheck
  why: string   // one short line: why this matters for the project
}

export type ProjectQuestBoard = {
  project: string
  campaign: string // a short fun name for this set of quests
  createdAt: number
  items: ProjectQuest[]
  isComplete: boolean
  milestones: ProjectMilestone[]
  hats: ProjectHat[]
  approved: string[] // repo scripts the person allowed as checks (/quests allow <cmd>)
  swapUsed?: boolean                    // the one quest swap of this campaign is spent
  paid?: { day: string; count: number } // campaign bonuses paid today (max 2)
  history?: string[]                    // signatures of done quests kept across /quests clear (max 30)
}

// A big, cumulative project goal: becomes a project trophy and may unlock a project hat.
export type ProjectMilestone = {
  id: string
  name: string        // trophy name
  description: string // what it takes, human readable
  check: QuestCheck   // pass or probe for new milestones; migrated ones may be tally
  goal: number
  progress: number
  xp: number
  done: boolean
  unlockedAt: number | null
}

export type ProjectHat = CustomHat & { milestoneId: string }

export type QuestGen = { status: 'idle' | 'working' | 'error'; message: string; startedAt?: number } // a 'working' older than 240 s is stale

// ---------- session-scoped UI state ($.state) ----------

export type PetState = { mood: Mood; activity: Activity; detail: string; quip: string }

export type SessionStats = { tools: number; edits: number; reads: number; runs: number; errors: number; turns: number; xp: number }

export type LogEntry = { verb: string; what: string; isError: boolean }
// One thing earned, for the Room's Recent list: a quest done, a trophy, a level, a hat, a piece of decor.
export type RecentEntry = { verb: string; what: string; at: number }

// What the room shows right now. It trails the real mood with a minimum dwell, so quick
// runs of tools do not flash through scenes.
export type SceneShow = {
  mood: Mood
  activity: Activity
  fromX: number | null           // where Clawd really stood when the scene changed (null: first scene)
  fromY?: number | null
  fromMood?: Mood | null
  fromActivity?: Activity | null
  at: number
}

// Engine-side usage (session.measure), session scoped; the limits are also kept globally in $.store 'limits'.
export type UsageLimit = { pct: number; resetsAt?: string } // ISO, as the engine sent it
export type UsageWarned = { context?: boolean; fiveHour?: string; sevenDay?: string } // fiveHour/sevenDay: resetsAt of the window already warned about
export type UsageState = {
  context: { pct: number | null; window: number } | null
  fiveHour: UsageLimit | null
  sevenDay: UsageLimit | null
  costUsd: number | null
  compactions: number
  from: { context?: number; fiveHour?: number; sevenDay?: number }
  at: number // ms when a drawn step last changed: the meter clock
  warned: UsageWarned
}

export type Tab = 'room' | 'quests' | 'trophies' | 'wardrobe' | 'decor'

declare module 'claude-code' {
  interface PluginState {
    'clawd-quest': {
      pet: PetState
      isHidden: boolean
      frame: number
      stats: SessionStats
      log: LogEntry[]
      profile: Profile | null
      tab: Tab
      combo: number
      helpers: number
      coffee: number
      board: ProjectQuestBoard | null
      questGen: QuestGen
      customHat: CustomHat | null
      decor: DecorChoice
      scene: SceneShow
      hat: HatId | null          // the worn catalog hat, mirrored from the profile for the spinner
      recentPrompts: string[]    // the person's last prompts, for /quests
      expandTrophies: boolean    // Trophies tab: show every locked trophy
      usage: UsageState          // last session.measure figures for the room's meters
      celebrate: { kind: Celebration; until: number } | null // room overlay after a milestone, level 100 or a star
      expandLocked: string[]     // expanded locked lists: 'wardrobe' | 'decor:<slot>'
      swapArmed: string          // Quests tab: the project quest whose Swap waits for a second press ('' none)
    }
  }
}
