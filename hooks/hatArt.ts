import type { AnyHat, HatId } from '../types'

// Clawd's hats, drawn in the unscaled sprite space of scene.ts:
// Clawd's body is x 24..120, y 0..48, the head top is y=0 and the centre line x=72.
// hatMap makes one character an 8x8 pixel, centred on x=72, the last row sitting 4 px into the head.
//
// Rules every hat keeps (hatArt.test.ts checks them):
// - the top stays at or below y -52 (the wizard's 8 rows, -60, are the one old exception; custom hats may
//   use 8 rows too), so the skill spellbook floats clear;
// - nothing opaque sits where the thought bubble's tail dots are drawn (sprite x 116..122 y -16..-10 and
//   x 124..134 y -32..-22): only the bottom row of a hat may run the full 13 columns;
// - every palette has a colour that reads on both a dark (#262624) and a light (#FAF9F5) pane, and no body
//   darker than #5A5A60 goes without a light (#7A7A85 or lighter) edge;
// - plain rects use the scene's exact format so scene.ts mergeRects folds them; animated parts sit in
//   <g class="h-*"> groups styled by HAT_CSS. The old hats keep .prop/.halo/.tw2/.fb from the scene's CSS.
// Pure: imports types only.

const GOLD = '#E2B84A'
const RED = '#C8553D'
const BLUE = '#7B9BC9'
const EDGE = '#7A7A85' // the light outline for dark hats
const STAR_TRIM = '#C99A2E' // the Starlight Crown's gold trim (reads on both panes)
const CAT = '#5A5A64' // the Cat Ears' grey

const n = (v: number): string => String(Math.round(v * 100) / 100)

