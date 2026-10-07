import { expect, test } from 'claude-code/testing'

import type { CustomHat, HatId } from '../types'
import { HAT_CLASSES, HAT_CSS, hatSvg, hatTop, isCatalogHat } from './hatArt'

// Every catalog hat, written as a Record so tsc fails here when a HatId is added without art.
const ALL: Record<HatId, true> = {
  party: true, beanie: true, headphones: true, sunglasses: true, tophat: true, hardhat: true, propeller: true,
  wizard: true, halo: true, crown: true, pumpkin: true, santa: true,
  cap: true, chef: true, beret: true, viking: true, cowboy: true, captain: true, pirate: true, ninja: true, laurel: true,
  kabuto: true, knight: true, jester: true, archmage: true, astronaut: true, ufo: true, dragonhorns: true, phoenix: true,
  starcrown: true, graduation: true, deerstalker: true, miner: true, nightcap: true, firefighter: true, flower: true,
  unicorn: true, divemask: true, bandana: true, tinfoil: true, teapot: true, catears: true, boppers: true, bunny: true,
}
const IDS = Object.keys(ALL) as HatId[]

// ---------- a tiny reader for the shapes a hat draws ----------

type Shape = { x: number; y: number; w: number; h: number; fill: string; opacity: number }

const attr = (attrs: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1]
const num = (attrs: string, name: string): number => Number(attr(attrs, name) ?? NaN)

function shapes(svg: string): Shape[] {
  const out: Shape[] = []
  for (const m of svg.matchAll(/<(rect|path|ellipse|polygon)\b([^>]*)\/>/g)) {
    const [, tag, a = ''] = m
    const fill = attr(a, 'fill') ?? ''
    const opacity = Number(attr(a, 'opacity') ?? 1)
    if (tag === 'rect') out.push({ x: num(a, 'x'), y: num(a, 'y'), w: num(a, 'width'), h: num(a, 'height'), fill, opacity })
    else if (tag === 'ellipse') {
      const rx = num(a, 'rx')
      const ry = num(a, 'ry')
      out.push({ x: num(a, 'cx') - rx, y: num(a, 'cy') - ry, w: 2 * rx, h: 2 * ry, fill, opacity })
    } else if (tag === 'polygon') {
      const pts = (attr(a, 'points') ?? '').trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number])
      const xs = pts.map(p => p[0])
      const ys = pts.map(p => p[1])
      out.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), fill, opacity })
    } else {
      // pmap runs: M x y h w v u h -w z
      for (const r of (attr(a, 'd') ?? '').matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h-?[\d.]+z/g)) {
        out.push({ x: Number(r[1]), y: Number(r[2]), w: Number(r[3]), h: Number(r[4]), fill, opacity })
      }
    }
  }
  return out
}

const overlaps = (s: Shape, [x0, y0, x1, y1]: readonly number[]): boolean => s.x < x1! && x0! < s.x + s.w && s.y < y1! && y0! < s.y + s.h

// scene.ts mergeRects, simplified: each run of adjacent plain rects becomes one <path> per paint.
const PLAIN = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" (fill="#[0-9A-Fa-f]{3,8}"(?: opacity="[\d.]+")?)\/>/g
function merged(svg: string): string {
  let out = ''
  let last = 0
  let run = new Map<string, string>()
  const flush = (): void => {
    for (const [paint, d] of run) out += `<path ${paint} d="${d}"/>`
    run = new Map()
  }
  for (const m of svg.matchAll(PLAIN)) {
    const start = m.index ?? 0
    if (start !== last) {
      flush()
      out += svg.slice(last, start)
    }
    const w = m[3]!
    run.set(m[5]!, (run.get(m[5]!) ?? '') + `M${m[1]} ${m[2]}h${w}v${m[4]}h-${w}z`)
    last = start + m[0].length
  }
  flush()
  return out + svg.slice(last)
}

function luminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16)
  const ch = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch((v >> 16) & 255) + 0.7152 * ch((v >> 8) & 255) + 0.0722 * ch(v & 255)
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

// Where the thought bubble's tail dots are drawn over Clawd (sprite space, after B58 moves them right).
const TAIL = [[116, -16, 122, -10], [124, -32, 134, -22]] as const

// ---------- tests ----------

