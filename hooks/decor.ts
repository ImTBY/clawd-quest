import type { DecorChoice, DecorSlot, Profile, Unlock } from '../types'
import { HATS, isOpen, levelOf, requirementText, XP_AT } from './game'

// Room decor Clawd unlocks with levels, trophies and seasons; the person picks one variant per slot.
// The catalog (ids, names, unlock rules) is a contract with saved games. Never raise an existing level gate:
// older saves rely on every rule staying as it is.

export type DecorItem = {
  slot: DecorSlot
  id: string
  name: string
  unlock: Unlock
  kind: 'default' | 'level' | 'trophy' | 'seasonal' // 'default' = the slot default or 'none'
}

export const SLOTS: ReadonlyArray<{ slot: DecorSlot; label: string }> = [
  { slot: 'drink', label: 'Desk drink' },
  { slot: 'plant', label: 'Plant' },
  { slot: 'poster', label: 'Poster' },
  { slot: 'rug', label: 'Rug' },
  { slot: 'shelf', label: 'Shelf top' },
  { slot: 'companion', label: 'Roommate' },
  { slot: 'bed', label: 'Pet bed' },
  { slot: 'lamp', label: 'Desk lamp' },
  { slot: 'clock', label: 'Clock' },
  { slot: 'ceiling', label: 'Ceiling' },
  { slot: 'wall', label: 'Wall hanging' },
  { slot: 'view', label: 'Window view' },
]

// Rule shorthands. D = always there (the slot default or the empty option).
const D: Unlock = {}
const L = (level: number): Unlock => ({ level })
const T = (...anyOf: string[]): Unlock => ({ anyOf })
const S = (month: number, keep: string): Unlock => ({ month, keep })

type Row = readonly [id: string, name: string, unlock: Unlock]

