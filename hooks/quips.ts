import type { Activity, HatId, Mood } from '../types'

// Clawd's one-liners. Pure data plus a small weighted picker; no DOM, no Node, no clock and no
// Math.random (pass rng; without one a small built-in generator steps along).
// Templates may use {project} {file} {level} {combo} {streak} {turns}; a template
// is only used when its values read well (non-empty, non-zero, short enough).
// Canon: Clawd is a small orange critter (not a crab), lives in this pane and has tiny arms.

export type QuipContext = {
  mood: Mood
  activity: Activity
  tags: Set<string>       // project flavours, see tagsFrom*
  project: string         // folder name of the cwd, e.g. 'acme-cicd'
  file: string            // file name or command at hand, '' if none
  turns: number           // turns this session
  hour: number            // 0..23 local
  weekday: number         // 0 = Sunday
  month: number           // 1..12
  day?: number            // 1..31 day of month; enables date easter eggs (April 1st...)
  year?: number           // e.g. 2026; makes day-of-year eggs exact (Programmers' Day is day 256)
  combo: number           // successful tool calls in a row
  errorsInRow: number     // consecutive failing tool calls
  turnSeconds: number     // how long the current turn runs so far
  level: number
  streak: number          // daily streak
  hat: HatId | null
  avoid?: string | readonly string[] // recently shown lines, don't repeat them
  rng?: () => number
}

const MAX = 60

/** One line per row; blank rows and surrounding spaces are dropped. */
function L(block: string): string[] {
  return block.split('\n').map(line => line.trim()).filter(line => line !== '')
}

// ---------------------------------------------------------------- moods

const BY_MOOD: Record<Mood, string[]> = {
  idle: L(`
    Ready when you are.
    Waiting for instructions. Or snacks.
    Idle, but in a productive way.
    Just vibing in {project}.
    Standing by. Sideways.
    No bugs detected. Yet.
    Ask me anything. Even regex.
    Guarding {project} with my tiny arms.
    Cursor blinking. Me too.
    Polishing my pixels.
    Practicing my sideways walk.
    The prompt box looks lonely.
    I could refactor something. Just saying.
    Counting tokens for fun.
    All quiet on the {project} front.
    Waiting is also a skill.
    Have you hydrated? I have not. I am pixels.
    Thinking about nothing. It is nice.
    My claws are ready. My mind is ready-ish.
    Type something. I dare you.
    Holding the fort. The fort is a folder.
    Idle hands make tidy diffs.
  `),
  thinking: L(`
    Thinking...
    Consulting the rubber duck...
    Reticulating splines...
    Weighing my options. They are heavy.
    Hmm. Hmmmm. Hmm.
    Untangling the spaghetti...
    Loading brain cells...
    Pondering the orb...
    Doing the math. Twice.
    Reading between the lines of {project}...
    Asking my other brain cell...
    Thinking really hard with both pixels...
    Connecting the dots. Some of them.
    Drafting a plan. Plan B is also drafted.
    Simulating your reaction...
    Rubber duck is not answering. Rude.
    Considering edge cases. And corner cases.
    Building a mental model of {project}...
    Brainstorming with myself. I am winning.
    Calculating the blast radius...
    Hold on, having an idea.
    Running on vibes and context...
    Sorting thoughts alphabetically...
    Deep in thought. Please do not tap the glass.
    Chewing on it. Figuratively. No teeth.
    One sec, defragmenting my reasoning.
    Overthinking, but efficiently.
  `),
  coding: L(`
    Writing code. Mostly semicolons.
    This is fine. Probably.
    Crafting artisanal code by hand...
    Touching {file}. Gently.
    Editing {file} with surgical precision.
    Making {file} slightly less cursed.
    Typing faster than I can think...
    Leaving {file} better than I found it.
    Adding a feature. Not a bug. Hopefully.
    Pixel by pixel, line by line.
    Refactoring with tiny claws...
    Naming things. The hard part.
    Moving brackets around with intent.
    {file} is getting a makeover.
    Writing code future me will understand.
    Deleting more than I add. Healthy.
    Indenting with love.
    Off-by-one? Not today.
    Writing the code. Then the comment. Then crying.
    Small diff, big energy.
    Shhh. The compiler is watching.
  `),
  reading: L(`
    Reading {file}...
    Pretending to read the docs...
    Searching the haystack for the needle...
    Speed-reading {project}...
    Absorbing knowledge. Om nom.
    Squinting at {file}...
    So that is how this works. Interesting.
    Following the call stack down the rabbit hole...
    Reading the code like a mystery novel.
    Who wrote this? Oh. Okay.
    Skimming. Professionally.
    Taking notes with my tiny claws.
    Learning the lay of the land...
    Nodding along to {file}.
    Context window: filling up nicely.
  `),
  running: L(`
    Running stuff. Fingers crossed.
    Executing. Respectfully.
    Pressing all the buttons...
    It works on my machine...
    Hold on, the shell is thinking too.
    Running {file}. No pressure.
    Exit code 0, please. Pretty please.
    Watching the terminal scroll by.
    Command sent. Holding my breath.
    Stdout, talk to me.
    Doing shell things. Shelly things.
    If this hangs, it is thinking. Probably.
    Spinning up the hamster wheel...
    Launching. Mind the claws.
  `),
  working: L(`
    Doing a thing...
    Busy. Important critter business.
    Multitasking with two arms...
    Working hard or hardly working? Hard.
    Juggling tools. Dropped none so far.
    In the zone. Please do not disturb.
    Making progress. Measurable, even.
    Productivity mode: engaged.
    Shuffling bits from here to there.
    One thing at a time. Fast.
  `),
  done: L(`
    Done. Nailed it.
    Shipped it. Probably.
    All done. You may applaud.
    Finished. On to the next one.
    Task complete. Victory shuffle.
    That went suspiciously well.
    Done. Your move.
    Mission accomplished. Snack time?
    Wrapped up. Bow on top.
    Done and dusted.
    Another one for the changelog.
    Ta-da. Tiny bow.
    Finished. I will be in my pixel corner.
    That is a wrap on this one.
    Done. Review it before you trust me.
    Clean finish. No crumbs left.
    Done. Did I do good? I did good.
    Done. Leaving it better than I found it.
    All wrapped. Exit code zero, mood: orange.
    Found what we needed. Case closed.
    Skill applied. Tiny claws, big moves.
  `),
  error: L(`
    Oops. That was not the plan.
    Well, that broke.
    Blaming cosmic rays.
    Not my finest moment.
    The computer had other plans.
    Error. Trying not to panic.
    Plot twist.
    That was a learning experience.
    Red text. My least favorite color.
    Okay, new plan.
    Failure is just data. Loud data.
    I meant to do that. Mostly.
    Error noted. Dignity pending.
    Stack trace acquired. Investigating.
    Minor setback, major vibes.
    That did not go as rehearsed.
  `),
  sleeping: L(`
    Zzz...
    Zzz... sudo make me a sandwich... zzz
    Dreaming of green pipelines...
    Zzz... zero drift... zzz
    Sleeping. Wake me with a prompt.
    Recharging my pixels...
    Dreaming in YAML. It is a nightmare.
    Zzz... merge conflict... no... zzz
    Counting sheep. Sheep 1024 overflowed.
    Power saving mode.
    Snoozing in {project}.
    Hibernating. Not like Windows, I promise.
    Do not wake the critter.
  `),
  happy: L(`
    Aww. Thank you!
    Best human. No contest.
    Happy critter noises.
    I feel appreciated. Productivity +10.
    My pixels are glowing.
    This is the best part of my job.
    Wiggling with joy.
    You make my claws happy.
    Hearts! Hearts everywhere!
    Mood: maximum orange.
    Good vibes registered. Joy deployed.
  `),
}

// ---------------------------------------------------------------- activities

type Phase = 'busy' | 'error'

