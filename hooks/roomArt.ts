// Pixel art for the room slots the room renderer owns: the pet bed, the desk lamp, the wall clock and
// the ceiling. Coordinates are scene.ts's 400x260 room (floor line y=232). Pure and CSS-only: every
// function returns SVG markup, '' (or null) for an unknown id, so scene.ts can fall back per slot.
//
// Boxes:
//   bed      body 110..186 x 196..232 (the clam's open shell reaches up to y 190), lip 110..186 x 222..232
//   lamp     body 250..285 x 150..196, beam polygons inside 244..308 x 156..196; Clawd sits at the desk over
//            x 212..276 from y 182 down, so a lamp whose light is below y 182 stands right of x 268
//   clock    100..136 x 22..68, dial centred on (118,44); scene.ts draws the hands on top in `hand`
//   ceiling  88..304 x 0..18, along the swag M92 3Q144 11 196 3Q248 11 300 3
// Plain rects are emitted in the exact form scene.ts mergeRects folds into paths.

const ORANGE = '#D97757'
const INK = '#1F1E1D'
const PAPER = '#E8E6DC'
const METAL_D = '#45453F'
const GOLD = '#E2B84A'
const GOLD_D = '#C99A2E'
const GOLD_L = '#F6D88A'
const SPARK = '#FFF7C8'
const GREEN = '#8FB07A'
const BLUE = '#7B9BC9'
const PINK = '#E5677E'
const STRING = '#55554F'
const THREAD = '#8A8A82'
const WOOD = '#6B4A35'
const WOOD_D = '#4E3526'
const WOOD_L = '#8A6248'

const n = (v: number): string => String(Math.round(v * 100) / 100)

