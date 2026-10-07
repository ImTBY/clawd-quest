import type { DayPhase } from '../types'

// Pixel art for the swappable room decor. Coordinates are in scene.ts's 400x260 room.
// Each function draws one slot's variant and returns '' for an id it does not know, so scene.ts can
// fall back to its own default (coffee mug, fern, Space Clawd, striped rug and lava lamp live there).
// Static pixels are plain rects (scene.ts mergeRects folds them into paths); animated parts carry a
// class from DECOR_CSS (listed in DECOR_CLASSES so reduced motion stops them) or a scene class
// (stm, lt0..lt2, st t0..t3, bl, mt, skw). Delays are inline styles, never a helper class.

const ORANGE = '#D97757'
const INK = '#1F1E1D'
const PAPER = '#E8E6DC'
const CREAM = '#F2EFE6'
const WOOD = '#6B4A35'
const WOOD_D = '#4E3526'
const METAL = '#5A5A55'
const SILVER = '#C3C8CE'
const STEEL = '#8A9098'
const GOLD = '#E2B84A'
const GOLD_L = '#F6D88A'
const GOLD_D = '#C99A2E'
const SPARK = '#FFF7C8'
const PINK = '#E5677E'
const LEAF = '#6E9B5E'
const LEAF_L = '#7FB06D'
const LEAF_D = '#4C7F45'
const DIM = '#8A8A82'
const GHOST_LINE = '#9AA4BC'
const VINYL = '#45453F' // a record: reads on both panes (INK vanished on a dark one)
const VINYL_RIM = '#6A6A64'
const VINYL_GROOVE = '#5A5A55'
const MAGENTA = '#FF5FA2'
const CYAN = '#5FE3F0'

const n = (v: number): string => String(Math.round(v * 100) / 100)

