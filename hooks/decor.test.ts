import { expect, test } from 'claude-code/testing'

import type { DecorSlot, Profile } from '../types'
import {
  autoDecor, DECOR, decorOwnedCount, decorTotal, freshKey, isUnlocked, migrateDecor, newlyUnlocked, nextUnlock,
  requirementOf, resolveDecor, SLOTS, unlocksBetween,
} from './decor'
import { ACHIEVEMENTS, applyEvent, HATS, newProfile, prevActiveNow, XP_AT } from './game'

const at = (m: number, d = 15) => new Date(2026, m - 1, d, 12).getTime()
const JUNE = at(6)
const DEC = at(12)
const OCT = at(10)

function lv(level: number, trophies: string[] = []): Profile {
  return { ...newProfile(), xp: XP_AT[level]!, achievements: Object.fromEntries(trophies.map((id) => [id, 1])) }
}

const item = (slot: DecorSlot, id: string) => {
  const d = DECOR.find((x) => x.slot === slot && x.id === id)
  if (!d) throw new Error(`no ${slot}:${id}`)
  return d
}

// ---------- catalog ----------

test('the catalog has 110 entries in 12 slots, 98 of them real pieces', async () => {
  expect(DECOR).toHaveLength(110)
  expect(SLOTS.map((s) => s.slot)).toEqual(['drink', 'plant', 'poster', 'rug', 'shelf', 'companion', 'bed', 'lamp', 'clock', 'ceiling', 'wall', 'view'])
  expect(SLOTS.map((s) => s.label)).toEqual(['Desk drink', 'Plant', 'Poster', 'Rug', 'Shelf top', 'Roommate', 'Pet bed', 'Desk lamp', 'Clock', 'Ceiling', 'Wall hanging', 'Window view'])
  const counts = Object.fromEntries(SLOTS.map(({ slot }) => [slot, DECOR.filter((d) => d.slot === slot).length]))
  expect(counts).toEqual({ drink: 9, plant: 11, poster: 13, rug: 8, shelf: 12, companion: 12, bed: 8, lamp: 7, clock: 6, ceiling: 10, wall: 7, view: 7 })
  expect(decorTotal()).toBe(98)
  expect(DECOR.filter((d) => d.kind === 'default')).toHaveLength(12)
  // every slot has exactly one default, and it is what autoDecor shows at level 1
  const auto = autoDecor(1)
  for (const { slot } of SLOTS) {
    const defaults = DECOR.filter((d) => d.slot === slot && d.kind === 'default')
    expect(defaults).toHaveLength(1)
    expect(defaults[0]!.id).toBe(auto[slot])
  }
})

test('ids are unique per slot and safe for store keys and scene ids', async () => {
  const keys = DECOR.map((d) => `${d.slot}:${d.id}`)
  expect(new Set(keys).size).toBe(keys.length)
  for (const d of DECOR) {
    expect(/^[a-z0-9-]{1,24}$/.test(d.id)).toBe(true)
    expect(d.name.length > 0 && d.name.length <= 24).toBe(true)
  }
  // entries are grouped in SLOTS order (table 2.2 order)
  const order = SLOTS.map((s) => s.slot)
  for (let i = 1; i < DECOR.length; i++) expect(order.indexOf(DECOR[i]!.slot) >= order.indexOf(DECOR[i - 1]!.slot)).toBe(true)
})

test('kinds follow the unlock rule', async () => {
  for (const d of DECOR) {
    const u = d.unlock
    const want = u.month !== undefined ? 'seasonal' : u.level !== undefined ? 'level' : u.anyOf || u.allOf ? 'trophy' : 'default'
    expect(d.kind).toBe(want)
  }
  expect(item('ceiling', 'fairy').kind).toBe('level')
  expect(item('plant', 'xmastree').unlock).toEqual({ month: 12, keep: 'holiday-coder' })
  expect(item('companion', 'ghost').unlock).toEqual({ month: 10, keep: 'trick-or-commit' })
  expect(item('ceiling', 'hearts').unlock).toEqual({ month: 2, keep: 'valentine' })
})

