import { expect, test } from 'claude-code/testing'

import type { Activity, AnyHat, Celebration, DayPhase, DecorChoice, DecorSlot, Mood, SceneInput, Station } from '../types'
import { sanitizeHat } from './customHat'
import { autoDecor, DECOR } from './decor'
import {
  COMPANION_BOXES, companionSvg, DECOR_CLASSES, DECOR_CSS, drinkSvg, plantSvg, posterSvg, rugSvg, shelfSvg, viewSvg, wallSvg,
} from './decorArt'
import { HATS as HAT_DEFS } from './game'
import { HAT_CLASSES, HAT_CSS, hatTop } from './hatArt'
import { archiveBox, calendar, hourglass, METER_BOXES, METER_CSS, paperStack } from './meterArt'
import { bedLipSvg, bedSvg, ceilingSvg, clockSvg, lampSvg, ROOM_CLASSES, ROOM_CSS, ROOM_IDS } from './roomArt'
import {
  clawdAt, comboTier, decorCrop, decorPreview, mergeRects, MINI_LIFT, MIRROR_RATIO, miniSvg, phaseSvg, previewSize, SCENE_RATIO, sceneSvg, stationOf,
} from './scene'

const MOODS: Mood[] = ['idle', 'thinking', 'coding', 'reading', 'running', 'working', 'done', 'error', 'sleeping', 'happy']
const ACTIVITIES: Activity[] = ['none', 'edit', 'write', 'read', 'search', 'web', 'shell', 'git', 'terraform', 'test', 'agent', 'skill']
// Every catalog hat (44) plus no hat.
const HATS: AnyHat[] = [null, ...HAT_DEFS.map((d) => d.id)]

const base: SceneInput = {
  mood: 'idle', activity: 'none', hat: null, hour: 13, month: 10, helpers: 0,
  combo: 0, trophies: 0, plantStage: 0, level: 1, coffee: 0,
}

const CUSTOM_HAT = sanitizeHat({
  id: 'test-hat', name: 'Test Hat',
  rows: ['...aa...', '..abba..', '.aaaaaa.', 'cccccccc'],
  palette: { a: '#4F8BD8', b: '#F6D365', c: '#2B2442' },
})

function checkSvg(svg: string): void {
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.includes('background:transparent')).toBe(true)
  expect(svg.includes('<script')).toBe(false)
  expect(/\son[a-z]+=/i.test(svg)).toBe(false)
  expect(/\p{Extended_Pictographic}/u.test(svg)).toBe(false)
  expect(svg.includes('<text')).toBe(false)
}

// Structural validity: balanced groups, no leaked NaN/undefined, transparent, within the Svg source limit.
function checkValid(svg: string): void {
  checkSvg(svg)
  const opens = (svg.match(/<g[\s>]/g) ?? []).length
  const closes = (svg.match(/<\/g>/g) ?? []).length
  expect(opens).toBe(closes)
  expect(svg.length < 131072).toBe(true)
  expect(svg.includes('NaN')).toBe(false)
  expect(svg.includes('undefined')).toBe(false)
  expect(svg.includes('background:#')).toBe(false)
  expect(svg.endsWith('</svg>')).toBe(true)
}

test('scene ratio is wide-ish', async () => {
  expect(SCENE_RATIO > 0.55 && SCENE_RATIO < 0.75).toBe(true)
})

test('every mood x activity x hat renders a small, transparent, script-free room', async () => {
  let i = 0
  for (const mood of MOODS) {
    for (const activity of ACTIVITIES) {
      const hat = HATS[i++ % HATS.length] ?? null
      const svg = sceneSvg({ ...base, mood, activity, hat, hour: (i * 5) % 24, month: (i % 12) + 1, helpers: i % 4, combo: (i * 3) % 25, trophies: i % 15, plantStage: i % 5, level: (i * 2) % 25, coffee: i % 4 })
      checkSvg(svg)
      expect(svg.length < 120000).toBe(true)
      expect(svg.includes(`m-${mood}`)).toBe(true)
      expect(svg.includes(':root,svg{background:transparent;color-scheme:light dark}')).toBe(true)
    }
  }
})

// Every meter at its fullest, with a change still animating.
const FULL_USAGE: SceneInput['usage'] = {
  context: { pct: 100, window: 200000 }, fiveHour: { pct: 100, resets: 'at 15:40' }, sevenDay: { pct: 100, resets: 'Fri 09:00' },
  compactions: 3, from: { context: 0, fiveHour: 0, sevenDay: 0 },
}

const SLOT_IDS = [...new Set(DECOR.map((d) => d.slot))]
const itemsOf = (slot: DecorSlot): string[] => DECOR.filter((d) => d.slot === slot).map((d) => d.id)

// Every slot filled, rotating through the catalog so every piece shows up in some maxed room.
const maxedDecor = (k: number): DecorChoice =>
  Object.fromEntries(SLOT_IDS.map((slot) => { const ids = itemsOf(slot); return [slot, ids[(k + 1) % ids.length]!] }))

// One test per mood keeps each under the runner's per-test time limit.
for (const [m, mood] of MOODS.entries()) test(`maxed-out ${mood} room stays under the size budget (B67: 60K)`, async () => {
  let k = m * 7
  {
    for (const hat of HATS) {
      for (const celebrate of [undefined, 'legend'] as const) {
        const svg = sceneSvg({
          ...base, mood, activity: 'agent', hat, hour: k % 2 ? 23 : 13, month: 12, helpers: 3, combo: 999, trophies: 99, plantStage: 4,
          level: 100, coffee: 3, usage: FULL_USAGE, decor: maxedDecor(k++), celebrate,
        })
        checkSvg(svg)
        if (svg.length > 60000) throw new Error(`${mood}/${String(hat)}/${celebrate} is ${svg.length} chars`)
      }
    }
  }
})

test('survives odd input', async () => {
  const svg = sceneSvg({ ...base, hour: Number.NaN, month: 42, helpers: -3, combo: -1, trophies: 1e9, plantStage: 17, level: -5, coffee: 99 })
  checkValid(svg)
  expect(svg.length < 120000).toBe(true)
})

test('ids differ between different scenes', async () => {
  const a = sceneSvg({ ...base, hour: 2 })
  const b = sceneSvg({ ...base, hour: 13 })
  const idA = /clipPath id="([a-z0-9]+)w"/.exec(a)?.[1]
  const idB = /clipPath id="([a-z0-9]+)w"/.exec(b)?.[1]
  expect(idA !== undefined && idB !== undefined && idA !== idB).toBe(true)
})

test('miniSvg works for every mood', async () => {
  for (const mood of MOODS) {
    for (const activity of ['none', 'shell', 'search', 'agent', 'web'] as Activity[]) {
      const mini = miniSvg({ mood, activity, hat: 'propeller' })
      checkSvg(mini)
      expect(mini.includes('viewBox="0 0 64 40"')).toBe(true)
      expect(mini.length < 30000).toBe(true)
    }
  }
})

// ---------- a stable source while nothing visible changes ----------

test('combo is drawn per tier, so the source only changes at a tier', async () => {
  expect(sceneSvg({ ...base, combo: 1 })).toBe(sceneSvg({ ...base, combo: 3 }))
  expect(sceneSvg({ ...base, combo: 0 })).toBe(sceneSvg({ ...base, combo: 4 }))
  expect(sceneSvg({ ...base, combo: 6 })).toBe(sceneSvg({ ...base, combo: 9 }))
  expect(sceneSvg({ ...base, combo: 21 })).toBe(sceneSvg({ ...base, combo: 49 }))
  expect(sceneSvg({ ...base, combo: 4 }) !== sceneSvg({ ...base, combo: 5 })).toBe(true)
  expect(sceneSvg({ ...base, combo: 9 }) !== sceneSvg({ ...base, combo: 10 })).toBe(true)
  expect(sceneSvg({ ...base, combo: 49 }) !== sceneSvg({ ...base, combo: 50 })).toBe(true)
})

test('the combo badge never lands on the plant: bookshelf corner, crane and working pace move it to clear wall', async () => {
  const plant = [78, 140, 113, 210] // the plant slot at its tallest
  const hatLine = 232 - 30 - 30     // the tallest hat's top over Clawd (sprite -60 at scale .5)
  const cases: Array<[Mood, Activity, number[]]> = [['reading', 'read', [10]], ['reading', 'search', [10, 26]], ['running', 'terraform', [108]], ['working', 'none', [102, 200]]]
  for (const [mood, activity, xs] of cases) {
    for (const combo of [5, 10, 50]) {
      const svg = sceneSvg({ ...base, mood, activity, combo })
      const m = /<g transform="translate\(([-\d.]+),([-\d.]+)\)"><g class="fl fbB">/.exec(svg)
      if (!m) throw new Error(`${mood}/${activity}: no badge`)
      const [bx, by] = [Number(m[1]), Number(m[2])]
      const width = (combo >= 10 ? 2.2 : 1.6) * 5 + 2 + `x${comboTier(combo)}+`.length * 6 - 1.5
      for (const x of xs) {
        const box = [x + bx, 202 + by - 2, x + bx + width, 202 + by + 16]
        const hit = box[0]! < plant[2]! && box[2]! > plant[0]! && box[1]! < plant[3]! && box[3]! > plant[1]!
        if (hit || box[0]! < 0) throw new Error(`${mood}/${activity} combo ${combo} at x ${x}: badge ${box.map(v => v.toFixed(1))} hits the plant or the edge`)
        // over his head it clears the tallest hat
        if (by < -8 && x + bx > x && x + bx + width < x + 72) expect(box[3]! <= hatLine).toBe(true)
      }
    }
  }
})