function R(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`
}

const cls = (c: string): string => ` class="${c}"`
const op = (o: number): string => ` opacity="${o}"`
const dly = (s: number): string => ` style="animation-delay:${n(s)}s"`
const g = (c: string, body: string, extra = ''): string => `<g class="${c}"${extra}>${body}</g>`

// Character map -> one rect per horizontal run. '.' (or any char missing in pal) is empty.
function pmap(rows: readonly string[], x0: number, y0: number, u: number, pal: Record<string, string>, uy = u): string {
  let out = ''
  rows.forEach((row, j) => {
    let i = 0
    while (i < row.length) {
      const ch = row[i]!
      let k = i
      while (k < row.length && row[k] === ch) k++
      const fill = pal[ch]
      if (fill) out += R(x0 + i * u, y0 + j * uy, (k - i) * u, uy, fill)
      i = k
    }
  })
  return out
}

// 3x5 pixel letters for signs and plaques.
const FONT: Record<string, string> = {
  S: '111100111001111', H: '101101111101101', I: '111010010010111', P: '111101111100100', T: '111010010010010',
  C: '111100100100111', L: '100100100100111', A: '010101111101101', W: '101101101111101', D: '110101101101110',
  '0': '111101101101111', '1': '010110010010111',
}

function glyphs(text: string, x: number, y: number, u: number, fill: string): string {
  let out = ''
  ;[...text].forEach((ch, i) => {
    const f = FONT[ch]
    if (f) out += pmap([0, 1, 2, 3, 4].map((r) => f.slice(r * 3, r * 3 + 3)), x + i * 4 * u, y, u, { '1': fill })
  })
  return out
}

// A stepped disc: one rect per `step`-high row.
function disc(cx: number, cy: number, r: number, fill: string, step = 1, extra = ''): string {
  let out = ''
  for (let y = cy - r; y < cy + r - 0.01; y += step) {
    const mid = y + step / 2 - cy
    const half = Math.round(Math.sqrt(Math.max(0, r * r - mid * mid)))
    if (half > 0) out += R(cx - half, y, half * 2, step, fill, extra)
  }
  return out
}

// ---------- drinks (desk, right of the monitor; the desk top is y=196, box 355..372 x 166..196: the papers end at 355) ----------

const LEVEL = [0, 4, 7, 10]

function steam(fill: number, x = 358): string {
  return fill > 0 ? `<g${op(0.55)}>${R(x, 174, 2, 6, PAPER, cls('stm'))}${R(x + 4, 170, 2, 6, PAPER, cls('stm') + dly(1.1))}</g>` : ''
}

// The mug silhouette (as scene.ts mug()): 2-px walls, a base and a handle on the right.
function mugShell(wall: string, handle: string, extra = ''): string {
  return R(355, 182, 2, 14, wall, extra) + R(365, 182, 2, 14, wall, extra) + R(355, 194, 12, 2, wall, extra) +
    R(367, 185, 3, 2, handle, extra) + R(369, 185, 2, 8, handle, extra) + R(367, 191, 3, 2, handle, extra)
}

export function drinkSvg(kind: string, fill: number): string {
  const f = Math.max(0, Math.min(3, Math.floor(fill) || 0))
  switch (kind) {
    case 'tea': {
      const h = LEVEL[f]!
      return R(357, 182, 8, 12, '#BFE3F5', op(0.25)) +
        (h > 0 ? R(357, 194 - h, 8, h, '#C98A3A', op(0.9)) : '') +
        mugShell('#D8EEF7', '#D8EEF7', op(0.8)) +
        R(363, 178, 1, 10, PAPER) + R(362, 187, 4, 5, PINK) +
        (h > 0 ? `<g${op(0.5)}>${R(358, 174, 2, 6, PAPER, cls('stm'))}${R(361, 170, 2, 6, PAPER, cls('stm') + dly(1.1))}</g>` : '')
    }
    case 'energy':
      // a tall can of Clawd Energy; the lighter body and right edge keep it visible on a dark pane
      return R(357, 178, 10, 18, '#3A3A42') + R(366, 178, 1, 18, '#6A6A72') + R(357, 177, 10, 2, SILVER) + R(357, 195, 10, 1, SILVER) +
        R(357, 183, 10, 7, ORANGE) + pmap(['..y', '.y.', 'yyy', '.y.', 'y..'], 359, 183, 1.4, { y: '#FFE14D' }) +
        R(365, 179, 1, 15, '#FFFFFF', op(0.18)) + R(361, 175, 3, 2, SILVER) +
        (f > 0 ? `<g${op(0.7)}>${R(360, 172, 1.5, 1.5, '#FFE14D', cls('fz'))}${R(363, 170, 1.5, 1.5, '#FFE14D', cls('fz') + dly(0.7))}</g>` : '')
    case 'boba': {
      const h = [2, 6, 10, 13][f]!
      return R(357, 180, 11, 16, PAPER, op(0.18)) + R(357, 196 - h, 11, h, '#C69C6D') +
        R(358, 193, 2, 2, INK) + R(361, 194, 2, 2, INK) + R(364, 193, 2, 2, INK) + R(360, 191, 2, 2, INK) +
        R(356, 179, 13, 2, PAPER) + R(355, 181, 1, 15, PAPER, op(0.5)) + R(368, 181, 1, 15, PAPER, op(0.5)) +
        R(364, 166, 2, 13, PINK) + R(364, 166, 4, 2, PINK)
    }
    case 'espresso':
      // three tiny cups, one stacked on another: it is that kind of night (x 354..372, clear of the papers and a
      // second monitor). Each cup has its own grey edge and saucer, the two below stand apart, and one cup per
      // coffee level is full, so a refill shows.
      return ([[356, 190], [365, 190], [360, 184]] as const).map(([x, y], i) =>
        R(x, y, 5, 5, PAPER) + R(x + 4, y, 1, 5, '#C9C5B8') + R(x - 1, y, 1, 5, DIM) + R(x + 5, y + 1, 1, 3, PAPER) + R(x - 1, y + 5, 7, 1, DIM) +
        (f > i ? R(x, y, 4, 1, '#6B3F27') : '') +
        (i === 2 && f > 0 ? `<g${op(0.5)}>${R(x + 2, y - 7, 1.5, 5, PAPER, cls('stm'))}</g>` : ''),
      ).join('')
    case 'cocoa': {
      // a red mug of cocoa with marshmallows
      const h = LEVEL[f]!
      return R(357, 182, 8, 12, '#E89A9A', op(0.3)) +
        (h > 0 ? R(357, 194 - h, 8, h, '#6B3F27') + R(358, 193 - h, 2, 2, CREAM) + R(361, 192 - h, 2, 2, CREAM) + R(363, 193 - h, 2, 2, CREAM) : R(357, 193, 8, 1, '#6B3F27', op(0.6))) +
        mugShell('#C8323C', '#A82828') + R(355, 182, 12, 1, CREAM) + R(356, 184, 1, 9, '#E05A5A') + steam(f)
    }
    case 'matcha': {
      // a glass of matcha latte with a foam heart
      const h = LEVEL[f]!
      return R(357, 182, 8, 12, '#BFE3F5', op(0.25)) +
        (h > 0 ? R(357, 194 - h, 8, h, '#9CC77A') + R(357, 194 - h, 8, 2, CREAM) + R(359, 194 - h, 1, 1, LEAF_L) + R(361, 194 - h, 1, 1, LEAF_L) + R(360, 195 - h, 1, 1, LEAF_L) : R(357, 193, 8, 1, LEAF_L, op(0.7))) +
        mugShell('#D8EEF7', '#D8EEF7', op(0.8)) + R(355, 182, 1, 14, DIM) + R(371, 185, 1, 8, DIM) + steam(f)
    }
    case 'potion': {
      // a round-bottom flask of mana: rising liquid, a cork and a faint glow
      const lv = [2, 5, 8, 11][f]!
      return R(356, 172, 13, 24, '#B89CFF', op(0.12)) + R(355, 176, 1, 18, '#B89CFF', op(0.12)) + R(369, 176, 3, 18, '#B89CFF', op(0.12)) +
        R(358, 184, 8, 12, '#DCD0FF', op(0.35)) + R(356, 186, 12, 8, '#DCD0FF', op(0.35)) + R(360, 176, 4, 8, '#DCD0FF', op(0.35)) +
        R(358, 196 - lv, 8, lv, '#8A6CE0') + (lv > 2 ? R(356, Math.max(186, 196 - lv), 12, Math.min(8, lv - 2), '#8A6CE0') : '') +
        (lv > 2 ? R(358, 196 - lv, 8, 1, '#B89CFF') : '') +
        R(358, 184, 1, 2, '#9A8AC8') + R(356, 186, 1, 8, '#9A8AC8') + R(367, 186, 1, 8, '#9A8AC8') + R(358, 194, 8, 2, '#6A52B8') +
        R(359, 176, 1, 8, '#9A8AC8') + R(364, 176, 1, 8, '#9A8AC8') + R(359, 174, 6, 3, '#B07A4A') + R(359, 174, 6, 1, '#D09A6A') +
        R(357, 187, 1, 4, '#FFFFFF', op(0.5)) +
        (f > 0 ? R(360, 190, 1.5, 1.5, '#E9DCFF', cls('fz')) + R(363, 192, 1.5, 1.5, '#E9DCFF', cls('fz') + dly(0.6)) : '')
    }
    case 'goblet': {
      // a golden goblet with a red gem; wine shows at the rim when it is filled
      return R(357, 180, 10, 8, GOLD) + R(358, 188, 8, 1, GOLD_D) + R(357, 180, 10, 1, GOLD_L) + R(357, 181, 1, 6, GOLD_L) +
        R(366, 181, 1, 7, GOLD_D) + (f > 0 ? R(358, 180, 8, 1, '#7A1F2E') : '') +
        R(361, 184, 2, 2, '#D9434E') + R(361, 188, 2, 5, GOLD_D) + R(357, 193, 10, 3, GOLD) + R(357, 193, 10, 1, GOLD_L) + R(357, 195, 10, 1, GOLD_D) +
        g('skw', R(365, 176, 1.5, 5, SPARK) + R(363.75, 177.75, 4, 1.5, SPARK))
    }
    default:
      return ''
  }
}

// ---------- plants (pot 82..106 x 210..232, centred on x=94; foliage 76..112 x 145..210) ----------

const POT = R(84, 214, 20, 18, '#8A5A44') + R(82, 210, 24, 6, '#A06A50') + R(86, 216, 3, 12, '#A06A50', op(0.6))

function rosette(x: number, main: string, light: string): string {
  return pmap(['..aa..', 'a.ab.a', 'abbbba', '.abba.', 'aaaaaa'], x, 210.5, 1.5, { a: main, b: light })
}

export function plantSvg(kind: string, stage: number): string {
  const s = Math.max(0, Math.min(4, Math.floor(stage) || 0))
  let leaves = ''
  switch (kind) {
    case 'cactus': {
      const h = [6, 14, 22, 30, 36][s]!
      leaves = R(90, 210 - h, 8, h, '#5E9A5A') + R(91, 210 - h, 2, h, '#7DB872') + R(90, 210 - h, 8, 1, '#7DB872')
      if (s >= 2) leaves += R(84, 210 - h * 0.55, 6, 3, '#5E9A5A') + R(84, 210 - h * 0.55 - 8, 3, 8, '#5E9A5A')
      if (s >= 3) leaves += R(98, 210 - h * 0.7, 6, 3, '#5E9A5A') + R(101, 210 - h * 0.7 - 7, 3, 7, '#5E9A5A')
      for (let y = 212 - h; y < 208; y += 5) leaves += R(97, y, 1, 1, PAPER) + R(89, y + 2, 1, 1, PAPER)
      if (s >= 4) leaves += R(92, 210 - h - 4, 4, 4, PINK) + R(93, 210 - h - 5, 2, 1, '#F2A7C3')
      break
    }
    case 'bonsai': {
      leaves = R(92, 198, 4, 12, WOOD) + R(88, 200, 4, 2, WOOD) + R(96, 194, 5, 2, WOOD)
      const blobs: Array<[number, number, number]> = [[82, 190, 14], [94, 184, 14], [80, 180, 12], [92, 174, 12], [86, 168, 14]]
      blobs.slice(0, s + 1).forEach(([x, y, w], i) => {
        leaves += R(x, y, w, 7, i % 2 ? LEAF : LEAF_D) + R(x + 2, y - 2, w - 4, 2, LEAF_L)
      })
      break
    }
    case 'sunflower': {
      const h = [8, 20, 32, 44, 54][s]!
      leaves = R(93, 210 - h, 2, h, LEAF) + R(86, 200, 7, 3, LEAF_L) + (s >= 2 ? R(95, 194, 7, 3, LEAF) : '')
      if (s >= 1) {
        const y = 210 - h - 8
        const big = s >= 3 ? 1 : 0
        leaves += `<g class="sfh">${R(88 - big, y - big, 12 + big * 2, 12 + big * 2, '#F6C445')}${R(86 - big, y + 3, 16 + big * 2, 6, '#F6C445')}` +
          `${R(91 - big, y - 2 - big, 6 + big * 2, 16 + big * 2, '#F6C445')}${R(91, y + 3, 6, 6, '#6B3F27')}${R(92, y + 4, 2, 2, '#8A5A3A')}</g>`
      }
      break
    }
    case 'monstera': {
      const spots: Array<[number, number, boolean]> = [[78, 196, false], [96, 190, true], [80, 180, false], [98, 172, true], [84, 164, false]]
      leaves = R(93, 210 - (s + 1) * 9, 2, (s + 1) * 9, LEAF_D)
      spots.slice(0, s + 1).forEach(([x, y, right], i) => {
        const c = i % 2 ? LEAF : LEAF_D
        leaves += R(x, y, 14, 9, c) + R(x + (right ? 0 : 2), y - 2, 12, 2, c) + R(x + 4, y + 2, 2, 3, '#2B3A28', op(0.6)) + R(x + 9, y + 4, 2, 3, '#2B3A28', op(0.6))
      })
      break
    }
    case 'succulents': {
      // a low planter with up to three rosettes (no sway: they are sturdy)
      const trio = [rosette(89.5, LEAF_L, '#A9D18E'), rosette(80.5, '#5E9A8A', '#8CC2B2'), rosette(98.5, '#4FA3A5', '#86CACB')]
      const shown = trio.slice(0, s <= 1 ? 1 : s <= 3 ? 2 : 3).join('')
      const tips = s >= 4 ? R(92.5, 210.5, 3, 1.5, '#E5809F') + R(83.5, 210.5, 3, 1.5, '#E5809F') + R(101.5, 210.5, 3, 1.5, '#E5809F') : ''
      return shown + tips + R(80, 220, 28, 12, '#8A6248') + R(78, 218, 32, 3, '#A07050') + R(82, 223, 24, 1, '#A07050', op(0.6)) + R(80, 230, 28, 2, '#6B4A35')
    }
    case 'flytrap': {
      const jaw = (x: number, y: number): string =>
        pmap(['t....t', 'ot..to', 'oi..io', 'oiiiio', '.oooo.'], x, y, 1.5, { o: LEAF_L, i: PINK, t: CREAM })
      const heads: Array<[number, number]> = [[84, 186], [97, 176], [88, 164]]
      const count = Math.min(3, s + 1)
      let out = R(86, 207, 6, 3, LEAF_L) + R(96, 206, 7, 4, LEAF)
      heads.slice(0, count).forEach(([x, y], i) => {
        const stalk = R(x + 4, y + 7.5, 1, 210 - y - 7.5, LEAF)
        out += stalk + (i === count - 1 ? g('snp', jaw(x, y)) : jaw(x, y))
      })
      return `<g class="lfg">${out}</g>${POT}`
    }
    case 'orchid': {
      const bloom = (x: number, y: number): string => R(x, y, 4, 4, CREAM) + R(x + 1, y + 2, 2, 2, '#C04A8C') + R(x + 1, y + 1, 2, 1, '#F6D365')
      const spots: Array<[number, number]> = [[103, 171], [98, 161], [91, 168], [91, 177]]
      let stem = R(96, 172, 1, 32, '#6B4A35') + R(97, 169, 1, 3, '#6B4A35') + R(98, 167, 1, 2, '#6B4A35') + R(99, 166, 4, 1, '#6B4A35') +
        R(103, 167, 1, 2, '#6B4A35') + R(104, 169, 1, 2, '#6B4A35') + R(95, 170, 1, 2, '#6B4A35') + R(94, 175, 2, 1, '#6B4A35')
      stem += spots.slice(0, Math.min(4, s)).map(([x, y]) => bloom(x, y)).join('')
      const leafs = R(80, 206, 14, 4, LEAF_D) + R(83, 204, 8, 2, LEAF_D) + R(96, 207, 14, 3, LEAF_D) + R(99, 205, 8, 2, LEAF_D) + R(84, 206, 8, 1, LEAF)
      return `<g class="lfg">${stem}</g>${leafs}` +
        R(86, 214, 16, 18, PAPER) + R(84, 210, 20, 4, CREAM) + R(85, 214, 1, 18, DIM) + R(102, 214, 1, 18, DIM) + R(84, 213, 20, 1, DIM) + R(98, 215, 3, 15, '#CFCBC0')
    }
    case 'crystal': {
      const k = Math.max(0.4, (s + 1) / 5)
      const spire = (x: number, w: number, tall: number, c: string, shade: string): string => {
        const h = Math.max(6, Math.round(tall * k))
        const a = Math.round(h * 0.6)
        const b = Math.round(h * 0.25)
        const top = 210 - h
        return R(x, 210 - a, w, a, c) + R(x + 1, 210 - a - b, w - 2, b, c) + R(x + w / 2 - 1, top, 2, h - a - b, c) +
          R(x + w - 2, 210 - a, 2, a, shade) + R(x + 2, 210 - a - b + 1, 1, a + b - 2, '#FFFFFF')
      }
      return `<ellipse class="cgl" cx="94" cy="197" rx="12" ry="13" fill="#7FE3F0" opacity=".1"/>` +
        spire(84, 7, 22, '#B89CFF', '#8A6CE0') + spire(98, 6, 16, '#DFF8FF', '#9ED0E0') + spire(89, 9, 30, '#7FE3F0', '#3FB0C8') +
        g('skw', R(93.25, 210 - Math.max(6, Math.round(30 * k)) - 4, 1.5, 5, '#FFFFFF') + R(91.5, 210 - Math.max(6, Math.round(30 * k)) - 2.25, 5, 1.5, '#FFFFFF')) +
        R(84, 214, 20, 18, '#4A4A52') + R(82, 210, 24, 6, '#6A6A72') + R(86, 216, 3, 12, '#6A6A72', op(0.6))
    }
    case 'sakura': {
      let canopy = ''
      const blobs: Array<[number, number, number]> = [[82, 190, 14], [94, 184, 14], [80, 180, 12], [92, 174, 12], [86, 168, 14]]
      blobs.slice(0, s + 1).forEach(([x, y, w], i) => {
        canopy += R(x, y, w, 7, i % 2 ? '#F2A7C3' : '#E5809F') + R(x + 2, y - 2, w - 4, 2, '#F8C8DA')
      })
      const trunk = R(93, 212, 4, 12, WOOD_D) + R(91, 204, 4, 8, WOOD_D) + R(93, 196, 4, 8, WOOD_D) + R(88, 200, 3, 2, WOOD_D) + R(97, 194, 5, 2, WOOD_D)
      return `<g class="lfg">${trunk}${canopy}</g>` +
        R(85, 196, 2, 1.5, '#F2A7C3', cls('ptl')) + R(101, 188, 2, 1.5, '#E5809F', cls('ptl') + dly(3.5)) +
        R(84, 222, 20, 2, LEAF) + R(80, 224, 28, 8, '#5E6F8C') + R(78, 222, 32, 2, '#7486A6') + R(80, 230, 28, 2, '#4B5A73')
    }
    case 'xmastree': {
      const tiers = Math.max(2, s)
      let tree = R(92, 207, 4, 3, WOOD)
      const balls = ['#E0554A', '#F6D365', '#7B9BC9']
      let lights = ''
      for (let t = 0; t < tiers; t++) {
        const w = 28 - t * 6
        const top = 201 - t * 8
        tree += R(94 - w / 2, top, w, 6, '#3F7D4E') + R(94 - w / 2 + 3, top - 3, w - 6, 3, '#4C9160')
        lights += R(94 - w / 2 + 2, top + 3, 2, 2, balls[t % 3]!, cls(`lt${t % 3}`)) + R(94 + w / 2 - 4, top + 1, 2, 2, balls[(t + 1) % 3]!, cls(`lt${(t + 1) % 3}`))
      }
      const peak = 201 - (tiers - 1) * 8 - 3
      const star = s >= 2 ? g('skw', R(92, peak - 5, 4, 4, GOLD) + R(93, peak - 6, 2, 6, GOLD)) : ''
      return tree + lights + star + R(84, 214, 20, 18, '#C8323C') + R(82, 210, 24, 6, '#E0554A') + R(86, 216, 3, 12, '#E0554A', op(0.6))
    }
    default:
      return ''
  }
  return `<g class="lfg">${leaves}</g>${POT}`
}

// ---------- posters (wall: frame 264..292 x 26..64, the art fills 266..290 x 28..62) ----------

function posterArt(kind: string): string {
  switch (kind) {
    case 'wave':
      return R(266, 28, 24, 34, '#F1EBDD') +
        pmap(['......bb..', '....bbwbb.', '...bbb..b.', '..bbbb....', '.bbbbbbb..', 'bbbbbbbbbb', 'ddbddbddbd', 'dddddddddd'], 268, 38, 2, { b: '#3E6FA8', w: PAPER, d: '#2C4E7A' }) +
        R(282, 31, 4, 4, '#D9434E')
    case 'cat':
      return R(266, 28, 24, 34, '#3E4C63') +
        pmap(['o.......o.', 'oo.....oo.', 'oooooooooo', 'oeoooooeoo', 'oooopoooo.', '.oowowoo..', '..oooooo..'], 268, 36, 2.2, { o: '#F2A65A', e: INK, p: PINK, w: PAPER })
    case 'terminal':
      return R(266, 28, 24, 34, '#0F1A12') + R(268, 30, 2, 2, '#E0554A') + R(271, 30, 2, 2, '#E2B84A') + R(274, 30, 2, 2, '#5E9A5A') +
        pmap(['g.....', '.g....', '..g...', '.g....', 'g..ggg'], 270, 36, 2, { g: '#7FD98F' }) +
        R(270, 50, 14, 1.5, '#7FD98F', op(0.5)) + R(270, 54, 10, 1.5, '#7FD98F', op(0.4)) + R(270, 58, 12, 1.5, '#7FD98F', op(0.3))
    case 'clawd':
      return R(266, 28, 24, 34, '#F3E9DC') +
        pmap(['..oooooooo..', '..oeooooeo..', 'oooooooooooo', '..oooooooo..', '...o.o..o.o.'], 266, 38, 2, { o: ORANGE, e: INK }) +
        R(268, 54, 20, 2, '#C9B9A2')
    case 'synthwave': {
      let grid = ''
      for (let y = 52; y < 62; y += 2) grid += R(266, y, 24, 1, PINK)
      for (const d of [-30, -17, -6, 6, 17, 30]) {
        for (let y = 53; y < 62; y += 2) {
          const x = Math.round(278 + (d * (y - 52)) / 10)
          if (x >= 266 && x < 290) grid += R(x, y, 1, 1, PINK)
        }
      }
      return R(266, 28, 24, 10, '#2A1B4A') + R(266, 38, 24, 7, '#6A2C7A') + R(266, 45, 24, 7, '#C04A8C') +
        pmap(['....yyyy....', '..yyyyyyyy..', '.yyyyyyyyyy.', '.yyyyyyyyyy.', 'yyyyyyyyyyyy', 'yyyyyyyyyyyy', 'oooooooooooo', '.oooooooooo.', '.oooooooooo.', '..oooooooo..'], 272, 38, 1, { y: '#F2C14E', o: '#F6A04A' }) +
        R(272, 45, 12, 1, '#2A1B4A') + R(273, 47, 10, 1, '#2A1B4A') + R(274, 49, 8, 1, '#2A1B4A') +
        R(266, 52, 24, 10, '#2A1B4A') + grid + R(268, 31, 1, 1, CREAM) + R(286, 33, 1, 1, CREAM)
    }
    case 'starry':
      return R(266, 28, 24, 34, '#1E2E6E') +
        pmap(['......bbbbb.....', '...bbb.....bb...', '.bb...wwww...b..', 'b...ww....w...b.', '...w...bb..w....', '...w..b..b.w....', '....w..bb.w.....', '.....wwwww......'], 273, 40, 1, { b: '#7B9BC9', w: '#BFE3F5' }) +
        pmap(['.yyy', 'yy..', 'yy..', '.yyy'], 284, 30, 1, { y: '#F6D365' }) +
        R(275, 31, 2, 2, '#F6D365') + R(280, 35, 2, 2, '#F6D365') + R(287, 37, 2, 2, '#F6D365') + R(276, 50, 2, 2, '#F6D365') +
        R(266, 55, 24, 7, '#2A3A5A') + R(273, 54, 9, 1, '#2A3A5A') + R(276, 57, 1, 1, '#F6D365') + R(283, 58, 1, 1, '#F6D365') +
        R(269, 38, 2, 2, '#1F2A1E') + R(268, 40, 4, 22, '#1F2A1E') + R(269.5, 36, 1, 2, '#1F2A1E')
    case 'halloffame': {
      let shine = ''
      for (let k = 0; k < 6; k++) shine += R(271 - k, 28 + k * 6, 3, k === 5 ? 4 : 6, '#FFFFFF', op(0.16))
      return R(266, 28, 24, 34, '#3B281D') + R(267, 29, 22, 1, GOLD) + R(267, 29, 1, 32, GOLD) + R(288, 29, 1, 32, GOLD_D) + R(267, 60, 22, 1, GOLD_D) +
        pmap(['..hhhhhhhh..', '..geggggeg..', 'gggggggggggg', '..gggggggg..', '...g.g..g.g.'], 269, 33, 1.5, { g: GOLD, h: GOLD_L, e: '#3B281D' }) +
        R(270, 42.5, 16, 1, GOLD_D) + glyphs('100', 270.3, 46, 1.4, GOLD) + R(270, 54.5, 16, 1, GOLD_D) +
        g('hfs', shine)
    }
    case 'neon':
      return R(266, 28, 24, 34, '#1A1420') + R(266.5, 31.5, 23, 10, MAGENTA, op(0.2)) + R(271.5, 44.5, 13, 10, CYAN, op(0.2)) +
        glyphs('SH', 267.5, 33, 1.4, MAGENTA) + g('nfl', glyphs('I', 278.7, 33, 1.4, MAGENTA)) + glyphs('P', 284.3, 33, 1.4, MAGENTA) +
        glyphs('IT', 273.1, 46, 1.4, CYAN) + R(286, 57, 1, 5, DIM) + R(284, 61, 3, 1, DIM)
    case 'map':
      return R(266, 28, 24, 34, '#E8D7A8') + R(266, 34, 1, 2, '#B89A62') + R(289, 41, 1, 3, '#B89A62') + R(273, 28, 2, 1, '#B89A62') + R(282, 61, 3, 1, '#B89A62') + R(266, 50, 1, 2, '#B89A62') +
        pmap(['...bbbb...', '..b....bb.', '.b.......b', 'b........b', '.b......b.', '..bb...b..', '....bbb...'], 270, 32, 1, { b: '#4F8BD8' }) +
        R(272, 54, 1, 1, '#D9434E') + R(274, 53, 1, 1, '#D9434E') + R(276, 51, 1, 1, '#D9434E') + R(277, 49, 1, 1, '#D9434E') + R(279, 48, 1, 1, '#D9434E') + R(281, 46, 1, 1, '#D9434E') +
        pmap(['r.r', '.r.', 'r.r'], 283, 43, 1, { r: '#D9434E' }) +
        pmap(['..k..', '.kkk.', 'kk.kk', '.kkk.', '..k..'], 283, 55, 1, { k: WOOD }) + R(285, 54, 1, 1, '#D9434E')
    case 'blueprint':
      return R(266, 28, 24, 34, '#2F5A9E') + R(266, 33, 24, 1, '#3D6BB0') + R(266, 49, 24, 1, '#3D6BB0') + R(276, 28, 1, 34, '#3D6BB0') +
        R(270, 38, 16, 1, CREAM) + R(270, 45, 16, 1, CREAM) + R(270, 38, 1, 8, CREAM) + R(285, 38, 1, 8, CREAM) +
        R(268, 41, 2, 1, CREAM) + R(286, 41, 2, 1, CREAM) + R(274, 40, 1, 2, CREAM) + R(281, 40, 1, 2, CREAM) +
        R(272, 46, 1, 3, CREAM) + R(275, 46, 1, 3, CREAM) + R(280, 46, 1, 3, CREAM) + R(283, 46, 1, 3, CREAM) +
        R(270, 53, 16, 1, '#BFE3F5') + R(270, 52, 1, 3, '#BFE3F5') + R(285, 52, 1, 3, '#BFE3F5') + R(271, 52, 1, 1, '#BFE3F5') + R(284, 54, 1, 1, '#BFE3F5') +
        R(289, 38, 1, 8, '#BFE3F5') + R(288, 38, 2, 1, '#BFE3F5') + R(288, 45, 2, 1, '#BFE3F5') +
        R(268, 57, 10, 1, '#BFE3F5') + R(268, 59, 7, 1, '#BFE3F5') + R(282, 57, 6, 3, '#BFE3F5', op(0.5))
    case 'kraken': {
      // five tentacles curl out to the frame; one wraps a tiny ship
      const arms = [
        [[272, 38], [270, 39], [268, 41], [266, 43], [266, 45], [267, 47], [269, 47], [270, 45]],
        [[275, 38], [274, 40], [273, 42], [272, 44], [272, 46], [273, 48], [274, 50], [273, 52], [271, 53]],
        [[278, 38], [278, 40], [279, 42], [279, 44], [278, 46], [278, 48], [279, 50], [280, 52], [281, 54], [283, 54]],
        [[281, 38], [282, 40], [284, 41], [286, 42], [287, 44], [288, 46], [288, 48], [288, 50], [287, 52]],
        [[283, 36], [285, 35], [287, 33], [288, 31], [287, 29], [285, 29]],
      ]
      return R(266, 28, 24, 34, '#2E6E6A') + R(266, 57, 24, 5, '#245A57') + R(268, 57, 4, 1, '#4F9E98') + R(276, 59, 5, 1, '#4F9E98') +
        R(281, 52, 7, 2, WOOD) + R(282, 54, 5, 1, WOOD) + R(284, 46, 1, 6, '#3A3936') + R(285, 47, 3, 4, CREAM) + R(284, 45, 2, 1, '#D9434E') +
        arms.map((arm) => arm.map(([x, y]) => R(x!, y!, 2, 2, '#7A4FA8')).join('')).join('') +
        pmap(['..pppppp..', '.pppppppp.', 'pppppppppp', 'ppeppppepp', 'pppppppppp', '.pppppppp.'], 273, 32, 1, { p: '#7A4FA8', e: '#F6D365' }) +
        R(275, 33, 3, 1, '#9A72C8') + R(274, 34, 1, 1, '#9A72C8')
    }
    default:
      return ''
  }
}

export function posterSvg(kind: string, gold: boolean): string {
  const inner = posterArt(kind)
  if (!inner) return ''
  const fr = gold ? GOLD : WOOD
  let out = R(264, 26, 28, 38, fr) + (gold ? R(264, 26, 28, 2, GOLD_L) + R(264, 26, 2, 38, GOLD_L) : '') + inner
  if (gold) out += g('skw', R(289, 22, 1.5, 6, SPARK) + R(286.75, 24.25, 6, 1.5, SPARK))
  return out
}

// ---------- rugs (floor strip 98..248 x 233..241) ----------

// A stepped oval in the lane, rows 234..239.
function oval(fill: string, inset = 0): string {
  return R(114 + inset, 234, 118 - inset * 2, 6, fill) + R(108 + inset, 235, 130 - inset * 2, 4, fill) + R(104 + inset, 236, 138 - inset * 2, 2, fill)
}

export function rugSvg(kind: string): string {
  switch (kind) {
    case 'round':
      return R(116, 233, 112, 8, '#4F6B8C') + R(108, 235, 128, 4, '#4F6B8C') + R(124, 235, 96, 4, '#6F8BAC') + R(140, 236, 64, 2, '#94AFCB')
    case 'checker': {
      let out = R(98, 234, 150, 6, '#E8E6DC')
      for (let x = 98, i = 0; x < 248; x += 6, i++) out += R(x, 234 + (i % 2) * 3, 6, 3, '#C8553D')
      return out
    }
    case 'braided': {
      let out = oval('#A65A3A') + R(116, 235, 114, 4, '#E8D9B0') + R(110, 236, 126, 2, '#E8D9B0') + R(122, 236, 102, 2, '#4F8B8A')
      for (let x = 118; x < 226; x += 8) out += R(x, 234, 3, 1, '#7E4028') + R(x + 4, 239, 3, 1, '#7E4028') + R(x + 2, 235, 3, 1, '#C9B98E') + R(x + 6, 238, 3, 1, '#C9B98E')
      for (let x = 126; x < 220; x += 10) out += R(x, 236, 3, 1, '#3A6A69') + R(x + 5, 237, 3, 1, '#3A6A69')
      return out
    }
    case 'galaxy': {
      const stars: Array<[number, number]> = [[110, 236], [124, 238], [138, 235], [152, 238], [196, 235], [208, 238], [220, 236], [232, 237], [168, 234], [184, 239]]
      // a base and rim lighter than a dark pane, so the oval keeps its shape there
      const rim = '#5A4BA8'
      return oval('#3A2F72') + R(114, 234, 118, 1, rim) + R(114, 239, 118, 1, rim) + R(108, 235, 6, 1, rim) + R(232, 235, 6, 1, rim) +
        R(108, 238, 6, 1, rim) + R(232, 238, 6, 1, rim) + R(104, 236, 1, 2, rim) + R(241, 236, 1, 2, rim) + R(150, 236, 46, 2, '#6A4FB5') + R(160, 235, 26, 1, '#6A4FB5') +
        R(170, 236, 10, 2, '#C04A8C') + R(156, 238, 20, 1, '#C04A8C', op(0.8)) + R(186, 237, 14, 1, '#C04A8C') + R(140, 237, 8, 1, '#6A4FB5', op(0.7)) +
        stars.map(([x, y], i) => R(x, y, 1, 1, CREAM, cls(`st t${i % 4}`))).join('')
    }
    case 'redcarpet': {
      let out = R(100, 234, 146, 6, '#A8202E') + R(100, 235, 146, 1, '#C8323C') + R(100, 234, 146, 1, GOLD) + R(100, 239, 146, 1, GOLD)
      for (let x = 108; x < 244; x += 20) out += R(x, 236, 2, 2, GOLD)
      for (const x of [98, 246]) out += R(x, 234, 2, 1, GOLD) + R(x, 236, 2, 1, GOLD) + R(x, 238, 2, 1, GOLD)
      return out
    }
    case 'welcome': {
      let out = R(140, 234, 60, 6, '#B08A5A') + R(140, 234, 60, 1, '#8E6A40') + R(140, 234, 1, 6, '#8E6A40') + R(199, 234, 1, 6, '#8E6A40')
      for (let x = 144; x < 196; x += 4) if (x < 164 || x > 175) out += R(x, 236 + (x % 8 === 0 ? 0 : 2), 2, 1, '#C9A470')
      return out + glyphs('HI', 166.5, 235, 1, WOOD)
    }
    default:
      return ''
  }
}

// ---------- shelf top (on the bookshelf; every piece inside x 10..40, base y=110) ----------
// x 54..76 holds the seasonal pumpkin or tree, which scene.ts draws whatever the shelf piece is.

export function shelfSvg(kind: string): string {
  switch (kind) {
    case 'globe':
      return R(14, 106, 14, 4, WOOD) + R(20, 100, 2, 6, METAL) + R(12, 86, 2, 16, METAL, op(0.7)) +
        g('glb', pmap(['..bbbb..', '.bggbbb.', 'bbgggbbb', 'bbbggbgb', 'bbbbbggb', '.bbgbbb.', '..bbbb..'], 13, 86, 2, { b: '#4F8BD8', g: '#6FAE5A' }))
    case 'duck':
      return pmap(['...yyy...', '..yyeyy..', '..yyyyoo.', 'y.yyyy...', 'yyyyyyyy.', 'yyyyyyyy.', '.yyyyyy..'], 12, 96, 2, { y: '#F6D04D', e: INK, o: '#E8892E' })
    case 'boombox':
      // the lighter top and left edges keep the dark body visible on a dark pane
      return R(10, 94, 28, 16, '#3E3E3A') + R(10, 94, 28, 1, '#6A6A64') + R(10, 94, 1, 16, '#6A6A64') +
        R(16, 90, 16, 2, METAL) + R(15, 90, 2, 4, METAL) + R(31, 90, 2, 4, METAL) +
        R(12, 98, 9, 9, '#2A2A27') + R(27, 98, 9, 9, '#2A2A27') + R(14, 100, 5, 5, METAL, cls('bbx')) + R(29, 100, 5, 5, METAL, cls('bbx') + dly(0.22)) +
        R(22, 97, 4, 3, '#7FD98F', op(0.8))
    case 'arcade': {
      const a = pmap(['.g..g.', 'gggggg', 'g.gg.g', '.g..g.'], 19, 92, 1, { g: '#7FD98F' })
      const b = pmap(['.g..g.', 'gggggg', 'g.gg.g', 'g....g'], 19, 92, 1, { g: '#7FD98F' })
      return R(16, 84, 12, 26, '#4A3A80') + R(14, 84, 2, 26, '#6A4FB5') + R(28, 84, 2, 26, '#6A4FB5') + R(14, 84, 16, 1, '#8A72D0') +
        R(16, 86, 12, 2, '#F6D365') + R(17, 90, 10, 8, '#141413') + g('arc', a) + g('arc', b, dly(-0.5)) +
        R(15, 99, 14, 2, '#3A2E66') + R(14, 101, 16, 3, '#5A48A0') + R(18, 98, 1, 2, '#2A2A27') + R(17.5, 97, 2, 1.5, '#E0554A') +
        R(23, 99.5, 2, 1, '#E0554A') + R(26, 99.5, 2, 1, '#4F8BD8') + R(21, 106, 2, 2, '#F6D365') + R(16, 108, 12, 2, '#3A2E66')
    }
    case 'statue':
      return R(12, 102, 26, 8, '#3A3936') + R(12, 102, 26, 1, METAL) + glyphs('100', 19.5, 104, 1, GOLD) +
        pmap(['..hhhhhhhh..', '..geggggeg..', 'gggggggggggg', '..gggggggg..', '..gggggggg..', '...g.g..g.g.'], 14.2, 91, 1.8, { g: GOLD, h: GOLD_L, e: '#8A6A2E' }) +
        g('skw', R(34, 86, 1.5, 5, SPARK) + R(32.25, 87.75, 5, 1.5, SPARK))
    case 'cradle': {
      const ball = (x: number): string => R(x + 1, 93, 1, 9, STEEL) + R(x, 102, 3, 3, SILVER) + R(x, 104, 3, 1, STEEL)
      return R(12, 108, 26, 2, SILVER) + R(12, 109, 26, 1, STEEL) + R(13, 92, 1, 16, STEEL) + R(36, 92, 1, 16, STEEL) + R(13, 92, 24, 1, SILVER) +
        g('ncl', ball(18)) + ball(21) + ball(24) + ball(27) + g('ncr', ball(30))
    }
    case 'rubik': {
      const front = [['#D9434E', '#4F8BD8', '#F6D365'], ['#6FAE5A', CREAM, '#E8892E'], ['#4F8BD8', '#D9434E', '#6FAE5A']]
      const top = ['#F28A92', '#8FB8F0', '#FFF2A8']
      let out = R(18, 97, 11, 13, '#2A2A27')
      top.forEach((c, i) => { out += R(18 + i * 4, 97, 3, 2, c) })
      front.forEach((row, j) => row.forEach((c, i) => { out += R(18 + i * 4, 99.5 + j * 3.5, 3, 3, c) }))
      return out
    }
    case 'train':
      return R(10, 109, 30, 1, '#6A6A64') +
        R(11, 102, 7, 5, GOLD) + R(11, 102, 7, 1, GOLD_L) + R(18, 105, 1, 1, '#4A4A52') +
        R(19, 102, 7, 5, '#4F8BD8') + R(19, 102, 7, 1, '#8FB8F0') + R(26, 105, 2, 1, '#4A4A52') +
        R(28, 100, 4, 7, '#C8323C') + R(29, 101, 2, 2, '#BFE3F5') + R(27.5, 99, 5, 1, '#4A4A52') +
        R(32, 102, 6, 5, '#C8323C') + R(34, 102, 1, 5, '#A82828') + R(35, 98, 2, 4, '#4A4A52') + R(34.5, 98, 3, 1, '#7A7A85') + R(38, 105, 1, 2, '#4A4A52') +
        R(12, 107, 2, 2, '#4A4A52') + R(15, 107, 2, 2, '#4A4A52') + R(20, 107, 2, 2, '#4A4A52') + R(23, 107, 2, 2, '#4A4A52') +
        R(29, 107, 2, 2, '#4A4A52') + R(32, 107, 2, 2, '#4A4A52') + R(35, 107, 2, 2, '#4A4A52') +
        `<g${op(0.6)}>${R(35, 94, 2, 2, PAPER, cls('stm'))}${R(36, 91, 2, 2, PAPER, cls('stm') + dly(1.1))}</g>`
    case 'sword':
      return R(16, 100, 16, 2, '#8A8A82') + R(13, 102, 22, 4, '#8A8A82') + R(12, 106, 24, 4, '#8A8A82') +
        R(28, 102, 7, 4, '#6A6A64') + R(26, 106, 10, 4, '#6A6A64') + R(17, 101, 5, 1, '#A8A8A0') + R(14, 103, 4, 1, '#A8A8A0') +
        R(23, 94, 2, 7, SILVER) + R(24, 94, 1, 7, STEEL) + R(20, 92, 8, 2, GOLD) + R(20, 93, 8, 1, GOLD_D) +
        R(23, 85, 2, 7, WOOD) + R(22.5, 82, 3, 3, GOLD) +
        g('skw', R(27, 79, 1.5, 5, SPARK) + R(25.25, 80.75, 5, 1.5, SPARK))
    case 'hatstand':
      return R(26, 88, 1, 22, WOOD) + R(21, 108, 11, 2, WOOD) + R(21, 108, 11, 1, '#8A6248') +
        R(23, 92, 3, 1, WOOD) + R(27, 97, 3, 1, WOOD) + R(23, 101, 3, 1, WOOD) +
        pmap(['g.g.g', 'ggggg', 'grgrg'], 24, 85, 1, { g: GOLD, r: '#D9434E' }) +
        R(20, 90, 4, 4, '#50505A') + R(20, 90, 4, 1, '#7A7A85') + R(20, 93, 4, 1, '#C8323C') + R(19, 94, 6, 1, '#50505A') +
        R(28, 95, 4, 3, '#3E8E8A') + R(28, 97, 4, 1, '#2E6E6A') + R(29.5, 94, 1, 1, CREAM)
    default:
      return ''
  }
}

// ---------- companions ----------
// Each roommate stays inside its box (x0, y0, x1, y1 in room units), which keeps it clear of every spot
// Clawd uses (stool, bed, reading corner, the happy spot), the meters and the terraform crane.
// scene.test.ts and decorArt.test.ts check these boxes. Floor-lane roommates may be walked in front of.

const HOVER = [100, 70, 134, 96] as const

export const COMPANION_BOXES: Record<string, readonly [number, number, number, number]> = {
  // under the desk, between the left desk leg and the PC tower
  cat: [318, 220, 346, 232],
  corgi: [318, 218, 346, 232],
  // the floor lane: x 244..330, right of the bed, the crane and the thinking walk
  roomba: [244, 225, 330, 232],
  clawdlet: [244, 222, 330, 232],
  rover: [244, 218, 330, 232],
  // on the window sill (top surface y=100), right pane
  fishbowl: [212, 82, 232, 100],
  axolotl: [212, 82, 232, 100],
  // on the glass of the right window pane
  snail: [234, 62, 248, 80],
  // hovering on the wall between the clock and the window, above the bed
  dragon: HOVER,
  drone: HOVER,
  ghost: HOVER,
}

function dragon(sleeping: boolean): string {
  const pal = { g: '#4C9160', c: '#E8D9B0', h: '#E8D9B0', e: INK, k: '#2E5E3E', d: '#3E7A50' }
  if (sleeping) {
    return pmap(['....ggggg.h...', '..gggdggggggg.', '.ggggggggggkgg', 'gggccccccggggg', 'ggccccccccggg.', '.ggggggggggg..', '...gggg..ggggg'], 110, 85, 1.5, pal) +
      g('bl', pmap(['zzzz', '..z.', '.z..', 'zzzz'], 125, 77, 1, { z: CREAM })) +
      R(131, 74, 2, 1, CREAM, cls('bl') + dly(-1.5)) + R(131.5, 75, 1, 1, CREAM, cls('bl') + dly(-1.5)) + R(131, 76, 2, 1, CREAM, cls('bl') + dly(-1.5))
  }
  const body = pmap(['...........h.h..', '..........ggggg.', '..........gggegg', '...........ggggg', '....gggg...gcc..', '..ggggggggggc...', '.gggccccccgg....', 'g.ggcccccgg.....', 'g..gg.g.gg......', '.gg.............'], 108, 77, 1.5, pal)
  const up = pmap(['....d', '...dd', '..ddd', '.dddd'], 112.5, 77.5, 1.5, pal)
  const down = pmap(['dddd.', '.ddd.', '..d..'], 114, 85, 1.5, pal)
  return g('dbb', body + g('dwg', up) + g('dwg', down, dly(-0.3)) + R(132.5, 80, 1.5, 1.5, '#C9C9C0', cls('dsm')) + R(131, 79, 1.5, 1.5, '#C9C9C0', cls('dsm') + dly(-0.4)))
}

export function companionSvg(kind: string, sleeping: boolean): string {
  switch (kind) {
    case 'cat':
      // curled up under the desk, tail swishing; it hides while the terraform crane works
      return `<g class="cat">` +
        pmap(['.o.o.......', '.ooo.......', 'oeooooooo..', 'oooooooooo.', '.oooooooooo'], 318, 222, 2, { o: '#9A8F86', e: INK }) +
        g('ctl', R(340, 226, 2, 4, '#9A8F86') + R(342, 224, 2, 3, '#9A8F86')) +
        (sleeping ? '' : R(320, 226, 2, 1, '#F2C14E')) + `</g>`
    case 'roomba':
      return g('rmb', R(244, 227, 22, 5, '#3E3E3A') + R(244, 227, 22, 1, '#6A6A64') + R(246, 225, 18, 2, '#55554F') + R(246, 225, 18, 1, '#6A6A64') + R(253, 225, 4, 1, '#7FD98F', cls('led')))
    case 'fishbowl':
      return R(212, 84, 20, 14, '#7EC8E3', op(0.35)) + R(214, 82, 16, 2, '#BFE3F5', op(0.6)) + R(213, 98, 18, 2, '#D8EEF7', op(0.6)) +
        R(216, 95, 3, 3, '#6E9B5E') + R(219, 96, 2, 2, '#4C7F45') +
        g('fsh', R(216, 88, 5, 3, '#F08A2A') + R(214, 87, 2, 5, '#F08A2A') + R(220, 88, 1, 1, INK))
    case 'corgi':
      // a loaf of corgi under the desk; the stub tail wags while it is awake
      return g('crg',
        R(328, 225, 16, 7, '#E8A04A') + R(330, 225, 12, 1, '#C9822F') + R(330, 230, 10, 2, CREAM) + R(340, 230, 4, 2, CREAM) +
        R(320, 221, 10, 8, '#E8A04A') + R(324, 221, 2, 4, CREAM) + R(318, 225, 5, 4, CREAM) + R(318, 225, 1, 1, INK) + R(320, 229, 5, 3, CREAM) +
        R(321, 218, 1, 1, '#E8A04A') + R(320, 219, 3, 2, '#E8A04A') + R(321, 219, 1, 2, '#F2A0B0') +
        R(328, 218, 1, 1, '#E8A04A') + R(327, 219, 3, 2, '#E8A04A') + R(328, 219, 1, 2, '#F2A0B0') +
        R(329, 225, 1, 4, '#C8323C') + (sleeping ? R(322, 224, 2, 1, INK) : R(322, 223, 2, 2, INK)) +
        g('cwg', R(343, 223, 3, 3, '#E8A04A') + R(344, 223, 2, 1, CREAM)))
    case 'clawdlet':
      // a mini Clawd that scuttles along the floor and hops when Clawd is happy
      return g('cdl', g('cdh',
        R(246, 226, 8, 4, ORANGE) + R(244, 227, 2, 2, ORANGE) + R(254, 227, 2, 2, ORANGE) + R(246, 226, 8, 1, '#E8946F') +
        (sleeping ? R(247.5, 227.5, 1.5, 0.5, INK) + R(251, 227.5, 1.5, 0.5, INK) : R(248, 227, 1, 1, INK) + R(251, 227, 1, 1, INK)) +
        R(247, 230, 1, 2, ORANGE) + R(249, 230, 1, 2, ORANGE) + R(251, 230, 1, 2, ORANGE) + R(253, 230, 1, 2, ORANGE)))
    case 'rover':
      return g('rvr',
        R(246, 224, 16, 6, '#C9A45B') + R(247, 225, 6, 1, '#E8CF8A') + R(246, 229, 16, 1, '#9A7A2E') + R(248, 222, 8, 2, '#3B4F8C') + R(248, 222, 8, 0.5, '#7B9BC9') +
        R(258, 220, 1, 4, '#8A8A92') + R(257, 218, 3, 2, PAPER) + R(259, 218.5, 1, 1, INK) + R(255, 219, 1, 1, '#E0554A', cls('bl')) +
        R(246, 230, 2, 2, '#2A2A27') + R(249, 230, 2, 2, '#2A2A27') + R(252, 230, 2, 2, '#2A2A27') +
        R(255, 230, 2, 2, '#2A2A27') + R(258, 230, 2, 2, '#2A2A27') + R(261, 230, 2, 2, '#2A2A27'))
    case 'dragon':
      return dragon(sleeping)
    case 'drone':
      return g('dbb',
        R(108, 82, 18, 1, '#8A8A92') + R(110, 82, 1, 2, '#8A8A92') + R(123, 82, 1, 2, '#8A8A92') +
        R(105, 81, 6, 1, SILVER, cls('drt')) + R(123, 81, 6, 1, SILVER, cls('drt') + dly(-0.1)) +
        R(111, 84, 12, 5, '#4A4A52') + R(111, 84, 12, 1, '#8A8A92') + R(111, 84, 1, 5, '#8A8A92') + R(122, 84, 1, 5, '#8A8A92') +
        R(115, 86, 4, 2, '#4FD6E8', cls('dre')) + R(117, 81, 1, 3, '#8A8A92') + R(117, 80, 1, 1, '#E0554A', cls('bl')) +
        R(112, 89, 1, 2, '#8A8A92') + R(121, 89, 1, 2, '#8A8A92') + R(111, 91, 3, 1, '#8A8A92') + R(120, 91, 3, 1, '#8A8A92'))
    case 'snail':
      // on the glass, inching up and leaving a faint trail
      return R(238.5, 68, 1, 12, '#E8F4F8', op(0.3)) +
        g('snl', R(238, 76, 2, 4, '#E8D9B0') + R(238, 75, 2, 1, '#E8D9B0') + R(237, 74, 1, 1, '#8A8A82') + R(240, 74, 1, 1, '#8A8A82') +
          pmap(['.bbbb.', 'bggggb', 'bgbbgb', 'bgbggb', 'bggbbb', '.bbbb.'], 240, 74, 1, { b: '#8A5A3C', g: '#C9A45B' }))
    case 'axolotl':
      // a little tank on the sill with a pink axolotl
      return R(212, 84, 20, 13, '#7EC8E3', op(0.3)) + R(212, 83, 20, 2, SILVER) + R(212, 97, 20, 3, SILVER) + R(212, 99, 20, 1, STEEL) +
        R(213, 95, 18, 2, '#B08A5A') + R(228, 89, 1, 6, LEAF) + R(229, 91, 1, 4, LEAF_L) +
        R(216, 91, 5, 2, '#F2A0B8') + R(214, 91, 2, 1, '#F2A0B8') + R(221, 90, 4, 3, '#F2A0B8') + R(217, 93, 1, 1, '#F2A0B8') + R(220, 93, 1, 1, '#F2A0B8') +
        R(220, 89, 1, 1, PINK) + R(221, 88, 1, 1, PINK) + R(222, 89, 1, 1, PINK) + R(220, 93, 1, 1, PINK) + R(221, 94, 1, 1, PINK) + R(222, 93, 1, 1, PINK) +
        (sleeping ? R(223, 91, 1, 0.5, INK) : R(223, 90.5, 1, 1, INK)) + R(223, 92, 2, 0.5, '#B84A6A') +
        R(225, 88, 1, 1, '#FFFFFF', cls('bub')) + R(224, 87, 1, 1, '#FFFFFF', cls('bub') + dly(1.3))
    case 'ghost':
      return g('gst',
        R(113, 74, 8, 1, CREAM) + R(111, 75, 12, 1, CREAM) + R(110, 76, 14, 12, CREAM) +
        R(110, 88, 2, 2, CREAM) + R(114, 88, 2, 2, CREAM) + R(118, 88, 2, 2, CREAM) + R(122, 88, 2, 2, CREAM) +
        R(109, 76, 1, 12, DIM) + R(124, 76, 1, 12, DIM) + R(110, 75, 1, 1, DIM) + R(123, 75, 1, 1, DIM) +
        // a grey-blue outline over the top and under the scalloped hem, so the sheet reads on a light pane
        R(113, 73, 8, 1, GHOST_LINE) + R(111, 74, 2, 1, GHOST_LINE) + R(121, 74, 2, 1, GHOST_LINE) +
        R(110, 90, 2, 1, GHOST_LINE) + R(114, 90, 2, 1, GHOST_LINE) + R(118, 90, 2, 1, GHOST_LINE) + R(122, 90, 2, 1, GHOST_LINE) +
        R(112, 88, 2, 1, GHOST_LINE) + R(116, 88, 2, 1, GHOST_LINE) + R(120, 88, 2, 1, GHOST_LINE) +
        (sleeping ? R(113, 80, 2, 1, DIM) + R(119, 80, 2, 1, DIM) : R(113, 79, 2, 3, DIM) + R(119, 79, 2, 3, DIM)) + R(116, 84, 2, 2, DIM, op(0.7)),
        op(0.8))
    default:
      return ''
  }
}

// ---------- wall hangings (box 18..98 x 18..70, above the bookshelf and left of the clock) ----------

export function wallSvg(kind: string): string {
  switch (kind) {
    case 'pennant': {
      let out = R(22, 26, 2, 22, WOOD) + R(22, 25, 2, 1, SILVER) + R(22, 48, 2, 1, SILVER)
      for (let i = 0; i < 25; i++) {
        const h = 2 * Math.round(7 * (1 - i / 25))
        if (h <= 0) break
        out += R(24 + i * 2, 37 - h / 2, 2, h, i < 1 ? CREAM : ORANGE) + (i >= 1 ? R(24 + i * 2, 37 + h / 2 - 1, 2, 1, '#B85F42') : '')
      }
      return out + glyphs('CLAWD', 30, 35, 1, '#FFFFFF')
    }
    case 'records': {
      const sleeves: Array<[number, string, string, string]> = [[22, ORANGE, '#E8946F', '#B85F42'], [44, '#4FA3A5', '#7CC4C5', '#3A8486'], [66, '#C04A8C', '#D872A8', '#963A6C']]
      return sleeves.map(([x, c, hi, sh], i) => {
        const label = R(x + 7, 37, 4, 2, i === 1 ? GOLD : CREAM) + R(x + 7, 39, 4, 2, i === 1 ? '#D9434E' : GOLD) + R(x + 8.5, 38.5, 1, 1, INK)
        // the vinyl above the sleeve is a lighter grey with a rim highlight, so it shows on a dark pane too
        return R(x + 5, 26, 8, 1, VINYL_RIM) + R(x + 3, 27, 12, 1, VINYL) + R(x + 2, 28, 14, 2, VINYL) + R(x + 5, 28, 8, 1, VINYL_GROOVE) +
          R(x, 30, 18, 18, c) + R(x, 30, 18, 1, hi) + R(x + 17, 30, 1, 18, sh) + R(x, 47, 18, 1, sh) +
          R(x + 6, 34, 6, 8, INK) + R(x + 5, 35, 8, 6, INK) + R(x + 6, 35, 6, 1, '#3A3A3A') +
          (i === 1 ? g('rec', label) : label)
      }).join('')
    }
    case 'scroll':
      return R(56, 18, 2, 1, '#8A8A92') + R(54, 19, 2, 1, '#8A6248') + R(58, 19, 2, 1, '#8A6248') + R(52, 20, 2, 1, '#8A6248') + R(60, 20, 2, 1, '#8A6248') +
        R(46, 21, 22, 2, WOOD_D) + R(48, 23, 18, 37, '#F2EAD0') + R(48, 23, 1, 37, '#DCCFA8') + R(46, 60, 22, 2, WOOD_D) + R(45, 60, 1, 2, '#8A6248') + R(68, 60, 1, 2, '#8A6248') +
        R(60, 28, 3, 3, '#D9434E') +
        pmap(['....k.......', '...kkk......', '..kkkkk..k..', '.kkkkkkkkkk.', 'kkkkkkkkkkkk'], 50, 42, 1.4, { k: '#3A3936' }) +
        R(50, 50, 14, 1, '#3A3936', op(0.35)) + R(52, 53, 10, 1, '#3A3936', op(0.2)) + R(51, 26, 1, 8, '#3A3936', op(0.8)) + R(53, 27, 1, 5, '#3A3936', op(0.8))
    case 'neonsign': {
      const lt = (x: number, dir: 1 | -1): string => [0, 1, 2, 3, 2, 1, 0].map((k, i) => R(x + (dir > 0 ? (3 - k) * 2 : k * 2), 34 + i * 2, 2, 2, MAGENTA)).join('')
      return R(38, 30, 40, 22, '#1A1420') + R(38, 30, 40, 1, '#3A3040') + R(38, 51, 40, 1, '#3A3040') +
        R(39, 31, 1, 1, DIM) + R(76, 31, 1, 1, DIM) + R(39, 50, 1, 1, DIM) + R(76, 50, 1, 1, DIM) +
        R(42, 33, 12, 16, MAGENTA, op(0.15)) + R(53, 33, 10, 16, CYAN, op(0.15)) + R(62, 33, 12, 16, MAGENTA, op(0.15)) +
        lt(44, 1) + [0, 1, 2, 3, 4, 5, 6].map((i) => R(54 + i, 46 - i * 2, 2, 2, CYAN)).join('') + g('nfk', lt(64, -1))
    }
    case 'banner': {
      const tails = [10, 8, 6, 4, 3, 2].map((w, k) => R(48, 56 + k, w, 1, '#6A2234') + R(70 - w, 56 + k, w, 1, '#6A2234')).join('')
      return R(45, 22, 28, 2, GOLD) + R(43, 21, 2, 4, GOLD_L) + R(73, 21, 2, 4, GOLD_L) +
        R(48, 24, 22, 32, '#6A2234') + tails + R(48, 24, 1, 32, GOLD) + R(69, 24, 1, 32, GOLD) + R(49, 25, 20, 1, GOLD) + R(50, 26, 1, 28, '#8A3448') +
        pmap(['y...yy...y', 'yy.yyyy.yy', 'yyyyyyyyyy', 'yryyyyyyry', 'yyyyyyyyyy'], 54, 30, 1, { y: GOLD, r: '#D9434E' }) +
        pmap(['o....o', 'oo..oo', '.oooo.', '..oo..', '..oo..'], 56, 39, 1, { o: ORANGE })
    }
    case 'goldrecord':
      return R(44, 24, 30, 36, '#3B281D') + R(44, 24, 30, 1, '#5A4030') + R(46, 26, 26, 32, '#141413') +
        disc(59, 38, 9, GOLD) + disc(59, 38, 7, GOLD_D) + disc(59, 38, 6, GOLD) + disc(59, 38, 4, GOLD_D) + disc(59, 38, 3, GOLD) +
        R(57, 36, 4, 4, '#D9434E') + R(58.5, 37.5, 1, 1, '#141413') + R(53, 33, 2, 1, GOLD_L) + R(52, 35, 1, 2, GOLD_L) +
        R(52, 50, 14, 4, GOLD_D) + R(54, 51.5, 10, 1, '#3B281D') +
        g('skw', R(67, 27, 1.5, 5, SPARK) + R(65.25, 28.75, 5, 1.5, SPARK))
    default:
      return ''
  }
}

// ---------- window views (only the landscape layer, inside the window clip 152..248 x 20..96) ----------

const SKYLINE: Record<DayPhase, string> = { night: '#161B33', morning: '#7E7FA8', day: '#7A98BC', sunset: '#4A2A4E' }

function rand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

const snowy = (month: number): boolean => month === 12 || month === 1 || month === 2
const lit = (phase: DayPhase): boolean => phase === 'night' || phase === 'sunset'

// The original skyline, as scene.ts windowSvg drew it: the same buildings, colours and lit windows. Its rand
// starts where the scene's did (the night sky took 16 stars x 3 draws first), so the windows match.
function city(phase: DayPhase, month: number): string {
  const r = rand(5)
  if (phase === 'night') for (let i = 0; i < 48; i++) r()
  const buildings: ReadonlyArray<readonly [number, number, number]> = [[152, 14, 18], [166, 10, 26], [176, 16, 14], [192, 12, 30], [204, 18, 20], [222, 10, 24], [232, 16, 16]]
  let out = ''
  for (const [bx, bw, bh] of buildings) {
    out += R(bx, 96 - bh, bw, bh, SKYLINE[phase])
    if (snowy(month)) out += R(bx, 96 - bh, bw, 2, '#F2F2F2')
    if (lit(phase)) {
      for (let wy = 96 - bh + 4; wy < 94; wy += 5) {
        for (let wx = bx + 2; wx < bx + bw - 2; wx += 4) {
          if (r() < 0.35) out += R(wx, wy, 2, 2, '#F2C66B', r() < 0.2 ? cls('bl') : op(0.85))
        }
      }
    }
  }
  return out
}

function pine(cx: number, base: number, h: number, fill: string, snow: boolean, trunk = true): string {
  const tier = Math.max(3, Math.round(h / 4))
  let out = trunk ? R(cx - 1, base - 3, 2, 3, '#3A2A20') : ''
  const widths = [2, 6, 10, 14]
  for (let k = 0; k < 4; k++) {
    const w = Math.round((widths[k]! * h) / 28)
    out += R(Math.max(152, cx - w / 2), base - 3 - (4 - k) * tier, Math.min(248, cx + w / 2) - Math.max(152, cx - w / 2), tier, fill)
  }
  if (snow) out += R(cx - 1, base - 3 - 4 * tier, 2, 2, '#F2F2F2')
  return out
}

const PINES: Record<DayPhase, readonly [string, string, string]> = {
  night: ['#1C2A3A', '#0F1A24', '#F2C66B'], morning: ['#7A93A0', '#3F6A5A', '#3A2A20'],
  day: ['#6E9A80', '#2F5E44', '#3A2A20'], sunset: ['#6A4560', '#3A2238', '#F2C66B'],
}

function pines(phase: DayPhase, month: number): string {
  const [back, front, glow] = PINES[phase]
  const snow = snowy(month)
  let out = ''
  ;[[156, 22], [170, 18], [186, 24], [200, 19], [216, 23], [230, 18], [244, 21]].forEach(([x, h]) => { out += pine(x!, 86, h!, back, snow, false) })
  out += R(152, 83, 96, 7, back) + R(204, 82, 12, 8, '#5A3E2E') + R(202, 79, 16, 3, '#3A2A20') + R(205, 76, 10, 3, '#3A2A20') + R(213, 74, 2, 3, '#3A2A20') + R(207, 84, 3, 3, glow)
  out += R(152, 90, 96, 6, snow ? '#E8ECF2' : front)
  ;[[158, 28], [174, 24], [190, 30], [228, 26], [242, 30]].forEach(([x, h]) => { out += pine(x!, 96, h!, front, snow) })
  return out
}

const PEAKS: Record<DayPhase, readonly [string, string, string, string]> = {
  night: ['#3A4466', '#2A3354', '#C8CCDA', '#1A2238'], morning: ['#9A9CC0', '#7A7FA8', '#F6EEF2', '#5E6A80'],
  day: ['#9AB4CC', '#6A88A8', '#F2F6FA', '#4E6E58'], sunset: ['#7A4A6E', '#5A3256', '#F2C8C0', '#3A2238'],
}

function peak(apex: number, top: number, slope: number, fill: string, snowFill: string, snowRows: number): string {
  let out = ''
  for (let y = top, row = 0; y < 96; y += 3, row++) {
    const half = (y - top + 3) * slope
    const x0 = Math.max(152, apex - half)
    const x1 = Math.min(248, apex + half)
    if (x1 > x0) out += R(x0, y, x1 - x0, Math.min(3, 96 - y), row < snowRows ? snowFill : fill)
  }
  return out
}

function mountains(phase: DayPhase, month: number): string {
  const [back, front, snow, ground] = PEAKS[phase]
  const deep = snowy(month)
  return peak(222, 50, 1.1, back, snow, deep ? 4 : 2) + peak(180, 42, 1.2, front, snow, deep ? 6 : 3) +
    R(170, 54, 3, 2, front) + R(186, 57, 4, 2, front) + R(152, 90, 96, 6, deep ? '#E8ECF2' : ground) +
    R(240, 22, 8, 2, WOOD_D) + R(234, 25, 7, 2, WOOD_D) + R(229, 28, 6, 2, WOOD_D) + R(226, 31, 4, 1, WOOD_D) +
    R(244, 24, 3, 3, '#F2A7C3') + R(237, 22, 3, 3, '#E5809F') + R(232, 27, 3, 3, '#F2A7C3') + R(227, 29, 2, 2, '#E5809F') + R(236, 28, 2, 2, '#F8C8DA')
}

const SEA: Record<DayPhase, readonly [string, string, string]> = {
  night: ['#1E2850', '#0A1028', '#E8E6DC'], morning: ['#9AA6D0', '#5A6A9A', '#FFE3A3'],
  day: ['#5F9FDC', '#2F6AA8', '#FFFFFF'], sunset: ['#C0607E', '#4A2450', '#FFB36B'],
}

function lerp(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number): number => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t)
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0').toUpperCase()
}

function sea(phase: DayPhase): string {
  const [top, deep, glint] = SEA[phase]
  let out = ''
  for (let i = 0; i < 6; i++) out += R(152, 74 + i * 4, 96, i === 5 ? 2 : 4, lerp(top, deep, i / 5))
  const gx = phase === 'night' ? 228 : phase === 'day' ? 200 : 178
  out += g('bl', R(gx - 3, 76, 6, 1, glint) + R(gx - 5, 81, 10, 1, glint) + R(gx - 2, 86, 4, 1, glint), op(0.6))
  let waves = ''
  for (let x = 152; x < 224; x += 16) waves += R(x, 79, 6, 1, '#FFFFFF') + R(x + 8, 89, 5, 1, '#FFFFFF')
  out += g('wvs', waves, op(0.3))
  out += g('sbt', R(160, 72, 8, 2, WOOD) + R(161, 74, 6, 0.5, WOOD_D) + R(163, 64, 1, 8, '#3A3936') + R(164, 65, 1, 6, CREAM) + R(165, 66, 1, 5, CREAM) + R(166, 67, 1, 4, CREAM) + R(167, 68, 1, 3, CREAM))
  return out
}

const NEON: Record<DayPhase, string> = { night: '#14101E', morning: '#3A3550', day: '#3A4560', sunset: '#2A1530' }

function neoncity(phase: DayPhase): string {
  const towers: ReadonlyArray<readonly [number, number, number]> = [[152, 10, 50], [163, 8, 62], [172, 12, 44], [185, 9, 70], [195, 14, 52], [210, 8, 66], [219, 12, 40], [232, 9, 58], [242, 6, 46]]
  const bright = lit(phase)
  let edges = ''
  let strips = ''
  let out = R(152, 72, 96, 8, MAGENTA, op(0.18))
  towers.forEach(([x, w, h], i) => {
    out += R(x, 96 - h, w, h, NEON[phase]) + R(x + 2, 92 - h, w - 4, 4, NEON[phase])
    edges += R(x, 96 - h, 1, h, i % 2 ? CYAN : MAGENTA)
    // lit window columns, broken by a floor gap
    strips += R(x + Math.floor(w / 2) - 1, 100 - h, w > 9 ? 3 : 1, Math.round(h * 0.45), i % 2 ? MAGENTA : CYAN) + R(x + Math.floor(w / 2) - 1, 104 - h + Math.round(h * 0.45), w > 9 ? 3 : 1, Math.round(h * 0.55) - 12, i % 2 ? MAGENTA : CYAN)
  })
  out += g('nfk', edges, op(bright ? 0.9 : 0.45)) + `<g${op(bright ? 0.6 : 0.25)}>${strips}</g>`
  out += R(189, 21, 1, 5, '#8A8A92') + R(188.5, 20, 2, 1.5, '#E0554A', cls('bl'))
  if (phase === 'night') out += g('fcr', R(160, 40, 4, 1.5, CYAN) + R(158, 40.5, 2, 1, MAGENTA, op(0.7)))
  return out
}

function orbit(): string {
  const r = rand(11)
  const twinkles = ['', '', '', '']
  for (let i = 0; i < 20; i++) {
    const s = r() < 0.25 ? 1.5 : 1
    twinkles[i % 4] += R(153 + Math.round(r() * 92), 21 + Math.round(r() * 50), s, s, '#E8E6DC')
  }
  // the Earth's limb: 3-px rows of a big circle, with a 1-px atmosphere line along each row's new top edge
  let rim = ''
  let earth = ''
  let prev = 0
  const span = (a: number, b: number, y: number, h: number, fill: string): string => {
    const x0 = Math.max(152, a)
    const x1 = Math.min(248, b)
    return x1 > x0 ? R(x0, y, x1 - x0, h, fill) : ''
  }
  for (let y = 75; y < 96; y += 3) {
    const half = Math.round(Math.sqrt(Math.max(0, 70 * 70 - (144 - y) ** 2)))
    earth += span(200 - half, 200 + half, y, Math.min(3, 96 - y), '#3B6FC8')
    rim += prev === 0 ? span(200 - half, 200 + half, y - 1, 1, '#7FE3F0') : span(200 - half, 200 - prev, y - 1, 1, '#7FE3F0') + span(200 + prev, 200 + half, y - 1, 1, '#7FE3F0')
    prev = half
  }
  return R(152, 20, 96, 76, '#05060E') + twinkles.map((t, i) => `<g class="st t${i}">${t}</g>`).join('') + earth + rim +
    R(184, 82, 10, 3, '#4F9A5A') + R(187, 85, 5, 2, '#4F9A5A') + R(206, 86, 14, 3, '#4F9A5A') + R(170, 90, 10, 3, '#4F9A5A') + R(222, 91, 8, 2, '#4F9A5A') +
    R(196, 79, 8, 1.5, '#F2F6FA') + R(214, 82, 8, 1.5, '#F2F6FA') + R(160, 93, 8, 1.5, '#F2F6FA') +
    g('sat', R(168, 36, 3, 2, SILVER) + R(164, 36.5, 4, 1, '#3B6FC8') + R(171, 36.5, 4, 1, '#3B6FC8'))
}

const HILL = '#24375E' // Aurora Night's hills: clearly lighter than the lower sky (#0F1E40)

function aurora(month: number): string {
  const r = rand(23)
  let stars = ''
  for (let i = 0; i < 7; i++) stars += R(153 + Math.round(r() * 92), 21 + Math.round(r() * 30), 1, 1, '#E8E6DC')
  // curtains of light: thin columns along a wave, alternating long and short rays
  const ribbon = (c: string, base: number, ph: number, k: number): string => {
    let cols = ''
    for (let x = 153, i = 0; x < 248; x += 8, i++) cols += R(x, Math.round(base + 5 * Math.sin(x / 11 + ph)), 4, i % 2 ? 8 : 12, c)
    return g('aur', cols, op(0.5) + dly(-k * 2))
  }
  const cap = snowy(month) ? '#F2F4FA' : '#C8D2E6'
  // a snowy mound: 4-px rows of a circle whose centre sits below the window, down to the ground strip. The body
  // is a lighter blue than the night sky behind it and the snow runs down both shoulders (not where the window
  // cuts the hill off), so each hill reads as a shape, not a floating bar.
  const hill = (cx: number, top: number, rad: number): string => {
    let out = ''
    for (let y = top, i = 0; y < 92; y += 4, i++) { // the ground strip, drawn after, covers what runs past 92
      const half = Math.round(Math.sqrt(Math.max(0, rad * rad - (top + rad - y - 2) ** 2)))
      const x0 = Math.max(152, cx - half)
      const x1 = Math.min(248, cx + half)
      if (x1 <= x0) continue
      out += R(x0, y, x1 - x0, 4, i < 1 ? cap : HILL)
      if (i === 1 && x0 > 152) out += R(x0, y, Math.min(4, x1 - x0), 2, cap)
      if (i === 1 && x1 < 248) out += R(Math.max(x0, x1 - 4), y, Math.min(4, x1 - x0), 2, cap)
    }
    return out
  }
  return R(152, 20, 96, 40, '#070D1F') + R(152, 60, 96, 36, '#0F1E40') + g('st t1', stars) +
    ribbon('#4FE08A', 28, 0, 0) + ribbon('#3FC8C0', 37, 1.6, 1) + ribbon('#9A6CE0', 46, 3.1, 2) +
    hill(206, 82, 18) + hill(238, 79, 20) + hill(168, 76, 22) + R(152, 92, 96, 4, '#0B1222')
}

export function viewSvg(kind: string, phase: DayPhase, month: number): string {
  const ph: DayPhase = phase in SKYLINE ? phase : 'day'
  switch (kind) {
    case 'city': return city(ph, month)
    case 'pines': return pines(ph, month)
    case 'mountains': return mountains(ph, month)
    case 'sea': return sea(ph)
    case 'neoncity': return neoncity(ph)
    case 'orbit': return orbit()
    case 'aurora': return aurora(month)
    default: return ''
  }
}

// ---------- animation ----------

export const DECOR_CSS = `
@keyframes ctl{0%,100%{transform:rotate(0)}50%{transform:rotate(-25deg)}}
.ctl{animation:ctl 3s ease-in-out infinite;transform-box:fill-box;transform-origin:left bottom}
@keyframes rmb{from{transform:translateX(0)}to{transform:translateX(64px)}}
.rmb{animation:rmb 24s ease-in-out infinite alternate}
.m-sleeping .rmb{animation-play-state:paused}
.a-terraform .cat{opacity:0}
.a-terraform .crg{opacity:0}
@keyframes fsh{from{transform:translateX(0)}to{transform:translateX(8px)}}
.fsh{animation:fsh 3.5s ease-in-out infinite alternate}
@keyframes fz{0%{transform:translateY(0);opacity:0}30%{opacity:.9}100%{transform:translateY(-8px);opacity:0}}
.fz{animation:fz 1.4s infinite}
@keyframes sfh{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
.sfh{animation:sfh 4s ease-in-out infinite;transform-box:fill-box;transform-origin:center bottom}
@keyframes bbx{0%,100%{transform:scale(1)}50%{transform:scale(.8)}}
.bbx{animation:bbx .45s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes glb{0%,100%{transform:translateX(0)}50%{transform:translateX(1px)}}
.glb{animation:glb 3s steps(2) infinite}
@keyframes snp{0%,88%,96%,100%{transform:scaleY(1)}92%{transform:scaleY(.35)}}
.snp{animation:snp 6s infinite;transform-box:fill-box;transform-origin:50% 100%}
@keyframes ptl{0%{transform:translate(0,0);opacity:0}10%{opacity:1}100%{transform:translate(-6px,30px);opacity:0}}
.ptl{animation:ptl 7s linear infinite}
@keyframes cgl{0%,100%{opacity:.04}50%{opacity:.14}}
.cgl{animation:cgl 3s ease-in-out infinite}
@keyframes hfs{0%,55%{transform:translateX(0);opacity:0}65%{opacity:1}85%,100%{transform:translateX(16px);opacity:0}}
.hfs{animation:hfs 7s ease-in-out infinite}
@keyframes nfl{0%,40%,44%,48%,100%{opacity:1}42%,46%{opacity:.2}}
.nfl{animation:nfl 4s linear infinite}
@keyframes nfk{0%,60%,64%,100%{opacity:1}62%{opacity:.3}63%{opacity:.8}}
.nfk{animation:nfk 5s linear infinite}
@keyframes arc{0%{opacity:1}50%{opacity:0}100%{opacity:0}}
.arc{animation:arc 1s step-end infinite}
@keyframes ncl{0%,50%,100%{transform:rotate(0)}25%{transform:rotate(28deg)}}
.ncl{animation:ncl 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0}
@keyframes ncr{0%,50%,100%{transform:rotate(0)}75%{transform:rotate(-28deg)}}
.ncr{animation:ncr 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0}
@keyframes cwg{0%,100%{transform:rotate(-20deg)}50%{transform:rotate(20deg)}}
.cwg{animation:cwg .5s ease-in-out infinite;transform-box:fill-box;transform-origin:0 100%}
.m-sleeping .cwg{animation-play-state:paused}
@keyframes cdl{from{transform:translateX(0)}to{transform:translateX(70px)}}
.cdl{animation:cdl 18s ease-in-out infinite alternate}
.m-sleeping .cdl{animation-play-state:paused}
@keyframes cdh{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.m-done .cdh,.m-happy .cdh{animation:cdh .45s ease-in-out infinite}
@keyframes rvr{0%,12%{transform:translateX(0)}44%,56%{transform:translateX(60px)}88%,100%{transform:translateX(0)}}
.rvr{animation:rvr 32s ease-in-out infinite}
.m-sleeping .rvr{animation-play-state:paused}
@keyframes dwg{0%{opacity:1}50%{opacity:0}100%{opacity:0}}
.dwg{animation:dwg .6s step-end infinite}
@keyframes dsm{0%,84%{transform:translate(0,0);opacity:0}88%{opacity:.8}100%{transform:translate(4px,-6px);opacity:0}}
.dsm{animation:dsm 12s ease-out infinite}
@keyframes drt{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.2)}}
.drt{animation:drt .2s linear infinite;transform-box:fill-box;transform-origin:center}
@keyframes dbb{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.dbb{animation:dbb 2.4s ease-in-out infinite}
.m-error .dre{fill:#E5409A}
.m-sleeping .dre{opacity:.4}
@keyframes snl{from{transform:translateY(0)}to{transform:translateY(-12px)}}
.snl{animation:snl 40s linear infinite alternate}
@keyframes bub{0%{transform:translateY(0);opacity:0}20%{opacity:.9}100%{transform:translateY(-7px);opacity:0}}
.bub{animation:bub 2.6s ease-in infinite}
@keyframes gst{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.gst{animation:gst 3s ease-in-out infinite}
@keyframes rec{to{transform:rotate(360deg)}}
.rec{animation:rec 1.8s linear infinite;transform-box:fill-box;transform-origin:center}
@keyframes wvs{from{transform:translateX(0)}to{transform:translateX(16px)}}
.wvs{animation:wvs 4s linear infinite}
@keyframes sbt{from{transform:translateX(0)}to{transform:translateX(64px)}}
.sbt{animation:sbt 60s ease-in-out infinite alternate}
@keyframes fcr{0%{transform:translateX(-12px);opacity:0}10%,90%{opacity:1}100%{transform:translateX(90px);opacity:0}}
.fcr{animation:fcr 12s linear infinite}
@keyframes sat{from{transform:translate(0,0)}to{transform:translate(56px,10px)}}
.sat{animation:sat 50s linear infinite alternate}
@keyframes aur{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(3px) scaleY(.8)}}
.aur{animation:aur 6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0}
`

// Every animation class decorArt defines in DECOR_CSS, so the scene's reduced-motion block can stop them.
export const DECOR_CLASSES: readonly string[] = [
  'ctl', 'rmb', 'fsh', 'fz', 'sfh', 'bbx', 'glb', 'snp', 'ptl', 'cgl', 'hfs', 'nfl', 'nfk', 'arc', 'ncl', 'ncr',
  'cwg', 'cdl', 'cdh', 'rvr', 'dwg', 'dsm', 'drt', 'dbb', 'snl', 'bub', 'gst', 'rec', 'wvs', 'sbt', 'fcr', 'sat', 'aur',
]