test('every trophy a piece names exists', async () => {
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id))
  for (const d of DECOR) {
    for (const id of [...(d.unlock.anyOf ?? []), ...(d.unlock.allOf ?? []), ...(d.unlock.keep ? [d.unlock.keep] : [])]) {
      if (!ids.has(id)) throw new Error(`${d.slot}:${d.id} names unknown trophy ${id}`)
    }
  }
})

test('every original unlock rule keeps its exact condition', async () => {
  const legacy: Array<[DecorSlot, string, object]> = [
    ['drink', 'tea', { level: 3 }], ['drink', 'energy', { level: 5 }], ['drink', 'espresso', { anyOf: ['night-owl'] }], ['drink', 'boba', { level: 12 }],
    ['plant', 'cactus', { level: 4 }], ['plant', 'sunflower', { anyOf: ['streak-7'] }], ['plant', 'monstera', { anyOf: ['bookworm'] }], ['plant', 'bonsai', { level: 10 }],
    ['poster', 'space', { level: 5 }], ['poster', 'terminal', { anyOf: ['hundred-club'] }], ['poster', 'cat', { anyOf: ['hello-world'] }],
    ['poster', 'wave', { level: 9 }], ['poster', 'clawd', { level: 15 }],
    ['rug', 'stripes', { level: 3 }], ['rug', 'round', { level: 6 }], ['rug', 'checker', { anyOf: ['clean-sweep'] }],
    ['shelf', 'duck', { anyOf: ['rubber-duck'] }], ['shelf', 'globe', { anyOf: ['explorer'] }], ['shelf', 'lava', { level: 8 }], ['shelf', 'boombox', { level: 14 }],
    ['companion', 'fishbowl', { anyOf: ['polite'] }], ['companion', 'cat', { level: 10 }], ['companion', 'roomba', { anyOf: ['thousand-hands'] }],
  ]
  for (const [slot, id, rule] of legacy) expect(item(slot, id).unlock).toEqual(rule)
  // the original names stay too
  expect(item('poster', 'cat').name).toBe('Cat Poster')
  expect(item('companion', 'roomba').name).toBe('Robot Vacuum')
})

// ---------- level schedule (table 2.3) ----------

const SCHEDULE: Record<number, string[]> = {
  2: ['Party Hat'], 3: ['Tea', 'Striped Rug'], 4: ['Cactus'], 5: ['Clawd Energy', 'Space Clawd'], 6: ['Round Rug'],
  7: ['Backwards Cap', 'Party Bunting'], 8: ['Lava Lamp', 'Hot Cocoa'], 9: ['The Great Wave'],
  10: ['Wizard Hat', 'Bonsai', 'Cat', 'Wicker Basket'], 11: ['Clawd Pennant'], 12: ['Boba Tea'], 13: ["Chef's Toque"],
  14: ['Boombox'], 15: ['Self Portrait', 'Fairy Lights'], 16: ["Banker's Lamp"], 17: ['Beret'], 18: ['Succulent Trio'],
  19: ['Cuckoo Clock'], 20: ['Viking Helmet'], 21: ['Synthwave Sunset'], 22: ['Pine Forest'], 23: ['Vinyl Records'],
  24: ['Braided Oval'], 25: ['Crown', 'Velvet Throne'], 26: ['Matcha Latte'], 27: ['Venus Flytrap'], 28: ['Cowboy Hat'],
  29: ['Mini Arcade'], 30: ['Anglepoise'], 31: ['Mountain View'], 33: ["Captain's Cap"], 35: ['Leaf Garland'],
  36: ['Hanging Scroll'], 37: ['Porthole Clock'], 38: ['Pirate Tricorne'], 40: ['Orchid'], 41: ['Sea View'], 42: ['Corgi'],
  43: ['Ninja Headband'], 45: ['Camp Lantern'], 47: ['Starry Swirl'], 48: ['Sunburst Clock'],
  50: ['Golden Laurel', 'Clawdlet', 'Giant Clam'], 51: ['Paper Lanterns'], 52: ['Mana Potion'], 53: ['Neon City'],
  55: ['Samurai Kabuto'], 56: ['Moon Lamp'], 57: ['Neon </> Sign'], 58: ['Galaxy Rug'], 60: ["Knight's Plumed Helm"],
  62: ['Neon Tube'], 63: ['Sleep Pod'], 65: ['Jester Hat'], 66: ['Royal Banner'], 67: ['Plasma Ball'], 70: ['Archmage Hat'],
  72: ['Gold Record'], 75: ['Space Helmet', 'Mars Rover', 'Low Orbit'], 78: ['Crystal Flower'], 80: ['UFO Hat'],
  83: ['Star Garland'], 85: ['Dragon Horns'], 88: ['Aurora Night'], 90: ['Phoenix Crest'], 93: ['Golden Clock'],
  96: ['Hall of Fame'], 98: ['Golden Goblet'], 100: ['Starlight Crown', 'Golden Clawd', 'Red Carpet', 'Tiny Dragon'],
}