test('comboTier buckets and is idempotent', async () => {
  const cases: Array<[number, number]> = [[0, 0], [4, 0], [5, 5], [9, 5], [10, 10], [19, 10], [20, 20], [49, 20], [50, 50], [999, 50]]
  for (const [combo, tier] of cases) {
    expect(comboTier(combo)).toBe(tier)
    expect(comboTier(comboTier(combo))).toBe(tier)
  }
  // a pre-bucketed combo draws the same scene as the raw one
  expect(sceneSvg({ ...base, combo: 37 })).toBe(sceneSvg({ ...base, combo: comboTier(37) }))
})

test('same input, same source; the defs id only follows the window inputs', async () => {
  const input: SceneInput = { ...base, mood: 'coding', activity: 'edit', hat: 'crown', combo: 12, helpers: 2, level: 16 }
  expect(sceneSvg(input)).toBe(sceneSvg({ ...input }))
  const id = (svg: string): string | undefined => /clipPath id="([a-z0-9]+)w"/.exec(svg)?.[1]
  expect(id(sceneSvg(input))).toBe(id(sceneSvg({ ...input, mood: 'happy', combo: 0, trophies: 7 })))
})

// ---------- roommates stay clear of Clawd ----------

// Rects Clawd and the crane occupy (x0, y0, x1, y1 in room units).
const POSE_BOXES: Record<string, readonly [number, number, number, number]> = {
  'idle (wander)': [102, 202, 248, 232],
  'working (errand)': [102, 202, 272, 232],
  'crane control box': [214, 200, 226, 232],
  'coding/error (on the stool)': [208, 182, 280, 212],
  'thinking (pacing)': [100, 202, 244, 232],
  'reading': [10, 202, 82, 232],
  'done/happy': [150, 176, 222, 232],
  'sleeping (pet bed)': [112, 216, 184, 232],
  'terraform crane': [188, 176, 212, 232],
  'scan (shelf walk)': [10, 196, 98, 232],
  'web (under the window)': [160, 190, 232, 232],
  'crane operator': [108, 198, 186, 232],
  'agent': [150, 200, 224, 232],
  'skill': [128, 150, 200, 232],
}

const STATIONS: Station[] = [...MOODS, 'write', 'scan', 'web', 'test', 'git', 'crane', 'agent', 'skill']

const intersects = (a: readonly number[], b: readonly number[]): boolean =>
  a[0]! < b[2]! && b[0]! < a[2]! && a[1]! < b[3]! && b[1]! < a[3]!

// Floor-lane roommates (x 244..330) share the floor with Clawd's idle wander and errand walk: he walks
// past in front of them, which is fine. Every other pose and the crane stay clear of every box.
const FLOOR_LANE = new Set(['roomba', 'clawdlet', 'rover'])
const WALKS = new Set(['idle (wander)', 'working (errand)'])

test('companion boxes do not intersect Clawd\'s poses, the crane or the meters', async () => {
  const companions = DECOR.filter((d) => d.slot === 'companion' && d.id !== 'none').map((d) => d.id)
  expect(companions.length).toBe(11)
  for (const kind of companions) {
    const box = COMPANION_BOXES[kind]
    if (!box) throw new Error(`${kind} has no box`)
    for (const [pose, rect] of Object.entries(POSE_BOXES)) {
      if (FLOOR_LANE.has(kind) && WALKS.has(pose)) continue
      if (intersects(box, rect)) throw new Error(`${kind} ${JSON.stringify(box)} overlaps ${pose} ${JSON.stringify(rect)}`)
    }
    for (const [meter, rect] of Object.entries(METER_BOXES)) {
      if (intersects(box, rect)) throw new Error(`${kind} ${JSON.stringify(box)} overlaps the ${meter} meter`)
    }
  }
  // the documented exception really is only the walk past the floor lane
  expect(intersects(COMPANION_BOXES.roomba!, POSE_BOXES['idle (wander)']!)).toBe(true)
})

test('every companion is drawn inside its box', async () => {
  for (const [kind, box] of Object.entries(COMPANION_BOXES)) {
    for (const sleeping of [false, true]) {
      const svg = companionSvg(kind, sleeping)
      expect(svg.length > 0).toBe(true)
      for (const m of svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
        const [x, y, w, ht] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
        const inside = x >= box[0] && y >= box[1] && x + w <= box[2] && y + ht <= box[3]
        if (!inside) throw new Error(`${kind} rect ${x},${y},${w},${ht} leaves its box ${JSON.stringify(box)}`)
      }
    }
  }
})

test('roomba pauses while Clawd sleeps and the cat hides from the crane', async () => {
  const sleeping = sceneSvg({ ...base, mood: 'sleeping', decor: { companion: 'roomba' } })
  expect(sleeping.includes('.m-sleeping .rmb{animation-play-state:paused}')).toBe(true)
  const crane = sceneSvg({ ...base, mood: 'coding', activity: 'terraform', decor: { companion: 'cat' } })
  expect(crane.includes('.a-terraform .cat{opacity:0}')).toBe(true)
  const noCrane = sceneSvg({ ...base, mood: 'coding', activity: 'edit', decor: { companion: 'cat' } })
  expect(noCrane.includes('.a-terraform .cat')).toBe(false)
})

// ---------- per-mood CSS and merged pixel paths ----------

const SLOTS = [...new Set(DECOR.map((d) => d.slot))]

// One test per slot and half of the moods keeps each well under the runner's per-test time limit.
const MOOD_HALVES = [MOODS.slice(0, 5), MOODS.slice(5)] as const

for (const slot of SLOTS) for (const [h, moods] of MOOD_HALVES.entries()) test(`every mood x activity x ${slot} combination is small and transparent (${h + 1}/2)`, async () => {
  for (const item of DECOR.filter((d) => d.slot === slot)) {
    for (const mood of moods) {
      for (const activity of ACTIVITIES) {
        const svg = sceneSvg({ ...base, mood, activity, plantStage: 4, coffee: 3, hour: mood === 'idle' ? 22 : 13, decor: { [slot]: item.id } as DecorChoice })
        if (svg.length >= 32000) throw new Error(`${mood}/${activity}/${slot}=${item.id} is ${svg.length} chars`)
        expect(svg.includes('background:#')).toBe(false)
        expect(svg.includes('background:transparent')).toBe(true)
        expect(svg.includes('shape-rendering="crispEdges"')).toBe(true)
      }
    }
  }
})

test('the style only carries the current station\'s rules', async () => {
  const svg = sceneSvg({ ...base, mood: 'coding' })
  const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''
  expect(css.includes('.s-coding')).toBe(true)
  for (const other of STATIONS.filter((m) => m !== 'coding')) expect(css.includes(`.s-${other} `)).toBe(false)
  // keyframes that the kept rules use are there, unused ones are not
  expect(css.includes('@keyframes tap{')).toBe(true)
  expect(css.includes('@keyframes wander{')).toBe(false)
  expect(css.includes(':root,svg{background:transparent;color-scheme:light dark}')).toBe(true)
  for (const m of css.matchAll(/animation:([\w-]+)/g)) if (m[1] !== 'none') expect(css.includes(`@keyframes ${m[1]}{`)).toBe(true)
})

test('pixel runs are merged into paths', async () => {
  const svg = sceneSvg({ ...base, mood: 'happy', hat: 'crown' })
  const plainRects = (svg.match(/<rect x="[\d.-]+" y="[\d.-]+" width="[\d.]+" height="[\d.]+" fill="#[0-9A-Fa-f]+"\/>/g) ?? []).length
  expect(plainRects).toBe(0)
  expect((svg.match(/<path /g) ?? []).length > 20).toBe(true)
})

// ---------- validity across moods, activities, decor and hats ----------

for (const slot of SLOTS) for (const [h, moods] of MOOD_HALVES.entries()) test(`scene is valid for every mood x activity x ${slot} id (${h + 1}/2)`, async () => {
  let i = h * 997
  for (const item of DECOR.filter((d) => d.slot === slot)) {
    for (const mood of moods) {
      for (const activity of ACTIVITIES) {
        i++
        const svg = sceneSvg({
          ...base, mood, activity, hat: HATS[i % HATS.length] ?? null, hour: (i * 7) % 24, month: (i % 12) + 1,
          helpers: i % 4, combo: (i * 11) % 70, trophies: i % 20, plantStage: i % 5, level: (i * 3) % 40, coffee: i % 4,
          decor: { [item.slot]: item.id } as DecorChoice,
        })
        checkValid(svg)
        expect(svg.includes(`m-${mood}`)).toBe(true)
      }
    }
  }
})

test('scene and mini sprite are valid with every hat and a custom hat', async () => {
  expect(CUSTOM_HAT !== null).toBe(true)
  const hats = [...HAT_DEFS.map((d) => d.id), CUSTOM_HAT, null]
  for (const hat of hats) {
    for (const mood of MOODS) {
      checkValid(miniSvg({ mood, activity: 'agent', hat }))
      checkValid(miniSvg({ mood, activity: 'none', hat }))
    }
    checkValid(sceneSvg({ ...base, mood: 'happy', hat }))
  }
})