function R(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`
}

const cls = (c: string): string => ` class="${c}"`
const op = (o: number): string => ` opacity="${o}"`
const delay = (s: number): string => ` style="animation-delay:${n(s)}s"`
const g = (c: string, body: string, extra = ''): string => `<g class="${c}"${extra}>${body}</g>`

// Character map -> horizontal runs, merged into one <path> per fill (same as scene.ts pmap).
function pmap(rows: readonly string[], x0: number, y0: number, u: number, pal: Record<string, string>): string {
  const paths = new Map<string, string>()
  rows.forEach((row, j) => {
    const cells = [...row]
    let i = 0
    while (i < cells.length) {
      const ch = cells[i]!
      let k = i
      while (k < cells.length && cells[k] === ch) k++
      const fill = Object.prototype.hasOwnProperty.call(pal, ch) ? pal[ch] : undefined
      if (fill) {
        const w = (k - i) * u
        paths.set(fill, (paths.get(fill) ?? '') + `M${n(x0 + i * u)} ${n(y0 + j * u)}h${n(w)}v${n(u)}h${n(-w)}z`)
      }
      i = k
    }
  })
  let out = ''
  for (const [fill, d] of paths) out += `<path fill="${fill}" d="${d}"/>`
  return out
}

function hatMap(rows: readonly string[], pal: Record<string, string>, sink = 4): string {
  if (rows.length === 0) return ''
  const w = Math.max(...rows.map(r => [...r].length))
  return pmap(rows, 72 - w * 4, sink - rows.length * 8, 8, pal)
}

// ---------- the 44 catalog hats (table 2.1 order) ----------

const HAT_ART: Record<HatId, () => string> = {
  // ----- existing hats (art kept; contrast fixes from B56) -----
  party: () =>
    hatMap(['...w...', '..wyw..', '...p...', '..pyp..', '..ppy..', '.pyppp.', 'pppyppy'], { w: '#F2EFE6', y: '#F6D365', p: '#E06C9F' }),
  beanie: () =>
    hatMap(['.....ww.....', '....wwww....', '...cccccc...', '..cccccccc..', '.cccccccccc.', '.dcdcdcdcdc.'], { w: '#F2EFE6', c: '#4FA3A5', d: '#3D8183' }),
  headphones: () =>
    R(32, -12, 80, 6, '#8A8A92') + R(24, -8, 8, 8, '#8A8A92') + R(112, -8, 8, 8, '#8A8A92') +
    R(22, -2, 6, 6, '#8A8A92') + R(116, -2, 6, 6, '#8A8A92') +
    // cups: lighter body plus a 2-px light outer edge and top, so they read on a dark pane
    R(14, 2, 12, 22, '#55555E') + R(118, 2, 12, 22, '#55555E') +
    R(14, 2, 2, 22, EDGE) + R(14, 2, 12, 2, EDGE) + R(128, 2, 2, 22, EDGE) + R(118, 2, 12, 2, EDGE) +
    R(16, 6, 4, 14, GOLD) + R(124, 6, 4, 14, GOLD),
  sunglasses: () =>
    R(30, 9, 28, 14, '#141418') + R(86, 9, 28, 14, '#141418') + R(58, 11, 28, 4, '#141418') +
    // metal temples poke past the head, so the frame shows on a dark pane
    R(22, 11, 8, 4, EDGE) + R(114, 11, 8, 4, EDGE) +
    R(34, 11, 7, 3, '#FFFFFF', op(0.75)) + R(90, 11, 7, 3, '#FFFFFF', op(0.75)),
  tophat: () =>
    hatMap(['..kkkkkkkh..', '..kkkkkkkh..', '..kkkkkkkh..', '..rrrrrrrr..', '..kkkkkkkh..', 'kkkkkkkkkkkk'], { k: '#50505A', h: EDGE, r: RED }) +
    // a light rim along the brim top and down the crown's left edge
    R(24, -4, 96, 2, EDGE) + R(40, -44, 2, 24, EDGE) + R(40, -12, 2, 8, EDGE),
  hardhat: () =>
    hatMap(['....yyyyy....', '..yyywyyyyy..', '.yyywyyyyyyy.', '.yyyyyyyyyyy.', 'YYYYYYYYYYYYY'], { y: '#F2C230', Y: '#C99A2E', w: '#FFF3B0' }),
  propeller: () =>
    hatMap(['....ryyb....', '..rrryybbb..', '.rrrryybbbb.', 'rrrrryybbbbb'], { r: '#D23C3C', y: '#F2C230', b: '#4F6BD8' }) +
    R(68, -40, 8, 12, '#6A6A75') +
    `<g class="prop fb">${R(36, -46, 72, 6, BLUE)}${R(36, -46, 10, 6, '#D23C3C')}${R(98, -46, 10, 6, '#D23C3C')}</g>` +
    R(64, -48, 16, 8, GOLD),
  wizard: () =>
    hatMap(['........b...', '.......bb...', '......bbB...', '.....bsbB...', '....bbbbBb..', '...bbbbsbB..', '..yyyyyyyyy.', 'BBBBBBBBBBBB'], { b: '#4F5FC8', B: '#3B49A0', s: '#F6D365', y: GOLD }),
  halo: () =>
    `<g class="halo">` + R(38, -30, 68, 16, '#F6D365', op(0.18)) +
    R(44, -30, 56, 4, '#F6D365') + R(44, -18, 56, 4, '#F6D365') + R(36, -26, 8, 8, '#F6D365') + R(100, -26, 8, 8, '#F6D365') +
    // a deeper gold underside, so the ring reads on a light pane
    R(44, -16, 56, 2, '#C99A2E') + R(36, -20, 8, 2, '#C99A2E') + R(100, -20, 8, 2, '#C99A2E') + `</g>`,
  crown: () =>
    hatMap(['y...yy...y', 'yy.yyyy.yy', 'yyyyyyyyyy', 'YrYYbbYYrY', 'yyyyyyyyyy'], { y: '#F2C230', Y: '#C99A2E', r: '#D9434E', b: '#4F8BD8' }) +
    R(40, -36, 4, 4, '#FFF7C8', cls('tw2')),
  pumpkin: () =>
    hatMap(['.....gg.....', '..oOooooOo..', '.oOYYooYYOo.', '.oOooYYooOo.', '.oOYYYYYYOo.', '..oOooooOo..'], { o: '#F08A2A', O: '#C86A1E', Y: '#FFD54A', g: '#6E9B5E' }),
  santa: () =>
    hatMap(['..........ww.', '........rrww.', '......rrrR...', '....rrrrrR...', '..rrrrrrrrR..', '.ww..www..ww.'], { r: '#D23C3C', R: '#A82E2E', w: '#F2EFE6' }),

  // ----- level hats -----
  cap: () =>
    hatMap(['......w......', '....bbbbb....', '...bbbbbbB...', '..bbbwbbbbB..', 'kkkbbbbbbbbB.'], { b: '#3B6FC8', B: '#2C539A', w: '#F2EFE6', k: '#24407A' }) +
    R(20, -4, 24, 2, '#5A86D6'), // a light lip on the brim
  chef: () =>
    hatMap(['..www.www..', '.wwwwwwwwwg', '.wwwwwwwwwg', '..wgwgwgwg.', '..wgwgwgwg.', '.ggggggggg.'], { w: '#F2EFE6', g: '#CFCBC0' }) +
    R(36, -4, 72, 2, '#A9A496'), // the band's top seam, so the toque reads on a light pane
  beret: () =>
    hatMap(['.......n.....', '...ssbbbbb...', '.sbbbbbbbbbb.', 'bbbbbbbbbbbb.', '.BBBBBBBBBBBB'], { b: '#8E2F45', B: '#6A2234', s: '#CC6680', n: '#5E1F2E' }),
  viking: () =>
    hatMap(['h...........h', 'hh..sssss..hh', '.hhswssssShh.', '..sssssssSS..', '.kmkmkmkmkmk.'], { h: '#EDE3C8', s: '#9AA0A8', S: '#6E747C', w: '#D7DCE2', k: '#5A5F66', m: '#B8BEC6' }) +
    R(20, -36, 8, 2, '#C9BC98') + R(116, -36, 8, 2, '#C9BC98'), // horn tips, a touch darker for light panes
  cowboy: () =>
    hatMap(['....tt.tt....', '...ttttttt...', '...ttttttT...', '.T.kkkykkk.T.', '.TTTTTTTTTTT.'], { t: '#B07A4A', T: '#8A5A3C', k: '#4A2E1E', y: '#E2B84A' }),
  captain: () =>
    hatMap(['..wwwwwwwww..', '.wwwwwwwwwwW.', '.nnnnyynnnnn.', '..kkkkkkkkkkk'], { w: '#F2EFE6', W: '#CFCBC0', n: '#2E3A6E', y: GOLD, k: '#3A4A7A' }) +
    R(36, -4, 88, 2, '#5A6A9A'), // visor rim, light enough for a dark pane
  pirate: () =>
    hatMap(['g...........g', 'kg..ggggg..gk', '.kkkkwwwkkkk.', '.kkkkwkwkkkk.', 'yyyyyyyyyyyyy'], { k: '#3A3A44', g: '#707080', w: '#F2EFE6', y: GOLD }),
  ninja: () =>
    R(24, 2, 96, 7, '#C8323C') + R(56, 2, 32, 7, '#C3C8CE') + R(64, 4, 16, 2, '#5A5F66') + R(24, 2, 96, 1, '#E06A6A') +
    R(120, 0, 8, 10, '#A82828') +
    g('h-flut', R(128, 2, 10, 3, '#C8323C')) + g('h-flut', R(128, 7, 14, 3, '#C8323C'), delay(0.3)),
  laurel: () =>
    hatMap(['..yl.....ly..', '.ly.l...l.yl.', '.yly.....yly.', 'lylylyrylylyl'], { y: GOLD, l: '#F6D88A', r: '#D9434E' }) +
    g('h-tw', R(36, -24, 4, 4, '#FFF7C8')) + g('h-tw', R(104, -16, 4, 4, '#FFF7C8'), delay(0.9)),
  kabuto: () =>
    R(14, 4, 12, 14, '#4A4560') + R(14, 4, 12, 2, '#6C6690') + R(118, 4, 12, 14, '#4A4560') + R(118, 4, 12, 2, '#6C6690') +
    hatMap(['...y.....y...', '....y...y....', '.....yyy.....', '..mlllllllL..', '.lmllllllllL.', 'cclllllllllcc'], { l: '#4A4560', L: '#34304A', m: '#6C6690', y: GOLD, c: '#C8323C' }) +
    R(36, -20, 72, 2, '#6C6690'), // a light ridge on the bowl
  knight: () =>
    hatMap(['..pppp.....', '.pP..pp....', '.....pp....', '...sssss...', '..sswsssS..', '.sssssssSS.', 'SsSsSsSsSsS'], { s: '#C3C8CE', S: '#8A9098', w: '#EEF1F4', p: '#D23C3C', P: '#A82E2E' }),
  jester: () =>
    hatMap(['.............', 'pp.........gg', '.ppp.....ggg.', '..pppppgggg..', '..pppppgggg..', '.cgcgcgcgcgc.'], { p: '#6A4FB5', g: GOLD, c: '#F2EFE6' }) +
    g('h-bob', R(20, -44, 8, 8, '#F6D365') + R(22, -42, 4, 2, '#FFF7C8')) +
    g('h-bob', R(116, -44, 8, 8, '#F6D365') + R(118, -42, 4, 2, '#FFF7C8'), delay(0.45)),
  archmage: () =>
    hatMap(['.........o...', '........pp...', '.......pPp...', '.....ppsppP..', '...pppppppsP.', '..mmmmmmmmmm.', 'PPPPPPPPPPPPP'], { p: '#5B3A9E', P: '#43297A', s: '#F6D365', m: '#C3C8CE', o: '#7FE3F0' }) +
    R(28, -4, 96, 2, '#7A5CC0') + // a light rim on the brim
    g('h-pulse', R(94, -50, 4, 4, '#E6FCFF')),
  astronaut: () =>
    R(12, -28, 120, 64, '#BFE3F5', op(0.2)) +
    // a grey line under the white rim, so the helmet reads on a light pane
    R(26, -34, 92, 8, '#AEB4BE') + R(10, -30, 20, 8, '#AEB4BE') + R(114, -30, 20, 8, '#AEB4BE') + R(10, -26, 8, 8, '#AEB4BE') + R(126, -26, 8, 8, '#AEB4BE') +
    R(6, -22, 8, 60, '#AEB4BE') + R(130, -22, 8, 60, '#AEB4BE') +
    R(28, -32, 88, 4, '#F2F6FA') + R(8, -20, 4, 56, '#F2F6FA') + R(132, -20, 4, 56, '#F2F6FA') +
    R(12, -28, 16, 4, '#F2F6FA') + R(116, -28, 16, 4, '#F2F6FA') + R(12, -24, 4, 4, '#F2F6FA') + R(128, -24, 4, 4, '#F2F6FA') +
    R(16, 36, 112, 8, '#E8ECF2') + R(16, 42, 112, 2, '#AEB4BE') + R(8, 34, 4, 2, '#AEB4BE') + R(132, 34, 4, 2, '#AEB4BE') +
    R(24, -20, 10, 4, '#FFFFFF', op(0.7)) + R(20, -14, 4, 8, '#FFFFFF', op(0.5)) +
    R(100, -44, 3, 12, '#AEB4BE') + g('h-blink', R(98, -48, 7, 5, '#E0554A')),
  ufo: () =>
    g('h-hover',
      `<polygon points="48,-12 96,-12 112,4 32,4" fill="#BFE3F5" opacity="0.15"/>` +
      hatMap(['.....ccc.....', '....cocc.....', '..sssssssss..', '.SSSSSSSSSSS.', '.............', '.............'], { c: '#BFE3F5', o: '#D97757', s: '#C3C8CE', S: '#8A9098' }) +
      R(36, -28, 72, 2, '#E8ECF2') +
      g('h-blink', R(44, -12, 6, 3, '#F6D365')) + g('h-blink', R(69, -12, 6, 3, '#F6D365'), delay(0.4)) + g('h-blink', R(94, -12, 6, 3, '#F6D365'), delay(0.8))),
  dragonhorns: () =>
    hatMap(['.............', 'hH.........Hh', '.hH.......Hh.', '..hH.....Hh..', '..hhH...Hhh..', '.gGgGgGgGgGg.'], { h: '#C8323C', H: '#8E1F28', g: '#3E8E5A', G: '#2E6E46' }) +
    g('h-pulse', R(22, -40, 4, 4, '#F6B53A')) + g('h-pulse', R(118, -40, 4, 4, '#F6B53A'), delay(0.6)),
  phoenix: () =>
    g('h-flick', hatMap(['.....y.....', '...y.o.y...', '...o.r.o...', '.y.or.ro.y.', '.oorrrrroo.', 'rrrrrrrrrrr'], { r: '#C8323C', o: '#E8892E', y: '#F6D365' })) +
    g('h-rise', R(46, -30, 4, 4, '#F6D365')) + g('h-rise', R(94, -34, 4, 4, '#F6B53A'), delay(0.8)),
  starcrown: () =>
    // a pale crown on a gold band with a 2-px gold trim along the spikes and sides, so it reads on a light pane
    // too (no aura box: the twinkling stars carry the starlight)
    hatMap(['.............', '.w....w....w.', '.ww..www..ww.', '.wwwwwwwwwww.', '.wvwcwwwcwvw.', 'GGGGGGGGGGGGG'], { w: '#E8EEF8', G: STAR_TRIM, v: '#8A6CE0', c: '#4FD6E8' }) +
    `<path d="M29 -4V-35h6v8h8v8h18v-8h8v-8h6v8h8v8h18v-8h8v-8h6V-4" fill="none" stroke="${STAR_TRIM}" stroke-width="2"/>` +
    // the three stars on the spikes twinkle, the middle one out of step
    g('h-tw', R(28, -44, 8, 8, '#F6D365') + R(108, -44, 8, 8, '#F6D365')) + g('h-tw', R(68, -44, 8, 8, '#F6D365'), delay(0.9)),

  // ----- trophy hats -----
  graduation: () =>
    hatMap(['ggggggggggggg', '.kkkkkkkkkkk.', '...kkkkkkk.t.', '...kkkkkkk.t.'], { g: '#5A5A66', k: '#3A3A44', t: GOLD }) +
    R(20, -28, 104, 2, EDGE) + R(44, -12, 2, 16, EDGE) + // light edges on the board and the cap
    g('h-sway', R(116, -4, 4, 12, GOLD) + R(114, 6, 8, 4, '#F6D365')),
  deerstalker: () =>
    hatMap(['.....tbt.....', '...tbtbtbtb..', '..btbtbtbtbt.', '.tbtbtbtbtbt.', 'bbbbbbbbbbbbb'], { t: '#C8A06A', b: '#6B4A35' }),
  miner: () =>
    hatMap(['....wwwww....', '..wwwwwwwww..', '.wwwwggwwwwW.', '.wwwwglwwwwW.', 'WWWWWWWWWWWWW'], { w: '#E8E6DC', W: '#BDBAAE', g: '#8A8A92', l: '#FFF6C8' }) +
    R(20, -4, 104, 2, '#9C998C') + // the brim's top seam
    g('h-pulse', `<ellipse cx="72" cy="-8" rx="12" ry="9" fill="#FFF6C8" opacity="0.35" shape-rendering="auto"/>`),
  nightcap: () =>
    g('h-sway',
      // the tip flops over to the left (clear of the bubble tail) and ends in a pom; a solid cream brim
      hatMap(['....nbnn.....', '..nbn.bnb....', 'ww...nbnbn...', 'ww..nbnbnbnb.', '.wwwwwwwwwwww'], { n: '#34508C', b: '#8FB0E0', w: '#F2EFE6' }),
      ' style="transform-origin:50% 100%"'),
  firefighter: () =>
    hatMap(['....rrrrr....', '..rrrwrrrrr..', '.rrrryyyrrrR.', '.rrrryyyrrrR.', 'RRRRRRRRRRRRR'], { r: '#C8323C', R: '#8E2528', w: '#E86A6A', y: GOLD }),
  flower: () =>
    hatMap(['.pp..ww..vv..', 'pop.lwol.vov.', 'lllllllllllll'], { p: '#E5677E', w: '#F2EFE6', y: '#F6D365', v: '#B57BA6', o: '#F6B53A', l: '#6E9B5E' }),
  unicorn: () =>
    hatMap(['..w..', '..g..', '.pg..', '.gp..', '.pgp.', '.gpg.', 'lllll'], { w: '#FFFFFF', g: '#F6D365', p: '#F2A0C8', l: '#C9A6F0' }) +
    R(52, -4, 40, 2, '#A47FD6') + // the band's top edge
    g('h-tw', R(48, -44, 4, 4, '#FFF7C8')) + g('h-tw', R(92, -28, 4, 4, '#FFF7C8'), delay(0.8)),
  divemask: () =>
    R(22, 13, 8, 4, '#3E5E7A') + R(114, 13, 8, 4, '#3E5E7A') +
    R(29, 7, 86, 20, '#8FB0D0') + R(30, 8, 84, 18, '#3E5E7A') +
    R(34, 10, 28, 14, '#5FB4D9', op(0.45)) + R(82, 10, 28, 14, '#5FB4D9', op(0.45)) +
    R(36, 11, 6, 2, '#FFFFFF', op(0.6)) + R(84, 11, 6, 2, '#FFFFFF', op(0.6)) +
    R(16, -22, 6, 40, '#F08A2A') + R(16, -22, 2, 40, '#F6B06A') + R(14, -26, 10, 5, '#F2EFE6') + R(16, 14, 14, 4, '#F08A2A'),
  bandana: () =>
    hatMap(['...rrrrrrr...', '.rrwrrrwrrrR.', 'rrrrrwrrrrwrR'], { r: '#D23C3C', R: '#A82E2E', w: '#F2EFE6' }) +
    g('h-flut', R(118, -2, 8, 6, '#A82E2E')) + g('h-flut', R(124, 2, 6, 8, '#A82E2E'), delay(0.35)),
  tinfoil: () =>
    hatMap(['....sw....', '...sSws...', '...wsSsw..', '..SswsSsw.', '.wsSswsSs.', 'sSwsSwsSws'], { s: '#C3C8CE', S: '#8A9098', w: '#EEF1F4' }),
  teapot: () =>
    // porcelain with a blue-grey shade on the right and bottom, so it reads on a light pane
    hatMap(['.....bb.....', '...wwwwwW.W.', 'Ww.wbbbbwW.W', '.WwwwwwwwwW.', '..wwwwwwwwW.', '...WWWWWW...'], { w: '#E8EEF8', W: '#97A6C0', b: '#4F8BD8' }) +
    g('h-steam', R(26, -36, 4, 6, '#F2EFE6')) + g('h-steam', R(30, -38, 4, 6, '#F2EFE6'), delay(0.9)),
  catears: () =>
    // the left ear and the band are static; the right ear twitches now and then
    // a mid-grey ear with a light edge on both sides of each ear, so the ears read on a dark pane
    hatMap(['..O..........', '.op..........', '.opo.........', 'kkkkkkkkkkkkk'], { o: CAT, O: EDGE, p: '#F2A0B0', k: '#E5677E' }) +
    R(28, -20, 2, 16, EDGE) + R(44, -12, 8, 2, EDGE) + R(50, -10, 2, 6, EDGE) +
    g('h-twitch', hatMap(['..........O..', '.........po..', '.........opo.', '.............'], { o: CAT, O: EDGE, p: '#F2A0B0' }) +
      R(106, -20, 2, 8, EDGE) + R(108, -12, 8, 2, EDGE) + R(114, -10, 2, 6, EDGE) + R(92, -12, 2, 8, EDGE)),

  // ----- seasonal hats -----
  boppers: () =>
    hatMap(['.............', '.............', '.............', '.............', '..s.......s..', '...s.....s...', 'ppppppppppppp'], { s: '#8A8A92', p: '#F2A0B8' }) +
    R(20, -4, 104, 2, '#D9768E') + // the band's top edge
    g('h-bob', hatMap(['hw.hh........', 'hhhhh........', '.hhh.........', '..H..........', '.............', '.............', '.............'], { h: '#E0554A', H: '#B8423A', w: '#F6A49C' })) +
    g('h-bob', hatMap(['........hw.hh', '........hhhhh', '.........hhh.', '..........H..', '.............', '.............', '.............'], { h: '#E0554A', H: '#B8423A', w: '#F6A49C' }), delay(0.5)),
  bunny: () =>
    // warm grey outer edges and band, so the white ears read on a light pane
    R(26, -44, 2, 40, '#A8A294') + R(52, -44, 2, 40, '#A8A294') + R(82, -44, 2, 40, '#A8A294') + R(108, -44, 2, 40, '#A8A294') +
    hatMap(['.........ww..', '..ww....wwpw.', '.wpw....wpw..', '.wpw....wpw..', '.wpw....wpw..', '.www....www..', 'WWWWWWWWWWWWW'], { w: '#F2EFE6', p: '#F2A0B0', W: '#B0AA9A' }),
}

const CATALOG = Object.keys(HAT_ART) as HatId[]
const CATALOG_SET = new Set<string>(CATALOG)

export function isCatalogHat(v: unknown): v is HatId {
  return typeof v === 'string' && CATALOG_SET.has(v)
}

export function hatSvg(hat: AnyHat): string {
  if (!hat) return ''
  if (typeof hat === 'object') {
    const rows = Array.isArray(hat.rows) ? hat.rows.filter((r): r is string => typeof r === 'string') : []
    const pal = hat.palette !== null && typeof hat.palette === 'object' ? hat.palette : {}
    return `<g class="hat">${hatMap(rows, pal)}</g>`
  }
  const art = isCatalogHat(hat) ? HAT_ART[hat] : undefined
  return art ? `<g class="hat">${art()}</g>` : ''
}

// ---------- the highest point a hat reaches ----------

// How far each animation class lifts its group above where it is drawn (sprite units).
const LIFT: Record<string, number> = { 'h-hover': 3, 'h-rise': 10, 'h-steam': 10, 'h-flick': 3, 'h-sway': 4, 'h-flut': 2 }

/** Smallest y any shape in the svg reaches, counting the lift of animated groups around it. */
function topOf(svg: string): number {
  let top = 0
  const lifts: number[] = []
  let lift = 0
  for (const m of svg.matchAll(/<(\/?)(g|rect|path|polygon|ellipse)\b([^>]*)>/g)) {
    const [, close, tag, attrs = ''] = m
    if (tag === 'g') {
      if (close) lift -= lifts.pop() ?? 0
      else {
        const c = /class="([^"]*)"/.exec(attrs)?.[1] ?? ''
        const l = Math.max(0, ...c.split(/\s+/).map(k => LIFT[k] ?? 0))
        lifts.push(l)
        lift += l
      }
      continue
    }
    const num = (name: string): number => Number(new RegExp(`\\b${name}="(-?[\\d.]+)"`).exec(attrs)?.[1] ?? NaN)
    let y = Number.NaN
    if (tag === 'rect') y = num('y')
    else if (tag === 'ellipse') y = num('cy') - num('ry')
    else if (tag === 'path') {
      // pmap paths: every subpath starts with M x y and only goes down from there
      const ys = [...(/\bd="([^"]*)"/.exec(attrs)?.[1] ?? '').matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)].map(p => Number(p[2]))
      if (ys.length > 0) y = Math.min(...ys)
    } else if (tag === 'polygon') {
      const pts = (/\bpoints="([^"]*)"/.exec(attrs)?.[1] ?? '').trim().split(/\s+/).map(p => Number(p.split(',')[1]))
      if (pts.length > 0) y = Math.min(...pts)
    }
    if (Number.isFinite(y)) top = Math.min(top, y - lift)
  }
  return top
}

const TOPS = new Map<HatId, number>()

export function hatTop(hat: AnyHat): number {
  if (!hat) return 0
  if (typeof hat === 'object') return topOf(hatSvg(hat))
  if (!isCatalogHat(hat)) return 0
  let t = TOPS.get(hat)
  if (t === undefined) {
    t = topOf(hatSvg(hat))
    TOPS.set(hat, t)
  }
  return t
}

// ---------- animation ----------

export const HAT_CLASSES: readonly string[] = ['h-flut', 'h-tw', 'h-bob', 'h-blink', 'h-hover', 'h-pulse', 'h-flick', 'h-rise', 'h-sway', 'h-steam', 'h-twitch']

export const HAT_CSS = `
@keyframes hk-flut{0%,100%{transform:rotate(0)}50%{transform:rotate(-16deg)}}
@keyframes hk-tw{0%,100%{opacity:.15}50%{opacity:1}}
@keyframes hk-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}
@keyframes hk-blink{0%,45%,100%{opacity:1}50%,95%{opacity:.2}}
@keyframes hk-hover{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes hk-pulse{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes hk-flick{0%,100%{transform:scale(1,1)}30%{transform:scale(.97,1.05)}65%{transform:scale(1.02,.97)}}
@keyframes hk-rise{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-10px);opacity:0}}
@keyframes hk-sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes hk-steam{0%{transform:translateY(0);opacity:0}25%{opacity:.8}100%{transform:translateY(-10px);opacity:0}}
@keyframes hk-twitch{0%,84%,100%{transform:rotate(0)}88%{transform:rotate(14deg)}92%{transform:rotate(-4deg)}96%{transform:rotate(6deg)}}
.h-flut{transform-box:fill-box;transform-origin:0 50%;animation:hk-flut .9s ease-in-out infinite}
.h-tw{animation:hk-tw 1.8s ease-in-out infinite}
.h-bob{animation:hk-bob 1.1s ease-in-out infinite}
.h-blink{animation:hk-blink 1.6s steps(1) infinite}
.h-hover{animation:hk-hover 2.2s ease-in-out infinite}
.h-pulse{animation:hk-pulse 1.8s ease-in-out infinite}
.h-flick{transform-box:fill-box;transform-origin:50% 100%;animation:hk-flick .7s ease-in-out infinite}
.h-rise{animation:hk-rise 2.2s ease-out infinite both}
.h-sway{transform-box:fill-box;transform-origin:50% 0;animation:hk-sway 3s ease-in-out infinite}
.h-steam{animation:hk-steam 2.4s ease-out infinite both}
.h-twitch{transform-box:fill-box;transform-origin:50% 100%;animation:hk-twitch 4.5s ease-in-out infinite}
`