test('the level schedule matches table 2.3', async () => {
  const all = unlocksBetween(1, 100)
  const got: Record<number, string[]> = {}
  for (const u of all) (got[u.level] ??= []).push(u.name)
  for (const names of Object.values(got)) names.sort()
  const want = Object.fromEntries(Object.entries(SCHEDULE).map(([l, names]) => [l, [...names].sort()]))
  expect(got).toEqual(want)
  // every hat with a level and every leveled piece is in it exactly once
  expect(all).toHaveLength(HATS.filter((h) => h.unlock.level !== undefined).length + DECOR.filter((d) => d.unlock.level !== undefined).length)
})

test('every level 2..30 brings something, and later gaps are at most 3 levels', async () => {
  for (let l = 2; l <= 30; l++) {
    if (unlocksBetween(l - 1, l).length === 0) throw new Error(`level ${l} brings nothing`)
  }
  let last = 30
  for (let l = 31; l <= 100; l++) {
    if (unlocksBetween(l - 1, l).length > 0) {
      if (l - last > 3) throw new Error(`gap from ${last} to ${l}`)
      last = l
    }
  }
  expect(last).toBe(100)
})

test('unlocksBetween is ordered by level, hats first, then slot order', async () => {
  const ten = unlocksBetween(9, 10)
  expect(ten.map((u) => u.name)).toEqual(['Wizard Hat', 'Bonsai', 'Cat', 'Wicker Basket'])
  expect(ten.map((u) => u.kind)).toEqual(['hat', 'decor', 'decor', 'decor'])
  expect(ten[2]).toEqual({ kind: 'decor', id: 'cat', name: 'Cat', slot: 'companion', level: 10 })
  expect(ten[0]).toEqual({ kind: 'hat', id: 'wizard', name: 'Wizard Hat', level: 10 })
  // across levels: lowest level first; the range excludes its start and includes its end
  expect(unlocksBetween(6, 8).map((u) => u.name)).toEqual(['Backwards Cap', 'Party Bunting', 'Hot Cocoa', 'Lava Lamp'])
  expect(unlocksBetween(7, 7)).toEqual([])
  expect(unlocksBetween(100, 200)).toEqual([])
  const levels = unlocksBetween(0, 100).map((u) => u.level)
  expect(levels).toEqual([...levels].sort((a, b) => a - b))
  // a returned entry is a copy
  unlocksBetween(1, 2)[0]!.name = 'mutated'
  expect(unlocksBetween(1, 2)[0]!.name).toBe('Party Hat')
})

test('nextUnlock names the closest level reward that is not open yet', async () => {
  expect(nextUnlock(lv(1), JUNE)).toEqual({ kind: 'hat', id: 'party', name: 'Party Hat', level: 2 })
  expect(nextUnlock(lv(2), JUNE)).toEqual({ kind: 'decor', id: 'tea', name: 'Tea', slot: 'drink', level: 3 })
  // hats first on a tie
  expect(nextUnlock(lv(6), JUNE)?.name).toBe('Backwards Cap')
  expect(nextUnlock(lv(9), JUNE)?.name).toBe('Wizard Hat')
  // the Wizard Hat is already open through Polyglot: the Bonsai is next
  expect(nextUnlock(lv(9, ['polyglot']), JUNE)?.name).toBe('Bonsai')
  // the Crown is open through a 30-day streak, so level 24 points at the Velvet Throne
  expect(nextUnlock(lv(24, ['streak-30']), JUNE)?.name).toBe('Velvet Throne')
  expect(nextUnlock(lv(30), JUNE)?.level).toBe(31)
  expect(nextUnlock(lv(99), JUNE)?.level).toBe(100)
  expect(nextUnlock(lv(100), JUNE)).toBe(undefined)
  expect(nextUnlock({ ...lv(100), xp: XP_AT[100]! + 50_000 }, JUNE)).toBe(undefined)
})