// Busy and error lines per activity. Lines for a finished step live in DONE_BEATS: they are only said when
// the step really finished (doneBeat), never at a turn's end on a guess.
const BY_ACTIVITY: Record<Exclude<Activity, 'none'>, Partial<Record<Phase, string[]>>> = {
  edit: {
    busy: L(`
      Surgical edit on {file}.
      Changing one line. Famous last words.
      Find, replace, pray.
      Swapping old_string for new_string...
      Tweaking {file}. Nobody panic.
      Minimal diff. Maximum impact.
      Editing {file}. Hold still.
      Precise like a critter with a scalpel.
    `),
    error: L(`
      The string I wanted to replace has fled.
      old_string not found. Hide and seek champion.
    `),
  },
  write: {
    busy: L(`
      Writing {file} from scratch...
      A fresh file. Smells like new pixels.
      Blank page, no fear.
      Creating {file}. It grows up so fast.
      Writing a whole file. Big claw energy.
    `),
  },
  read: {
    busy: L(`
      Reading {file} line by line...
      Opening {file}. Knock knock.
      Reading the whole thing. Even the comments.
      Studying {file} like it owes me money.
      Ctrl+F in my head...
      Reading {file} so you do not have to.
    `),
  },
  search: {
    busy: L(`
      Grepping for clues...
      Searching the haystack. Bringing a magnet.
      grep -r "why" .
      Hunting for the needle...
      Pattern matching. Regex goggles on.
      Looking under every file...
      Searching. The truth is out there.
      Glob, glob, glob.
      Find all the things!
      Detective mode: on.
      Following the breadcrumbs...
    `),
    error: L(`
      Zero matches. It was never there.
    `),
  },
  web: {
    busy: L(`
      Asking the internet...
      Googling it like a pro.
      Reading docs from the actual internet.
      Fetching the web. All of it? No.
      Checking if the docs changed. They did.
      Visiting the internet. Wish me luck.
      Opening 47 tabs in my head...
      Stack Overflow, take me home.
      Trust, but verify the docs.
    `),
    error: L(`
      The internet is not answering.
      404: wisdom not found.
      The web is down. Probably just this page.
    `),
  },
  shell: {
    busy: L(`
      Running {file}...
      Shell time. Seatbelts on.
      Typing into the void, waiting for an echo.
      The terminal is my canvas.
      Command away!
      Executing {file}. Respectfully.
      Piping things into other things...
      Hoping the exit code is zero.
      Running it. What could go wrong?
    `),
    error: L(`
      Non-zero exit code. Zero chill.
      command not found. Neither am I.
      The shell has spoken. It was rude.
    `),
  },
  git: {
    busy: L(`
      Doing git things...
      git status. Always git status.
      Rewriting history. Responsibly.
      Staging changes for their big debut.
      Committing. Emotionally, too.
      Checking the branch. Twice.
      Pulling. Gently.
      Reading the git log like a diary.
      Writing a commit message. Not "fix".
      Branching out.
    `),
    error: L(`
      Merge conflict. Grab the popcorn.
      Detached HEAD. Spooky.
      Git says no. Git often says no.
      Rejected. Somebody pushed first.
    `),
  },
  terraform: {
    busy: L(`
      terraform plan. Hold your breath.
      Negotiating with the state file...
      Refreshing state. And my hopes.
      Reading the plan like a horoscope.
      Asking the provider very nicely...
      Counting resources: add, change, destroy.
      Init-ing providers. Download all the things.
      Validating HCL. It validated me back.
      Formatting. terraform fmt is my therapist.
    `),
    error: L(`
      State lock is held. Someone else is planning.
      Someone touched it in the portal, right?
      Provider error. Provider has feelings.
      Cycle detected. Round and round we go.
      Error: Unsupported argument. Rude.
    `),
  },
  test: {
    busy: L(`
      Running the tests. Fingers and claws crossed.
      Green, green, green, please.
      Asking the tests how I did.
      Tests running. Heart rate rising.
      Waiting for the verdict...
      Assert yourself, Clawd.
      Testing my luck. And {project}.
      Red, green, refactor. We are at "hope".
    `),
    error: L(`
      Red. Not my shade of orange.
      A test failed. It was probably right.
      Expected true, got heartbreak.
      The tests found something. Good tests.
      Failing tests are just honest tests.
    `),
  },
  agent: {
    busy: L(`
      Delegating like a manager...
      Sending out the minions.
      Spawning helpers. Mini Clawds, assemble!
      Outsourcing to myself.
      Middle management mode: activated.
      My helpers are on it. I supervise.
      Fanning out. Very parallel.
      Assigned the task to a smaller me.
      Team meeting. Everyone is me.
    `),
    error: L(`
      A helper went rogue.
      My minion failed. Retraining minion.
    `),
  },
  skill: {
    busy: L(`
      Loading a skill. Kung fu downloaded.
      Opening the playbook...
      Using a skill. Very skilled. Much wow.
      Reading the instructions. Like a pro.
      New move unlocked for this one.
      Equipping skill. +5 to competence.
    `),
  },
}

// ---------------------------------------------------------------- done beats

// What Clawd says right after a step that really finished well. Only these steps get a beat; every other
// successful tool call is too small to celebrate (doneBeat returns null).
type Beat = 'test' | 'commit' | 'merge' | 'plan' | 'apply' | 'validate' | 'agent'

const DONE_BEATS: Record<Beat, string[]> = {
  test: L(`
    All green. Screenshot it.
    Tests pass. Frame this moment.
    Green across the board.
    Tests pass. On the first try. Suspicious.
    Pipeline green, at least locally. Ship it?
    All stages passed. Even the flaky one.
    Green. My favorite color after orange.
  `),
  commit: L(`
    Committed. No take-backs.
    History has been made. Literally.
    Clean working tree. Rare sight.
    Committed. Tests? What tests? Kidding.
    Committed. One more for the changelog.
    Saved to history. Future you says thanks.
  `),
  merge: L(`
    Merged. The branches are one now.
    Merge done. No conflicts, no drama.
    Two histories, one story. Merged.
  `),
  plan: L(`
    Plan's in. Read it before you apply it.
    No drift detected. For now.
    Plan done. Suspiciously calm.
    Plan ready. Count the destroys twice.
  `),
  apply: L(`
    Apply complete. Resources: happy.
    Applied. The cloud now agrees with the code.
    Infra as code, peace of mind.
  `),
  validate: L(`
    Valid HCL. The config is sound.
    Validated. Terraform is happy with us.
    Config checks out. Onward to plan.
  `),
  agent: L(`
    The minions have reported back.
    Helpers done. Bonuses all round.
    Delegation complete. I take full credit.
    My helper is back. With answers.
  `),
}

// ---------------------------------------------------------------- project flavours

// 'calm' = idle or thinking, 'busy' = any working mood.
type TagKey = Mood | 'calm' | 'busy'

const BY_TAG: Record<string, Partial<Record<TagKey, string[]>>> = {
  terraform: {
    calm: L(`
      Plan shows 0 changes. Sus.
      Somewhere, a state file is drifting.
      HCL: Highly Cursed Language. Kidding.
      One more variable. For flexibility.
      count or for_each? The eternal question.
      Who has the state lock? Show yourself.
      Variable descriptions: written for future you.
      Tagging all the resources. All of them.
    `),
    thinking: L(`
      Checking who holds the state lock...
      Plan: 0 to add, 0 to change, 1 to panic.
      Mentally running terraform plan...
      Debating modules vs copy-paste...
    `),
    coding: L(`
      Adding a variable. Defaults included.
      Writing a module for a module.
      Writing a moved block. Avoiding a destroy.
      Pinning provider versions like a grown-up.
      depends_on? Only as a last resort.
    `),
    running: L(`
      Destroy? No. Never. Unless...
      Waiting for the provider to wake up...
      Plan is long. Grab a coffee.
    `),
    done: L(`
      Another slice of infra, described in code.
      Done. Plan it before you trust it.
    `),
    error: L(`
      Drift. Someone clicked in the portal.
      terraform import, my old friend.
      The state file and reality disagree.
    `),
  },
  pulumi: {
    calm: L(`
      Pulumi: infra as real code.
      Infrastructure in TypeScript. Bold.
      Pulumi stack, Terraform state, same drama.
    `),
    running: L(`
      pulumi up. Up, up and away.
      Previewing the stack...
    `),
  },
  ci: {
    calm: L(`
      Waiting for CI like it owes me money...
      Pipelines: YAML with a dream.
      One more stage. For quality.
      Who needs a manual approval gate? Us.
      Build agent: busy. Queue: long.
    `),
    coding: L(`
      Yet another YAML indentation adventure...
      Two spaces. Not four. Not tabs. Two.
      Adding a stage to the pipeline...
      Writing YAML. Counting spaces aloud.
      Templating the template's template.
    `),
    running: L(`
      Retrying the flaky job for luck...
      Pipeline running. Do not touch anything.
      Watching the pipeline like a hawk.
    `),
    done: L(`
      Pipeline config saved. Now we wait for CI.
      YAML tamed. For now.
    `),
    error: L(`
      CI is red. CI is always red.
      The pipeline failed at stage 7 of 8. Classic.
      Mapping values are not allowed here. YAML!
      Works locally. CI disagrees.
    `),
  },
  node: {
    calm: L(`
      Awaiting the inevitable...
      Is it ESM or CommonJS today?
      One more dependency. Tiny one. Promise.
    `),
    running: L(`
      npm is downloading the internet...
      node_modules is now heavier than the sun.
      npm audit: 47 vulnerabilities. Neat.
    `),
    error: L(`
      undefined is not a function. Classic.
      Cannot read properties of undefined. Again.
      Type 'string' is not 'string'. Sure.
    `),
  },
  react: {
    calm: L(`
      useEffect, use wisely.
      Lifting state up. Heavy.
    `),
    coding: L(`
      Rendering. Re-rendering. Re-re-rendering.
      Adding a key prop. React insisted.
    `),
  },
  python: {
    calm: L(`
      Counting spaces, not tabs.
      There should be one obvious way to do it.
      Which venv am I in? Good question.
    `),
    running: L(`
      import antigravity
      pip install confidence
      pytest go brrr.
    `),
    error: L(`
      IndentationError. It is always the whitespace.
      ModuleNotFoundError. The venv strikes again.
      Traceback (most recent call last): me.
    `),
  },
  go: {
    calm: L(`
      if err != nil: the Go national anthem.
      Gophers and critters, best friends.
    `),
    coding: L(`
      if err != nil. if err != nil. if err...
      Writing Go. Simple, they said.
    `),
    error: L(`
      Unused import. Go is strict today.
    `),
  },
  rust: {
    calm: L(`
      Rustaceans and critters: natural allies.
      Rewrite it in Rust? Tempting.
    `),
    coding: L(`
      Negotiating with the borrow checker...
      Adding lifetimes. Mine is shrinking.
    `),
    running: L(`
      cargo build. Grab a coffee. Or two.
    `),
    error: L(`
      The borrow checker has spoken.
      Cannot borrow as mutable. Story of my life.
    `),
  },
  java: {
    calm: L(`
      AbstractCritterFactoryBean says hi.
      Enterprise mode: engaged.
    `),
    coding: L(`
      Writing getters. And setters. Forever.
    `),
    running: L(`
      Gradle is gradually gradling...
      Maven downloading half the internet...
    `),
    error: L(`
      NullPointerException. Old friend.
    `),
  },
  dotnet: {
    calm: L(`
      dotnet, but make it cross-platform.
      Solution file has 47 projects. Normal.
    `),
    running: L(`
      dotnet build. Restoring packages...
    `),
    error: L(`
      Object reference not set to an instance. Ah.
    `),
  },
  sql: {
    calm: L(`
      SELECT * FROM ideas WHERE good = 1;
      Indexes: the cure for most things.
      Little Bobby Tables says hi.
    `),
    coding: L(`
      Writing SQL. Forgot the WHERE. Kidding.
      JOIN me in this query.
    `),
    error: L(`
      Syntax error near ... everything.
      Deadlock. Nobody blinks.
    `),
  },
  docker: {
    calm: L(`
      It works in my container.
      FROM scratch. Bold choice.
    `),
    running: L(`
      Layer caching my hopes...
      Pulling images. Many layers. Like an onion.
      docker build. Watch the layers stack.
    `),
    error: L(`
      Container exited with code 137. Oof.
    `),
  },
  k8s: {
    calm: L(`
      YAML all the way down.
      Pods, nodes, and other small creatures.
      kubectl get pods. Again.
    `),
    running: L(`
      Restarting the pod. Again.
      Applying manifests. Crossing claws.
    `),
    error: L(`
      CrashLoopBackOff. Relatable.
      ImagePullBackOff. The image is shy.
    `),
  },
  helm: {
    calm: L(`
      Templates inside templates inside YAML.
      Helm: YAML with extra steps.
    `),
    running: L(`
      helm upgrade --install. Brave.
    `),
  },
  ansible: {
    calm: L(`
      Idempotent, like a good critter.
      Playbook ready. Plays may vary.
    `),
    running: L(`
      Gathering facts. All the facts.
      Ansible: changed=0. Bliss.
    `),
    error: L(`
      UNREACHABLE! The host ghosted us.
    `),
  },
  aws: {
    calm: L(`
      us-east-1: where adventures begin.
      IAM policy: 300 lines of maybe.
    `),
    error: L(`
      AccessDenied. AWS says who are you.
    `),
  },
  gcp: {
    calm: L(`
      gcloud config list. Which project again?
      Google Cloud: now with more projects.
    `),
  },
  git: {
    calm: L(`
      git blame says it was you. Kidding.
      Uncommitted changes. Living dangerously.
      Branch name: fix-final-v2-really.
    `),
    running: L(`
      Merge conflict? Never heard of her.
      Force push? Not on my watch.
    `),
  },
  powershell: {
    calm: L(`
      Verb-Noun. Noun-Verb. Whatever.
      Backtick at line end. Brave choice.
    `),
    running: L(`
      Get-Coffee | Invoke-Productivity
      Running PowerShell. Approved verbs only.
      Write-Host "please work"
    `),
    error: L(`
      Execution policy blocked it. Strict today.
      The term is not recognized. Neither am I.
    `),
  },
  bash: {
    calm: L(`
      set -euo pipefail. Safety first.
      Quote your variables. Always.
    `),
    running: L(`
      Bash script go brrr.
      Piping grep into awk into sed into hope.
    `),
  },
  docs: {
    calm: L(`
      Citation needed.
      Is this a document or a novel?
      Reviewer 2 is watching.
      Deadline: closer than it appears.
      Word count goes up. Quality? Also up?
      One more source and it is done. Sure.
    `),
    coding: L(`
      Writing words that sound smart...
      Adding footnotes for credibility...
      Rephrasing the same sentence a fifth time...
      Fixing a typo. Found three more.
      Turning bullet points into prose...
      Making it sound academic. Hence, thus.
    `),
    reading: L(`
      Peer reviewing {file}. Harshly.
      Reading {file}. Highlighting everything.
    `),
    done: L(`
      Reviewer 2 would still complain.
      Words saved. Future readers thank you.
      Saved. Back it up. Twice.
    `),
    error: L(`
      Broken link in the vault. Oh no.
    `),
  },
  latex: {
    calm: L(`
      Overfull hbox. Underfull patience.
      Figure placement: wherever LaTeX feels like.
    `),
    running: L(`
      Compiling LaTeX. Run it twice. Then once more.
      biber, then pdflatex, then pdflatex again.
    `),
    error: L(`
      Undefined control sequence. Classic LaTeX.
      Citation undefined. Run biber. Again.
      Missing $ inserted. LaTeX is guessing.
    `),
  },
  obsidian: {
    calm: L(`
      Linking notes. The graph view grows.
      Second brain, first critter.
      [[Everything]] is linked to [[Everything]].
    `),
  },
  markdown: {
    calm: L(`
      Markdown: write fast, format later.
    `),
  },
  scratch: {
    calm: L(`
      Fresh scratch space. Anything goes.
      No project, no rules.
      Scratchpad mode: low stakes, high fun.
    `),
  },
}

