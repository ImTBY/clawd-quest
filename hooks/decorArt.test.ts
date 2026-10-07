import { expect, test } from 'claude-code/testing'

import type { DayPhase, DecorSlot } from '../types'
import { DECOR } from './decor'
import {
  COMPANION_BOXES, companionSvg, DECOR_CLASSES, DECOR_CSS, drinkSvg, plantSvg, posterSvg, rugSvg, shelfSvg, viewSvg, wallSvg,
} from './decorArt'
import { METER_BOXES } from './meterArt'

type Box = readonly [number, number, number, number]

const PHASES: readonly DayPhase[] = ['night', 'morning', 'day', 'sunset']
const MONTHS = [1, 6, 10, 12]

// The slots decorArt draws, with the room box each piece must stay inside (x0, y0, x1, y1).
const SLOT_BOX: Partial<Record<DecorSlot, Box>> = {
  drink: [355, 166, 372, 196], // table 2.2 says 354, but the papers meter ends at x 355
  plant: [76, 145, 112, 232],
  poster: [262, 20, 294, 64], // the frame 264..292 x 26..64 plus the gold-frame sparkle above its corner
  rug: [98, 233, 248, 241],
  shelf: [10, 75, 40, 110],
  wall: [18, 18, 98, 70],
  view: [152, 20, 248, 96],
}
// Drawn by scene.ts itself (decorArt returns '' and the scene falls back).
const SCENE_DRAWN = new Set(['poster:space', 'rug:stripes', 'shelf:lava'])
const ART_SLOTS = Object.keys(SLOT_BOX).concat('companion') as DecorSlot[]

function variants(slot: DecorSlot, id: string): Array<[string, string]> {
  switch (slot) {
    case 'drink': return [0, 1, 2, 3].map((f) => [`fill ${f}`, drinkSvg(id, f)])
    case 'plant': return [0, 1, 2, 3, 4].map((s) => [`stage ${s}`, plantSvg(id, s)])
    case 'poster': return [false, true].map((gold) => [gold ? 'gold' : 'wood', posterSvg(id, gold)])
    case 'rug': return [['', rugSvg(id)]]
    case 'shelf': return [['', shelfSvg(id)]]
    case 'companion': return [false, true].map((sl) => [sl ? 'sleeping' : 'awake', companionSvg(id, sl)])
    case 'wall': return [['', wallSvg(id)]]
    case 'view': return PHASES.flatMap((ph) => MONTHS.map((m): [string, string] => [`${ph} m${m}`, viewSvg(id, ph, m)]))
    default: return []
  }
}

const drawn = DECOR.filter((d) => ART_SLOTS.includes(d.slot) && d.kind !== 'default' && !SCENE_DRAWN.has(`${d.slot}:${d.id}`))

function boxOf(slot: DecorSlot, id: string): Box {
  return slot === 'companion' ? COMPANION_BOXES[id]! : SLOT_BOX[slot]!
}

// Every drawn shape as a bounding box.
function shapes(svg: string): Array<{ tag: string; x0: number; y0: number; x1: number; y1: number }> {
  const out: Array<{ tag: string; x0: number; y0: number; x1: number; y1: number }> = []
  const num = (tag: string, a: string): number => Number(new RegExp(`\\s${a}="(-?[\\d.]+)"`).exec(tag)?.[1] ?? NaN)
  for (const m of svg.matchAll(/<(rect|ellipse|polygon)\b[^>]*>/g)) {
    const t = m[0]
    if (m[1] === 'rect') {
      const [x, y, w, h] = [num(t, 'x'), num(t, 'y'), num(t, 'width'), num(t, 'height')]
      out.push({ tag: t, x0: x, y0: y, x1: x + w, y1: y + h })
    } else if (m[1] === 'ellipse') {
      const [cx, cy, rx, ry] = [num(t, 'cx'), num(t, 'cy'), num(t, 'rx'), num(t, 'ry')]
      out.push({ tag: t, x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry })
    } else {
      const pts = (/points="([^"]+)"/.exec(t)?.[1] ?? '').trim().split(/[\s,]+/).map(Number)
      const xs = pts.filter((_, i) => i % 2 === 0)
      const ys = pts.filter((_, i) => i % 2 === 1)
      out.push({ tag: t, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) })
    }
  }
  return out
}

