import { expect, test } from 'claude-code/testing'

import type { Activity, HatId, Mood } from '../types'
import {
  achievementQuip, campaignDoneQuip, doneBeat, levelUpQuip, pickQuip, promptReaction, questDoneQuip, quipTemplates, spinnerVerb,
  starQuip, tagsFromCommand, tagsFromEntries, tagsFromPath, usageQuip, usageQuips,
} from './quips'
import type { QuipContext } from './quips'
import { ACHIEVEMENTS } from './game'

const MOODS: Mood[] = ['idle', 'thinking', 'coding', 'reading', 'running', 'working', 'done', 'error', 'sleeping', 'happy']
const ACTS: Activity[] = ['none', 'edit', 'write', 'read', 'search', 'web', 'shell', 'git', 'terraform', 'test', 'agent', 'skill']
// Every catalog hat (a Record, so tsc complains here when a HatId is added).
const HAT_IDS: Record<HatId, true> = {
  party: true, beanie: true, headphones: true, sunglasses: true, tophat: true, hardhat: true, propeller: true,
  wizard: true, halo: true, crown: true, pumpkin: true, santa: true,
  cap: true, chef: true, beret: true, viking: true, cowboy: true, captain: true, pirate: true, ninja: true, laurel: true,
  kabuto: true, knight: true, jester: true, archmage: true, astronaut: true, ufo: true, dragonhorns: true, phoenix: true,
  starcrown: true, graduation: true, deerstalker: true, miner: true, nightcap: true, firefighter: true, flower: true,
  unicorn: true, divemask: true, bandana: true, tinfoil: true, teapot: true, catears: true, boppers: true, bunny: true,
}
const HATS: Array<HatId | null> = [null, ...(Object.keys(HAT_IDS) as HatId[])]
const ALL_TAGS = new Set(['terraform', 'ci', 'node', 'python', 'docker', 'k8s', 'git', 'powershell', 'docs', 'latex', 'scratch', 'markdown', 'obsidian', 'rust'])

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32)
}

function isClean(line: string): boolean {
  return !/\p{Extended_Pictographic}/u.test(line) && /^[\x20-\x7E]+$/.test(line) && line.length <= 60 && !line.includes('{') && !line.includes('}')
}

function ctxFor(mood: Mood, activity: Activity, i: number, rng: () => number): QuipContext {
  return {
    mood, activity, rng,
    tags: i % 3 === 0 ? new Set() : ALL_TAGS,
    project: ['', 'acme-cicd', 'acme-infra', 'some-very-long-project-folder-name-here'][i % 4]!,
    file: ['', 'main.tf', 'terraform plan -out tfplan && terraform show tfplan', 'chapter{1}.md'][i % 4]!,
    turns: [0, 3, 30, 60, 150][i % 5]!,
    hour: (i * 7) % 24, weekday: i % 7, month: 1 + (i % 12), day: 1 + (i % 31),
    combo: [0, 5, 10, 20, 50, 13][i % 6]!, errorsInRow: [0, 2, 5][i % 3]!, turnSeconds: [0, 70, 200, 700][i % 4]!,
    level: [0, 1, 12, 30][i % 4]!, streak: [0, 3, 9, 40][i % 4]!, hat: HATS[i % HATS.length]!,
  }
}

test('pickQuip: clean, short, placeholder-free for every mood x activity', async () => {
  for (const mood of MOODS) {
    for (const activity of ACTS) {
      const rng = seeded(MOODS.indexOf(mood) * 100 + ACTS.indexOf(activity))
      for (let i = 0; i < 60; i++) {
        const line = pickQuip(ctxFor(mood, activity, i, rng))
        expect(isClean(line)).toBe(true)
      }
    }
  }
})

test('pickQuip respects avoid', async () => {
  const rng = seeded(7)
  for (const mood of MOODS) {
    for (let i = 0; i < 80; i++) {
      const ctx = ctxFor(mood, ACTS[i % ACTS.length]!, i, rng)
      const first = pickQuip(ctx)
      expect(pickQuip({ ...ctx, avoid: first }) === first).toBe(false)
    }
  }
})

test('pickQuip is deterministic with a seeded rng', async () => {
  const a = pickQuip(ctxFor('thinking', 'terraform', 4, seeded(99)))
  const b = pickQuip(ctxFor('thinking', 'terraform', 4, seeded(99)))
  expect(a).toBe(b)
})