function R(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`
}

const cls = (c: string): string => ` class="${c}"`
const op = (o: number): string => ` opacity="${o}"`
const delay = (s: number): string => ` style="animation-delay:${n(s)}s"`
const g = (c: string, body: string, extra = ''): string => `<g class="${c}"${extra}>${body}</g>`

// Character map -> one rect per horizontal run; '.' (or a character missing in pal) is empty.
function pmap(rows: readonly string[], x0: number, y0: number, u: number, pal: Record<string, string>, extra = ''): string {
  let out = ''
  rows.forEach((row, j) => {
    let i = 0
    while (i < row.length) {
      const ch = row[i]!
      let k = i
      while (k < row.length && row[k] === ch) k++
      const fill = pal[ch]
      if (fill) out += R(x0 + i * u, y0 + j * u, (k - i) * u, u, fill, extra)
      i = k
    }
  })
  return out
}

// A stepped disc `d` cells across; `cell` picks each filled cell's character (edge = on the rim).
function disc(d: number, cell: (i: number, j: number, edge: boolean) => string = () => 'x'): string[] {
  const r = d / 2
  const filled: boolean[][] = []
  for (let j = 0; j < d; j++) {
    const dy = j + 0.5 - r
    const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)))
    const pad = Math.round(r - half)
    filled.push(Array.from({ length: d }, (_, i) => i >= pad && i < d - pad))
  }
  const at = (i: number, j: number): boolean => filled[j]?.[i] === true
  return filled.map((row, j) => row.map((on, i) => {
    if (!on) return '.'
    const edge = !at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1)
    return cell(i, j, edge)
  }).join(''))
}

// A small four-point sparkle on wall time (room sparkles keep twinkling across scene changes).
const sparkle = (x: number, y: number, fill = SPARK): string => g('skw', R(x + 1.5, y, 1.5, 4.5, fill) + R(x, y + 1.5, 4.5, 1.5, fill))

// ---------- pet bed ----------

const BED_IDS = ['cushion', 'basket', 'throne', 'clam', 'pod', 'box', 'beanbag', 'cloud'] as const

// Cloud bumps: a stepped dome from `top` down to y 226.
const bump = (x: number, top: number, w: number, fill: string): string =>
  R(x + 4, top, w - 8, 2, fill) + R(x + 2, top + 2, w - 4, 2, fill) + R(x, top + 4, w, 222 - top, fill)

function weave(x0: number, x1: number, ys: readonly number[], fill: string): string {
  let out = ''
  ys.forEach((y, row) => {
    for (let x = x0 + (row % 2) * 4; x + 4 <= x1; x += 8) out += R(x, y, 4, 2, fill)
  })
  return out
}

export function bedSvg(kind: string): string {
  switch (kind) {
    case 'cushion':
      return R(116, 216, 64, 4, '#7486A6') + R(112, 218, 72, 14, '#5E6F8C') + R(120, 219, 56, 3, '#4B5A73') + R(112, 230, 72, 2, '#4B5A73')
    case 'basket':
      return R(112, 216, 72, 16, '#C9A06A') + R(112, 218, 2, 14, '#A07A4A') + R(182, 218, 2, 14, '#A07A4A') +
        weave(114, 182, [220, 224, 228], '#A07A4A') +
        R(112, 216, 72, 2, '#F2EFE6') + R(114, 218, 68, 1, '#D8D2C4') + R(112, 231, 72, 1, '#8A6238')
    case 'throne':
      return R(120, 202, 56, 14, GOLD_D) + R(116, 206, 4, 10, GOLD_D) + R(176, 206, 4, 10, GOLD_D) + R(142, 198, 12, 4, GOLD_D) +
        R(120, 202, 56, 1, GOLD_L) + R(142, 198, 12, 1, GOLD_L) + R(116, 206, 4, 1, GOLD_L) + R(176, 206, 4, 1, GOLD_L) +
        R(124, 205, 48, 11, '#6A1622') + R(146, 199, 4, 3, '#D9434E') + R(146, 208, 4, 4, GOLD_D) + R(147, 209, 2, 2, GOLD_L) +
        R(112, 216, 72, 16, '#8E1F2E') + R(116, 218, 64, 2, '#A8323F') + R(112, 216, 72, 1, GOLD) + R(112, 228, 72, 1, GOLD) +
        R(112, 231, 72, 1, '#5E1420') +
        R(110, 214, 3, 3, GOLD) + R(183, 214, 3, 3, GOLD) + R(110, 229, 3, 3, GOLD) + R(183, 229, 3, 3, GOLD)
    case 'clam': {
      const F = '#F2D6DE', RIB = '#E8BCC8', EDGE = '#C98A9C'
      // the open upper shell fans out behind on the left, its ribs meeting at the hinge (131,214)
      let ribs = ''
      for (const [xt, yt] of [[116, 198], [121, 194], [126, 192], [131, 191], [136, 192], [141, 194], [146, 196]] as const) {
        for (let y = yt; y < 212; y += 4) ribs += R(Math.round(xt + ((131 - xt) * (y - yt)) / (214 - yt)), y, 1, 4, RIB)
      }
      let low = ''
      for (let x = 114; x <= 178; x += 8) low += R(x, 216, 2, 14, RIB)
      return R(126, 190, 12, 2, EDGE) + R(121, 192, 22, 2, F) + R(118, 194, 28, 2, F) + R(115, 196, 33, 4, F) + R(113, 200, 37, 6, F) + R(112, 206, 38, 8, F) +
        R(127, 191, 10, 1, F) + ribs +
        R(121, 192, 5, 1, EDGE) + R(138, 192, 5, 1, EDGE) + R(118, 194, 3, 1, EDGE) + R(143, 194, 3, 1, EDGE) +
        R(115, 196, 3, 1, EDGE) + R(146, 196, 2, 1, EDGE) + R(113, 200, 2, 1, EDGE) + R(148, 200, 2, 1, EDGE) + R(112, 206, 1, 8, EDGE) +
        R(112, 214, 72, 1, F) + R(110, 215, 76, 15, F) + R(113, 230, 70, 2, F) + low +
        R(112, 214, 72, 1, EDGE) + R(110, 215, 1, 15, EDGE) + R(185, 215, 1, 15, EDGE) + R(113, 231, 70, 1, EDGE) +
        R(176, 210, 3, 3, '#FFFFFF') + R(177, 213, 2, 1, EDGE) + sparkle(177, 205)
    }
    case 'pod': {
      const TRIM = '#9AA2AE', SHELL = '#E8ECF2', GLASS = '#BFE3F5'
      return R(132, 196, 32, 2, GLASS, op(0.2)) + R(124, 198, 48, 2, GLASS, op(0.2)) + R(120, 200, 56, 4, GLASS, op(0.2)) +
        R(117, 204, 62, 4, GLASS, op(0.2)) + R(116, 208, 64, 6, GLASS, op(0.2)) +
        R(132, 196, 32, 1, GLASS, op(0.6)) + R(124, 198, 8, 1, GLASS, op(0.6)) + R(164, 198, 8, 1, GLASS, op(0.6)) + R(128, 201, 6, 1, '#FFFFFF', op(0.5)) +
        R(116, 214, 64, 18, TRIM) + R(113, 216, 70, 14, TRIM) + R(112, 218, 72, 10, TRIM) +
        R(117, 215, 62, 16, SHELL) + R(114, 217, 68, 12, SHELL) + R(113, 219, 70, 8, SHELL) +
        R(113, 222, 70, 1, TRIM) + R(120, 226, 40, 1, '#C8CED6') + R(158, 217, 10, 3, '#2E3A4E') +
        R(171, 218, 4, 2, '#4FD6E8', cls('pod'))
    }
    case 'box': {
      const K = '#B08A5A', KD = '#8A6A42', FLAP = '#9A7548'
      return R(110, 206, 2, 2, FLAP) + R(110, 208, 4, 2, FLAP) + R(110, 210, 6, 2, FLAP) + R(112, 211, 2, 1, KD) +
        R(184, 206, 2, 2, FLAP) + R(182, 208, 4, 2, FLAP) + R(180, 210, 6, 2, FLAP) + R(182, 211, 2, 1, KD) +
        R(114, 212, 68, 20, K) + R(116, 212, 64, 3, '#7A5C38') + R(114, 212, 1, 20, KD) + R(181, 212, 1, 20, KD) +
        R(114, 218, 68, 3, '#D8C08A') + R(158, 224, 10, 3, '#C8323C') +
        R(159, 225, 1, 1, '#F2EFE6') + R(161, 225, 1, 1, '#F2EFE6') + R(163, 225, 1, 1, '#F2EFE6') + R(165, 225, 2, 1, '#F2EFE6') +
        R(114, 230, 68, 2, KD)
    }
    case 'beanbag': {
      const T = '#3E8E8A', D = '#2E6E6A', H = '#6FB8B4'
      return R(120, 210, 22, 2, T) + R(154, 210, 22, 2, T) + R(116, 212, 64, 2, T) + R(114, 214, 68, 4, T) + R(112, 218, 72, 11, T) +
        R(114, 229, 68, 3, D) + R(142, 212, 12, 2, D) + R(144, 214, 8, 1, D) + R(148, 216, 1, 12, '#347A76') +
        R(122, 213, 12, 2, H) + R(118, 215, 6, 3, H)
    }
    case 'cloud': {
      let puffs = ''
      for (const [x, top, w] of [[110, 214, 24], [128, 210, 28], [150, 212, 24], [166, 214, 20]] as const) {
        puffs += bump(x, top, w, '#B8C6E0') + bump(x + 1, top + 1, w - 2, '#F2F4FA')
      }
      return g('cbd', puffs + R(110, 226, 76, 4, '#C8D6EC') + R(112, 230, 72, 2, '#9FB2D0'))
    }
    default:
      return ''
  }
}

// The front of the bed, drawn over Clawd while he sleeps so he sinks in.
export function bedLipSvg(kind: string): string {
  switch (kind) {
    case 'cushion':
      return R(110, 224, 76, 8, '#5E6F8C') + R(110, 224, 76, 2, '#7486A6') + R(110, 230, 76, 2, '#4B5A73')
    case 'basket':
      return R(110, 222, 76, 10, '#C9A06A') + R(110, 222, 76, 2, '#DDB884') + weave(112, 186, [225, 228], '#A07A4A') + R(110, 230, 76, 2, '#8A6238')
    case 'throne':
      return R(110, 222, 76, 10, '#8E1F2E') + R(114, 225, 68, 2, '#A8323F') + R(110, 222, 76, 1, GOLD) + R(110, 229, 76, 1, GOLD) +
        R(110, 231, 76, 1, '#5E1420') + R(110, 222, 3, 3, GOLD) + R(183, 222, 3, 3, GOLD)
    case 'clam': {
      let ribs = ''
      for (let x = 114; x <= 178; x += 8) ribs += R(x, 223, 2, 7, '#E8BCC8')
      return R(110, 222, 76, 8, '#F2D6DE') + R(112, 230, 72, 2, '#F2D6DE') + ribs +
        R(110, 222, 76, 1, '#C98A9C') + R(110, 223, 1, 7, '#C98A9C') + R(185, 223, 1, 7, '#C98A9C') + R(112, 231, 72, 1, '#C98A9C')
    }
    case 'pod':
      return R(112, 222, 72, 7, '#E8ECF2') + R(113, 229, 70, 2, '#E8ECF2') + R(112, 222, 72, 1, '#9AA2AE') + R(112, 223, 1, 6, '#9AA2AE') +
        R(183, 223, 1, 6, '#9AA2AE') + R(116, 231, 64, 1, '#9AA2AE') + R(118, 226, 30, 1, '#C8CED6')
    case 'box':
      return R(114, 222, 68, 10, '#B08A5A') + R(114, 222, 68, 1, '#C9A26E') + R(114, 222, 1, 10, '#8A6A42') + R(181, 222, 1, 10, '#8A6A42') +
        R(158, 224, 10, 3, '#C8323C') + R(159, 225, 1, 1, '#F2EFE6') + R(161, 225, 1, 1, '#F2EFE6') + R(163, 225, 1, 1, '#F2EFE6') +
        R(165, 225, 2, 1, '#F2EFE6') + R(114, 230, 68, 2, '#8A6A42')
    case 'beanbag':
      return R(112, 222, 72, 7, '#3E8E8A') + R(114, 229, 68, 2, '#2E6E6A') + R(116, 231, 64, 1, '#2E6E6A') +
        R(118, 223, 12, 2, '#6FB8B4') + R(148, 222, 1, 6, '#347A76')
    case 'cloud':
      return g('cbd', R(112, 222, 72, 1, '#F2F4FA') + R(110, 223, 76, 3, '#F2F4FA') +
        R(129, 222, 1, 3, '#B8C6E0') + R(148, 222, 1, 3, '#B8C6E0') + R(167, 222, 1, 3, '#B8C6E0') +
        R(110, 226, 76, 4, '#C8D6EC') + R(112, 230, 72, 2, '#9FB2D0'))
    default:
      return ''
  }
}

// ---------- desk lamp (on = 19:00-07:00 and not sleeping) ----------

const LAMP_IDS = ['desk', 'bankers', 'anglepoise', 'lantern', 'moon', 'plasma', 'candle'] as const

const beam = (points: string): string => `<polygon class="lmp" points="${points}" fill="#FFE6A8" opacity=".16" shape-rendering="auto"/>`
const glow = (cx: number, cy: number, rx: number, ry: number, fill: string, o: number): string =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${o}" shape-rendering="auto"/>`

// Plasma lightning: two frames of three 1-px forks from the core to the glass.
const FORKS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[273, 177], [272, 176], [272, 175], [271, 174], [278, 179], [279, 179], [280, 178], [281, 178], [282, 177], [274, 182], [273, 183], [273, 184], [272, 185]],
  [[278, 177], [279, 176], [279, 175], [280, 174], [273, 180], [272, 180], [271, 181], [270, 181], [277, 182], [278, 183], [278, 184], [279, 185]],
]