test('the wall clock shows the real time', async () => {
  const base: SceneInput = { mood: 'idle', activity: 'none', hat: null, hour: 15, minute: 30, month: 6, helpers: 0, combo: 0, trophies: 0, plantStage: 0, level: 1, coffee: 1 }
  const svg = sceneSvg(base)
  // 15:30 -> hour hand at 3h30 = 105 degrees, minute hand at 180 degrees, both turning on from there
  expect(svg.includes('@keyframes hh{from{transform:rotate(105deg)}to{transform:rotate(465deg)}}')).toBe(true)
  expect(svg.includes('@keyframes mn{from{transform:rotate(180deg)}to{transform:rotate(540deg)}}')).toBe(true)
  expect(sceneSvg({ ...base, hour: 0, minute: 0 }).includes('@keyframes hh{from{transform:rotate(0deg)}')).toBe(true)
  // the same minute draws the same source; the next minute does not
  expect(sceneSvg(base)).toBe(svg)
  expect(sceneSvg({ ...base, minute: 31 }) === svg).toBe(false)
})

// ---------- smooth transitions ----------

test('clawdAt follows the wander and eases a walk away', async () => {
  expect(clawdAt('idle', 0).x).toBe(102)
  expect(clawdAt('idle', 14).x).toBe(176)          // halfway through the 28 s wander he is at the far end
  const mid = clawdAt('idle', 7.6).x               // between the ends while walking over
  expect(mid > 102 && mid < 176).toBe(true)
  expect(clawdAt('coding', 3)).toEqual({ x: 208, y: -20 })
  // a walk starts at the old spot and is gone once it is over
  expect(clawdAt('coding', 0, { dx: -100, dy: 20 })).toEqual({ x: 108, y: 0 })
  expect(clawdAt('coding', 5, { dx: -100, dy: 20 })).toEqual({ x: 208, y: -20 })
})

test('a scene change walks, hops and fades from the previous scene', async () => {
  const svg = sceneSvg({ ...base, mood: 'coding', activity: 'edit', fromX: 150, fromY: 0, fromMood: 'idle', fromActivity: 'search' })
  checkValid(svg)
  expect(svg.includes('class="arr"')).toBe(true)
  expect(svg.includes('@keyframes arrm58p20{from{transform:translate(-58px,20px)}')).toBe(true)
  expect(svg.includes('class="po pz"')).toBe(true)
  expect(svg.includes('class="pout"')).toBe(true)
  // without a previous scene nothing walks or fades
  const still = sceneSvg({ ...base, mood: 'coding' })
  expect(still.includes('class="arr"')).toBe(false)
  expect(still.includes('pz')).toBe(false)
  expect(still.includes('class="pout"')).toBe(false)
  // waking up brightens the room instead of snapping
  expect(sceneSvg({ ...base, mood: 'idle', fromMood: 'sleeping', fromX: 112, fromY: 3 }).includes('undimR')).toBe(true)
})

test('every transition between scenes is valid and fits the Svg limit', async () => {
  for (const from of MOODS) for (const mood of MOODS) {
    const svg = sceneSvg({ ...base, mood, activity: 'search', fromMood: from, fromActivity: 'web', fromX: clawdAt(from, 3).x, fromY: clawdAt(from, 3).y, combo: 25, helpers: 2, usage: FULL_USAGE })
    checkValid(svg)
    const phased = phaseSvg(svg, 1.2, 1234.5, 7.5)
    checkValid(phased)
    expect(phased.length < 131072).toBe(true)
  }
})

test('phaseSvg resumes scene animations on scene time and the room on wall time', async () => {
  const svg = sceneSvg({ ...base, mood: 'idle', fromX: 200, fromY: 0, fromMood: 'thinking' })
  const out = phaseSvg(svg, 10, 100)
  expect(out.includes('.s-idle .me .wk{animation:wander 28s -10s ease-in-out infinite}')).toBe(true)
  expect(/\.arr\{animation:arr[\w]+ [\d.]+s -10s cubic-bezier\(\.4,0,\.3,1\) both\}/.test(out)).toBe(true)
  // a loop's shift is kept under one loop: 100 s into a 46 s drift that starts at -12 s is -20 s
  expect(out.includes('.cl1{animation:drift 46s -20s linear infinite}')).toBe(true)
  // the clock hands are drawn at the real time and are left alone
  expect(out.includes('.mn{transform-origin:118px 44px;animation:mn 3600s linear infinite}')).toBe(true)
  // nothing to resume: the source is unchanged
  expect(phaseSvg(svg, 0, 0)).toBe(svg)
  // station rules and their props run on scene time too
  const git = phaseSvg(sceneSvg({ ...base, mood: 'running', activity: 'git' }), 5, 100)
  expect(git.includes('animation:throw 3s -5s ease-in-out infinite')).toBe(true)
  expect(git.includes('.pl{transform-box:fill-box;transform-origin:center;animation:pl 3s -5s ease-in-out infinite}')).toBe(true)
})

// ---------- usage meters ----------

test('the room draws no hover tooltips', async () => {
  const svg = sceneSvg({ ...base, trophies: 5, usage: { context: { pct: 62, window: 200000 }, fiveHour: { pct: 41, resets: 'at 15:40' }, sevenDay: { pct: 29, resets: 'Fri 09:00' }, compactions: 1 } })
  checkValid(svg)
  expect(svg.includes('<title>')).toBe(false)
})

test('meters hide without data', async () => {
  expect(hourglass({ resets: 'at 15:40' })).toBe('')
  expect(calendar({})).toBe('')
  expect(archiveBox(0)).toBe('')
  expect(sceneSvg({ ...base, usage: { compactions: 0 } })).toBe(sceneSvg(base))
  expect(sceneSvg({ ...base, usage: { fiveHour: { resets: 'at 15:40' } } })).toBe(sceneSvg(base))
  expect(sceneSvg({ ...base, usage: { context: { window: 200000 } } }) !== sceneSvg(base)).toBe(true)
})

test('meter source is stable for small changes', async () => {
  const at = (usage: SceneInput['usage']): string => sceneSvg({ ...base, usage })
  const ctx = (pct: number) => at({ context: { pct, window: 200000 } })
  expect(ctx(61)).toBe(ctx(62))
  expect(ctx(62) !== ctx(63)).toBe(true)
  const five = (pct: number) => at({ fiveHour: { pct, resets: 'at 15:40' } })
  expect(five(40.2)).toBe(five(41.9))
  expect(five(42.4) !== five(57.6)).toBe(true)
  const week = (pct: number) => at({ sevenDay: { pct } })
  expect(week(11)).toBe(week(12))
  // callers that pass no usage draw exactly what they drew before
  expect(sceneSvg(base)).toBe(at({}))
  expect(sceneSvg(base)).toBe(at(undefined))
})

test('odd usage input', async () => {
  const svg = sceneSvg({ ...base, usage: { context: { pct: Number.NaN, window: -5 }, fiveHour: { pct: 1e9, resets: '<script>x' }, sevenDay: { pct: -3 }, compactions: 1e6 } })
  checkValid(svg)
  expect(svg.includes('<script')).toBe(false)
})

test('meter changes animate once on the meter clock', async () => {
  const grow = sceneSvg({ ...base, usage: { context: { pct: 60, window: 200000 }, from: { context: 30 } } })
  expect(grow.includes('class="pdr"')).toBe(true)
  const tidy = sceneSvg({ ...base, usage: { context: { window: 200000 }, compactions: 1, from: { context: 85 } } })
  expect(tidy.includes('class="pfl"')).toBe(true)
  const still = sceneSvg({ ...base, usage: { context: { pct: 60, window: 200000 }, fiveHour: { pct: 50 }, sevenDay: { pct: 50 } } })
  expect(still.includes('class="pdr"') || still.includes('class="pfl"') || still.includes('hgf') || still.includes('cdf')).toBe(false)
  expect(phaseSvg(grow, 0, 0, 10).includes('.pdr{animation:pdr .5s -10s ease-out both}')).toBe(true)
  expect(phaseSvg(grow, 0, 0)).toBe(grow)
  // the sand stream keeps wall time
  const glass = sceneSvg({ ...base, usage: { fiveHour: { pct: 50 }, sevenDay: { pct: 40 }, from: { fiveHour: 40, sevenDay: 20 } } })
  expect(glass.includes('class="hgf"')).toBe(true)
  expect(glass.includes('class="cdf"')).toBe(true)
  // (100.25 s of wall time is a quarter into the 1 s loop)
  const phased = phaseSvg(glass, 0, 100.25, 10)
  expect(phased.includes('.hgs{animation:hgs 1s -0.25s ease-in-out infinite}')).toBe(true)
  expect(phased.includes('.hgf{animation:hgf 1.2s -10s ease-out both}')).toBe(true)
  checkValid(phased)
})

test('meters stay clear of Clawd, companions and the crane', async () => {
  for (const [name, box] of Object.entries(METER_BOXES)) {
    for (const [pose, rect] of [...Object.entries(POSE_BOXES), ...Object.entries(COMPANION_BOXES)]) {
      if (intersects(box, rect)) throw new Error(`${name} ${JSON.stringify(box)} overlaps ${pose} ${JSON.stringify(rect)}`)
    }
  }
  const draws: Array<[keyof typeof METER_BOXES, string]> = [['archive', archiveBox(3)]]
  for (const pct of [0, 2, 50, 85, 100, undefined]) {
    for (const from of [undefined, -1, 0, 50, 100]) {
      draws.push(['papers', paperStack({ pct, window: 200000 }, from)])
      draws.push(['hourglass', hourglass({ pct, resets: 'at 15:40' }, from)])
      draws.push(['calendar', calendar({ pct, resets: 'Fri 09:00' }, from)])
    }
  }
  for (const [name, svg] of draws) {
    const box = METER_BOXES[name]
    for (const m of svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      const [x, y, w, ht] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
      const inside = x >= box[0] && y >= box[1] && x + w <= box[2] && y + ht <= box[3]
      if (!inside) throw new Error(`${name} rect ${x},${y},${w},${ht} leaves its box ${JSON.stringify(box)}`)
    }
  }
})

