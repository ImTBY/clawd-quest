// Usage meters woven into the room (coordinates in scene.ts's 400x260 room): a paper stack on the desk
// (context), an hourglass on the window sill (5-hour limit), a wall calendar (weekly limit) and an
// archive box under the desk (compactions). Each object is one <g>. Values come in 5% steps.

const RED = '#C8553D'
const INK = '#1F1E1D'
const PAPER = '#E8E6DC'
const WOOD_D = '#4E3526'
const WOOD_L = '#8A6248'
const METAL_D = '#45453F'
const GOLD = '#E2B84A'
const USED = '#CFCBC0'

// What scene.ts hands over after normalising SceneUsage: finite pct 0..100, safe labels, from in steps.
export type NormUsage = {
  context?: { pct?: number; window: number }
  fiveHour?: { pct?: number; resets?: string }
  sevenDay?: { pct?: number; resets?: string }
  compactions: number
  from: { context?: number; fiveHour?: number; sevenDay?: number } // previous step, -1 = no reading
}

// Free room space for each object (x0, y0, x1, y1), clear of Clawd's poses, the companions and the crane.
export const METER_BOXES: Record<'papers' | 'hourglass' | 'calendar' | 'archive', readonly [number, number, number, number]> = {
  papers: [339, 174, 355, 196],
  hourglass: [155, 79, 169, 100],
  calendar: [361, 103, 395, 141],
  archive: [347, 222, 361, 232],
}