test('templates only use known placeholders', async () => {
  for (const [, lines] of Object.entries(quipTemplates())) {
    for (const line of lines) {
      const bare = line.replace(/\{(project|file|level|combo|streak|turns|errors|name|n)\}/g, '')
      expect(/[{}]/.test(bare)).toBe(false)
      expect(/^[\x20-\x7E]+$/.test(line)).toBe(true)
    }
  }
})

test('error-streak lines never name the wrong count', async () => {
  const t = quipTemplates()
  // errors2 also speaks at 3+ in a row (and when errors4 misses its roll), so no fixed count in either rule
  for (const key of ['situation:errors2', 'situation:errors4']) {
    expect(t[key]!.length).toBeGreaterThan(0)
    for (const line of t[key]!) expect(/\b(two|three|four|five|twice)\b/i.test(line)).toBe(false)
  }
  for (const errorsInRow of [2, 3, 4, 6]) {
    const rng = seeded(errorsInRow)
    for (let i = 0; i < 300; i++) {
      const line = pickQuip({ ...ctxFor('error', 'shell', i, rng), errorsInRow, hat: null })
      const n = /^(\d+) (errors )?in a row/.exec(line)
      if (n) expect(Number(n[1])).toBe(errorsInRow)
      expect(/two in a row/i.test(line)).toBe(false)
    }
  }
})

test('spinner verbs that are plain phrasal verbs keep their space', async () => {
  const seen = new Set<string>()
  const rng = seeded(11)
  for (let i = 0; i < 400; i++) {
    seen.add(spinnerVerb({ mood: 'done', activity: 'none', tags: new Set(), rng }))
    seen.add(spinnerVerb({ mood: 'working', activity: 'agent', tags: new Set(), rng }))
  }
  expect(seen.has('Wrapping up')).toBe(true)
  for (const v of seen) expect(/^(Wrapping|Fanning)-/.test(v)).toBe(false)
})

test('spinnerVerb is one short word or two, no dots', async () => {
  const rng = seeded(3)
  for (const mood of MOODS) {
    for (const activity of ACTS) {
      for (let i = 0; i < 10; i++) {
        const verb = spinnerVerb({ mood, activity, tags: ALL_TAGS, rng })
        expect(verb.includes('.')).toBe(false)
        expect((verb.match(/[ ]/g) ?? []).length <= 1).toBe(true)
        expect(/^[A-Za-z]+([- ][A-Za-z]+)*$/.test(verb)).toBe(true)
        expect(verb.length <= 24).toBe(true)
      }
    }
  }
})

test('reward lines stay clean', async () => {
  const rng = seeded(11)
  for (let i = 0; i < 300; i++) {
    expect(isClean(levelUpQuip(i % 120, rng))).toBe(true)
    expect(isClean(achievementQuip(['Night Owl', 'Drift Hunter', 'A Ridiculously Long Achievement Name That Never Ever Ends'][i % 3]!, rng))).toBe(true)
    expect(isClean(questDoneQuip(['Edit 5 files', 'A quest title that is far too long for the narrow pane, really'][i % 2]!, rng))).toBe(true)
  }
  expect(achievementQuip('Night Owl', () => 0)).toContain('Night Owl')
  expect(levelUpQuip(42, () => 0)).toContain('42')
})

test('promptReaction reacts to the mood of the prompt', async () => {
  for (const text of ['thanks!', 'please refactor', 'good job', 'nice', 'it is still broken, fix', 'WHY IS THIS BROKEN', 'go!!!', 'hello', 'hi clawd', 'are you alive?', 'who are you?', 'what are you?']) {
    const got = promptReaction(text)
    expect(got !== null && isClean(got)).toBe(true)
  }
  expect(promptReaction('I am a teapot') ?? '').toContain('418')
  expect(promptReaction('refactor the variables module')).toBe(null)
  expect(promptReaction('')).toBe(null)
})

