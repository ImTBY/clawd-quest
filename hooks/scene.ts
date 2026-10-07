import type { Activity, AnyHat, Celebration, DayPhase, DecorChoice, DecorSlot, Mood, SceneInput, Station } from '../types'
import { sanitizeHat } from './customHat'
import { autoDecor, DECOR } from './decor'
import {
  COMPANION_BOXES, companionSvg, DECOR_CLASSES, DECOR_CSS, drinkSvg, plantSvg, posterSvg, rugSvg, shelfSvg, viewSvg, wallSvg,
} from './decorArt'
import { HAT_CLASSES, HAT_CSS, hatSvg, isCatalogHat } from './hatArt'
import { METER_CLASSES, METER_CSS, meterSvg, type NormUsage } from './meterArt'
import { bedLipSvg, bedSvg, ceilingSvg, clockSvg, lampSvg, ROOM_CLASSES, ROOM_CSS } from './roomArt'

// The room Clawd lives in: one SVG string, animated with CSS keyframes only (no script),
// transparent background so it sits on the pane in both themes.
//
// Coordinate system: viewBox 0 0 400 260, floor line at y=232.
// Layout, left to right: bookshelf (8..76), plant (82..106), pet bed (110..186),
// crane (176..226, terraform only), stool (228..256), desk (252..400).
// Wall: ceiling (88..304, 0..18), wall hanging (18..98, 18..70), clock (118,44), window (146..254, 14..102),
// poster (264..292), trophy shelves (296..396).
// Usage meters (meterArt.ts): hourglass on the sill (155..169), calendar (361..395, 103..141),
// papers on the desk (339..355), archive box under the desk (347..361, 222..232).

const ORANGE = '#D97757'
const RED = '#C8553D'
const INK = '#1F1E1D'
const WOOD = '#6B4A35'
const WOOD_D = '#4E3526'
const WOOD_L = '#8A6248'
const FLOOR = '#3A3936'
const METAL = '#5A5A55'
const METAL_D = '#45453F'
const SCREEN = '#141413'
const PAPER = '#E8E6DC'
const DIM = '#8A8A82'
const GOLD = '#E2B84A'
const GOLD_D = '#C99A2E'
const GOLD_L = '#F6D88A'
const SILVER = '#C3C8CE'
const BRONZE = '#C08552'
const GREEN = '#8FB07A'
const BLUE = '#7B9BC9'
const PURPLE = '#8C6BC8'
const PINK = '#E5677E'
const TERM = '#7FD98F'

const W = 400
const H = 260
const FLOOR_Y = 232
export const SCENE_RATIO = H / W

const MOODS: readonly Mood[] = ['idle', 'thinking', 'coding', 'reading', 'running', 'working', 'done', 'error', 'sleeping', 'happy']
const CELEBRATIONS: readonly Celebration[] = ['milestone', 'legend', 'star']
const ACTIVITIES: readonly Activity[] = ['none', 'edit', 'write', 'read', 'search', 'web', 'shell', 'git', 'terraform', 'test', 'agent', 'skill']

// ---------- tiny drawing helpers ----------

const n = (v: number): string => String(Math.round(v * 100) / 100)