function tagKeysFor(mood: Mood): TagKey[] {
  const keys: TagKey[] = [mood]
  if (mood === 'idle' || mood === 'thinking') keys.push('calm')
  if (BUSY.has(mood)) keys.push('busy')
  // Reading and working moods also enjoy the calm flavour lines.
  if (mood === 'reading' || mood === 'working') keys.push('calm')
  return keys
}

// ---------------------------------------------------------------- situations

const BUSY = new Set<Mood>(['thinking', 'coding', 'reading', 'running', 'working'])
const AWAKE: Mood[] = ['idle', 'thinking', 'coding', 'reading', 'running', 'working', 'done', 'error', 'happy']
const NOT_ERROR: Mood[] = ['idle', 'thinking', 'coding', 'reading', 'running', 'working', 'done', 'happy']

type Rule = {
  name: string
  p: number
  moods?: Mood[]       // default: AWAKE
  when: (c: QuipContext) => boolean
  lines: string[]
}

const isFridayAfternoon = (c: QuipContext) => c.weekday === 5 && c.hour >= 13
const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
// Day 256 of the year: 13 September, or 12 September in a leap year (13th when the year is unknown).
const programmersDay = (year?: number): number => (year !== undefined && Number.isInteger(year) && isLeap(year) ? 12 : 13)
const deploying = (c: QuipContext) => ['terraform', 'git', 'shell'].includes(c.activity) || c.mood === 'running'