// scene.ts mergeRects, condensed: runs of plain rects become one <path> per paint.
const PLAIN_RECT = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" (fill="#[0-9A-Fa-f]{3,8}"(?: opacity="[\d.]+")?)\/>/g
type MBox = { x: number; y: number; w: number; h: number; paint: string }
const hit = (a: MBox, b: MBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const r2 = (v: number): string => String(Math.round(v * 100) / 100)
function flush(run: readonly MBox[]): string {
  const groups: Array<{ paint: string; boxes: MBox[]; d: string }> = []
  for (const r of run) {
    let g = -1
    for (let i = groups.length - 1; i >= 0; i--) if (groups[i]!.paint === r.paint) { g = i; break }
    const from = g >= 0 && r.paint.includes('opacity') ? g : g + 1
    for (let i = from; g >= 0 && i < groups.length; i++) if (groups[i]!.boxes.some((b) => hit(r, b))) g = -1
    const d = `M${r2(r.x)} ${r2(r.y)}h${r2(r.w)}v${r2(r.h)}h${r2(-r.w)}z`
    if (g >= 0) { groups[g]!.boxes.push(r); groups[g]!.d += d } else groups.push({ paint: r.paint, boxes: [r], d })
  }
  return groups.map((g) => `<path ${g.paint} d="${g.d}"/>`).join('')
}
function merged(svg: string): string {
  let out = ''
  let last = 0
  let run: MBox[] = []
  for (const m of svg.matchAll(PLAIN_RECT)) {
    const start = m.index ?? 0
    if (start !== last) { out += flush(run) + svg.slice(last, start); run = [] }
    run.push({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), paint: m[5]! })
    last = start + m[0].length
  }
  return out + flush(run) + svg.slice(last)
}

function luminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16)
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const contrast = (a: string, b: string): number => {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ---------- every piece ----------

test('every new piece of the decorArt slots draws something', async () => {
  expect(drawn.length).toBe(68)
  for (const d of drawn) {
    for (const [label, svg] of variants(d.slot, d.id)) {
      if (svg.length === 0) throw new Error(`${d.slot}:${d.id} (${label}) draws nothing`)
      expect(/NaN|undefined|Infinity/.test(svg)).toBe(false)
      expect(/\son[a-z]+=/.test(svg)).toBe(false)
      // only rects, ellipses, polygons and groups, all closed
      for (const m of svg.matchAll(/<\/?([a-z]+)/g)) {
        if (!['rect', 'ellipse', 'polygon', 'g'].includes(m[1]!)) throw new Error(`${d.slot}:${d.id} uses <${m[1]}>`)
      }
      expect((svg.match(/<g[\s>]/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length)
    }
  }
})

test('every piece stays inside its slot box or companion box', async () => {
  for (const d of drawn) {
    const [bx0, by0, bx1, by1] = boxOf(d.slot, d.id)
    for (const [label, svg] of variants(d.slot, d.id)) {
      for (const s of shapes(svg)) {
        const inside = s.x0 >= bx0 - 1e-6 && s.y0 >= by0 - 1e-6 && s.x1 <= bx1 + 1e-6 && s.y1 <= by1 + 1e-6
        if (!inside) throw new Error(`${d.slot}:${d.id} (${label}) leaves [${bx0},${by0},${bx1},${by1}]: ${s.tag}`)
      }
    }
  }
})

test('shelf pieces stay inside x 10..40, clear of the seasonal pumpkin and tree', async () => {
  for (const d of DECOR.filter((x) => x.slot === 'shelf')) {
    for (const s of shapes(shelfSvg(d.id))) expect(s.x0 >= 10 && s.x1 <= 40 && s.x1 <= 54).toBe(true)
  }
})

test('every piece stays within 1.5K characters after merging', async () => {
  for (const d of drawn) {
    for (const [label, svg] of variants(d.slot, d.id)) {
      const size = merged(svg).length
      if (size > 1500) throw new Error(`${d.slot}:${d.id} (${label}) is ${size} characters`)
    }
  }
})

test('every piece reads on light and dark panes', async () => {
  // views are drawn over the sky inside the window frame, never on the pane itself
  for (const d of drawn.filter((x) => x.slot !== 'view')) {
    for (const [label, svg] of variants(d.slot, d.id)) {
      const fills = [...new Set([...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]!))]
      const ok = fills.some((f) => contrast(f, '#262624') >= 2 && contrast(f, '#FAF9F5') >= 2)
      if (!ok) throw new Error(`${d.slot}:${d.id} (${label}) has no colour with 2:1 on both panes: ${fills.join(' ')}`)
    }
  }
})

test('dark pieces got their contrast fixes (B56)', async () => {
  const energy = drinkSvg('energy', 2)
  expect(energy.includes('fill="#3A3A42"')).toBe(true)
  expect(energy.includes('fill="#6A6A72"')).toBe(true)
  expect(energy.includes('#2A2A2E')).toBe(false)
  const boombox = shelfSvg('boombox')
  expect(boombox.includes('<rect x="10" y="94" width="28" height="1" fill="#6A6A64"/>')).toBe(true)
  expect(boombox.includes('<rect x="10" y="94" width="1" height="16" fill="#6A6A64"/>')).toBe(true)
  expect(companionSvg('roomba', false).includes('fill="#6A6A64"')).toBe(true)
})

test('unknown ids and the scene-drawn defaults return an empty string', async () => {
  for (const id of ['', 'triffid', 'none', '__proto__', 'constructor']) {
    expect(drinkSvg(id, 2)).toBe('')
    expect(plantSvg(id, 2)).toBe('')
    expect(posterSvg(id, true)).toBe('')
    expect(rugSvg(id)).toBe('')
    expect(shelfSvg(id)).toBe('')
    expect(companionSvg(id, false)).toBe('')
    expect(wallSvg(id)).toBe('')
    expect(viewSvg(id, 'night', 12)).toBe('')
  }
  expect(drinkSvg('coffee', 2)).toBe('')
  expect(plantSvg('fern', 2)).toBe('')
  expect(posterSvg('space', true)).toBe('')
  expect(rugSvg('stripes')).toBe('')
  expect(shelfSvg('lava')).toBe('')
})

test('odd inputs are clamped, not crashed on', async () => {
  for (const f of [-1, 9, 1.5, Number.NaN]) {
    const svg = drinkSvg('cocoa', f)
    expect(svg.length > 0 && !/NaN/.test(svg)).toBe(true)
  }
  for (const s of [-3, 12, Number.NaN]) {
    const svg = plantSvg('sakura', s)
    expect(svg.length > 0 && !/NaN/.test(svg)).toBe(true)
  }
  expect(viewSvg('pines', 'noon' as DayPhase, 6)).toBe(viewSvg('pines', 'day', 6))
})

// ---------- animation classes ----------

const SCENE_CLASSES = new Set(['stm', 'lt0', 'lt1', 'lt2', 'st', 't0', 't1', 't2', 't3', 'bl', 'mt', 'skw', 'lfg', 'led'])
const CSS_CLASSES = new Set([...DECOR_CSS.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]!))

test('pieces only use scene classes or classes DECOR_CSS defines, never .s2 or .sk', async () => {
  for (const d of drawn) {
    for (const [label, svg] of variants(d.slot, d.id)) {
      for (const m of svg.matchAll(/class="([^"]+)"/g)) {
        for (const c of m[1]!.split(/\s+/)) {
          if (c === 's2' || c === 'sk') throw new Error(`${d.slot}:${d.id} (${label}) uses .${c}`)
          if (!SCENE_CLASSES.has(c) && !CSS_CLASSES.has(c)) throw new Error(`${d.slot}:${d.id} (${label}) uses undefined class ${c}`)
        }
      }
    }
  }
  // the old .s2 helpers became inline delays (B61)
  expect(shelfSvg('boombox').includes('style="animation-delay:')).toBe(true)
  expect(drinkSvg('energy', 2).includes('style="animation-delay:')).toBe(true)
  expect(drinkSvg('tea', 2).includes('style="animation-delay:')).toBe(true)
  // the gold poster sparkle is wall-time (B65)
  expect(posterSvg('wave', true).includes('class="skw"')).toBe(true)
  expect(posterSvg('wave', false).includes('skw')).toBe(false)
})