function R(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`
}

const cls = (c: string): string => ` class="${c}"`
const op = (o: number): string => ` opacity="${o}"`
const delay = (s: number): string => ` style="animation-delay:${n(s)}s"`

// Character map -> horizontal runs, merged into one <path> per fill. '.' (or any char missing in pal)
// is empty. Runs inside one map never overlap, so grouping them by fill keeps the picture identical.
function pmap(rows: readonly string[], x0: number, y0: number, u: number, pal: Record<string, string>, uy = u): string {
  const paths = new Map<string, string>()
  rows.forEach((row, j) => {
    let i = 0
    while (i < row.length) {
      const ch = row[i]!
      let k = i
      while (k < row.length && row[k] === ch) k++
      const fill = pal[ch]
      if (fill) {
        const w = (k - i) * u
        paths.set(fill, (paths.get(fill) ?? '') + `M${n(x0 + i * u)} ${n(y0 + j * uy)}h${n(w)}v${n(uy)}h${n(-w)}z`)
      }
      i = k
    }
  })
  let out = ''
  for (const [fill, d] of paths) out += `<path fill="${fill}" d="${d}"/>`
  return out
}

// Rewrites every run of adjacent plain rects (no class or style; an opacity is allowed) into one
// <path> per paint. A rect only joins an earlier path of the same paint when nothing painted in
// between overlaps it (and, for a translucent paint, when it does not overlap that path either, as
// a path blends its overlaps once), so stacking and blending stay exactly as they were.
const PLAIN_RECT = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" (fill="#[0-9A-Fa-f]{3,8}"(?: opacity="[\d.]+")?)\/>/g

type Box = { x: number; y: number; w: number; h: number; paint: string }

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function flushRun(run: readonly Box[]): string {
  const groups: Array<{ paint: string; boxes: Box[]; d: string }> = []
  for (const r of run) {
    let g = -1
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i]!.paint === r.paint) { g = i; break }
    }
    const from = g >= 0 && r.paint.includes('opacity') ? g : g + 1
    for (let i = from; g >= 0 && i < groups.length; i++) {
      if (groups[i]!.boxes.some((b) => overlaps(r, b))) g = -1
    }
    const d = `M${n(r.x)} ${n(r.y)}h${n(r.w)}v${n(r.h)}h${n(-r.w)}z`
    if (g >= 0) {
      groups[g]!.boxes.push(r)
      groups[g]!.d += d
    } else {
      groups.push({ paint: r.paint, boxes: [r], d })
    }
  }
  return groups.map((g) => `<path ${g.paint} d="${g.d}"/>`).join('')
}

export function mergeRects(svg: string): string {
  let out = ''
  let last = 0
  let run: Box[] = []
  for (const m of svg.matchAll(PLAIN_RECT)) {
    const start = m.index ?? 0
    if (start !== last) {
      out += flushRun(run) + svg.slice(last, start)
      run = []
    }
    run.push({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), paint: m[5]! })
    last = start + m[0].length
  }
  return out + flushRun(run) + svg.slice(last)
}

// 3x5 pixel glyphs (rows of '1'/'0').
const GLYPH: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001010010',
  '8': '111101111101111', '9': '111101111001111', 'x': '000101010101000', '>': '100010001010100', '+': '000010111010000',
}

function glyphs(text: string, x: number, y: number, u: number, fill: string): string {
  let out = ''
  let cx = x
  for (const ch of text) {
    const g = GLYPH[ch]
    if (g) {
      const rows = [0, 1, 2, 3, 4].map((r) => g.slice(r * 3, r * 3 + 3).replace(/0/g, '.'))
      out += pmap(rows, cx, y, u, { '1': fill })
    }
    cx += u * 4
  }
  return out
}

function rand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function hash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number): number => {
    const x = (pa >> shift) & 255
    const y = (pb >> shift) & 255
    return Math.round(x + (y - x) * t)
  }
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)
}

function shade(c: string, f: number): string {
  return f < 0 ? lerpColor(c, '#000000', -f) : lerpColor(c, '#FFFFFF', f)
}

// ---------- Clawd (terminal-logo layout, 144x60 box: cols 1..16, rows 0..4, PW=8 PH=12) ----------

const PW = 8
const PH = 12

function P(col: number, row: number, w: number, h: number, fill: string, c = ''): string {
  return R(col * PW, row * PH, w * PW, h * PH, fill, c ? cls(c) : '')
}

function eyes(mood: Mood): string {
  if (mood === 'error') {
    const x = (col: number): string => {
      const x0 = col * PW
      return `<path d="M${x0} ${PH + 2}l${PW} ${PH - 4}M${x0 + PW} ${PH + 2}l${-PW} ${PH - 4}" stroke="${INK}" stroke-width="2.5" fill="none"/>`
    }
    return x(5) + x(12)
  }
  if (mood === 'done' || mood === 'happy') {
    const arc = (col: number): string => `<path d="M${col * PW - 1} ${PH * 1.75}l${PW / 2 + 1} ${-PH * 0.5}l${PW / 2 + 1} ${PH * 0.5}" stroke="${INK}" stroke-width="3" fill="none"/>`
    return arc(5) + arc(12)
  }
  if (mood === 'sleeping') return R(37, 18, 14, 3, INK) + R(93, 18, 14, 3, INK)
  return `<g class="ey fb">${P(5, 1, 1, 1, INK)}${P(12, 1, 1, 1, INK)}</g>`
}

// Hats (hatArt.ts) are drawn in the same unscaled sprite space, centred on x=72, sitting on the head (y=0).
function clawd(mood: Mood, hat: AnyHat, tint?: string): string {
  const c = tint ?? (mood === 'error' ? RED : ORANGE)
  return `<g class="crab fbB">` +
    P(3, 0, 12, 4, c) +
    P(1, 2, 2, 1, c, 'aL fbR') + P(15, 2, 2, 1, c, 'aR fbL') +
    P(4, 4, 1, 1, c, 'lg l0 fbT') + P(6, 4, 1, 1, c, 'lg l1 fbT') + P(11, 4, 1, 1, c, 'lg l2 fbT') + P(13, 4, 1, 1, c, 'lg l3 fbT') +
    (tint ? `<g class="ey fb">${P(5, 1, 1, 1, INK)}${P(12, 1, 1, 1, INK)}</g>` : eyes(mood)) +
    (mood === 'happy' && !tint ? R(26, 26, 10, 4, '#F2A0A0') + R(108, 26, 10, 4, '#F2A0A0') : '') +
    (tint ? '' : hatSvg(hat)) +
    `</g>`
}

// ---------- shared CSS (sprite + hats), identical in every SVG this file emits ----------
// .sk twinkles on scene time (Clawd's aura, screens); room sparkles use .skw on wall time (B65).

const SPRITE_CSS = `
:root,svg{background:transparent;color-scheme:light dark}
.fb{transform-box:fill-box;transform-origin:center}
.fbB{transform-box:fill-box;transform-origin:50% 100%}
.fbT{transform-box:fill-box;transform-origin:50% 0}
.fbL{transform-box:fill-box;transform-origin:0 50%}
.fbR{transform-box:fill-box;transform-origin:100% 50%}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}
@keyframes sway{0%,100%{transform:rotate(0)}50%{transform:rotate(-12deg)}}
@keyframes swayR{0%,100%{transform:rotate(0)}50%{transform:rotate(12deg)}}
@keyframes tap{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
@keyframes chin{0%,100%{transform:translateY(-10px) rotate(-30deg)}50%{transform:translateY(-12px) rotate(-36deg)}}
@keyframes lookUp{0%,100%{transform:translate(-2px,-3px)}50%{transform:translate(2px,-3px)}}
@keyframes look{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}
@keyframes step{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes jump{0%,100%{transform:translateY(0)}35%{transform:translateY(-26px)}70%{transform:translateY(0) scaleY(.88)}}
@keyframes hop{0%,100%{transform:translateY(0) scaleY(1)}12%{transform:translateY(0) scaleY(.88)}40%{transform:translateY(-14px) scaleY(1.05)}70%{transform:translateY(0) scaleY(1)}}
@keyframes cheerL{0%,100%{transform:translateY(-12px) rotate(30deg)}50%{transform:translateY(-14px) rotate(45deg)}}
@keyframes cheerR{0%,100%{transform:translateY(-12px) rotate(-30deg)}50%{transform:translateY(-14px) rotate(-45deg)}}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
@keyframes breathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.92)}}
@keyframes dot{0%,100%{opacity:.15}50%{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes prop{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.1)}}
@keyframes halo{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes rise{0%{transform:translate(0,0);opacity:0}15%{opacity:1}100%{transform:translate(6px,-30px);opacity:0}}
@keyframes zz{0%{transform:translate(0,0);opacity:0}20%{opacity:1}100%{transform:translate(14px,-26px);opacity:0}}
@keyframes puff{0%{transform:translateY(0);opacity:.7}100%{transform:translateY(-14px);opacity:0}}
@keyframes flick{0%,100%{transform:scale(1,1)}25%{transform:scale(.9,1.12)}50%{transform:scale(1.06,.94)}75%{transform:scale(.95,1.08)}}
@keyframes tw{0%,100%{opacity:.15}50%{opacity:1}}
@keyframes slide{from{transform:translateX(4px);opacity:1}to{transform:translateX(-6px);opacity:0}}
.prop{animation:prop .28s linear infinite}
.halo{animation:halo 2.4s ease-in-out infinite}
.tw2{animation:tw 1.8s ease-in-out infinite}
.d0{animation:dot 1.2s infinite}.d1{animation:dot 1.2s .2s infinite}.d2{animation:dot 1.2s .4s infinite}
.gear{animation:spin 2s linear infinite}
.ht{animation:rise 2.4s ease-out infinite both}
.zz{animation:zz 3s ease-out infinite both}
.pf{animation:puff 1.4s ease-out infinite}
.fl{animation:flick .5s ease-in-out infinite}
.sk{animation:tw 1.4s ease-in-out infinite}
` + HAT_CSS

// ---------- sky / window ----------

type Phase = DayPhase

function phaseOf(hour: number): Phase {
  if (hour < 5 || hour >= 21) return 'night'
  if (hour < 9) return 'morning'
  if (hour < 17) return 'day'
  return 'sunset'
}

const SKY: Record<Phase, readonly string[]> = {
  night: ['#0E1430', '#1A2348', '#27315A'],
  morning: ['#6E8FCB', '#B7B4D8', '#F2B99A'],
  day: ['#4F86D4', '#79A8E2', '#A9CFF0'],
  sunset: ['#3B2E6E', '#B4507A', '#F39A4A'],
}

const SKYLINE: Record<Phase, string> = { night: '#161B33', morning: '#7E7FA8', day: '#7A98BC', sunset: '#4A2A4E' }

function cloud(x: number, y: number, fill: string, o: number, c: string): string {
  return `<g class="${c}"${op(o)}>${R(x, y, 26, 6, fill)}${R(x + 5, y - 4, 13, 4, fill)}${R(x - 4, y + 6, 34, 4, fill)}</g>`
}

// Level 75: two shooting stars cross the night window now and then.
function shootingStars(): string {
  const star = (x: number, y: number, d: number): string =>
    `<g class="shs"${d ? delay(d) : ''}>${R(x, y, 2, 1, '#FFFFFF')}${R(x + 2, y - 1, 3, 1, PAPER, op(0.7))}${R(x + 5, y - 2, 3, 1, '#BFD0FF', op(0.4))}</g>`
  return star(214, 30, 0) + star(188, 40, -4.5)
}

// Level 40: a flower box hung under the sill (150..250 x 107..116).
function flowerBox(): string {
  const colors = [PINK, '#F2EFE6', '#B57BA6', '#F6B53A', '#F2A7C3', BLUE]
  let out = ''
  colors.forEach((c, i) => {
    const x = 160 + i * 16
    out += R(x - 2, 110, 2, 1, '#6E9B5E') + R(x + 1, 110, 2, 1, '#5C8A4E') + R(x, 110, 1, 1, '#6E9B5E') +
      R(x - 1, 108, 3, 1, c) + R(x, 107, 1, 3, c) + R(x, 108, 1, 1, c === '#F6B53A' ? '#C86A1E' : '#F6D365')
  })
  return out + R(150, 111, 100, 1, WOOD_L) + R(152, 112, 96, 4, WOOD) + R(152, 115, 96, 1, WOOD_D) + R(152, 112, 1, 4, WOOD_L)
}

function windowSvg(id: string, s: S): string {
  const { hour, month, level } = s
  const ph = phaseOf(hour)
  const stops = SKY[ph]
  let sky = ''
  for (let i = 0; i < 19; i++) {
    const t = i / 18
    const col = t < 0.5 ? lerpColor(stops[0]!, stops[1]!, t * 2) : lerpColor(stops[1]!, stops[2]!, (t - 0.5) * 2)
    sky += R(152, 20 + i * 4, 96, 4, col)
  }
  const r = rand(5)
  if (ph === 'night') {
    for (let i = 0; i < 16; i++) {
      const sz = r() < 0.25 ? 2 : 1.5
      sky += R(154 + Math.round(r() * 90), 22 + Math.round(r() * 44), sz, sz, '#E8E6DC', cls(`st t${i % 4}`))
    }
    sky += R(222, 26, 12, 16, PAPER) + R(218, 30, 20, 8, PAPER) + R(220, 28, 16, 12, PAPER) +
      R(224, 30, 3, 3, '#BDBAAE') + R(229, 35, 3, 3, '#BDBAAE')
  } else if (ph === 'day') {
    sky += `<g class="sun fb">${R(220, 28, 12, 12, '#FFD95A')}${R(218, 30, 16, 8, '#FFD95A')}${R(222, 26, 8, 16, '#FFD95A')}</g>` +
      `<g fill="#FFE98F" class="ry">${R(225, 21, 2, 3, '#FFE98F')}${R(225, 44, 2, 3, '#FFE98F')}${R(213, 33, 3, 2, '#FFE98F')}${R(236, 33, 3, 2, '#FFE98F')}</g>` +
      cloud(160, 34, '#FFFFFF', 0.85, 'cl1') + cloud(190, 52, '#FFFFFF', 0.7, 'cl2')
  } else if (ph === 'morning') {
    sky += `<ellipse cx="176" cy="76" rx="16" ry="12" fill="#FFE3A3" opacity=".35" shape-rendering="auto"/>` +
      R(170, 70, 12, 14, '#FFE3A3') + R(168, 72, 16, 10, '#FFE3A3') +
      cloud(172, 40, '#FCE2D6', 0.75, 'cl1') + cloud(206, 30, '#FCE2D6', 0.55, 'cl2')
  } else {
    sky += `<ellipse cx="180" cy="86" rx="20" ry="14" fill="#FFB36B" opacity=".35" shape-rendering="auto"/>` +
      R(172, 78, 16, 18, '#FF9F43') + R(170, 80, 20, 14, '#FF9F43') +
      cloud(196, 42, '#C96B8A', 0.6, 'cl1') + cloud(166, 30, '#E58A6A', 0.45, 'cl2')
  }
  // birds in the morning
  if (ph === 'morning' || ph === 'day') sky += `<g class="bird">${R(0, 0, 3, 1.5, '#3A3936')}${R(3, 1.5, 1.5, 1.5, '#3A3936')}${R(4.5, 0, 3, 1.5, '#3A3936')}</g>`
  // seasonal life in the window
  if (month === 10) {
    const bc = ph === 'night' ? '#6A5A8C' : '#2A2233'
    sky += `<g class="bat"><g>${R(-2, -2, 4, 4, bc)}${R(-2, -4, 1, 2, bc)}${R(1, -4, 1, 2, bc)}` +
      `<g class="w1">${R(-8, -5, 6, 3, bc)}${R(2, -5, 6, 3, bc)}</g><g class="w2">${R(-8, 0, 6, 2, bc)}${R(2, 0, 6, 2, bc)}</g></g></g>`
  }
  if ((month === 4 || month === 5) && ph !== 'night') {
    sky += `<g class="bfly"><g class="w1">${R(-4, -3, 3, 4, '#F2A7C3')}${R(1, -3, 3, 4, '#F6D365')}</g><g class="w2">${R(-2, -2, 1.5, 3, '#F2A7C3')}${R(0.5, -2, 1.5, 3, '#F6D365')}</g>${R(-0.5, -2, 1, 4, INK)}</g>`
  }
  if (month === 9 || month === 11) {
    sky += `<g class="leaf1">${R(0, 0, 4, 2, '#D9822B')}${R(1, 2, 3, 2, '#B5651D')}</g><g class="leaf1 lf-b">${R(0, 0, 3, 2, '#C9A13B')}${R(1, 2, 3, 1.5, '#A5762A')}</g>`
  }
  // the landscape (Window view slot; an unknown view shows the city), shooting stars from level 75, then snow
  sky += viewSvg(s.decor.view, ph, month) || viewSvg('city', ph, month)
  if (level >= 75 && ph === 'night') sky += shootingStars()
  // winter snow, on the sill too; it never falls in space (the Low Orbit view)
  const snowy = (month === 12 || month === 1 || month === 2) && s.decor.view !== 'orbit'
  if (snowy) {
    const rs = rand(7)
    for (let i = 0; i < 16; i++) {
      const sx = 152 + Math.round(rs() * 92)
      sky += R(sx, 12, 2, 2, '#FFFFFF', ` class="sn" style="animation-duration:${n(4 + rs() * 4)}s;animation-delay:${n(-rs() * 8)}s"`)
    }
  }
  // level 100: a gold window frame
  const fr = level >= 100 ? GOLD_D : WOOD
  const frame = R(146, 14, 108, 6, fr) + R(146, 96, 108, 6, fr) + R(146, 14, 6, 88, fr) + R(248, 14, 6, 88, fr) +
    R(198, 20, 4, 76, fr) + R(152, 56, 96, 3, fr) +
    (level >= 100 ? R(146, 14, 108, 1, GOLD) + R(146, 15, 1, 87, GOLD) + R(198, 20, 1, 76, GOLD) + R(152, 56, 96, 1, GOLD) : '') +
    R(156, 24, 2, 10, '#FFFFFF', op(0.14)) + R(159, 24, 2, 5, '#FFFFFF', op(0.14)) + R(204, 62, 2, 8, '#FFFFFF', op(0.1))
  const sill = R(140, 100, 120, 5, WOOD_L) + R(142, 105, 116, 2, WOOD_D) + (snowy ? R(146, 98, 108, 2, '#F2F2F2') : '') +
    (level >= 40 ? flowerBox() : '')
  const curtain = (x: number, c: string): string => `<g class="ct ${c}">${R(x, 11, 16, 92, '#58779A')}${R(x + 4, 11, 2, 92, '#4A6584')}${R(x + 10, 11, 2, 92, '#4A6584')}${R(x, 99, 16, 4, '#4A6584')}</g>`
  return `<clipPath id="${id}w"><rect x="152" y="20" width="96" height="76"/></clipPath>` +
    `<g clip-path="url(#${id}w)">${sky}</g>` + frame + sill +
    R(132, 8, 136, 3, METAL) + R(129, 7, 4, 5, GOLD) + R(267, 7, 4, 5, GOLD) +
    curtain(136, 'ct1') + curtain(248, 'ct2')
}

// Level 100: the motes turn gold and dance in every phase.
function lightBeam(hour: number, gold: boolean): string {
  const ph = phaseOf(hour)
  const color = ph === 'night' ? '#9FB4FF' : ph === 'sunset' ? '#FFAA66' : ph === 'morning' ? '#FFD9B0' : '#FFF4D0'
  const o = ph === 'night' ? 0.035 : 0.06
  let out = `<polygon points="152,104 248,104 300,232 204,232" fill="${color}" opacity="${o}" shape-rendering="auto"/>`
  if (ph !== 'night' || gold) {
    const r = rand(17)
    for (let i = 0; i < 6; i++) {
      const y = 120 + r() * 100
      const x = 160 + (y - 104) * 0.4 + r() * 70
      out += R(x, y, gold ? 2 : 1.5, gold ? 2 : 1.5, gold ? '#F6D365' : '#FFF4D0', ` class="mt" style="animation-delay:${n(-r() * 6)}s"`)
    }
  }
  return out
}

// ---------- wall ----------

// The hands start at the real time the scene was drawn and keep turning in real time. The face comes
// from the Clock slot (roomArt.ts); the hands are drawn here in the face's hand colour.
function clock(kind: string): string {
  const c = clockSvg(kind) ?? clockSvg('classic')!
  return c.face + R(116.75, 39.5, 2.5, 5.5, c.hand, cls('hh')) +
    R(117.4, 34.5, 1.2, 10.5, c.hand === INK ? '#55554F' : c.hand, cls('mn')) + R(117, 43, 2, 2, c.hand)
}

function clockCss(hour: number, minute: number): string {
  const h = n((hour % 12) * 30 + minute * 0.5)
  const m = n(minute * 6)
  const turn = (name: string, from: string, secs: number): string =>
    `@keyframes ${name}{from{transform:rotate(${from}deg)}to{transform:rotate(${Number(from) + 360}deg)}}` +
    `.${name}{transform-origin:118px 44px;animation:${name} ${secs}s linear infinite}`
  return turn('hh', h, 43200) + turn('mn', m, 3600)
}

function poster(level: number): string {
  if (level < 5) return ''
  const gold = level >= 20
  const fr = gold ? GOLD : WOOD
  let out = R(264, 26, 28, 38, fr) + (gold ? R(264, 26, 28, 2, '#F6D88A') + R(264, 26, 2, 38, '#F6D88A') : '') +
    R(266, 28, 24, 34, '#2E3A4E') +
    R(270, 32, 1.5, 1.5, PAPER) + R(284, 31, 1.5, 1.5, PAPER) + R(287, 38, 1.5, 1.5, PAPER) + R(268, 40, 1.5, 1.5, PAPER) +
    R(276, 33, 6, 6, '#C9A45B') + R(274, 35, 10, 2, '#E2B84A', op(0.6)) +
    R(271, 46, 14, 7, ORANGE) + R(269, 49, 2, 2, ORANGE) + R(285, 49, 2, 2, ORANGE) +
    R(273, 48, 1.5, 2, INK) + R(281.5, 48, 1.5, 2, INK) +
    R(272, 53, 1.5, 2, ORANGE) + R(275, 53, 1.5, 2, ORANGE) + R(279.5, 53, 1.5, 2, ORANGE) + R(282.5, 53, 1.5, 2, ORANGE) +
    R(266, 57, 24, 5, '#3E4C63')
  if (gold) out += `<g class="skw">${R(289, 22, 1.5, 6, '#FFF7C8')}${R(286.75, 24.25, 6, 1.5, '#FFF7C8')}</g>`
  return out
}

// Trophy metal by how many trophies there are: bronze, silver, gold as today under 30;
// from 30 the first six silver and the rest gold; from 60 all gold.
function metalOf(i: number, count: number): string {
  if (count >= 60) return GOLD
  if (count >= 30) return i < 6 ? SILVER : GOLD
  return i < 4 ? BRONZE : i < 8 ? SILVER : GOLD
}

function trophy(color: string, i: number, x: number, base: number, newest: boolean): string {
  const dark = shade(color, -0.3)
  const light = shade(color, 0.45)
  let out: string
  if (i % 3 === 2) {
    // medal on a ribbon
    const y = base - 14
    out = R(x + 1, y, 3, 6, '#C8553D') + R(x + 6, y, 3, 6, '#4F6BD8') +
      R(x + 3, y + 5, 4, 1, dark) + R(x + 2, y + 6, 6, 7, color) + R(x + 3, y + 13, 4, 1, dark) +
      R(x + 4, y + 8, 2, 3, light) + R(x + 1, y + 7, 1, 5, color) + R(x + 8, y + 7, 1, 5, color)
  } else {
    const y = base - 14
    out = R(x, y, 10, 2, color) + R(x + 1, y + 2, 8, 4, color) + R(x - 2, y + 1, 2, 4, dark) + R(x + 10, y + 1, 2, 4, dark) +
      R(x + 3, y + 6, 4, 2, color) + R(x + 4, y + 8, 2, 2, dark) + R(x + 2, y + 10, 6, 2, color) + R(x + 1, y + 12, 8, 2, dark) +
      R(x + 2, y + 2, 1.5, 3, light)
  }
  if (newest) out += `<g class="skw">${R(x + 9, base - 18, 1.5, 5, '#FFF7C8')}${R(x + 7.25, base - 16.25, 5, 1.5, '#FFF7C8')}</g>`
  return out
}

// Planks at y 96 and 58, plus a third at y 20 from level 60 (18 trophies shown). Level 25 trims each
// plank with a gold strip; level 90 turns the planks gold.
const PLANKS = [96, 58, 20] as const

function trophyShelf(count: number, level: number): string {
  const rows = level >= 60 ? 3 : 2
  const plank = level >= 90 ? GOLD : WOOD
  const bracket = level >= 90 ? GOLD_D : WOOD_D
  let out = ''
  for (const y of PLANKS.slice(0, rows)) {
    out += R(296, y, 100, 3, plank) + R(300, y + 3, 3, 4, bracket) + R(389, y + 3, 3, 4, bracket) +
      (level >= 90 ? R(296, y, 100, 1, GOLD_L) : level >= 25 ? R(296, y, 100, 1, GOLD) : '')
  }
  const slots = rows * 6
  const shown = Math.min(slots, count)
  for (let i = 0; i < slots; i++) {
    const x = 301 + (i % 6) * 16
    const base = PLANKS[Math.floor(i / 6)]!
    out += i < shown ? trophy(metalOf(i, count), i, x, base, i === shown - 1) : R(x + 2, base - 2, 6, 2, DIM, op(0.3))
  }
  if (count > slots) out += `<g class="skw">${R(392, 40, 1.5, 6, GOLD)}${R(389.75, 42.25, 6, 1.5, GOLD)}</g>`
  return out
}

// The milestone level badge: a medal on a ribbon hanging under the lowest trophy plank.
// Bronze from level 10, silver from 25, gold from 50, platinum from 75.
const BADGE_METALS: ReadonlyArray<readonly [number, string, string, string]> = [
  [75, '#D3E1EC', '#7F93A6', '#FFFFFF'],
  [50, GOLD, GOLD_D, GOLD_L],
  [25, SILVER, '#8E949B', '#EEF1F4'],
  [10, BRONZE, '#8C5A33', '#E0AC7E'],
]

export function levelBadge(level: number): string {
  const metal = BADGE_METALS.find(([from]) => level >= from)
  if (!metal) return ''
  const [, face, rim, shine] = metal
  return R(343, 99, 6, 5, '#B5443B') + R(345, 99, 2, 5, PAPER) +
    R(343, 104, 6, 8, face) + R(342, 105, 8, 6, face) +
    R(343, 111, 6, 1, rim) + R(349, 106, 1, 4, rim) + R(345, 107, 2, 2, rim) + R(343, 105, 2, 1, shine) + R(343, 106, 1, 2, shine)
}

// Level 50: wainscoting behind the furniture, drawn before the floor.
function wainscot(): string {
  let out = R(0, 184, W, 48, WOOD_D, op(0.35))
  for (let x = 24; x < W; x += 50) out += R(x, 188, 1.5, 44, '#3B281D', op(0.3))
  return out + R(0, 184, W, 1.5, WOOD_L)
}

// ---------- furniture ----------

// The gold book slides out once when Clawd starts reading ('out'), is gone while he holds it, and
// slides back once he moves on ('back'); both are one-shot on scene time. After a walk it waits for
// Clawd to reach the shelf (outDelay), so it leaves as the held book fades in.
function bookshelf(book: 'in' | 'out' | 'back' | 'gone', outDelay?: number): string {
  const books = ['#7B9BC9', '#C9A45B', '#8FB07A', '#B57BA6', '#D97757', '#6FA3A0', '#C9C3B4', '#A35D5D']
  const r = rand(3)
  let out = R(8, 112, 68, 120, WOOD_D) + R(12, 116, 60, 112, '#3B281D') + R(6, 110, 72, 4, WOOD_L) +
    R(8, 148, 68, 4, WOOD) + R(8, 186, 68, 4, WOOD) + R(8, 226, 68, 6, WOOD)
  for (const [base, top] of [[148, 116], [186, 152], [226, 190]] as const) {
    let x = 13
    while (x < 70) {
      if (base === 186 && x >= 38 && x < 48) { x = 48; continue }
      const w = 4 + Math.round(r() * 4)
      const h = Math.min(base - top - 2, 18 + Math.round(r() * 10))
      if (x + w > 71) break
      out += R(x, base - h, w, h, books[Math.floor(r() * books.length)]!) + R(x + 1, base - h + 3, w - 2, 1, '#FFFFFF', op(0.18))
      x += w + (r() < 0.12 ? 3 : 1)
    }
  }
  // the book Clawd pulls out to read (the same gold book he holds)
  if (book !== 'gone') out += `<g${book === 'out' ? cls('bko') + (outDelay === undefined ? '' : delay(outDelay)) : book === 'back' ? cls('bki') : ''}>${R(39, 162, 8, 24, '#C9A45B')}${R(40, 166, 6, 2, '#8A6A2E')}${R(40, 178, 6, 2, '#8A6A2E')}</g>`
  return out
}

// The lava lamp (a shelf piece the scene draws itself) and the seasonal pumpkin or tree at x 54..76,
// which shows whatever the shelf piece is (B62).
function shelfTop(month: number, shelf: string): string {
  let out = ''
  if (shelf === 'lava') {
    out += `<ellipse cx="17" cy="96" rx="10" ry="12" fill="#F28A5A" opacity=".12" shape-rendering="auto"/>` +
      R(14, 84, 6, 3, METAL_D) + R(13, 87, 8, 17, '#5A2E6E') + R(12, 104, 10, 6, METAL_D) + R(13, 104, 8, 1, '#6A6A64') +
      R(15, 97, 4, 4, '#F28A5A', cls('lv1')) + R(16, 92, 3, 3, '#F2A86A', cls('lv2'))
  }
  if (month === 10) {
    out += R(63, 98, 3, 3, '#6E9B5E') + R(56, 100, 18, 10, '#E8892E') + R(54, 102, 22, 6, '#E8892E') + R(60, 100, 2, 10, '#C86A1E') + R(68, 100, 2, 10, '#C86A1E') +
      `<g class="jk">${R(58, 102, 3, 2, '#FFD54A')}${R(67, 102, 3, 2, '#FFD54A')}${R(59, 106, 10, 2, '#FFD54A')}</g>`
  } else if (month === 12) {
    out += R(62, 106, 4, 4, WOOD) + R(58, 102, 12, 4, '#3F7D4E') + R(54, 96, 20, 6, '#3F7D4E') + R(56, 90, 16, 6, '#4C9160') + R(59, 84, 10, 6, '#4C9160') + R(62, 79, 4, 5, '#4C9160') +
      R(62, 75, 4, 4, GOLD, cls('skw')) +
      R(57, 98, 2, 2, '#E0554A', cls('lt0')) + R(68, 92, 2, 2, '#F6D365', cls('lt1')) + R(61, 88, 2, 2, BLUE, cls('lt2')) +
      R(66, 98, 2, 2, '#F6D365', cls('lt2')) + R(64, 82, 2, 2, '#E0554A', cls('lt1')) + R(60, 104, 2, 2, BLUE, cls('lt0'))
  }
  return out
}

function plant(stage: number, month: number): string {
  const leaf = ['#6E9B5E', '#7FB06D', '#5C8A4E']
  const L = (x: number, y: number, w: number, i: number): string => R(x, y, w, 3, leaf[i % 3]!)
  let g = ''
  if (stage <= 0) {
    g = R(93, 203, 2, 7, '#7FB06D') + R(89, 202, 4, 2, '#7FB06D') + R(95, 200, 4, 2, '#7FB06D')
  } else if (stage === 1) {
    g = R(93, 192, 2, 18, '#6E9B5E') + L(86, 198, 7, 0) + L(95, 194, 7, 1) + L(89, 189, 5, 2)
  } else if (stage === 2) {
    g = R(93, 178, 3, 32, '#6E9B5E') + L(83, 198, 10, 0) + L(96, 192, 10, 1) + L(85, 186, 8, 2) + L(96, 180, 8, 0) + L(89, 176, 6, 1)
  } else {
    g = R(93, 160, 3, 50, '#6E9B5E') + R(88, 182, 5, 2, '#6E9B5E') + R(96, 172, 5, 2, '#6E9B5E') +
      L(80, 200, 13, 0) + L(96, 196, 13, 1) + L(82, 190, 10, 2) + L(98, 184, 10, 0) + L(78, 180, 12, 1) + L(100, 170, 10, 2) +
      L(84, 168, 9, 0) + L(96, 162, 8, 1) + L(89, 158, 6, 2)
  }
  const spring = month === 4 || month === 5
  let flowers = ''
  const flower = (x: number, y: number, c: string): string => R(x - 2, y, 6, 2, c) + R(x, y - 2, 2, 6, c) + R(x, y, 2, 2, '#F6D365')
  if (stage >= 4) flowers += flower(94, 154, PINK) + flower(81, 176, '#F2A7C3') + flower(107, 166, PINK) + flower(103, 182, '#F6D365')
  else if (spring && stage >= 1) flowers += flower(94, stage === 1 ? 186 : stage === 2 ? 172 : 154, '#F2A7C3')
  return `<g class="lfg">${g}${flowers}</g>` +
    R(84, 214, 20, 18, '#8A5A44') + R(82, 210, 24, 6, '#A06A50') + R(86, 216, 3, 12, '#A06A50', op(0.6))
}

function rug(level: number): string {
  if (level < 3) return ''
  let out = R(98, 234, 150, 6, '#7A4E63') + R(98, 234, 150, 1, '#A86B85') + R(98, 239, 150, 1, '#A86B85')
  for (let x = 104; x < 244; x += 12) out += R(x, 236, 4, 2, '#C9A45B')
  return out
}

function floor(): string {
  let out = R(0, FLOOR_Y, W, 3, FLOOR)
  for (let x = 6; x < W; x += 28) out += R(x, 243, 14, 1.5, FLOOR, op(0.7))
  for (let x = 20; x < W; x += 40) out += R(x, 253, 10, 1.5, FLOOR, op(0.45))
  return out
}

function stool(): string {
  return R(228, 212, 28, 4, WOOD_L) + R(230, 216, 24, 2, WOOD_D) + R(240, 218, 4, 12, METAL) + R(232, 230, 20, 2, METAL)
}

function mug(coffee: number): string {
  const levels = [0, 4, 7, 10]
  const h = levels[coffee] ?? 0
  let out = R(357, 182, 8, 12, PAPER, op(0.2))
  if (h > 0) out += R(357, 194 - h, 8, h, '#6B3F27') + R(357, 194 - h, 8, 1, '#B07A4F')
  else out += R(357, 193, 8, 1, '#6B3F27', op(0.5))
  out += R(355, 182, 2, 14, PAPER) + R(365, 182, 2, 14, PAPER) + R(355, 194, 12, 2, PAPER) +
    R(367, 185, 3, 2, PAPER) + R(369, 185, 2, 8, PAPER) + R(367, 191, 3, 2, PAPER) +
    // grey outline on the left and around the handle so the white mug reads on a light pane (the desk frames the bottom)
    R(354, 182, 1, 14, DIM) + R(367, 182, 1, 3, DIM) + R(368, 184, 3, 1, DIM) + R(371, 184, 1, 10, DIM) +
    R(368, 193, 3, 1, DIM) + R(367, 193, 1, 3, DIM)
  if (h > 0) out += `<g${op(0.55)}>${R(358, 174, 2, 6, PAPER, cls('stm'))}${R(362, 170, 2, 6, PAPER, ` class="stm" style="animation-delay:1.1s"`)}</g>`
  return out
}

function pcTower(): string {
  return R(362, 206, 22, 26, '#3E3E3A') + R(364, 208, 18, 22, '#4A4A45') +
    R(367, 212, 12, 1.5, '#33332F') + R(367, 215, 12, 1.5, '#33332F') + R(367, 218, 12, 1.5, '#33332F') +
    R(367, 225, 2, 2, TERM, cls('led')) + R(371, 225, 2, 2, '#F2A93B', cls('hdd'))
}

function secondMonitor(on: boolean): string {
  let s = R(374, 150, 24, 36, METAL) + R(376, 152, 20, 30, SCREEN)
  if (on) {
    const cols = [GREEN, BLUE, ORANGE, GREEN]
    const hs = [12, 20, 9, 24]
    hs.forEach((h, i) => { s += R(378 + i * 4.5, 180 - h, 3, h, cols[i]!, ` class="bar" style="animation-delay:${n(-i * 0.55)}s"`) })
    s += R(377, 155, 10, 1.5, DIM)
  }
  return s + R(383, 186, 6, 6, METAL_D) + R(378, 192, 16, 4, METAL)
}

// ---------- monitor screens (local 64x40) ----------

function codeLines(colors: readonly string[], seed: number): string {
  const r = rand(seed)
  const pat: [number, number][] = []
  for (let i = 0; i < 12; i++) pat.push([Math.floor(r() * 3) * 5, 8 + Math.round(r() * 34)])
  let out = ''
  for (const copy of [0, 72]) {
    pat.forEach(([ind, w], i) => { out += R(4 + ind, 3 + i * 6 + copy, w, 3, colors[i % colors.length]!) })
  }
  return `<g class="scr">${out}</g>`
}

function scrCode(colors: readonly string[]): string {
  return codeLines(colors, 11) + R(56, 33, 4, 5, ORANGE, cls('cur'))
}

function scrDoc(search: boolean): string {
  let out = R(0, 0, 64, 40, '#E8E6DC') + R(4, 3, 30, 4, '#3A3936')
  let lines = ''
  const r = rand(19)
  for (let i = 0; i < 16; i++) lines += R(4, 10 + i * 5, 30 + Math.round(r() * 26), 2, i % 5 === 4 ? BLUE : DIM)
  out += `<g class="dsc">${lines}</g>`
  if (search) out += R(2, 9, 60, 4, '#F6D365', ` class="hlt" opacity=".55"`)
  return out
}

// A new file: lines type in pixel by pixel down the page, then clear in a rolling wave.
function scrWrite(): string {
  const ws = [22, 34, 28, 40, 18, 30]
  const cols = [ORANGE, BLUE, GREEN, GOLD, BLUE, DIM]
  let out = R(0, 0, 7, 40, '#1E1D1B')
  for (let i = 0; i < 6; i++) {
    out += R(2, 3 + i * 6, 3, 2, '#55554F') + R(10 + (i % 3 ? 5 : 0), 3 + i * 6, ws[i]!, 3, cols[i]!, ` class="ty" style="animation-delay:${n(i * 0.55)}s"`)
  }
  return out + R(10, 38, 4, 1.5, ORANGE, cls('cur'))
}

function scrShell(): string {
  const greens = [TERM, '#4FAF6A', '#3E7A4E', TERM, '#9AE6A8']
  return R(0, 0, 64, 40, '#0B110D') + codeLines(greens, 29) +
    R(0, 31, 64, 9, '#0B110D') + glyphs('>', 3, 33, 1.2, TERM) + R(9, 34, 14, 3, TERM, op(0.8)) + R(25, 37, 5, 1.5, TERM, cls('cur'))
}

function scrGit(): string {
  const r = rand(41)
  let g = ''
  for (const c of [0, 60]) {
    g += R(9, c, 2, 60, '#CFCBC0') +
      R(11, 3 + c, 2, 2, ORANGE) + R(13, 5 + c, 2, 2, ORANGE) + R(15, 7 + c, 2, 2, ORANGE) + R(17, 9 + c, 2, 32, ORANGE) +
      R(15, 41 + c, 2, 2, ORANGE) + R(13, 43 + c, 2, 2, ORANGE) + R(11, 45 + c, 2, 2, ORANGE)
    const commits: [number, number, string][] = [[8, 2, '#CFCBC0'], [16, 14, ORANGE], [16, 26, ORANGE], [8, 32, '#CFCBC0'], [8, 46, '#F6D365'], [8, 54, '#CFCBC0']]
    for (const [x, y, col] of commits) {
      g += R(x - 1, y + c - 1, 6, 6, col) + R(x + 1, y + c + 1, 2, 2, '#121417')
      g += R(26, y + c + 1, 12 + Math.round(r() * 22), 2, DIM) + R(22, y + c + 1, 3, 2, BLUE)
    }
  }
  return R(0, 0, 64, 40, '#121417') + `<g class="gsc">${g}</g>`
}

function scrTest(): string {
  let out = R(0, 0, 64, 40, '#101412')
  const r = rand(53)
  for (let i = 0; i < 5; i++) {
    const y = 3 + i * 6.5
    const fail = i === 3
    const mark = fail
      ? pmap(['1...1', '.1.1.', '..1..', '.1.1.', '1...1'], 3, y, 1, { '1': '#E06C5A' })
      : pmap(['....1', '...1.', '1.1..', '.1...'], 3, y + 0.5, 1.2, { '1': TERM })
    out += `<g class="pop"${delay(i * 0.5)}>${mark}</g>` + R(11, y + 1.5, 20 + Math.round(r() * 28), 2, i === 3 ? '#8A5A54' : DIM)
  }
  return out + R(3, 36, 58, 2, '#24342A') + R(3, 36, 58, 2, TERM, cls('prg'))
}

function scrWeb(): string {
  const page = R(4, 10, 24, 14, '#9CC0E8') + R(4, 19, 24, 5, '#7FB06D') + R(22, 12, 3, 3, '#F6D365') +
    R(32, 10, 26, 3, '#3A3936') + R(32, 16, 28, 2, DIM) + R(32, 20, 22, 2, DIM) +
    R(4, 28, 56, 2, DIM) + R(4, 32, 48, 2, DIM) + R(4, 36, 52, 2, DIM) + R(4, 40, 40, 2, DIM) + R(4, 44, 56, 2, DIM) + R(4, 48, 30, 2, BLUE)
  return R(0, 0, 64, 40, '#EDEAE2') + `<g class="wsc">${page}</g>` +
    R(0, 0, 64, 6, '#C9C4B8') + R(2, 2, 2, 2, '#E06C5A') + R(5, 2, 2, 2, '#F2C14E') + R(8, 2, 2, 2, '#7FB06D') + R(13, 1.5, 48, 3, '#FFFFFF') +
    R(0, 6, 64, 1, BLUE, cls('prg'))
}

function scrTerraform(): string {
  const boxes: [number, number][] = [[26, 3], [10, 16], [42, 16], [2, 29], [26, 29], [50, 29]]
  let out = R(0, 0, 64, 40, '#15121E') +
    R(31, 10, 2, 3, '#4A3D73') + R(16, 12, 32, 2, '#4A3D73') + R(15, 12, 2, 4, '#4A3D73') + R(47, 12, 2, 4, '#4A3D73') +
    R(15, 23, 2, 3, '#4A3D73') + R(47, 23, 2, 3, '#4A3D73') + R(7, 25, 50, 2, '#4A3D73') + R(7, 25, 2, 4, '#4A3D73') + R(31, 25, 2, 4, '#4A3D73') + R(55, 25, 2, 4, '#4A3D73')
  boxes.forEach(([x, y], i) => {
    out += R(x, y, 12, 7, PURPLE) + R(x + 1, y + 1, 10, 5, '#2B2442') +
      `<g class="pop"${delay(i * 0.45)}>${R(x + 1, y + 1, 10, 5, PURPLE)}${R(x + 2, y + 2, 4, 1, '#C9B6F2')}</g>`
  })
  return out
}

function scrAgent(): string {
  const kid = (x: number, c: string, i: number): string =>
    `<g class="sk"${delay(i * 0.45)}>${R(x, 26, 12, 7, c)}${R(x + 3, 28, 1.5, 1.5, INK)}${R(x + 7.5, 28, 1.5, 1.5, INK)}</g>`
  return R(0, 0, 64, 40, '#121212') +
    R(25, 3, 14, 9, ORANGE) + R(28, 6, 2, 2, INK) + R(34, 6, 2, 2, INK) +
    R(31, 12, 2, 5, '#55554F') + R(9, 17, 46, 2, '#55554F') + R(9, 17, 2, 9, '#55554F') + R(31, 17, 2, 9, '#55554F') + R(53, 17, 2, 9, '#55554F') +
    R(9, 17, 2, 2, '#F6D365', cls('pkt')) + R(31, 17, 2, 2, '#F6D365', ` class="pkt" style="animation-delay:-.45s"`) + R(53, 17, 2, 2, '#F6D365', ` class="pkt" style="animation-delay:-.9s"`) +
    kid(4, '#E39A7A', 0) + kid(26, '#C77A5A', 1) + kid(48, '#E8B07A', 2)
}

function scrError(): string {
  return R(0, 0, 64, 40, '#3A1210') + R(0, 0, 64, 40, RED, cls('alr')) +
    R(29, 6, 6, 18, PAPER) + R(29, 27, 6, 6, PAPER) + R(4, 36, 20, 2, '#E08A74') + R(40, 36, 20, 2, '#E08A74')
}

function scrSleep(): string {
  const mini = R(1, 0, 6, 3, ORANGE) + R(0, 1, 1, 1, ORANGE) + R(7, 1, 1, 1, ORANGE) + R(1.5, 3, 1, 1, ORANGE) + R(5.5, 3, 1, 1, ORANGE)
  return R(0, 0, 64, 40, '#060606') + `<g class="ssx"><g class="ssy"${op(0.5)}>${mini}</g></g>`
}

function scrDone(): string {
  return R(0, 0, 64, 40, '#0F1A12') +
    `<g class="pop">${pmap(['......1', '.....1.', '1...1..', '.1.1...', '..1....'], 18, 10, 4, { '1': TERM })}</g>` +
    R(8, 35, 48, 2, TERM, op(0.5))
}

type S = {
  mood: Mood; activity: Activity; hat: AnyHat; hour: number; minute: number; month: number; helpers: number
  combo: number; trophies: number; plantStage: number; level: number; coffee: number
  decor: Required<DecorChoice>
  usage: NormUsage
  celebrate: Celebration | undefined
}

function monitor(s: S, id: string): string {
  const { mood, activity } = s
  let inner: string
  if (mood === 'error') inner = scrError()
  else if (mood === 'sleeping') inner = scrSleep()
  else if (mood === 'done') inner = scrDone()
  else {
    switch (activity) {
      case 'shell': inner = scrShell(); break
      case 'git': inner = scrGit(); break
      case 'test': inner = scrTest(); break
      case 'write': inner = scrWrite(); break
      case 'web': inner = scrWeb(); break
      case 'terraform': inner = scrTerraform(); break
      case 'agent': inner = scrAgent(); break
      case 'read': inner = scrDoc(false); break
      case 'search': inner = scrDoc(true); break
      case 'skill': inner = scrCode(['#B89CFF', GOLD, '#8C6BC8', DIM]); break
      default: inner = scrCode([ORANGE, BLUE, GREEN, GOLD, DIM])
    }
  }
  // the LED sits bottom-left of the bezel, so a tall paper stack does not hide the error blink
  const led = mood === 'error' ? R(285, 183, 3, 2, RED, cls('alr')) : R(285, 183, 3, 2, mood === 'sleeping' ? '#F2A93B' : TERM)
  return R(280, 138, 72, 48, METAL) + R(281, 139, 70, 1, '#6E6E68') +
    `<g transform="translate(284,142)"><clipPath id="${id}s"><rect width="64" height="40"/></clipPath><g clip-path="url(#${id}s)">${R(0, 0, 64, 40, SCREEN)}${inner}${R(0, 0, 64, 40, '#FFFFFF', ' opacity=".03"')}</g></g>` +
    led + R(312, 186, 8, 6, METAL_D) + R(302, 192, 28, 4, METAL)
}

function desk(s: S, id: string): string {
  const lampOn = (s.hour >= 19 || s.hour < 7) && s.mood !== 'sleeping'
  return R(252, 196, 148, 5, WOOD) + R(252, 196, 148, 1, WOOD_L) + R(254, 201, 144, 3, WOOD_D) +
    R(260, 204, 5, 28, WOOD_D) + R(390, 204, 5, 28, WOOD_D) +
    pcTower() +
    monitor(s, id) +
    (s.level >= 12 ? secondMonitor(s.mood !== 'sleeping') : '') +
    // the lamp stands behind the keyboard; an unknown lamp or drink falls back to the default
    (lampSvg(s.decor.lamp, lampOn) || lampSvg('desk', lampOn)) +
    R(270, 192, 32, 4, '#4A4A45') + R(272, 193, 28, 1, '#6A6A64') + R(272, 194.5, 28, 0.75, '#6A6A64') +
    R(334, 193, 6, 3, '#6A6A64') +
    (drinkSvg(s.decor.drink, s.coffee) || mug(s.coffee))
}

// ---------- activity props ----------

// Room props for what Clawd is doing. The radio and crane follow the activity; the new-file card,
// shelf glints, check card and paper plane only show while Clawd is at that station.
function props(s: S, st: Station): string {
  let out = ''
  switch (s.activity) {
    case 'write': {
      if (st === 'write') {
        out += `<g transform="translate(298,116)"><g class="pop">${R(0, 0, 12, 15, PAPER)}${R(8, 0, 4, 4, '#BDBAAE')}${R(2, 5, 7, 1, DIM)}${R(2, 8, 5, 1, DIM)}` +
          `${R(6, 9, 7, 7, GREEN)}${R(8.75, 10.5, 1.5, 4, PAPER)}${R(7.5, 11.75, 4, 1.5, PAPER)}</g></g>`
      }
      break
    }
    case 'search': {
      // glints sweep the top and middle shelf in step with Clawd's 6 s sidestep
      if (st === 'scan') out += `<g class="spn">${R(13, 116, 5, 32, '#FFF4D0', op(0.35))}</g><g class="spn" style="animation-delay:-1.5s">${R(13, 152, 5, 34, '#FFF4D0', op(0.35))}</g>`
      break
    }
    case 'web': {
      // a radio on the sill between the hourglass and the fishbowl, waves from the antenna tip
      out += R(178, 91, 18, 9, METAL) + R(178, 91, 18, 1.5, '#6E6E68') + R(180, 93, 7, 1, INK) + R(180, 95, 7, 1, INK) + R(180, 97, 7, 1, INK) +
        R(189, 93, 5, 5, '#C9C3B4') + R(191, 94, 1, 2, RED) + R(193, 73, 1.5, 18, SILVER) + R(192, 71, 3.5, 3, RED, cls('alr')) +
        `<g fill="none" stroke="${TERM}" stroke-width="1.5" shape-rendering="auto">` +
        `<path class="wv" d="M198 72.5a4 4 0 0 0 -4 -4"/><path class="wv" style="animation-delay:.25s" d="M202 72.5a8 8 0 0 0 -8 -8"/><path class="wv" style="animation-delay:.5s" d="M206 72.5a12 12 0 0 0 -12 -12"/></g>`
      break
    }
    case 'terraform': {
      out += R(188, 166, 4, 66, GOLD)
      for (let y = 170; y < 230; y += 8) out += R(188, y, 4, 2, '#B58C2E')
      out += R(176, 164, 42, 4, GOLD) + R(176, 168, 7, 7, METAL_D) + R(185, 168, 9, 6, '#C9A45B') + R(187, 169, 4, 3, '#BFE3F5', op(0.7)) +
        R(203, 168, 6, 2, METAL_D) +
        R(205.5, 170, 1, 36, '#8A8A82', cls('hl')) +
        `<g class="tb">${R(200, 176, 12, 8, PURPLE)}${R(200, 176, 12, 1.5, '#B39CE8')}</g>` +
        R(200, 224, 12, 8, PURPLE) + R(200, 224, 12, 1.5, '#B39CE8') +
        R(200, 216, 12, 8, '#7A5BB8') + R(200, 216, 12, 1.5, '#B39CE8') +
        // the control box on the floor right of the block stack (clear of the pet bed): its lever goes down with every block drop
        R(214, 216, 12, 16, METAL_D) + R(214, 216, 12, 1.5, '#6A6A64') + R(216, 219, 3, 2, TERM, cls('led')) + R(221, 219, 3, 2, '#F2A93B') +
        `<g class="lev">${R(219, 203, 2, 13, SILVER)}${R(217.5, 200, 5, 4, RED)}</g>`
      break
    }
    case 'git': {
      // a paper plane leaves Clawd's left hand and flies out of the window
      if (st === 'git') out += `<g transform="translate(200,182)"><g class="pl">${pmap(['...x...', '..xxx..', '..xxx..', '.xxdxx.', '.xxdxx.', 'xx.d.xx', 'x..d..x'], 0, 0, 1.5, { x: PAPER, d: '#BDBAAE' })}</g></g>`
      break
    }
    case 'test': {
      // a passing check only at the test station: a failed run is the error station's red screen
      if (st === 'test') out += `<g transform="translate(296,118)"><g class="pop">${R(0, 0, 14, 12, PAPER)}${pmap(['....1', '...1.', '1.1..', '.1...'], 3, 3, 1.6, { '1': '#4FAF6A' })}${R(3, 12, 3, 3, PAPER)}</g></g>`
      break
    }
    default:
      break
  }
  return out
}

// ---------- Clawd's overhead effects (in walk-local units: Clawd box 72x30, feet at y=30) ----------

const HEART = ['.hh.hh.', 'hwhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...']
const ZED = ['1111', '..11', '.11.', '11..', '1111']
const FLAME = ['..r..', '..rr.', '.ryr.', '.ryyr', 'ryyyr', 'ryWyr', '.rrr.']

// Combos are drawn per tier, so the scene source only changes when a new tier is reached.
const COMBO_TIERS = [50, 20, 10, 5] as const

export function comboTier(combo: number): number {
  for (const t of COMBO_TIERS) if (combo >= t) return t
  return 0
}

// Where the combo badge sits beside Clawd (walk-local): right of him, left of him, up on the open wall right
// of the bookshelf (over the plant's top, y 122..140), or centred above the tallest hat (top y -30).
export type BadgeSpot = 'right' | 'left' | 'wall' | 'above'

// Stations whose usual side would put the badge on the plant (x 78..113, y 140..210): the bookshelf corner, the
// crane and the working pace (it starts at x 102, right of the plant).
export function badgeSpot(station: Station): BadgeSpot {
  if (station === 'reading' || station === 'scan') return 'wall'
  if (station === 'crane' || station === 'working') return 'above'
  return SPOTS[station] >= 200 ? 'left' : 'right'
}

function comboBadge(combo: number, spot: BadgeSpot): string {
  if (combo < 5) return ''
  const big = combo >= 10
  const fs = big ? 2.2 : 1.6
  const flame = `<g class="fl fbB">${pmap(FLAME, 0, (big ? 14 : 11.2) - 7 * fs, fs, { r: '#E8642C', y: '#F6B53A', W: '#FFF1B0' })}</g>`
  const text = `x${comboTier(combo)}+`
  const tx = 5 * fs + 2
  const textW = text.length * 6 - 1.5
  const width = tx + textW
  const x0 = spot === 'left' ? -width - 4 : spot === 'above' ? 36 - width / 2 : 74
  const y0 = spot === 'wall' ? -80 : spot === 'above' ? -50 : -8
  const ty = (big ? 14 : 11.2) - 7.5
  // a dark plate behind the gold digits (3x5 glyphs at 1.5 = 7.5 tall) keeps them readable on any pane
  return `<g transform="translate(${n(x0)},${y0})">${flame}${R(tx - 1.5, ty - 1.5, textW + 3, 10.5, INK, op(0.55))}${glyphs(text, tx, ty, 1.5, '#F6D365')}</g>`
}

function aura(combo: number): string {
  if (combo < 20) return ''
  const spots: [number, number][] = [[-8, 4], [78, 2], [-6, 24], [80, 22], [6, -16], [64, -18], [36, -26], [-12, 14]]
  let out = `<ellipse class="au" cx="36" cy="14" rx="48" ry="28" fill="#F6D365" opacity=".12" shape-rendering="auto"/>`
  spots.forEach(([x, y], i) => {
    out += `<g class="sk"${delay(i * 0.27)}>${R(x + 1.5, y, 1.5, 4.5, '#FFE58A')}${R(x, y + 1.5, 4.5, 1.5, '#FFE58A')}</g>`
  })
  return out
}

// What Clawd holds or shows above his head at each station. Held things sit in <g class="hd"> so
// they can move with the body (walk-local: body x 12..60 y 0..24, eyes x 20..24 / 48..52 y 6..12,
// arms x 4..12 / 60..68 y 12..18).
function overhead(st: Station): string {
  switch (st) {
    case 'thinking':
      // a grey 1px outline (each paper rect grown by one) keeps the bubble visible on a light pane
      // the tail sits 4 units right of the old spot, clear of a tall hat (B58)
      return R(63, -47, 34, 24, DIM) + R(59, -43, 42, 16, DIM) + R(61, -17, 7, 7, DIM) + R(57, -9, 5, 5, DIM) +
        R(64, -46, 32, 22, PAPER) + R(60, -42, 40, 14, PAPER) + R(62, -16, 5, 5, PAPER) + R(58, -8, 3, 3, PAPER) +
        R(67, -38, 6, 6, INK, cls('d0')) + R(77, -38, 6, 6, INK, cls('d1')) + R(87, -38, 6, 6, INK, cls('d2'))
    case 'reading':
      return `<g class="hd">${R(14, 12, 44, 14, '#C9A45B')}${R(16, 11, 19, 13, PAPER)}${R(37, 11, 19, 13, '#D8D5C8')}${R(35, 11, 2, 14, '#9A8F7A')}` +
        R(19, 14, 13, 1.5, DIM) + R(19, 17.5, 10, 1.5, DIM) + R(19, 21, 12, 1.5, DIM) + R(40, 14, 13, 1.5, DIM) + R(40, 17.5, 11, 1.5, DIM) +
        `<g class="pg fbL">${R(37, 11, 19, 13, PAPER)}${R(40, 15, 12, 1.5, DIM)}</g></g>`
    case 'error':
      return `<g fill="${DIM}">${R(18, -14, 8, 8, DIM, cls('pf'))}${R(30, -22, 11, 11, DIM, ` class="pf" style="animation-delay:.45s"`)}${R(46, -16, 8, 8, DIM, ` class="pf" style="animation-delay:.9s"`)}</g>`
    case 'working':
      return `<g transform="translate(60,-16)"><g class="gear fb">${R(-3, -8, 6, 16, DIM)}${R(-8, -3, 16, 6, DIM)}${R(-6, -6, 12, 12, DIM)}${R(-2, -2, 4, 4, INK)}</g></g>`
    case 'sleeping':
      return [[0, 1.4], [1, 1.8], [2, 2.3]].map(([i, u]) =>
        `<g transform="translate(${54 + i! * 4},${-4 - i! * 3})"><g class="zz"${delay(i! * 1)}>${pmap(ZED, 0, 0, u!, { '1': BLUE })}</g></g>`).join('')
    case 'happy':
      return [[16, 0], [38, 0.8], [56, 1.6]].map(([x, d]) =>
        `<g transform="translate(${x},-12)"><g class="ht"${delay(d!)}>${pmap(HEART, 0, 0, 1.4, { h: PINK, w: '#FFC4CF' })}</g></g>`).join('')
    case 'scan':
      // a magnifier over his right eye, the pupil big behind the lens
      return `<g class="hd"><g class="mgh"><g${op(0.45)}>${R(46, 1, 10.5, 10.5, '#BFE3F5')}</g>${R(48.5, 3, 5, 7, INK)}${R(49.5, 4, 2, 2, '#FFFFFF')}` +
        pmap(['..xxxx..', '.x....x.', 'x......x', 'x......x', 'x......x', 'x......x', '.x....x.', '..xxxx..'], 44, -1, 1.75, { x: '#B8B8B0' }) +
        R(56, 13, 3, 3, WOOD) + R(59, 16, 3, 3, WOOD) + R(62, 19, 3, 3, WOOD_D) + `</g></g>`
    case 'web':
      return `<g class="hd"><g class="bn">${R(17, -6, 11, 18, '#2E2E33')}${R(44, -6, 11, 18, '#2E2E33')}${R(28, 0, 16, 4, METAL_D)}` +
        `${R(16, -8, 13, 3, METAL_D)}${R(43, -8, 13, 3, METAL_D)}${R(19, -7, 4, 1.5, '#9CC0E8', op(0.8))}${R(46, -7, 4, 1.5, '#9CC0E8', op(0.8))}</g></g>`
    case 'agent': {
      // a clipboard: the items get ticked off one by one
      let out = `<g class="hd">${R(58, 2, 15, 19, WOOD_L)}${R(60, 5, 11, 14, PAPER)}${R(62, 1, 7, 3, METAL)}`
      for (let i = 0; i < 3; i++) out += R(64, 8 + i * 4, 6, 1.5, DIM) + `<g class="pop"${delay(i * 1.2)}>${R(61, 7.5 + i * 4, 2, 2, GREEN)}</g>`
      return out + `</g>`
    }
    case 'skill':
      // the spellbook floats above his head (above every hat, B58)
      return `<g transform="translate(-2,-140)"><g class="sb"><ellipse cx="38" cy="92" rx="18" ry="11" fill="#B89CFF" class="gl" shape-rendering="auto"/>` +
        R(24, 96, 28, 4, '#6B4FA8') + R(24, 99, 28, 1, GOLD) +
        R(25, 88, 13, 9, PAPER) + R(38, 88, 13, 9, '#F2EFE6') + R(37, 88, 2, 10, '#4E3A80') +
        R(27, 90, 9, 1, '#9B7BD0') + R(27, 93, 7, 1, '#9B7BD0') + R(40, 90, 9, 1, GOLD) + R(40, 93, 6, 1, GOLD) +
        R(28, 84, 2, 2, '#E9DCFF', cls('sp')) + R(37, 82, 2, 2, '#F6D365', ` class="sp" style="animation-delay:.6s"`) +
        R(46, 84, 2, 2, '#E9DCFF', ` class="sp" style="animation-delay:1.2s"`) + R(33, 85, 1.5, 1.5, '#F6D365', ` class="sp" style="animation-delay:1.8s"`) + `</g></g>`
    default:
      return ''
  }
}

function confetti(): string {
  const r = rand(23)
  const colors = [ORANGE, '#F2C14E', BLUE, GREEN, '#B57BA6', PAPER]
  let out = ''
  for (let i = 0; i < 30; i++) {
    out += R(Math.round(r() * W), -12, 4, 6, colors[i % colors.length]!, ` class="cf" style="animation-delay:${n(r() * 1.6)}s;animation-duration:${n(2 + r() * 1.4)}s"`)
  }
  return out
}

// ---------- celebrations: short overlays on scene time ----------

function confettiOf(count: number, seed: number, colors: readonly string[]): string {
  const r = rand(seed)
  let out = ''
  for (let i = 0; i < count; i++) {
    out += R(Math.round(r() * W), -12, i % 3 ? 4 : 3, i % 3 ? 6 : 3, colors[i % colors.length]!, ` class="cf" style="animation-delay:${n(r() * 2.4)}s;animation-duration:${n(2 + r() * 1.4)}s"`)
  }
  return out
}

// A firework burst: two rings of 8 sparks round a white core, popping out from the centre.
function burst(cx: number, cy: number, colors: readonly [string, string], d: number): string {
  let sparks = R(cx - 1, cy - 1, 2, 2, '#FFFFFF')
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    sparks += R(Math.round(cx + Math.cos(a) * 5) - 1, Math.round(cy + Math.sin(a) * 5) - 1, 2, 2, colors[0]) +
      R(Math.round(cx + Math.cos(a + 0.4) * 9) - 1, Math.round(cy + Math.sin(a + 0.4) * 9) - 1, 2, 2, colors[1])
  }
  return `<g class="fw"${delay(d)}>${sparks}</g>`
}

// Three bursts inside the window panes (clear of the mullions).
function fireworks(palette: ReadonlyArray<readonly [string, string]>): string {
  return burst(174, 38, palette[0]!, 0) + burst(226, 40, palette[1]!, 0.6) + burst(184, 76, palette[2]!, 1.2)
}

// Level 100: a red ribbon with a gold '100' drops in over the room.
function legendBanner(): string {
  return `<g class="bnr">` +
    R(146, 116, 10, 18, '#8E2528') + R(144, 116, 2, 6, '#8E2528') + R(144, 128, 2, 6, '#8E2528') +
    R(244, 116, 10, 18, '#8E2528') + R(254, 116, 2, 6, '#8E2528') + R(254, 128, 2, 6, '#8E2528') +
    R(154, 110, 92, 26, '#B8323C') + R(154, 111, 92, 1, GOLD) + R(154, 134, 92, 1, GOLD) + R(154, 135, 92, 1, '#8E2528') +
    glyphs('100', 184, 116, 3, '#F6D365') + R(184, 131, 33, 1, GOLD_D) +
    `<g class="sk">${R(164.5, 118, 1.5, 6, '#FFF7C8')}${R(162.25, 120.25, 6, 1.5, '#FFF7C8')}</g>` +
    `<g class="sk"${delay(0.7)}>${R(232.5, 124, 1.5, 6, '#FFF7C8')}${R(230.25, 126.25, 6, 1.5, '#FFF7C8')}</g></g>`
}

const MILESTONE_CONFETTI = [GOLD, GOLD_L, '#F2C14E', GOLD, '#F6D365', ORANGE, GOLD_D, PAPER]
const RAINBOW = ['#E0554A', '#F08A2A', '#F6D365', '#7FB06D', '#4F8BD8', '#8C6BC8']

// The room-wide part of a celebration (the top layer).
function celebration(kind: Celebration | undefined): string {
  if (kind === 'milestone') {
    return confettiOf(50, 29, MILESTONE_CONFETTI) + fireworks([['#F6D365', GOLD_L], [GOLD, '#FFF7C8'], ['#F2C14E', '#F6D365']])
  }
  if (kind === 'legend') {
    return confettiOf(56, 31, RAINBOW) + fireworks([['#E0554A', '#F6D365'], ['#7FE3F0', '#8C6BC8'], ['#7FB06D', '#F2A0B8']]) + legendBanner()
  }
  return ''
}

// An Encore star: a small gold star burst over Clawd's head (walk-local units, inside his group).
function starBurst(): string {
  let rays = ''
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    const r = k % 2 ? 7 : 10
    rays += R(Math.cos(a) * r - 0.75, Math.sin(a) * r - 0.75, 1.5, 1.5, k % 2 ? GOLD_L : GOLD)
  }
  return `<g transform="translate(36,-36)"><g class="esb">${rays}${pmap(['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'], -2.5, -2.5, 1, { y: '#F6D365' })}${R(-0.5, -1.5, 1, 1, '#FFFFFF')}</g></g>`
}

function smoke(): string {
  return `<g fill="${DIM}">${R(300, 128, 8, 8, DIM, cls('sm'))}${R(312, 122, 10, 10, DIM, ` class="sm" style="animation-delay:.6s"`)}${R(326, 128, 7, 7, DIM, ` class="sm" style="animation-delay:1.2s"`)}</g>`
}

// ---------- helpers (mini Clawds) ----------

const HELPER_TINTS = ['#E39A7A', '#C77A5A', '#E8B07A']

function helpers(count: number): string {
  let out = ''
  const feet = [248, 254, 244]
  for (let i = 0; i < count; i++) {
    const carry = i === 0
      ? R(30, -6, 7, 9, PAPER) + R(31.5, -4, 4, 1, DIM) + R(31.5, -1.5, 4, 1, DIM)
      : i === 1 ? R(28, -5, 9, 7, PURPLE) + R(28, -5, 9, 1.5, '#B39CE8') : ''
    out += `<g transform="translate(0,${feet[i]! - 15})"><g class="hw h${i}"><g class="hf h${i}f">` +
      `<g transform="scale(.25)">${clawd('idle', null, HELPER_TINTS[i])}</g>${carry}</g></g></g>`
  }
  return out
}

// ---------- scene CSS ----------

// Pose rules are keyed on the station (.s-<station>), so Read and Web, or Edit and Write, can differ.
const St = (st: Station | readonly Station[], sel: string, decl: string): string =>
  (typeof st === 'string' ? [st] : st).map((x) => `.s-${x} .me ${sel}`).join(',') + `{${decl}}`
const legs = (st: Station, d: number): string =>
  `.s-${st} .me .l0,.s-${st} .me .l2{animation:step ${d}s infinite}.s-${st} .me .l1,.s-${st} .me .l3{animation:step ${d}s ${d / 2}s infinite}`
const FLIP = 'transform:translateX(72px) scaleX(-1)'
const DESK = ['coding', 'write', 'running', 'test', 'git'] as const

// Where Clawd is and what he does: moods stay as they are (quips, stats and the game use them) and
// the activity picks the station inside the mood. error, happy and done keep their own spots.
export function stationOf(mood: Mood, activity: Activity): Station {
  if (mood === 'coding') return activity === 'write' ? 'write' : 'coding'
  if (mood === 'reading') return activity === 'web' ? 'web' : activity === 'read' ? 'reading' : 'scan'
  if (mood === 'running') return activity === 'test' ? 'test' : activity === 'git' ? 'git' : activity === 'terraform' ? 'crane' : 'running'
  if (mood === 'working') return activity === 'agent' ? 'agent' : activity === 'skill' ? 'skill' : 'working'
  return mood
}

// Where each station's scene starts Clawd (its .wk translateX at t=0), for walking between scenes.
export const SPOTS: Record<Station, number> = {
  idle: 102, thinking: 100, coding: 208, write: 208, running: 208, test: 208, git: 208, error: 208,
  reading: 10, scan: 10, web: 160, crane: 108, agent: 150, skill: 128, working: 102, done: 150, happy: 150, sleeping: 112,
}

// ---------- motion model: where Clawd is at any moment of a scene ----------
// Mirrors the .wk keyframes below, so a scene change can start the walk from where Clawd really
// stands (mid-wander, mid-pace) instead of from the previous scene's start spot.

type Track = { secs: number; keys: ReadonlyArray<readonly [number, number]> }

const TRACKS: Partial<Record<Station, Track>> = {
  idle: { secs: 28, keys: [[0, 102], [0.12, 102], [0.42, 176], [0.58, 176], [0.88, 102], [1, 102]] },
  thinking: { secs: 8, keys: [[0, 100], [0.5, 172], [1, 100]] },
  scan: { secs: 6, keys: [[0, 10], [0.5, 26], [1, 10]] },
  working: { secs: 7, keys: [[0, 102], [0.14, 102], [0.44, 200], [0.58, 200], [0.88, 102], [1, 102]] },
}

// How high Clawd's body sits in each scene (the .lf offset): up on the stool at the desk, sunk into the bed.
const LIFT: Partial<Record<Station, number>> = { coding: -20, write: -20, running: -20, test: -20, git: -20, error: -20, sleeping: 3 }

// CSS cubic-bezier(x1,y1,x2,y2) as a function of progress, solved by bisection (plenty for pixels).
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number): number => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
  return (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (at(x1, x2, mid) < t) lo = mid
      else hi = mid
    }
    return at(y1, y2, (lo + hi) / 2)
  }
}

const EASE_IN_OUT = bezier(0.42, 0, 0.58, 1)
const WALK_EASE = bezier(0.4, 0, 0.3, 1)

function trackAt(track: Track, secs: number): number {
  const p = ((secs / track.secs) % 1 + 1) % 1
  const keys = track.keys
  for (let i = 1; i < keys.length; i++) {
    const [p1, x1] = keys[i]!
    const [p0, x0] = keys[i - 1]!
    if (p <= p1) return p1 === p0 ? x1 : x0 + (x1 - x0) * EASE_IN_OUT((p - p0) / (p1 - p0))
  }
  return keys[keys.length - 1]![1]
}

export type Walk = { dx: number; dy: number }

export function walkSecs(walk: Walk): number {
  return Math.min(1.6, 0.45 + Math.hypot(walk.dx, walk.dy) / 210)
}

// Where Clawd stands `secs` into a scene at station `st` (a Mood works too) that began with `walk`
// (an offset that eases away).
export function clawdAt(st: Station, secs: number, walk?: Walk): { x: number; y: number } {
  const track = TRACKS[st]
  let x = track ? trackAt(track, Math.max(0, secs)) : SPOTS[st]
  let y = LIFT[st] ?? 0
  if (walk && (walk.dx !== 0 || walk.dy !== 0)) {
    const left = 1 - WALK_EASE(Math.max(0, secs) / walkSecs(walk))
    x += walk.dx * left
    y += walk.dy * left
  }
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
}

// The walk from where Clawd stood in the previous scene: the offset eases away while the legs
// step, with a little hop when the height changes (onto the stool, into bed), and Clawd faces
// the way he walks.
// Asleep, Clawd sinks LIFT.sleeping into the bed: his feet would poke out below the bed front (which ends
// on the floor line), so nothing of him is drawn below the floor.
function sunk(id: string, clawdGroup: string): string {
  return `<clipPath id="${id}f"><rect x="0" y="-60" width="${W}" height="${FLOOR_Y + 60}"/></clipPath><g clip-path="url(#${id}f)">${clawdGroup}</g>`
}

function arrival(walk: Walk): string {
  const { dx, dy } = walk
  const t = walkSecs(walk)
  const name = `arr${dx < 0 ? 'm' : 'p'}${Math.abs(dx)}${dy < 0 ? 'm' : 'p'}${Math.abs(dy)}`
  const hop = dy === 0 ? '' : `55%{transform:translate(${n(dx * 0.3)}px,${n(Math.min(dy, 0) * 0.45 - 8)}px)}`
  const steps = Math.max(1, Math.round(t / 0.24))
  return `@keyframes ${name}{from{transform:translate(${dx}px,${dy}px)}${hop}to{transform:translate(0,0)}}` +
    `.arr{animation:${name} ${n(t)}s cubic-bezier(.4,0,.3,1) both}` +
    (dx > 8 ? `@keyframes afl{from,to{${FLIP}}}.af{animation:afl ${n(t * 0.85)}s step-end}` : '') +
    `.arr .l0,.arr .l2{animation:step .24s ease-in-out ${steps}}` +
    `.arr .l1,.arr .l3{animation:step .24s .12s ease-in-out ${steps}}`
}

// ---------- phase: a redraw continues the animations instead of restarting them ----------
// The pane draws the SVG in a frame that reloads whenever its source changes (a new scene, the
// clock's minute, a combo tier), and a reload starts every CSS animation from 0: Clawd would jump
// back to the start of his wander, the clouds to their first spot. phaseSvg moves each animation's
// delay back by how long it has been running, so the new frame picks up where the old one was.
// Clawd and everything that belongs to the scene run on scene time; the room runs on wall time.

const SCENE_CLASSES = new Set([
  'me', 'arr', 'af', 'wk', 'fc', 'lf', 'po', 'crab', 'aL', 'aR', 'lg', 'l0', 'l1', 'l2', 'l3', 'ey', 'hat', 'halo', 'prop', 'tw2',
  'd0', 'd1', 'd2', 'gear', 'ht', 'zz', 'pf', 'fl', 'sk', 'au', 'pg', 'cf', 'sm', 'pin', 'pout', 'dimIn', 'wake',
  'wv', 'alr', 'hl', 'tb', 'sb', 'gl', 'sp', 'pop', 'hd', 'mgh', 'spn', 'bn', 'lev', 'pl', 'ty', 'bko', 'bki',
  'fw', 'bnr', 'esb', ...HAT_CLASSES,
])
const ABSOLUTE_CLASSES = new Set(['hh', 'mn']) // the clock hands are drawn at the real time already
const METER_SHOTS = new Set(['pdr', 'pfl', 'hgf', 'cdf']) // one-shot meter changes run on the meter clock

const TIME = /^(-?\d*\.?\d+)(m?s)$/

function splitTop(text: string, sep: RegExp): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth === 0 && sep.test(ch)) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

const secsOf = (token: string): number => {
  const m = TIME.exec(token)!
  return Number(m[1]) / (m[2] === 'ms' ? 1000 : 1)
}

// How long one loop of an animation runs (alternate: there and back), 0 for one that ends.
function loopOf(tokens: readonly string[], duration?: number): number {
  if (!tokens.includes('infinite')) return 0
  const dur = duration ?? secsOf(tokens.find((t) => TIME.test(t)) ?? '0s')
  if (!(dur > 0)) return 0
  return tokens.some((t) => t === 'alternate' || t === 'alternate-reverse') ? dur * 2 : dur
}

// A loop resumes at the same point after any whole number of loops, so a wall-clock shift is kept
// under one loop: the wall clock can then run on (no hourly wrap that would make every loop jump).
// Scene and meter time start at a scene or meter change and need no wrap.
const wrapBy = (by: number, loop: number): number => (loop > 0 ? by % loop : by)

function shiftAnimation(value: string, by: number, wrap: boolean): string {
  return splitTop(value, /,/).map((one) => {
    const tokens = splitTop(one.trim(), /\s/).filter((t) => t !== '')
    const times = tokens.map((t, i) => (TIME.test(t) ? i : -1)).filter((i) => i >= 0)
    if (times.length === 0) return one
    const b = wrap ? wrapBy(by, loopOf(tokens)) : by
    if (times.length >= 2) tokens[times[1]!] = `${n(secsOf(tokens[times[1]!]!) - b)}s`
    else tokens.splice(times[0]! + 1, 0, `${n(-b)}s`)
    return tokens.join(' ')
  }).join(',')
}

// The animations a class runs, by the shorthand of its CSS rule (an inline animation-delay
// shifts by the loop of the animation the class gives it).
type Loops = Map<string, string[][]>

function loopsOf(css: string): Loops {
  const out: Loops = new Map()
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const shorthand = /(?:^|;)\s*animation\s*:\s*([^;}"]+)/.exec(m[2]!)
    const cls = [...m[1]!.matchAll(/\.([\w-]+)/g)].map((c) => c[1]!).pop()
    if (!shorthand || !cls) continue
    const anims = splitTop(shorthand[1]!, /,/).map((one) => splitTop(one.trim(), /\s/).filter((t) => t !== ''))
    const known = out.get(cls)
    // two rules that give a class different animations: no loop is sure, the shift is not wrapped
    out.set(cls, known && JSON.stringify(known) !== JSON.stringify(anims) ? [] : anims)
  }
  return out
}

// `anims` (wall clock only): the animations the element's classes run, to keep each shift under one loop.
function shiftDecls(decls: string, by: number, anims?: string[][]): string {
  if (by === 0) return decls
  const durations = /animation-duration\s*:\s*([^;}"]+)/.exec(decls)?.[1]
  const durationAt = (i: number): number | undefined => {
    const list = durations ? splitTop(durations, /,/).map((v) => v.trim()) : []
    const v = list.length > 0 ? list[i % list.length]! : undefined
    return v !== undefined && TIME.test(v) ? secsOf(v) : undefined
  }
  return decls.replace(/(animation|animation-delay)\s*:\s*([^;}"]+)/g, (_, prop: string, value: string) =>
    prop === 'animation' ? `animation:${shiftAnimation(value, by, anims !== undefined)}` : `animation-delay:${splitTop(value, /,/).map((v, i) => {
      const tokens = anims && anims.length > 0 ? anims[i % anims.length]! : []
      return `${n(secsOf(v.trim()) - wrapBy(by, loopOf(tokens, durationAt(i))))}s`
    }).join(',')}`)
}

function clockOf(classes: readonly string[], selector: string): 'scene' | 'wall' | 'meter' | 'none' {
  if (classes.some((c) => ABSOLUTE_CLASSES.has(c))) return 'none'
  if (classes.some((c) => METER_SHOTS.has(c))) return 'meter'
  if (selector.includes('.m-') || selector.includes('.s-') || classes.some((c) => SCENE_CLASSES.has(c))) return 'scene'
  return 'wall'
}

export function phaseSvg(svg: string, sceneSecs: number, wallSecs: number, meterSecs = 0): string {
  const by = { scene: Math.max(0, sceneSecs), wall: Math.max(0, wallSecs), meter: Math.max(0, meterSecs), none: 0 }
  if (by.scene === 0 && by.wall === 0 && by.meter === 0) return svg
  const loops = loopsOf(/<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '')
  const animsOf = (classes: readonly string[]): string[][] => classes.map((c) => loops.get(c) ?? []).find((a) => a.length > 0) ?? []
  return svg
    .replace(/<style>([\s\S]*?)<\/style>/, (_, css: string) =>
      `<style>${css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, sel: string, decls: string) => {
        if (!decls.includes('animation')) return rule
        const classes = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!)
        const clock = clockOf(classes, sel)
        return `${sel}{${shiftDecls(decls, by[clock], clock === 'wall' ? animsOf(classes) : undefined)}}`
      })}</style>`)
    .replace(/<[a-z]+ [^>]*style="[^"]*animation[^"]*"[^>]*>/g, (tag) => {
      const classes = (/class="([^"]+)"/.exec(tag)?.[1] ?? '').split(/\s+/)
      const clock = clockOf(classes, '')
      return tag.replace(/style="([^"]*)"/, (_, st: string) => `style="${shiftDecls(st, by[clock], clock === 'wall' ? animsOf(classes) : undefined)}"`)
    })
}

const SCENE_CSS = SPRITE_CSS + `
@keyframes wander{0%,12%{transform:translateX(102px)}42%,58%{transform:translateX(176px)}88%,100%{transform:translateX(102px)}}
@keyframes wanderF{0%{transform:none}58%{${FLIP}}88%{transform:none}}
@keyframes pace{0%,100%{transform:translateX(100px)}50%{transform:translateX(172px)}}
@keyframes paceF{0%{transform:none}50%{${FLIP}}}
@keyframes errand{0%,14%{transform:translateX(102px)}44%,58%{transform:translateX(200px)}88%,100%{transform:translateX(102px)}}
@keyframes errandF{0%{transform:none}58%{${FLIP}}88%{transform:none}}
.s-idle .me .wk{animation:wander 28s ease-in-out infinite}
.s-idle .me .fc{animation:wanderF 28s step-end infinite}
${St('idle', '.crab', 'animation:float 3.4s ease-in-out infinite')}
${St('idle', '.ey', 'animation:blink 4.5s infinite')}
${St('idle', '.aL', 'animation:sway 3.4s ease-in-out infinite')}
${legs('idle', 0.7)}
.s-thinking .me .wk{animation:pace 8s ease-in-out infinite}
.s-thinking .me .fc{animation:paceF 8s step-end infinite}
${legs('thinking', 0.7)}
${St('thinking', '.ey', 'animation:lookUp 2.6s ease-in-out infinite')}
${St('thinking', '.aR', 'animation:chin 2.6s ease-in-out infinite')}
${St([...DESK, 'error'], '.wk', 'transform:translateX(208px)')}
${St([...DESK, 'error'], '.lf', 'transform:translateY(-20px)')}
${St(['coding', 'write'], '.aL', 'animation:tap .3s ease-in-out infinite')}
${St(['coding', 'write'], '.aR', 'animation:tap .3s .15s ease-in-out infinite')}
${St(['coding', 'write'], '.crab', 'animation:bob .6s ease-in-out infinite')}
${St(['coding', 'write', 'git'], '.ey', 'animation:blink 3.8s infinite')}
@keyframes cmd{0%,30%,100%{transform:translateY(0)}5%,15%,25%{transform:translateY(5px)}10%,20%{transform:translateY(0)}}
${St('running', '.aL', 'animation:cmd 2.4s ease-in-out infinite')}
${St('running', '.aR', 'animation:cmd 2.4s .05s ease-in-out infinite')}
${St(['running', 'test', 'git'], '.crab', 'animation:bob 1.2s ease-in-out infinite')}
${St(['running', 'test'], '.ey', 'animation:look 1.8s ease-in-out infinite')}
@keyframes pump{0%,24%,100%{transform:none}10%,16%{transform:translateY(-8px) rotate(-40deg)}}
${St('test', '.aR', 'animation:pump 3.6s ease-in-out infinite')}
${St('test', '.aL', 'animation:tap .6s ease-in-out infinite')}
@keyframes throw{0%,16%,100%{transform:none}7%{transform:translateY(-6px) rotate(45deg)}}
${St('git', '.aL', 'animation:throw 3s ease-in-out infinite')}
${St('git', '.aR', 'animation:tap .6s ease-in-out infinite')}
@keyframes pl{0%,8%{transform:translate(0,0) scale(1);opacity:0}14%{opacity:1}50%{transform:translate(-10px,-56px) rotate(-6deg) scale(.85);opacity:1}85%{transform:translate(-14px,-100px) rotate(4deg) scale(.5);opacity:1}100%{transform:translate(-14px,-108px) scale(.4);opacity:0}}
.pl{transform-box:fill-box;transform-origin:center;animation:pl 3s ease-in-out infinite}
${St('reading', '.wk', 'transform:translateX(10px)')}
${St('reading', '.ey', 'animation:look 1.6s ease-in-out infinite')}
.s-reading .me .crab,.s-reading .me .hd{animation:float 2.6s ease-in-out infinite}
@keyframes pg{0%,55%{transform:scaleX(1)}75%{transform:scaleX(0)}76%,100%{transform:scaleX(-1)}}
.pg{animation:pg 3s ease-in infinite}
@keyframes scan{0%,100%{transform:translateX(10px)}50%{transform:translateX(26px)}}
.s-scan .me .wk{animation:scan 6s ease-in-out infinite}
${legs('scan', 0.6)}
${St('scan', '.aR', 'transform:translateY(-3px) rotate(-25deg)')}
${St('scan', '.ey', 'animation:blink 3s infinite')}
@keyframes peer{0%,100%{transform:translate(0,0)}50%{transform:translate(-2px,-2px)}}
.mgh{animation:peer 1.5s ease-in-out infinite}
@keyframes spn{0%,100%{transform:translateX(0)}50%{transform:translateX(52px)}}
.spn{animation:spn 6s ease-in-out infinite}
${St('web', '.wk', 'transform:translateX(160px)')}
${St('web', '.aL', 'transform:translateY(-6px) rotate(35deg)')}
${St('web', '.aR', 'transform:translateY(-6px) rotate(-35deg)')}
@keyframes scout{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
.bn{transform-box:fill-box;transform-origin:50% 100%;animation:scout 3.2s ease-in-out infinite}
${St('crane', '.wk', 'transform:translateX(108px)')}
@keyframes crank{0%,100%{transform:none}10%,60%{transform:translateY(2px) rotate(20deg)}}
${St('crane', '.aR', 'animation:crank 4s ease-in-out infinite')}
${St('crane', '.ey', 'animation:lookUp 2s ease-in-out infinite')}
@keyframes lev{0%,100%{transform:none}10%,60%{transform:rotate(28deg)}}
.lev{transform-box:fill-box;transform-origin:50% 100%;animation:lev 4s ease-in-out infinite}
${St('agent', '.wk', 'transform:translateX(150px)')}
${St('agent', '.aR', 'transform:translateY(-2px) rotate(-15deg)')}
@keyframes point{0%,100%{transform:none}50%{transform:translateY(-6px) rotate(40deg)}}
${St('agent', '.aL', 'animation:point 1.6s ease-in-out infinite')}
${St('agent', '.ey', 'animation:look 1.6s ease-in-out infinite')}
${St('skill', '.wk', 'transform:translateX(128px)')}
${St('skill', '.aL', 'animation:cheerL 1.6s ease-in-out infinite')}
${St('skill', '.aR', 'animation:cheerR 1.6s .8s ease-in-out infinite')}
${St('skill', '.ey', 'animation:lookUp 2.4s ease-in-out infinite')}
.s-working .me .wk{animation:errand 7s ease-in-out infinite}
.s-working .me .fc{animation:errandF 7s step-end infinite}
${St('working', '.aL', 'animation:sway 1.2s ease-in-out infinite')}
${St('working', '.aR', 'animation:swayR 1.2s .6s ease-in-out infinite')}
${legs('working', 0.5)}
${St(['done', 'happy'], '.wk', 'transform:translateX(150px)')}
${St('done', '.crab', 'animation:jump .8s ease-in-out 4')}
${St('done', '.aL', 'animation:cheerL .4s ease-in-out infinite')}
${St('done', '.aR', 'animation:cheerR .4s ease-in-out infinite')}
.s-done .me .lf{animation:float 2.4s 3.2s ease-in-out infinite}
${St('error', '.crab', 'animation:shake .45s ease-in-out 3')}
${St('error', '.aL', 'animation:cheerL 1.2s ease-in-out infinite')}
${St('error', '.aR', 'animation:cheerR 1.2s ease-in-out infinite')}
.s-sleeping .me .wk{transform:translateX(112px)}
.s-sleeping .me .lf{transform:translateY(3px)}
${St('sleeping', '.crab', 'animation:breathe 4s ease-in-out infinite')}
.m-sleeping .room{filter:brightness(.55);animation:dimR 1.8s ease-in-out both}
@keyframes dimR{from{filter:brightness(1)}to{filter:brightness(.55)}}
@keyframes undimR{from{filter:brightness(.55)}to{filter:brightness(1)}}
.wake .room{animation:undimR 1.2s ease-in-out both}
.po{transform-box:fill-box;transform-origin:50% 100%}
@keyframes poz{0%{transform:scale(1.08,.88)}40%{transform:scale(.96,1.06)}70%{transform:scale(1.02,.98)}100%{transform:none}}
.po.pz{animation:poz .5s ease-out both}
@keyframes fin{from{opacity:0}to{opacity:1}}
@keyframes fout{from{opacity:1}to{opacity:0}}
.pin{animation:fin .45s ease-out both}
.pout{animation:fout .35s ease-in both}
${St('happy', '.crab', 'animation:hop .9s ease-in-out infinite')}
${St('happy', '.aL', 'animation:cheerL .45s ease-in-out infinite')}
${St('happy', '.aR', 'animation:cheerR .45s ease-in-out infinite')}
@keyframes twinkle{0%,100%{opacity:.15}50%{opacity:.9}}
.st{opacity:.4}.t0{animation:twinkle 3s infinite}.t1{animation:twinkle 4.2s 1s infinite}.t2{animation:twinkle 5s 2s infinite}.t3{animation:twinkle 3.6s .5s infinite}
.bl{animation:twinkle 6s infinite}
@keyframes drift{from{transform:translateX(-60px)}to{transform:translateX(110px)}}
.cl1{animation:drift 46s -12s linear infinite}.cl2{animation:drift 64s -40s linear infinite}
.ry{animation:twinkle 2.4s infinite}
@keyframes bird{0%{transform:translate(150px,40px)}100%{transform:translate(252px,30px)}}
.bird{animation:bird 14s linear infinite}
@keyframes steam{0%{transform:translateY(0);opacity:0}40%{opacity:.8}100%{transform:translateY(-10px);opacity:0}}
.stm{animation:steam 2.2s infinite}.s2{animation-delay:1.1s}
@keyframes leaf{0%,100%{transform:skewX(0)}50%{transform:skewX(-4deg)}}
.lfg{transform-box:fill-box;transform-origin:50% 100%;animation:leaf 5s ease-in-out infinite}
@keyframes curtain{0%,100%{transform:skewX(0)}50%{transform:skewX(1.6deg)}}
.ct{transform-box:fill-box;transform-origin:50% 0;animation:curtain 6s ease-in-out infinite}.ct2{animation-delay:-3s}
@keyframes led{0%,100%{opacity:1}50%{opacity:.35}}
.led{animation:led 2.4s ease-in-out infinite}
@keyframes hdd{0%,100%{opacity:.2}10%{opacity:1}20%{opacity:.3}35%{opacity:1}40%{opacity:.2}70%{opacity:.9}75%{opacity:.2}}
.hdd{animation:hdd 1.7s steps(1) infinite}
@keyframes scroll{from{transform:translateY(0)}to{transform:translateY(-72px)}}
.scr{animation:scroll 16s linear infinite}
.s-coding .scr,.s-write .scr{animation-duration:3.5s}.s-running .scr,.s-working .scr{animation-duration:7s}
@keyframes ty{0%{transform:scaleX(0)}15%,80%{transform:scaleX(1)}90%,100%{transform:scaleX(0)}}
.ty{transform-box:fill-box;transform-origin:0 50%;animation:ty 4.4s steps(6) infinite both}
@keyframes gsc{from{transform:translateY(0)}to{transform:translateY(-60px)}}
.gsc{animation:gsc 12s linear infinite}
@keyframes dsc{0%,20%{transform:translateY(0)}80%,100%{transform:translateY(-44px)}}
.dsc{animation:dsc 9s ease-in-out infinite alternate}
@keyframes hlt{0%{transform:translateY(0)}100%{transform:translateY(25px)}}
.hlt{animation:hlt 2.5s steps(5) infinite}
@keyframes wsc{0%,30%{transform:translateY(0)}70%,100%{transform:translateY(-12px)}}
.wsc{animation:wsc 5s ease-in-out infinite alternate}
@keyframes blinkc{0%,49%{opacity:1}50%,100%{opacity:0}}
.cur{animation:blinkc 1s steps(1) infinite}
@keyframes alr{0%,100%{opacity:.85}50%{opacity:.2}}
.alr{animation:alr .6s infinite}
@keyframes bx{from{transform:translateX(0)}to{transform:translateX(56px)}}
@keyframes by{from{transform:translateY(0)}to{transform:translateY(36px)}}
.ssx{animation:bx 7s linear infinite alternate}.ssy{animation:by 5s linear infinite alternate}
@keyframes pop{0%{opacity:0;transform:scale(.3)}12%{opacity:1;transform:scale(1.25)}20%,85%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}
.pop{transform-box:fill-box;transform-origin:center;animation:pop 3.6s infinite both}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.prg{transform-box:fill-box;transform-origin:0 50%;animation:grow 3.6s linear infinite}
@keyframes pkt{0%{transform:translateY(0);opacity:0}15%,85%{opacity:1}100%{transform:translateY(7px);opacity:0}}
.pkt{animation:pkt 1.35s linear infinite}
@keyframes bars{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.45)}}
.bar{transform-box:fill-box;transform-origin:50% 100%;animation:bars 2.2s ease-in-out infinite}
@keyframes lava{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
.lv1{animation:lava 7s ease-in-out infinite}.lv2{animation:lava 5s -2s ease-in-out infinite reverse}
@keyframes jk{0%,100%{opacity:1}40%{opacity:.55}60%{opacity:.9}}
.jk{animation:jk 1.3s steps(3) infinite}
@keyframes lights{0%,100%{opacity:1}50%{opacity:.25}}
.lt0{animation:lights 1.8s steps(2) infinite}.lt1{animation:lights 1.8s .6s steps(2) infinite}.lt2{animation:lights 1.8s 1.2s steps(2) infinite}
@keyframes snow{from{transform:translate(0,0)}to{transform:translate(6px,88px)}}
.sn{animation:snow 6s linear infinite}
@keyframes bat{0%,100%{transform:translate(166px,64px)}25%{transform:translate(192px,34px)}50%{transform:translate(236px,50px)}75%{transform:translate(206px,74px)}}
.bat{animation:bat 9s ease-in-out infinite}
@keyframes bfly{0%,100%{transform:translate(170px,70px)}30%{transform:translate(214px,44px)}60%{transform:translate(236px,72px)}80%{transform:translate(190px,50px)}}
.bfly{animation:bfly 11s ease-in-out infinite}
@keyframes wing{0%,49%{opacity:1}50%,100%{opacity:0}}
.w1{animation:wing .3s steps(1) infinite}.w2{animation:wing .3s .15s steps(1) infinite}
@keyframes lf1{0%{transform:translate(170px,14px) rotate(0)}25%{transform:translate(184px,34px) rotate(40deg)}50%{transform:translate(172px,54px) rotate(-20deg)}75%{transform:translate(188px,74px) rotate(30deg)}100%{transform:translate(178px,100px) rotate(0)}}
.leaf1{animation:lf1 8s linear infinite}.lf-b{animation-delay:-4s;animation-duration:10s}
@keyframes bko{from{transform:none;opacity:1}to{transform:translate(6px,-10px);opacity:0}}
.bko{animation:bko .8s .3s ease-in both}
@keyframes bki{from{transform:translate(6px,-10px);opacity:0}to{transform:none;opacity:1}}
.bki{animation:bki .6s ease-out both}
@keyframes hover{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.sb{animation:hover 3s ease-in-out infinite}
@keyframes glowp{0%,100%{opacity:.15}50%{opacity:.45}}
.gl{animation:glowp 2s ease-in-out infinite}
@keyframes spark{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-18px);opacity:0}}
.sp{animation:spark 2.4s linear infinite}
@keyframes wv{0%,100%{opacity:.1}30%{opacity:1}60%{opacity:.1}}
.wv{animation:wv 1.5s infinite}
@keyframes drop{0%{transform:translateY(0);opacity:0}8%{opacity:1}60%,88%{transform:translateY(32px);opacity:1}94%,100%{transform:translateY(32px);opacity:0}}
.tb{animation:drop 4s ease-in infinite}
@keyframes hline{0%{transform:scaleY(.17)}60%,88%{transform:scaleY(1)}100%{transform:scaleY(.17)}}
.hl{transform-box:fill-box;transform-origin:50% 0;animation:hline 4s ease-in infinite}
@keyframes mote{0%,100%{transform:translate(0,0);opacity:.1}50%{transform:translate(4px,-8px);opacity:.7}}
.mt{animation:mote 6s ease-in-out infinite}
@keyframes lmp{0%,100%{opacity:.16}50%{opacity:.2}}
.lmp{animation:lmp 4s ease-in-out infinite}
.sm{animation:puff 1.8s ease-out infinite}
@keyframes au{0%,100%{opacity:.08}50%{opacity:.2}}
.au{animation:au 1.6s ease-in-out infinite}
@keyframes fall{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(${H + 24}px) rotate(540deg)}}
.cf{transform-box:fill-box;transform-origin:center;animation:fall 2.6s linear 2 both}
@keyframes h0{0%{transform:translateX(30px)}45%,50%{transform:translateX(300px)}95%,100%{transform:translateX(30px)}}
@keyframes h0f{0%{transform:none}47%{transform:translateX(36px) scaleX(-1)}97%{transform:none}}
@keyframes h1{0%{transform:translateX(340px)}40%,55%{transform:translateX(120px)}95%,100%{transform:translateX(340px)}}
@keyframes h1f{0%{transform:translateX(36px) scaleX(-1)}55%{transform:none}97%{transform:translateX(36px) scaleX(-1)}}
@keyframes h2{0%{transform:translateX(150px)}45%,50%{transform:translateX(360px)}95%,100%{transform:translateX(150px)}}
.hw.h0{animation:h0 12s ease-in-out infinite}.hf.h0f{animation:h0f 12s step-end infinite}
.hw.h1{animation:h1 9s ease-in-out infinite}.hf.h1f{animation:h1f 9s step-end infinite}
.hw.h2{animation:h2 7s -3s ease-in-out infinite}.hf.h2f{animation:h0f 7s -3s step-end infinite}
.hp .l0,.hp .l2{animation:step .28s infinite}.hp .l1,.hp .l3{animation:step .28s .14s infinite}
.hp .crab{animation:bob .28s ease-in-out infinite}
.skw{animation:tw 1.4s ease-in-out infinite}
@keyframes shs{0%{transform:translate(0,0);opacity:0}3%{opacity:1}14%,100%{transform:translate(-34px,17px);opacity:0}}
.shs{animation:shs 9s ease-in infinite}
@keyframes fw{0%{transform:scale(.1);opacity:0}8%{opacity:1}55%{transform:scale(1);opacity:1}100%{transform:scale(1.2);opacity:0}}
.fw{transform-box:fill-box;transform-origin:center;animation:fw 1.8s ease-out infinite both}
@keyframes bnr{0%{transform:translateY(-14px) scale(.6);opacity:0}10%{transform:none;opacity:1}88%{transform:none;opacity:1}100%{transform:none;opacity:0}}
.bnr{transform-box:fill-box;transform-origin:center;animation:bnr 8s ease-out both}
@keyframes esb{0%{transform:scale(.2);opacity:0}15%{transform:scale(1.15);opacity:1}30%,80%{transform:scale(1);opacity:1}100%{transform:scale(1.3);opacity:0}}
.esb{transform-box:fill-box;transform-origin:center;animation:esb 1.5s ease-out 2 both}
.m-sleeping .cmp{filter:brightness(.55)}
`

// ---------- per-scene CSS ----------
// The full sheet is ~16 KB; a scene only needs the rules whose classes all occur in its body (which
// drops the other moods' rules, as only one m-<mood> class is present) and the keyframes they use.

type CssRule =
  | { kind: 'keep'; text: string }
  | { kind: 'keyframes'; name: string; text: string }
  | { kind: 'rule'; parts: Array<{ text: string; classes: string[] }>; body: string }

function parseCss(css: string): CssRule[] {
  const rules: CssRule[] = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const sel = css.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    const text = sel + css.slice(open, j)
    const kf = /^@keyframes\s+([\w-]+)$/.exec(sel)
    if (kf) rules.push({ kind: 'keyframes', name: kf[1]!, text })
    else if (sel.startsWith('@') || /[()[\]:]/.test(sel) || !sel.includes('.')) rules.push({ kind: 'keep', text })
    else {
      const parts = sel.split(',').map((p) => ({ text: p.trim(), classes: [...p.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!) }))
      rules.push({ kind: 'rule', parts, body: css.slice(open, j) })
    }
    i = j
  }
  return rules
}

const SCENE_RULES = parseCss(SCENE_CSS + DECOR_CSS + METER_CSS + ROOM_CSS)

// Reduced motion (B57): the room's ambient animation stops and error blinks slow down; Clawd, his walk
// and the one-shot meter changes keep moving. Built last, so it beats every sheet above it, and only
// for the classes the scene uses.
const REDUCED = new Set([
  'cl1', 'cl2', 'mt', 'ct', 'lfg', 'lt0', 'lt1', 'lt2', 't0', 't1', 't2', 't3', 'bl', 'ry', 'sn', 'bird', 'bat', 'bfly', 'leaf1',
  'scr', 'gsc', 'dsc', 'wsc', 'au', 'cf', 'sk', 'skw', 'lmp', 'bar', 'lv1', 'lv2', 'stm', 'jk', 'hdd', 'prop', 'tw2', 'halo',
  'shs', 'fw', 'bnr', 'esb', ...DECOR_CLASSES, ...HAT_CLASSES, ...ROOM_CLASSES, ...METER_CLASSES,
])

function reducedCss(present: ReadonlySet<string>): string {
  const stop = [...REDUCED].filter((c) => present.has(c)).map((c) => `.${c}`)
  const slow = present.has('alr') ? '.alr{animation-duration:2.4s}' : ''
  return stop.length || slow ? `@media (prefers-reduced-motion:reduce){${stop.length ? `${stop.join(',')}{animation:none!important}` : ''}${slow}}` : ''
}

function classesOf(body: string): Set<string> {
  const present = new Set<string>()
  for (const m of body.matchAll(/class="([^"]+)"/g)) for (const c of m[1]!.split(/\s+/)) present.add(c)
  return present
}

function sceneCss(body: string, present: ReadonlySet<string>): string {
  const kept: string[] = []
  let used = ''
  for (const rule of SCENE_RULES) {
    if (rule.kind === 'keep') {
      kept.push(rule.text)
      used += rule.text
    } else if (rule.kind === 'rule') {
      const parts = rule.parts.filter((p) => p.classes.every((c) => present.has(c)))
      if (parts.length === 0) continue
      kept.push(parts.map((p) => p.text).join(',') + rule.body)
      used += rule.body
    }
  }
  for (const m of body.matchAll(/style="([^"]+)"/g)) used += m[1]
  const words = new Set(used.match(/[\w-]+/g) ?? [])
  let frames = ''
  for (const rule of SCENE_RULES) if (rule.kind === 'keyframes' && words.has(rule.name)) frames += rule.text
  return kept.join('') + frames
}

// ---------- input normalisation ----------

function num(v: unknown, lo: number, hi: number, d: number): number {
  const x = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : d
  return Math.min(hi, Math.max(lo, x))
}

function normMood(m: unknown): Mood {
  return MOODS.includes(m as Mood) ? (m as Mood) : 'idle'
}

function normActivity(a: unknown): Activity {
  return ACTIVITIES.includes(a as Activity) ? (a as Activity) : 'none'
}

function normHat(h: unknown): AnyHat {
  if (h !== null && typeof h === 'object') return sanitizeHat(h)
  return isCatalogHat(h) ? h : null
}

// The catalog ids per slot: anything else (an old save, a typo) shows the slot's default (B60).
const DECOR_IDS = new Map<DecorSlot, Set<string>>()
for (const item of DECOR) {
  if (!DECOR_IDS.has(item.slot)) DECOR_IDS.set(item.slot, new Set())
  DECOR_IDS.get(item.slot)!.add(item.id)
}

function normDecor(input: SceneInput): S['decor'] {
  const d = (input?.decor ?? {}) as Record<string, unknown>
  const out = autoDecor(num(input?.level, 1, 9999, 1))
  for (const slot of Object.keys(out) as DecorSlot[]) {
    const v = d[slot]
    if (typeof v === 'string' && DECOR_IDS.get(slot)?.has(v)) out[slot] = v
  }
  return out
}

const RESETS = /^(at \d{2}:\d{2}|[A-Z][a-z]{2} \d{2}:\d{2})$/

function normUsage(u: unknown): NormUsage {
  const o = (u !== null && typeof u === 'object' ? u : {}) as Record<string, unknown>
  const rec = (v: unknown): Record<string, unknown> | undefined => (v !== null && typeof v === 'object' ? v as Record<string, unknown> : undefined)
  const pct = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : undefined)
  const win = (v: unknown): NormUsage['fiveHour'] => {
    const w = rec(v)
    if (!w) return undefined
    const resets = typeof w.resets === 'string' && RESETS.test(w.resets) ? w.resets : undefined
    return { pct: pct(w.pct), ...(resets ? { resets } : {}) }
  }
  const step = (v: unknown): number | undefined =>
    v === -1 ? -1 : typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v / 5) * 5)) : undefined
  const c = rec(o.context)
  const f = rec(o.from) ?? {}
  return {
    context: c ? { pct: pct(c.pct), window: typeof c.window === 'number' && Number.isFinite(c.window) ? Math.min(1e7, Math.max(1000, c.window)) : 200000 } : undefined,
    fiveHour: win(o.fiveHour),
    sevenDay: win(o.sevenDay),
    compactions: num(o.compactions, 0, 99, 0),
    from: { context: step(f.context), fiveHour: step(f.fiveHour), sevenDay: step(f.sevenDay) },
  }
}

function norm(input: SceneInput): S {
  return {
    mood: normMood(input.mood),
    activity: normActivity(input.activity),
    hat: normHat(input.hat),
    hour: num(input.hour, 0, 23, 12),
    minute: num(input.minute, 0, 59, 0),
    month: num(input.month, 1, 12, 1),
    helpers: num(input.helpers, 0, 3, 0),
    combo: comboTier(num(input.combo, 0, 9999, 0)),
    trophies: num(input.trophies, 0, 999, 0),
    plantStage: num(input.plantStage, 0, 4, 0),
    level: num(input.level, 1, 9999, 1),
    coffee: num(input.coffee, 0, 3, 0),
    decor: normDecor(input),
    usage: normUsage(input?.usage),
    celebrate: CELEBRATIONS.includes(input?.celebrate as Celebration) ? input.celebrate : undefined,
  }
}

// ---------- public API ----------

export function sceneSvg(input: SceneInput, opts: { empty?: boolean } = {}): string {
  const s = norm(input)
  // Only the window's defs depend on these inputs; a stable id keeps the source stable.
  const id = 'cw' + hash(`${s.hour}:${s.month}`)
  const { mood } = s
  const station = stationOf(mood, s.activity)
  const badgeAt = badgeSpot(station)
  const helperCount = Math.max(s.helpers, s.activity === 'agent' ? 1 : 0)
  const fromMood = input?.fromMood === undefined ? undefined : normMood(input.fromMood)
  const fromActivity = input?.fromActivity === undefined ? undefined : normActivity(input.fromActivity)
  const fin = (v: unknown, lo: number, hi: number): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined
  const fromX = fin(input?.fromX, 0, 300)
  const fromY = fin(input?.fromY, -40, 40)
  const fromStation = fromMood === undefined ? undefined : stationOf(fromMood, fromActivity ?? 'none')
  const home = clawdAt(station, 0)
  const walk: Walk = {
    dx: fromX !== undefined && Math.abs(fromX - home.x) >= 4 ? Math.round(fromX - home.x) : 0,
    dy: fromY !== undefined && Math.abs(fromY - home.y) >= 2 ? Math.round(fromY - home.y) : 0,
  }
  const walking = walk.dx !== 0 || walk.dy !== 0
  // Pose squash and the overhead crossfade follow the station, so Read to Web or Edit to Write get them
  // too; what he now holds fades in once he has nearly arrived.
  const stationChanged = fromStation !== undefined && fromStation !== station

  const clawdGroup =
    `<g class="me" transform="translate(0,${FLOOR_Y - 30})">${walking ? '<g class="arr">' : ''}<g class="wk"><g class="lf">` +
    aura(s.combo) +
    `<g class="af"><g class="fc"><g class="po${stationChanged ? ' pz' : ''}"><g transform="scale(.5)">${clawd(mood, s.hat)}</g></g></g></g>` +
    (stationChanged && fromStation ? `<g class="pout">${overhead(fromStation)}</g>` : '') +
    (stationChanged ? `<g class="pin"${walking ? delay(walkSecs(walk) * 0.8) : ''}>${overhead(station)}</g>` : overhead(station)) +
    comboBadge(s.combo, badgeAt) +
    (s.celebrate === 'star' ? starBurst() : '') +
    `</g></g></g>${walking ? '</g>' : ''}`

  // Props crossfade when they differ (a new activity, or a station that shows them differently).
  const propsNow = props(s, station)
  const propsBefore = fromActivity === undefined ? propsNow : props({ ...s, activity: fromActivity }, fromStation ?? stationOf(mood, fromActivity))
  const sceneProps = propsBefore !== propsNow ? `<g class="pout">${propsBefore}</g><g class="pin">${propsNow}</g>` : propsNow
  const book = station === 'reading' ? (fromStation === 'reading' ? 'gone' : 'out') : fromStation === 'reading' ? 'back' : 'in'

  const { decor, level } = s
  const night = phaseOf(s.hour) === 'night'
  const companion = companionSvg(decor.companion, mood === 'sleeping')
  // Back to front; each slot falls back to its default art when its own draws nothing.
  const room =
    `<g class="room">` +
    ceilingSvg(decor.ceiling, night) +
    clock(decor.clock) +
    (posterSvg(decor.poster, level >= 20) || (decor.poster === 'space' ? poster(Math.max(5, level)) : '')) +
    wallSvg(decor.wall) +
    trophyShelf(s.trophies, level) +
    levelBadge(level) +
    (level >= 50 ? wainscot() : '') +
    floor() +
    (rugSvg(decor.rug) || (decor.rug === 'stripes' ? rug(Math.max(3, level)) : '')) +
    bookshelf(book, walking ? Math.max(0.3, walkSecs(walk) * 0.8 - 0.5) : undefined) +
    shelfTop(s.month, decor.shelf) + (decor.shelf === 'lava' ? '' : shelfSvg(decor.shelf)) +
    (plantSvg(decor.plant, s.plantStage) || plant(s.plantStage, s.month)) +
    stool() +
    desk(s, id) +
    meterSvg(s.usage, input?.day) +
    `</g>`

  const body = mergeRects(`<g class="cs m-${mood} s-${station} a-${s.activity}${fromMood === 'sleeping' && mood !== 'sleeping' ? ' wake' : ''}">` +
    windowSvg(id, s) +
    room +
    (bedSvg(decor.bed) || bedSvg('cushion')) +
    (companion ? `<g class="cmp">${companion}</g>` : '') +
    sceneProps +
    lightBeam(s.hour, level >= 100) +
    (mood === 'error' ? smoke() : '') +
    (opts.empty ? '' : mood === 'sleeping' ? sunk(id, clawdGroup) : clawdGroup) +
    (mood === 'sleeping' ? bedLipSvg(decor.bed) || bedLipSvg('cushion') : '') +
    (opts.empty ? '' : `<g class="hp">${helpers(helperCount)}</g>`) +
    (mood === 'done' ? confetti() : '') +
    (opts.empty ? '' : celebration(s.celebrate)) +
    `</g>`)

  const present = classesOf(body)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 1.3}" height="${H * 1.3}" style="background:transparent" shape-rendering="crispEdges">` +
    `<style>${sceneCss(body, present)}${clockCss(s.hour, s.minute)}${walking ? arrival(walk) : ''}${reducedCss(present)}</style>` + body + `</svg>`
}

