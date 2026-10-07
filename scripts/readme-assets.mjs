// Writes the README media into docs/assets/ (Node 23.6+ strips the types). Run `node scripts/readme-assets.mjs`
// from the mod folder; it overwrites the files below and prints each one's size.
//   banner.svg          hero banner: the animated room beside "CLAWD QUEST" in pixel letters
//   hero.svg            one large level-75 room, fully decorated, Clawd coding at sunset
//   stations/<name>.svg Clawd at each activity's station in the same mid-level room
//   progression.svg     the room at level 1, 25 and 100
//   hats.svg            every catalog hat on Clawd
//   day-night.svg       the window at morning, day, sunset and night
//   celebration.svg     the level-100 celebration (its one-shot overlays loop here)
//   decor.svg           a showcase of decor pieces
//   social-preview.png  1280x640 repo social preview, and banner.png, rendered with headless Brave when it is
//                       installed (set BRAVE=/path/to/chromium-like-binary to use another browser; skipped if absent)
// Every SVG is script-free, animates with CSS and brings its own opaque card, so it reads on light and dark pages.
// Several rooms in one file each sit in a nested <svg>; their CSS is scoped to that nested svg so rules never clash.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve: (spec, ctx, next) => {
    try { return next(spec, ctx) } catch (e) { if (spec.startsWith('.')) return next(spec + '.ts', ctx); throw e }
  },
})
const { decorPreview, miniSvg, sceneSvg, decorCrop } = await import('../hooks/scene.ts')
const { DECOR } = await import('../hooks/decor.ts')
const { HATS } = await import('../hooks/game.ts')

const OUT = fileURLToPath(new URL('../docs/assets/', import.meta.url))

// ---------- palette ----------

const ORANGE = '#D97757'
const ORANGE_D = '#A9583D'
const ORANGE_L = '#F0A27F'
const CREAM = '#FAF9F5'
const DARK = '#262624'
const CARD = '#1F1E1D'
const LINE = '#3A3936'
const DIM = '#A3A198'
const GOLD = '#E2B84A'
const ROOM = '#262624' // the room is drawn on the pane's colour: Claude Code's dark pane

// ---------- pixel fonts ----------

// 5x7 title letters.
const BIG = {
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
}

// 3x5 (M, N, W wider) for labels and the tagline.
const SMALL = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'], ' ': ['..', '..', '..', '..', '..'], '.': ['.', '.', '.', '.', '#'],
  '-': ['...', '...', '###', '...', '...'], "'": ['#', '#', '.', '.', '.'], '/': ['..#', '..#', '.#.', '#..', '#..'],
  '+': ['...', '.#.', '###', '.#.', '...'], ':': ['.', '#', '.', '#', '.'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'], '>': ['#..', '.#.', '..#', '.#.', '#..'],
}