test('DECOR_CLASSES lists exactly the animated classes of DECOR_CSS', async () => {
  const animated = new Set<string>()
  for (const m of DECOR_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/animation/.test(m[2]!) || !m[1]!.includes('.')) continue // keyframe steps have no class
    for (const part of m[1]!.split(',')) {
      const cs = [...part.matchAll(/\.([\w-]+)/g)].map((x) => x[1]!)
      if (cs.length > 0) animated.add(cs[cs.length - 1]!)
    }
  }
  expect([...animated].sort()).toEqual([...DECOR_CLASSES].sort())
  expect(new Set(DECOR_CLASSES).size).toBe(DECOR_CLASSES.length)
  for (const c of DECOR_CLASSES) {
    expect(new RegExp(`@keyframes ${c}\\{`).test(DECOR_CSS)).toBe(true)
    expect(SCENE_CLASSES.has(c)).toBe(false)
  }
})

test('rotating and scaling classes turn about their own box', async () => {
  for (const c of DECOR_CLASSES) {
    const start = DECOR_CSS.indexOf(`@keyframes ${c}{`)
    let depth = 0
    let end = DECOR_CSS.indexOf('{', start)
    for (; end < DECOR_CSS.length; end++) {
      if (DECOR_CSS[end] === '{') depth++
      else if (DECOR_CSS[end] === '}' && --depth === 0) break
    }
    const frames = DECOR_CSS.slice(start, end)
    if (!/rotate|scale/.test(frames)) continue
    const rule = new RegExp(`\\.${c}\\{([^}]*)\\}`).exec(DECOR_CSS)?.[1] ?? ''
    if (!rule.includes('transform-box:fill-box')) throw new Error(`.${c} rotates or scales without transform-box:fill-box`)
  }
})

test('DECOR_CSS has only flat rules and keyframes the scene can parse', async () => {
  expect(DECOR_CSS.includes('.s2')).toBe(false)
  // the reduced-motion block lives in scene.ts; decor CSS has no media queries or pseudo selectors
  expect(/@media|::?[a-z]/.test(DECOR_CSS.replace(/\{[^{}]*\}/g, '{}').replace(/@keyframes [\w-]+/g, ''))).toBe(false)
})

// ---------- companions ----------

const intersects = (a: Box, b: Box): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

// Clawd's own spots (room units): the pet bed, the stool at the desk, the reading corner and the happy spot.
const CLAWD_SPOTS: Record<string, Box> = {
  sleeping: [112, 216, 184, 232],
  desk: [208, 182, 280, 212],
  reading: [10, 202, 82, 232],
  happy: [150, 176, 222, 232],
}

test('every roommate has a box, and the new ones sit where table 2.2 puts them', async () => {
  for (const d of DECOR.filter((x) => x.slot === 'companion' && x.id !== 'none')) expect(COMPANION_BOXES[d.id] !== undefined).toBe(true)
  expect(COMPANION_BOXES.corgi).toEqual([318, 218, 346, 232])
  expect(COMPANION_BOXES.clawdlet).toEqual([244, 222, 330, 232])
  expect(COMPANION_BOXES.rover).toEqual([244, 218, 330, 232])
  expect(COMPANION_BOXES.axolotl).toEqual([212, 82, 232, 100])
  expect(COMPANION_BOXES.snail).toEqual([234, 62, 248, 80])
  for (const id of ['dragon', 'drone', 'ghost']) expect(COMPANION_BOXES[id]).toEqual([100, 70, 134, 96])
  expect(COMPANION_BOXES.cat).toEqual([318, 220, 346, 232])
  expect(COMPANION_BOXES.roomba).toEqual([244, 225, 330, 232])
  expect(COMPANION_BOXES.fishbowl).toEqual([212, 82, 232, 100])
})

test('roommate boxes stay clear of the meters and of Clawd\'s bed, desk, reading and happy spots', async () => {
  for (const [id, box] of Object.entries(COMPANION_BOXES)) {
    for (const [name, meter] of Object.entries(METER_BOXES)) {
      if (intersects(box, meter)) throw new Error(`${id} ${JSON.stringify(box)} overlaps meter ${name} ${JSON.stringify(meter)}`)
    }
    for (const [name, spot] of Object.entries(CLAWD_SPOTS)) {
      if (intersects(box, spot)) throw new Error(`${id} ${JSON.stringify(box)} overlaps Clawd ${name} ${JSON.stringify(spot)}`)
    }
  }
})