// ---------- decor previews: the room, empty, cropped to one slot ----------

// Where each slot's pieces sit (x, y, width, height); a roommate is cropped to its own box (B66).
const DECOR_CROPS: Record<Exclude<DecorSlot, 'companion'>, readonly [number, number, number, number]> = {
  drink: [344, 164, 30, 34],
  plant: [74, 140, 44, 94],
  poster: [262, 18, 34, 50],
  rug: [94, 230, 158, 14],
  shelf: [6, 72, 76, 40],
  bed: [106, 190, 84, 46],
  lamp: [242, 148, 68, 50],
  clock: [98, 20, 38, 52], // stops at the left curtain (x 136)
  ceiling: [88, 0, 216, 20],
  wall: [14, 14, 90, 62],
  view: [148, 16, 104, 84],
}

// The left curtain starts at this x (the window art); the clocks end above this y.
const CURTAIN_X = 136
const CLOCK_BOTTOM = 68

export function decorCrop(slot: DecorSlot, companion?: string): readonly [number, number, number, number] | undefined {
  if (slot !== 'companion') return DECOR_CROPS[slot]
  const box = COMPANION_BOXES[companion ?? '']
  if (!box) return undefined
  const [x0, x1, y1] = [box[0] - 6, box[2] + 6, box[3] + 4]
  let y0 = box[1] - 8
  // a roommate left of the window shows no strip of curtain, and one under the clock no piece of it
  const right = box[2] <= CURTAIN_X ? Math.min(x1, CURTAIN_X) : x1
  const [cx, , cw] = DECOR_CROPS.clock
  if (box[1] >= CLOCK_BOTTOM && box[0] < cx + cw && box[2] > cx) y0 = Math.max(y0, CLOCK_BOTTOM)
  return [x0, y0, right - x0, y1 - y0]
}