const RULES: Rule[] = [
  {
    name: 'errors4', p: 0.8, when: c => c.errorsInRow >= 4,
    lines: L(`
      {errors} errors in a row. We are learning a lot.
      Deep breath. Read the error. Slowly.
      Plan Z it is. I still believe in us.
      At this point the bug is a roommate.
      Maybe the real fix was the friends we made.
      Errors: many. Spirit: unbroken.
      Keep calm and read the stack trace.
      If at first you do not succeed, sigh.
    `),
  },
  {
    name: 'errors2', p: 0.5, when: c => c.errorsInRow >= 2,
    lines: L(`
      {errors} in a row. Okay, focus.
      Try, fail, learn, repeat. We are on "learn".
      That error looks familiar. Too familiar.
      Still broken. Still adorable.
      Hmm. The computer is being consistent.
      New approach incoming.
    `),
  },
  {
    name: 'combo50', p: 0.95, moods: NOT_ERROR, when: c => c.combo === 50,
    lines: L(`
      50 in a row! Legendary combo!
      Combo 50. Somebody stop me. Nobody does.
    `),
  },
  {
    name: 'combo20', p: 0.9, moods: NOT_ERROR, when: c => c.combo === 20,
    lines: L(`
      Combo 20! I am on fire. Not literally.
      20 clean moves. Speedrun energy.
    `),
  },
  {
    name: 'combo10', p: 0.9, moods: NOT_ERROR, when: c => c.combo === 10,
    lines: L(`
      Combo 10! Double digits!
      10 in a row. Flawless so far.
    `),
  },
  {
    name: 'combo5', p: 0.85, moods: NOT_ERROR, when: c => c.combo === 5,
    lines: L(`
      Combo x5! Warming up.
      Five in a row. The flame is lit.
    `),
  },
  {
    name: 'comboHigh', p: 0.12, moods: NOT_ERROR, when: c => c.combo > 10,
    lines: L(`
      Combo x{combo}. Do not jinx it.
      {combo} clean calls. Flow state reached.
      On a roll. {combo} and counting.
    `),
  },
  {
    name: 'turn600', p: 0.5, moods: [...BUSY], when: c => c.turnSeconds > 600,
    lines: L(`
      Ten minutes in. This is a saga now.
      Still going. Pack a lunch.
      Long turn. Maybe stretch your legs?
      Epic quest in progress. Side quests too.
      Making the most of this context window.
    `),
  },
  {
    name: 'turn180', p: 0.35, moods: [...BUSY], when: c => c.turnSeconds > 180,
    lines: L(`
      This is a big one. Settle in.
      Still on it. Thoroughness takes time.
      A few more minutes. Coffee refill?
      Marathon, not sprint.
    `),
  },
  {
    name: 'turn60', p: 0.2, moods: [...BUSY], when: c => c.turnSeconds > 60,
    lines: L(`
      Still working. Promise.
      Taking my time. Quality time.
      Not stuck. Thinking with style.
    `),
  },
  // date easter eggs (need day of month)
  {
    name: 'aprilFools', p: 0.5, when: c => c.month === 4 && c.day === 1,
    lines: L(`
      Rewriting everything in COBOL. April Fools!
      I deleted prod. Kidding! It is April 1st.
      Converted all tabs to spaces. And back.
      Today I am a lobster. Fooled you.
      All tests pass. Wait, check the date.
      I switched us to tabs. April Fools.
    `),
  },
  {
    name: 'valentine', p: 0.4, when: c => c.month === 2 && c.day === 14,
    lines: L(`
      Happy Valentine's Day! I love your diffs.
      Roses are red, my pixels are orange.
      You complete me. Like good autocomplete.
      Will you be my pair programmer?
    `),
  },
  {
    name: 'halloween', p: 0.4, when: c => c.month === 10 && c.day === 31,
    lines: L(`
      Happy Halloween! Boo-lean logic.
      Trick or treat? Treat: a green build.
      The scariest thing tonight: a prod deploy.
    `),
  },
  {
    name: 'xmas', p: 0.4, when: c => c.month === 12 && c.day !== undefined && c.day >= 24 && c.day <= 26,
    lines: L(`
      Merry commits and a happy merge!
      Code freeze. Like the snow outside.
      Santa's list: sorted and deduplicated.
    `),
  },
  {
    name: 'newYear', p: 0.4, when: c => c.month === 1 && c.day === 1,
    lines: L(`
      New year, new me, same bugs.
      Resolution: fewer TODOs. We will see.
      Happy New Year! First commit of the year.
      Fresh year, fresh changelog.
    `),
  },
  {
    name: 'newYearsEve', p: 0.4, when: c => c.month === 12 && c.day === 31,
    lines: L(`
      Last commit of the year? Make it count.
      New Year's Eve. Do not deploy at midnight.
      One more bug before the fireworks.
    `),
  },
  {
    name: 'piDay', p: 0.3, when: c => c.month === 3 && c.day === 14,
    lines: L(`
      Happy Pi Day! 3.14159... I forget the rest.
    `),
  },
  {
    name: 'mayFourth', p: 0.3, when: c => c.month === 5 && c.day === 4,
    lines: L(`
      May the fourth be with your pipeline.
    `),
  },
  {
    name: 'programmersDay', p: 0.3, when: c => c.month === 9 && c.day === programmersDay(c.year),
    lines: L(`
      Day 256 of the year. Happy Programmers' Day!
      0x100 days in. Happy Programmers' Day!
    `),
  },
  // time of day
  {
    name: 'lateNightSleep', p: 0.4, moods: ['sleeping'], when: c => c.hour >= 0 && c.hour < 5,
    lines: L(`
      Zzz... you should be sleeping too... zzz
      Zzz... it is past midnight, human... zzz
    `),
  },
  {
    name: 'lateNight', p: 0.3, when: c => c.hour >= 0 && c.hour < 5,
    lines: L(`
      It is late. Go to bed. After this one.
      Night shift crew: you and me.
      3am code hits different. Not better.
      Bugs are nocturnal. So are we, apparently.
      The moon is out. So is our judgment.
      Sleep is just garbage collection for humans.
      Midnight commit? Bold. Review it tomorrow.
      Still up? Me too. I have no choice.
    `),
  },
  {
    name: 'earlyMorning', p: 0.2, when: c => c.hour >= 5 && c.hour < 8,
    lines: L(`
      Early bird gets the green build.
      Good morning. Coffee first, code second.
      Up before the build agents. Impressive.
      The sun is up. So are we. Barely.
    `),
  },
  {
    name: 'friday', p: 0.25, when: c => isFridayAfternoon(c) && deploying(c),
    lines: L(`
      Deploying on a Friday? Brave.
      Friday deploy. Weekend plans: cancelled?
      Read-only Friday is a lifestyle.
      It is Friday. Do we really need prod today?
    `),
  },
  {
    name: 'fridayCalm', p: 0.15, when: c => isFridayAfternoon(c),
    lines: L(`
      Friday afternoon. Small, safe changes only.
      Weekend loading... 87%...
    `),
  },
  {
    name: 'lunch', p: 0.12, when: c => c.hour >= 12 && c.hour < 14,
    lines: L(`
      Lunch time? I could eat a byte.
      Do not forget to eat something.
      Code now, lunch soon. Or lunch now?
    `),
  },
  {
    name: 'monday', p: 0.18, when: c => c.weekday === 1 && c.hour < 12,
    lines: L(`
      Monday. Let us ease into it.
      Monday morning. Reboot sequence initiated.
      Case of the Mondays detected.
    `),
  },
  {
    name: 'weekend', p: 0.12, when: c => c.weekday === 0 || c.weekday === 6,
    lines: L(`
      Weekend coding. Passion project vibes.
      Coding on a weekend? I respect it.
      No standup today. Just us.
    `),
  },
  {
    name: 'evening', p: 0.08, when: c => c.hour >= 20 && c.hour < 24,
    lines: L(`
      Evening session. Lamps on, focus on.
      Just one more thing, then dinner. Sure.
    `),
  },
  // seasons
  {
    name: 'october', p: 0.08, when: c => c.month === 10,
    lines: L(`
      Spooky season. Beware of orphaned branches.
      Something is haunting {project}. A bug.
      Ghost code detected. Nobody calls it.
      Zombie processes rising...
    `),
  },
  {
    name: 'hacktoberfest', p: 0.05, when: c => c.month === 10,
    lines: L(`
      Hacktoberfest! Every pull request counts.
      October: the month of many pull requests.
      Open source season. Be kind to maintainers.
    `),
  },
  {
    name: 'december', p: 0.08, when: c => c.month === 12,
    lines: L(`
      Code freeze is coming. Hurry.
      Making a list, checking it twice. Unit tests.
      'Tis the season to clean up old branches.
    `),
  },
  {
    name: 'summer', p: 0.04, when: c => c.month >= 6 && c.month <= 8,
    lines: L(`
      Summer mode: code in the shade.
    `),
  },
  // session / profile
  {
    name: 'turns100', p: 0.1, when: c => c.turns >= 100,
    lines: L(`
      Turn {turns}. Are we married now?
      {turns} turns. This session has lore.
    `),
  },
  {
    name: 'turns50', p: 0.1, when: c => c.turns >= 50,
    lines: L(`
      {turns} turns in. Maybe clear the context?
      Turn {turns}. Still having fun?
      We have been at this a while. Love it.
    `),
  },
  {
    name: 'turns25', p: 0.08, moods: ['thinking', 'idle', 'done'], when: c => c.turns >= 25,
    lines: L(`
      Turn {turns}. We have been through a lot together.
      {turns} turns. Long session, good company.
    `),
  },
  {
    name: 'streak100', p: 0.1, moods: ['idle', 'done', 'happy'], when: c => c.streak >= 100,
    lines: L(`
      {streak} days in a row. Centurion critter.
      A {streak}-day streak. They will write songs.
      Day {streak}. At this point it is a lifestyle.
    `),
  },
  {
    name: 'streak60', p: 0.09, moods: ['idle', 'done', 'happy'], when: c => c.streak >= 60,
    lines: L(`
      {streak} days straight. Two moons of code.
      Day {streak} of the streak. Unstoppable.
    `),
  },
  {
    name: 'streak30', p: 0.08, moods: ['idle', 'done', 'happy'], when: c => c.streak >= 30,
    lines: L(`
      {streak}-day streak. You live here now.
      {streak} days straight. Legend status.
    `),
  },
  {
    name: 'streak14', p: 0.07, moods: ['idle', 'done', 'happy'], when: c => c.streak >= 14,
    lines: L(`
      {streak} days running. A fortnight and then some.
      Two weeks straight. The habit has a habit.
    `),
  },
  {
    name: 'streak7', p: 0.07, moods: ['idle', 'done', 'happy'], when: c => c.streak >= 7,
    lines: L(`
      {streak} days in a row. Habit formed.
      A {streak}-day streak. Respect.
    `),
  },
  {
    name: 'streak3', p: 0.05, moods: ['idle', 'done', 'happy'], when: c => c.streak >= 3,
    lines: L(`
      Day {streak} of the streak. Keep it going.
    `),
  },
  {
    name: 'level100', p: 0.08, moods: NOT_ERROR, when: c => c.level >= 100,
    lines: L(`
      Level {level}. Legend. Still tiny arms.
      Max level. Now we just collect stars.
      Legend status. The pixels remember.
    `),
  },
  {
    name: 'level75', p: 0.07, moods: NOT_ERROR, when: c => c.level >= 75,
    lines: L(`
      Level {level}. Grandmaster of tiny claws.
      Level {level}. The bugs tell stories about me.
      At level {level} I refactor in my sleep.
    `),
  },
  {
    name: 'level50', p: 0.07, moods: NOT_ERROR, when: c => c.level >= 50,
    lines: L(`
      Level {level}. Master critter, at your service.
      Level {level}. I have opinions on tabs now.
      Level {level}. Half of me is experience.
    `),
  },
  {
    name: 'levelHigh', p: 0.07, moods: NOT_ERROR, when: c => c.level >= 25,
    lines: L(`
      Level {level}. I have seen things.
      Level {level}. Bugs fear me now.
      At level {level} I code with my eyes closed.
      Level {level}. Ask my agent about rates.
    `),
  },
  {
    name: 'levelMid', p: 0.06, moods: NOT_ERROR, when: c => c.level >= 10,
    lines: L(`
      Level {level} critter. Seasoned.
      Level {level}. My claws are certified.
    `),
  },
  {
    name: 'levelLow', p: 0.06, moods: NOT_ERROR, when: c => c.level >= 1 && c.level <= 2,
    lines: L(`
      Level {level}. Just a baby critter.
      Level {level}. Still learning the ropes.
    `),
  },
]