test('the moving roommates stay in their box along their whole path', async () => {
  // translateX ranges from DECOR_CSS: clawdlet 0..70, rover 0..60, roomba 0..64; the snail climbs 12 px
  const travel: Record<string, [number, number]> = { clawdlet: [70, 0], rover: [60, 0], roomba: [64, 0], snail: [0, -12] }
  for (const [id, [dx, dy]] of Object.entries(travel)) {
    const [bx0, by0, bx1, by1] = COMPANION_BOXES[id]!
    const moving = /<g class="(cdl|rvr|rmb|snl)">([\s\S]*)<\/g>/.exec(companionSvg(id, false))?.[2] ?? ''
    expect(moving.length > 0).toBe(true)
    for (const s of shapes(moving)) {
      const ok = s.x0 + Math.min(0, dx) >= bx0 && s.x1 + Math.max(0, dx) <= bx1 && s.y0 + Math.min(0, dy) >= by0 && s.y1 + Math.max(0, dy) <= by1
      if (!ok) throw new Error(`${id} leaves its box on its path: ${s.tag}`)
    }
  }
})

test('roommates show they are asleep', async () => {
  for (const id of ['corgi', 'clawdlet', 'dragon', 'ghost', 'axolotl']) expect(companionSvg(id, true)).not.toBe(companionSvg(id, false))
  expect(companionSvg('corgi', false).includes('class="crg"')).toBe(true)
  expect(DECOR_CSS.includes('.a-terraform .crg{opacity:0}')).toBe(true)
  expect(companionSvg('drone', false).includes('class="dre"')).toBe(true)
  expect(DECOR_CSS.includes('.m-error .dre{')).toBe(true)
})

// ---------- window views ----------

test('every view draws in every phase and month, deterministically', async () => {
  for (const d of DECOR.filter((x) => x.slot === 'view')) {
    for (const ph of PHASES) {
      for (const m of [1, 2, 3, 6, 9, 10, 11, 12]) {
        const svg = viewSvg(d.id, ph, m)
        expect(svg.length > 0).toBe(true)
        expect(viewSvg(d.id, ph, m)).toBe(svg)
      }
    }
  }
})