const n = (v) => String(Math.round(v * 100) / 100)
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`

// Width of `text` in font units (one unit gap between letters).
function textUnits(font, text) {
  return [...text.toUpperCase()].reduce((w, ch) => w + (font[ch] ?? font[' '])[0].length + 1, 0) - 1
}

// Pixel text: one rect per horizontal run, so the files stay small.
function pixelText(font, text, x, y, u, fill) {
  let out = ''
  let cx = x
  for (const ch of text.toUpperCase()) {
    const g = font[ch] ?? font[' ']
    g.forEach((row, r) => {
      for (let c = 0; c < row.length;) {
        if (row[c] !== '#') { c++; continue }
        let e = c
        while (row[e] === '#') e++
        out += rect(cx + c * u, y + r * u, (e - c) * u, u, fill)
        c = e
      }
    })
    cx += (g[0].length + 1) * u
  }
  return out
}

// Centred small text with an optional 1-unit drop shadow.
function label(text, cx, y, u, fill, shadow) {
  const x = cx - (textUnits(SMALL, text) * u) / 2
  return (shadow ? pixelText(SMALL, text, x + u, y + u, u, shadow) : '') + pixelText(SMALL, text, x, y, u, fill)
}

// The chunky title: a dark under-layer, the face and a highlight on each glyph's top row.
function title(text, x, y, u, face, shade, hi) {
  return pixelText(BIG, text, x, y + u, u, shade) + pixelText(BIG, text, x, y, u, face) +
    pixelText(BIG, text, x, y, u, hi).replace(/<rect[^>]*>/g, (r) => (/ y="([\d.]+)"/.exec(r)?.[1] === n(y) ? r.replace(/height="[\d.]+"/, `height="${n(u / 3)}"`) : ''))
}

// ---------- nesting scenes: scoped CSS, unique ids ----------

// Splits a stylesheet into its top-level blocks: [prelude, body].
function blocks(css) {
  const out = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    let depth = 1
    let j = open + 1
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++ }
    out.push([css.slice(i, open).trim(), css.slice(open + 1, j - 1)])
    i = j
  }
  return out
}

// Prefixes every selector with `scope`; keyframes go to the shared map (same name = same rule here).
function scopeCss(css, scope, frames) {
  let out = ''
  for (const [pre, body] of blocks(css)) {
    if (pre.startsWith('@keyframes')) {
      const name = pre.slice(10).trim()
      const text = `${pre}{${body}}`
      if (frames.has(name) && frames.get(name) !== text) throw new Error(`keyframes ${name} differ between scenes`)
      frames.set(name, text)
    } else if (pre.startsWith('@media')) {
      out += `${pre}{${scopeCss(body, scope, frames)}}`
    } else {
      const sels = pre.split(',').map((s) => s.trim()).filter((s) => s !== ':root' && s !== 'svg')
      if (sels.length) out += sels.map((s) => `${scope} ${s}`).join(',') + `{${body}}`
    }
  }
  return out
}

// Collects the CSS of every nested piece of one output file.
class Sheet {
  constructor() { this.frames = new Map(); this.rules = []; this.keys = new Map(); this.shared = new Set(); this.ids = 0 }

  // A full scene (or decor crop) placed at x,y with the given size; its CSS scoped to a class per distinct sheet.
  scene(svg, x, y, w, h, { bg = ROOM, extraCss = '' } = {}) {
    const m = /^<svg[^>]*viewBox="([^"]+)"[^>]*>/.exec(svg)
    const vb = m[1]
    let css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''
    let body = svg.slice(m[0].length).replace(/<style>[\s\S]*?<\/style>/, '').replace(/<\/svg>$/, '')
    css += extraCss
    let key = this.keys.get(css)
    if (!key) {
      key = 'k' + this.keys.size
      this.keys.set(css, key)
      // the wall clock's turn keyframes depend on the hour, so they get this sheet's own names
      const own = css.replace(/@keyframes (hh|mn)\{/g, `@keyframes $1${key}{`).replace(/\.(hh|mn)\{/g, `.$1${key}{`).replace(/animation:(hh|mn) /g, `animation:$1${key} `)
      this.rules.push(scopeCss(own, `.${key}`, this.frames))
    }
    body = body.replace(/class="(hh|mn)"/g, `class="$1${key}"`)
    const uid = 'i' + this.ids++
    body = body.replace(/\b(id="|url\(#|href="#)(cw[0-9a-z]+)/g, `$1$2${uid}`)
    const [, , vw, vh] = vb.split(' ').map(Number)
    return `<svg class="${key}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" viewBox="${vb}" shape-rendering="crispEdges" overflow="hidden">` +
      (bg ? rect(vb.split(' ')[0], vb.split(' ')[1], vw, vh, bg) : '') + body + `</svg>`
  }

  // A sprite whose CSS is the same in every copy (the minis): kept once, unscoped.
  sprite(svg, x, y, w, h) {
    const m = /^<svg[^>]*viewBox="([^"]+)"[^>]*>/.exec(svg)
    const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''
    this.shared.add(css)
    const body = svg.slice(m[0].length).replace(/<style>[\s\S]*?<\/style>/, '').replace(/<\/svg>$/, '')
    return `<svg x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" viewBox="${m[1]}" shape-rendering="crispEdges">${body}</svg>`
  }

  css() { return [...this.shared].join('') + this.rules.join('') + [...this.frames.values()].join('') }
}

function doc(w, h, sheet, content, titleText) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${titleText}">` +
    `<title>${titleText}</title><style>${sheet.css()}</style>${content}</svg>\n`
}

// The opaque rounded card every image sits on (GitHub shows READMEs on light and dark pages).
const card = (w, h, fill = CARD) => `<rect x="0" y="0" width="${w}" height="${h}" rx="18" fill="${fill}"/>` +
  `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="17" fill="none" stroke="${LINE}" stroke-width="2"/>`