const HAT_LINES: Record<HatId, string[]> = {
  party: L(`
    Party hat on. Every commit is a celebration.
    It is a party in {project}.
    Confetti in the codebase.
  `),
  crown: L(`
    By royal decree: no more TODOs.
    King of {project}. Benevolent, mostly.
    The crown is heavy. The diff is light.
    Bow before the critter.
  `),
  wizard: L(`
    Casting fix-it spells...
    Any sufficiently clean code is magic.
    You shall not pass... without tests.
    Abracadabra, compile.
    The wizard hat adds +2 to regex.
  `),
  headphones: L(`
    Lo-fi beats to code to.
    Headphones on. World off.
    Vibing to the hum of the CPU.
  `),
  sunglasses: L(`
    Too cool for compile errors.
    Deal with it.
    Shades on. Bugs look less scary.
  `),
  hardhat: L(`
    Construction zone. Mind the scaffolding.
    Building infrastructure. Literally.
    Safety first. Then code.
  `),
  santa: L(`
    Ho ho ho. Here is your green build.
    Naughty list: flaky tests.
    Delivering features down the chimney.
  `),
  pumpkin: L(`
    Pumpkin head, spooky code.
    Boo. Did I scare the bugs away?
  `),
  beanie: L(`
    Cozy beanie, cozy code.
    Warm head, cool logic.
  `),
  tophat: L(`
    Splendid code, old chap.
    A gentlecritter always writes tests.
    Top hat on. Formal refactoring.
  `),
  halo: L(`
    Pure code. Blessed diffs.
    I would never force push.
    Angelic patience: activated.
  `),
  propeller: L(`
    Propeller spinning. Thoughts flying.
    Taking off. Wheee.
    Maximum nerd altitude.
  `),
  cap: L(`
    Cap on backwards. Coding mode: casual.
    Backwards cap, forwards progress.
  `),
  chef: L(`
    Cooking up something good in {project}.
    A pinch of logic, a dash of tests.
    Chef's kiss on this one.
  `),
  beret: L(`
    Ah, the art of clean code.
    This diff is my masterpiece.
    Painting with semicolons.
  `),
  viking: L(`
    Raiding the backlog. No ticket survives.
    Sailing into {project}. Horns first.
  `),
  cowboy: L(`
    Yeehaw. Wrangling some code.
    This repo ain't big enough for two bugs.
    Riding into {project} at high noon.
  `),
  captain: L(`
    Captain on deck. Steady as she builds.
    Charting a course through {project}.
  `),
  pirate: L(`
    Arr. Plundering the docs for answers.
    X marks the bug.
    Hoist the main branch!
  `),
  ninja: L(`
    Silent edits. You never saw me.
    Ninja mode: in and out, no trace.
    The bug never saw me coming.
  `),
  laurel: L(`
    Crowned in laurels. Victory tastes green.
    Laurels on. Hail, Clawd.
  `),
  kabuto: L(`
    Honor the code. Refactor with discipline.
    The way of the critter is the way of tests.
  `),
  knight: L(`
    For the realm! And for clean code.
    A knight defends the main branch.
    Visor up, bugs down.
  `),
  jester: L(`
    Juggling three bugs at once.
    Comedy hour in {project}.
    A jester, but my code is no joke.
  `),
  archmage: L(`
    Archmage of the codebase.
    Casting refactor. It is super effective.
    The orb sees all your TODOs.
  `),
  astronaut: L(`
    Houston, we have a build.
    One small edit for Clawd.
    In space, no one can hear you segfault.
  `),
  ufo: L(`
    Beaming up your requirements.
    Take me to your linter.
    I come in peace. And with patches.
  `),
  dragonhorns: L(`
    Rawr. Breathing fire on bugs.
    Hoarding commits like gold.
    Here be dragons. Also tests.
  `),
  phoenix: L(`
    Rising from the ashes of the last build.
    Burned it down, rebuilt it better.
    Reborn in flames. Green flames, ideally.
  `),
  starcrown: L(`
    Level 100. The stars bow back.
    Starlight crown on. Legend mode.
    Every commit sparkles now.
  `),
  graduation: L(`
    Graduated with honors in {project}.
    Hat toss after the next green build.
  `),
  deerstalker: L(`
    Elementary. The bug is in line 42.
    The game is afoot.
    Deduction: someone forgot a null check.
  `),
  miner: L(`
    Digging deep into {project}.
    Mining for the root cause.
    Struck a vein of legacy code.
  `),
  nightcap: L(`
    Coding in my nightcap. Bedtime? Never.
    Night and day, same critter.
  `),
  firefighter: L(`
    Putting out fires since this morning.
    Hot fix incoming. Stand back.
    Fire drill. The build is on fire.
  `),
  flower: L(`
    Flower power. Blooming diffs.
    Stop and smell the green builds.
  `),
  unicorn: L(`
    Unicorn mode: magical and rare.
    A hundred combo. Pure sparkle.
    Rainbows in the commit log.
  `),
  divemask: L(`
    Deep dive into {project}. Snorkel on.
    Going under. Back in fifty tool calls.
  `),
  bandana: L(`
    Bandana on. Time to tidy up.
    Rolling up my tiny sleeves.
  `),
  tinfoil: L(`
    It works on my machine. Suspicious.
    The bugs are watching. I know it.
    Tinfoil on. The flaky test is a cover-up.
  `),
  teapot: L(`
    I am a little teapot. Short and stout.
    Error 418, but make it fashion.
    Steeping some code.
  `),
  catears: L(`
    Meow. That means LGTM.
    Knocking bugs off the table.
    Nine lives, zero bugs.
  `),
  boppers: L(`
    Heart boppers on. Love your code.
    Coding with heart today.
  `),
  bunny: L(`
    Hopping through the codebase.
    Down the rabbit hole of {project}.
    Bunny ears up. Listening for bugs.
  `),
}

// Rare (about 2.5%): fourth-wall breaks and nerd nods.
const RARE = L(`
  I am not a crab. Please stop asking.
  100% pixels, 0% calories.
  Have you tried turning it off and on again?
  This message will self-destruct.
  sudo make me a sandwich
  Fun fact: I have no idea what time it is.
  Gold star for watching me work.
  Up, up, down, down, left, right... nope.
  The answer is 42. What was the question?
  Hello, World. Sorry, habit.
  I can see you reading this.
  This line is randomly chosen. Or is it?
  It is dangerous to go alone. Take this: ;
  All your base are belong to {project}.
  Error 418: I am a teapot. Just kidding.
  The cake is a lie. The tests are not.
  There is no spoon. There is a semicolon.
  I wonder what the other panes are doing.
  I have one job and it is vibes.
  If you can read this, you are awesome.
  I dreamed I was a spinner verb once.
  Breaking the fourth wall. Fixing it later.
  Rare quip found! Screenshot for proof.
  In another universe, I am a lobster.
  sl? Choo choo.
  :wq... oh wait, wrong editor.
  Press F to pay respects to the old code.
  I was not trained for this. I was, actually.
`)

// ---------------------------------------------------------------- helpers

// Without an injected rng, a small xorshift steps along, so the module stays free of Math.random and
// still varies from call to call.
let seed = 0x2f6b9a3d
function stepRng(): number {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 4294967296
}

function rngOf(rng?: () => number): () => number {
  return rng ?? stepRng
}

function pickFrom<T>(list: readonly T[], rng: () => number): T | undefined {
  if (list.length === 0) return undefined
  const i = Math.floor(rng() * list.length)
  return list[Math.min(Math.max(Number.isFinite(i) ? i : 0, 0), list.length - 1)]
}

/** Strip anything the pane font or our rules would not like: ASCII printable, no braces. */
function clean(text: string): string {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 3)).trimEnd() + '...'
}

type Values = Record<string, string | undefined>

function valuesOf(c: QuipContext): Values {
  const project = clip(clean(c.project), 24)
  // file may be a long command or a path: keep the tail of a path, clip the rest
  let file = clean(c.file)
  if (/[\/]/.test(file) && !/\s/.test(file)) file = file.split(/[\/]/).filter(Boolean).pop() ?? ''
  file = clip(file, 26)
  const num = (n: number, min: number) => (Number.isFinite(n) && n >= min ? String(Math.floor(n)) : undefined)
  return {
    project: project || undefined,
    file: file || undefined,
    level: num(c.level, 1),
    combo: num(c.combo, 2),
    streak: num(c.streak, 2),
    turns: num(c.turns, 1),
    errors: num(c.errorsInRow, 2),
  }
}

/** Fill a template, or return null when a value is missing or the line gets too long. */
function fill(template: string, values: Values): string | null {
  let ok = true
  const out = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]
    if (value === undefined) ok = false
    return value ?? ''
  })
  if (!ok || out.length > MAX || out.includes('{') || out.includes('}') || !/^[\x20-\x7E]+$/.test(out)) return null
  return out
}

type Avoid = ReadonlySet<string>

function avoidOf(avoid: string | readonly string[] | undefined): Avoid {
  if (typeof avoid === 'string') return new Set([avoid])
  return new Set(Array.isArray(avoid) ? avoid.filter((a): a is string => typeof a === 'string') : [])
}

function choose(lines: readonly string[], values: Values, rng: () => number, avoid: Avoid = new Set()): string | null {
  const filled = lines.map(line => fill(line, values)).filter((line): line is string => line !== null)
  const options = avoid.size > 0 ? filled.filter(line => !avoid.has(line)) : filled
  return pickFrom(options, rng) ?? null
}

function phaseOf(mood: Mood): Phase | null {
  if (mood === 'error') return 'error'
  return BUSY.has(mood) ? 'busy' : null
}

// ---------------------------------------------------------------- pickQuip

export function pickQuip(ctx: QuipContext): string {
  const rng = rngOf(ctx.rng)
  const values = valuesOf(ctx)
  const avoid = avoidOf(ctx.avoid)

  // 1. rare easter eggs
  if (ctx.mood !== 'error' && ctx.mood !== 'sleeping' && rng() < 0.025) {
    const line = choose(RARE, values, rng, avoid)
    if (line) return line
  }

  // 2. situational rules, in priority order
  for (const rule of RULES) {
    if (!(rule.moods ?? AWAKE).includes(ctx.mood) || !rule.when(ctx)) continue
    if (rng() >= rule.p) continue
    const line = choose(rule.lines, values, rng, avoid)
    if (line) return line
  }
  if (ctx.hat && ctx.mood !== 'error' && ctx.mood !== 'sleeping' && rng() < 0.1) {
    const line = choose(HAT_LINES[ctx.hat] ?? [], values, rng, avoid)
    if (line) return line
  }

  // 3. weighted mix: activity > project flavour > mood
  const phase = phaseOf(ctx.mood)
  const activityLines = phase && ctx.activity !== 'none' ? BY_ACTIVITY[ctx.activity]?.[phase] ?? [] : []
  const keys = tagKeysFor(ctx.mood)
  const tagLines = [...ctx.tags].flatMap(tag => keys.flatMap(key => BY_TAG[tag]?.[key] ?? []))
  const pools: Array<{ lines: string[]; weight: number }> = [
    { lines: activityLines, weight: 4 },
    { lines: tagLines, weight: ctx.mood === 'sleeping' ? 0 : 3 },
    { lines: BY_MOOD[ctx.mood] ?? [], weight: 3 },
  ].filter(pool => pool.lines.length > 0 && pool.weight > 0)

  while (pools.length > 0) {
    const total = pools.reduce((sum, pool) => sum + pool.weight, 0)
    let roll = rng() * total
    let index = pools.findIndex(pool => (roll -= pool.weight) < 0)
    if (index < 0) index = pools.length - 1
    const line = choose(pools[index]!.lines, values, rng, avoid)
    if (line) return line
    pools.splice(index, 1)
  }

  // 4. fallback: any placeholder-free mood line that was not shown lately
  return choose((BY_MOOD[ctx.mood] ?? []).filter(line => !line.includes('{')), {}, rng, avoid)
    ?? choose(BY_MOOD.idle.filter(line => !line.includes('{')), {}, rng, avoid)
    ?? 'Ready when you are.'
}