const TABLE: Record<DecorSlot, readonly Row[]> = {
  drink: [
    ['coffee', 'Coffee', D],
    ['tea', 'Tea', L(3)],
    ['energy', 'Clawd Energy', L(5)],
    ['espresso', 'Triple Espresso', T('night-owl')],
    ['boba', 'Boba Tea', L(12)],
    ['cocoa', 'Hot Cocoa', L(8)],
    ['matcha', 'Matcha Latte', L(26)],
    ['potion', 'Mana Potion', L(52)],
    ['goblet', 'Golden Goblet', L(98)],
  ],
  plant: [
    ['fern', 'Fern', D],
    ['cactus', 'Cactus', L(4)],
    ['sunflower', 'Sunflower', T('streak-7')],
    ['monstera', 'Monstera', T('bookworm')],
    ['bonsai', 'Bonsai', L(10)],
    ['succulents', 'Succulent Trio', L(18)],
    ['flytrap', 'Venus Flytrap', L(27)],
    ['orchid', 'Orchid', L(40)],
    ['crystal', 'Crystal Flower', L(78)],
    ['sakura', 'Cherry Blossom Bonsai', T('resident')],
    ['xmastree', 'Pixel Christmas Tree', S(12, 'holiday-coder')],
  ],
  poster: [
    ['none', 'Bare wall', D],
    ['space', 'Space Clawd', L(5)],
    ['terminal', 'Terminal', T('hundred-club')],
    ['cat', 'Cat Poster', T('hello-world')],
    ['wave', 'The Great Wave', L(9)],
    ['clawd', 'Self Portrait', L(15)],
    ['synthwave', 'Synthwave Sunset', L(21)],
    ['starry', 'Starry Swirl', L(47)],
    ['halloffame', 'Hall of Fame', L(96)],
    ['neon', 'Neon SHIP IT', T('ship-it')],
    ['map', 'Treasure Map', T('deep-diver')],
    ['blueprint', 'Clawd Blueprint', T('novelist')],
    ['kraken', 'The Kraken', T('tools-50k')],
  ],
  rug: [
    ['none', 'Bare floor', D],
    ['stripes', 'Striped Rug', L(3)],
    ['round', 'Round Rug', L(6)],
    ['checker', 'Diner Checker', T('clean-sweep')],
    ['braided', 'Braided Oval', L(24)],
    ['galaxy', 'Galaxy Rug', L(58)],
    ['redcarpet', 'Red Carpet', L(100)],
    ['welcome', 'Welcome Mat', T('welcome-back')],
  ],
  shelf: [
    ['none', 'Empty', D],
    ['duck', 'Rubber Duck', T('rubber-duck')],
    ['globe', 'Globe', T('explorer')],
    ['lava', 'Lava Lamp', L(8)],
    ['boombox', 'Boombox', L(14)],
    ['arcade', 'Mini Arcade', L(29)],
    ['statue', 'Golden Clawd', L(100)],
    ['cradle', "Newton's Cradle", T('collector')],
    ['rubik', 'Puzzle Cube', T('babel')],
    ['train', 'Toy Train', T('release-train')],
    ['sword', 'Sword in the Stone', T('boss-slayer')],
    ['hatstand', 'Hat Stand', T('fashion-icon')],
  ],
  companion: [
    ['none', 'Nobody', D],
    ['fishbowl', 'Goldfish', T('polite')],
    ['cat', 'Cat', L(10)],
    ['roomba', 'Robot Vacuum', T('thousand-hands')],
    ['corgi', 'Corgi', L(42)],
    ['clawdlet', 'Clawdlet', L(50)],
    ['rover', 'Mars Rover', L(75)],
    ['dragon', 'Tiny Dragon', L(100)],
    ['drone', 'Buddy Drone', T('director')],
    ['snail', 'Snail', T('marathon')],
    ['axolotl', 'Axolotl Tank', T('streak-60')],
    ['ghost', 'Friendly Ghost', S(10, 'trick-or-commit')],
  ],
  bed: [
    ['cushion', 'Blue Cushion', D],
    ['basket', 'Wicker Basket', L(10)],
    ['throne', 'Velvet Throne', L(25)],
    ['clam', 'Giant Clam', L(50)],
    ['pod', 'Sleep Pod', L(63)],
    ['box', 'Cardboard Box', T('persistence')],
    ['beanbag', 'Beanbag', T('storyteller')],
    ['cloud', 'Cloud Bed', T('streak-30')],
  ],
  lamp: [
    ['desk', 'Desk Lamp', D],
    ['bankers', "Banker's Lamp", L(16)],
    ['anglepoise', 'Anglepoise', L(30)],
    ['lantern', 'Camp Lantern', L(45)],
    ['moon', 'Moon Lamp', L(56)],
    ['plasma', 'Plasma Ball', L(67)],
    ['candle', 'Candlestick', T('early-bird')],
  ],
  clock: [
    ['classic', 'Wall Clock', D],
    ['cuckoo', 'Cuckoo Clock', L(19)],
    ['porthole', 'Porthole Clock', L(37)],
    ['sunburst', 'Sunburst Clock', L(48)],
    ['golden', 'Golden Clock', L(93)],
    ['tail', 'Tail Clock', T('streak-100')],
  ],
  ceiling: [
    ['none', 'Bare ceiling', D],
    ['fairy', 'Fairy Lights', L(15)],
    ['bunting', 'Party Bunting', L(7)],
    ['leaves', 'Leaf Garland', L(35)],
    ['lanterns', 'Paper Lanterns', L(51)],
    ['neon', 'Neon Tube', L(62)],
    ['starlights', 'Star Garland', L(83)],
    ['planes', 'Paper Plane Mobile', T('campaigner')],
    ['tinsel', 'Tinsel', S(12, 'holiday-coder')],
    ['hearts', 'Heart Garland', S(2, 'valentine')],
  ],
  wall: [
    ['none', 'Nothing', D],
    ['pennant', 'Clawd Pennant', L(11)],
    ['records', 'Vinyl Records', L(23)],
    ['scroll', 'Hanging Scroll', L(36)],
    ['neonsign', 'Neon </> Sign', L(57)],
    ['banner', 'Royal Banner', L(66)],
    ['goldrecord', 'Gold Record', L(72)],
  ],
  view: [
    ['city', 'City Skyline', D],
    ['pines', 'Pine Forest', L(22)],
    ['mountains', 'Mountain View', L(31)],
    ['sea', 'Sea View', L(41)],
    ['neoncity', 'Neon City', L(53)],
    ['orbit', 'Low Orbit', L(75)],
    ['aurora', 'Aurora Night', L(88)],
  ],
}

function kindOf(unlock: Unlock): DecorItem['kind'] {
  if (unlock.month !== undefined) return 'seasonal'
  if (unlock.level !== undefined) return 'level'
  if (unlock.anyOf !== undefined || unlock.allOf !== undefined) return 'trophy'
  return 'default'
}

export const DECOR: readonly DecorItem[] = SLOTS.flatMap(({ slot }) =>
  TABLE[slot].map(([id, name, unlock]): DecorItem => ({ slot, id, name, unlock, kind: kindOf(unlock) })),
)

const BY_KEY = new Map(DECOR.map((d) => [`${d.slot}:${d.id}`, d]))

function find(slot: DecorSlot, id: unknown): DecorItem | undefined {
  return typeof id === 'string' ? BY_KEY.get(`${slot}:${id}`) : undefined
}

export function isUnlocked(item: DecorItem, profile: Profile, now: number): boolean {
  return item.kind === 'default' || isOpen(item.unlock, profile, now)
}

export function requirementOf(item: DecorItem, profile?: Profile): string {
  return requirementText(item.unlock, profile) // 'Always available' for defaults (no clauses)
}