// A rounded window for a scene: dark rim, then the scene clipped by its own svg box.
const frame = (x, y, w, h) => `<rect x="${n(x - 4)}" y="${n(y - 4)}" width="${n(w + 8)}" height="${n(h + 8)}" rx="8" fill="${LINE}"/>`

// ---------- scene inputs ----------

const W = 400
const H = 260
const BASE = { hat: null, hour: 14, minute: 20, month: 5, day: 14, helpers: 0, combo: 0, trophies: 14, plantStage: 3, level: 30, coffee: 2 }

// A cosy mid-level room (everything here opens by level 30 or with an early trophy).
const MID_DECOR = {
  drink: 'tea', plant: 'cactus', poster: 'wave', rug: 'round', shelf: 'boombox', companion: 'cat', bed: 'basket',
  lamp: 'bankers', clock: 'cuckoo', ceiling: 'bunting', wall: 'records', view: 'pines',
}

// The showcase room: level 75, a piece in every slot.
const HERO = {
  ...BASE, mood: 'coding', activity: 'edit', hat: 'archmage', hour: 19, minute: 40, helpers: 2, combo: 25, trophies: 34,
  plantStage: 4, level: 75, coffee: 3,
  decor: {
    drink: 'boba', plant: 'bonsai', poster: 'synthwave', rug: 'galaxy', shelf: 'arcade', companion: 'corgi', bed: 'clam',
    lamp: 'plasma', clock: 'sunburst', ceiling: 'lanterns', wall: 'neonsign', view: 'sea',
  },
}

const BANNER = {
  ...BASE, mood: 'coding', activity: 'edit', hat: 'crown', hour: 18, minute: 30, helpers: 1, combo: 12, trophies: 24,
  plantStage: 4, level: 60, coffee: 3,
  decor: {
    drink: 'matcha', plant: 'orchid', poster: 'synthwave', rug: 'braided', shelf: 'arcade', companion: 'cat', bed: 'throne',
    lamp: 'lantern', clock: 'sunburst', ceiling: 'lanterns', wall: 'scroll', view: 'mountains',
  },
}

const STATIONS = [
  ['coding', 'coding', 'edit'], ['terminal', 'running', 'shell'], ['tests', 'running', 'test'], ['git', 'running', 'git'],
  ['reading', 'reading', 'read'], ['search', 'reading', 'search'], ['web', 'reading', 'web'], ['terraform', 'running', 'terraform'],
  ['subagents', 'working', 'agent'], ['skills', 'working', 'skill'], ['thinking', 'thinking', 'none'],
  ['sleeping', 'sleeping', 'none'], ['error', 'error', 'edit'],
]

// ---------- writers ----------

mkdirSync(join(OUT, 'stations'), { recursive: true })
const written = []
function write(rel, text) {
  const file = join(OUT, rel)
  writeFileSync(file, text)
  const size = statSync(file).size
  const dims = /width="(\d+)" height="(\d+)"/.exec(text)
  written.push([rel, size])
  console.log(`${rel.padEnd(26)} ${String(Math.round(size / 1024)).padStart(4)} KB${dims ? `  ${dims[1]}x${dims[2]}` : ''}`)
}

// A file holding one room on a card with a margin.
function single(input, scale, alt, opts = {}) {
  const sheet = new Sheet()
  const pad = opts.pad ?? 12
  const w = Math.round(W * scale)
  const h = Math.round(H * scale)
  const body = card(w + pad * 2, h + pad * 2) + sheet.scene(sceneSvg(input), pad, pad, w, h, opts)
  return doc(w + pad * 2, h + pad * 2, sheet, body, alt)
}

// ---------- banner / social preview ----------