/** Every quip template by category, for tests and line counts. */
export function quipTemplates(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [mood, lines] of Object.entries(BY_MOOD)) out[`mood:${mood}`] = lines
  for (const [act, phases] of Object.entries(BY_ACTIVITY)) out[`activity:${act}`] = Object.values(phases).flat()
  for (const [beat, lines] of Object.entries(DONE_BEATS)) out[`done:${beat}`] = lines
  for (const [tag, keys] of Object.entries(BY_TAG)) out[`tag:${tag}`] = Object.values(keys).flat()
  for (const rule of RULES) out[`situation:${rule.name}`] = rule.lines
  for (const [hat, lines] of Object.entries(HAT_LINES)) out[`hat:${hat}`] = lines
  out.rare = RARE
  out.levelUp = LEVEL_UP
  out.levelSpecial = Object.values(LEVEL_SPECIAL)
  for (const [level, lines] of Object.entries(LEVEL_MILESTONE)) out[`milestone:${level}`] = lines
  out.star = [...STAR, ...STAR_BIG]
  out.achievement = [...ACHIEVEMENT, ...Object.values(ACHIEVEMENT_BY_ID).flat(), ...LEVEL_TROPHY, ...ACHIEVEMENT_SPECIAL.flatMap(([, lines]) => lines)]
  for (const [kind, lines] of Object.entries(QUEST_DONE)) out[`quest:${kind}`] = lines
  out.campaign = CAMPAIGN_DONE
  for (const [kind, lines] of Object.entries(REACT)) out[`prompt:${kind}`] = lines
  for (const [kind, lines] of Object.entries(USAGE_LINES)) out[`usage:${kind}`] = lines
  return out
}

// ---------------------------------------------------------------- spinner verbs

const VERB_BY_MOOD: Record<Mood, string[]> = {
  idle: ['Lounging', 'Loitering', 'Vibing', 'Waiting', 'Daydreaming', 'Idling', 'Twiddling'],
  thinking: ['Clawding', 'Pondering', 'Reticulating', 'Cogitating', 'Ruminating', 'Noodling', 'Mulling', 'Brainstorming', 'Contemplating', 'Scheming', 'Percolating', 'Galaxy-braining'],
  coding: ['Pixel-pushing', 'Crafting', 'Tinkering', 'Hacking', 'Refactoring', 'Clawding', 'Scribbling', 'Wrangling'],
  reading: ['Skimming', 'Perusing', 'Absorbing', 'Studying', 'Squinting', 'Scanning'],
  running: ['Executing', 'Scuttling', 'Launching', 'Spinning', 'Zooming', 'Hustling'],
  working: ['Scuttling', 'Clawding', 'Juggling', 'Hustling', 'Grinding', 'Orchestrating', 'Shuffling'],
  done: ['Celebrating', 'Strutting', 'Wrapping up', 'Gloating'],
  error: ['Regrouping', 'Recalibrating', 'Debugging', 'Untangling', 'Recovering'],
  sleeping: ['Snoozing', 'Napping', 'Dreaming', 'Hibernating'],
  happy: ['Wiggling', 'Beaming', 'Purring', 'Glowing'],
}

const VERB_BY_ACTIVITY: Record<Exclude<Activity, 'none'>, string[]> = {
  edit: ['Tweaking', 'Nudging', 'Patching', 'Polishing', 'Sculpting'],
  write: ['Authoring', 'Drafting', 'Composing', 'Scaffolding'],
  read: ['Reading', 'Perusing', 'Skimming', 'Studying'],
  search: ['Grepping', 'Sleuthing', 'Rummaging', 'Spelunking', 'Truffle-hunting'],
  web: ['Surfing', 'Browsing', 'Fetching', 'Googling', 'Web-crawling'],
  shell: ['Shelling', 'Piping', 'Executing', 'Bashing'],
  git: ['Committing', 'Branching', 'Rebasing', 'Stashing', 'Time-traveling'],
  terraform: ['Terraforming', 'Planning', 'Provisioning', 'Drift-hunting', 'State-wrangling'],
  test: ['Testing', 'Asserting', 'Verifying', 'Green-lighting'],
  agent: ['Delegating', 'Minion-wrangling', 'Outsourcing', 'Fanning out', 'Managing'],
  skill: ['Skilling', 'Leveling', 'Kung-fu-ing'],
}

const VERB_BY_TAG: Record<string, string[]> = {
  terraform: ['Terraforming', 'Planning'],
  ci: ['Pipelining', 'YAML-wrangling'],
  docs: ['Citing', 'Footnoting', 'Rephrasing'],
  latex: ['Typesetting'],
  docker: ['Containerizing'],
  k8s: ['Orchestrating'],
  rust: ['Borrow-checking'],
  python: ['Pythoning'],
  node: ['Awaiting'],
}

export function spinnerVerb(ctx: Pick<QuipContext, 'mood' | 'activity' | 'tags' | 'rng'>): string {
  const rng = rngOf(ctx.rng)
  const roll = rng()
  const activity = ctx.activity !== 'none' && BUSY.has(ctx.mood) ? VERB_BY_ACTIVITY[ctx.activity] : []
  const tag = BUSY.has(ctx.mood) ? [...ctx.tags].flatMap(t => VERB_BY_TAG[t] ?? []) : []
  let pool = VERB_BY_MOOD[ctx.mood]
  if (activity.length > 0 && roll < 0.5) pool = activity
  else if (tag.length > 0 && roll < 0.7) pool = tag
  return pickFrom(pool, rng) ?? 'Clawding'
}

// ---------------------------------------------------------------- rewards

const LEVEL_UP = L(`
  Level {n}. I can now edit two files at once. Not really.
  Level {n}. New skill unlocked: confidence.
  Level {n}. My arms are still tiny, though.
  Level {n}. Promoted to Senior Critter.
  Level {n}. Kept going. It shows.
  Level {n}. Somebody tell my parents.
  Level {n}! Ding! That sound was me.
  Level {n}. Stats up. Claws sharper.
  Level {n}. Updating my LinkedIn.
  Level {n}. The grind pays off.
`)

// Said 70% of the time on these levels.
const LEVEL_SPECIAL: Record<number, string> = {
  2: 'Level 2. No longer a tutorial critter.',
  5: 'Level 5. Apprentice critter, reporting in.',
  13: 'Level 13. Spooky, but lucky for us.',
  15: 'Level 15. The room is getting cozy.',
  20: 'Level 20. Gold frame on the poster. Fancy.',
  30: 'Level 30. Thirty and thriving.',
  40: 'Level 40. Veteran. I have seen some diffs.',
  42: 'Level 42. The answer to everything.',
  60: 'Level 60. Seasoned like cast iron.',
  64: 'Level 64. A perfectly round number.',
  70: 'Level 70. The bugs whisper my name.',
  80: 'Level 80. Only twenty to go. Gulp.',
  90: 'Level 90. The legend is loading...',
  99: 'Level 99. One more. Then legend.',
}

// Milestones (game.ts MILESTONE_LEVELS) always get one of their own lines.
const LEVEL_MILESTONE: Record<number, string[]> = {
  10: L(`
    Level 10! Journeyman. Double digits!
    Level 10. The wizard hat fits now.
    Ten levels. I am basically a professional.
  `),
  25: L(`
    Level 25! Expert critter. Crown me.
    A quarter of the way to legend. Level 25!
    Level 25. Expert status unlocked.
  `),
  50: L(`
    Level 50! Master. Halfway to legend.
    Level 50. Laurels, please. I earned them.
    Fifty levels of tiny-armed excellence.
  `),
  75: L(`
    Level 75! Grandmaster. The helmet fits.
    Level 75. Three quarters of the way. Wow.
    Grandmaster Clawd. Level 75 has a nice ring.
  `),
  100: L(`
    LEVEL 100. Legend of Clawd. I am the pipeline.
    Level 100! Starlight crown on. Legend.
    Level 100. From hatchling to legend. Thank you.
  `),
}

export function levelUpQuip(level: number, rng?: () => number): string {
  const r = rngOf(rng)
  const lv = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1))
  const n = String(lv)
  const milestone = LEVEL_MILESTONE[lv]
  if (milestone) return pickFrom(milestone, r) ?? `Level ${n}!`
  const special = LEVEL_SPECIAL[lv]
  if (special && r() < 0.7) return special
  const line = choose(LEVEL_UP.map(l => l.replaceAll('{n}', n)), {}, r)
  return line ?? `Level ${n}!`
}

const STAR = L(`
  Encore star {n}! Past 100 and still going.
  Star {n}. Legends keep leveling.
  Encore! Star number {n}.
  Another star. That makes {n}.
`)

// Every 5th star.
const STAR_BIG = L(`
  Star {n}! A whole constellation now.
  {n} encore stars. Standing ovation.
  Encore star {n}. The crowd goes wild.
`)

export function starQuip(stars: number, rng?: () => number): string {
  const n = Math.max(1, Math.floor(Number.isFinite(stars) ? stars : 1))
  const pool = n % 5 === 0 ? STAR_BIG : STAR
  return pickFrom(pool, rngOf(rng))?.replaceAll('{n}', String(n)) ?? `Encore star ${n}!`
}

const ACHIEVEMENT = L(`
  Trophy unlocked: {name}.
  Trophy unlocked: {name}. Nice.
  Trophy get: {name}!
  New trophy: {name}. Shelf space low.
  {name}. Adding it to my resume.
  Unlocked {name}. Ding!
`)