test('detects project flavours', async () => {
  expect(tagsFromPath('acme-infra/main.tf')).toContain('terraform')
  expect(tagsFromPath('acme-cicd')).toContain('ci')
  expect(tagsFromPath('chapter-2.tex')).toContain('latex')
  expect(tagsFromPath('scratch-2026-01-01-abc123')).toContain('scratch')
  expect(tagsFromEntries(['main.tf', '.git', 'package.json', '.obsidian'])).toEqual(expect.arrayContaining(['terraform', 'git', 'node', 'docs', 'obsidian']))
  expect(tagsFromEntries(['go.mod', 'Cargo.toml', 'Chart.yaml'])).toEqual(expect.arrayContaining(['go', 'rust', 'helm']))
  expect(tagsFromCommand('terraform plan && git status')).toEqual(expect.arrayContaining(['terraform', 'git']))
  expect(tagsFromCommand('pytest -q')).toContain('python')
  expect(tagsFromCommand('echo lazy')).toEqual([])
})

test('usage lines are short, plain ASCII', async () => {
  for (const kind of ['context', 'five_hour', 'seven_day', 'compact'] as const) {
    for (const line of usageQuips(kind)) expect(isClean(line)).toBe(true)
    for (let i = 0; i < 20; i++) expect(usageQuips(kind).includes(usageQuip(kind, seeded(i)))).toBe(true)
  }
})

test('promptReaction does not misfire (B92)', async () => {
  // teapot only as a word; 418 alone is just a number
  expect(promptReaction('return status 418 from the stub')).toBe(null)
  expect(promptReaction('the teapots module')).toBe(null)
  // alive: only a question that starts with it
  expect(promptReaction('what are you doing in this function')).toBe(null)
  expect(promptReaction('explain who are you in the docs?')).toBe(null)
  expect(promptReaction('What are you, exactly?')).not.toBe(null)
  // greetings only at the start
  expect(promptReaction('rename the hello function')).toBe(null)
  expect(promptReaction('add a hi-score table')).toBe(null)
  expect(promptReaction('Hey, can you look at this')).not.toBe(null)
  // praise at the start, or in a short prompt
  expect(promptReaction('make the error message nice and short for the users')).toBe(null)
  expect(promptReaction('Perfect, now add the tests')).not.toBe(null)
  expect(promptReaction('that is awesome')).not.toBe(null)
  // nervous needs something going wrong
  expect(promptReaction('run the tests again')).toBe(null)
  expect(promptReaction('fix it again')).toBe(null)
  expect(promptReaction('still not working')).not.toBe(null)
  expect(promptReaction('the build fails again')).not.toBe(null)
  // thanks and please are separate pools
  const t = quipTemplates()
  for (const text of ['thanks', 'thank you!', 'thx', 'cheers mate', 'danke']) expect(t['prompt:thanks']).toContain(promptReaction(text))
  for (const text of ['please do it', 'pls', 'add a test please', 'bitte']) expect(t['prompt:please']).toContain(promptReaction(text))
  expect(t['prompt:thanks']!.length).toBeGreaterThanOrEqual(3)
  expect(t['prompt:please']!.length).toBeGreaterThanOrEqual(3)
  expect(t['prompt:warm']).toBe(undefined)
})

test('docs flavour only for writing projects (B87)', async () => {
  // every repo has these: no docs lines for them
  const code = ['README.md', 'CHANGELOG.md', 'CLAUDE.md', 'LICENSE', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'package.json', 'src', '.git']
  expect(tagsFromEntries(code).includes('docs')).toBe(false)
  expect(tagsFromEntries(code).includes('markdown')).toBe(false)
  // a code project with a pile of notes is still a code project
  expect(tagsFromEntries(['go.mod', 'a.md', 'b.md', 'c.md', 'd.md']).includes('docs')).toBe(false)
  expect(tagsFromEntries(['infra.sln', 'a.md', 'b.md', 'c.md']).includes('docs')).toBe(false)
  // three or more notes and no manifest: a writing project
  expect(tagsFromEntries(['intro.md', 'methods.md', 'results.md'])).toEqual(expect.arrayContaining(['docs', 'markdown']))
  expect(tagsFromEntries(['README.md', 'notes.md', 'todo.md']).includes('docs')).toBe(false)
  // strong signals win over a manifest
  expect(tagsFromEntries(['package.json', 'paper.tex'])).toEqual(expect.arrayContaining(['docs', 'latex']))
  expect(tagsFromEntries(['package.json', 'refs.bib']).includes('docs')).toBe(true)
  expect(tagsFromEntries(['.obsidian', 'Daily'])).toEqual(expect.arrayContaining(['docs', 'obsidian']))
  // a single markdown path says nothing
  expect(tagsFromPath('docs/guide.md').includes('docs')).toBe(false)
  expect(tagsFromPath('README.md')).toEqual([])
  expect(tagsFromPath('chapter-2.tex')).toEqual(expect.arrayContaining(['latex', 'docs']))
  for (const junk of [[], [''], [42 as unknown as string]]) expect(tagsFromEntries(junk)).toEqual([])
})