function bannerLike(totalW, totalH, sceneH, alt, { titleLines = 1, maxU = 10, tagU = 4, chipU = 2.5 } = {}) {
  const sheet = new Sheet()
  const pad = 28
  const sh = sceneH
  const sw = Math.round((sh * W) / H)
  const sx = Math.round((totalH - sh) / 2)
  const sy = sx
  const textX = sx + sw + 52
  const textW = totalW - textX - pad - 8
  const words = titleLines === 1 ? [['CLAWD QUEST']] : [['CLAWD'], ['QUEST']]
  const u = Math.min(maxU, Math.floor(textW / Math.max(...words.map(([w]) => textUnits(BIG, w)))))
  // the tagline, wrapped to the column
  const tag = []
  for (const word of 'A PIXEL PET THAT TURNS YOUR CLAUDE CODE SESSIONS INTO A GAME'.split(' ')) {
    const last = tag[tag.length - 1]
    if (last && textUnits(SMALL, last + ' ' + word) * tagU <= textW) tag[tag.length - 1] = last + ' ' + word
    else tag.push(word)
  }
  const chips = ['LEVELS 1-100', `${HATS.length} HATS`, `${DECOR.filter((d) => d.kind !== 'default').length} DECOR`, 'QUESTS']
  const titleH = 8 * u // 7 rows and the shadow
  const lineGap = Math.round(u * 1.2)
  const tagLineH = 5 * tagU + tagU * 3
  const chipH = 10 * chipU
  let chipRows = 1
  for (let i = 0, cx = 0; i < chips.length; i++) {
    const cw = textUnits(SMALL, chips[i]) * chipU + chipU * 8
    if (cx + cw > textW + 8) { chipRows++; cx = 0 }
    cx += cw + chipU * 4
  }
  const blockH = (chipRows - 1) * (chipH + chipU * 4) + titleH * words.length + lineGap * (words.length - 1) + u * 3 + tag.length * tagLineH - tagU * 3 + u * 3 + chipH
  let y = Math.round((totalH - blockH) / 2)
  let text = ''
  if (titleLines === 1) {
    text += title('CLAWD', textX, y, u, ORANGE, '#7A3B26', ORANGE_L)
    text += title('QUEST', textX + (textUnits(BIG, 'CLAWD ') + 1) * u, y, u, CREAM, '#4A4843', '#FFFFFF')
  } else {
    text += title('CLAWD', textX, y, u, ORANGE, '#7A3B26', ORANGE_L)
    text += title('QUEST', textX, y + titleH + lineGap, u, CREAM, '#4A4843', '#FFFFFF')
  }
  const titleW = Math.max(...words.map(([w]) => textUnits(BIG, w))) * u
  const sparkY = y
  y += titleH * words.length + lineGap * (words.length - 1) + u * 3
  for (const line of tag) { text += pixelText(SMALL, line, textX, y, tagU, '#D9D6CC'); y += tagLineH }
  y += u * 3 - tagU * 3
  let cx = textX
  for (const c of chips) {
    const cw = textUnits(SMALL, c) * chipU + chipU * 8
    if (cx + cw > totalW - pad) { cx = textX; y += chipH + chipU * 4 }
    text += `<rect x="${n(cx)}" y="${n(y)}" width="${n(cw)}" height="${n(chipH)}" rx="${n(chipU * 2)}" fill="${DARK}" stroke="${ORANGE}" stroke-width="2"/>` +
      pixelText(SMALL, c, cx + chipU * 4, y + chipU * 2.5, chipU, ORANGE_L)
    cx += cw + chipU * 4
  }
  // gold sparkles by the title
  const spark = (x, yy, s, fill, d) => `<g class="spk" style="animation-delay:${d}s">${rect(x - s / 2, yy - s * 1.5, s, s * 3, fill)}${rect(x - s * 1.5, yy - s / 2, s * 3, s, fill)}</g>`
  text += spark(textX + titleW - u * 2, sparkY - u * 2.5, u * 0.7, GOLD, 0) + spark(textX + titleW + u * 1.5, sparkY - u * 0.5, u * 0.45, ORANGE_L, 1.2) +
    spark(textX - u * 2.5, sparkY + titleH * words.length - u * 2, u * 0.45, GOLD, 0.6)
  sheet.shared.add('.spk{animation:spk 2.4s ease-in-out infinite}@keyframes spk{0%,100%{opacity:.15}50%{opacity:1}}' +
    '@media (prefers-reduced-motion:reduce){.spk{animation:none}}')
  const body = card(totalW, totalH) + frame(sx, sy, sw, sh) + sheet.scene(sceneSvg(BANNER), sx, sy, sw, sh) + text
  return doc(totalW, totalH, sheet, body, alt)
}

write('banner.svg', bannerLike(1280, 400, 344, 'Clawd Quest: a pixel pet that turns your Claude Code sessions into a game'))
const social = bannerLike(1280, 640, 470, 'Clawd Quest', { titleLines: 2, maxU: 16, tagU: 4, chipU: 3 })

// ---------- hero ----------

write('hero.svg', single(HERO, 2, 'Clawd coding in a fully decorated level 75 room at sunset'))

// ---------- stations ----------