// Pieces the person owns right now (defaults and empty options do not count). Feeds the collector trophies.
export function decorOwnedCount(profile: Profile, now: number): number {
  return DECOR.filter((d) => d.kind !== 'default' && isUnlocked(d, profile, now)).length
}

export function decorTotal(): number {
  return DECOR.filter((d) => d.kind !== 'default').length
}

// ---------- level schedule (hats plus decor) ----------

export type Unlockable = { kind: 'hat' | 'decor'; id: string; name: string; slot?: DecorSlot; level: number }

type Leveled = { u: Unlockable; open: (p: Profile, now: number) => boolean }

// Every level-gated reward in schedule order: by level, then hats before decor, then catalog (SLOTS) order.
function leveled(): Leveled[] {
  const hats: Leveled[] = HATS.filter((h) => h.unlock.level !== undefined).map((h) => ({
    u: { kind: 'hat', id: h.id, name: h.name, level: h.unlock.level! },
    open: (p, now) => isOpen(h.unlock, p, now),
  }))
  const decor: Leveled[] = DECOR.filter((d) => d.unlock.level !== undefined).map((d) => ({
    u: { kind: 'decor', id: d.id, name: d.name, slot: d.slot, level: d.unlock.level! },
    open: (p, now) => isUnlocked(d, p, now),
  }))
  return [...hats, ...decor]
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x.u.level - b.x.u.level || a.i - b.i)
    .map(({ x }) => x)
}

// What levels fromLevel+1 .. toLevel bring (fromLevel < level <= toLevel). With `openBefore`, a reward that
// profile already had some other way (the Wizard Hat via Polyglot, the Crown via a 30-day streak) is left out.
export function unlocksBetween(fromLevel: number, toLevel: number, openBefore?: { profile: Profile; now: number }): Unlockable[] {
  return leveled()
    .filter(({ u, open }) => u.level > fromLevel && u.level <= toLevel && !(openBefore && open(openBefore.profile, openBefore.now)))
    .map(({ u }) => ({ ...u }))
}

// The closest thing a level-up will bring: the lowest level above the current one whose reward is not
// already open some other way (the Wizard Hat via Polyglot, say). Hats first on ties. `kind` limits it to
// hats (the terminal draws no decor) or decor.
export function nextUnlock(profile: Profile, now: number, kind?: Unlockable['kind']): Unlockable | undefined {
  const level = levelOf(profile.xp).level
  const next = leveled().find(({ u, open }) => u.level > level && (kind === undefined || u.kind === kind) && !open(profile, now))
  return next ? { ...next.u } : undefined
}

// Pieces newly available after an event, for a toast. Defaults and empty options are not news.
// `prevNow` is when `before` is judged (game.ts prevActiveNow): the previous active day on a day rollover, so a
// seasonal piece is news when its month starts, like seasonal hats; null for a brand-new player, who had none of
// the seasonal pieces open today.
export function newlyUnlocked(before: Profile, after: Profile, now: number, prevNow: number | null = now): DecorItem[] {
  const had = (d: DecorItem) => (prevNow === null ? d.kind !== 'seasonal' && isUnlocked(d, before, now) : isUnlocked(d, before, prevNow))
  return DECOR.filter((d) => d.kind !== 'default' && !had(d) && isUnlocked(d, after, now))
}

// ---------- choices ----------

// What the room shows in a slot nobody picked: the original look, so an older save looks the same on first load.
export function autoDecor(level: number): Required<DecorChoice> {
  return {
    drink: 'coffee',
    plant: 'fern',
    poster: level >= 5 ? 'space' : 'none',
    rug: level >= 3 ? 'stripes' : 'none',
    shelf: level >= 8 ? 'lava' : 'none',
    companion: 'none',
    bed: 'cushion',
    lamp: 'desk',
    clock: 'classic',
    ceiling: level >= 15 ? 'fairy' : 'none',
    wall: 'none',
    view: 'city',
  }
}

// The person's pick per slot while it is open (a seasonal piece out of season falls back), else the auto default.
export function resolveDecor(choice: DecorChoice, profile: Profile, now: number): Required<DecorChoice> {
  const out = autoDecor(levelOf(profile.xp).level)
  const picks: DecorChoice = choice && typeof choice === 'object' ? choice : {}
  for (const { slot } of SLOTS) {
    const item = find(slot, picks[slot])
    if (item && isUnlocked(item, profile, now)) out[slot] = item.id
  }
  return out
}

// Stored picks, cleaned: known slot/id pairs only. Old saves have 6 slots; the others fall back to defaults.
export function migrateDecor(raw: unknown): DecorChoice {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: DecorChoice = {}
  for (const { slot } of SLOTS) {
    const id = (raw as Record<string, unknown>)[slot]
    if (find(slot, id)) out[slot] = id as string
  }
  return out
}

export function freshKey(item: DecorItem): string {
  return `decor:${item.slot}:${item.id}`
}