test('dot-folders say nothing about the project (B88)', async () => {
  expect(tagsFromPath('.papers/x')).toEqual([])
  expect(tagsFromPath('papers/x')).toContain('docs')
})

test('project names add no tags of their own (B89)', async () => {
  for (const p of ['acme-cicd', 'acme-portal', 'acme-core']) expect(tagsFromPath(p)).not.toContain('acme')
})

test('tag words match whole path segments (B102)', async () => {
  expect(tagsFromPath('overwhelm-app').includes('helm')).toBe(false)
  expect(tagsFromPath('charts/api/values.yaml')).toEqual(expect.arrayContaining(['helm', 'k8s']))
  expect(tagsFromPath('deploy/helm')).toContain('helm')
  expect(tagsFromPath('newspaper-site').includes('docs')).toBe(false)
  expect(tagsFromPath('paper/draft')).toContain('docs')
  expect(tagsFromPath('reactor-sim').includes('react')).toBe(false)
  expect(tagsFromPath('react-dashboard')).toContain('react')
  expect(tagsFromPath('src/App.tsx')).toContain('react')
  expect(tagsFromPath('laws-of-motion').includes('aws')).toBe(false)
  expect(tagsFromPath('aws-infra')).toContain('aws')
  expect(tagsFromPath('gcpx').includes('gcp')).toBe(false)
  expect(tagsFromPath('infra/tf/main')).toContain('terraform')
  expect(tagsFromPath('stuff').includes('terraform')).toBe(false)
})

test('doneBeat speaks only for steps that really finished (B90, B91)', async () => {
  const r = seeded(5)
  const yes: Array<[Activity, string]> = [
    ['test', 'npm test'], ['test', 'pytest -q'], ['agent', ''],
    ['git', 'git commit -m "x"'], ['git', 'git -C "repo" commit -am wip'], ['git', 'git add . && git commit -m x'], ['git', 'git merge feature'],
    ['terraform', 'terraform plan -out tfplan'], ['terraform', 'terraform -chdir=infra apply -auto-approve'], ['terraform', 'tofu validate'],
  ]
  for (const [act, cmd] of yes) {
    const line = doneBeat(act, cmd, r)
    expect(line !== null && isClean(line)).toBe(true)
  }
  const no: Array<[Activity, string]> = [
    ['git', 'git status'], ['git', 'git log --grep merge'], ['git', 'git diff -- commit.ts'], ['git', 'echo commit'],
    ['terraform', 'terraform fmt'], ['terraform', 'terraform init'], ['terraform', 'terraform show plan.out'],
    ['edit', 'main.ts'], ['write', 'a.ts'], ['read', 'x'], ['search', 'grep foo'], ['web', ''], ['shell', 'ls'], ['skill', ''], ['none', ''],
  ]
  for (const [act, cmd] of no) expect(doneBeat(act, cmd, r)).toBe(null)
  expect(doneBeat('git', undefined as unknown as string)).toBe(null)
  // the line fits the step
  const t = quipTemplates()
  expect(t['done:commit']).toContain(doneBeat('git', 'git commit -m x', () => 0))
  expect(t['done:merge']).toContain(doneBeat('git', 'git merge main', () => 0))
  expect(t['done:apply']).toContain(doneBeat('terraform', 'terraform plan && terraform apply', () => 0))
  expect(t['done:validate']).toContain(doneBeat('terraform', 'terraform validate', () => 0))
  expect(t['done:test']).toContain(doneBeat('test', 'cargo test', () => 0))
  expect(t['done:agent']).toContain(doneBeat('agent', '', () => 0))
  // turn-end lines no longer claim results that may not have happened; the claims live in the gated pools
  for (const [key, lines] of Object.entries(t)) {
    if (key.startsWith('done:')) continue
    for (const line of lines) expect(/pipeline green|all stages passed|no drift detected|paragraph done|tests\? what tests/i.test(line)).toBe(false)
  }
  for (const claim of ['Pipeline green', 'All stages passed', 'No drift detected', 'Tests? What tests?']) {
    expect(Object.entries(t).some(([k, lines]) => k.startsWith('done:') && lines.some(l => l.includes(claim)))).toBe(true)
  }
  // the small steps have no done lists any more
  for (const act of ['edit', 'write', 'search', 'shell', 'skill']) expect(t[`done:${act}`]).toBe(undefined)
})

