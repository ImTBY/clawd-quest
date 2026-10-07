import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type {
  SceneShow,
  Activity, AnyHat, Celebration, CustomHat, DecorChoice, DecorSlot, GameEvent, GameResult, HatId, LogEntry, Mood, PetState, Profile,
  ProjectQuest, ProjectQuestBoard, Quest, QuestGen, SceneInput, SessionStats, Tab, Unlock,
} from '../types'
import {
  achievementProgress, ACHIEVEMENTS, achievementXp, addFresh, applyEvent, availableHats, dailyQuests, effectiveStreak, equipHat, HATS, isNewerProfile, isOpen, levelOf,
  markSeen, migrateProfile, MILESTONE_LEVELS, newProfile, prevActiveNow, RECENT_SIZE, requirementText, sweepClaimable, sweepsOf, titleOf, unlockedCount, XP,
  type GameExt,
} from './game'
import {
  achievementQuip, campaignDoneQuip, doneBeat, levelUpQuip, pickQuip, promptReaction, questDoneQuip, spinnerVerb, starQuip,
  tagsFromCommand, tagsFromEntries, tagsFromPath, usageQuip, type UsageNote,
} from './quips'
import { compactLimit, compactUsage, measureUsage, migrateLimits, sceneUsage, seedUsage, USAGE_START, usageAlt, usageNote } from './usage'
import {
  applyProbes, buildBoard, buildPrompt, canRegenerate, checkHint, clearBoard, emptyBoard, isIgnored, isOffLimits, matchesPath, MAX_MILESTONES, mergeBoard, mergeParsed,
  migrateBoard, onTool, parseCandidates, PROBE_FILES, probesDue, READ_MAX, projectKeys, rejections, repairPrompt, scriptCommand, storeKey, swapQuest, SYSTEM,
  tallyTargets, templates, unlockedProjectHats, validateCandidate,
} from './projectQuests'
import { sanitizeHat, sanitizeWornHat } from './customHat'
import {
  DECOR, decorOwnedCount, decorTotal, freshKey, isUnlocked, migrateDecor, newlyUnlocked, nextUnlock, requirementOf, resolveDecor, SLOTS, unlocksBetween,
  type DecorItem, type Unlockable,
} from './decor'
import type { ProbeDue, ProbeFile, ProbeRead, Progress, ProjectKeys } from './projectQuests'
import { clawdAt, decorPreview, miniSvg, MIRROR_RATIO, phaseSvg, previewSize, SCENE_RATIO, sceneSvg, stationOf, type Walk } from './scene'

const PET_START: PetState = { mood: 'idle', activity: 'none', detail: '', quip: 'Ready when you are.' }

const pet = atom({ plugin: 'clawd-quest', key: 'pet' } as const, PET_START)
const isHidden = atom({ plugin: 'clawd-quest', key: 'isHidden' } as const, false)
const frame = atom({ plugin: 'clawd-quest', key: 'frame' } as const, 0)
const stats = atom({ plugin: 'clawd-quest', key: 'stats' } as const, { tools: 0, edits: 0, reads: 0, runs: 0, errors: 0, turns: 0, xp: 0 } as SessionStats)
const log = atom({ plugin: 'clawd-quest', key: 'log' } as const, [] as LogEntry[])
const profileAtom = atom({ plugin: 'clawd-quest', key: 'profile' } as const, null as Profile | null)
const tab = atom({ plugin: 'clawd-quest', key: 'tab' } as const, 'room' as Tab)
const combo = atom({ plugin: 'clawd-quest', key: 'combo' } as const, 0)
const helpers = atom({ plugin: 'clawd-quest', key: 'helpers' } as const, 0)
const coffee = atom({ plugin: 'clawd-quest', key: 'coffee' } as const, 3)
const board = atom({ plugin: 'clawd-quest', key: 'board' } as const, null as ProjectQuestBoard | null)
const customHat = atom({ plugin: 'clawd-quest', key: 'customHat' } as const, null as CustomHat | null)
const decor = atom({ plugin: 'clawd-quest', key: 'decor' } as const, {} as DecorChoice)
const questGen = atom({ plugin: 'clawd-quest', key: 'questGen' } as const, { status: 'idle', message: '' } as QuestGen)
const hatAtom = atom({ plugin: 'clawd-quest', key: 'hat' } as const, null as HatId | null)
const recentPromptsAtom = atom({ plugin: 'clawd-quest', key: 'recentPrompts' } as const, [] as string[])
const sceneAtom = atom({ plugin: 'clawd-quest', key: 'scene' } as const, { mood: 'idle', activity: 'none', fromX: null, at: 0 } as SceneShow)
const expandTrophies = atom({ plugin: 'clawd-quest', key: 'expandTrophies' } as const, false)
const usageAtom = atom({ plugin: 'clawd-quest', key: 'usage' } as const, USAGE_START)
const celebrate = atom({ plugin: 'clawd-quest', key: 'celebrate' } as const, null as { kind: Celebration; until: number } | null)
const expandLocked = atom({ plugin: 'clawd-quest', key: 'expandLocked' } as const, [] as string[])
const swapArmed = atom({ plugin: 'clawd-quest', key: 'swapArmed' } as const, '')

const PANE = 'clawd-quest'
// LEGACY global keys from before progress was per project: read once for adoption, never written or deleted.
const STORE_KEY = 'profile'
const HAT_KEY = 'customHat'
const DECOR_KEY = 'decor'
const CLAIM_KEY = 'legacyClaim' // { by: projectId, at } once a project adopted the old global save
const LIMITS_KEY = 'limits'     // account-wide rate limits + warned markers (global: no paths, no project)
const HIDDEN_KEY = 'paneHidden' // global: the person closed the pane (true) or opened it again (false)
const REAL_SCRATCH_KEY = 'scratchFolders' // global: ids of real folders named 'scratch' (never adopted, never pruned)
const SCRATCH = 'scratch'
const ORANGE = '#D97757'
const RED = '#C8553D'
const GREEN = '#8FB07A'
const GOLD = '#E2B84A'
const LOG_SIZE = 5
const SLEEP_AFTER_MS = 3 * 60 * 1000
const FLOW_GAP_MS = 120_000      // a pause this long ends the combo
const QUIP_HOLD_MS = 4000        // keep a fresh line while the mood stays the same
const TURN_LINE_MS = 6000        // the turn's closing line stays this long
// The room trails the real mood: each scene stays up at least this long, so a quick run of
// tools reads as one calm scene instead of a flash of five.
const SCENE_DWELL_MS = 2400
const SCENE_DWELL: Partial<Record<Mood, number>> = { done: 4200, happy: 3200, error: 2800, sleeping: 4000 }
const REST_MOODS: readonly Mood[] = ['thinking', 'idle', 'sleeping']
const REST_DELAY_MS = 900        // wait this long after a tool before Clawd goes back to thinking
const VERB_HOLD_MS = 2000        // the spinner verb holds this long (under SCENE_DWELL_MS, so it never trails a scene)
const GEN_STALE_MS = 240_000     // a quest generation 'working' this long is considered dead
const GEN_TIMEOUT_MS = 90_000
const GEN_ERROR_MS = 60_000      // a generation error goes back to idle after this long
const TICK_FAST_MS = 220
const TICK_SLOW_MS = 2000        // hidden pane or a sleeping Clawd: the ticker idles
const REFRESH_MS = 4000          // catch up with other sessions in this folder
const PRUNE_AFTER_MS = 180 * 24 * 3_600_000
const RECENT_QUIPS = 12          // the last lines shown, which the next pick avoids
const TROPHY_FOLD = 3            // more trophies than this in one event fold into one toast
const EXT: GameExt = { decorOwned: decorOwnedCount }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// The room upgrade each milestone brings (drawn by scene.ts from the level).
const ROOM_UPGRADE: Record<number, string> = {
  10: 'a bronze level badge', 25: 'a gold-trimmed trophy shelf', 50: 'wainscoting on the walls', 75: 'shooting stars in the night window',
}

// ---------- what a tool call means ----------

type ToolArgs = {
  file_path?: string; notebook_path?: string; path?: string; command?: string; pattern?: string; glob?: string
  url?: string; query?: string; description?: string; skill?: string
  new_string?: string; content?: string; new_source?: string; edits?: Array<{ new_string?: string; old_string?: string }>
  old_string?: string
  run_in_background?: boolean // only ever true: the call started the work and returned before it finished
}

const STRING_ARGS = [
  'file_path', 'notebook_path', 'path', 'command', 'pattern', 'glob', 'url', 'query', 'description', 'skill', 'new_string', 'content', 'new_source', 'old_string',
] as const

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

// A tool's arguments as Clawd reads them: strings only (an MCP tool may send objects or arrays),
// `edits` only as a list of objects, their fields strings or absent.
export function normArgs(raw: unknown): ToolArgs {
  const out: ToolArgs = {}
  if (!isObj(raw)) return out
  for (const key of STRING_ARGS) {
    const v = str(raw[key])
    if (v !== undefined) out[key] = v
  }
  if (Array.isArray(raw.edits)) out.edits = raw.edits.filter(isObj).map(e => ({ new_string: str(e.new_string), old_string: str(e.old_string) }))
  if (raw.run_in_background === true) out.run_in_background = true
  return out
}

// The command a finished call ran to its end, for project-quest checks and the done cheer: only a Bash or
// PowerShell call in the foreground reports its exit status. A backgrounded run, a Monitor watcher or an MCP
// tool with a `command` argument only started something, so it is never a passing (or failing) check.
export function checkCommand(tool: string, args: ToolArgs): string {
  if (tool !== 'Bash' && tool !== 'PowerShell') return ''
  return args.run_in_background === true ? '' : args.command ?? ''
}

const TEST_RE = /\b(pytest|jest|vitest|mocha|go test|cargo test|dotnet test|mvn test|gradle test|npm (run )?test|pnpm test|yarn test|bun test|terraform test|invoke-pester|plugin test)\b/i

export function activityFor(tool: string, args: ToolArgs): Activity {
  switch (tool) {
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return 'edit'
    case 'Write': return 'write'
    case 'Read': return 'read'
    case 'Grep': case 'Glob': case 'LSP': return 'search'
    case 'WebFetch': case 'WebSearch': return 'web'
    case 'Agent': case 'Task': return 'agent'
    case 'Skill': return 'skill'
    case 'Bash': case 'PowerShell': case 'Monitor': {
      const c = args.command ?? ''
      if (TEST_RE.test(c)) return 'test'
      if (/\b(terraform|tofu|terragrunt)\b/i.test(c)) return 'terraform'
      if (/(^|&&|;|\|)\s*(git|gh)\b/i.test(c)) return 'git'
      return 'shell'
    }
    default: return 'none'
  }
}

export function moodFor(activity: Activity): Mood {
  switch (activity) {
    case 'edit': case 'write': return 'coding'
    case 'read': case 'search': case 'web': return 'reading'
    case 'shell': case 'git': case 'terraform': case 'test': return 'running'
    default: return 'working'
  }
}

// A desktop scratch chat's folder: a fresh dated name each time ('scratch-2026-10-07-7d7365'). A real folder
// that is just named 'scratch' is not one: it is an ordinary project.
export function isScratchChat(name: string): boolean {
  return /^scratch-\d{4}-\d{2}-\d{2}/.test(name)
}

// Scratch chats all count as one project.
export function normProject(name: string): string {
  return isScratchChat(name) ? SCRATCH : name
}

// The store keys of a folder. Every desktop scratch chat shares one save (an id no real path gives: a cwd is
// absolute) but keeps its own /quests board, since its quests name that folder's files.
export function folderKeys(folder: string, cwd: string): ProjectKeys {
  if (!isScratchChat(folder)) return projectKeys(normProject(folder), cwd)
  return { ...projectKeys(SCRATCH, SCRATCH), board: projectKeys(SCRATCH, cwd).board }
}

// A path relative to the cwd (case-insensitive prefix, forward slashes), or the path itself.
export function relativePath(path: string, cwd: string): string {
  const p = path.replace(/\\/g, '/')
  const c = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  if (c !== '' && p.toLowerCase().startsWith(c.toLowerCase() + '/')) return p.slice(c.length + 1)
  return p
}

// The text a project quest's "match" is looked for in, per activity.
export function matchTarget(activity: Activity, args: ToolArgs, cwd: string): string {
  switch (activity) {
    case 'search': return [args.path, args.pattern, args.glob].filter(Boolean).join(' ')
    case 'web': return args.url ?? args.query ?? ''
    case 'agent': return args.description ?? ''
    case 'edit': case 'write': case 'read': {
      const path = pathOf(args)
      return path ? relativePath(path, cwd) : ''
    }
    case 'shell': case 'terraform': case 'test': case 'git': return args.command ?? ''
    default: return ''
  }
}

const VERBS: Record<Activity, string> = {
  none: 'tool', edit: 'edit', write: 'write', read: 'read', search: 'search', web: 'web', shell: 'run',
  git: 'git', terraform: 'tf', test: 'test', agent: 'agent', skill: 'skill',
}

function pathOf(args: ToolArgs): string | undefined {
  return args.file_path ?? args.notebook_path ?? args.path
}

// The new text an edit puts in (Edit, MultiEdit, Write, NotebookEdit): looked at for silencing, never stored.
export function addedText(args: ToolArgs): string {
  const parts = [args.new_string, args.content, args.new_source, ...(Array.isArray(args.edits) ? args.edits.map(e => e?.new_string) : [])]
  return parts.filter((x): x is string => typeof x === 'string').join('\n').slice(0, 20_000)
}

// The text an edit replaces (Edit, MultiEdit): only compared for removed test definitions, never stored.
function removedText(args: ToolArgs): string {
  const parts = [args.old_string, ...(Array.isArray(args.edits) ? args.edits.map(e => e?.old_string) : [])]
  return parts.filter((x): x is string => typeof x === 'string').join('\n').slice(0, 20_000)
}

function extOf(path: string | undefined): string | null {
  const m = path ? /\.([a-z0-9]+)$/i.exec(path) : null
  return m?.[1] ? m[1].toLowerCase() : null
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 3) + '...' : s)

// The short line under Clawd: a file name, the command, or what the tool was asked; always a string, at most 60.
export function detailFor(tool: string, args: ToolArgs): string {
  const path = pathOf(args)
  const raw = path ? (path.split(/[\\/]/).pop() || path) : args.command ?? args.description ?? args.skill ?? args.pattern ?? args.query ?? args.url ?? tool
  return clip(String(raw ?? ''), 60)
}