test('every catalog hat renders a hat group with shapes', async () => {
  expect(IDS.length).toBe(44)
  for (const id of IDS) {
    const svg = hatSvg(id)
    expect(svg.startsWith('<g class="hat">')).toBe(true)
    expect(svg.endsWith('</g>')).toBe(true)
    expect(/<rect |<path /.test(svg)).toBe(true)
    expect(shapes(svg).length).toBeGreaterThan(0)
    // balanced groups, no script, no NaN
    expect((svg.match(/<g\b/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length)
    expect(/NaN|undefined|<script/i.test(svg)).toBe(false)
  }
  expect(hatSvg(null)).toBe('')
  expect(hatSvg('nope' as HatId)).toBe('')
})

test('rects use the exact format scene mergeRects folds', async () => {
  const RECT = /^<rect x="-?\d+(\.\d{1,2})?" y="-?\d+(\.\d{1,2})?" width="\d+(\.\d{1,2})?" height="\d+(\.\d{1,2})?" fill="#[0-9A-F]{6}"( opacity="[\d.]+")?( class="[\w -]+")?( style="[^"]*")?\/>$/
  for (const id of IDS) {
    for (const m of hatSvg(id).matchAll(/<rect [^>]*>/g)) expect(RECT.test(m[0])).toBe(true)
  }
})

test('the top stays under the spellbook and hatTop agrees with the drawing', async () => {
  for (const id of IDS) {
    const drawn = Math.min(0, ...shapes(hatSvg(id)).map(s => s.y))
    const top = hatTop(id)
    // hatTop also counts how far an animation lifts a part, never less than the drawn top
    expect(top).toBeLessThanOrEqual(drawn)
    expect(drawn - top).toBeLessThanOrEqual(10)
    // the wizard's 8 rows (-60) are the one old exception; the same height custom hats may use
    expect(top).toBeGreaterThanOrEqual(id === 'wizard' ? -60 : -52)
  }
  expect(hatTop(null)).toBe(0)
  expect(hatTop('party')).toBe(-52)
  expect(hatTop('ninja')).toBe(0)
  expect(hatTop('ufo')).toBe(-47) // the saucer hovers 3 units up
})

test('no opaque hat pixel sits where the thought bubble tail is drawn', async () => {
  for (const id of IDS) {
    // the astronaut's glass dome encloses the head, so the tail dots are drawn over its rim
    if (id === 'astronaut') continue
    for (const s of shapes(hatSvg(id))) {
      if (s.opacity < 0.5) continue
      for (const zone of TAIL) {
        if (overlaps(s, zone)) throw new Error(`${id} draws ${JSON.stringify(s)} inside the bubble tail ${zone}`)
      }
    }
  }
})

test('every hat stays within 700 characters once merged', async () => {
  for (const id of IDS) {
    const size = merged(hatSvg(id)).length
    if (size > 700) throw new Error(`${id} is ${size} characters`)
  }
})

test('every hat palette reads on a dark and a light pane', async () => {
  const DARK = '#262624'
  const LIGHT = '#FAF9F5'
  for (const id of IDS) {
    const fills = [...new Set(shapes(hatSvg(id)).filter(s => s.opacity >= 0.5).map(s => s.fill.toUpperCase()))]
    const ok = fills.some(f => contrast(f, DARK) >= 2 && contrast(f, LIGHT) >= 2)
    if (!ok) throw new Error(`${id}: no colour with 2:1 on both panes in ${fills.join(' ')}`)
    // a body darker than #5A5A60 comes with something light (#7A7A85 or lighter) to outline it
    if (fills.some(f => luminance(f) < luminance('#5A5A60'))) {
      expect(fills.some(f => luminance(f) >= luminance('#7A7A85'))).toBe(true)
    }
  }
  // the B56 fixes
  expect(hatSvg('tophat')).toContain('#50505A')
  expect(hatSvg('tophat')).toContain('#7A7A85')
  expect(hatSvg('tophat').includes('#3C3C44')).toBe(false)
  expect(hatSvg('headphones')).toContain('#55555E')
  expect(hatSvg('headphones').includes('#3F3F46')).toBe(false)
})

test('animated parts only use the h-* classes HAT_CSS defines', async () => {
  const OLD = new Set(['hat', 'prop', 'fb', 'halo', 'tw2']) // from scene SPRITE_CSS
  const used = new Set<string>()
  for (const id of IDS) {
    for (const m of hatSvg(id).matchAll(/class="([^"]*)"/g)) {
      for (const c of m[1]!.split(/\s+/)) {
        expect(OLD.has(c) || HAT_CLASSES.includes(c)).toBe(true)
        used.add(c)
      }
    }
  }
  for (const c of HAT_CLASSES) {
    expect(used.has(c)).toBe(true)
    expect(HAT_CSS).toContain(`.${c}{`)
  }
  const frames = [...HAT_CSS.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1]!)
  expect(frames.length).toBe(HAT_CLASSES.length)
  for (const k of frames) expect(k.startsWith('hk-')).toBe(true)
  for (const m of HAT_CSS.matchAll(/animation:([\w-]+)/g)) expect(frames).toContain(m[1])
})

