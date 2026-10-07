// Writes two preview pages (Node 23.6+ strips the types). Run `node scripts/preview.mjs [outDir]`;
// the pages go to preview/ next to the mod unless another folder is given.
//   activities.html  Clawd at every activity's station, settled and walking in from his idle spot
//   room.html        every decor piece in its slot, the room upgrades by level, the celebrations,
//                    the pet beds with Clawd asleep and every hat in the wardrobe mirror, on a light or dark pane
import { mkdirSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

registerHooks({
  resolve: (spec, ctx, next) => {
    try { return next(spec, ctx) } catch (e) { if (spec.startsWith('.')) return next(spec + '.ts', ctx); throw e }
  },
})
const { decorPreview, miniSvg, sceneSvg, stationOf, SPOTS } = await import('../hooks/scene.ts')
const { DECOR, SLOTS } = await import('../hooks/decor.ts')
const { HATS } = await import('../hooks/game.ts')

const outDir = process.argv[2] ? pathToFileURL(process.argv[2].replace(/[\\/]?$/, '/')) : new URL('../preview/', import.meta.url)
const uri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

const page = (title, heading, buttons, body, script) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#F5F3EC;--card:#FFFFFF;--ink:#1F1E1D;--dim:#6B6A64;--line:#E2DFD4;--room:#FAF9F5;--accent:#D97757}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1C1B19;--card:#262522;--ink:#ECEAE3;--dim:#A3A198;--line:#3A3936;--room:#262624}}
:root[data-theme="dark"]{--bg:#1C1B19;--card:#262522;--ink:#ECEAE3;--dim:#A3A198;--line:#3A3936;--room:#262624}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}
header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:16px}
h1{font-size:18px;margin:0;flex:1 1 200px}h2{font-size:15px;margin:20px 16px 8px}
button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:6px 12px;cursor:pointer}
button:hover{border-color:var(--accent)}
main{padding:0 0 24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--min,340px),1fr));gap:12px;padding:0 16px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px;min-width:0}
figcaption{display:flex;flex-direction:column;margin-bottom:6px}figcaption span{color:var(--dim);font-size:12px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pair>div{min-width:0}
img{display:block;width:100%;height:auto;background:var(--room);border-radius:4px;image-rendering:pixelated}
small{color:var(--dim);font-size:11px}
@media (max-width:420px){.grid{grid-template-columns:1fr}.pair{grid-template-columns:1fr}}
</style></head><body>
<header><h1>${esc(heading)}</h1>${buttons}<button id="theme">Dark pane</button></header>
<main>
${body}
</main>
<script>
const root = document.documentElement
const themeBtn = document.getElementById('theme')
themeBtn.onclick = () => { const dark = root.dataset.theme !== 'dark'; root.dataset.theme = dark ? 'dark' : 'light'; themeBtn.textContent = dark ? 'Light pane' : 'Dark pane' }
${script}
</script></body></html>
`

function write(name, html, note) {
  mkdirSync(outDir, { recursive: true })
  const out = new URL(name, outDir)
  writeFileSync(out, html)
  console.log(`wrote ${out.pathname} (${note}, ${Math.round(html.length / 1024)} KB)`)
}

const nightToggle = `const imgs = [...document.querySelectorAll('img')]
let night = false
const show = () => imgs.forEach((i) => { i.src = 'about:blank'; requestAnimationFrame(() => { i.src = night ? i.dataset.night : i.dataset.day }) })
document.getElementById('night').onclick = (e) => { night = !night; e.target.setAttribute('aria-pressed', String(night)); e.target.textContent = night ? 'Day' : 'Night'; show() }`

// ---------- activities ----------

const CASES = [
  ['Edit', 'coding', 'edit'], ['Write', 'coding', 'write'], ['Read', 'reading', 'read'], ['Grep / Glob', 'reading', 'search'],
  ['WebFetch / WebSearch', 'reading', 'web'], ['Bash', 'running', 'shell'], ['Tests', 'running', 'test'], ['git', 'running', 'git'],
  ['terraform', 'running', 'terraform'], ['Agent', 'working', 'agent'], ['Skill', 'working', 'skill'], ['Other tool', 'working', 'none'],
  ['Thinking', 'thinking', 'none'], ['Idle', 'idle', 'none'], ['Done', 'done', 'none'], ['Error', 'error', 'edit'],
  ['Sleeping', 'sleeping', 'none'], ['Happy', 'happy', 'none'],
]
const base = { hat: null, hour: 14, minute: 30, month: 6, helpers: 0, combo: 0, trophies: 6, plantStage: 3, level: 12, coffee: 2 }

const cards = CASES.map(([label, mood, activity]) => {
  const st = stationOf(mood, activity)
  const src = (hour, walk) => uri(sceneSvg({ ...base, hour, mood, activity, ...(walk ? { fromMood: 'idle', fromActivity: 'none', fromX: 102, fromY: 0 } : {}) }))
  const img = (walk) => `<img alt="${esc(label)}${walk ? ' walk-in' : ''}" data-day="${src(14, walk)}" data-night="${src(22, walk)}" src="${src(14, walk)}">`
  return `<figure><figcaption><b>${esc(label)}</b><span>${esc(mood)} + ${esc(activity)} &rarr; ${esc(st)} at x ${SPOTS[st]}</span></figcaption>` +
    `<div class="pair"><div>${img(false)}<small>settled</small></div><div>${img(true)}<small>walk-in from idle</small></div></div></figure>`
}).join('\n')

write('activities.html', page('Clawd Activities', 'Clawd at every station',
  '<button id="replay">Replay walk-ins</button><button id="night" aria-pressed="false">Night</button>',
  `<div class="grid">${cards}</div>`, nightToggle + `\ndocument.getElementById('replay').onclick = show`), `${CASES.length} activities`)

// ---------- room catalog ----------

const room = { mood: 'idle', activity: 'none', hat: null, hour: 14, minute: 10, month: 6, helpers: 0, combo: 0, trophies: 8, plantStage: 4, level: 1, coffee: 2 }
const fig = (label, sub, day, night) =>
  `<figure><figcaption><b>${esc(label)}</b><span>${esc(sub)}</span></figcaption><img alt="${esc(label)}" data-day="${uri(day)}" data-night="${uri(night)}" src="${uri(day)}"></figure>`
const unlockOf = (u) => (u.level ? `Lv ${u.level}` : u.month ? `month ${u.month}` : u.anyOf ? u.anyOf.join(' or ') : u.allOf ? u.allOf.join(' + ') : 'default')

let sections = ''
let pieces = 0
for (const { slot, label } of SLOTS) {
  const items = DECOR.filter((d) => d.slot === slot)
  const figs = items.map((d) => {
    const at = (hour) => decorPreview({ ...room, hour, decor: { [slot]: d.id } }, slot, 3)
    if (!at(14)) return ''
    pieces++
    return fig(d.name, `${d.id} · ${unlockOf(d.unlock)}`, at(14), at(22))
  }).join('')
  sections += `<h2>${esc(label)} (${items.length})</h2><div class="grid" style="--min:${slot === 'ceiling' || slot === 'rug' ? 420 : 150}px">${figs}</div>`
}

sections += `<h2>Pet beds with Clawd asleep</h2><div class="grid" style="--min:200px">${DECOR.filter((d) => d.slot === 'bed').map((d) =>
  fig(d.name, d.id, decorPreview({ ...room, decor: { bed: d.id } }, 'bed', 3).replace(/<g class="cs m-idle s-idle/, '<g class="cs m-sleeping s-sleeping'),
    sceneSvg({ ...room, hour: 22, mood: 'sleeping', decor: { bed: d.id } }))).join('')}</div>`

const trophiesAt = (level) => (level >= 60 ? 40 : 18)
sections += `<h2>Room upgrades by level</h2><div class="grid">${[24, 25, 40, 50, 60, 75, 90, 100].map((level) =>
  fig(`Level ${level}`, `${trophiesAt(level)} trophies`, sceneSvg({ ...room, level, trophies: trophiesAt(level) }),
    sceneSvg({ ...room, level, hour: 22, trophies: trophiesAt(level) }))).join('')}</div>`

sections += `<h2>Celebrations</h2><div class="grid">${['milestone', 'legend', 'star'].map((celebrate) =>
  fig(celebrate, 'scene overlay', sceneSvg({ ...room, mood: 'happy', level: 50, celebrate }), sceneSvg({ ...room, mood: 'happy', level: 100, hour: 22, celebrate }))).join('')}</div>`

sections += `<h2>Wardrobe mirror (${HATS.length} hats)</h2><div class="grid" style="--min:110px">${HATS.map((h) =>
  fig(h.name, h.id, miniSvg({ mood: 'happy', activity: 'none', hat: h.id }, { mirror: true }), miniSvg({ mood: 'idle', activity: 'none', hat: h.id }, { mirror: true }))).join('')}</div>`

write('room.html', page('Clawd Room', 'Clawd Quest room catalog', '<button id="night" aria-pressed="false">Night</button>', sections, nightToggle),
  `${pieces} decor previews, ${HATS.length} hats`)