test("the city view is the original skyline", async () => {
  const sky: Record<DayPhase, string> = { night: '#161B33', morning: '#7E7FA8', day: '#7A98BC', sunset: '#4A2A4E' }
  const buildings = [[152, 14, 18], [166, 10, 26], [176, 16, 14], [192, 12, 30], [204, 18, 20], [222, 10, 24], [232, 16, 16]]
  for (const ph of PHASES) {
    const svg = viewSvg('city', ph, 6)
    for (const [x, w, h] of buildings) expect(svg.includes(`<rect x="${x}" y="${96 - h!}" width="${w}" height="${h}" fill="${sky[ph]}"/>`)).toBe(true)
    const windows = (svg.match(/#F2C66B/g) ?? []).length
    expect(ph === 'night' || ph === 'sunset' ? windows > 5 : windows === 0).toBe(true)
    expect(svg.includes('#F2F2F2')).toBe(false)
  }
  for (const m of [12, 1, 2]) expect((viewSvg('city', 'day', m).match(/fill="#F2F2F2"/g) ?? []).length).toBe(7)
  // the lit windows do not depend on the month (the snow keeps its own rand in the scene)
  expect(viewSvg('city', 'night', 12).replace(/<rect[^>]*#F2F2F2"\/>/g, '')).toBe(viewSvg('city', 'night', 6))
})

test('views follow the day phase, the season and their own rules', async () => {
  for (const id of ['city', 'pines', 'mountains', 'sea', 'neoncity']) {
    expect(new Set(PHASES.map((ph) => viewSvg(id, ph, 6))).size).toBe(4)
  }
  // always-night views do not change with the phase
  expect(new Set(PHASES.map((ph) => viewSvg('aurora', ph, 6))).size).toBe(1)
  expect(new Set(PHASES.map((ph) => viewSvg('orbit', ph, 6))).size).toBe(1)
  // the starfield covers the whole window
  expect(viewSvg('orbit', 'day', 6).startsWith('<rect x="152" y="20" width="96" height="76"')).toBe(true)
  // snow in winter
  for (const id of ['city', 'pines', 'mountains']) expect(viewSvg(id, 'day', 1)).not.toBe(viewSvg(id, 'day', 6))
  // the cabin window glows at night
  expect(viewSvg('pines', 'night', 6).includes('#F2C66B')).toBe(true)
  expect(viewSvg('pines', 'day', 6).includes('#F2C66B')).toBe(false)
  // a flying car crosses the neon city at night only
  expect(viewSvg('neoncity', 'night', 6).includes('class="fcr"')).toBe(true)
  expect(viewSvg('neoncity', 'day', 6).includes('class="fcr"')).toBe(false)
})

// ---------- regressions: pieces that vanished or blurred ----------

const rects = (svg: string) => [...svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9A-Fa-f]{6})"/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), fill: m[5]!.toUpperCase() }))

test('Aurora Night hills read as shapes against the sky, snow down both shoulders', async () => {
  for (const month of [1, 6]) {
    const svg = viewSvg('aurora', 'night', month)
    const all = rects(svg)
    const sky = '#0F1E40'
    const bodies = all.filter((r) => r.y >= 76 && r.y < 92 && r.fill !== '#F2F4FA' && r.fill !== '#C8D2E6' && r.fill !== '#0B1222')
    expect(bodies.length).toBeGreaterThan(0)
    for (const b of bodies) expect(contrast(b.fill, sky)).toBeGreaterThanOrEqual(1.3)
    // more than one snow row per hill: the caps follow the curve
    const cap = month === 1 ? '#F2F4FA' : '#C8D2E6'
    expect(all.filter((r) => r.fill === cap && r.y >= 76 && r.y < 92).length).toBeGreaterThan(3)
  }
})

test('Vinyl Records: the discs above the sleeves show on a dark pane', async () => {
  const discs = rects(wallSvg('records')).filter((r) => r.y >= 26 && r.y < 30)
  expect(discs.length).toBeGreaterThan(0)
  for (const d of discs) expect(contrast(d.fill, '#262624')).toBeGreaterThanOrEqual(1.3)
})

test('Triple Espresso: three cups that stand apart, one full cup per coffee level', async () => {
  const PAPER = '#E8E6DC'
  for (const f of [0, 1, 2, 3]) {
    const all = rects(drinkSvg('espresso', f))
    const bodies = all.filter((r) => r.fill === PAPER && r.w === 5 && r.h === 5)
    expect(bodies).toHaveLength(3)
    // the two cups below do not touch, handles included
    const below = all.filter((r) => r.fill === PAPER && r.y >= 190).sort((a, b) => a.x - b.x)
    const left = below.filter((r) => r.x < 362)
    const right = below.filter((r) => r.x >= 364)
    expect(left.length + right.length).toBe(below.length)
    expect(Math.max(...left.map((r) => r.x + r.w))).toBeLessThan(Math.min(...right.map((r) => r.x)))
    expect(all.filter((r) => r.fill === '#6B3F27')).toHaveLength(f)
  }
})

test('Friendly Ghost has an outline over its top and under its hem; Galaxy Rug keeps its shape on a dark pane', async () => {
  const ghost = rects(companionSvg('ghost', false))
  const line = ghost.filter((r) => r.fill === '#9AA4BC')
  expect(line.some((r) => r.y <= 74)).toBe(true)
  expect(line.some((r) => r.y >= 88)).toBe(true)
  const galaxy = rects(rugSvg('galaxy'))
  const base = galaxy[0]!
  expect(contrast(base.fill, '#262624')).toBeGreaterThanOrEqual(1.3)
  // the oval's rim runs all the way round
  const rim = galaxy.filter((r) => r.fill === '#5A4BA8')
  expect(rim.some((r) => r.y === 234) && rim.some((r) => r.y === 239) && rim.some((r) => r.x === 104) && rim.some((r) => r.x === 241)).toBe(true)
})