test('the paper stack stays clear of every desk drink', async () => {
  const box = METER_BOXES.papers
  for (const d of DECOR.filter(d => d.slot === 'drink')) {
    for (const fill of [0, 1, 2, 3]) {
      for (const m of drinkSvg(d.id, fill).matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
        const [x, y, w, ht] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
        if (intersects(box, [x, y, x + w, y + ht])) throw new Error(`${d.id} rect ${x},${y},${w},${ht} overlaps the papers ${JSON.stringify(box)}`)
      }
    }
  }
})

// ---------- activity stations ----------

// Where the CSS puts Clawd's .wk: a fixed translateX, or the first stop of its keyframes.
function cssSpot(svg: string, st: Station): number | undefined {
  const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1]!.split(',').some((sel) => sel.trim() === `.s-${st} .me .wk`)) continue
    const fixed = /transform:translateX\(([\d.-]+)px\)/.exec(m[2]!)
    if (fixed) return Number(fixed[1])
    const name = /animation:([\w-]+)/.exec(m[2]!)?.[1]
    const first = new RegExp(`@keyframes ${name}\\{0%[^{]*\\{transform:translateX\\(([\\d.-]+)px\\)`).exec(css)
    if (first) return Number(first[1])
  }
  return undefined
}

const STATION_TABLE: Array<[Mood, Activity, Station, number, number]> = [
  ['coding', 'edit', 'coding', 208, -20], ['coding', 'write', 'write', 208, -20], ['reading', 'read', 'reading', 10, 0],
  ['reading', 'search', 'scan', 10, 0], ['reading', 'web', 'web', 160, 0], ['running', 'shell', 'running', 208, -20],
  ['running', 'test', 'test', 208, -20], ['running', 'git', 'git', 208, -20], ['running', 'terraform', 'crane', 108, 0],
  ['working', 'agent', 'agent', 150, 0], ['working', 'skill', 'skill', 128, 0], ['working', 'none', 'working', 102, 0],
]

test('each activity puts Clawd at its station', async () => {
  for (const [mood, activity, station, x, y] of STATION_TABLE) {
    expect(stationOf(mood, activity)).toBe(station)
    expect(clawdAt(station, 0)).toEqual({ x, y })
    const svg = sceneSvg({ ...base, mood, activity })
    checkValid(svg)
    expect(svg.includes(`s-${station}`)).toBe(true)
    if (cssSpot(svg, station) !== x) throw new Error(`${station}: CSS puts Clawd at ${cssSpot(svg, station)}, not ${x}`)
    if (y !== 0) expect(svg.includes(`.s-${station} .me .lf{transform:translateY(${y}px)}`) || svg.includes(`.s-${station} .me .lf,`)).toBe(true)
  }
  // the rest keep their mood's spot whatever the activity
  for (const mood of ['idle', 'thinking', 'done', 'error', 'sleeping', 'happy'] as Mood[]) {
    for (const activity of ACTIVITIES) expect(stationOf(mood, activity)).toBe(mood)
  }
})

test('each station shows its own props', async () => {
  const at = (mood: Mood, activity: Activity): string => sceneSvg({ ...base, mood, activity })
  const coding = at('coding', 'edit')
  expect(coding.includes('class="scr"') && !coding.includes('class="ty"')).toBe(true)
  const write = at('coding', 'write')
  expect(write.includes('class="ty"') && write.includes('translate(298,116)')).toBe(true)
  const reading = at('reading', 'read')
  expect(reading.includes('class="hd"') && reading.includes('class="pg fbL"')).toBe(true)
  const scan = at('reading', 'search')
  expect(scan.includes('class="mgh"') && scan.includes('class="spn"')).toBe(true)
  const web = at('reading', 'web')
  expect(web.includes('class="bn"') && web.includes('class="wv"')).toBe(true)
  expect(at('running', 'shell').includes('#0B110D')).toBe(true)
  const tests = at('running', 'test')
  expect(tests.includes('class="pop"') && tests.includes('@keyframes pump{')).toBe(true)
  // a failed test run is the error station: no passing check card above the monitor
  expect(tests.includes('translate(296,118)')).toBe(true)
  expect(at('error', 'test').includes('translate(296,118)')).toBe(false)
  const git = at('running', 'git')
  expect(git.includes('class="pl"') && git.includes('@keyframes throw{')).toBe(true)
  const crane = at('running', 'terraform')
  expect(crane.includes('class="lev"') && crane.includes('class="tb"')).toBe(true)
  const agent = at('working', 'agent')
  expect(agent.includes('class="hw h0"') && agent.includes('class="hd"')).toBe(true)
  expect(at('working', 'skill').includes('class="sb"')).toBe(true)
  // nothing leaks in from other stations
  expect(web.includes('class="spn"') || web.includes('class="mgh"')).toBe(false)
  expect(scan.includes('class="pl"') || scan.includes('class="bn"')).toBe(false)
  expect(coding.includes('class="pl"') || coding.includes('class="hd"')).toBe(false)
  expect(at('happy', 'git').includes('class="pl"')).toBe(false)
  for (const svg of [coding, write, reading, scan, web, tests, git, crane, agent]) {
    const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''
    for (const m of css.matchAll(/animation:([\w-]+)/g)) if (m[1] !== 'none') expect(css.includes(`@keyframes ${m[1]}{`)).toBe(true)
  }
})

test('the scan track moves along the shelf', async () => {
  expect(clawdAt('scan', 3).x).toBe(26)
  expect(clawdAt('scan', 6).x).toBe(10)
  const mid = clawdAt('scan', 1.5).x
  expect(mid > 10 && mid < 26).toBe(true)
})