test('level lines cover the whole road to 100 (B103)', async () => {
  const generic = new Set(quipTemplates().levelUp!)
  const isGeneric = (line: string, lv: number): boolean => generic.has(line.replace(String(lv), '{n}'))
  // specials (70%) on the listed levels
  for (const lv of [2, 5, 13, 15, 20, 30, 40, 42, 60, 64, 70, 80, 90, 99]) {
    const line = levelUpQuip(lv, () => 0)
    expect(isGeneric(line, lv)).toBe(false)
    expect(line).toContain(String(lv))
    expect(isClean(line)).toBe(true)
  }
  expect(levelUpQuip(99, () => 0)).toBe('Level 99. One more. Then legend.')
  // milestones always use their own pool of three
  for (const lv of [10, 25, 50, 75, 100]) {
    const pool = quipTemplates()[`milestone:${lv}`]!
    expect(pool.length).toBe(3)
    const r = seeded(lv)
    for (let i = 0; i < 30; i++) expect(pool).toContain(levelUpQuip(lv, r))
    for (const line of pool) expect(isClean(line)).toBe(true)
  }
  // other levels get the generic pool
  expect(isGeneric(levelUpQuip(37, () => 0), 37)).toBe(true)
  expect(isGeneric(levelUpQuip(64, () => 0.9), 64)).toBe(true)
  for (const junk of [0, -5, Number.NaN, Infinity, 1e9]) expect(isClean(levelUpQuip(junk, seeded(1)))).toBe(true)
})

test('level bands, streak lines and seasonal lines fire when they should', async () => {
  // rng: skip the rare roll, pass the first rule that applies, take its first line
  const seq = (...v: number[]): (() => number) => {
    let i = 0
    return () => v[i++] ?? 0
  }
  const base: QuipContext = {
    ...ctxFor('idle', 'none', 1, () => 0),
    tags: new Set<string>(), hat: null, combo: 0, errorsInRow: 0, turnSeconds: 0, turns: 0, streak: 0, level: 5,
    hour: 15, weekday: 3, month: 5, day: 20,
  }
  const t = quipTemplates()
  const said = (over: Partial<QuipContext>): string => pickQuip({ ...base, ...over, rng: seq(0.5, 0, 0) })
  const lv = (key: string, level: number): string[] => t[key]!.map(l => l.replace('{level}', String(level)))
  expect(lv('situation:level100', 100)).toContain(said({ level: 100 }))
  expect(lv('situation:level75', 80)).toContain(said({ level: 80 }))
  expect(lv('situation:level50', 55)).toContain(said({ level: 55 }))
  expect(lv('situation:levelHigh', 30)).toContain(said({ level: 30 }))
  expect(t['situation:streak100']!.map(l => l.replace('{streak}', '120'))).toContain(said({ streak: 120 }))
  expect(t['situation:streak60']!.map(l => l.replace('{streak}', '61'))).toContain(said({ streak: 61 }))
  expect(t['situation:streak14']!.map(l => l.replace('{streak}', '15'))).toContain(said({ streak: 15 }))
  expect(t['situation:valentine']).toContain(said({ month: 2, day: 14 }))
  expect(t['situation:aprilFools']).toContain(said({ month: 4, day: 1 }))
  expect(t['situation:newYear']).toContain(said({ month: 1, day: 1 }))
  expect(t['situation:newYearsEve']).toContain(said({ month: 12, day: 31 }))
  expect(t['situation:hacktoberfest']!.length).toBeGreaterThanOrEqual(2)
  // Programmers' Day is day 256: 13 September, 12 September in leap years (B101)
  const pd = t['situation:programmersDay']!
  expect(pd).toContain(said({ month: 9, day: 13, year: 2026 }))
  expect(pd).toContain(said({ month: 9, day: 12, year: 2028 }))
  expect(pd.includes(said({ month: 9, day: 12, year: 2026 }))).toBe(false)
  expect(pd.includes(said({ month: 9, day: 13, year: 2028 }))).toBe(false)
  expect(pd.includes(said({ month: 9, day: 12 }))).toBe(false)
  // season lines no longer assume cloud resources (B104)
  for (const line of [...t['situation:october']!, ...t['situation:december']!]) expect(/resources/i.test(line)).toBe(false)
  // spelled right: the possessive Programmers' Day, the contraction 'Tis
  for (const line of pd) expect(line.includes("Happy Programmers' Day!")).toBe(true)
  expect(t['situation:december']).toContain("'Tis the season to clean up old branches.")
  for (const lines of Object.values(t)) for (const line of lines) expect([line, /(^|\s)Tis\b|Programmers Day/.test(line)]).toEqual([line, false])
})