for (const [name, mood, activity] of STATIONS) {
  const input = {
    ...BASE, mood, activity, hat: 'cap', decor: MID_DECOR, helpers: activity === 'agent' ? 2 : 0,
    combo: mood === 'coding' ? 6 : 0, hour: mood === 'sleeping' ? 23 : 14,
  }
  write(`stations/${name}.svg`, single(input, 1.3, `Clawd ${name}`, { pad: 8 }))
}

// ---------- composites ----------

function row(items, cellScale, alt, { labelU = 4, gapX = 20, goldLast = false } = {}) {
  const sheet = new Sheet()
  const pad = 24
  const w = Math.round(W * cellScale)
  const h = Math.round(H * cellScale)
  const labelH = labelU * 5 + 16
  const totalW = pad * 2 + items.length * w + (items.length - 1) * gapX
  const totalH = pad * 2 + h + labelH
  let body = card(totalW, totalH)
  items.forEach(({ input, text, extraCss }, i) => {
    const x = pad + i * (w + gapX)
    body += label(text, x + w / 2, pad, labelU, goldLast && i === items.length - 1 ? GOLD : CREAM, DARK)
    body += frame(x, pad + labelH, w, h) + sheet.scene(sceneSvg(input), x, pad + labelH, w, h, { extraCss })
  })
  return doc(totalW, totalH, sheet, body, alt)
}

const LV100_DECOR = {
  drink: 'goblet', plant: 'crystal', poster: 'halloffame', rug: 'redcarpet', shelf: 'statue', companion: 'dragon', bed: 'pod',
  lamp: 'plasma', clock: 'golden', ceiling: 'starlights', wall: 'goldrecord', view: 'orbit',
}
write('progression.svg', row([
  { text: 'LV 1', input: { ...BASE, mood: 'idle', activity: 'none', level: 1, trophies: 0, plantStage: 0, coffee: 1 } },
  { text: 'LV 25', input: { ...BASE, mood: 'idle', activity: 'none', hat: 'crown', level: 25, trophies: 16, plantStage: 2 } },
  { text: 'LV 100', input: { ...BASE, mood: 'idle', activity: 'none', hat: 'starcrown', level: 100, trophies: 60, plantStage: 4, coffee: 3, decor: LV100_DECOR } },
], 1, 'The room at level 1, 25 and 100', { goldLast: true }))

write('day-night.svg', row([
  { text: 'MORNING 7:00', input: { ...BASE, mood: 'coding', activity: 'edit', hour: 7, minute: 0, decor: MID_DECOR } },
  { text: 'DAY 13:00', input: { ...BASE, mood: 'coding', activity: 'edit', hour: 13, minute: 0, decor: MID_DECOR } },
  { text: 'SUNSET 18:30', input: { ...BASE, mood: 'coding', activity: 'edit', hour: 18, minute: 30, decor: MID_DECOR } },
  { text: 'NIGHT 23:00', input: { ...BASE, mood: 'coding', activity: 'edit', hour: 23, minute: 0, decor: MID_DECOR } },
], 0.7, 'The room at morning, day, sunset and night', { labelU: 3, gapX: 16 }))

// celebration: the overlays play once in the mod; here they loop
const LOOP = '.cf{animation-iteration-count:infinite}.bnr{animation-iteration-count:infinite}.esb{animation-iteration-count:infinite}'
{
  const sheet = new Sheet()
  const pad = 12
  const w = W * 2
  const h = H * 2
  const input = { ...BASE, mood: 'happy', activity: 'none', hat: 'starcrown', hour: 20, minute: 15, level: 100, trophies: 60, plantStage: 4, coffee: 3, celebrate: 'legend', decor: LV100_DECOR }
  const body = card(w + pad * 2, h + pad * 2) + sheet.scene(sceneSvg(input), pad, pad, w, h, { extraCss: LOOP })
  write('celebration.svg', doc(w + pad * 2, h + pad * 2, sheet, body, 'Clawd celebrating level 100'))
}

// ---------- hats ----------