export function lampSvg(kind: string, on: boolean): string {
  switch (kind) {
    case 'desk':
      return (on ? `<polygon class="lmp" points="268,164 280,164 308,196 244,196" fill="#FFE6A8" opacity=".16" shape-rendering="auto"/>` : '') +
        R(256, 193, 12, 3, '#3E3E3A') + R(261, 164, 2, 29, '#4A4A45') + R(261, 162, 8, 2, '#4A4A45') +
        R(266, 158, 14, 6, '#D9A441') + R(266, 158, 14, 1, '#F2C66B') + R(268, 164, 10, 2, on ? '#FFF1B0' : '#8A8A82')
    case 'bankers':
      return (on ? beam('262,176 282,176 296,196 250,196') : '') +
        R(262, 192, 20, 4, '#C9A45B') + R(262, 192, 20, 1, '#E2C47A') + R(262, 195, 20, 1, '#9A7A2E') +
        R(271, 176, 2, 16, '#C9A45B') + R(270, 190, 4, 2, '#9A7A2E') + R(277, 176, 1, 7, '#9A7A2E') + R(276, 183, 3, 2, '#C9A45B') +
        R(264, 170, 16, 2, '#3E8E5A') + R(260, 172, 24, 4, '#3E8E5A') + R(264, 170, 16, 1, '#6FB88A') + R(262, 172, 20, 1, '#6FB88A') +
        R(260, 175, 24, 1, '#2E6E46') + (on ? R(262, 176, 20, 1, '#FFF1B0') : '')
    case 'anglepoise': {
      const ARM = '#6A6A64', SPRING = '#9A9A92'
      return (on ? beam('272,166 280,166 300,196 282,196') : '') +
        R(254, 193, 12, 3, '#3E3E3A') + R(254, 193, 12, 1, '#5A5A55') +
        R(258, 186, 2, 7, ARM) + R(257, 180, 2, 6, ARM) + R(256, 174, 2, 6, ARM) + R(260, 179, 1, 10, SPRING) +
        R(255, 171, 4, 4, '#3E3E3A') + R(256, 172, 2, 2, THREAD) +
        R(259, 169, 3, 2, ARM) + R(262, 167, 3, 2, ARM) + R(265, 165, 3, 2, ARM) + R(268, 163, 2, 2, ARM) +
        R(261, 171, 2, 1, SPRING) + R(264, 169, 2, 1, SPRING) + R(267, 167, 2, 1, SPRING) +
        R(266, 158, 6, 2, '#D9773A') + R(267, 160, 9, 2, '#D9773A') + R(269, 162, 10, 2, '#D9773A') + R(272, 164, 8, 2, '#D9773A') +
        R(266, 158, 6, 1, '#F09A5A') + R(272, 165, 8, 1, on ? '#FFF1B0' : '#8A5A3A')
    }
    case 'lantern': {
      const BODY = '#3E6E4A', LIT = '#5E8E6A', BAIL = '#9AA0A8'
      return (on ? glow(276, 186, 22, 10, '#FFB36B', 0.14) : '') +
        R(271, 172, 10, 1, BAIL) + R(270, 173, 1, 3, BAIL) + R(281, 173, 1, 3, BAIL) +
        R(271, 175, 10, 2, BODY) + R(269, 177, 14, 2, BODY) + R(269, 177, 14, 1, LIT) +
        R(271, 179, 10, 14, '#FFE6A8', op(on ? 0.8 : 0.3)) + R(269, 179, 2, 14, BODY) + R(281, 179, 2, 14, BODY) +
        R(268, 193, 16, 3, BODY) + R(268, 193, 16, 1, LIT) +
        (on ? g('lfl', R(275, 185, 2, 3, '#F6B53A') + R(275.5, 186, 1, 2, '#FFE14D')) : R(275.5, 189, 1, 4, '#3A3936'))
    }
    case 'moon': {
      const rows = disc(8, (i, j) => (i + j >= 10 ? 's' : 'x'))
      return (on ? glow(276, 180, 15, 15, '#FFF4C8', 0.18) : '') +
        pmap(rows, 268, 172, 2, { x: '#F2EAD0', s: '#D8CFB0' }) +
        R(272, 176, 2, 2, '#C8C0A8') + R(276, 181, 2, 2, '#C8C0A8') + R(271, 183, 2, 1, '#C8C0A8') +
        R(275, 188, 2, 5, WOOD) + R(270, 193, 12, 3, WOOD) + R(270, 193, 12, 1, WOOD_L)
    }
    case 'plasma': {
      const sphere = disc(8, (_i, _j, edge) => (edge ? 'r' : 'x'))
      const forks = on
        ? FORKS.map((f, k) => g('pls', f.map(([x, y]) => R(x, y, 1, 1, '#B89CFF')).join(''), k ? delay(-0.25) : '')).join('')
        : ''
      return R(270, 188, 12, 5, '#2A2A2E') + R(267, 193, 18, 3, '#2A2A2E') + R(270, 188, 12, 1, '#6A6A72') + R(267, 193, 18, 1, '#6A6A72') +
        R(275, 190, 2, 1, on ? '#B89CFF' : '#4A4A52') +
        R(274, 178, 4, 4, on ? '#E9DCFF' : '#6A5A8A') + forks +
        pmap(sphere, 268, 172, 2, { x: '#BFE3F5' }, op(0.25)) + pmap(sphere, 268, 172, 2, { r: '#9FC4DA' }, op(0.5)) +
        R(271, 175, 2, 3, '#FFFFFF', op(0.6))
    }
    case 'candle':
      return (on ? glow(276, 167, 9, 8, '#FFB36B', 0.16) : '') +
        R(274, 174, 4, 16, '#F2EAD0') + R(277, 174, 1, 16, '#C9BFA0') + R(273, 176, 1, 4, '#F2EAD0') + R(278, 179, 1, 3, '#E6DCC0') +
        R(272, 190, 8, 3, '#C9A45B') + R(272, 190, 8, 1, '#E2C47A') + R(268, 193, 16, 3, '#C9A45B') + R(268, 193, 16, 1, '#E2C47A') +
        R(280, 190, 4, 1, '#C9A45B') + R(283, 191, 1, 2, '#C9A45B') +
        R(275.5, 171, 1, 3, '#3A3936') +
        (on ? g('cfl', R(275, 165, 2, 6, '#F6B53A') + R(275.5, 167, 1, 3, '#FFE14D')) +
          g('cfl', R(274.5, 166, 3, 5, '#F6B53A') + R(275.5, 166, 1, 4, '#FFE14D'), delay(-0.3)) : '')
    default:
      return ''
  }
}