test('star, quest and campaign lines', async () => {
  const r = seeded(21)
  for (let n = 1; n <= 30; n++) {
    const line = starQuip(n, r)
    expect(isClean(line)).toBe(true)
    expect(line).toContain(String(n))
  }
  const big = new Set(quipTemplates().star!.slice(-3).map(l => l.replace('{n}', '10')))
  expect(big.has(starQuip(10, () => 0))).toBe(true)
  expect(big.has(starQuip(11, () => 0).replace('11', '10'))).toBe(false)
  expect(isClean(starQuip(Number.NaN))).toBe(true)
  // quest kinds: a project quest is never a "daily quest"
  const t = quipTemplates()
  for (let i = 0; i < 40; i++) {
    expect(questDoneQuip('Tidy the README', r, 'project').includes('Daily')).toBe(false)
    expect(t['quest:boss']!.map(l => l.replace('{name}', 'Slay the flaky test'))).toContain(questDoneQuip('Slay the flaky test', r, 'boss'))
    expect(t['quest:daily']!.map(l => l.replace('{name}', 'Edit 5 files'))).toContain(questDoneQuip('Edit 5 files', r))
  }
  // campaign names are cleaned and the line fits the pane
  const long = 'The Great Refactoring of the Legacy Payment Module, Part Two: Electric Boogaloo {x}'
  for (let i = 0; i < 20; i++) expect(isClean(campaignDoneQuip(long, r))).toBe(true)
  expect(campaignDoneQuip('Café Ünïcode ✨', () => 0)).toContain('Cafe Unicode')
  expect(isClean(campaignDoneQuip('', r))).toBe(true)
})

test('trophy specials are keyed by id; the word fallback needs whole words (B93)', async () => {
  const t = quipTemplates()
  const special = (id: string, name: string): string => achievementQuip(name, () => 0, id)
  expect(special('night-owl', 'Night Owl')).toContain('Go to bed')
  expect(special('streak-7', 'Seven Days Strong')).toContain('week')
  expect(t.achievement!.map(l => l.replace('{name}', 'Master'))).toContain(special('level-50', 'Master'))
  // a catalog trophy without a special uses the plain pool, even when its name has a trigger word
  const plain = (name: string): Set<string> => new Set(t.achievement!.slice(0, 6).map(l => l.replace('{name}', name)))
  expect(plain('Bug Hunter').has(achievementQuip('Bug Hunter', () => 0, 'bug-hunter'))).toBe(true)
  // project trophies (no id): whole words only
  expect(plain('Restated Plans').has(achievementQuip('Restated Plans', () => 0))).toBe(true)
  expect(achievementQuip('Latest Greenhouse', () => 0).includes('sleep')).toBe(false)
  expect(achievementQuip('Late Shift', () => 0)).toContain('sleep')
})

test('pickQuip avoids every recently shown line (B99)', async () => {
  const rng = seeded(17)
  for (const mood of MOODS) {
    for (let i = 0; i < 30; i++) {
      const ctx = ctxFor(mood, ACTS[i % ACTS.length]!, i, rng)
      const recent: string[] = []
      for (let k = 0; k < 6; k++) recent.push(pickQuip({ ...ctx, avoid: recent }))
      expect(new Set(recent).size).toBe(recent.length)
    }
  }
  expect(isClean(pickQuip({ ...ctxFor('idle', 'none', 0, () => 0.5), avoid: [] }))).toBe(true)
})