{
  const sheet = new Sheet()
  const perRow = 11
  const cw = 104
  const ch = 104
  const pad = 24
  const rows = Math.ceil(HATS.length / perRow)
  const totalW = pad * 2 + perRow * cw
  const totalH = pad * 2 + rows * ch
  let body = card(totalW, totalH)
  HATS.forEach((hat, i) => {
    const x = pad + (i % perRow) * cw
    const y = pad + Math.floor(i / perRow) * ch
    body += `<rect x="${x + 4}" y="${y + 4}" width="${cw - 8}" height="${ch - 8}" rx="8" fill="${DARK}"/>`
    body += sheet.sprite(miniSvg({ mood: 'idle', activity: 'none', hat: hat.id }, { mirror: true }), x + 4 + (cw - 8 - 88) / 2, y + 8, 88, 71.5)
    body += label(hat.id, x + cw / 2, y + ch - 20, 1.6, DIM)
  })
  write('hats.svg', doc(totalW, totalH, sheet, body, `All ${HATS.length} hats in the wardrobe`))
}

// ---------- decor showcase ----------

{
  const PICKS = [
    ['plant', 'sakura', 14], ['plant', 'crystal', 14], ['poster', 'synthwave', 14], ['poster', 'kraken', 14],
    ['shelf', 'arcade', 14], ['shelf', 'cradle', 14], ['companion', 'dragon', 14], ['companion', 'axolotl', 14],
    ['companion', 'corgi', 14], ['bed', 'clam', 14], ['lamp', 'plasma', 22], ['clock', 'cuckoo', 14],
    ['wall', 'neonsign', 22], ['drink', 'potion', 14], ['view', 'aurora', 23], ['view', 'sea', 18],
  ]
  const sheet = new Sheet()
  const perRow = 8
  const cw = 150
  const ch = 168
  const pad = 24
  const rows = Math.ceil(PICKS.length / perRow)
  const totalW = pad * 2 + perRow * cw
  const totalH = pad * 2 + rows * ch
  let body = card(totalW, totalH)
  PICKS.forEach(([slot, id, hour], i) => {
    const item = DECOR.find((d) => d.slot === slot && d.id === id)
    const x = pad + (i % perRow) * cw
    const y = pad + Math.floor(i / perRow) * ch
    const box = { x: x + 6, y: y + 6, w: cw - 12, h: ch - 40 }
    body += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="8" fill="${ROOM}" stroke="${LINE}" stroke-width="2"/>`
    const input = { ...BASE, mood: 'idle', activity: 'none', hour, level: 30, trophies: 0, plantStage: 4, decor: { [slot]: id } }
    // the shelf crop is the whole shelf; its toys sit at its left end
    const crop = slot === 'shelf' ? [4, 78, 44, 36] : decorCrop(slot, id)
    const [, , vw, vh] = crop
    const s = Math.min((box.w - 16) / vw, (box.h - 16) / vh, 4)
    const pw = vw * s
    const ph = vh * s
    const svg = decorPreview(input, slot, 1).replace(/viewBox="[^"]+"/, `viewBox="${crop.join(' ')}"`)
    body += sheet.scene(svg, box.x + (box.w - pw) / 2, box.y + (box.h - ph) / 2, pw, ph, { bg: null })
    const name = item.name
    body += label(name.length > 18 ? name.split(' ').slice(-2).join(' ') : name, x + cw / 2, y + ch - 26, 2, CREAM)
  })
  write('decor.svg', doc(totalW, totalH, sheet, body, 'A selection of room decor'))
}

// ---------- PNGs ----------

const BRAVE = process.env.BRAVE ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
if (existsSync(BRAVE)) {
  const tmp = mkdtempSync(join(tmpdir(), 'clawd-readme-'))
  const png = (svg, w, h, rel) => {
    const html = join(tmp, rel.replace(/\W/g, '_') + '.html')
    writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${CARD};overflow:hidden}svg{display:block}</style></head><body>${svg.replace(/^<svg /, `<svg style="width:${w}px;height:${h}px" `)}</body></html>`)
    execFileSync(BRAVE, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--screenshot=${join(OUT, rel)}`, `--window-size=${w},${h}`, '--virtual-time-budget=1500', `file://${html}`], { stdio: 'ignore' })
    const size = statSync(join(OUT, rel)).size
    console.log(`${rel.padEnd(26)} ${String(Math.round(size / 1024)).padStart(4)} KB  ${w}x${h}`)
  }
  png(social, 1280, 640, 'social-preview.png')
  png(bannerLike(1280, 400, 344, 'Clawd Quest'), 1280, 400, 'banner.png')
  rmSync(tmp, { recursive: true, force: true })
} else {
  console.log('Brave not found: skipped the PNGs (set BRAVE to a Chromium-like binary)')
}