test('isCatalogHat knows the 44 ids and nothing else', async () => {
  for (const id of IDS) expect(isCatalogHat(id)).toBe(true)
  for (const junk of ['', 'nope', 'Party', 'constructor', '__proto__', 'toString', null, undefined, 42, {}, ['party'], { id: 'party' }]) {
    expect(isCatalogHat(junk)).toBe(false)
  }
})

test('custom /quests hats draw through the same hatMap', async () => {
  const hat: CustomHat = { id: 'x', name: 'X', rows: ['..aa..', '.abba.', 'aaaaaa'], palette: { a: '#4F8BD8', b: '#F6D365' } }
  const svg = hatSvg(hat)
  expect(svg.startsWith('<g class="hat"><path')).toBe(true)
  expect(svg).toContain('fill="#4F8BD8"')
  // 6 columns centred on x=72, last row 4 units into the head
  const s = shapes(svg)
  expect(Math.min(...s.map(r => r.x))).toBe(48)
  expect(Math.max(...s.map(r => r.x + r.w))).toBe(96)
  expect(Math.max(...s.map(r => r.y + r.h))).toBe(4)
  expect(hatTop(hat)).toBe(-20)
  // the tallest and widest custom hat (8 x 16)
  const big: CustomHat = { id: 'big', name: 'Big', rows: Array.from({ length: 8 }, () => 'a'.repeat(16)), palette: { a: '#C8323C' } }
  expect(hatTop(big)).toBe(-60)
  expect(shapes(hatSvg(big)).every(r => r.x >= 8 && r.x + r.w <= 136)).toBe(true)
  // odd input stays safe
  expect(hatSvg({ id: 'e', name: 'E', rows: [], palette: {} })).toBe('<g class="hat"></g>')
  expect(hatSvg({ id: 'p', name: 'P', rows: ['zz', 'zz'], palette: { a: '#FFFFFF' } })).toBe('<g class="hat"></g>')
})

// ---------- regressions ----------

test('the Starlight Crown reads on a light pane and has no boxed aura', async () => {
  const svg = hatSvg('starcrown')
  const trim = /<path d="[^"]+" fill="none" stroke="(#[0-9A-F]{6})" stroke-width="2"\/>/.exec(svg)?.[1]
  expect(trim !== undefined).toBe(true)
  expect(contrast(trim!, '#FAF9F5')).toBeGreaterThanOrEqual(2)
  expect(contrast(trim!, '#262624')).toBeGreaterThanOrEqual(2)
  // the band is gold too
  expect(shapes(svg).some(s => s.y === -4 && s.w === 104 && s.fill === trim)).toBe(true)
  // no faint full-width box behind it
  expect(shapes(svg).some(s => s.opacity < 0.5 && s.w >= 96)).toBe(false)
})

test('the Nightcap has its drooping tip with a pom and a solid brim', async () => {
  const s = shapes(hatSvg('nightcap'))
  const cream = s.filter(r => r.fill === '#F2EFE6')
  // the brim: one run of 12 columns on the bottom row
  expect(cream.some(r => r.y === -4 && r.w === 96)).toBe(true)
  // the pom hangs at the left, clear of the bubble tail on the right
  expect(cream.some(r => r.x === 20 && r.y < -4)).toBe(true)
  // the stars palette entry it never used is gone
  expect(hatSvg('nightcap').includes('#F6D365')).toBe(false)
})

test('Cat Ears read on a dark pane: a lighter grey with a light edge on both sides of each ear', async () => {
  const s = shapes(hatSvg('catears'))
  const body = s.filter(r => r.fill === '#5A5A64')
  expect(body.length).toBeGreaterThan(0)
  expect(contrast('#5A5A64', '#262624')).toBeGreaterThanOrEqual(2)
  const edges = s.filter(r => r.fill === '#7A7A85' && (r.w === 2 || r.h === 2))
  // left ear: outer (x 28) and inner (x 50) edges; right ear: inner (x 92) and outer (x 114) edges
  for (const x of [28, 50, 92, 114]) expect(edges.some(r => r.x === x)).toBe(true)
  // the right ear's outer edge hugs the ear: no part floats beside an empty cell (row 1, x 108..116)
  expect(edges.some(r => r.x === 114 && r.y < -12)).toBe(false)
})