// ---------- ownership ----------

test('isUnlocked follows levels, trophies and seasons', async () => {
  expect(isUnlocked(item('drink', 'coffee'), lv(1), JUNE)).toBe(true)
  expect(isUnlocked(item('poster', 'none'), lv(1), JUNE)).toBe(true)
  expect(isUnlocked(item('drink', 'tea'), lv(2), JUNE)).toBe(false)
  expect(isUnlocked(item('drink', 'tea'), lv(3), JUNE)).toBe(true)
  expect(isUnlocked(item('drink', 'espresso'), lv(100), JUNE)).toBe(false)
  expect(isUnlocked(item('drink', 'espresso'), lv(1, ['night-owl']), JUNE)).toBe(true)
  expect(isUnlocked(item('companion', 'ghost'), lv(1), OCT)).toBe(true)
  expect(isUnlocked(item('companion', 'ghost'), lv(1), JUNE)).toBe(false)
  expect(isUnlocked(item('companion', 'ghost'), lv(1, ['trick-or-commit']), JUNE)).toBe(true)
  expect(isUnlocked(item('ceiling', 'hearts'), lv(1), at(2))).toBe(true)
})

test('decorOwnedCount counts open real pieces only', async () => {
  expect(decorOwnedCount(lv(1), JUNE)).toBe(0)
  // level 3: Tea and Striped Rug
  expect(decorOwnedCount(lv(3), JUNE)).toBe(2)
  // December opens the tree and the tinsel for everyone
  expect(decorOwnedCount(lv(1), DEC)).toBe(2)
  const leveled = DECOR.filter((d) => d.kind === 'level').length
  expect(decorOwnedCount(lv(100), JUNE)).toBe(leveled)
  const everything = lv(100, ACHIEVEMENTS.map((a) => a.id))
  expect(decorOwnedCount(everything, JUNE)).toBe(decorTotal())
})

test('requirementOf reads the unlock rule', async () => {
  expect(requirementOf(item('wall', 'pennant'))).toBe('Reach Lv 11')
  expect(requirementOf(item('drink', 'espresso'))).toContain('Night Owl')
  expect(requirementOf(item('plant', 'xmastree'))).toContain('December')
  expect(requirementOf(item('drink', 'coffee'))).toBe('Always available')
})

test('newlyUnlocked announces each piece once and skips defaults', async () => {
  const fresh = newlyUnlocked(lv(4), lv(5), JUNE).map((d) => d.id)
  expect(fresh).toEqual(['energy', 'space'])
  expect(newlyUnlocked(lv(5), lv(5), JUNE)).toEqual([])
  const ten = newlyUnlocked(lv(9), lv(10), JUNE).map(freshKey)
  expect(ten).toEqual(['decor:plant:bonsai', 'decor:companion:cat', 'decor:bed:basket'])
  // a trophy opens its pieces
  expect(newlyUnlocked(lv(1), lv(1, ['polite']), JUNE).map((d) => `${d.slot}:${d.id}`)).toEqual(['companion:fishbowl'])
  // a seasonal piece already open in its month is not news when its keeper trophy arrives
  expect(newlyUnlocked(lv(1), lv(1, ['holiday-coder']), DEC).map((d) => d.id)).toEqual([])
  expect(newlyUnlocked(lv(1), lv(1, ['holiday-coder']), JUNE).map((d) => d.id)).toEqual(['xmastree', 'tinsel'])
  for (const d of newlyUnlocked(lv(1), lv(100, ACHIEVEMENTS.map((a) => a.id)), JUNE)) expect(d.kind === 'default').toBe(false)
})