// Numbers as the pane shows them: 1,234 under 100k, then 183.4k.
export function fmt(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0
  if (Math.abs(v) >= 100_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return v.toLocaleString('en-US')
}

// "A", "A and B", "A, B and C"; long lists end in "and N more".
export function listText(names: readonly string[], max = 5): string {
  const shown = names.length > max ? [...names.slice(0, max - 1), `${names.length - max + 1} more`] : [...names]
  if (shown.length <= 1) return shown[0] ?? ''
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

function bar(value: number, goal: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round((value / Math.max(1, goal)) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// A quest's progress as shown: a words probe counts hundreds of words, so it shows the words.
function amount(q: Quest): string {
  const check = (q as Partial<ProjectQuest>).check
  const k = check?.type === 'probe' && check.probe === 'words' ? 100 : 1
  return `${fmt(Math.min(q.progress, q.goal) * k)}/${fmt(q.goal * k)}${k === 100 ? ' words' : ''}`
}

const PLANT_STEPS = [5, 25, 75, 200]

function plantStage(turns: number): number {
  return PLANT_STEPS.filter(step => turns >= step).length
}

function ratio(progress?: { value: number; goal: number }): number {
  return progress ? progress.value / Math.max(1, progress.goal) : 0
}

// The scene only changes at combo tiers, so a growing combo does not re-send the room.
function comboTier(n: number): number {
  return n >= 50 ? 50 : n >= 20 ? 20 : n >= 10 ? 10 : n >= 5 ? 5 : 0
}

function hatName(hat: HatId | null, custom: CustomHat | null): string {
  if (custom) return custom.name
  return hat ? HATS.find(item => item.id === hat)?.name ?? hat : ''
}

// "Lv 37 · Expert", at the cap "Lv 100 · Legend ★3".
export function levelLabel(xp: number): string {
  const info = levelOf(xp)
  const stars = info.isMax && info.stars > 0 ? ` ★${info.stars}` : ''
  return `Lv ${info.level} · ${titleOf(info.level)}${stars}`
}

// The xp part of the header: "1,234/1,344 xp", at the cap "420/1,000 to the next star".
export function xpLabel(xp: number): string {
  const { from, to, isMax } = levelOf(xp)
  return isMax ? `${fmt(xp - from)}/${fmt(to - from)} to the next star` : `${fmt(xp - from)}/${fmt(to - from)} xp`
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// The per-project streak as the header says it: "5-day streak", "5-day streak (safe till Monday)", "No streak".
export function streakText(p: Profile, now: number): string {
  const n = effectiveStreak(p, now)
  if (n <= 0) return 'No streak'
  const d = new Date(now)
  const isWeekend = d.getDay() === 0 || d.getDay() === 6
  return isWeekend && p.streak.lastDay !== dayKey(d) ? `${n}-day streak (safe till Monday)` : `${n}-day streak`
}

// A requirement, short, for dim lists: 'Lv 13', 'trophy Night Owl', 'Lv 10 or trophy Polyglot'.
export function shortReq(text: string): string {
  return text
    .replace(/^Reach Lv /, 'Lv ')
    .replace(/\b[Tt]rophy: /g, 'trophy ')
    .replace(/\b[Tt]rophies: /g, 'trophies ')
}

// ---------- terminal sprite: the block-character logo ----------

export function petAscii(mood: Mood, f: number): string[] {
  const blink = mood === 'sleeping' || (mood === 'idle' && f % 2 === 1) || (mood === 'working' && f % 8 === 0)
  const top = blink ? ' ▐█████▌ ' : ' ▐▛███▜▌ '
  const armsUp = mood === 'done' || mood === 'happy' || ((mood === 'coding' || mood === 'running' || mood === 'working') && f % 2 === 0)
  const mid = armsUp ? '▗▜█████▛▖' : '▝▜█████▛▘'
  const legs = '  ▘▘ ▝▝  '
  // every row has a spare column on the right, so the error shake moves the whole sprite (claws too)
  // and every frame keeps one width (the text beside it never jitters)
  const art = [top, mid, legs].map(l => l.padEnd(ASCII_W))
  const blank = ' '.repeat(ASCII_W)
  if (mood === 'sleeping') return [(f % 4 < 2 ? '      z' : '     Z').padEnd(ASCII_W), ...art]
  if (mood === 'done' || mood === 'happy') return f % 2 === 0 ? [...art, blank] : [blank, ...art]
  if (mood === 'error') return [...(f % 2 === 0 ? art.map(l => ' ' + l.slice(0, -1)) : art), blank]
  return [...art, blank]
}
const ASCII_W = 10

// ---------- module state (starts over on reload; the host keeps $.state and $.store) ----------

let token = 0
let tags = new Set<string>()
let project = ''
let cwdNow = ''
let isLoaded = false
let isHeadless = false            // drawing nowhere (a -p run, or the SDK until a client attaches): no pane, no ticker
let ensuring: Promise<void> | undefined
let turnStartedAt = 0
let turnTools = 0
let turnErrors = 0
let errorsInRow = 0
let lastActiveAt = 0
let lastToolAt = 0
let activeTools = 0
let turnCount = 0
let comboNow = 0
let petNow: PetState | undefined
let quipShownAt = 0
let recentQuips: string[] = []    // the last lines shown, newest last
let lineHoldUntil = 0             // a turn's closing line holds the bubble until then
let usageShown: { kind: UsageNote; mood?: Mood; at: number } | undefined
let limitsSeeded = false          // the limits came from the store: the first measure without any drops them
let usagePending: { kind: UsageNote; mood?: Mood } | undefined // waits for the turn's line to end
let usageLimit: number | undefined // the context window less the auto-compact buffer
let limitRead = false             // usageLimit was read this session (again after each compaction)
let sessionSeen = ''              // $.session.id() of the session this module last started
let profileCache: Profile | undefined
let keys: ProjectKeys | undefined // this project folder's store keys, set in setup
let scratchChat = false           // this folder is a desktop scratch chat (shared save)
let seenProfile = ''              // JSON of the stored profile this session last read or wrote
let seenBoard = ''                // the same for the board
let isFrozen = false              // the stored profile is from a newer version: show it, never write it
let saveWarned = false            // the one "could not save" toast of this session was shown
let hasTabs = false               // a surface with the pane's tabs (desktop, vscode, mobile) is attached
let genToken = 0                  // the quest generation that may still save its result
let gameQueue: Promise<unknown> = Promise.resolve()
let postQueue: Promise<unknown> = Promise.resolve()
let verbCache = { key: '', at: 0, verb: 'Clawding' }
let verbTimer: { cancel: () => void } | undefined
let tick = 0
let tickMs = 0
let paneVisible = true
let lastPaneCheck = 0
let lastRefresh = 0
let lastHelperPoll = 0
let lastSurfaceCheck = 0
let lastRotate = 0
let helpersShown = 0
let seenSnapshot: string[] = []   // fresh keys of the tab just opened: their stars stay for this visit
let shown: { mood: Mood; activity: Activity; at: number; walk?: Walk } = { mood: 'idle', activity: 'none', at: 0 }
let latest: { mood: Mood; activity: Activity } = { mood: 'idle', activity: 'none' }
let burst: { mood: Mood; activity: Activity } | undefined // the last real work seen while a scene dwells
let settle: { cancel: () => void } | undefined
let timer: { cancel: () => void } | undefined
let terminalDrawnAt = -1000
const miniCache = new Map<string, string>()

// Fire and forget: a host call nobody waits for must never reject unhandled.
function bg(p: Promise<unknown> | undefined): void {
  void p?.catch(() => undefined)
}

// Runs `fn` after the hook returned, one task at a time, in the order the hooks queued them.
function defer($: EngineInterface, fn: () => Promise<unknown>): void {
  postQueue = postQueue.then(() => new Promise<void>(resolve => {
    try {
      $.clock.after(0, () => {
        fn().catch(() => undefined).finally(resolve)
      })
    } catch {
      resolve()
    }
  })).catch(() => undefined)
}

// Every profile and board write runs here, one at a time. Never call serial from inside serial.
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = gameQueue.then(fn)
  gameQueue = run.catch(() => undefined)
  return run
}

function invalidate($: EngineInterface): void {
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // nothing drawn yet
  }
}

// One store write; a failure is told once per session and answers false.
async function save($: EngineInterface, key: string, value: unknown): Promise<boolean> {
  const ok = await $.store.set(key, value).then(() => true, () => false)
  if (!ok && !saveWarned) {
    saveWarned = true
    toast($, 'Clawd could not save progress (storage full or unavailable).', 6000)
  }
  return ok
}

// This project's stored profile as it is now (another session may have moved it). Inside serial only.
async function freshProfile($: EngineInterface): Promise<Profile> {
  if (!keys) return profileCache ?? newProfile()
  const raw: unknown = await $.store.get(keys.profile).catch(() => undefined)
  const wasFrozen = isFrozen
  isFrozen = isNewerProfile(raw)
  if (isFrozen !== wasFrozen) invalidate($)
  const text = JSON.stringify(raw ?? null)
  if (profileCache && text === seenProfile) return profileCache
  seenProfile = text
  profileCache = migrateProfile(raw)
  return profileCache
}

// Shows a profile in this session (cache and atoms); writes nothing.
async function publishProfile($: EngineInterface, next: Profile): Promise<void> {
  const hatChanged = profileCache?.hat !== next.hat
  profileCache = next
  await update($, profileAtom, () => next)
  if (hatChanged) await update($, hatAtom, () => next.hat)
}

// Read-modify-write of this project's profile on the fresh stored value (another session may
// have moved it). Inside serial only. A save from a newer version is left alone: after === before.
// So is a change while no project is loaded (session.start resets the keys before its setup sets them
// again): it would land on a blank profile, toast false unlocks and never be saved.
async function changeProfile($: EngineInterface, fn: (p: Profile) => Profile): Promise<{ before: Profile; after: Profile }> {
  if (!keys) {
    const shown = profileCache ?? newProfile()
    return { before: shown, after: shown }
  }
  const shownBefore = profileCache
  const before = await freshProfile($)
  if (isFrozen) {
    if (before !== shownBefore) await publishProfile($, before)
    return { before, after: before }
  }
  const after = fn(before)
  await publishProfile($, after)
  if (keys && (await save($, keys.profile, after))) seenProfile = JSON.stringify(after)
  return { before, after }
}

// Outside serial only (pane, buttons): never from a serial task, since setup awaits the queue.
async function loadProfile($: EngineInterface): Promise<Profile> {
  if (!isLoaded) await ensureQuick($)
  if (profileCache) return profileCache
  return serial(() => freshProfile($))
}

// The old global save goes to the first project that loads after the update, once; the old keys stay as a backup.
async function adoptLegacy($: EngineInterface, now: number): Promise<void> {
  if (!keys) return
  if ((await $.store.get(keys.profile).catch(() => undefined)) !== undefined) return
  if ((await $.store.get(CLAIM_KEY).catch(() => undefined)) !== undefined) return
  const old: unknown = await $.store.get(STORE_KEY).catch(() => undefined)
  if (old === undefined || old === null) return
  await $.store.set(CLAIM_KEY, { by: keys.id, at: now }).catch(() => undefined)
  const claim = await $.store.get(CLAIM_KEY).catch(() => undefined)
  if ((claim as { by?: string } | undefined)?.by !== keys.id) return // another session won it
  await save($, keys.profile, isNewerProfile(old) ? old : migrateProfile(old))
  const hat = sanitizeHat(await $.store.get(HAT_KEY).catch(() => undefined))
  if (hat && (await $.store.get(keys.hat).catch(() => undefined)) === undefined) await save($, keys.hat, hat)
  const room = migrateDecor(await $.store.get(DECOR_KEY).catch(() => undefined))
  if (Object.keys(room).length > 0 && (await $.store.get(keys.decor).catch(() => undefined)) === undefined) await save($, keys.decor, room)
}

// Ids of the real folders named 'scratch' seen so far: their saves look like old scratch chat saves.
async function realScratch($: EngineInterface): Promise<string[]> {
  const raw: unknown = await $.store.get(REAL_SCRATCH_KEY).catch(() => undefined)
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
}

// A real folder named 'scratch' is written down once, so its save is never taken for a scratch chat's.
async function noteRealScratch($: EngineInterface): Promise<void> {
  if (!keys || scratchChat || project !== SCRATCH) return
  const ids = await realScratch($)
  if (!ids.includes(keys.id)) await $.store.set(REAL_SCRATCH_KEY, [...ids, keys.id].slice(-50)).catch(() => undefined)
}

// Every scratch chat shares one save. Its first load adopts the best per-folder scratch save from
// before (the highest xp), copied, never moved: the old keys stay until pruning.
async function adoptScratch($: EngineInterface): Promise<void> {
  if (!keys || !scratchChat) return
  if ((await $.store.get(keys.profile).catch(() => undefined)) !== undefined) return
  const all = await $.store.keys().catch(() => [] as string[])
  const real = await realScratch($)
  let best: { id: string; xp: number; raw: unknown } | undefined
  for (const key of all) {
    if (!key.startsWith(`profile:${SCRATCH}:`) || key === keys.profile || real.includes(key.slice('profile:'.length))) continue
    const raw: unknown = await $.store.get(key).catch(() => undefined)
    const xp = isObj(raw) && typeof raw.xp === 'number' && Number.isFinite(raw.xp) ? raw.xp : -1
    if (xp > (best?.xp ?? -1)) best = { id: key.slice('profile:'.length), xp, raw }
  }
  if (!best) return
  if (!(await save($, keys.profile, best.raw))) return
  // the board stays with its folder (a chat's own board key is the one it always had)
  const pairs: Array<[string, string]> = [[`decor:${best.id}`, keys.decor], [`customHat:${best.id}`, keys.hat]]
  for (const [from, to] of pairs) {
    const v: unknown = await $.store.get(from).catch(() => undefined)
    if (v !== undefined && v !== null && (await $.store.get(to).catch(() => undefined)) === undefined) await save($, to, v)
  }
}

// The newest moment a stored profile shows any activity, 0 when it shows none.
function lastSeenOf(raw: unknown): number {
  if (!isObj(raw)) return 0
  const recent = Array.isArray(raw.recent) ? raw.recent.map(r => (isObj(r) && typeof r.at === 'number' ? r.at : 0)) : []
  const streak = isObj(raw.streak) && typeof raw.streak.lastDay === 'string' ? Date.parse(`${raw.streak.lastDay}T12:00:00`) : NaN
  return Math.max(0, ...recent, Number.isFinite(streak) ? streak : 0)
}

// Old per-folder scratch chat saves (from before they were shared) and the boards of scratch chats that saw
// nothing for 180 days go away. Only a scratch chat prunes. Real projects are never pruned: not the folders
// named 'scratch' (written down when they load), not this folder, and not the shared scratch save.
async function pruneScratch($: EngineInterface, now: number): Promise<void> {
  if (!keys || !scratchChat) return
  const all = await $.store.keys().catch(() => [] as string[])
  const keep = new Set([keys.id, keys.board.slice('quests:'.length), ...(await realScratch($))])
  const prefix = `${SCRATCH}:`
  const ids = new Set(all.filter(k => /^(profile|quests):/.test(k)).map(k => k.slice(k.indexOf(':') + 1)).filter(id => id.startsWith(prefix) && !keep.has(id)))
  for (const id of ids) {
    // a save shows its last activity; a board on its own (a chat's, since 1.0) its creation
    const profile: unknown = all.includes(`profile:${id}`) ? await $.store.get(`profile:${id}`).catch(() => undefined) : undefined
    const board: unknown = profile === undefined ? await $.store.get(`quests:${id}`).catch(() => undefined) : undefined
    const seen = profile !== undefined ? lastSeenOf(profile) : isObj(board) && typeof board.createdAt === 'number' ? board.createdAt : 0
    if (seen === 0 || now - seen < PRUNE_AFTER_MS) continue
    for (const k of [`profile:${id}`, `decor:${id}`, `customHat:${id}`, `quests:${id}`]) {
      if (all.includes(k)) await $.store.delete(k).catch(() => undefined)
    }
  }
}

// Another session in this project folder may have earned xp, worn a hat or moved the decor:
// catch up. Writes atoms only when the stored JSON changed, so the scene does not redraw for nothing.
async function refreshLocked($: EngineInterface): Promise<void> {
  if (!keys) return
  const before = profileCache
  const p = await freshProfile($)
  if (p !== before) await publishProfile($, p)
  await freshBoard($)
  const hat = sanitizeWornHat(await $.store.get(keys.hat).catch(() => undefined))
  if (JSON.stringify(hat) !== JSON.stringify(await read($, customHat))) await update($, customHat, () => hat)
  const room = migrateDecor(await $.store.get(keys.decor).catch(() => undefined))
  if (JSON.stringify(room) !== JSON.stringify(await read($, decor))) await update($, decor, () => room)
}

function quipFor(mood: Mood, activity: Activity, file: string, ctx: { now: number }): string {
  const d = new Date(ctx.now)
  const p = profileCache
  return pickQuip({
    mood, activity, tags, project, file,
    turns: turnCount,
    hour: d.getHours(), weekday: d.getDay(), month: d.getMonth() + 1, day: d.getDate(), year: d.getFullYear(),
    combo: comboNow,
    errorsInRow,
    turnSeconds: turnStartedAt > 0 ? Math.round((ctx.now - turnStartedAt) / 1000) : 0,
    level: levelOf(p?.xp ?? 0).level,
    streak: p ? effectiveStreak(p, ctx.now) : 0,
    hat: p?.hat ?? null,
    avoid: recentQuips,
  })
}

function rememberQuip(line: string): void {
  recentQuips = [...recentQuips.filter(q => q !== line), line].slice(-RECENT_QUIPS)
}

type MoodChange = { mood: Mood; activity?: Activity; detail?: string; quip?: string; now: number }

function isSameScene(a: { mood: Mood; activity: Activity }, b: { mood: Mood; activity: Activity }): boolean {
  return a.mood === b.mood && a.activity === b.activity
}

// Asks the room to show a mood. Shown at once when the current scene had its time;
// otherwise remembered, and the room catches up when the dwell is over.
function requestScene($: EngineInterface, mood: Mood, activity: Activity, now: number): void {
  latest = { mood, activity }
  if (!REST_MOODS.includes(mood)) burst = { mood, activity }
  const dwell = SCENE_DWELL[shown.mood] ?? SCENE_DWELL_MS
  const left = shown.at + dwell - now
  if (left <= 0) {
    settle?.cancel()
    settle = undefined
    bg(commitScene($, now))
    return
  }
  if (!settle) settle = $.clock.after(left, () => {
    settle = undefined
    bg($.clock.now().then(t => commitScene($, t)))
  })
}

// Shows what is due: the latest mood, except that work seen during the dwell gets its
// own scene before Clawd goes back to resting. Keeps catching up until it shows the latest.
async function commitScene($: EngineInterface, now: number): Promise<void> {
  const target = burst && REST_MOODS.includes(latest.mood) && !isSameScene(burst, shown) ? burst : latest
  burst = undefined
  if (!isSameScene(target, shown)) {
    // Start the next scene from where Clawd really is right now (mid-wander, mid-walk, on the stool).
    const first = shown.at === 0
    const here = clawdAt(stationOf(shown.mood, shown.activity), (now - shown.at) / 1000, shown.walk)
    const home = clawdAt(stationOf(target.mood, target.activity), 0)
    const from = { mood: shown.mood, activity: shown.activity }
    shown = { ...target, at: now, walk: first ? undefined : { dx: Math.round(here.x - home.x), dy: Math.round(here.y - home.y) } }
    await update($, sceneAtom, () => ({
      mood: target.mood, activity: target.activity, at: now,
      fromX: first ? null : here.x, fromY: first ? null : here.y,
      fromMood: first ? null : from.mood, fromActivity: first ? null : from.activity,
    }))
  }
  if (!isSameScene(latest, shown) && !settle) {
    const dwell = SCENE_DWELL[shown.mood] ?? SCENE_DWELL_MS
    settle = $.clock.after(dwell, () => {
      settle = undefined
      bg($.clock.now().then(t => commitScene($, t)))
    })
  }
}

// Shows a mood. Without an explicit quip a fresh line under the same mood is kept for a few
// seconds, and nothing is written when nothing changed. Answers the token of this change.
async function setMood($: EngineInterface, change: MoodChange): Promise<number> {
  token += 1
  const mine = token
  const activity = change.activity ?? 'none'
  const detail = change.detail ?? ''
  const current = petNow ?? PET_START
  const sameScene = current.mood === change.mood && current.activity === activity
  const line = change.quip ??
    (sameScene && change.now - quipShownAt < QUIP_HOLD_MS ? current.quip : quipFor(change.mood, activity, detail, { now: change.now }))
  if (sameScene && current.detail === detail && current.quip === line) return mine
  if (mine !== token) return mine
  const next: PetState = { mood: change.mood, activity, detail, quip: line }
  if (line !== current.quip) {
    quipShownAt = change.now
    rememberQuip(line)
  }
  petNow = next
  requestScene($, change.mood, activity, change.now)
  await update($, pet, () => next)
  return mine
}

// Back to thinking while a turn runs, otherwise idle.
async function restMood($: EngineInterface): Promise<number> {
  const now = await $.clock.now()
  return setMood($, { mood: turnStartedAt > 0 ? 'thinking' : 'idle', now })
}

// After a tool: rest only once no other tool started for a moment, so quick runs of tools
// do not flicker through 'thinking'.
function restSoon($: EngineInterface): void {
  const mine = token
  $.clock.after(REST_DELAY_MS, () => {
    if (token === mine && activeTools === 0) bg(restMood($))
  })
}

// Shows a line with a mood for a while, then rests (unless something newer took over).
async function showFor($: EngineInterface, change: MoodChange, holdMs: number): Promise<void> {
  const mine = await setMood($, change)
  $.clock.after(holdMs, () => {
    if (token === mine && activeTools === 0) bg(restMood($))
  })
}

function toast($: EngineInterface, text: string, timeoutMs = 4000): void {
  try {
    $.ui.toast(text, { timeoutMs })
  } catch {
    // a surface without toasts
  }
}

// ---------- toasts: one per queued pass, the most important item first ----------

const RANK = { level: 0, projectTrophy: 1, achievement: 2, campaign: 3, quest: 4, hat: 5, decor: 6 } as const
// `verb` and `what` are the note's line in the Room's Recent list; an empty verb only toasts.
// A quiet note only goes to Recent; `timeoutMs` keeps a big one up longer.
export type Note = { rank: number; text: string; short: string; verb: string; what: string; quiet?: boolean; timeoutMs?: number }

// A short age for the Recent list: just now, 5m ago, 3h ago, 2d ago.
export function ago(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

// Long enough to read: about 45 ms a character, never under 3.5 s or over 9 s.
const toastMs = (text: string) => Math.max(3500, Math.min(9000, 1500 + text.length * 45))

export function toastText(notes: Array<Pick<Note, 'rank' | 'text' | 'short'> & { quiet?: boolean; timeoutMs?: number }>): { text: string; timeoutMs: number } | undefined {
  const loud = notes.filter(n => !n.quiet)
  if (loud.length === 0) return undefined
  const [head, ...others] = [...loud].sort((a, b) => a.rank - b.rank)
  if (!head) return undefined
  const list = others.slice(0, 2).map(n => n.short).join(', ')
  const also = others.length === 0 ? '' : `  ·  Also: ${list}${others.length > 2 ? ` (+${others.length - 2} more)` : ''}`
  const text = head.text + also
  return { text, timeoutMs: Math.max(toastMs(text), head.timeoutMs ?? 0) }
}

// More than three trophies in one event (old totals meeting new rules): one toast for all.
export function trophyFold(names: readonly string[]): string {
  const shown = names.slice(0, 3).join(', ')
  return `+${names.length} trophies from your history: ${shown}${names.length > 3 ? ` (+${names.length - 3} more)` : ''}`
}

export type LevelNote = { text: string; verb: 'Level up' | 'Milestone' | 'Legend'; celebrate?: Celebration; celebrateMs: number; timeoutMs?: number }

// The level-up toast: unlocks named, the next one, a new title; milestones and level 100 celebrate.
// Without tabs (the terminal) it names hats only, as "New hat: X".
export function levelNote(o: { from: number; to: number; titleUp: string | null; unlocks: readonly Unlockable[]; next?: Unlockable; hasTabs: boolean }): LevelNote {
  const milestone = Math.max(0, ...MILESTONE_LEVELS.filter(m => o.from < m && m <= o.to))
  const names = o.hasTabs ? o.unlocks.map(u => u.name) : []
  const hats = o.unlocks.filter(u => u.kind === 'hat').map(u => u.name)
  const hatPart = !o.hasTabs && hats.length > 0 ? ` New hat${hats.length > 1 ? 's' : ''}: ${listText(hats)}.` : ''
  if (milestone === 100) {
    const yours = names.length > 0 ? ` ${listText(names)} ${names.length === 1 ? 'is' : 'are'} yours.` : ''
    return { text: `LEGEND! Level 100.${yours}${hatPart} Encore stars start now.`, verb: 'Legend', celebrate: 'legend', celebrateMs: 8000, timeoutMs: 9000 }
  }
  if (milestone > 0) {
    const upgrade = ROOM_UPGRADE[milestone]
    const parts = o.hasTabs ? [...names, ...(upgrade ? [upgrade] : [])] : []
    const list = parts.length > 0 ? ` ${listText(parts, 6)}.` : ''
    return { text: `Milestone! Level ${o.to} · ${titleOf(o.to)}.${list}${hatPart}`, verb: 'Milestone', celebrate: 'milestone', celebrateMs: 6000, timeoutMs: 9000 }
  }
  const unlocked = names.length > 0 ? ` Unlocked: ${listText(names)}.` : hatPart
  const next = o.hasTabs && o.next ? ` Next: ${o.next.name} at Lv ${o.next.level}.` : ''
  // a new title is said once, up front ('Level 5! New title: Apprentice.'), not after '· Apprentice!' too
  const head = o.titleUp ? `Level ${o.to}! New title: ${o.titleUp}.` : `Level ${o.to} · ${titleOf(o.to)}!`
  return { text: `${head}${unlocked}${next}`, verb: 'Level up', celebrateMs: 0 }
}

// The fresh-marker key of a catalog unlock.
function unlockKey(u: Unlockable): string {
  return u.kind === 'hat' ? `hat:${u.id}` : `decor:${u.slot}:${u.id}`
}

// Toasts the notes and keeps them in this project's Recent list (call only inside serial).
async function flushNotes($: EngineInterface, notes: Note[], now: number): Promise<void> {
  const t = toastText(notes)
  if (t) toast($, t.text, t.timeoutMs)
  const added = notes.filter(n => n.verb !== '').map(n => ({ verb: n.verb, what: n.what, at: now }))
  if (added.length === 0) return
  await changeProfile($, p => ({ ...p, recent: [...(p.recent ?? []), ...added].slice(-RECENT_SIZE) }))
}

// The room overlay for a milestone, level 100 or a star, cleared when its time is up.
async function startCelebration($: EngineInterface, kind: Celebration, ms: number, now: number): Promise<void> {
  const until = now + ms
  await update($, celebrate, () => ({ kind, until }))
  $.clock.after(ms, () => bg(update($, celebrate, c => (c && c.until <= until ? null : c))))
}

// ---------- the game, the board and the wardrobe (all inside `serial`) ----------

// Applies one game event (call only inside serial), saves the profile, collects what to toast,
// and answers the line worth showing over Clawd, if any.
async function applyLocked($: EngineInterface, event: GameEvent, notes: Note[]): Promise<string | undefined> {
  const now = event.now
  const box: { result?: GameResult; decor?: DecorItem[] } = {}
  const { before } = await changeProfile($, p => {
    const r = applyEvent(p, event, EXT)
    // seasonal pieces are news when their month starts, judged like seasonal hats (game.ts prevActiveNow)
    const items = newlyUnlocked(p, r.profile, now, prevActiveNow(p, now))
    const fresh = [...r.unlockedHats.map(h => `hat:${h}`), ...items.map(freshKey)]
    box.decor = items
    box.result = fresh.length > 0 ? { ...r, profile: addFresh(r.profile, fresh) } : r
    return box.result.profile
  })
  const result = box.result
  if (!result) return undefined // a newer version's save: nothing is paid
  if (result.xpGained > 0) await update($, stats, s => ({ ...s, xp: s.xp + result.xpGained }))

  const fromLevel = levelOf(before.xp).level
  // a reward already open some other way (the Wizard Hat via Polyglot) is not news at its level
  const unlocks = result.levelUp !== null ? unlocksBetween(fromLevel, result.levelUp, { profile: before, now }) : []
  // Pieces the level-up toast already names only go to Recent.
  const named = new Set(unlocks.map(unlockKey))

  for (const item of box.decor ?? []) {
    notes.push({
      rank: RANK.decor, text: `New decor: ${item.name}. Rearrange the room in the Decor tab.`, short: `decor ${item.name}`, verb: 'New decor', what: item.name,
      quiet: !hasTabs || named.has(freshKey(item)),
    })
  }

  let line: string | undefined
  for (const quest of result.completedQuests) {
    notes.push({ rank: RANK.quest, text: `Quest done: ${quest.title} (+${fmt(quest.xp)} xp)`, short: quest.title, verb: 'Quest done', what: quest.title })
    line = questDoneQuip(quest.title, undefined, 'daily')
  }
  if (sweepsOf(result.profile) > sweepsOf(before)) {
    notes.push({ rank: RANK.quest, text: `Every daily quest done! Claim the Daily Sweep (+${XP.sweep} xp) before midnight.`, short: 'Daily Sweep ready', verb: '', what: '' })
  }
  if (result.profile.sweepClaimed !== before.sweepClaimed && event.type === 'claim') {
    notes.push({ rank: RANK.quest, text: `Daily Sweep claimed (+${XP.sweep} xp)`, short: 'Daily Sweep', verb: 'Daily Sweep', what: 'every daily quest done' })
    line = 'Daily Sweep! Every quest of the day, done.'
  }
  const trophies = result.unlocked
  if (trophies.length > TROPHY_FOLD) {
    const fold = trophyFold(trophies.map(a => a.name))
    notes.push({ rank: RANK.achievement, text: fold, short: fold, verb: '', what: '' })
  }
  for (const achievement of trophies) {
    notes.push({
      rank: RANK.achievement, text: `Trophy unlocked: ${achievement.name} (+${fmt(achievementXp(achievement.id))} xp)`, short: achievement.name, verb: 'Trophy', what: achievement.name,
      quiet: trophies.length > TROPHY_FOLD,
    })
    line = achievementQuip(achievement.name, undefined, achievement.id)
  }
  for (const hat of result.unlockedHats) {
    const name = HATS.find(item => item.id === hat)?.name ?? hat
    notes.push({
      rank: RANK.hat, text: hasTabs ? `New hat: ${name}. Try it on in the Wardrobe.` : `New hat: ${name}`, short: `hat ${name}`, verb: 'New hat', what: name,
      quiet: named.has(`hat:${hat}`),
    })
  }
  if (result.levelUp !== null) {
    const n = levelNote({ from: fromLevel, to: result.levelUp, titleUp: result.titleUp, unlocks, next: nextUnlock(result.profile, now), hasTabs })
    notes.push({ rank: RANK.level, text: n.text, short: `level ${result.levelUp}`, verb: n.verb, what: `level ${result.levelUp}`, timeoutMs: n.timeoutMs })
    if (n.celebrate) await startCelebration($, n.celebrate, n.celebrateMs, now)
    line = levelUpQuip(result.levelUp)
  }
  if (result.starUp !== null && result.starUp > 0) {
    const big = result.starUp % 5 === 0
    notes.push({ rank: RANK.level, text: `Encore star ★${result.starUp}!`, short: `star ★${result.starUp}`, verb: 'Encore', what: `★${result.starUp}`, timeoutMs: big ? 9000 : undefined })
    if (result.levelUp === null || !MILESTONE_LEVELS.includes(result.levelUp)) await startCelebration($, big ? 'milestone' : 'star', big ? 6000 : 3000, now)
    line = starQuip(result.starUp)
  }
  return line
}

function play($: EngineInterface, event: GameEvent): Promise<string | undefined> {
  return serial(async () => {
    const notes: Note[] = []
    const line = await applyLocked($, event, notes)
    await flushNotes($, notes, event.now)
    return line
  })
}

// The claim button: pays today's Daily Sweep through the queue (a second press finds nothing to pay).
async function claimSweep($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const line = await play($, { type: 'claim', now })
  if (line) await showFor($, { mood: 'happy', quip: line, now }, 3500)
}

async function saveBoard($: EngineInterface, next: ProjectQuestBoard | null): Promise<void> {
  await update($, board, () => next)
  if (project === '' || !keys) return
  const ok = next ? await save($, keys.board, next) : await $.store.delete(keys.board).then(() => true, () => false)
  if (ok) seenBoard = JSON.stringify(next ?? null)
}

// This project's board as stored now (another session may have moved it). Inside serial only.
async function freshBoard($: EngineInterface): Promise<ProjectQuestBoard | null> {
  if (!keys || project === '') return read($, board)
  const raw: unknown = await $.store.get(keys.board).catch(() => undefined)
  const text = JSON.stringify(raw ?? null)
  if (text !== seenBoard) {
    seenBoard = text
    await update($, board, () => migrateBoard(raw))
  }
  return read($, board)
}

// Counts a tool call or a turn toward the project quests and pays what finished, all in one pass
// of the queue (the board is read inside it, so parallel tools never pay twice).
function progressBoard($: EngineInterface, now: number, compute: (b: ProjectQuestBoard) => Progress): Promise<string | undefined> {
  if (project === '') return Promise.resolve(undefined)
  return serial(async () => {
    const before = await freshBoard($)
    if (!before) return undefined
    const progress = compute(before)
    if (!progress.changed) return undefined
    await saveBoard($, progress.board)

    const notes: Note[] = []
    let line: string | undefined
    let total = 0
    for (const quest of progress.finished) {
      notes.push({ rank: RANK.quest, text: `Project quest done: ${quest.title} (+${fmt(quest.xp)} xp)`, short: quest.title, verb: 'Quest done', what: quest.title })
      total += quest.xp
      line = questDoneQuip(quest.title, undefined, quest.role === 'boss' ? 'boss' : 'project')
    }
    if (progress.campaignDone) {
      const bonus = progress.campaignXp ?? 0
      const paid = bonus > 0 ? ` (+${fmt(bonus)} xp)` : ' (two campaign bonuses were paid today already)'
      notes.push({ rank: RANK.campaign, text: `Campaign complete: ${progress.board.campaign}!${paid}`, short: `campaign ${progress.board.campaign}`, verb: 'Campaign done', what: progress.board.campaign })
      total += bonus
      line = campaignDoneQuip(progress.board.campaign)
    }
    for (const milestone of progress.milestones) {
      notes.push({ rank: RANK.projectTrophy, text: `Trophy unlocked: ${milestone.name} (+${fmt(milestone.xp)} xp)`, short: milestone.name, verb: 'Trophy', what: milestone.name })
      total += milestone.xp
      line = achievementQuip(milestone.name)
    }
    for (const milestone of progress.retired ?? []) {
      notes.push({ rank: RANK.projectTrophy, text: `Trophy retired: ${milestone.name}. What it measured is gone; /quests sets a new one.`, short: `${milestone.name} retired`, verb: '', what: '' })
    }
    for (const hat of progress.hats) {
      notes.push({ rank: RANK.hat, text: hasTabs ? `New project hat: ${hat.name}. Try it on in the Wardrobe.` : `New hat: ${hat.name}`, short: `hat ${hat.name}`, verb: 'New hat', what: hat.name })
    }
    const quests = progress.finished.length
    const bosses = progress.finished.filter(q => q.role === 'boss').length
    const campaigns = progress.campaignDone ? 1 : 0
    if (total > 0 || quests > 0 || campaigns > 0) {
      line = (await applyLocked($, { type: 'bonus', xp: total, now, quests, bosses, campaigns }, notes)) ?? line
    }
    await flushNotes($, notes, now)
    return line
  })
}

async function wearLocked($: EngineInterface, hat: HatId | null, now: number): Promise<void> {
  const { after } = await changeProfile($, p => equipHat(p, hat, now))
  await update($, hatAtom, () => after.hat)
  await update($, customHat, () => null)
  if (keys) await $.store.delete(keys.hat).catch(() => undefined)
}

// A catalog hat (or none). Pressing the hat already worn does nothing.
function wear($: EngineInterface, hat: HatId | null): Promise<void> {
  return serial(async () => {
    const now = await $.clock.now()
    const p = await freshProfile($)
    if (p.hat === hat && (await read($, customHat)) === null) return
    await wearLocked($, hat, now)
  })
}

async function wearCustom($: EngineInterface, hat: CustomHat): Promise<void> {
  const now = await $.clock.now()
  const changed = await serial(async () => {
    if ((await read($, customHat))?.id === hat.id) return false
    await wearLocked($, null, now)
    await update($, customHat, () => hat)
    if (keys) await save($, keys.hat, hat)
    return true
  })
  if (changed) await showFor($, { mood: 'happy', quip: `${hat.name}. Custom made for ${project || 'this project'}.`, now }, 3500)
}

// Pressing the piece the slot already shows does nothing.
async function setDecor($: EngineInterface, slot: DecorSlot, id: string): Promise<void> {
  const now = await $.clock.now()
  const changed = await serial(async () => {
    if (!keys) return false
    const stored = migrateDecor(await $.store.get(keys.decor).catch(() => undefined))
    if (resolveDecor(stored, await freshProfile($), now)[slot] === id) return false
    const room = { ...stored, [slot]: id }
    await update($, decor, () => room)
    await save($, keys.decor, room)
    return true
  })
  const item = DECOR.find(d => d.slot === slot && d.id === id)
  if (changed && item && item.kind !== 'default') await showFor($, { mood: 'happy', quip: `${item.name}. Nice touch.`, now }, 3500)
}

// Opens a tab; the Wardrobe and Decor mark their fresh unlocks seen, once per open (their stars stay for this visit).
async function openTab($: EngineInterface, id: Tab): Promise<void> {
  await update($, tab, () => id)
  await update($, swapArmed, () => '')
  const kind = id === 'wardrobe' ? 'hat:' : id === 'decor' ? 'decor:' : undefined
  const fresh = (profileCache?.fresh ?? []).filter(k => kind !== undefined && k.startsWith(kind))
  seenSnapshot = fresh
  if (kind && fresh.length > 0) await serial(() => changeProfile($, p => markSeen(p, kind)))
}

async function toggleLocked($: EngineInterface, key: string): Promise<void> {
  await update($, expandLocked, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
}

// ---------- session bookkeeping (survives a hot reload) ----------

async function loadBoard($: EngineInterface): Promise<void> {
  if (project === '') {
    await update($, board, () => null)
    return
  }
  if (!keys) return
  const key = keys.board
  let raw: unknown = await $.store.get(key).catch(() => undefined)
  if (raw === undefined || raw === null) {
    const legacy = storeKey(project)
    if (legacy !== key) {
      const old: unknown = await $.store.get(legacy).catch(() => undefined)
      if (old !== undefined && old !== null) {
        raw = old
        if (await save($, key, old)) await $.store.delete(legacy).catch(() => undefined)
      }
    }
  }
  seenBoard = JSON.stringify(raw ?? null)
  await update($, board, () => migrateBoard(raw))
}

// A 'working' generation nobody runs any more: too old, or left by an earlier module environment (a reload or a
// respawn cancels its model call; genToken 0 means this environment never started one).
function isStale(gen: QuestGen, now: number): boolean {
  return gen.status === 'working' && (genToken === 0 || gen.startedAt === undefined || now - gen.startedAt > GEN_STALE_MS)
}

async function checkSurfaces($: EngineInterface, now: number): Promise<void> {
  lastSurfaceCheck = now
  hasTabs = (await $.session.surfaces().catch(() => [] as const)).some(s => s !== 'terminal')
}

async function setup($: EngineInterface): Promise<void> {
  if (petNow === undefined) petNow = await read($, pet)
  if (!isLoaded) {
    const now = await $.clock.now()
    cwdNow = await $.session.cwd().catch(() => '')
    const folder = cwdNow.split(/[\\/]/).filter(Boolean).pop() ?? ''
    project = normProject(folder)
    scratchChat = isScratchChat(folder)
    // every desktop scratch chat shares one save; a real folder named 'scratch' is a project of its own
    keys = folderKeys(folder, cwdNow)
    seenProfile = ''
    seenBoard = ''
    isFrozen = false
    await checkSurfaces($, now)
    tags = new Set([...tagsFromPath(folder), ...tagsFromEntries((await $.fs.list().catch(() => [])).map(entry => entry.name))])
    turnCount = await $.session.turns().catch(() => 0)
    comboNow = await read($, combo)
    if (lastActiveAt === 0) lastActiveAt = now
    if (lastToolAt === 0 && comboNow > 0) lastToolAt = now
    if (quipShownAt === 0) quipShownAt = now
    await serial(() => noteRealScratch($))
    await serial(() => adoptScratch($))
    await serial(() => adoptLegacy($, now))
    await serial(() => loadBoard($))
    await update($, questGen, (g): QuestGen => (isStale(g, now) ? { status: 'idle', message: '' } : g))
    const limits = migrateLimits(await $.store.get(LIMITS_KEY).catch(() => undefined))
    const live = await $.session.usage().catch(() => undefined)
    await update($, usageAtom, u => {
      const seeded = seedUsage(u, limits, live, now)
      limitsSeeded = !live?.rateLimits?.length && (seeded.fiveHour !== u.fiveHour || seeded.sevenDay !== u.sevenDay)
      return seeded
    })
    isLoaded = true
    bg(serial(() => pruneScratch($, now)))
  }
  if (timer === undefined && !isHeadless) startTimer($)
}

// A session that started drawing nowhere (the SDK behind the desktop app or VS Code) got a client after all:
// it gets the ticker, the tab-aware notes and, when asked to (a client attached, not a pane already drawn),
// the pane unless the person closed it.
async function attachSurface($: EngineInterface, open: boolean): Promise<void> {
  const wasHeadless = isHeadless
  isHeadless = false
  await ensureSession($).catch(() => undefined)
  await checkSurfaces($, await $.clock.now())
  if (!wasHeadless || !open) return
  const hidden = (await $.store.get(HIDDEN_KEY).catch(() => undefined)) === true
  await update($, isHidden, () => hidden)
  if (!hidden) bg($.ui.open({ id: PANE, title: 'Clawd' }))
}

// Idempotent: loads what the module lost in a reload (project, board, ticker).
function ensureSession($: EngineInterface): Promise<void> {
  if (isLoaded && (timer !== undefined || isHeadless) && petNow !== undefined) return Promise.resolve()
  ensuring ??= setup($).finally(() => {
    ensuring = undefined
  })
  return ensuring
}

// Awaits the setup only when the project is not known yet; otherwise lets it run on its own.
async function ensureQuick($: EngineInterface): Promise<void> {
  if (!isLoaded) await ensureSession($).catch(() => undefined)
  else bg(ensureSession($))
}

// The context limit the meter measures against (the window less the auto-compact buffer): read once
// per session and again after each compaction.
async function readLimit($: EngineInterface): Promise<number | undefined> {
  if (!limitRead) {
    limitRead = true
    usageLimit = compactLimit(await $.session.usage({ breakdown: 'summary' }).catch(() => undefined))
  }
  return usageLimit
}

// The scene frame reloads whenever its source changes, so the source only changes when the
// drawing does: the same scene keeps its phased source, and a new one is phased to resume its
// animations from where they are now (scene time for Clawd, wall time for the room).
let sceneCache = { key: '', svg: '' }
// Wall time for the room, in epoch seconds: phaseSvg keeps every loop's shift under one loop, so the room
// resumes seamlessly at any hour. No wrap at all: 86400 is no multiple of most loops (a 46 s cloud drift
// would jump at every UTC midnight).
export const wallSecs = (now: number): number => Math.round(now / 10) / 100
// The usage meters' one-shot changes run on their own clock (meterAt: when a drawn step last changed).
function phasedScene(svg: string, sceneAt: number, now: number, meterAt = 0): string {
  if (sceneCache.key !== svg) {
    const sceneSecs = sceneAt > 0 ? (now - sceneAt) / 1000 : 0
    const meterSecs = meterAt > 0 ? Math.round((now - meterAt) / 10) / 100 : 3600
    sceneCache = { key: svg, svg: phaseSvg(svg, Math.round(sceneSecs * 100) / 100, wallSecs(now), meterSecs) }
  }
  return sceneCache.svg
}

function startTimer($: EngineInterface, ms = TICK_FAST_MS): void {
  timer?.cancel()
  tickMs = ms
  timer = $.clock.every(ms, () => {
    bg(onTick($))
  })
}

// Mini Clawds: Agent calls still in flight, or subagents the engine lists as running. A background
// agent's (or a workflow's) tool call returns at once, so only the list sees it working on.
// A workflow's agents are in no list: each one counts while its tool calls keep coming.
let agentCalls = 0
let runningAgents = 0
const seenAgents = new Map<string, number>()
const AGENT_QUIET_MS = 90_000
async function syncHelpers($: EngineInterface, refresh = false): Promise<void> {
  if (refresh) {
    const list = await $.agent.list().catch(() => undefined)
    if (list) runningAgents = list.filter(a => a.status === 'running').length
    const now = await $.clock.now()
    for (const [id, at] of seenAgents) if (now - at > AGENT_QUIET_MS) seenAgents.delete(id)
  }
  const count = Math.min(3, Math.max(agentCalls, runningAgents, seenAgents.size))
  helpersShown = count
  if ((await read($, helpers)) !== count) await update($, helpers, () => count)
}

async function onTick($: EngineInterface): Promise<void> {
  tick += 1
  const now = await $.clock.now()
  const isSlow = tickMs === TICK_SLOW_MS
  if (isSlow || now - lastPaneCheck >= 2000) {
    lastPaneCheck = now
    const pane = (await $.ui.panes().catch(() => [])).find(item => item.id === PANE)
    paneVisible = pane !== undefined && pane.isPlaced && pane.isShown
  }
  // agent.list only while a mini Clawd or an Agent call is about
  if ((agentCalls > 0 || helpersShown > 0 || runningAgents > 0 || seenAgents.size > 0) && now - lastHelperPoll >= 1100) {
    lastHelperPoll = now
    await syncHelpers($, true)
  }
  if (isLoaded && now - lastRefresh >= REFRESH_MS) {
    lastRefresh = now
    bg(serial(() => refreshLocked($)))
  }
  if (now - lastSurfaceCheck >= 10_000) await checkSurfaces($, now)
  const state = petNow
  if (!state) return
  // The terminal sprite steps at the mood's pace: a calm sleep, a bouncy hop, a busy Clawd every tick.
  // Idle only blinks: tick%16 === 0 lands on an odd frame (eyes shut), the next tick on an even one.
  const step = isSlow ? 1 : state.mood === 'idle' ? 0 : state.mood === 'sleeping' ? 8 : (state.mood === 'happy' || state.mood === 'done') ? 2 : 1
  if (tick - terminalDrawnAt < 20 && (step === 0 ? tick % 16 < 2 : tick % step === 0)) {
    await update($, frame, n => (state.mood !== 'idle' || isSlow ? n + 1 : tick % 16 === 0 ? (n % 2 === 0 ? n + 1 : n + 2) : (n % 2 === 1 ? n + 1 : n + 2)))
  }

  if (state.mood === 'idle' && activeTools === 0 && now - lastActiveAt > SLEEP_AFTER_MS) await setMood($, { mood: 'sleeping', now })

  const every = state.mood === 'idle' || state.mood === 'sleeping' ? 15_400 : 6_600
  if (state.mood !== 'happy' && now - quipShownAt >= every && now - lastRotate >= every) {
    lastRotate = now
    const quip = quipFor(state.mood, state.activity, state.detail, { now })
    const next = await update($, pet, current => (current.mood === state.mood && current.quip === state.quip ? { ...current, quip } : current))
    if (petNow === state) {
      petNow = next
      if (next.quip === quip) {
        quipShownAt = now
        rememberQuip(quip)
      }
    }
  }

  // A hidden pane or a sleeping Clawd needs no 220 ms ticker.
  const want = !paneVisible || (petNow ?? state).mood === 'sleeping' ? TICK_SLOW_MS : TICK_FAST_MS
  if (want !== tickMs) startTimer($, want)
}

function mini(mood: Mood, activity: Activity, hat: AnyHat, mirror = false): string {
  // A custom hat is keyed by its art too: a regenerated project hat can reuse an id.
  const hatKey = hat === null ? 'none' : typeof hat === 'string' ? hat : `custom:${hat.id}:${hat.rows.join('/')}:${JSON.stringify(hat.palette)}`
  const key = `${mood}|${activity}|${hatKey}|${mirror ? 'm' : ''}`
  let svg = miniCache.get(key)
  if (svg === undefined) {
    if (miniCache.size > 300) miniCache.clear()
    svg = mirror ? miniSvg({ mood, activity, hat }, { mirror: true }) : miniSvg({ mood, activity, hat })
    miniCache.set(key, svg)
  }
  return svg
}

// ---------- /quests ----------

const TREE_MAX = 400

const sortedList = async ($: EngineInterface, dir: string) =>
  [...(await $.fs.list(dir === '' ? undefined : dir.replace(/\/$/, '')).catch(() => []))].sort((a, b) => a.name.localeCompare(b.name))

// The project's paths (dirs end with '/'), breadth first: no .git, no ignored, secret or binary paths.
async function scanTree($: EngineInterface, depth = 3): Promise<string[]> {
  const out: string[] = []
  let level = ['']
  let lists = 0
  for (let d = 0; d < depth && level.length > 0 && out.length < TREE_MAX; d++) {
    const next: string[] = []
    for (const dir of level) {
      if (++lists > 80) break
      for (const entry of await sortedList($, dir)) {
        const rel = `${dir}${entry.name}${entry.kind === 'dir' ? '/' : ''}`
        if (out.length >= TREE_MAX || entry.kind === 'other' || entry.name === '.git' || isIgnored(rel)) continue
        out.push(rel)
        if (entry.kind === 'dir') next.push(rel)
      }
    }
    level = next
  }
  return out
}

// Text files under a folder ('' = the project) that `keep` wants, read-only; secrets and binaries never read.
// Only wanted files count toward the cap.
async function filesUnder($: EngineInterface, dir: string, keep: (rel: string) => boolean): Promise<ProbeFile[]> {
  const out: ProbeFile[] = []
  let level = [dir]
  let lists = 0
  for (let d = 0; d < 4 && level.length > 0 && out.length < PROBE_FILES; d++) {
    const next: string[] = []
    for (const at of level) {
      if (++lists > 60) break
      for (const entry of await sortedList($, at)) {
        const rel = `${at}${entry.name}${entry.kind === 'dir' ? '/' : ''}`
        if (entry.kind === 'other' || entry.name === '.git' || isIgnored(rel)) continue
        if (entry.kind === 'dir') next.push(rel)
        else if (out.length < PROBE_FILES && entry.size <= READ_MAX && keep(rel)) out.push({ path: rel, text: String(await $.fs.read(rel).catch(() => '')) })
      }
    }
    level = next
  }
  return out
}

// What each due probe measures: its file, its folder or its '.ext' files; vanished when the target is gone.
async function readProbes($: EngineInterface, due: ProbeDue[]): Promise<ProbeRead[]> {
  const reads: ProbeRead[] = []
  for (const { id, check } of due) {
    const path = check.path
    // more-files reads only names with its ending, so other files never fill the cap
    const ending = check.probe === 'more-files' ? check.pattern.toLowerCase() : ''
    if (path.endsWith('/')) {
      const isThere = await $.fs.exists(path.replace(/\/$/, '')).catch(() => false)
      reads.push(isThere ? { id, files: await filesUnder($, path, rel => matchesPath(path, rel) && rel.toLowerCase().endsWith(ending)) } : { id, vanished: true })
    } else if (path.startsWith('.') && !path.includes('/')) {
      reads.push({ id, files: await filesUnder($, '', rel => matchesPath(path, rel)) })
    } else {
      const stat = await $.fs.stat(path).catch(() => undefined)
      if (!stat) reads.push({ id, vanished: true })
      else if (isOffLimits(path)) reads.push({ id, files: [] })
      // too big to read: no reading at all, so its progress stays as it is (never measured as an empty file)
      else if (stat.size > READ_MAX) continue
      else reads.push({ id, files: [{ path, text: String(await $.fs.read(path).catch(() => '')) }] })
    }
  }
  return reads
}

// End of a turn that changed files: measured quests are read once, vanished targets rerolled.
async function refreshProbes($: EngineInterface, turnStart: number, now: number): Promise<string | undefined> {
  if (project === '') return undefined
  const current = await serial(() => freshBoard($))
  if (!current) return undefined
  const due = probesDue(current, turnStart)
  const reads = await readProbes($, due)
  for (const t of tallyTargets(current)) {
    if (!(await $.fs.exists(t.path.replace(/\/$/, '')).catch(() => true))) reads.push({ id: t.id, vanished: true })
  }
  if (reads.length === 0) return undefined
  const spare = reads.some(r => 'vanished' in r) || due.some(d => d.check.at === -1) ? templates(await scanTree($), [...tags]) : []
  // The reads were taken outside the queue: drop them if /quests replaced the campaign meanwhile.
  return progressBoard($, now, b => applyProbes(b, b.createdAt === current.createdAt ? reads : [], now, spare))
}

type GenFailure = 'timeout' | 'unreadable' | 'no-model'
class GenError extends Error {
  constructor(readonly kind: GenFailure, raw: string) {
    super(raw)
  }
}

// Friendly text for a failed generation; the raw reason goes to the log.
export function genErrorText(kind: GenFailure): string {
  switch (kind) {
    case 'timeout': return 'Claude did not answer in time.'
    case 'no-model': return 'No model is available for /quests.'
    default: return 'The answer was not readable.'
  }
}

async function generateQuests($: EngineInterface, focus: string): Promise<void> {
  const now = await $.clock.now()
  const message = `Clawd is scouting ${project || 'the project'} for quests...`
  let claimed = false
  await update($, questGen, (g): QuestGen => {
    claimed = g.status !== 'working' || isStale(g, now)
    return claimed ? { status: 'working', message, startedAt: now } : g
  })
  if (!claimed) return
  genToken += 1
  const myGen = genToken

  const gate = canRegenerate(await read($, board), now)
  if (!gate.ok) {
    // the Quests tab says when new ones unlock; nothing failed
    await update($, questGen, () => ({ status: 'idle', message: '' }))
    return
  }

  let mine = await setMood($, { mood: 'reading', activity: 'search', detail: project, quip: 'Scouting the project for quests...', now })
  try {
    const tree = await scanTree($)
    const readmeName = tree.find(name => /^readme(\.md|\.txt|\.rst)?$/i.test(name))
    const readme = readmeName ? String(await $.fs.read(readmeName).catch(() => '')).slice(0, 1500) : ''
    const current = await read($, board)
    const milestones = current?.milestones ?? []
    const needMilestones = milestones.length < MAX_MILESTONES && (milestones.length === 0 || milestones.every(m => m.done))
    const prompt = buildPrompt({
      project,
      tags: [...tags],
      tree,
      readme,
      recentPrompts: await read($, recentPromptsAtom),
      recentWork: (await read($, log)).map(entry => `${entry.verb} ${entry.what}`),
      focus,
      needMilestones,
    })
    const maxTokens = needMilestones ? 4000 : 3000
    // sonnet, then haiku, then the session's own model; the first that answers is kept for the repair ask
    const sessionModel = await $.session.model().catch(() => '')
    const models = [...new Set(['sonnet', 'haiku', ...(sessionModel ? [sessionModel] : [])])]
    let chosen: string | undefined
    const ask = async (text: string): Promise<string> => {
      let sawReply = false
      let raw = ''
      for (const model of chosen ? [chosen] : models) {
        const reply = await $.model.complete({ model, system: SYSTEM, prompt: text, maxTokens, timeoutMs: GEN_TIMEOUT_MS }).catch((err: unknown) => {
          raw = err instanceof Error ? err.message : String(err)
          return undefined
        })
        if (reply?.isAnswered) {
          chosen = model
          return reply.text
        }
        if (reply && !reply.isAnswered) {
          raw = `${model}: ${reply.reason}`
          if (reply.reason === 'aborted') throw new GenError('timeout', raw)
          if (reply.reason === 'empty-reply') sawReply = true
        }
      }
      throw new GenError(sawReply ? 'unreadable' : 'no-model', raw)
    }
    const replyText = await ask(prompt)
    const ctx = { tree, project, readme, tags: [...tags] }
    let parsed = parseCandidates(replyText, tree)
    // too few good candidates: one repair ask with the reasons; templates fill whatever is still missing
    if (parsed.quests.filter(c => validateCandidate(c, ctx) === null).length < 4) {
      const again = await ask(repairPrompt(prompt, rejections(parsed, ctx))).catch(() => undefined)
      if (again !== undefined) parsed = mergeParsed(parsed, parseCandidates(again, tree))
    }
    const spare = templates(tree, [...tags])
    const start = await $.clock.now()
    let fresh = buildBoard(parsed, ctx, spare, current, start)
    // measured quests start from how the files are now
    fresh = applyProbes(fresh, await readProbes($, probesDue(fresh, Number.POSITIVE_INFINITY)), start, spare).board
    if (myGen !== genToken) return // a newer generation (or a reset) took over: this one is dropped
    const created = await serial(async () => {
      if (myGen !== genToken) return undefined
      const merged = mergeBoard(fresh, await freshBoard($))
      await saveBoard($, merged)
      return merged
    })
    if (!created) return
    await update($, questGen, () => ({ status: 'idle', message: '' }))
    const news = `New campaign: ${created.campaign} (${created.items.length} quests)`
    toast($, news, toastMs(news))
    mine = await setMood($, { mood: 'happy', quip: `New campaign: ${created.campaign}. Let's go.`, now: await $.clock.now() })
  } catch (err) {
    if (myGen !== genToken) return
    const kind: GenFailure = err instanceof GenError ? err.kind : 'unreadable'
    try {
      $.ui.log(`clawd-quest /quests: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    } catch {
      // no log on this surface
    }
    const failedAt = await $.clock.now()
    const failed: QuestGen = { status: 'error', message: `The quest scroll caught fire. ${genErrorText(kind)}`, startedAt: failedAt }
    await update($, questGen, () => failed)
    $.clock.after(GEN_ERROR_MS, () => bg(update($, questGen, (g): QuestGen => (g.status === 'error' && g.startedAt === failedAt ? { status: 'idle', message: '' } : g))))
    if (token === mine) mine = await setMood($, { mood: 'error', quip: 'The quest scroll caught fire. Try again?', now: failedAt })
  } finally {
    // every way out, a reset's early returns included, sends Clawd back to rest unless something newer took the scene
    $.clock.after(5000, () => {
      if (token === mine && activeTools === 0) bg(restMood($))
    })
  }
}

// What arms a quest's Swap button: the campaign and the quest, so a later campaign's quest of the same id is not armed.
const swapKey = (b: ProjectQuestBoard, id: string): string => JSON.stringify([b.campaign, b.createdAt, id])

// The Swap button: one per campaign, and the swapped quest's progress is lost, so a quest with progress
// asks for a second press first.
async function pressSwap($: EngineInterface, id: string): Promise<void> {
  const current = await read($, board)
  const quest = current?.items.find(q => q.id === id)
  if (!current || !quest) return
  if (quest.progress > 0 && (await read($, swapArmed)) !== swapKey(current, id)) {
    await update($, swapArmed, () => swapKey(current, id))
    return
  }
  await update($, swapArmed, () => '')
  await swapProjectQuest($, id)
}

// What arms the new-campaign button: the campaign it would replace.
const replaceKey = (b: ProjectQuestBoard): string => swapKey(b, '#replace')

// The quests a new campaign drops (done ones go to the history, open ones and their progress are lost).
const openQuestsOf = (b: ProjectQuestBoard | null): number => (b?.items ?? []).filter(q => !q.done).length

// The new-campaign button: a campaign with progress on an open quest asks for a second press first, like Swap.
async function pressNewQuests($: EngineInterface): Promise<void> {
  const current = await read($, board)
  if (current && current.items.some(q => !q.done && q.progress > 0) && (await read($, swapArmed)) !== replaceKey(current)) {
    await update($, swapArmed, () => replaceKey(current))
    return
  }
  await update($, swapArmed, () => '')
  await generateQuests($, '')
}

// One open project quest swapped for a fresh one of its role, once per campaign.
async function swapProjectQuest($: EngineInterface, id: string): Promise<void> {
  const spare = templates(await scanTree($), [...tags])
  const swapped = await serial(async () => {
    const current = await freshBoard($)
    if (!current || current.swapUsed) return null
    const next = swapQuest(current, id, spare)
    if (!next) return null
    await saveBoard($, next)
    const i = current.items.findIndex(q => q.id === id)
    return { from: current.items[i]?.title ?? '', to: next.items[i]?.title ?? '' }
  })
  if (!swapped) toast($, 'No other quest fits this project right now.')
  else toast($, `Swapped: ${swapped.from} → ${swapped.to}. No swaps left this campaign.`)
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'room', label: 'Room' },
  { id: 'quests', label: 'Quests' },
  { id: 'trophies', label: 'Trophies' },
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'decor', label: 'Decor' },
]

export const QUESTS_HELP = [
  '/quests [focus]: Clawd scouts new quests for this project (a focus is optional, like /quests tests)',
  '/quests clear: drop the open quests (project trophies and hats stay)',
  '/quests reset: wipe this project\'s quests, project trophies and project hats (asks first)',
  '/quests allow <script>: count a repo script as a check, like /quests allow npm test',
  '/quests help: this list',
].join('\n')

// What finished tool work the queue applies after the tool result went back to the model.
type ToolDone = {
  tool: string; activity: Activity; mood: Mood; detail: string; ext: string | null
  path: string; command: string; added: string; removed: string // for project quests: relative path, the command, an edit's new and replaced text
  isError: boolean; mine: number; count: number; turnStart: number
  isBackground: boolean // started in the background (a Bash run, an Agent): it has not finished, so no done cheer
}

async function afterTool($: EngineInterface, t: ToolDone): Promise<void> {
  const now = await $.clock.now()
  const isFlowBroken = now - lastToolAt > FLOW_GAP_MS
  lastToolAt = now
  const streak = await update($, combo, n => (t.isError ? 0 : (isFlowBroken ? 0 : n) + 1))
  comboNow = streak
  if (t.count % 12 === 0) await update($, coffee, n => Math.max(0, n - 1))
  await update($, log, list => [...list, { verb: VERBS[t.activity], what: t.detail, isError: t.isError }].slice(-LOG_SIZE))
  await update($, stats, s => ({
    ...s,
    tools: s.tools + 1,
    edits: s.edits + (t.mood === 'coding' ? 1 : 0),
    reads: s.reads + (t.mood === 'reading' ? 1 : 0),
    runs: s.runs + (t.mood === 'running' ? 1 : 0),
    errors: s.errors + (t.isError ? 1 : 0),
  }))
  let announced = await play($, { type: 'tool', tool: t.tool, activity: t.activity, isError: t.isError, ext: t.ext, combo: streak, now })
  const ev = { activity: t.activity, path: t.path, command: t.command, added: t.added, removed: t.removed, isError: t.isError, turnStart: t.turnStart, now, cwd: cwdNow }
  announced = (await progressBoard($, now, b => onTool(b, ev))) ?? announced

  if (t.isError) {
    await showFor($, { mood: 'error', activity: t.activity, detail: t.detail, now }, 2200)
  } else if (announced) {
    await showFor($, { mood: 'happy', activity: t.activity, detail: t.detail, quip: announced, now }, 3000)
  } else {
    // a test run, a commit, a plan or a finished agent gets its own little cheer
    const beat = t.isBackground ? null : doneBeat(t.activity, t.command)
    if (beat) await showFor($, { mood: 'happy', activity: t.activity, detail: t.detail, quip: beat, now }, 2500)
    else if (activeTools === 0 && token === t.mine) restSoon($)
  }
}

// A usage threshold or a compaction: one line from Clawd, no toast. A sleeping Clawd only wakes for a compaction.
async function usageReact($: EngineInterface, kind: UsageNote, mood?: Mood): Promise<void> {
  const now = await $.clock.now()
  if (now < lineHoldUntil) {
    usagePending = { kind, mood }
    return
  }
  const cur = petNow ?? PET_START
  if (cur.mood === 'sleeping' && kind !== 'compact') return
  usageShown = { kind, mood, at: now }
  await showFor($, { mood: mood ?? cur.mood, activity: cur.activity, detail: cur.detail, quip: usageQuip(kind), now }, QUIP_HOLD_MS)
}

// Opens or closes the pane for good (the choice is kept across sessions).
async function setPaneHidden($: EngineInterface, hidden: boolean): Promise<void> {
  await update($, isHidden, () => hidden)
  await $.store.set(HIDDEN_KEY, hidden).catch(() => undefined)
}

// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'clawd', description: 'Open or close the Clawd mascot pane', immediate: true })
    } catch {
      // registered by an earlier start
    }
    try {
      await $.command.register({ name: 'quests', description: 'Project quests, trophies and hats', argumentHint: '[focus | clear | reset | allow <script> | help]' })
    } catch {
      // registered by an earlier start
    }
    try {
      // A setup another hook started (a hot reload or respawn runs this start alone, after them) finishes first:
      // reset under it, it would load nothing (no keys) yet mark the session loaded, and nothing would be saved.
      for (let i = 0; ensuring && i < 5; i++) await ensuring.catch(() => undefined)
      // the SDK starts drawing nowhere; a client that already attached (session.attach) draws after all
      isHeadless = !e.isInteractive && e.surface === null && (await $.session.surfaces().catch(() => [] as const)).length === 0
      isLoaded = false
      project = ''
      profileCache = undefined
      keys = undefined
      seenProfile = ''
      seenBoard = ''
      isFrozen = false
      saveWarned = false
      lineHoldUntil = 0
      usageShown = undefined
      usagePending = undefined
      limitRead = false
      usageLimit = undefined
      timer?.cancel()
      timer = undefined
      // A respawn of the same session keeps its meters; a new session starts them over.
      const sid = await $.session.id().catch(() => '')
      const u = await read($, usageAtom)
      let keep = sessionSeen !== '' && sid === sessionSeen
      if (sessionSeen === '' && u.at > 0) {
        const started = (await $.session.usage().catch(() => undefined))?.startedAt
        keep = typeof started === 'number' && u.at >= started
      }
      sessionSeen = sid
      if (!keep) await update($, usageAtom, () => USAGE_START)
      await ensureSession($).catch(() => undefined)
      const now = await $.clock.now()
      lastActiveAt = now

      const k = keys as ProjectKeys | undefined // set again by the setup above
      const worn = k ? sanitizeWornHat(await $.store.get(k.hat).catch(() => undefined)) : null
      const room = k ? migrateDecor(await $.store.get(k.decor).catch(() => undefined)) : {}
      await update($, decor, () => room)
      await update($, customHat, () => worn)

      const greeting = await play($, { type: 'session', project, now })
      await update($, hatAtom, () => profileCache?.hat ?? null)
      if (greeting) await showFor($, { mood: 'happy', quip: greeting, now }, 3500)

      if (!isHeadless) {
        const hidden = (await $.store.get(HIDDEN_KEY).catch(() => undefined)) === true
        await update($, isHidden, () => hidden)
        if (!hidden) bg($.ui.open({ id: PANE, title: 'Clawd' }))
      }
    } catch {
      // a broken start never stops the session
    }
    return next(e)
  })

  // The desktop app, VS Code or a phone joined: a session that started headless draws after all.
  on('session.attach', async ($, e, next) => {
    try {
      await attachSurface($, true)
    } catch {
      // a broken attach never stops the session
    }
    return next(e)
  })

  on('command.run', { command: 'clawd' }, async $ => {
    try {
      await ensureSession($).catch(() => undefined)
      const pane = (await $.ui.panes().catch(() => [])).find(item => item.id === PANE)
      if (pane?.isPlaced && pane.isShown) {
        await $.ui.close({ id: PANE }).catch(() => undefined)
        await setPaneHidden($, true)
        return { text: 'Clawd went for a walk.' }
      }
      await setPaneHidden($, false)
      const opened = await $.ui.open({ id: PANE, title: 'Clawd', focus: true }).catch(() => undefined)
      if (opened && !opened.isPlaced) return { text: 'Widen the terminal to see Clawd.' }
      return { text: 'Clawd is back.' }
    } catch {
      return { text: 'Clawd could not open the pane.' }
    }
  })

  on('command.run', { command: 'quests' }, async ($, e) => {
    await ensureSession($).catch(() => undefined)
    const raw = e.args.trim()
    const first = raw.split(/\s+/)[0] ?? ''
    const cmd = first.toLowerCase()
    const rest = raw.slice(first.length).trim()
    const where = project || 'this project'
    if (cmd === 'help') return { text: QUESTS_HELP }
    if (cmd === 'clear') {
      const cleared = await serial(async () => {
        const current = await freshBoard($)
        if (!current || current.items.length === 0) return false
        await saveBoard($, clearBoard(current))
        return true
      })
      return { text: cleared ? 'Project quests cleared. Project trophies and hats stay.' : 'No project quests to clear.' }
    }
    if (cmd === 'allow') {
      const script = scriptCommand(rest, cwdNow)
      if (!script) return { text: 'Clawd only counts a plain repo script this way, like /quests allow npm test or /quests allow make check.' }
      const now = await $.clock.now()
      await serial(async () => {
        const current = (await freshBoard($)) ?? emptyBoard(project, now)
        await saveBoard($, { ...current, approved: [...(current.approved ?? []).filter(a => a !== script), script].slice(-10) })
      })
      return { text: `Clawd counts "${script}" as a check now.` }
    }
    if (cmd === 'reset') {
      if (rest.toLowerCase() !== 'confirm') {
        const current = await serial(() => freshBoard($))
        if (!current) return { text: 'Nothing to reset.' }
        return { text: `This wipes the project quests, project trophies and project hats of ${where}. Your level, daily quests and catalog hats stay. Run /quests reset confirm to do it.` }
      }
      const wiped = await serial(async () => {
        const current = await freshBoard($)
        if (!current) return false
        genToken += 1 // a generation still running is dropped
        await saveBoard($, null)
        if ((await read($, customHat)) !== null) {
          await update($, customHat, () => null)
          if (keys) await $.store.delete(keys.hat).catch(() => undefined)
        }
        await update($, questGen, () => ({ status: 'idle', message: '' }))
        return true
      })
      return { text: wiped ? `Project quests reset. Project trophies and hats for ${where} are wiped.` : 'Nothing to reset.' }
    }
    await setPaneHidden($, false)
    await update($, tab, () => 'quests')
    bg($.ui.open({ id: PANE, title: 'Clawd' }))
    const asked = await $.clock.now()
    const gate = canRegenerate(await read($, board), asked)
    if (!gate.ok) return { text: `${gate.reason} (/quests clear drops the current quests.)` }
    // one generation at a time: a focus asked meanwhile would be dropped, so say so instead of claiming it
    const gen = await read($, questGen)
    if (gen.status === 'working' && !isStale(gen, asked)) {
      return { text: `Clawd is already scouting ${where} for quests.${raw ? ` Try /quests ${raw} again when this campaign arrives.` : ''}` }
    }
    // the open quests of the current campaign are dropped when the new one arrives: say so
    const current = await read($, board)
    const open = openQuestsOf(current)
    const replaced = current && open > 0
      ? ` The new campaign replaces ${current.campaign} and its ${open} open ${open === 1 ? 'quest' : 'quests'} (their progress is lost).`
      : ''
    bg(generateQuests($, raw))
    const watch = hasTabs ? ' Watch the Quests tab.' : ''
    return { text: `Clawd is scouting ${where} for quests${raw ? ` about "${raw}"` : ''}.${replaced}${watch}` }
  })

  // A model turn begins (a typed prompt or a continuation): its counters start over.
  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId === undefined) {
      try {
        const now = await $.clock.now()
        turnStartedAt = now
        turnTools = 0
        turnErrors = 0
        activeTools = 0
        lastActiveAt = now
      } catch {
        // the clock is the host's; nothing to start
      }
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await ensureQuick($)
    const result = await next(e)
    if (result.drop !== undefined) return result // a dropped prompt starts no turn
    try {
      const now = await $.clock.now()
      lastActiveAt = now
      const isNewTurn = e.turnId === undefined
      if (isNewTurn && turnStartedAt === 0) {
        activeTools = 0
        turnStartedAt = now
        turnTools = 0
        turnErrors = 0
      }
      // Only the person's own prompts react and count. A same-user socket (which the desktop app may
      // use) arrives unstamped as 'unclassified', so that one counts as the person's too.
      const kind = e.origin.kind
      if (kind !== 'composer' && kind !== 'bridge' && kind !== 'sdk' && kind !== 'unclassified') {
        if (isNewTurn) defer($, () => setMood($, { mood: 'thinking', now }))
        return result
      }

      const text = e.text
      const trimmed = text.trim()
      if (trimmed !== '' && !trimmed.startsWith('/')) bg(update($, recentPromptsAtom, list => [...list, trimmed.slice(0, 200)].slice(-6)))
      const reaction = promptReaction(text)
      defer($, async () => {
        const announced = await play($, { type: 'prompt', text, now })
        const line = announced ?? reaction
        if (line) {
          const mine = await setMood($, { mood: 'happy', quip: line, now })
          $.clock.after(3500, () => {
            if (token === mine) bg(restMood($))
          })
        } else if (isNewTurn) {
          await setMood($, { mood: 'thinking', now })
        }
      })
    } catch {
      // the prompt went in; Clawd just missed it
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    // A subagent's tool (a workflow's too): a mini Clawd works on it, the main Clawd stays as he
    // is (asleep, even) and nothing counts. Only this chat's own work moves the main Clawd.
    if (e.agentId !== undefined) {
      try {
        seenAgents.set(e.agentId, await $.clock.now())
        bg(syncHelpers($))
      } catch {
        // only a mini Clawd missed
      }
      return next(e)
    }

    let pre: { args: ToolArgs; path?: string; activity: Activity; mood: Mood; detail: string; now: number } | undefined
    try {
      await ensureQuick($)
      const now = await $.clock.now()
      const args = normArgs(e)
      const path = pathOf(args)
      const activity = activityFor(e.tool, args)
      const mood = moodFor(activity)
      const detail = detailFor(e.tool, args)
      pre = { args, path, activity, mood, detail, now }
      for (const tag of [...(path ? tagsFromPath(path) : []), ...(args.command ? tagsFromCommand(args.command) : [])]) tags.add(tag)
      if ((e.tool as string) === 'PowerShell') tags.add('powershell')
      activeTools += 1
      lastActiveAt = now
      if (activity === 'agent') {
        agentCalls += 1
        bg(syncHelpers($))
      }
      bg(setMood($, { mood, activity, detail, now }))
    } catch {
      pre = undefined
    }

    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      if (pre) {
        activeTools = Math.max(0, activeTools - 1)
        if (pre.activity === 'agent') {
          agentCalls = Math.max(0, agentCalls - 1)
          bg(syncHelpers($))
        }
      }
    }
    if (!pre) return result

    try {
      // A refused permission prompt is neutral: no count, no combo, no mood, no game or quest event.
      if (result.deny !== undefined) {
        if (activeTools === 0) restSoon($)
        return result
      }
      const isError = result.isError === true
      turnTools += 1
      if (isError) {
        turnErrors += 1
        errorsInRow += 1
      } else {
        errorsInRow = 0
      }
      const { args, path, activity, mood, detail } = pre
      const done: ToolDone = {
        tool: e.tool, activity, mood, detail, ext: extOf(path),
        path: path ? relativePath(path, cwdNow) : '', command: checkCommand(e.tool, args), added: addedText(args), removed: removedText(args),
        isError, mine: token, count: turnTools, turnStart: turnStartedAt || pre.now, isBackground: args.run_in_background === true,
      }
      defer($, () => afterTool($, done))
    } catch {
      // the tool ran; Clawd just missed it
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      if (seenAgents.delete(e.agentId)) bg(syncHelpers($))
      return next(e)
    }
    try {
      await ensureQuick($)
      const now = await $.clock.now()
      const toolCount = turnTools
      const errors = turnErrors
      const durationMs = typeof e.durationMs === 'number' && e.durationMs > 0 ? e.durationMs : turnStartedAt > 0 ? now - turnStartedAt : 0
      const turnStart = turnStartedAt || now
      turnStartedAt = 0
      turnTools = 0
      turnErrors = 0
      lastActiveAt = now
      turnCount += 1
      const reason = e.reason
      defer($, async () => {
        await update($, stats, s => ({ ...s, turns: s.turns + 1 }))
        if (reason === 'aborted' || reason === 'refusal') {
          await setMood($, { mood: 'idle', now })
          return
        }
        await update($, coffee, () => 3)
        if (reason !== 'error') await update($, questGen, (g): QuestGen => (g.status === 'error' ? { status: 'idle', message: '' } : g))
        const errorCount = errors + (reason === 'error' ? 1 : 0)
        let announced = await play($, { type: 'turn', durationMs, toolCount, errorCount, now })
        // every finished turn: the person may have written in their own editor (probesDue reads each at most once a turn)
        announced = (await refreshProbes($, turnStart, now)) ?? announced
        const mine = await setMood($, { mood: reason === 'error' ? 'error' : 'done', quip: announced, now })
        // a usage line shown just before this one comes back once it ends; one arriving meanwhile waits
        lineHoldUntil = now + TURN_LINE_MS
        if (usageShown && now - usageShown.at < QUIP_HOLD_MS) usagePending ??= usageShown
        usageShown = undefined
        $.clock.after(TURN_LINE_MS, () => {
          const p = usagePending
          usagePending = undefined
          if (p) bg(usageReact($, p.kind, p.mood))
          else if (token === mine) bg(restMood($))
        })
      })
    } catch {
      // the turn ended; Clawd just missed it
    }
    return next(e)
  })

  // Usage meters: the engine measures after each main-thread turn and when a limit moves a point.
  on('session.measure', async ($, e, next) => {
    try {
      await ensureQuick($)
      const now = await $.clock.now()
      let prev = await read($, usageAtom)
      if (limitsSeeded) {
        // stored limits stay only if this session has limits of its own (an API-key login has none)
        limitsSeeded = false
        if (!e.changed.includes('rateLimits') && !e.rateLimits?.length) prev = { ...prev, fiveHour: null, sevenDay: null }
      }
      const measured = measureUsage(prev, e, now, await readLimit($))
      const { kind, warned } = usageNote(measured)
      await update($, usageAtom, () => ({ ...measured, warned }))
      if (e.changed.includes('rateLimits') || kind) {
        bg($.store.set(LIMITS_KEY, { v: 1, fiveHour: measured.fiveHour, sevenDay: measured.sevenDay, warned: { fiveHour: warned.fiveHour, sevenDay: warned.sevenDay } }))
      }
      if (kind) defer($, () => usageReact($, kind))
    } catch {
      // the meters wait for the next reading
    }
    return next(e)
  })

  // A compaction of the main conversation that went through: the papers go into the archive box.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && result.skip === undefined) {
      try {
        await ensureQuick($)
        const now = await $.clock.now()
        limitRead = false // the window may have changed: read it again at the next measure
        await update($, usageAtom, u => compactUsage(u, now))
        defer($, () => usageReact($, 'compact', 'happy'))
      } catch {
        // the papers stay on the desk
      }
    }
    return result
  })

  // The loading row: our own verb, and on the desktop a tiny Clawd in front of the engine's line.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    let rewritten = e
    let shownScene: SceneShow | undefined
    try {
      // The verb follows the scene the mini Clawd shows (it dwells), and holds a moment so a quick
      // run of tools does not flick through five verbs; a held change redraws once the hold ends.
      shownScene = await read($, sceneAtom)
      const key = `${shownScene.mood}:${shownScene.activity}`
      const now = await $.clock.now()
      if (verbCache.key !== key) {
        const held = now - verbCache.at
        if (held >= VERB_HOLD_MS) {
          verbCache = { key, at: now, verb: spinnerVerb({ mood: shownScene.mood, activity: shownScene.activity, tags }) }
        } else if (!verbTimer) {
          verbTimer = $.clock.after(VERB_HOLD_MS - held, () => {
            verbTimer = undefined
            invalidate($)
          })
        }
      }
      // The terminal always gets the flavour verb; the desktop keeps the engine's own step text
      // and only swaps the generic word.
      const isGeneric = e.props.word === 'Working' || e.props.mode === 'thinking' || e.props.mode === 'requesting'
      if (e.surface === 'terminal' || isGeneric) rewritten = { ...e, props: { ...e.props, word: verbCache.verb } }
    } catch {
      rewritten = e
    }

    if (e.surface !== 'desktop' || !shownScene) return next(rewritten)
    const worn = await read($, customHat).catch(() => null)
    const hat: AnyHat = worn ?? (await read($, hatAtom).catch(() => null))
    const { Box, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Svg key="mini" source={mini(shownScene.mood, shownScene.activity, hat)} alt={`Clawd, ${shownScene.mood}`} width={40} height={25} isInteractive />
        {await next(rewritten)}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    try {
      const { mood, detail, quip } = await read($, pet)
      const p = (await read($, profileAtom)) ?? (await loadProfile($))
      const current = await read($, tab)
      const comboCount = await read($, combo)
      const projectBoard = await read($, board)
      const wornCustom = await read($, customHat)
      const gen = await read($, questGen)
      const now = await $.clock.now()
      // today's daily quests, even before the first event after midnight rolls the stored list
      const daily = dailyQuests(p, now)
      // Something draws the pane: the session is not headless (an attach this module missed, e.g. before a reload).
      if (isHeadless) bg(attachSurface($, false))
      // A drawn pane wants the quick ticker back (it slows down while hidden).
      if (tickMs === TICK_SLOW_MS && timer !== undefined && mood !== 'sleeping') {
        paneVisible = true
        startTimer($, TICK_FAST_MS)
      }
      const color = mood === 'error' ? RED : ORANGE
      const info = levelOf(p.xp)
      const { level, from, to } = info
      const barColor = info.isMax ? GOLD : ORANGE
      const trophyCount = unlockedCount(p)
      const cols = e.props.bodyColumns ?? 40
      // Full-width lines (the level bar, the section rules) stop a cell short, so they never wrap or truncate.
      const fullW = Math.max(8, cols - 1)
      const next1 = info.isMax ? undefined : nextUnlock(p, now)
      const streak = streakText(p, now)
      const frozenBanner = isFrozen && (() => {
        const { Text } = $.ui.resolve(e)
        return <Text dimColor wrap="wrap">This project was saved by a newer Clawd Quest. Progress is read-only until you update.</Text>
      })()
      const projectItems = projectBoard?.items ?? []
      const hasCampaign = projectBoard !== null && projectItems.length > 0

      if (e.surface === 'terminal') {
        terminalDrawnAt = tick
        const { Box, Text, Button } = $.ui.resolve(e)
        const f = await read($, frame)
        const claimable = sweepClaimable(p, now)
        // the terminal draws no decor (B26): its Next line names the next hat only
        const nextHat = info.isMax ? undefined : nextUnlock(p, now, 'hat')
        const compact = e.props.placement === 'inline' || (e.props.scroll?.bodyRows ?? 99) < 20
        const levelLine = (
          <Text wrap="truncate-end">
            <Text bold color={ORANGE}>{levelLabel(p.xp).replace(' · ', ' ')}</Text>
            <Text dimColor>{` · ${xpLabel(p.xp)} · ${streak}`}</Text>
          </Text>
        )
        const levelBar = <Text color={barColor} wrap="truncate-end">{bar(p.xp - from, to - from, fullW)}</Text>
        const claimButton = claimable && (
          <Box flexDirection="row" gap={1}>
            <Button key="claim-sweep" label={`Claim +${XP.sweep} xp (c)`} hotkey="c" variant="primary" onPress={() => claimSweep($)} />
            <Text dimColor wrap="truncate-end">Daily Sweep</Text>
          </Box>
        )
        const genLine = gen.status === 'working'
          ? <Text color={ORANGE} wrap="truncate-end">{gen.message}</Text>
          : gen.status === 'error'
            ? <Text color={RED} wrap="wrap">{`${gen.message} Run /quests to try again.`}</Text>
            : null
        if (compact) {
          const nextQuest = [...projectItems, ...daily].find(q => !q.done)
          const sprite = petAscii(mood, f)
          return (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Box flexDirection="column">{sprite.map(line => <Text color={color}>{line}</Text>)}</Box>
                <Box flexDirection="column" flexShrink={1}>
                  <Text bold color={color} wrap="wrap">{quip}</Text>
                  {detail !== '' && <Text dimColor wrap="truncate-end">{detail}</Text>}
                </Box>
              </Box>
              {levelLine}
              {levelBar}
              {frozenBanner}
              {nextQuest && (
                <Text wrap="truncate-end">
                  <Text color={ORANGE}>{'[ ] '}</Text>
                  <Text dimColor>{amount(nextQuest)}</Text>
                  <Text> {nextQuest.title}</Text>
                  <Text dimColor>  +{fmt(nextQuest.xp)} xp</Text>
                </Text>
              )}
              {claimButton}
              {genLine}
            </Box>
          )
        }
        const group = (title: string, items: Quest[]) => {
          const open = items.filter(q => !q.done)
          const shownItems = open.slice(0, 3)
          const w = Math.max(0, ...shownItems.map(q => amount(q).length))
          return (
            <Box flexDirection="column">
              <Text dimColor wrap="truncate-end">{title}</Text>
              {items.length > 0 && open.length === 0 && (
                <Text>
                  <Text color={GREEN}>{'  ✓ '}</Text>
                  <Text dimColor>all done</Text>
                </Text>
              )}
              {shownItems.map(q => (
                <Text wrap="truncate-end">
                  <Text color={ORANGE}>{'[ ] '}</Text>
                  <Text dimColor>{amount(q).padEnd(w)}</Text>
                  <Text> {q.title}</Text>
                  <Text dimColor>  +{fmt(q.xp)} xp</Text>
                </Text>
              ))}
              {open.length > 3 && <Text dimColor>  +{open.length - 3} more</Text>}
            </Box>
          )
        }
        return (
          <Box flexDirection="column">
            <Box flexDirection="column" alignItems="center">
              {petAscii(mood, f).map(line => <Text color={color}>{line}</Text>)}
              <Text bold color={color}>{quip}</Text>
              {detail !== '' ? <Text dimColor wrap="truncate-end">{detail}</Text> : <Text> </Text>}
            </Box>
            <Text> </Text>
            {levelLine}
            {levelBar}
            {nextHat && <Text dimColor wrap="truncate-end">Next: {nextHat.name} at Lv {nextHat.level}</Text>}
            {info.isMax && <Text dimColor wrap="truncate-end">{fmt(p.xp)} xp in all</Text>}
            {frozenBanner}
            <Text> </Text>
            {group('Daily', daily)}
            {claimButton}
            {hasCampaign && projectBoard && group(`Project: ${projectBoard.campaign}`, projectItems)}
            {genLine}
            <Text> </Text>
            <Text dimColor wrap="truncate-end">Trophies {trophyCount}/{ACHIEVEMENTS.length} · {where()}</Text>
            <Text dimColor wrap="truncate-end">
              <Text color={ORANGE}>/quests</Text>
              {' project quests · '}
              <Text color={ORANGE}>/clawd</Text>
              {' hide'}
              {claimable ? ' · ctrl+x tab, then c to claim' : ''}
            </Text>
          </Box>
        )
      }

      if (e.surface !== 'desktop' && e.surface !== 'vscode' && e.surface !== 'mobile') return next(e)
      const { Box, Text, Button, Svg } = $.ui.resolve(e)
      const hatNow: AnyHat = wornCustom ?? p.hat
      const isNarrow = cols < 50
      // Bars shrink with a narrow pane so the numbers after them stay in view.
      const barW = Math.max(8, Math.min(20, cols - 28))
      // A thin dim line between sections: it sits where a blank row would, so it adds no height.
      const rule = () => <Text dimColor wrap="truncate-end">{'─'.repeat(fullW)}</Text>
      // Stacks the parts that are there with a rule between each two, no other gap.
      const sections = (...parts: RenderChildren[]) => (
        <Box flexDirection="column">
          {parts.filter(part => part !== false && part !== null && part !== undefined).flatMap((part, i) => (i === 0 ? [part] : [rule(), part]))}
        </Box>
      )
      // Like sections, but the first part (the room, an intro line) stands free: a gap, no rule, under it.
      const led = (lead: RenderChildren, ...parts: RenderChildren[]) => (
        <Box flexDirection="column" gap={1}>
          {lead}
          {sections(...parts)}
        </Box>
      )
      const expanded = await read($, expandLocked)
      const fresh = new Set([...(p.fresh ?? []), ...seenSnapshot])
      const star = (key: string, name: string) => (fresh.has(key) ? `★ ${name}` : name)
      const progressAll = achievementProgress(p, now, EXT)
      const progressOf = new Map(progressAll.map(a => [a.def.id, a]))
      // A trophy-gated unlock's nearest trophy, with its progress: "Trophy: Librarian 412/1,000".
      const trophyLine = (unlock: Unlock): { text: string; ratio: number } => {
        const ids = [...(unlock.anyOf ?? []), ...(unlock.allOf ?? []), ...(unlock.keep ? [unlock.keep] : [])]
        const open = ids.map(id => progressOf.get(id)).filter(a => a !== undefined && !a.unlocked && !a.def.hidden && a.progress)
        const best = open.sort((a, b) => ratio(b!.progress) - ratio(a!.progress))[0]
        const req = requirementText(unlock, p)
        if (!best?.progress || ids.length > 1 && (unlock.allOf?.length ?? 0) > 1) return { text: req, ratio: best ? ratio(best.progress) : 0 }
        return { text: `${req} ${fmt(Math.min(best.progress.value, best.progress.goal))}/${fmt(best.progress.goal)}`, ratio: ratio(best.progress) }
      }
      const returnsText = (unlock: Unlock) => (unlock.month ? `Returns in ${MONTHS[unlock.month - 1]}` : requirementText(unlock, p))

      // Today's Daily Sweep bonus, while it waits for its claim (it expires at midnight).
      const claim = sweepClaimable(p, now) && (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Button key="claim-sweep" label={`Claim +${XP.sweep} xp`} variant="primary" onPress={() => claimSweep($)} />
          <Text dimColor wrap="truncate-end">Daily Sweep: every daily quest done</Text>
        </Box>
      )

      const QuestRow = (q: Quest, extra?: { why?: string; hint?: string; swap?: boolean; armed?: boolean }) => (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">
                <Text color={q.done ? GREEN : ORANGE}>{q.done ? '[x] ' : '[ ] '}</Text>
                <Text bold={!q.done} dimColor={q.done}>{q.title}</Text>
              </Text>
            </Box>
            {extra?.swap && (
              <Button key={`swap-${q.id}`} label={extra.armed ? 'Swap? Progress is lost' : 'Swap (1 left)'} variant={extra.armed ? 'primary' : 'secondary'} onPress={() => pressSwap($, q.id)} />
            )}
          </Box>
          {extra?.why !== undefined && extra.why !== '' && <Text dimColor wrap="truncate-end">    {extra.why}</Text>}
          <Text wrap="truncate-end">
            <Text color={q.done ? GREEN : ORANGE}>    {bar(Math.min(q.progress, q.goal), q.goal, barW)}</Text>
            <Text dimColor>  {amount(q)} · +{fmt(q.xp)} xp</Text>
          </Text>
          {extra?.hint && !q.done && <Text dimColor wrap="wrap">    {extra.hint}</Text>}
        </Box>
      )

      const hasFreshHats = (p.fresh ?? []).some(k => k.startsWith('hat:'))
      const hasFreshDecor = (p.fresh ?? []).some(k => k.startsWith('decor:'))
      const tabBar = (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {TABS.map(item => {
            const dot = (item.id === 'wardrobe' && hasFreshHats) || (item.id === 'decor' && hasFreshDecor)
            return <Button key={`tab-${item.id}`} label={dot ? `${item.label} •` : item.label} variant={item.id === current ? 'primary' : 'secondary'} onPress={() => openTab($, item.id)} />
          })}
        </Box>
      )

      // Line 3: the project, the streak, what unlocks next; the parts drop in that order as the pane narrows.
      const line3 = [
        cols >= 60 ? where() : '',
        cols >= 40 ? streak : '',
        next1 ? `Next: ${next1.name} at Lv ${next1.level}` : info.isMax ? `${fmt(p.xp)} xp in all` : '',
      ].filter(Boolean).join(' · ')
      const header = (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text bold color={ORANGE}>{levelLabel(p.xp)}</Text>
            <Text dimColor>{'   '}{xpLabel(p.xp)}</Text>
          </Text>
          <Text color={barColor} wrap="truncate-end">{bar(p.xp - from, to - from, fullW)}</Text>
          {line3 !== '' && <Text dimColor wrap="truncate-end">{line3}</Text>}
          {frozenBanner}
        </Box>
      )

      // An empty project section points at the Quests tab, where the button lives.
      const gotoQuests = (key: string) => (
        <Box flexDirection="row">
          <Button key={key} label="Go to Quests" variant="secondary" onPress={() => openTab($, 'quests')} />
        </Box>
      )

      let body
      if (current === 'quests') {
        // a generation nobody runs any more (stale, or left by an earlier module) does not block the button
        const isWorking = gen.status === 'working' && !isStale(gen, now)
        const gate = projectBoard ? canRegenerate(projectBoard, now) : { ok: true }
        const dailyDone = daily.filter(q => q.done).length
        const projectDone = projectItems.filter(q => q.done).length
        const canSwap = projectBoard !== null && !projectBoard.swapUsed
        const armed = await read($, swapArmed)
        // a new campaign drops the open quests: the button says so, and asks twice when one has progress
        const openLeft = openQuestsOf(projectBoard)
        const isReplaceArmed = projectBoard !== null && armed === replaceKey(projectBoard)
        body = sections(
          <Box flexDirection="column" gap={1}>
            <Text bold>Daily quests <Text dimColor>{dailyDone}/{daily.length} · resets at midnight</Text></Text>
            {daily.map(q => QuestRow(q))}
            {claim}
          </Box>,
          <Box flexDirection="column" gap={1}>
            <Text bold wrap="truncate-end">
              Project quests{hasCampaign && projectBoard ? `: ${projectBoard.campaign}` : ''}
              {hasCampaign && <Text dimColor> {projectDone}/{projectItems.length}</Text>}
            </Text>
            {isWorking && <Text color={ORANGE}>{gen.message}</Text>}
            {gen.status === 'error' && <Text color={RED} wrap="wrap">{`${gen.message} Press the button to try again.`}</Text>}
            {!projectBoard && !isWorking && (
              <Text dimColor>No quests for {where()} yet. Clawd can read the project and invent some.</Text>
            )}
            {projectBoard && !hasCampaign && !isWorking && <Text dimColor>No active campaign. Clawd can scout new quests.</Text>}
            {canSwap && projectItems.some(q => !q.done) && (
              <Text dimColor wrap="wrap">One swap per campaign; the swapped quest's progress is lost.</Text>
            )}
            {projectItems.map(q => QuestRow(q, {
              why: q.why, hint: checkHint(q.check), swap: canSwap && !q.done, armed: projectBoard !== null && armed === swapKey(projectBoard, q.id),
            }))}
            {projectBoard?.isComplete && hasCampaign && (
              <Text>
                <Text color={GOLD}>★ </Text>
                <Text bold>Campaign complete. Clawd is proud of you.</Text>
              </Text>
            )}
            {!gate.ok && !isWorking ? (
              <Text dimColor>New project quests unlock when this campaign is done, or tomorrow.</Text>
            ) : (
              <Box flexDirection="row" gap={1}>
                <Button
                  key="gen-quests"
                  label={isWorking ? 'Scouting...' : isReplaceArmed ? 'Replace campaign? Progress is lost' : openLeft > 0 ? 'Replace campaign' : hasCampaign ? 'New project quests' : 'Generate project quests'}
                  variant={isWorking || (openLeft > 0 && !isReplaceArmed) ? 'secondary' : 'primary'}
                  onPress={isWorking ? () => undefined : () => pressNewQuests($)}
                />
              </Box>
            )}
          </Box>,
        )
      } else if (current === 'trophies') {
        const isExpanded = await read($, expandTrophies)
        const showAllUnlocked = expanded.includes('trophies:unlocked')
        const unlocked = progressAll
          .filter(a => a.unlocked)
          .sort((a, b) => (b.unlockedAt ?? p.achievements[b.def.id] ?? 0) - (a.unlockedAt ?? p.achievements[a.def.id] ?? 0))
        const hiddenLeft = ACHIEVEMENTS.filter(a => a.hidden).length - unlocked.filter(a => a.def.hidden).length
        const locked = progressAll.filter(a => !a.unlocked && !a.def.hidden).sort((a, b) => ratio(b.progress) - ratio(a.progress))
        const nextUp = locked.slice(0, 3)
        const moreLocked = locked.slice(3)
        const milestones = projectBoard?.milestones ?? []
        // name — description on one line; a narrow pane puts the description on its own dim line
        const named = (mark: RenderChildren, name: string, description: string, isBold: boolean) => (
          isNarrow ? (
            <Box flexDirection="column">
              <Text wrap="truncate-end">{mark}<Text bold={isBold}>{name}</Text></Text>
              <Text dimColor wrap="wrap">    {description}</Text>
            </Box>
          ) : (
            <Text wrap="truncate-end">
              {mark}
              <Text bold={isBold}>{name}</Text>
              <Text dimColor>{' — '}{description}</Text>
            </Text>
          )
        )
        body = sections(
          <Box flexDirection="column" gap={1}>
            <Text bold>Trophies {trophyCount}/{ACHIEVEMENTS.length}</Text>
            {nextUp.length > 0 && (
              <Box flexDirection="column">
                <Text bold>Next up</Text>
                {nextUp.map(a => (
                  <Box flexDirection="column">
                    {named(<Text dimColor>{'☆ '}</Text>, a.def.name, a.def.description, false)}
                    {a.progress && (
                      <Text wrap="truncate-end">
                        <Text color={ORANGE}>    {bar(a.progress.value, a.progress.goal, barW)}</Text>
                        <Text dimColor>  {fmt(Math.min(a.progress.value, a.progress.goal))}/{fmt(a.progress.goal)} · +{fmt(achievementXp(a.def.id))} xp</Text>
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>,
          <Box flexDirection="column">
            <Text bold wrap="truncate-end">Project trophies{project ? `: ${project}` : ''}</Text>
            {!projectBoard && <Text dimColor>No project trophies yet.</Text>}
            {!projectBoard && gotoQuests('goto-quests-trophies')}
            {projectBoard && milestones.length === 0 && <Text dimColor>Run /quests and Clawd sets milestones for this project.</Text>}
            {milestones.map(m => (
              <Box flexDirection="column">
                {named(<Text color={m.done ? GOLD : undefined} dimColor={!m.done}>{m.done ? '★ ' : '☆ '}</Text>, m.name, m.description, m.done)}
                {!m.done && (
                  <Text wrap="truncate-end">
                    <Text color={ORANGE}>    {bar(m.progress, m.goal, barW)}</Text>
                    <Text dimColor>  {fmt(m.progress)}/{fmt(m.goal)} · +{fmt(m.xp)} xp</Text>
                  </Text>
                )}
              </Box>
            ))}
          </Box>,
          <Box flexDirection="column">
            <Text bold>Unlocked</Text>
            {unlocked.length === 0 && <Text dimColor>None yet. Keep going.</Text>}
            {(showAllUnlocked ? unlocked : unlocked.slice(0, 8)).map(a => named(<Text color={GOLD}>★ </Text>, a.def.name, a.def.description, true))}
            {unlocked.length > 8 && (
              <Box flexDirection="row">
                <Button key="toggle-unlocked" label={showAllUnlocked ? 'Show fewer' : `Show all (${unlocked.length})`} variant="secondary" onPress={() => toggleLocked($, 'trophies:unlocked')} />
              </Box>
            )}
          </Box>,
          (moreLocked.length > 0 || hiddenLeft > 0) && (
            <Box flexDirection="column">
              <Box flexDirection="row">
                <Button key="toggle-locked" label={isExpanded ? 'Hide locked' : `Show all locked (${moreLocked.length + hiddenLeft})`} variant="secondary" onPress={() => update($, expandTrophies, v => !v)} />
              </Box>
              {isExpanded && moreLocked.map(a => {
                const done = a.progress ? `  ${fmt(Math.min(a.progress.value, a.progress.goal))}/${fmt(a.progress.goal)}` : ''
                // narrow: the two-line layout like the other lists, the progress after the description
                return isNarrow ? (
                  <Box flexDirection="column">
                    <Text dimColor wrap="truncate-end">{'☆ '}{a.def.name}</Text>
                    <Text dimColor wrap="wrap">    {a.def.description}{done}</Text>
                  </Box>
                ) : (
                  <Text wrap="truncate-end" dimColor>{'☆ '}{a.def.name}{' — '}{a.def.description}{done}</Text>
                )
              })}
              {isExpanded && hiddenLeft > 0 && (
                <Text dimColor wrap="truncate-end">{'☆ '}???{' — '}{`${hiddenLeft} hidden ${hiddenLeft === 1 ? 'trophy' : 'trophies'} left to find`}</Text>
              )}
            </Box>
          ),
        )
      } else if (current === 'decor') {
        const roomDecor = resolveDecor(await read($, decor), p, now)
        // A small look at each slot as the room shows it now (empty room, cropped to the piece).
        const d = new Date(now)
        const previewBase: SceneInput = {
          mood: 'idle', activity: 'none', hat: null, hour: d.getHours(), minute: d.getMinutes(), month: d.getMonth() + 1, day: d.getDate(),
          helpers: 0, combo: 0, trophies: trophyCount, plantStage: plantStage(p.totals.turns), level, coffee: await read($, coffee), decor: roomDecor,
        }
        // a wide strip (ceiling, rug, a floor-lane roommate) takes a row of its own, as wide as the room
        // An empty slot ('Nothing', 'Bare wall', ...) has no piece to show: no blank box, just the buttons, like 'Nobody'.
        const preview = (slot: DecorSlot, label: string) => {
          if (roomDecor[slot] === 'none') return null
          const crop = decorPreview(previewBase, slot, 1)
          const m = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(crop)
          if (!m) return null
          const size = previewSize(Number(m[1]), Number(m[2]), Math.max(180, cols * 8 - 8))
          const node = <Svg key={`decor-preview-${slot}-${roomDecor[slot]}`} source={crop} alt={`${label}: ${DECOR.find(x => x.slot === slot && x.id === roomDecor[slot])?.name ?? roomDecor[slot]}`} width={size.width} height={size.height} />
          return { node, isWide: size.isWide }
        }
        body = led(
          <Box flexDirection="column">
            <Text dimColor>Rearrange Clawd's room. Levels and trophies unlock new pieces.</Text>
            <Text dimColor>Decor {decorOwnedCount(p, now)}/{decorTotal()}</Text>
          </Box>,
          ...SLOTS.map(({ slot, label }) => {
            const items = DECOR.filter(x => x.slot === slot)
            // counted like the header: the default and empty options are always there and do not count
            const real = (list: readonly DecorItem[]) => list.filter(x => x.kind !== 'default').length
            const open = items.filter(x => isUnlocked(x, p, now))
            const locked = items.filter(x => !isUnlocked(x, p, now))
            const byLevel = locked.filter(x => x.kind === 'level' && x.unlock.level !== undefined).sort((a, b) => (a.unlock.level ?? 0) - (b.unlock.level ?? 0))
            const firstLevel = byLevel[0]?.unlock.level
            // only the default so far, and the first piece is far off: one dim line
            if (open.every(x => x.kind === 'default') && firstLevel !== undefined && firstLevel - level > 10) {
              return <Text dimColor wrap="truncate-end">{label} · first piece at Lv {firstLevel}</Text>
            }
            const trophyNext = locked
              .filter(x => x.kind === 'trophy')
              .map(x => ({ item: x, line: trophyLine(x.unlock) }))
              .sort((a, b) => b.line.ratio - a.line.ratio)[0]
            const nextText = byLevel[0]
              ? `Next: ${byLevel[0].name} · Lv ${firstLevel}`
              : trophyNext ? `Next: ${trophyNext.item.name} · ${shortReq(trophyNext.line.text)}` : ''
            const key = `decor:${slot}`
            const isOpenList = expanded.includes(key)
            const look = preview(slot, label)
            const info = (
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Text bold>{label} <Text dimColor>{real(open)}/{real(items)}</Text></Text>
                <Box flexDirection="row" gap={1} flexWrap="wrap">
                  {open.map(x => (
                    <Button key={`decor-${slot}-${x.id}`} label={star(freshKey(x), x.name)} variant={roomDecor[slot] === x.id ? 'primary' : 'secondary'} onPress={() => setDecor($, slot, x.id)} />
                  ))}
                </Box>
                {nextText !== '' && <Text dimColor wrap="truncate-end">{nextText}</Text>}
                {locked.length > 0 && (
                  <Box flexDirection="row">
                    <Button key={`toggle-${key}`} label={isOpenList ? 'Hide locked' : `+${locked.length} locked`} variant="secondary" onPress={() => toggleLocked($, key)} />
                  </Box>
                )}
                {isOpenList && locked.map(x => (
                  <Text dimColor wrap="truncate-end">{x.name}{' · '}{x.kind === 'seasonal' ? returnsText(x.unlock) : shortReq(requirementOf(x, p))}</Text>
                ))}
              </Box>
            )
            return look?.isWide ? (
              <Box flexDirection="column">
                {look.node}
                {info}
              </Box>
            ) : (
              <Box flexDirection="row" alignItems="center" gap={2}>
                {look?.node}
                {info}
              </Box>
            )
          }),
        )
      } else if (current === 'wardrobe') {
        const available = new Set(availableHats(p, now))
        const projectHats = unlockedProjectHats(projectBoard)
        const lockedHats = HATS.filter(item => !available.has(item.id) && !isOpen(item.unlock, p, now))
        const lockedProjectHats = (projectBoard?.hats ?? []).filter(hat => !projectHats.some(u => u.id === hat.id))
        const mirrorW = Math.max(160, Math.min(cols * 8 - 16, 360))
        const levelLocked = lockedHats.filter(h => h.kind === 'level').sort((a, b) => (a.unlock.level ?? 0) - (b.unlock.level ?? 0))
        const trophyLocked = lockedHats
          .filter(h => h.kind === 'trophy')
          .map(h => ({ hat: h, line: trophyLine(h.unlock) }))
          .sort((a, b) => b.line.ratio - a.line.ratio)
        const seasonal = lockedHats.filter(h => h.kind === 'seasonal')
        const best = trophyLocked[0]
        // a level hat that a trophy opens too says so ('Wizard Hat · Lv 10 or trophy: Polyglot 3/5')
        const levelText = (h: (typeof levelLocked)[number], you: boolean) => {
          const { level: need, ...route } = h.unlock
          const base = `Lv ${need}${you ? ` (you: ${level})` : ''}`
          if (!route.anyOf?.length && !route.allOf?.length) return base
          const t = trophyLine(route).text
          return `${base} or ${t.charAt(0).toLowerCase()}${t.slice(1)}`
        }
        const upNext = [
          ...levelLocked.slice(0, best ? 2 : 3).map(h => `${h.name} · ${levelText(h, true)}`),
          ...(best ? [`${best.hat.name} · ${best.line.text}`] : []),
        ]
        const isWardrobeOpen = expanded.includes('wardrobe')
        const allLocked = [
          ...levelLocked.map(h => `${h.name} · ${levelText(h, false)}`),
          ...trophyLocked.map(t => `${t.hat.name} · ${t.line.text}`),
          ...seasonal.map(h => `${h.name} · ${returnsText(h.unlock)}`),
        ]
        body = sections(
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" justifyContent="center">
              <Svg key={`mirror-${wornCustom?.id ?? p.hat ?? 'none'}`} source={mini('happy', 'none', hatNow, true)} alt={`Clawd in the mirror${hatNow ? `, wearing the ${hatName(p.hat, wornCustom)}` : ''}`} width={mirrorW} height={Math.round(mirrorW * MIRROR_RATIO)} isInteractive />
            </Box>
            <Text bold>Hats <Text dimColor>{available.size}/{HATS.length}</Text></Text>
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="hat-none" label="No hat" variant={hatNow === null ? 'primary' : 'secondary'} onPress={() => wear($, null)} />
              {HATS.filter(item => available.has(item.id)).map(hat => (
                <Button key={`hat-${hat.id}`} label={star(`hat:${hat.id}`, hat.name)} variant={!wornCustom && p.hat === hat.id ? 'primary' : 'secondary'} onPress={() => wear($, hat.id)} />
              ))}
            </Box>
            {upNext.length > 0 && (
              <Box flexDirection="column">
                <Text dimColor>Up next</Text>
                {upNext.map(text => <Text dimColor wrap="truncate-end">{'· '}{text}</Text>)}
              </Box>
            )}
            {allLocked.length > 0 && (
              <Box flexDirection="column">
                <Box flexDirection="row">
                  <Button key="toggle-wardrobe" label={isWardrobeOpen ? 'Hide locked' : `Show all locked (${allLocked.length})`} variant="secondary" onPress={() => toggleLocked($, 'wardrobe')} />
                </Box>
                {isWardrobeOpen && allLocked.map(text => <Text dimColor wrap="truncate-end">{'· '}{text}</Text>)}
              </Box>
            )}
          </Box>,
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Text bold wrap="truncate-end">Project hats{project ? `: ${project}` : ''}</Text>
              {!projectBoard && <Text dimColor>No project hats yet.</Text>}
              {!projectBoard && gotoQuests('goto-quests-wardrobe')}
              {projectBoard && projectBoard.hats.length === 0 && <Text dimColor>Run /quests and Clawd designs hats for this project.</Text>}
            </Box>
            {projectHats.length > 0 && (
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {projectHats.map(hat => (
                  <Button key={`phat-${hat.id}`} label={hat.name} variant={wornCustom?.id === hat.id ? 'primary' : 'secondary'} onPress={() => wearCustom($, hat)} />
                ))}
              </Box>
            )}
            {lockedProjectHats.length > 0 && (
              <Box flexDirection="column">
                <Text dimColor>Locked</Text>
                {lockedProjectHats.map(hat => {
                  const milestone = projectBoard?.milestones.find(m => m.id === hat.milestoneId)
                  return <Text dimColor wrap="truncate-end">{'· '}{hat.name}{' · '}{`Earn "${milestone?.name ?? 'a project trophy'}"`}</Text>
                })}
              </Box>
            )}
          </Box>,
        )
      } else {
        const d = new Date(now)
        const width = Math.max(180, Math.min(cols * 8 - 8, 1100))
        const shownScene = await read($, sceneAtom)
        const u = await read($, usageAtom)
        const party = await read($, celebrate)
        const scene: SceneInput = {
          mood: shownScene.mood, activity: shownScene.activity, hat: hatNow, hour: d.getHours(), minute: d.getMinutes(), month: d.getMonth() + 1, day: d.getDate(),
          // The walk and fades stay in the source for the whole scene; phaseSvg below makes a later
          // redraw resume them where they are (finished, usually) rather than replay them.
          fromX: shownScene.fromX ?? undefined,
          fromY: shownScene.fromY ?? undefined,
          fromMood: shownScene.fromMood ?? undefined,
          fromActivity: shownScene.fromActivity ?? undefined,
          helpers: await read($, helpers),
          combo: comboTier(comboCount),
          trophies: trophyCount + (projectBoard?.milestones.filter(m => m.done).length ?? 0),
          plantStage: plantStage(p.totals.turns),
          level,
          coffee: await read($, coffee),
          decor: resolveDecor(await read($, decor), p, now),
          usage: sceneUsage(u, now),
          celebrate: party && now < party.until ? party.kind : undefined,
        }
        // The one quest to work on next (project quests first).
        const open: Quest[] = [...projectItems, ...daily].filter(q => !q.done).slice(0, 1)
        // The next trophy, named, with what it takes: open project milestones first, then the achievement closest to done.
        const nextTrophies: Array<{ name: string; description: string; value: number; goal: number }> = [
          ...(projectBoard?.milestones ?? []).filter(m => !m.done).map(m => ({ name: m.name, description: m.description, value: Math.min(m.progress, m.goal), goal: m.goal })),
          ...progressAll
            .filter(a => !a.unlocked && !a.def.hidden && a.progress && a.progress.goal > 0)
            .map(a => ({ name: a.def.name, description: a.def.description, value: Math.min(a.progress!.value, a.progress!.goal), goal: a.progress!.goal }))
            .sort((x, y) => y.value / y.goal - x.value / x.goal),
        ].slice(0, 1)
        // A brand-new room keeps to the intro: no empty trophy line, no empty log.
        const isNew = p.totals.tools === 0
        // What this project earned lately, newest first.
        const recent = [...(p.recent ?? [])].reverse()
        body = led(
          <Box flexDirection="column" alignItems="center">
            <Svg key="scene" source={phasedScene(sceneSvg(scene), shownScene.at, now, u.at)} alt={`Clawd's room, ${shownScene.mood}.${usageAlt(u, now)}`} width={width} height={Math.round(width * SCENE_RATIO)} isInteractive />
            <Text bold color={color}>{quip}</Text>
            {detail !== '' ? <Text dimColor wrap="truncate-end">{detail}</Text> : <Text> </Text>}
          </Box>,
          isNew && (
            <Box flexDirection="column">
              <Text dimColor>Clawd reacts to what Claude does. Most tool calls earn xp.</Text>
              <Text dimColor>Every project folder has its own Clawd level.</Text>
              <Text dimColor>Daily quests reset at midnight. Levels and trophies unlock hats and decor.</Text>
              <Text dimColor>Try /quests for project-specific quests.</Text>
            </Box>
          ),
          <Box flexDirection="column">
            <Text bold>Next quest</Text>
            {/* the sweep waits for its claim even while a project quest is still open */}
            {claim}
            {open.length === 0 && !claim && <Text dimColor>All done for now. Try /quests for project quests.</Text>}
            {open.map(q => (
              <Text wrap="truncate-end">
                <Text color={ORANGE}>{bar(Math.min(q.progress, q.goal), q.goal, 8)}</Text>
                <Text dimColor>  {amount(q)}  </Text>
                <Text>{q.title}</Text>
                <Text dimColor>  +{fmt(q.xp)} xp</Text>
              </Text>
            ))}
          </Box>,
          !isNew && nextTrophies.length > 0 && (
            <Box flexDirection="column">
              <Text bold>Next trophy</Text>
              {nextTrophies.map(t => (
                <Text wrap="truncate-end">
                  <Text color={GOLD}>{bar(t.value, t.goal, 8)}</Text>
                  <Text dimColor>  {fmt(t.value)}/{fmt(t.goal)}  </Text>
                  <Text>{t.name}</Text>
                  <Text dimColor>{' · '}{t.description}</Text>
                </Text>
              ))}
            </Box>
          ),
          !isNew && (
            <Box flexDirection="column">
              <Text bold>Recent</Text>
              {recent.length === 0 && <Text dimColor>Nothing yet. Finished quests, trophies and level-ups show up here.</Text>}
              {recent.map(entry => (
                <Text wrap="truncate-end">
                  <Text color={GOLD}>{entry.verb}</Text>
                  <Text>{' · '}{entry.what}</Text>
                  <Text dimColor>{'  '}{ago(now - entry.at)}</Text>
                </Text>
              ))}
            </Box>
          ),
        )
      }

      // No rules around the xp header: plain gaps keep it airy without boxing it in.
      return (
        <Box flexDirection="column" gap={1}>
          {tabBar}
          {header}
          {body}
        </Box>
      )
    } catch (err) {
      // a broken drawing must not take the pane away: a plain line instead
      try {
        $.ui.log(`clawd-quest pane: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      } catch {
        // no log here
      }
      const { Text } = $.ui.resolve(e)
      return <Text dimColor wrap="wrap">Clawd tripped over his own claws. He will be right back.</Text>
    }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      try {
        await setPaneHidden($, true)
      } catch {
        // the pane closes all the same
      }
    }
    return next(e)
  })
}

function where(): string {
  return project || 'this project'
}