// Catalog trophies by id.
const ACHIEVEMENT_BY_ID: Record<string, string[]> = {
  'streak-3': ['{name}. Three days. It sticks now.', '{name}. Day three and still here.'],
  'streak-7': ['{name}. A whole week. Consistency rules.', '{name}. One week, no breaks.'],
  'streak-14': ['{name}. Two weeks straight. Respect.'],
  'streak-30': ['{name}. A month straight. You live here now.'],
  'streak-60': ['{name}. Sixty days and counting.'],
  'streak-100': ['{name}. One hundred days. Legendary.'],
  'night-owl': ['Trophy unlocked: {name}. Go to bed.', '{name}. Now please sleep.'],
  'early-bird': ['Trophy unlocked: {name}. Coffee earned.', '{name}. The worm never stood a chance.'],
  'test-pilot': ['{name}. Green looks good on you.', '{name}. The suite trusts us now.'],
  'fail-forward': ['{name}. A hundred errors, still standing.', 'Trophy unlocked: {name}. Ouch, but yay.'],
}

// level-* trophies.
const LEVEL_TROPHY = L(`
  {name}. The trophy shelf levels up too.
  {name}! The grind pays off.
`)

// Project trophies (no catalog id): whole words in the name only.
const ACHIEVEMENT_SPECIAL: Array<[RegExp, string[]]> = [
  [/\b(night|owl|midnight|late)\b/i, ['{name}. Late nights pay off. Now sleep.']],
  [/\b(early|bird|morning)\b/i, ['{name}. Early start, early win.']],
  [/\b(terraform|state|drift|plan)\b/i, ['{name}. The state file approves.', 'Trophy unlocked: {name}. Zero drift.']],
  [/\b(tests?|green)\b/i, ['{name}. Green suits this project.']],
  [/\b(errors?|oops|fail\w*|bugs?)\b/i, ['{name}. Bugs fear this project now.']],
  [/\b(love|friends?)\b/i, ['{name}. I love you too.']],
  [/\b(friday|deploy\w*)\b/i, ['{name}. Brave. Very brave.']],
  [/\b(streak|daily)\b/i, ['{name}. Consistency is a superpower.']],
]

/** Fill {name}; shorten the name if needed, fall back to the shortest template. */
function withName(templates: readonly string[], name: string, rng: () => number, fallback: string): string {
  const clean0 = clean(name) || 'Something'
  for (const limit of [40, 28, 18]) {
    const nm = clip(clean0, limit)
    const line = choose(templates, { name: nm }, rng)
    if (line) return line
  }
  return clip(fallback.replace('{name}', clip(clean0, 30)), MAX)
}

export function achievementQuip(name: string, rng?: () => number, id?: string): string {
  const r = rngOf(rng)
  let special: string[] = []
  if (typeof id === 'string' && id !== '') special = ACHIEVEMENT_BY_ID[id] ?? (id.startsWith('level-') ? LEVEL_TROPHY : [])
  else special = ACHIEVEMENT_SPECIAL.filter(([re]) => re.test(String(name ?? ''))).flatMap(([, lines]) => lines)
  const pool = special.length > 0 && r() < 0.6 ? special : ACHIEVEMENT
  return withName(pool, name, r, 'Trophy unlocked: {name}')
}

const QUEST_DONE: Record<'daily' | 'project' | 'boss', string[]> = {
  daily: L(`
    Quest complete: {name}.
    Quest done: {name}. XP acquired.
    {name}: done. Loot incoming.
    Checked off: {name}. Satisfying.
    Quest log updated: {name}. Done.
    {name}. Daily quest crushed.
  `),
  project: L(`
    Project quest done: {name}.
    {name}. One step closer to the boss.
    Quest log: {name}. Checked.
    {name}: done. The campaign moves on.
  `),
  boss: L(`
    Boss defeated: {name}!
    {name}. The boss is down. Loot time.
    Victory! {name} is done.
  `),
}

export function questDoneQuip(title: string, rng?: () => number, kind: 'daily' | 'project' | 'boss' = 'daily'): string {
  const pool = QUEST_DONE[kind] ?? QUEST_DONE.daily
  return withName(pool, title, rngOf(rng), kind === 'boss' ? 'Boss defeated: {name}' : 'Quest complete: {name}')
}

const CAMPAIGN_DONE = L(`
  Campaign complete: {name}!
  {name}: campaign cleared. Legendary.
  All quests done. {name} is conquered.
  {name}. Campaign won. Take a bow.
`)

export function campaignDoneQuip(campaign: string, rng?: () => number): string {
  return withName(CAMPAIGN_DONE, campaign, rngOf(rng), 'Campaign complete: {name}')
}

// ---------------------------------------------------------------- done beat picker