// The room without Clawd, cropped to `slot`, at `scale` CSS px per room unit; '' for no roommate.
export function decorPreview(input: SceneInput, slot: DecorSlot, scale = 2): string {
  const crop = decorCrop(slot, input.decor?.companion)
  if (!crop) return ''
  const [x, y, w, h] = crop
  return sceneSvg({ ...input, mood: 'idle', activity: 'none' }, { empty: true })
    .replace(`viewBox="0 0 ${W} ${H}" width="${W * 1.3}" height="${H * 1.3}"`, `viewBox="${x} ${y} ${w} ${h}" width="${w * scale}" height="${h * scale}"`)
}

// The CSS size of a Decor-tab preview of a w x h crop, with `avail` px of pane width. A wide strip (the
// ceiling, the rug, the floor lane) gets a row of its own at the room's 1.3 px a unit, as far as the pane
// allows and never under 0.8, so a bunting and a welcome mat stay readable; any other piece fits an
// 88x64 box beside its buttons, at most 3x.
export function previewSize(w: number, h: number, avail: number): { width: number; height: number; isWide: boolean } {
  const isWide = w >= 3.5 * h
  const scale = isWide ? Math.max(0.8, Math.min(1.3, avail / w)) : Math.min(88 / w, 64 / h, 3)
  return { width: Math.round(w * scale), height: Math.round(h * scale), isWide }
}