// ---------- wall clock (dial centred on (118,44)) ----------

const CLOCK_IDS = ['classic', 'cuckoo', 'porthole', 'sunburst', 'golden', 'tail'] as const

function sunRays(): string {
  let out = ''
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6
    const long = k % 2 === 0
    for (let t = 9; t <= (long ? 17 : 13); t += 2) {
      out += R(Math.round(118 + Math.cos(a) * t) - 1, Math.round(44 + Math.sin(a) * t) - 1, 2, 2, long ? GOLD : GOLD_D)
    }
  }
  return out
}

// A shape with a 1-px rim: every part grown by one in the rim colour, then the parts on top.
const rimmed = (parts: ReadonlyArray<readonly [number, number, number, number]>, fill: string, rim: string): string =>
  parts.map(([x, y, w, h]) => R(x - 1, y - 1, w + 2, h + 2, rim)).join('') + parts.map(([x, y, w, h]) => R(x, y, w, h, fill)).join('')

// The face (everything but the hands) and the colour scene.ts paints the hands in; null when unknown.
export function clockSvg(kind: string): { face: string; hand: string } | null {
  switch (kind) {
    case 'classic':
      return {
        face: R(110, 31, 16, 26, METAL_D) + R(107, 33, 22, 22, METAL_D) + R(105, 36, 26, 16, METAL_D) +
          R(111, 33, 14, 22, PAPER) + R(109, 35, 18, 18, PAPER) + R(107, 38, 22, 12, PAPER) +
          R(117, 35, 2, 3, INK) + R(122, 43, 3, 2, INK) + R(117, 50, 2, 3, INK) + R(111, 43, 3, 2, INK),
        hand: INK,
      }
    case 'cuckoo': {
      const LEAF = '#6E9B5E'
      return {
        face: R(117, 22, 2, 2, LEAF) + R(116, 24, 4, 2, WOOD_D) + R(112, 26, 12, 2, WOOD_D) + R(108, 28, 20, 2, WOOD_D) + R(104, 30, 28, 2, WOOD_D) +
          R(106, 33, 24, 24, WOOD) + R(106, 33, 1, 24, WOOD_L) + R(104, 32, 28, 1, LEAF) + R(104, 33, 2, 2, LEAF) + R(130, 33, 2, 2, LEAF) +
          R(116, 33, 4, 4, '#3B281D') + g('cko', R(116, 34, 3, 2, GOLD) + R(115, 34, 1, 1, '#E8892E')) +
          R(112, 37, 12, 14, '#F2EAD0') + R(111, 38, 14, 12, '#F2EAD0') +
          R(117.5, 38, 1, 2, INK) + R(122, 43.5, 2, 1, INK) + R(117.5, 48, 1, 2, INK) + R(112, 43.5, 2, 1, INK) +
          R(106, 55, 24, 2, WOOD_D) + R(114, 57, 8, 2, WOOD_D) + R(117, 57, 2, 2, LEAF) +
          R(111, 57, 1, 5, '#9AA0A8') + R(125, 57, 1, 5, '#9AA0A8') +
          R(110, 62, 3, 4, '#8A5A3C') + R(124, 62, 3, 4, '#8A5A3C') + R(110, 62, 3, 1, '#B07A4A') + R(124, 62, 3, 1, '#B07A4A'),
        hand: INK,
      }
    }
    case 'porthole':
      return {
        face: pmap(disc(13, (i, j) => (i + j >= 13 ? 's' : 'x')), 105, 31, 2, { x: '#C9A45B', s: '#9A7A2E' }) +
          pmap(disc(9), 109, 35, 2, { x: '#2E3A6E' }) +
          R(117, 32, 2, 2, '#5A4A20') + R(117, 54, 2, 2, '#5A4A20') + R(106, 43, 2, 2, '#5A4A20') + R(128, 43, 2, 2, '#5A4A20') +
          R(117.5, 36, 1, 2.5, '#F2EFE6') + R(117.5, 49.5, 1, 2.5, '#F2EFE6') + R(110, 43.5, 2.5, 1, '#F2EFE6') + R(123.5, 43.5, 2.5, 1, '#F2EFE6') +
          R(112, 38, 3, 1, '#FFFFFF', op(0.3)),
        hand: '#F2EFE6',
      }
    case 'sunburst':
      return {
        face: sunRays() + pmap(disc(9), 109, 35, 2, { x: GOLD_D }) + pmap(disc(8), 110, 36, 2, { x: '#F2EAD0' }) +
          R(117.5, 37, 1, 2, INK) + R(124, 43.5, 2, 1, INK) + R(117.5, 49, 1, 2, INK) + R(110, 43.5, 2, 1, INK),
        hand: INK,
      }
    case 'golden':
      return {
        face: R(110, 31, 16, 26, GOLD) + R(107, 33, 22, 22, GOLD) + R(105, 36, 26, 16, GOLD) +
          R(110, 31, 16, 1, GOLD_L) + R(107, 33, 3, 1, GOLD_L) + R(105, 36, 1, 16, GOLD_L) +
          R(110, 56, 16, 1, GOLD_D) + R(130, 36, 1, 16, GOLD_D) + R(126, 54, 3, 1, GOLD_D) +
          R(111, 33, 14, 22, '#F6F0DC') + R(109, 35, 18, 18, '#F6F0DC') + R(107, 38, 22, 12, '#F6F0DC') +
          R(116.5, 35, 1, 3, INK) + R(118.5, 35, 1, 3, INK) + R(122, 43, 1, 2, INK) + R(123.5, 43, 1, 2, INK) + R(125, 43, 1, 2, INK) +
          R(116.5, 50, 1, 3, INK) + R(118.5, 50, 1, 3, INK) + R(110, 43, 1, 2, INK) + R(111.5, 43, 1, 2, INK) +
          R(117.6, 35, 0.8, 10, '#D9434E', cls('sec')) + sparkle(127, 27),
        hand: INK,
      }
    case 'tail': {
      const C = '#2E2E33', RIM = '#8A8A92', W = '#F2EFE6'
      return {
        face: rimmed([[106, 23, 2, 3], [106, 25, 4, 2], [128, 23, 2, 3], [126, 25, 4, 2], [105, 27, 26, 11], [107, 34, 22, 22], [109, 56, 5, 2], [122, 56, 5, 2]], C, RIM) +
          R(109, 28, 7, 5, W) + R(120, 28, 7, 5, W) + g('tce', R(111, 29, 3, 3, INK) + R(122, 29, 3, 3, INK)) +
          R(117, 33, 2, 1, PINK) + R(103, 33, 4, 1, RIM) + R(129, 33, 4, 1, RIM) +
          R(117.5, 36.5, 1, 2, W) + R(117.5, 50, 1, 2, W) + R(110, 43.5, 2, 1, W) + R(124, 43.5, 2, 1, W) +
          g('tcl', R(116, 58, 4, 6, RIM) + R(117, 58, 2, 6, C) + R(115, 64, 6, 2, RIM) + R(116, 64, 4, 1, C)),
        hand: W,
      }
    }
    default:
      return null
  }
}