test('pickQuip works without an injected rng', async () => {
  const seen = new Set<string>()
  for (let i = 0; i < 40; i++) {
    const ctx: QuipContext = { ...ctxFor('coding', 'edit', i, () => 0) }
    delete ctx.rng
    const line = pickQuip(ctx)
    expect(isClean(line)).toBe(true)
    seen.add(line)
  }
  expect(seen.size).toBeGreaterThan(3)
  expect(isClean(levelUpQuip(7))).toBe(true)
})

test('every hat has two or three lines of its own', async () => {
  const t = quipTemplates()
  for (const hat of Object.keys(HAT_IDS)) {
    const lines = t[`hat:${hat}`]
    expect(lines !== undefined).toBe(true)
    expect(lines!.length).toBeGreaterThanOrEqual(2)
    expect(lines!.length).toBeLessThanOrEqual(5)
  }
})

test('no duplicate lines, canon lore, at most two "says no" lines (B100)', async () => {
  const seen = new Map<string, string>()
  let saysNo = 0
  for (const [key, lines] of Object.entries(quipTemplates())) {
    for (const line of lines) {
      const prev = seen.get(line)
      if (prev !== undefined && prev !== key) throw new Error(`"${line}" is in ${prev} and ${key}`)
      seen.set(line, key)
      expect(/crab with|crustacean|please clap/i.test(line)).toBe(false)
      if (/\b(says|said) no\b/i.test(line)) saysNo++
    }
    expect(new Set(lines).size).toBe(lines.length)
  }
  expect(saysNo).toBeLessThanOrEqual(2)
  expect(quipTemplates()['activity:test']).toContain('Red. Not my shade of orange.')
})

test('Clawd says "Trophy unlocked", like the toasts and the Trophies tab', async () => {
  for (const id of [undefined, 'night-owl', 'early-bird', 'fail-forward', 'hello-world']) {
    for (let i = 0; i < 40; i++) {
      const line = achievementQuip('Terraform Tamer', () => i / 40, id)
      expect(/achievement/i.test(line)).toBe(false)
    }
  }
})

test('only a real trophy says "Trophy unlocked"; hat lines name no level; American spelling', async () => {
  for (const [key, lines] of Object.entries(quipTemplates())) {
    for (const line of lines) {
      // the toast's wording for a real unlock: a joke line would send people to the Trophies tab for nothing
      if (key !== 'achievement') expect(/trophy unlocked/i.test(line)).toBe(false)
      // a hat stays worn long after the level that opened it
      if (key.startsWith('hat:')) expect(/blevelb|blvb/i.test(line)).toBe(false)
      expect(/colour|favour|honour|behaviour/i.test(line)).toBe(false)
    }
  }
})

test('a trophy line never says the trophy name twice', async () => {
  // first draw < 0.6 takes the trophy's own lines, the second picks one of them
  const seq = (...v: number[]): (() => number) => {
    let i = 0
    return () => v[Math.min(i++, v.length - 1)]!
  }
  for (const a of ACHIEVEMENTS) {
    const words = a.name.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4)
    for (let k = 0; k < 4; k++) {
      const line = achievementQuip(a.name, seq(0, (k + 0.5) / 4), a.id).toLowerCase()
      const at = line.indexOf(a.name.toLowerCase())
      expect(at >= 0).toBe(true)
      const rest = line.slice(at + a.name.length)
      const again = words.find(w => new RegExp(`\b${w.slice(0, 4)}`).test(rest))
      if (again) throw new Error(`${a.id}: "${line}" repeats "${again}"`)
    }
  }
})

test('campaign lines never promise a bonus (the daily campaign cap can pay nothing)', async () => {
  const lines = quipTemplates().campaign!
  expect(lines.length > 0).toBe(true)
  for (const line of lines) expect(/bonus|\bxp\b|reward/i.test(line)).toBe(false)
})

// The runner cannot read README.md, so this pins the quip total the docs state ("919 quips" in README.md
// and CHANGELOG.md). When it fails, update both with the new total.
test('quip count: 919 distinct lines (keep README.md and CHANGELOG.md in sync)', () => {
  const lines = Object.values(quipTemplates()).flat()
  expect(lines.length).toBe(919)
  expect(new Set(lines).size).toBe(919)
})