function R(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`
}

const cls = (c: string): string => ` class="${c}"`
const op = (o: number): string => ` opacity="${o}"`

function pmap(rows: readonly string[], x0: number, y0: number, pal: Record<string, string>): string {
  let out = ''
  rows.forEach((row, j) => {
    let i = 0
    while (i < row.length) {
      const ch = row[i]!
      let k = i
      while (k < row.length && row[k] === ch) k++
      const fill = pal[ch]
      if (fill) out += R(x0 + i, y0 + j, k - i, 1, fill)
      i = k
    }
  })
  return out
}

// One warning scale for every meter: gold, orange from 80%, red at the limit; pips are the darker shade.
const tone = (s: number): string => (s >= 100 ? RED : s >= 80 ? '#E8892E' : GOLD)
const pip = (s: number): string => (s >= 100 ? '#8E3B2B' : s >= 80 ? '#8E4A1E' : '#8A6A2E')
const step5 = (p: number): number => Math.min(100, Math.max(0, Math.round(p / 5) * 5))
const obj = (art: string): string => `<g>${art}</g>`

// ---------- context: a paper stack on the desk, a sheet per 5% ----------

const JIT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0, -1] // messier as it grows
const sheetsOf = (step: number | undefined): number => (step === undefined || step < 0 ? 2 : step === 0 ? 1 : step / 5)
// each sheet sits on a grey 1px edge either side, so the white stack still reads on a light pane
const sheet = (i: number): string => R(340 + JIT[i]!, 195 - i, 14, 1, '#8A8A82') + R(341 + JIT[i]!, 195 - i, 12, 1, i % 4 === 3 ? USED : PAPER)

export function paperStack(ctx: { pct?: number; window: number }, from?: number): string {
  const step = ctx.pct === undefined ? undefined : step5(ctx.pct)
  const sheets = sheetsOf(step)
  const was = from === undefined ? sheets : sheetsOf(from)
  // plain sheets merge into one path per paint; new ones drop in together, removed ones fall into the archive box
  let art = '', added = '', gone = ''
  for (let i = 0; i < sheets; i++) {
    if (i >= was) added += sheet(i)
    else art += sheet(i)
  }
  for (let i = sheets; i < was; i++) gone += sheet(i)
  if (added) art += `<g class="pdr">${added}</g>`
  if (gone) art += `<g class="pfl">${gone}</g>`
  const top = 195 - (sheets - 1)
  if (step !== undefined && step >= 80) art += R(346, top - 1, 4, 2, INK) + R(340, top + 2, 3, 3, '#F6D365')
  return obj(art)
}

// ---------- 5-hour limit: an hourglass on the left window sill ----------

const BULB = ['gggggggg', 'gggggggg', '.gggggg.', '.gggggg.', '..gggg..', '..gggg..', '...gg...']
const GLASS = [...BULB, '...gg...', '...gg...', ...[...BULB].reverse()]

export function hourglass(w: { pct?: number; resets?: string }, from?: number): string {
  if (w.pct === undefined) return ''
  const step = step5(w.pct)
  const u = Math.round((step / 100) * 7) // sand rows down below; 7 - u rows still up top
  const sand = tone(step)
  const rows = GLASS.map((row, j) => {
    const isSand = j < 7 ? j >= u : j >= 16 - u && j >= 9
    return isSand ? row.replace(/g/g, 's') : ''
  })
  const changed = from !== undefined && from >= 0 && from !== step
  const art = R(156, 80, 12, 2, WOOD_L) + R(156, 98, 12, 2, WOOD_L) + R(156, 82, 1, 16, WOOD_D) + R(167, 82, 1, 16, WOOD_D) +
    `<g${op(0.35)}>${pmap(GLASS, 158, 82, { g: '#BFE3F5' })}</g>` +
    `<g${changed ? cls('hgf') : ''}>${pmap(rows, 158, 82, { s: sand })}</g>` +
    (step > 0 && step < 100 ? R(161, 89, 1, 9 - u, sand, cls('hgs')) : '')
  return obj(art)
}

// ---------- weekly limit: a wall calendar, 20 squares of 5% ----------

// 3x5 digits for the calendar's header: today's date.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001010010', '111101111101111', '111101111001111']

function dateGlyphs(day: number, cx: number, y: number): string {
  const text = String(day)
  let x = Math.round(cx - (text.length * 4 - 1) / 2)
  let out = ''
  for (const ch of text) {
    const g = DIGITS[Number(ch)]!
    out += pmap([0, 1, 2, 3, 4].map(r => g.slice(r * 3, r * 3 + 3).replace(/0/g, '.')), x, y, { '1': PAPER })
    x += 4
  }
  return out
}

export function calendar(w: { pct?: number; resets?: string }, from?: number, day = 7): string {
  if (w.pct === undefined) return ''
  const step = step5(w.pct)
  const cells = step / 5
  const was = from === undefined ? cells : Math.max(0, from) / 5
  const fill = tone(step), dot = pip(step)
  let art = R(361, 106, 34, 35, WOOD_D) + R(362, 107, 32, 7, RED) +
    dateGlyphs(Number.isFinite(day) ? Math.max(1, Math.min(31, Math.round(day))) : 7, 378, 108) + R(362, 114, 32, 26, PAPER) +
    R(369, 104, 2, 4, METAL_D) + R(385, 104, 2, 4, METAL_D)
  let fresh = ''
  for (let k = 0; k < 20; k++) {
    const x = 364 + (k % 5) * 6
    const y = 115 + Math.floor(k / 5) * 6
    if (k >= cells) art += R(x, y, 4, 4, USED)
    else if (k >= was) fresh += R(x, y, 4, 4, fill) + R(x + 1, y + 1, 2, 2, dot)
    else art += R(x, y, 4, 4, fill) + R(x + 1, y + 1, 2, 2, dot)
  }
  if (fresh) art += `<g class="cdf">${fresh}</g>` // newly crossed-off squares pop in
  return obj(art)
}

// ---------- compactions: an archive box under the desk ----------

export function archiveBox(c: number): string {
  if (c < 1) return ''
  const art = R(347, 222, 14, 3, '#8E6B43') + R(348, 225, 12, 7, '#B08A5A') + R(351, 227, 6, 3, PAPER)
  return obj(art)
}

export function meterSvg(u: NormUsage, day?: number): string {
  return (u.fiveHour ? hourglass(u.fiveHour, u.from.fiveHour) : '') +
    (u.sevenDay ? calendar(u.sevenDay, u.from.sevenDay, day) : '') +
    (u.context ? paperStack(u.context, u.from.context) : '') +
    archiveBox(u.compactions)
}

// The meters' ambient animation (the sand stream); reduced motion stops it. One-shot changes stay.
export const METER_CLASSES: readonly string[] = ['hgs']

export const METER_CSS = `
@keyframes pdr{from{transform:translateY(-6px);opacity:0}to{transform:none;opacity:1}}
.pdr{animation:pdr .5s ease-out both}
@keyframes pfl{0%{transform:none;opacity:1}70%{opacity:1}100%{transform:translate(4px,30px);opacity:0}}
.pfl{animation:pfl 1.1s ease-in both}
@keyframes hgs{0%,100%{opacity:.35}50%{opacity:1}}
.hgs{animation:hgs 1s ease-in-out infinite}
@keyframes hgf{from{opacity:.3}to{opacity:1}}
.hgf{animation:hgf 1.2s ease-out both}
@keyframes cdf{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
.cdf{transform-box:fill-box;transform-origin:center;animation:cdf .6s ease-out both}
`