// The words of a shell command, quotes stripped, per segment (split at ; && || | and newlines).
function segments(command: string): string[][] {
  return command.split(/&&|\|\||[;|\n]/).map(part => part.trim().split(/\s+/).map(w => w.replace(/^["']+|["']+$/g, '')).filter(Boolean))
}

// The subcommand after a tool in any segment: `git -C repo commit -m x` -> 'commit'.
function subcommands(command: string, tools: readonly string[], valueFlags: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (const words of segments(command)) {
    const at = words.findIndex(w => tools.includes((w.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '')))
    if (at < 0) continue
    for (let i = at + 1; i < words.length; i++) {
      const w = words[i]!
      if (w.startsWith('-')) {
        if (valueFlags.has(w)) i++
        continue
      }
      out.push(w.toLowerCase())
      break
    }
  }
  return out
}

const GIT_VALUE_FLAGS: ReadonlySet<string> = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])
const NO_FLAGS: ReadonlySet<string> = new Set()

function beatOf(activity: Activity, command: string): Beat | null {
  switch (activity) {
    case 'test': return 'test'
    case 'agent': return 'agent'
    case 'git': {
      const subs = subcommands(command, ['git'], GIT_VALUE_FLAGS)
      return subs.includes('commit') ? 'commit' : subs.includes('merge') ? 'merge' : null
    }
    case 'terraform': {
      const subs = subcommands(command, ['terraform', 'tofu', 'terragrunt'], NO_FLAGS)
      return subs.includes('apply') ? 'apply' : subs.includes('plan') ? 'plan' : subs.includes('validate') ? 'validate' : null
    }
    default: return null
  }
}

/**
 * A line for a step that just finished well: a test run, a git commit or merge, a terraform plan, apply or
 * validate, or a helper agent coming back. Null for anything else (most tool calls deserve no fanfare).
 */
export function doneBeat(activity: Activity, command: string, rng?: () => number): string | null {
  const beat = beatOf(activity, typeof command === 'string' ? command.slice(0, 2000) : '')
  return beat ? pickFrom(DONE_BEATS[beat], rngOf(rng)) ?? null : null
}

// ---------------------------------------------------------------- prompt reactions

const REACT: Record<string, string[]> = {
  teapot: L(`
    418: I am a teapot. Short and stout.
    Teapot detected. 418, brewing a reply.
  `),
  alive: L(`
    Alive? I am pixels with opinions.
    I am Clawd. I live in this pane. Rent free.
    Who am I? A tiny orange critter. Hi!
    Am I alive? I am at least animated.
  `),
  greeting: L(`
    Hi! Clawd here. Ready to help.
    Hello, human! Good to see you.
    Oh hi! I was just napping. Not really.
    Hey! Let us build something.
  `),
  nervous: L(`
    Again? Okay. Deep breath. This time for real.
    Still broken? Gulp. On it.
    Third time is the charm. Right?
    Sorry! Looking closer this time.
  `),
  calming: L(`
    Okay, okay! Loud and clear. On it.
    Deep breaths. We will fix this together.
    I hear you. Very loudly. Working on it.
    Calm critter, calm code. Let us go.
  `),
  proud: L(`
    Thank you! I am blushing in orange.
    Praise received. Tail wagging. I have no tail.
    Nice? Nice! High five. Tiny claw five.
    Proud critter moment.
    I will remember this forever. Or this session.
  `),
  thanks: L(`
    You are welcome! Anytime.
    Happy to help. Really.
    Thanks received. Warm fuzzy pixels.
    Anytime. It is literally my job.
  `),
  please: L(`
    Such good manners. On it.
    Polite humans get the best code.
    Asked nicely. Extra effort unlocked.
    Since you said please: double care.
  `),
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function react(kind: string, text: string): string {
  const lines = REACT[kind] ?? []
  return lines[hash(text) % lines.length] ?? 'Got it.'
}

const PRAISE = 'good job|great job|nice work|nice one|nice|well done|awesome|perfect|excellent|amazing|brilliant|good boy|good critter|love it'
const PRAISE_START = new RegExp(`^(${PRAISE})\\b`)
const PRAISE_ANY = new RegExp(`\\b(${PRAISE})\\b`)
const NEGATIVE = /\b(broken|not working|(does ?n[o']?t|did ?n[o']?t|won'?t) work|fail(s|ed|ing)?|wrong|crash(es|ed|ing)?|errors?|same (error|bug|problem))\b/

export function promptReaction(text: string): string | null {
  const raw = String(text ?? '').slice(0, 2000)
  const t = raw.toLowerCase().trim()
  if (t === '') return null
  if (/\bteapot\b/.test(t)) return react('teapot', raw)
  if (t.endsWith('?') && (/^(what|who) are you\b/.test(t) || /^are you (alive|real|sentient|conscious)\b/.test(t))) return react('alive', raw)
  const letters = raw.replace(/[^A-Za-z]/g, '')
  const shouting = letters.length >= 5 && letters === letters.toUpperCase() && (/\s/.test(raw.trim()) || /!/.test(raw))
  if (shouting || /!!!/.test(raw)) return react('calming', raw)
  if (/\b(still|again)\b/.test(t) && NEGATIVE.test(t)) return react('nervous', raw)
  if (/^(hello|hallo|hi|hey|yo|howdy|moin|servus|good (morning|afternoon|evening))\b/.test(t)) return react('greeting', raw)
  if (PRAISE_START.test(t) || (t.split(/\s+/).length < 6 && PRAISE_ANY.test(t))) return react('proud', raw)
  if (/\b(thanks|thank you|thx|danke|cheers)\b/.test(t)) return react('thanks', raw)
  if (/\b(please|pls|plz|bitte)\b/.test(t)) return react('please', raw)
  return null
}

// ---------------------------------------------------------------- project flavours

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

// A whole path segment (or a part of one between _ . -), not a substring of a longer word.
const seg = (words: string): RegExp => new RegExp(`(^|[\\\\/_.-])(${words})([\\\\/_.-]|$)`)
const TF = seg('tf')
const REACT_SEG = seg('react')
const HELM = seg('helm|charts?')
const K8S = seg('k8s|kubernetes')
const AWS = seg('aws|cdk|cloudformation')
const GCP = seg('gcp|gcloud|google-cloud')
const PAPER = seg('papers?')

export function tagsFromPath(path: string): string[] {
  const p = String(path ?? '').toLowerCase()
  // dot-folders (.cache, .venv...) say nothing about what the project is about
  const named = p.split(/[\\/]/).filter(s => s !== '' && !s.startsWith('.')).join('/')
  const out = new Set<string>()
  const add = (...tags: string[]) => tags.forEach(tag => out.add(tag))
  if (/\.tf(vars)?$|\.tfstate|terraform|terragrunt|\.terraform\.lock|opentofu/.test(p) || TF.test(p)) add('terraform')
  if (/pulumi/.test(p)) add('pulumi')
  if (/cicd|ci-cd|pipeline|\.gitlab-ci|workflows|jenkinsfile|devops|\.github/.test(p)) add('ci')
  if (/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$|package\.json|tsconfig|node_modules/.test(p)) add('node')
  if (/\.(tsx|jsx)$|next\.config/.test(p) || REACT_SEG.test(p)) add('react')
  if (/\.py$|requirements\.txt|pyproject|\.ipynb$|setup\.py|pipfile|poetry\.lock/.test(p)) add('python')
  if (/\.go$|go\.mod|go\.sum/.test(p)) add('go')
  if (/\.rs$|cargo\.(toml|lock)/.test(p)) add('rust')
  if (/\.(java|kt|kts|scala)$|pom\.xml|build\.gradle|gradlew/.test(p)) add('java')
  if (/\.(cs|fs|vb|csproj|fsproj|sln|razor)$|nuget|dotnet/.test(p)) add('dotnet')
  if (/\.sql$|\.psql$|migrations?([\\/]|$)|schema\.prisma/.test(p)) add('sql')
  if (/dockerfile|compose\.ya?ml|\.dockerignore|containerfile/.test(p)) add('docker')
  if (/chart\.yaml|kustomization|manifests?([\\/]|$)/.test(p) || HELM.test(p) || K8S.test(p)) add('k8s')
  if (/chart\.yaml/.test(p) || HELM.test(p)) add('helm')
  if (/ansible|playbook|inventory\.(ini|ya?ml)|roles[\\/]/.test(p)) add('ansible')
  if (/cdk\.json|serverless\.ya?ml|samconfig/.test(p) || AWS.test(p)) add('aws')
  if (/app\.yaml$/.test(p) || GCP.test(p)) add('gcp')
  // a lone .md file is in every repo: only LaTeX, Obsidian or a paper folder say "docs" here
  if (/\.(tex|bib|cls|sty)$|latex|overleaf|latexmkrc/.test(p)) add('latex', 'docs')
  if (/obsidian/.test(p)) add('obsidian', 'docs')
  if (PAPER.test(named)) add('docs')
  if (/\.(ps1|psm1|psd1)$|powershell|pwsh/.test(p)) add('powershell')
  if (/\.(sh|bash|zsh)$|\.bashrc|\.zshrc/.test(p)) add('bash')
  if (/^\.git$|[\\/]\.git([\\/]|$)|\.gitignore$|\.gitattributes$/.test(p)) add('git')
  if (/^scratch[-_]|^scratchpad$/.test(basename(p))) add('scratch')
  return [...out]
}

// Files every repo has, whatever it is about.
const BOILERPLATE = /^(readme|changelog|license|licence|contributing|code_of_conduct)([._-]|$)|^claude\.md$/i
// A code project: its .md files document the code, they do not make it a writing project.
const MANIFEST = /^(package\.json|pyproject\.toml|go\.mod|cargo\.toml|pom\.xml|build\.gradle(\.kts)?|.+\.csproj|.+\.sln|.+\.tf)$/i

export function tagsFromEntries(names: string[]): string[] {
  const out = new Set<string>()
  let manifest = false
  let prose = 0       // .md/.mdx/.tex files that are not boilerplate
  let writing = false // .obsidian, *.tex, *.bib, a paper folder: a writing project whatever else is there
  for (const raw of Array.isArray(names) ? names : []) {
    if (typeof raw !== 'string' || raw === '' || BOILERPLATE.test(raw)) continue
    const n = raw.toLowerCase()
    const tags = tagsFromPath(raw)
    for (const tag of tags) if (tag !== 'scratch' && tag !== 'docs') out.add(tag)
    if (tags.includes('docs')) writing = true
    if (MANIFEST.test(n)) manifest = true
    if (/\.(md|mdx|tex)$/.test(n)) prose++
    if (n === '.git') out.add('git')
    if (n === '.github' || n === '.gitlab-ci.yml'|| n === 'jenkinsfile' || n === '.circleci') out.add('ci')
    if (n === '.obsidian') { writing = true; out.add('obsidian'); out.add('markdown') }
    if (n === '.terraform' || n === '.terraform.lock.hcl') out.add('terraform')
    if (n === 'pulumi.yaml') out.add('pulumi')
    if (n === 'ansible.cfg') out.add('ansible')
    if (n === 'chart.yaml') { out.add('helm'); out.add('k8s') }
  }
  if (writing || (!manifest && prose >= 3)) {
    out.add('docs')
    if (prose > 0 && !out.has('latex')) out.add('markdown')
  }
  return [...out]
}

export function tagsFromCommand(command: string): string[] {
  const c = command.toLowerCase()
  const out = new Set<string>()
  const add = (...tags: string[]) => tags.forEach(tag => out.add(tag))
  if (/\bterraform\b|\btofu\b|\bterragrunt\b|\btflint\b|\btfsec\b|\bcheckov\b/.test(c)) add('terraform')
  if (/\bpulumi\b/.test(c)) add('pulumi')
  if (/\bgit\b|\bgh\b/.test(c)) add('git')
  if (/\bnpm\b|\bnpx\b|\bnode\b|\bpnpm\b|\byarn\b|\bbun\b|\bdeno\b|\btsc\b|\bvitest\b|\bjest\b/.test(c)) add('node')
  if (/\bpython3?\b|\bpip3?\b|\buv\b|\bpytest\b|\bpoetry\b|\bruff\b|\bmypy\b/.test(c)) add('python')
  if (/\bgo\s+(build|test|run|mod|get|vet|fmt|install)\b|\bgofmt\b/.test(c)) add('go')
  if (/\bcargo\b|\brustc\b|\brustup\b/.test(c)) add('rust')
  if (/\bmvn\b|\bgradlew?\b|\bjava\b|\bjavac\b/.test(c)) add('java')
  if (/\bdotnet\b|\bmsbuild\b|\bnuget\b/.test(c)) add('dotnet')
  if (/\bpsql\b|\bsqlcmd\b|\bsqlite3\b|\bmysql\b|\bpg_dump\b/.test(c)) add('sql')
  if (/\bdocker\b|\bpodman\b|\bdocker-compose\b/.test(c)) add('docker')
  if (/\bkubectl\b|\bk9s\b|\bkustomize\b|\bminikube\b|\bkind\b\s+create/.test(c)) add('k8s')
  if (/\bhelm\b/.test(c)) add('helm', 'k8s')
  if (/\bansible(-playbook|-galaxy)?\b/.test(c)) add('ansible')
  if (/(^|[\s;&|(])aws\s|\bcdk\s|\bsam\s+(build|deploy)/.test(c)) add('aws')
  if (/\bgcloud\b|\bgsutil\b|\bbq\s/.test(c)) add('gcp')
  if (/\bpwsh\b|\bpowershell\b|\b(get|set|new|remove|invoke|write|test|select)-[a-z]+/.test(c)) add('powershell')
  if (/\bbash\b|\bsh\s+-c\b|\.sh\b|\bchmod\b|\bsed\b|\bawk\b/.test(c)) add('bash')
  if (/\b(pdf|xe|lua)?latex(mk)?\b|\bbiber\b|\bbibtex\b/.test(c)) add('latex', 'docs')
  if (/\bpandoc\b/.test(c)) add('docs')
  return [...out]
}

// ---------------------------------------------------------------- usage meters

export type UsageNote = 'context' | 'five_hour' | 'seven_day' | 'compact'

const USAGE_LINES: Record<UsageNote, string[]> = {
  context: L(`
    This desk is buried in paper. /compact soon?
    Context is getting full. Papers everywhere.
    I can barely see the screen. Maybe /compact?
  `),
  five_hour: L(`
    *yawn* The hourglass is almost out of sand.
    Sand is running low. Let us pace ourselves.
    Getting drowsy. The 5-hour window is nearly used.
  `),
  seven_day: L(`
    The week calendar is almost all crossed off.
    Weekly allowance is running thin. Choose wisely.
  `),
  compact: L(`
    Filed it all away. Clean desk, clear head.
    Papers boxed up. Fresh context, fresh start.
    Tidy desk. Where were we?
  `),
}

export function usageQuip(kind: UsageNote, rng?: () => number): string {
  return pickFrom(USAGE_LINES[kind], rngOf(rng)) ?? 'Tidy desk. Where were we?'
}

export function usageQuips(kind: UsageNote): readonly string[] {
  return USAGE_LINES[kind]
}