// ---------- ceiling (along the swag) ----------

const CEILING_IDS = ['none', 'fairy', 'bunting', 'leaves', 'lanterns', 'neon', 'starlights', 'planes', 'tinsel', 'hearts'] as const

const swag = (stroke: string): string =>
  `<path d="M92 3Q144 11 196 3Q248 11 300 3" stroke="${stroke}" stroke-width="1" fill="none" shape-rendering="auto"/>`

// The swag's height at x (92..300): two quadratic dips of 8 px.
function swagY(x: number): number {
  const t = ((x - 92) % 104) / 104
  return 3 + 16 * t * (1 - t)
}

const STAR5 = ['..y..', '.yyy.', 'yyyyy', '.ydy.', '.d.d.']
const HEART3 = ['h.h', 'hhh', '.h.']
// a grey nose, tail and underside outline the white wing, so the planes read on a light pane too
const PLANE = ['.....o', 'owwwww', '..sss.']

export function ceilingSvg(kind: string, night: boolean): string {
  switch (kind) {
    case 'fairy': {
      const colors = [ORANGE, GOLD, GREEN, BLUE, PINK]
      let out = swag(STRING)
      for (let i = 0; i < 13; i++) {
        const x = 96 + i * 16
        out += R(x - 1.5, swagY(x) + 0.5, 3, 3, colors[i % colors.length]!, cls(`lt${i % 3}`))
      }
      return out
    }
    case 'bunting': {
      const colors = [ORANGE, GOLD, '#4FA3A5', '#4F8BD8', PINK]
      const flags = ['', '']
      for (let i = 0; i < 13; i++) {
        const x = 96 + i * 16
        const y = Math.round(swagY(x))
        const c = colors[i % colors.length]!
        flags[i % 2] += R(x - 2, y, 4, 2, c) + R(x - 1.5, y + 2, 3, 1.5, c) + R(x - 1, y + 3.5, 2, 1, c) + R(x - 0.5, y + 4.5, 1, 0.5, c)
      }
      return swag(STRING) + g('bnt', flags[0]!) + g('bnt', flags[1]!, delay(-1.5))
    }
    case 'leaves': {
      const colors = ['#C8553D', '#E8892E', GOLD]
      let out = swag(WOOD_L)
      for (let i = 0, x = 98; x <= 290; i++, x += 12) {
        const y = Math.round(swagY(x))
        out += R(x - 1, y, 2, 2, colors[i % 3]!) + R(x, y + 1, 2, 2, colors[i % 3]!)
      }
      for (const x of [140, 248]) {
        const y = Math.round(swagY(x))
        out += R(x - 0.5, y, 1, 1, WOOD) + R(x - 1.5, y + 1, 3, 1, WOOD) + R(x - 1, y + 2, 2, 3, '#B07A4A')
      }
      return out + g('lfd', R(170, 9, 2, 2, '#E8892E') + R(171, 10, 2, 2, '#E8892E'))
    }
    case 'lanterns': {
      // the night glows go first, so the lanterns' pixels still merge into a few paths
      const xs = [110, 150, 196, 242, 282]
      let out = swag(STRING) + (night ? xs.map((x) => glow(x, Math.round(swagY(x)) + 6, 7, 5, '#FFB36B', 0.15)).join('') : '')
      xs.forEach((x, i) => {
        const ys = Math.round(swagY(x))
        const y = ys + 2
        const c = i % 2 ? '#F2EFE6' : '#C8323C'
        const rib = i % 2 ? '#C9BFA0' : '#A82828'
        out += R(x - 0.5, ys, 1, 2, STRING) +
          R(x - 2, y, 4, 1, '#3A3936') + R(x - 3, y + 1, 6, 1, c) + R(x - 4, y + 2, 8, 4, c) + R(x - 3, y + 6, 6, 1, c) + R(x - 2, y + 7, 4, 1, '#3A3936') +
          R(x - 2, y + 2, 1, 4, rib) + R(x + 1, y + 2, 1, 4, rib) + R(x - 0.5, y + 8, 1, 1, GOLD)
      })
      return out
    }
    case 'neon':
      return R(94, 4, 204, 6, '#FF5FA2', op(0.15)) + R(98, 10, 196, 5, '#5FE3F0', op(0.12)) + R(140, 4, 2, 2, '#8A8A92') + R(250, 4, 2, 2, '#8A8A92') +
        g('cnk', R(96, 6, 200, 2, '#FF5FA2') + R(96, 8, 2, 4, '#FF5FA2') + R(294, 8, 2, 4, '#FF5FA2')) +
        R(100, 11, 192, 2, '#5FE3F0') + R(100, 13, 2, 3, '#5FE3F0') + R(290, 13, 2, 3, '#5FE3F0')
    case 'starlights': {
      const groups = ['', '', '']
      for (let i = 0; i < 9; i++) {
        const x = 100 + i * 24
        groups[i % 3] += pmap(STAR5, x - 2, Math.round(swagY(x)), 1, { y: '#F6D365', d: GOLD_D })
      }
      return swag(STRING) + groups.map((body, i) => g(`lt${i}`, body)).join('') + sparkle(195, 0)
    }
    case 'planes':
      return R(200, 0, 1, 4, THREAD) + R(180, 4, 40, 1, WOOD_L) +
        R(182, 5, 1, 5, THREAD) + R(200, 5, 1, 8, THREAD) + R(218, 5, 1, 5, THREAD) +
        ([[182, 10, 0], [200, 13, -2.7], [218, 10, -5.3]] as const)
          .map(([x, y, d]) => g('ppm', pmap(PLANE, x - 3, y, 1, { w: '#F2EFE6', s: '#9A9A92', o: '#9A9A92' }), d ? delay(d) : '')).join('')
    case 'tinsel': {
      let out = ''
      for (let i = 0, x = 92; x < 300; i++, x += 6) {
        const y = Math.round(swagY(x + 3)) - 1
        out += R(x, y, 6, 2, i % 2 ? '#C8323C' : '#C3C8CE')
        if (i % 4 === 1) out += R(x + 2, y - 1, 1, 1, '#FFFFFF')
      }
      ;[[144, GOLD], [196, '#4F8BD8'], [248, GOLD]].forEach(([x, c]) => {
        const bx = Number(x)
        const y = Math.round(swagY(bx))
        out += R(bx - 0.5, y + 1, 1, 2, THREAD) + R(bx - 1, y + 3, 2, 1, THREAD) + R(bx - 2, y + 4, 4, 4, String(c)) + R(bx - 1, y + 5, 1, 1, '#FFFFFF')
      })
      return out
    }
    case 'hearts': {
      const groups = ['', '']
      for (let i = 0; i < 13; i++) {
        const x = 100 + i * 16
        groups[i % 2] += pmap(HEART3, x - 1, Math.round(swagY(x)) + 1, 1, { h: i % 2 ? '#E0554A' : '#F2A0B8' })
      }
      return swag(THREAD) + g('hgb', groups[0]!) + g('hgb', groups[1]!, delay(-1))
    }
    default:
      return ''
  }
}