test('seasonal pieces are news when their month starts, like seasonal hats', async () => {
  // the last active day was 30 November; the first event on 1 December rolls the day over
  const nov30 = new Date(2026, 10, 30, 12).getTime()
  const dec1 = new Date(2026, 11, 1, 9).getTime()
  const before = applyEvent(lv(1), { type: 'prompt', text: 'hi', now: nov30 }).profile
  const r = applyEvent(before, { type: 'prompt', text: 'hi', now: dec1 })
  expect(r.unlockedHats).toContain('santa')
  const prev = prevActiveNow(before, dec1)
  expect(prev).toBe(new Date(2026, 10, 30, 12).getTime())
  expect(newlyUnlocked(before, r.profile, dec1, prev).map((d) => d.id)).toEqual(['xmastree', 'tinsel'])
  // later the same day nothing is news again
  const later = applyEvent(r.profile, { type: 'prompt', text: 'hi', now: dec1 + 3600_000 })
  expect(newlyUnlocked(r.profile, later.profile, dec1 + 3600_000, prevActiveNow(r.profile, dec1 + 3600_000))).toEqual([])
  // October and February too
  const sep30 = applyEvent(lv(1), { type: 'prompt', text: 'hi', now: new Date(2026, 8, 30, 12).getTime() }).profile
  const oct1 = new Date(2026, 9, 1, 9).getTime()
  expect(newlyUnlocked(sep30, sep30, oct1, prevActiveNow(sep30, oct1)).map((d) => d.id)).toEqual(['ghost'])
  const jan31 = applyEvent(lv(1), { type: 'prompt', text: 'hi', now: new Date(2027, 0, 31, 12).getTime() }).profile
  const feb1 = new Date(2027, 1, 1, 9).getTime()
  expect(newlyUnlocked(jan31, jan31, feb1, prevActiveNow(jan31, feb1)).map((d) => d.id)).toEqual(['hearts'])
  // a brand-new player (no previous day) hears about the pieces of the season, not about level-1 defaults
  expect(prevActiveNow(newProfile(), DEC)).toBe(null)
  expect(newlyUnlocked(newProfile(), newProfile(), DEC, null).map((d) => d.id)).toEqual(['xmastree', 'tinsel'])
  expect(newlyUnlocked(newProfile(), newProfile(), JUNE, null)).toEqual([])
  // the season ending is no news either way
  const jan1 = new Date(2027, 0, 1, 9).getTime()
  const dec31 = applyEvent(lv(1), { type: 'prompt', text: 'hi', now: new Date(2026, 11, 31, 12).getTime() }).profile
  expect(newlyUnlocked(dec31, dec31, jan1, prevActiveNow(dec31, jan1))).toEqual([])
})

test('unlocksBetween can leave out what was already open some other way', async () => {
  const names = (us: ReturnType<typeof unlocksBetween>) => us.map((u) => u.name)
  expect(names(unlocksBetween(9, 10))).toContain('Wizard Hat')
  expect(names(unlocksBetween(9, 10, { profile: lv(9, ['polyglot']), now: JUNE }))).not.toContain('Wizard Hat')
  expect(names(unlocksBetween(9, 10, { profile: lv(9, ['polyglot']), now: JUNE }))).toContain('Bonsai')
  expect(names(unlocksBetween(24, 25, { profile: lv(24, ['streak-30']), now: JUNE }))).toEqual(['Velvet Throne'])
})

test('nextUnlock can name the next hat only (the terminal draws no decor)', async () => {
  expect(nextUnlock(lv(18), JUNE)?.name).toBe('Cuckoo Clock')
  expect(nextUnlock(lv(18), JUNE, 'hat')?.name).toBe('Viking Helmet')
  expect(nextUnlock(lv(18), JUNE, 'decor')?.name).toBe('Cuckoo Clock')
  expect(nextUnlock(lv(100), JUNE, 'hat')).toBe(undefined)
})

test('freshKey', async () => {
  expect(freshKey(item('view', 'aurora'))).toBe('decor:view:aurora')
})

// ---------- choices ----------

test('autoDecor keeps the original look', async () => {
  expect(autoDecor(1)).toEqual({
    drink: 'coffee', plant: 'fern', poster: 'none', rug: 'none', shelf: 'none', companion: 'none',
    bed: 'cushion', lamp: 'desk', clock: 'classic', ceiling: 'none', wall: 'none', view: 'city',
  })
  expect(autoDecor(3).rug).toBe('stripes')
  expect(autoDecor(4).poster).toBe('none')
  expect(autoDecor(5).poster).toBe('space')
  expect(autoDecor(7).shelf).toBe('none')
  expect(autoDecor(8).shelf).toBe('lava')
  expect(autoDecor(14).ceiling).toBe('none')
  expect(autoDecor(15).ceiling).toBe('fairy')
  expect(autoDecor(100)).toEqual({
    drink: 'coffee', plant: 'fern', poster: 'space', rug: 'stripes', shelf: 'lava', companion: 'none',
    bed: 'cushion', lamp: 'desk', clock: 'classic', ceiling: 'fairy', wall: 'none', view: 'city',
  })
})