// ---------- mini sprite for the one-line status row (64x40) ----------

const Q = (mood: Mood, sel: string, decl: string): string => `.qm-${mood} ${sel}{${decl}}`
// The status-row mini has no headroom above y 0: there (class qs) the done jump and the happy hop lift
// Clawd only this many sprite px, so the tallest hat (top -60, at y 20 and scale .3) stays inside the box.
export const MINI_LIFT = 6

const MINI_CSS = SPRITE_CSS + `
@keyframes qbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes qtap{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
@keyframes qmg{0%,100%{transform:translate(0,0)}50%{transform:translate(6px,2px)}}
${Q('idle', '.crab', 'animation:float 2.6s ease-in-out infinite')}
${Q('idle', '.ey', 'animation:blink 3.5s infinite')}
${Q('idle', '.aL', 'animation:sway 2.6s ease-in-out infinite')}
${Q('thinking', '.ey', 'animation:lookUp 2s ease-in-out infinite')}
${Q('thinking', '.aR', 'animation:chin 2s ease-in-out infinite')}
${Q('thinking', '.crab', 'animation:float 2s ease-in-out infinite')}
${Q('coding', '.aL', 'animation:qtap .26s ease-in-out infinite')}
${Q('coding', '.aR', 'animation:qtap .26s .13s ease-in-out infinite')}
${Q('coding', '.crab', 'animation:bob .52s ease-in-out infinite')}
${Q('reading', '.ey', 'animation:look 1.4s ease-in-out infinite')}
${Q('reading', '.crab', 'animation:float 2.2s ease-in-out infinite')}
${Q('running', '.aL', 'animation:qtap .5s ease-in-out infinite')}
${Q('running', '.aR', 'animation:qtap .5s .25s ease-in-out infinite')}
${Q('working', '.aL', 'animation:sway 1s ease-in-out infinite')}
${Q('working', '.aR', 'animation:swayR 1s .5s ease-in-out infinite')}
${Q('working', '.l0,.qm-working .l2', 'animation:step .4s infinite')}
${Q('working', '.l1,.qm-working .l3', 'animation:step .4s .2s infinite')}
${Q('done', '.crab', 'animation:jump .8s ease-in-out infinite')}
${Q('done', '.aL', 'animation:cheerL .4s ease-in-out infinite')}
${Q('done', '.aR', 'animation:cheerR .4s ease-in-out infinite')}
${Q('error', '.crab', 'animation:shake .45s ease-in-out infinite')}
${Q('sleeping', '.crab', 'animation:breathe 3.6s ease-in-out infinite')}
${Q('happy', '.crab', 'animation:hop .9s ease-in-out infinite')}
${Q('happy', '.aL', 'animation:cheerL .45s ease-in-out infinite')}
${Q('happy', '.aR', 'animation:cheerR .45s ease-in-out infinite')}
@keyframes qjump{0%,100%{transform:translateY(0)}35%{transform:translateY(-${MINI_LIFT}px)}70%{transform:translateY(0) scaleY(.88)}}
@keyframes qhop{0%,100%{transform:translateY(0)}12%{transform:translateY(0) scaleY(.88)}40%{transform:translateY(-${MINI_LIFT}px)}70%{transform:translateY(0)}}
.qs.qm-done .crab{animation:qjump .8s ease-in-out infinite}
.qs.qm-happy .crab{animation:qhop .9s ease-in-out infinite}
.qmg{animation:qmg 1.6s ease-in-out infinite}
.qcur{animation:dot .8s steps(2) infinite}
.qtb{animation:qbob .5s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){${['prop', 'tw2', 'halo', ...HAT_CLASSES].map((c) => `.${c}`).join(',')}{animation:none!important}}
`