// Every id each room slot draws, in table 2.2 order (tests sweep these).
export const ROOM_IDS = { bed: BED_IDS, lamp: LAMP_IDS, clock: CLOCK_IDS, ceiling: CEILING_IDS } as const

// Animation classes the art above uses that ROOM_CSS defines (reduced motion stops them all).
export const ROOM_CLASSES: readonly string[] = ['pod', 'cbd', 'lfl', 'pls', 'cfl', 'cko', 'sec', 'tce', 'tcl', 'bnt', 'lfd', 'cnk', 'ppm', 'hgb']

export const ROOM_CSS = `
@keyframes pod{0%,100%{opacity:.35}50%{opacity:1}}
.m-sleeping .pod{animation:pod 2.4s ease-in-out infinite}
@keyframes cbd{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}
.cbd{animation:cbd 4s ease-in-out infinite}
@keyframes lfl{0%,100%{transform:scale(1,1)}30%{transform:scale(.8,1.15)}60%{transform:scale(1.1,.9)}}
.lfl{transform-box:fill-box;transform-origin:50% 100%;animation:lfl .6s ease-in-out infinite}
@keyframes rf2{0%,49.9%{opacity:1}50%,100%{opacity:0}}
.pls{animation:rf2 .5s steps(1) infinite}
.cfl{animation:rf2 .6s steps(1) infinite}
@keyframes cko{0%,89.9%{transform:translateX(0);opacity:0}90%,99.9%{transform:translateX(-4px);opacity:1}100%{transform:translateX(0);opacity:0}}
.cko{animation:cko 30s linear infinite}
@keyframes sec{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.sec{transform-origin:118px 44px;animation:sec 60s steps(60) infinite}
@keyframes tce{0%,100%{transform:translateX(-2px)}50%{transform:translateX(2px)}}
.tce{animation:tce 2s ease-in-out infinite}
@keyframes tcl{0%,100%{transform:rotate(14deg)}50%{transform:rotate(-14deg)}}
.tcl{transform-origin:118px 57px;animation:tcl 2s ease-in-out infinite}
@keyframes bnt{0%,100%{transform:skewX(0)}50%{transform:skewX(10deg)}}
.bnt{transform-box:fill-box;transform-origin:50% 0;animation:bnt 3s ease-in-out infinite}
@keyframes lfd{0%,60%{transform:translate(0,0) rotate(0);opacity:0}64%{opacity:1}100%{transform:translate(6px,20px) rotate(120deg);opacity:0}}
.lfd{transform-box:fill-box;transform-origin:center;animation:lfd 9s ease-in infinite}
@keyframes cnk{0%,90%,100%{opacity:1}91%{opacity:.3}93%{opacity:1}95%{opacity:.45}}
.cnk{animation:cnk 5s steps(1) infinite}
@keyframes ppm{0%,40%{transform:scaleX(1)}50%,90%{transform:scaleX(-1)}100%{transform:scaleX(1)}}
.ppm{transform-box:fill-box;transform-origin:center;animation:ppm 8s ease-in-out infinite}
@keyframes hgb{0%,100%{transform:translateY(0)}50%{transform:translateY(1.5px)}}
.hgb{animation:hgb 2s ease-in-out infinite}
`