test('a station change in the same mood walks, squashes and fades', async () => {
  const web = sceneSvg({ ...base, mood: 'reading', activity: 'web', fromMood: 'reading', fromActivity: 'read', fromX: 10, fromY: 0 })
  checkValid(web)
  expect(web.includes('@keyframes arrm150p0{')).toBe(true)
  expect(web.includes('class="po pz"')).toBe(true)
  expect(web.includes('class="pout"')).toBe(true)
  expect(/<g class="pin" style="animation-delay:[\d.]+s">/.test(web)).toBe(true)
  // the book goes back on the shelf
  expect(web.includes('class="bki"')).toBe(true)
  // Read to Grep at the same spot: no walk, but a squash and a crossfade
  const grep = sceneSvg({ ...base, mood: 'reading', activity: 'search', fromMood: 'reading', fromActivity: 'read', fromX: 10, fromY: 0 })
  expect(grep.includes('class="arr"')).toBe(false)
  expect(grep.includes('class="po pz"')).toBe(true)
  expect(grep.includes('class="bki"')).toBe(true)
  const read = sceneSvg({ ...base, mood: 'reading', activity: 'read', fromMood: 'reading', fromActivity: 'search', fromX: 14, fromY: 0 })
  expect(read.includes('class="bko"')).toBe(true)
  // the one-shot book slide resumes finished on scene time
  expect(phaseSvg(read, 5, 100).includes('.bko{animation:bko .8s -4.7s ease-in both}')).toBe(true)
  // walking over from the desk: the book waits for Clawd, sliding out as the one in his hands fades in
  const walked = sceneSvg({ ...base, mood: 'reading', activity: 'read', fromMood: 'coding', fromActivity: 'edit', fromX: 208, fromY: -20 })
  const arr = Number(/\.arr\{animation:\w+ ([\d.]+)s/.exec(walked)?.[1])
  const pull = Number(/<g class="bko" style="animation-delay:([\d.]+)s">/.exec(walked)?.[1])
  const held = Number(/<g class="pin" style="animation-delay:([\d.]+)s">/.exec(walked)?.[1])
  expect(arr).toBeGreaterThan(1)
  expect(Math.abs(pull - (arr * 0.8 - 0.5)) < 0.05).toBe(true)
  expect(pull + 0.8).toBeGreaterThan(held)
  // Edit to Write stays at the PC but changes the screen and pose
  const write = sceneSvg({ ...base, mood: 'coding', activity: 'write', fromMood: 'coding', fromActivity: 'edit', fromX: 208, fromY: -20 })
  expect(write.includes('class="arr"')).toBe(false)
  expect(write.includes('class="po pz"')).toBe(true)
})

test('the sill radio stays clear of the fishbowl, the hourglass and Clawd', async () => {
  const radio = [176, 60, 208, 100] as const
  expect(intersects(radio, COMPANION_BOXES.fishbowl!)).toBe(false)
  expect(intersects(radio, METER_BOXES.hourglass)).toBe(false)
  for (const rect of Object.values(POSE_BOXES)) expect(intersects(radio, rect)).toBe(false)
  // every pixel run of the radio scene's props (the paths and rects after the bed) is inside the box
  const svg = sceneSvg({ ...base, mood: 'reading', activity: 'web' })
  expect(svg.includes('M178 91h18v9h-18z')).toBe(true)
  for (const m of svg.matchAll(/class="wv"[^>]*d="M([\d.]+) ([\d.]+)a([\d.]+)/g)) {
    const [x, y, r] = [Number(m[1]), Number(m[2]), Number(m[3])]
    expect(x <= radio[2] && x - r >= radio[0] && y - r >= radio[1]).toBe(true)
  }
})

test('the wall calendar shows today\'s date', async () => {
  const header = (svg: string) => svg.length
  const d6 = calendar({ pct: 40 }, undefined, 6)
  const d23 = calendar({ pct: 40 }, undefined, 23)
  expect(d6 === d23).toBe(false)
  expect(calendar({ pct: 40 }, undefined, 6)).toBe(d6)
  // odd input falls back instead of breaking the drawing
  expect(header(calendar({ pct: 40 }, undefined, Number.NaN)) > 0).toBe(true)
  expect(calendar({ pct: 40 }, undefined, 99)).toBe(calendar({ pct: 40 }, undefined, 31))
  checkValid(sceneSvg({ ...base, day: 6, usage: { sevenDay: { pct: 40 } } } as SceneInput))
})

const REDUCED = /@media \(prefers-reduced-motion:reduce\)\{([^{}]*)\{animation:none!important\}(\.alr\{animation-duration:2\.4s\})?\}/

test('ambient decoration stops under reduced motion, Clawd keeps moving (B57)', async () => {
  const svg = sceneSvg({
    ...base, hour: 10, month: 12, level: 100, plantStage: 4, trophies: 14, coffee: 2, hat: 'ninja',
    decor: { ceiling: 'bunting', companion: 'corgi', lamp: 'plasma', view: 'sea' },
    usage: { fiveHour: { pct: 50 } },
  })
  const m = REDUCED.exec(svg)
  expect(m !== null).toBe(true)
  const classes = m![1]!.split(',')
  // the block is the very last rule, so nothing after it can restart an animation
  expect(svg.indexOf(m![0]) + m![0].length).toBe(svg.indexOf('</style>'))
  for (const c of ['.cl1', '.skw', '.lfg', '.stm', '.bnt', '.h-flut', '.cwg', '.hgs', '.mt']) {
    if (!classes.includes(c)) throw new Error(`${c} keeps moving under reduced motion`)
  }
  for (const c of ['.wk', '.fc', '.lf', '.arr', '.pdr', '.pfl', '.hgf', '.cdf']) expect(classes.includes(c)).toBe(false)
  // only classes the scene draws are listed
  const drawn = new Set([...svg.matchAll(/class="([^"]+)"/g)].flatMap((x) => x[1]!.split(/\s+/)))
  for (const c of classes) expect(drawn.has(c.slice(1))).toBe(true)
  // phasing leaves the block intact
  expect(phaseSvg(svg, 5, 100, 3).includes(m![0])).toBe(true)
  checkValid(phaseSvg(svg, 5, 100, 3))
  // the error blink slows instead of stopping
  const err = sceneSvg({ ...base, mood: 'error', activity: 'edit' })
  expect(REDUCED.exec(err)?.[2]).toBe('.alr{animation-duration:2.4s}')
  // decor, hat and room classes are covered too
  const more = REDUCED.exec(sceneSvg({ ...base, hat: 'ufo', decor: { ceiling: 'planes' } }))![1]!.split(',')
  expect(more.includes('.ppm') && more.includes('.h-hover')).toBe(true)
})

test('meters warn by colour before the limit', async () => {
  // the crossed-off squares share the hourglass's gold / orange / red scale
  expect(calendar({ pct: 40 }).includes('#E2B84A')).toBe(true)
  expect(calendar({ pct: 85 }).includes('#E8892E')).toBe(true)
  expect(calendar({ pct: 100 }).includes('#8E3B2B')).toBe(true)
  expect(calendar({ pct: 40 }).includes('#8E3B2B')).toBe(false)
  // date digits land on whole pixels
  for (const d of [1, 7, 12, 31]) expect(/x="\d+\.\d/.test(calendar({ pct: 0 }, undefined, d))).toBe(false)
})

test('decor previews crop the empty room to one slot', async () => {
  for (const slot of SLOT_IDS) expect((slot === 'companion' ? decorCrop(slot, 'cat') : decorCrop(slot)) !== undefined).toBe(true)
  expect(decorCrop('bed')).toEqual([106, 190, 84, 46])
  expect(decorCrop('shelf')).toEqual([6, 72, 76, 40])
  expect(decorCrop('drink')).toEqual([344, 164, 30, 34])
  expect(decorCrop('companion', 'dragon')).toEqual([94, 68, 42, 32])
  expect(decorCrop('companion', 'none')).toBeUndefined()
  const svg = decorPreview({ ...base, decor: { poster: 'cat' } }, 'poster', 2)
  checkValid(svg)
  expect(svg.includes('viewBox="262 18 34 50" width="68" height="100"')).toBe(true)
  expect(svg.includes('class="me"')).toBe(false)
  expect(decorPreview({ ...base, decor: { poster: 'cat' } }, 'poster') !== decorPreview({ ...base, decor: { poster: 'wave' } }, 'poster')).toBe(true)
  expect(decorPreview({ ...base, decor: { companion: 'none' } }, 'companion')).toBe('')
  checkValid(decorPreview({ ...base, decor: { companion: 'cat' } }, 'companion'))
})

test('R4: every Decor-tab preview is big enough to tell its pieces apart', async () => {
  const pets = ['cat', 'corgi', 'roomba', 'clawdlet', 'rover', 'fishbowl', 'axolotl', 'snail', 'dragon', 'drone', 'ghost']
  const crops = [
    ...SLOT_IDS.filter(s => s !== 'companion').map(s => ({ name: s, crop: decorCrop(s)! })),
    ...pets.map(c => ({ name: `companion ${c}`, crop: decorCrop('companion', c)! })),
  ]
  // the narrowest pane (the room's own 180 px floor) and a roomy one
  for (const avail of [180, 312, 900]) {
    for (const { name, crop } of crops) {
      const [, , w, h] = crop
      const size = previewSize(w, h, avail)
      const perUnit = size.width / w
      if (size.isWide ? perUnit < 0.8 || size.height < 12 || size.width > Math.max(avail, w * 0.8) : perUnit < 0.6 || size.height < 30 || size.width > 88 || size.height > 64) {
        throw new Error(`${name} at ${avail}px: ${size.width}x${size.height} (${perUnit.toFixed(2)} px a unit)`)
      }
    }
  }
  // the ceiling and the rug get a row of their own, at the room's scale where the pane allows it
  expect(previewSize(216, 20, 900)).toEqual({ width: 281, height: 26, isWide: true })
  expect(previewSize(158, 14, 312).isWide).toBe(true)
  expect(previewSize(158, 14, 312).height >= 18).toBe(true)
  expect(previewSize(44, 94, 312)).toEqual({ width: 30, height: 64, isWide: false })
})

test('the seasonal pumpkin or tree stays beside any shelf piece (B62)', async () => {
  const tree = '#3F7D4E'
  const shelf = (month: number, piece: string): string => decorPreview({ ...base, month, decor: { shelf: piece } }, 'shelf')
  expect(shelf(10, 'none').includes('class="jk"')).toBe(true)
  expect(shelf(12, 'none').includes(tree)).toBe(true)
  for (const piece of itemsOf('shelf')) {
    expect(shelf(12, piece).includes(tree)).toBe(true)
    expect(shelf(10, piece).includes('class="jk"')).toBe(true)
    expect(shelf(6, piece).includes('class="jk"')).toBe(false)
  }
  expect(shelf(10, 'lava').includes('lv1')).toBe(true)
  // the December star twinkles on wall time
  expect(shelf(12, 'none').includes('class="skw"')).toBe(true)
})

// ---------- hats (B59) and the wardrobe mirror (B55) ----------

test('every catalog hat has an unlock rule and renders a hat group with pixels', async () => {
  expect(HAT_DEFS.length).toBe(44)
  for (const def of HAT_DEFS) {
    expect(typeof def.unlock).toBe('object')
    for (const svg of [sceneSvg({ ...base, hat: def.id }), miniSvg({ mood: 'idle', activity: 'none', hat: def.id })]) {
      if (!/<g class="hat">[\s\S]*?<path /.test(svg)) throw new Error(`${def.id} draws no hat pixels`)
    }
  }
  // a custom hat still goes through sanitizeHat; junk draws no hat
  expect(sceneSvg({ ...base, hat: CUSTOM_HAT }).includes('class="hat"')).toBe(true)
  expect(sceneSvg({ ...base, hat: 'nope' as never }).includes('class="hat"')).toBe(false)
  expect(sceneSvg({ ...base, hat: { rows: 5 } as never })).toBe(sceneSvg(base))
})

test('hat animations run on scene time', async () => {
  const svg = sceneSvg({ ...base, hat: 'ninja' })
  expect(svg.includes('h-flut')).toBe(true)
  expect(/\.h-flut\{[^}]*animation:hk-flut [\d.]+s -7s/.test(phaseSvg(svg, 7, 100))).toBe(true)
})

const EIGHT_ROW_HAT = sanitizeHat({
  id: 'tall', name: 'Tall', palette: { a: '#4F8BD8', b: '#F6D365' },
  rows: ['...aa...', '..abba..', '..aaaa..', '.abbbba.', '.aaaaaa.', 'abbbbbba', 'aaaaaaaa', 'bbbbbbbb'],
})

test('the mirror has headroom for every hat while Clawd hops', async () => {
  expect(MIRROR_RATIO).toBe(52 / 64)
  const mirror = miniSvg({ mood: 'happy', activity: 'none', hat: 'starcrown' }, { mirror: true })
  checkValid(mirror)
  expect(mirror.includes('viewBox="0 -12 64 52" width="64" height="52"')).toBe(true)
  expect(miniSvg({ mood: 'idle', activity: 'none', hat: null }).includes('viewBox="0 0 64 40"')).toBe(true)
  expect(EIGHT_ROW_HAT !== null && EIGHT_ROW_HAT.rows.length === 8).toBe(true)
  // the sprite sits at y 20 at scale .3; the hop lifts it 14 sprite px
  for (const hat of [...HAT_DEFS.map((d) => d.id), EIGHT_ROW_HAT]) {
    const top = 20 + 0.3 * (hatTop(hat) - 14)
    if (top < -12) throw new Error(`${typeof hat === 'string' ? hat : 'custom'} reaches ${top}, above the mirror`)
  }
})

test('the status-row mini keeps every hat inside its box while Clawd jumps or hops', async () => {
  // the mini has no headroom: done and happy use the small lift there, never the room's 26 px jump
  for (const mood of ['done', 'happy'] as Mood[]) {
    const mini = miniSvg({ mood, activity: 'none', hat: 'wizard' })
    checkValid(mini)
    expect(mini.includes(`class="cm qm-${mood} qs"`)).toBe(true)
    const lifts = [...mini.matchAll(/@keyframes (qjump|qhop)\{[^@]*?translateY\(-(\d+)px\)/g)].map((m) => Number(m[2]))
    expect(lifts.length).toBe(2)
    for (const lift of lifts) expect(lift).toBe(MINI_LIFT)
    // the mirror has headroom and keeps the full jump
    expect(miniSvg({ mood, activity: 'none', hat: 'wizard' }, { mirror: true }).includes(' qs"')).toBe(false)
  }
  for (const hat of [...HAT_DEFS.map((d) => d.id), EIGHT_ROW_HAT]) {
    const top = 20 + 0.3 * (hatTop(hat) - MINI_LIFT)
    if (top < 0) throw new Error(`${typeof hat === 'string' ? hat : 'custom'} reaches ${top}, above the status-row mini`)
  }
})

// ---------- slot plumbing ----------

const rectsOf = (svg: string): Array<[number, number, number, number]> =>
  [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])])

const PHASES: DayPhase[] = ['night', 'morning', 'day', 'sunset']

// Every drawing a slot's art can make for one piece.
function slotArt(slot: DecorSlot, id: string): string[] {
  switch (slot) {
    case 'drink': return [0, 1, 2, 3].map((f) => drinkSvg(id, f))
    case 'plant': return [0, 1, 2, 3, 4].map((st) => plantSvg(id, st))
    case 'poster': return [posterSvg(id, false), posterSvg(id, true)]
    case 'rug': return [rugSvg(id)]
    case 'shelf': return [shelfSvg(id)]
    case 'companion': return [companionSvg(id, false), companionSvg(id, true)]
    case 'bed': return [bedSvg(id), bedLipSvg(id)]
    case 'lamp': return [lampSvg(id, false), lampSvg(id, true)]
    case 'clock': return [clockSvg(id)?.face ?? '']
    case 'ceiling': return [ceilingSvg(id, false), ceilingSvg(id, true)]
    case 'wall': return [wallSvg(id)]
    case 'view': return PHASES.flatMap((ph) => [1, 4, 10, 12].map((mo) => viewSvg(id, ph, mo)))
  }
}

test('each slot\'s own rects fit its preview crop (B66)', async () => {
  const out: string[] = []
  for (const item of DECOR) {
    const crop = decorCrop(item.slot, item.id)
    if (!crop) { expect(item.id).toBe('none'); continue }
    const [cx, cy, cw, ch] = crop
    for (const art of slotArt(item.slot, item.id)) {
      for (const [x, y, w, h] of rectsOf(art)) {
        if (x < cx || y < cy || x + w > cx + cw || y + h > cy + ch) out.push(`${item.slot}=${item.id} rect ${x},${y},${w},${h} leaves ${JSON.stringify(crop)}`)
      }
    }
  }
  if (out.length > 0) throw new Error([...new Set(out)].slice(0, 12).join('; '))
})

test('clock and hovering roommate previews show no curtain strip and no piece of the clock', async () => {
  const curtain = 136
  const clockCrop = decorCrop('clock')!
  expect(clockCrop[0] + clockCrop[2] <= curtain).toBe(true)
  for (const c of ['dragon', 'drone', 'ghost']) {
    const [x, y, w, h] = decorCrop('companion', c)!
    expect([c, x + w <= curtain]).toEqual([c, true])
    // no clock rect reaches into the roommate's crop
    for (const id of ROOM_IDS.clock) {
      for (const [rx, ry, rw, rh] of rectsOf(clockSvg(id)?.face ?? '')) {
        const overlaps = rx < x + w && rx + rw > x && ry < y + h && ry + rh > y
        if (overlaps) throw new Error(`${c} crop ${JSON.stringify([x, y, w, h])} shows clock ${id} rect ${rx},${ry},${rw},${rh}`)
      }
    }
  }
  // a roommate right of the curtain keeps its own box
  expect(decorCrop('companion', 'cat')).toEqual([312, 212, 40, 24])
})

test('every decor piece has a preview of its own, unlike its slot default (B60)', async () => {
  const at = { ...base, level: 1, plantStage: 4, coffee: 2, hour: 22, month: 6 }
  const auto = autoDecor(1)
  for (const item of DECOR.filter((d) => d.kind !== 'default')) {
    const preview = decorPreview({ ...at, decor: { [item.slot]: item.id } }, item.slot)
    if (preview === '') throw new Error(`${item.slot}=${item.id} has no preview`)
    checkValid(preview)
    // a roommate's default is nobody (no preview at all); every other slot compares with its default piece
    if (item.slot === 'companion') continue
    if (preview === decorPreview({ ...at, decor: { [item.slot]: auto[item.slot] } }, item.slot)) {
      throw new Error(`${item.slot}=${item.id} looks like the ${auto[item.slot]} default`)
    }
  }
})

test('Clawd at the desk leaves every lamp in view, and no lamp covers the screen or the LED', async () => {
  // the desk stations seat Clawd on the stool: his body spans sprite x 12..60 (and down to the legs, 24 px), his claws
  // x 4..68 at 8..12 px below the top; the top is 30 px over the floor, lifted by the stool
  for (const st of ['coding', 'write', 'running', 'test', 'git', 'error'] as Station[]) {
    const { x, y } = clawdAt(st, 0)
    const top = 232 - 30 + y
    const body = [x + 12, top, x + 60, top + 24]
    const claws = [x + 4, top + 8, x + 68, top + 12]
    const covered = (r: readonly number[], b: readonly number[]) =>
      Math.max(0, Math.min(r[0]! + r[2]!, b[2]!) - Math.max(r[0]!, b[0]!)) * Math.max(0, Math.min(r[1]! + r[3]!, b[3]!) - Math.max(r[1]!, b[1]!))
    for (const id of ROOM_IDS.lamp) {
      for (const on of [false, true]) {
        const rects = rectsOf(lampSvg(id, on))
        const total = rects.reduce((sum, r) => sum + r[2] * r[3], 0)
        const hidden = rects.reduce((sum, r) => sum + Math.max(covered(r, body), covered(r, claws)), 0)
        // the desk lamp and the anglepoise light from above his head; every other lamp stands clear of him
        const most = id === 'desk' ? 0.26 : id === 'anglepoise' ? 0.35 : 0.2
        if (hidden / total > most) throw new Error(`${st}: Clawd covers ${Math.round((hidden / total) * 100)}% of the ${id} lamp`)
        for (const [rx, ry, rw, rh] of rects) {
          // the screen (284..348 x 142..182) and the status LED (285..288 x 183..185) stay uncovered
          if (intersects([rx, ry, rx + rw, ry + rh], [284, 142, 348, 182]) || intersects([rx, ry, rx + rw, ry + rh], [285, 183, 288, 185])) {
            throw new Error(`the ${id} lamp covers the monitor at ${rx},${ry}`)
          }
        }
      }
    }
  }
})

test('the room draws every slot of its own, and an unknown id shows the default', async () => {
  for (const slot of ['bed', 'lamp', 'clock', 'ceiling'] as const) {
    for (const id of ROOM_IDS[slot]) {
      const art = slotArt(slot, id).join('')
      if (id === 'none') expect(art).toBe('')
      else if (art === '') throw new Error(`${slot}=${id} draws nothing`)
      expect(itemsOf(slot).includes(id)).toBe(true)
    }
    expect(itemsOf(slot).length).toBe(ROOM_IDS[slot].length)
  }
  expect(clockSvg('nope')).toBeNull()
  expect(bedSvg('nope') + lampSvg('nope', true) + ceilingSvg('nope', true)).toBe('')
  const odd: DecorChoice = Object.fromEntries(SLOT_IDS.map((slot) => [slot, 'no-such-piece']))
  for (const level of [1, 8, 30]) expect(sceneSvg({ ...base, level, decor: odd })).toBe(sceneSvg({ ...base, level }))
  expect(sceneSvg({ ...base, level: 30, decor: { ...odd, bed: 'throne' } })).toBe(sceneSvg({ ...base, level: 30, decor: { bed: 'throne' } }))
})

test('room pieces stay small after merging and read on light and dark panes', async () => {
  const lum = (hex: string): number => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
  }
  const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  for (const slot of ['bed', 'lamp', 'clock', 'ceiling'] as const) {
    for (const id of ROOM_IDS[slot].filter((i) => i !== 'none')) {
      for (const art of slotArt(slot, id)) {
        const merged = mergeRects(art)
        if (merged.length > 1500) throw new Error(`${slot}=${id} is ${merged.length} chars merged`)
        const colors = [...new Set([...art.matchAll(/(?:fill|stroke)="(#[0-9A-F]{6})"/gi)].map((m) => m[1]!))]
        for (const pane of ['#262624', '#FAF9F5']) {
          if (!colors.some((c) => ratio(c, pane) >= 2)) throw new Error(`${slot}=${id} vanishes on ${pane}`)
        }
      }
    }
  }
})

test('asleep, Clawd never shows below the bed front: his sunk feet are clipped at the floor line', async () => {
  const sink = clawdAt('sleeping', 0).y
  expect(sink > 0).toBe(true) // he sinks into the bed, so his feet (on the floor line when standing) would reach below it
  for (const bed of ROOM_IDS.bed) {
    const svg = sceneSvg({ ...base, mood: 'sleeping', decor: { bed } })
    const clip = svg.match(/<clipPath id="(\w+f)"><rect x="0" y="(-?\d+)" width="400" height="(\d+)"\/><\/clipPath><g clip-path="url\(#\1\)"><g class="me"/)
    if (!clip) throw new Error(`${bed}: sleeping Clawd is not clipped`)
    expect(Number(clip[2]) + Number(clip[3])).toBe(232)
    // the bed front reaches down to the floor line and covers the rest of his legs
    const bottoms = [...bedLipSvg(bed).matchAll(/y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)].map(m => Number(m[1]) + Number(m[2]))
    expect(Math.max(...bottoms)).toBe(232)
    checkValid(svg)
  }
  expect(/<g clip-path="url\(#\w+f\)"><g class="me"/.test(sceneSvg({ ...base, mood: 'idle' }))).toBe(false)
})

test('snow falls past every window view but Low Orbit', async () => {
  for (const hour of [14, 23]) {
    const orbit = sceneSvg({ ...base, month: 1, hour, decor: { view: 'orbit' } })
    expect(orbit.includes('class="sn"')).toBe(false)
    expect(orbit.includes('#F2F2F2')).toBe(false) // no snow strip on the sill either
    checkValid(orbit)
    expect(sceneSvg({ ...base, month: 1, hour, decor: { view: 'city' } }).includes('class="sn"')).toBe(true)
    expect(sceneSvg({ ...base, month: 1, hour, decor: { view: 'sea' } }).includes('class="sn"')).toBe(true)
  }
})

test('bed, lamp, clock and ceiling slots draw in the room', async () => {
  // the bed lip only while Clawd sleeps
  const lip = '#DDB884'
  expect(sceneSvg({ ...base, mood: 'sleeping', decor: { bed: 'basket' } }).includes(lip)).toBe(true)
  expect(sceneSvg({ ...base, mood: 'idle', decor: { bed: 'basket' } }).includes(lip)).toBe(false)
  // the lamp is on at night unless Clawd sleeps
  expect(sceneSvg({ ...base, hour: 22, decor: { lamp: 'lantern' } }).includes('class="lfl"')).toBe(true)
  expect(sceneSvg({ ...base, hour: 13, decor: { lamp: 'lantern' } }).includes('class="lfl"')).toBe(false)
  expect(sceneSvg({ ...base, hour: 22, mood: 'sleeping', decor: { lamp: 'lantern' } }).includes('class="lfl"')).toBe(false)
  // the hands take the clock's hand colour, and keep the real time
  const port = sceneSvg({ ...base, hour: 15, minute: 30, decor: { clock: 'porthole' } })
  expect(/fill="#F2EFE6" class="hh"/.test(port) && /fill="#F2EFE6" class="mn"/.test(port)).toBe(true)
  expect(port.includes('@keyframes hh{from{transform:rotate(105deg)}')).toBe(true)
  expect(/fill="#1F1E1D" class="hh"/.test(sceneSvg(base))).toBe(true)
  // the ceiling replaces the old string lights; paper lanterns glow at night
  expect(sceneSvg({ ...base, level: 14 }).includes('M92 3Q144')).toBe(false)
  expect(sceneSvg({ ...base, level: 15 }).includes('class="lt0"')).toBe(true)
  expect(sceneSvg({ ...base, level: 1, decor: { ceiling: 'bunting' } }).includes('class="bnt"')).toBe(true)
  expect(sceneSvg({ ...base, hour: 22, decor: { ceiling: 'lanterns' } }).includes('fill="#FFB36B" opacity="0.15"')).toBe(true)
  expect(sceneSvg({ ...base, hour: 13, decor: { ceiling: 'lanterns' } }).includes('fill="#FFB36B" opacity="0.15"')).toBe(false)
  // the window view replaces the skyline; the wall hanging shows
  expect(sceneSvg({ ...base, decor: { view: 'sea' } }) !== sceneSvg(base)).toBe(true)
  expect(sceneSvg({ ...base, decor: { view: 'city' } })).toBe(sceneSvg(base))
  expect(sceneSvg({ ...base, decor: { wall: 'records' } }) !== sceneSvg(base)).toBe(true)
})

test('sleep darkens the room and the roommates on both pane themes: brightness, never see-through', async () => {
  const asleep = sceneSvg({ ...base, mood: 'sleeping', decor: { companion: 'cat' } })
  const css = asleep.slice(asleep.indexOf('<style>'), asleep.indexOf('</style>'))
  // the scene is transparent: half opacity would fade the room toward a light pane instead of darkening it
  for (const rule of css.match(/\.m-sleeping \.(room|cmp)\{[^}]*\}/g) ?? []) expect([rule, rule.includes('opacity')]).toEqual([rule, false])
  expect(css.includes('.m-sleeping .room{filter:brightness(.55)')).toBe(true)
  for (const kf of css.match(/@keyframes (un)?dimR\{[^@]*?\}\}/g) ?? []) expect([kf, kf.includes('opacity')]).toEqual([kf, false])
  const waking = sceneSvg({ ...base, mood: 'idle', fromMood: 'sleeping', fromX: 112, fromY: 3 })
  expect(waking.includes('@keyframes undimR{from{filter:brightness(.55)}to{filter:brightness(1)}}')).toBe(true)
})