// The wardrobe mirror shows the same sprite with 12 units of headroom, so the tallest hat (and a
// custom hat of 8 rows) still fits while Clawd hops (B55).
export const MIRROR_RATIO = 52 / 64

export function miniSvg(input: { mood: Mood; activity: Activity; hat: AnyHat }, opts: { mirror?: boolean } = {}): string {
  const mood = normMood(input?.mood)
  const activity = normActivity(input?.activity)
  const hat = normHat(input?.hat)
  // Clawd box at scale .3: 43x18, placed at (10,20); local fx coordinates below are relative to that.
  let fx = ''
  switch (mood) {
    case 'thinking':
      fx = R(40, -12, 3, 3, DIM, cls('d0')) + R(45, -12, 3, 3, DIM, cls('d1')) + R(50, -12, 3, 3, DIM, cls('d2'))
      break
    case 'coding': case 'running': {
      // at the little monitor: a prompt, a check, a branch, a block or code
      const scr = activity === 'shell'
        ? glyphs('>', 46.5, 7, 0.8, TERM) + R(49.5, 10, 2.5, 0.8, TERM, cls('qcur'))
        : activity === 'test' ? pmap(['..1', '1.1', '.1.'], 46.5, 8, 1.2, { '1': TERM })
        : activity === 'git' ? R(47, 7.5, 1.5, 6, ORANGE) + R(49.5, 9, 2, 2, ORANGE)
        : activity === 'terraform' ? R(46.5, 8, 5, 4, PURPLE)
        : R(46, 7.5, 4, 1, ORANGE) + R(47, 9.5, 5, 1, BLUE) + R(46, 11.5, 3, 1, GREEN)
      fx = R(44, 5, 10, 9, METAL) + R(45, 6, 8, 7, SCREEN) + scr + R(41, 14, 15, 2, METAL_D)
      break
    }
    case 'reading':
      fx = activity === 'web'
        ? R(11, 1, 5, 6, '#2E2E33') + R(27.5, 1, 5, 6, '#2E2E33') + R(16, 3, 11.5, 2, METAL_D)
        : activity === 'search'
        ? `<g class="qmg">${pmap(['.xxx.', 'x...x', 'x...x', 'x...x', '.xxx.'], 18, 4, 1.6, { x: SILVER })}${R(25, 11, 2, 2, WOOD)}${R(26.6, 12.6, 2, 2, WOOD)}</g>`
        : `<g transform="scale(.6)">${R(14, 12, 44, 14, '#C9A45B')}${R(16, 11, 19, 13, PAPER)}${R(37, 11, 19, 13, '#D8D5C8')}${R(35, 11, 2, 14, '#9A8F7A')}<g class="pg fbL">${R(37, 11, 19, 13, PAPER)}</g></g>`
      break
    case 'working':
      fx = `<g transform="translate(50,-6)"><g class="gear fb">${R(-2, -5, 4, 10, DIM)}${R(-5, -2, 10, 4, DIM)}${R(-4, -4, 8, 8, DIM)}${R(-1, -1, 2, 2, SCREEN)}</g></g>`
      break
    case 'done':
      fx = [[-6, -4], [46, -10], [50, 8]].map(([x, y], i) =>
        `<g class="sk"${delay(i * 0.3)}>${R(x! + 1.2, y!, 1.2, 3.6, '#F6D365')}${R(x!, y! + 1.2, 3.6, 1.2, '#F6D365')}</g>`).join('')
      break
    case 'error':
      fx = R(40, -8, 4, 4, DIM, cls('pf')) + R(46, -12, 5, 5, DIM, ` class="pf" style="animation-delay:.45s"`)
      break
    case 'sleeping':
      fx = `<g transform="translate(42,-4)"><g class="zz">${pmap(ZED, 0, 0, 1, { '1': BLUE })}</g></g>` +
        `<g transform="translate(46,-8)"><g class="zz"${delay(1.5)}>${pmap(ZED, 0, 0, 1.3, { '1': BLUE })}</g></g>`
      break
    case 'happy':
      fx = `<g transform="translate(44,-4)"><g class="ht">${pmap(HEART, 0, 0, 1.1, { h: PINK, w: '#FFC4CF' })}</g></g>` +
        `<g transform="translate(-6,-2)"><g class="ht"${delay(1.2)}>${pmap(HEART, 0, 0, 0.9, { h: PINK, w: '#FFC4CF' })}</g></g>`
      break
    default:
      break
  }
  if (activity === 'agent' && mood !== 'running') {
    fx += `<g transform="translate(-9,10)"><g class="qtb"><g transform="scale(.12)">${clawd('idle', null, HELPER_TINTS[0])}</g></g></g>`
  }
  if (activity === 'web' && mood !== 'coding') {
    fx += `<g fill="none" stroke="${TERM}" stroke-width="1" shape-rendering="auto"><path class="d0" d="M52 6a3 3 0 0 0 -3 -3"/><path class="d1" d="M55 6a6 6 0 0 0 -6 -6"/></g>`
  }
  const box = opts.mirror ? 'viewBox="0 -12 64 52" width="64" height="52"' : 'viewBox="0 0 64 40" width="64" height="40"'
  return `<svg xmlns="http://www.w3.org/2000/svg" ${box} style="background:transparent" shape-rendering="crispEdges">` +
    `<style>${MINI_CSS}</style>` +
    mergeRects(`<g class="cm qm-${mood}${opts.mirror ? '' : ' qs'}"><g transform="translate(10,20)"><g transform="scale(.3)">${clawd(mood, hat)}</g>${fx}</g></g>`) + `</svg>`
}