test('resolveDecor shows a pick only while it is open', async () => {
  expect(resolveDecor({}, lv(1), JUNE)).toEqual(autoDecor(1))
  expect(resolveDecor({ drink: 'energy' }, lv(4), JUNE).drink).toBe('coffee')
  expect(resolveDecor({ drink: 'energy' }, lv(5), JUNE).drink).toBe('energy')
  expect(resolveDecor({ shelf: 'duck' }, lv(1, ['rubber-duck']), JUNE).shelf).toBe('duck')
  expect(resolveDecor({ rug: 'none', ceiling: 'none' }, lv(50), JUNE)).toEqual({ ...autoDecor(50), rug: 'none', ceiling: 'none' })
  expect(resolveDecor({ view: 'aurora', wall: 'pennant', bed: 'basket' }, lv(88), JUNE)).toEqual({ ...autoDecor(88), view: 'aurora', wall: 'pennant', bed: 'basket' })
  // unknown ids and ids of another slot fall back
  expect(resolveDecor({ drink: 'triffid', plant: 'coffee' }, lv(100), JUNE)).toEqual(autoDecor(100))
})

test('resolveDecor falls back for a seasonal piece out of season', async () => {
  expect(resolveDecor({ plant: 'xmastree' }, lv(20), DEC).plant).toBe('xmastree')
  expect(resolveDecor({ plant: 'xmastree' }, lv(20), JUNE).plant).toBe('fern')
  expect(resolveDecor({ plant: 'xmastree' }, lv(20, ['holiday-coder']), JUNE).plant).toBe('xmastree')
  expect(resolveDecor({ companion: 'ghost', ceiling: 'hearts' }, lv(20), JUNE)).toEqual({ ...autoDecor(20), companion: 'none', ceiling: 'fairy' })
})

test('migrateDecor keeps known slot/id pairs in all 12 slots', async () => {
  expect(migrateDecor({ drink: 'energy', plant: 'triffid', rug: 7 })).toEqual({ drink: 'energy' })
  expect(migrateDecor('nope')).toEqual({})
  expect(migrateDecor(null)).toEqual({})
  expect(migrateDecor(['drink'])).toEqual({})
  const full = { drink: 'goblet', plant: 'sakura', poster: 'neon', rug: 'welcome', shelf: 'train', companion: 'dragon', bed: 'cloud', lamp: 'plasma', clock: 'tail', ceiling: 'hearts', wall: 'goldrecord', view: 'orbit' }
  expect(migrateDecor({ ...full, hat: 'party', extra: 'x' })).toEqual(full)
  // an old 6-slot save keeps its picks; the new slots fall back to their defaults later
  expect(migrateDecor({ drink: 'tea', poster: 'none', companion: 'roomba' })).toEqual({ drink: 'tea', poster: 'none', companion: 'roomba' })
  // a known id in the wrong slot is dropped
  expect(migrateDecor({ view: 'aurora', wall: 'aurora' })).toEqual({ view: 'aurora' })
})

// The test runner cannot read README.md (only code files load), so this pins the numbers the docs state.
// When it fails, update every place that names them with the catalog: README.md (What it does, FAQ),
// .claude-plugin/plugin.json and marketplace.json (description) and the CHANGELOG entry.
test('catalog counts: 80 trophies (12 hidden), 44 hats, 98 unlockable decor pieces in 12 slots (keep the docs in sync)', () => {
  expect(ACHIEVEMENTS.length).toBe(80)
  expect(ACHIEVEMENTS.filter(a => a.hidden).length).toBe(12)
  expect(HATS.length).toBe(44)
  expect(DECOR.filter(d => d.kind !== 'default').length).toBe(98)
  expect(SLOTS.length).toBe(12)
})