test('roommates dim while Clawd sleeps (B64)', async () => {
  const asleep = sceneSvg({ ...base, mood: 'sleeping', decor: { companion: 'cat' } })
  expect(asleep.includes('<g class="cmp">')).toBe(true)
  expect(asleep.includes('.m-sleeping .cmp{filter:brightness(.55)}')).toBe(true)
  expect(sceneSvg({ ...base, mood: 'idle', decor: { companion: 'cat' } }).includes('.m-sleeping .cmp')).toBe(false)
  expect(sceneSvg({ ...base, mood: 'sleeping' }).includes('class="cmp"')).toBe(false)
})

// ---------- room upgrades by level (B54) ----------

const fillOf = (svg: string, sub: string): string | undefined => {
  for (const m of svg.matchAll(/<path fill="(#[0-9A-Fa-f]{6})"(?: opacity="[\d.]+")? d="([^"]*)"/g)) if (m[2]!.includes(sub)) return m[1]
  return undefined
}

const BADGE_FACE = 'M343 104h6v8h-6z'
const TIERS: Array<[number, string, (svg: string) => boolean]> = [
  [10, 'bronze level badge', (svg) => fillOf(svg, BADGE_FACE) === '#C08552'],
  [25, 'silver level badge', (svg) => fillOf(svg, BADGE_FACE) === '#C3C8CE'],
  [50, 'gold level badge', (svg) => fillOf(svg, BADGE_FACE) === '#E2B84A'],
  [75, 'platinum level badge', (svg) => fillOf(svg, BADGE_FACE) === '#D3E1EC'],
  [12, 'second monitor', (svg) => svg.includes('class="bar"')],
  [20, 'gold poster frame', (svg) => svg.includes('#F6D88A')],
  [25, 'gold trim on the trophy planks', (svg) => fillOf(svg, 'M296 96h100v1h-100z') === '#E2B84A'],
  [40, 'window flower box', (svg) => fillOf(svg, 'M152 112h96v4h-96z') !== undefined],
  [50, 'wainscoting', (svg) => fillOf(svg, 'M0 184h400v48h-400z') !== undefined],
  [60, 'third trophy plank, filled', (svg) => fillOf(svg, 'M296 20h100v3h-100z') !== undefined && svg.includes('M301 6h10v2h-10z')],
  [75, 'night shooting stars', (svg) => svg.includes('class="shs"')],
  [90, 'gold trophy planks', (svg) => fillOf(svg, 'M296 96h100v3h-100z') === '#E2B84A'],
  [100, 'gold window frame', (svg) => fillOf(svg, 'M146 14h108v6h-108z') === '#C99A2E'],
  [100, 'gold motes at night', (svg) => /fill="#F6D365" class="mt"/.test(svg)],
]

test('every room upgrade appears at its level and not one level below', async () => {
  for (const [level, name, has] of TIERS) {
    const at = (lv: number): string => sceneSvg({ ...base, level: lv, hour: 22, trophies: 18, decor: { poster: 'space' } })
    if (!has(at(level))) throw new Error(`${name} is missing at level ${level}`)
    if (has(at(level - 1))) throw new Error(`${name} already shows at level ${level - 1}`)
    checkValid(at(level))
  }
  // shooting stars only at night
  expect(sceneSvg({ ...base, level: 80, hour: 13 }).includes('class="shs"')).toBe(false)
})

// Every infinite animation of a scene, by rule and position: its loop and its delay.
function loopsIn(svg: string): Map<string, { loop: number; delay: number }> {
  const out = new Map<string, { loop: number; delay: number }>()
  const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''
  const secs = (t: string) => parseFloat(t) / (t.endsWith('ms') ? 1000 : 1)
  let k = 0
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const a = /(?:^|;)animation:([^;}]+)/.exec(m[2]!)
    k++
    if (!a) continue
    a[1]!.split(/,(?![^(]*\))/).forEach((one, i) => {
      const t = one.trim().split(/\s+/)
      if (!t.includes('infinite')) return
      const times = t.filter(x => /^-?\d*\.?\d+m?s$/.test(x)).map(secs)
      out.set(`${k}:${m[1]}#${i}`, { loop: times[0]! * (t.some(x => x.startsWith('alternate')) ? 2 : 1), delay: times[1] ?? 0 })
    })
  }
  // inline delays of the steam and equalizer bars (their loops: steam 2.2 s, bars 2.2 s)
  for (const m of svg.matchAll(/class="(stm|bar)" style="animation-delay:(-?[\d.]+)s"/g)) out.set(`inline:${k++}:${m[1]}`, { loop: 2.2, delay: Number(m[2]) })
  return out
}

test('room loops resume seamlessly at any hour: each shift stays under one loop (no hourly jump)', async () => {
  const mod = (v: number, p: number) => ((v % p) + p) % p
  // a whole day of wall time: 23:59:50
  const W = 86390
  let checked = 0
  for (const item of DECOR) {
    for (const extra of [{}, { mood: 'thinking' as Mood, hour: 22 }]) {
      const svg = sceneSvg({ ...base, ...extra, decor: { [item.slot]: item.id } as DecorChoice, usage: FULL_USAGE })
      const before = loopsIn(svg)
      const after = loopsIn(phaseSvg(svg, 9, W, 9))
      for (const [key, was] of before) {
        const now = after.get(key)!
        // scene and meter loops move 9 s and need no wrap; the clock hands run on real time
        if (now.delay === was.delay || Math.abs(now.delay - (was.delay - 9)) < 0.011) continue
        checked++
        // the same point in the loop as a shift of W ...
        expect(Math.abs(mod(now.delay - (was.delay - W), was.loop) - (mod(now.delay - (was.delay - W), was.loop) > was.loop / 2 ? was.loop : 0))).toBeLessThan(0.011)
        // ... with a delay a loop long at most, so a later shift continues from there
        expect(Math.abs(now.delay - was.delay)).toBeLessThan(was.loop + 0.011)
      }
    }
  }
  expect(checked).toBeGreaterThan(100)
  // the drifting clouds and the rover, one minute apart across an hour: 60 s on in each loop
  const cloudy = sceneSvg({ ...base, decor: { companion: 'rover' } })
  // R4: and across UTC midnight, on the epoch clock the pane uses (the old day wrap moved a 46 s drift 12 s)
  const midnight = Date.UTC(2026, 9, 6) / 1000
  for (const [from, to] of [[3570, 3630], [midnight - 30, midnight + 30]] as const) {
    const a = loopsIn(phaseSvg(cloudy, 0, from)), b = loopsIn(phaseSvg(cloudy, 0, to))
    for (const [key, x] of a) {
      const y = b.get(key)!
      if (x.delay !== y.delay) expect(Math.abs(mod(x.delay - y.delay - 60, x.loop)) < 0.011 || Math.abs(mod(x.delay - y.delay - 60, x.loop) - x.loop) < 0.011).toBe(true)
    }
  }
})

test('trophy metal follows the count', async () => {
  const BRONZE = '#C08552', SILVER = '#C3C8CE'
  const shelf = (trophies: number): string => sceneSvg({ ...base, trophies })
  expect(shelf(29).includes(BRONZE)).toBe(true)
  expect(shelf(30).includes(BRONZE)).toBe(false)
  expect(shelf(30).includes(SILVER)).toBe(true)
  expect(shelf(60).includes(SILVER) || shelf(60).includes(BRONZE)).toBe(false)
  // the newest trophy and the overflow sparkle twinkle on wall time
  expect(phaseSvg(shelf(30), 5, 100).includes('.skw{animation:tw 1.4s -0.6s ease-in-out infinite}')).toBe(true)
})

// ---------- celebrations ----------

test('celebrations are valid overlays on scene time', async () => {
  const kinds: Celebration[] = ['milestone', 'legend', 'star']
  for (const celebrate of kinds) {
    for (const mood of MOODS) {
      const svg = sceneSvg({ ...base, mood, celebrate, level: 100, hour: 22 })
      checkValid(svg)
      checkValid(phaseSvg(svg, 2, 50))
    }
  }
  const at = (celebrate?: Celebration): string => sceneSvg({ ...base, celebrate })
  const milestone = at('milestone')
  expect((milestone.match(/class="cf"/g) ?? []).length).toBe(50)
  expect((milestone.match(/class="fw"/g) ?? []).length).toBe(3)
  expect(milestone.includes('class="bnr"')).toBe(false)
  const gold = (milestone.match(/fill="#(E2B84A|F6D88A|F2C14E|F6D365|C99A2E)" class="cf"/g) ?? []).length
  expect(gold).toBeGreaterThan(30)
  const legend = at('legend')
  expect(legend.includes('class="bnr"') && (legend.match(/class="fw"/g) ?? []).length === 3).toBe(true)
  expect((legend.match(/class="cf"/g) ?? []).length).toBeGreaterThan(50)
  const star = at('star')
  expect(star.includes('class="esb"') && !star.includes('class="fw"') && !star.includes('class="cf"')).toBe(true)
  expect(at()).toBe(sceneSvg(base))
  expect(sceneSvg({ ...base, celebrate: 'party' as never })).toBe(sceneSvg(base))
  // previews never celebrate; the overlays resume on scene time
  expect(decorPreview({ ...base, celebrate: 'legend' }, 'bed').includes('class="fw"')).toBe(false)
  expect(/\.fw\{[^}]*animation:fw 1\.8s -3s/.test(phaseSvg(milestone, 3, 999))).toBe(true)
  expect(/\.bnr\{[^}]*animation:bnr 8s -3s/.test(phaseSvg(legend, 3, 999))).toBe(true)
  expect(/\.esb\{[^}]*animation:esb 1\.5s -3s/.test(phaseSvg(star, 3, 999))).toBe(true)
})

// ---------- fixes ----------

test('the crane control box stands on the floor right of the blocks (B69)', async () => {
  const crane = sceneSvg({ ...base, mood: 'running', activity: 'terraform' })
  expect(crane.includes('M214 216h12v16h-12z')).toBe(true)
  expect(crane.includes('M172 216h12v16h-12z')).toBe(false)
  expect(intersects([214, 200, 226, 232], [110, 196, 186, 232])).toBe(false) // the pet bed
  expect(intersects([214, 200, 226, 232], [228, 212, 256, 232])).toBe(false) // the stool
  expect(intersects([214, 200, 226, 232], [200, 176, 212, 232])).toBe(false) // the block stack
})

test('the spellbook and the thought bubble clear tall hats (B58)', async () => {
  expect(sceneSvg({ ...base, mood: 'working', activity: 'skill' }).includes('translate(-2,-140)')).toBe(true)
  const think = sceneSvg({ ...base, mood: 'thinking' })
  expect(think.includes('M62 -16h5v5h-5z') && think.includes('M58 -8h3v3h-3z')).toBe(true)
})

test('animation classes and keyframes never clash between the art modules', async () => {
  const frames = (css: string): string[] => [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]!)
  const sheets = { DECOR_CSS, ROOM_CSS, HAT_CSS, METER_CSS }
  const seen = new Map<string, string>()
  for (const [name, css] of Object.entries(sheets)) {
    for (const f of frames(css)) {
      if (seen.has(f)) throw new Error(`@keyframes ${f} is in both ${seen.get(f)} and ${name}`)
      seen.set(f, name)
    }
  }
  const all = [...DECOR_CLASSES, ...ROOM_CLASSES, ...HAT_CLASSES]
  expect(new Set(all).size).toBe(all.length)
  for (const c of ROOM_CLASSES) expect(new RegExp(`\\.${c}\\{`).test(ROOM_CSS)).toBe(true)
  // the scene's own sheet keeps one definition per keyframes name
  const svg = sceneSvg({ ...base, hour: 22, level: 100, celebrate: 'legend', decor: maxedDecor(3), hat: 'phoenix' })
  const names = frames(/<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '')
  expect(new Set(names).size).toBe(names.length)
})

test('Paper Plane Mobile: each plane has a grey nose, tail and underside that read on a light pane', async () => {
  const lum = (hex: string): number => {
    const v = parseInt(hex.slice(1), 16)
    const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(x => {
      const s = x / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
  }
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  const svg = ceilingSvg('planes', false)
  const planes = [...svg.matchAll(/<g class="ppm"[^>]*>(.*?)<\/g>/g)].map(m => m[1]!)
  expect(planes).toHaveLength(3)
  for (const plane of planes) {
    const fills = [...plane.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map(m => m[1]!)
    expect(fills.some(f => ratio(f, '#FAF9F5') >= 2.5)).toBe(true)
    expect(fills.some(f => ratio(f, '#262624') >= 2.5)).toBe(true)
  }
})
