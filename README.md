<a id="top"></a>

<p align="center">
  <img src="docs/assets/banner.svg" alt="Clawd Quest: pixel-art title banner with Clawd, the orange pixel crab" width="100%">
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-1.0.0-D97757" alt="Version 1.0.0"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue" alt="License: PolyForm Noncommercial 1.0.0"></a>
  <img src="https://img.shields.io/badge/Claude%20Code-2.1.288%2B-D97757" alt="Requires Claude Code 2.1.288 or newer">
  <img src="https://img.shields.io/badge/tests-442%20passing-brightgreen" alt="442 tests passing">
  <img src="https://img.shields.io/badge/made%20with-pixels-orange" alt="Made with pixels">
</p>

<p align="center">
  <strong>A pixel pet for Claude Code that turns your coding sessions into a small game.</strong>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#how-progress-works">Progress</a> ·
  <a href="#privacy-and-data">Privacy</a> ·
  <a href="#faq">FAQ</a>
</p>

> [!NOTE]
> Clawd Quest is an unofficial fan project. It is not affiliated with, endorsed by or sponsored by Anthropic. See the [Disclaimer](#disclaimer).

## What is this?

Clawd Quest gives you **Clawd**, an animated pixel pet who lives in a side pane next to your Claude Code session. He reacts to everything Claude Code does: he types at the desk while files are edited, runs to the terminal for shell commands, reads at the bookshelf and celebrates when tests pass.

Your work earns XP. Every project folder has its own level (up to 100), daily streak, daily and project quests, trophies, hats and room decor.

<p align="center">
  <img src="docs/assets/hero.svg" alt="Clawd typing at his desk in a fully decorated high-level room, with trophies, plants, a roommate and a night window" width="720">
</p>

## Features

- **A living room.** Clawd wanders, thinks in a thought bubble, celebrates with confetti, shakes on errors and falls asleep after a few idle minutes.
- **Activity stations.** Clawd goes where the work is, with a station for every kind of tool call.
- **Usage meters in the room.** Context, rate limits and compactions show up as objects you can glance at.
- **919 quips** that react to the project, time of day, long turns, error streaks, combos, levels, seasons, usage limits, your hat and your prompts.
- **A themed spinner.** The "Working..." row gets a tiny Clawd and its own verbs (Scuttling, Clawding, Terraforming...).
- **Progression per project:** levels to **100**, Encore stars beyond, streaks, combos, 3 daily quests, **80 trophies** (12 hidden), **44 hats** and **98 unlockable decor pieces in 12 slots**.
- **Project quests (`/quests`).** Clawd reads your project and asks a model for a campaign of project-specific quests, milestones and pixel-art hats.
- **Works everywhere Claude Code does:** the desktop Code tab, and the terminal, where Clawd is drawn in block characters with a compact stats view.

### Activity stations

| Activity | What Clawd does |
|---|---|
| Edit / Write | Types code at the PC; a new file types in line by line |
| Shell | Runs commands at a green terminal |
| Tests | Pumps a fist at a column of checkmarks |
| Git | Throws a paper plane out of the window |
| Read | Pulls the gold book off the shelf |
| Grep / Glob | Scans the spines with a magnifier |
| Web | Watches through binoculars under the window, radio on the sill |
| Terraform | Pulls the crane's lever |
| Subagents | Ticks off a clipboard while mini Clawds run errands |
| Skills | Casts from a floating spellbook |

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/assets/stations/coding.svg" alt="Clawd typing code at the PC" width="100%"><br><sub><b>Coding</b></sub></td>
    <td align="center" width="25%"><img src="docs/assets/stations/terminal.svg" alt="Clawd running a command at the green terminal" width="100%"><br><sub><b>Terminal</b></sub></td>
    <td align="center" width="25%"><img src="docs/assets/stations/tests.svg" alt="Clawd cheering at passing test checkmarks" width="100%"><br><sub><b>Tests</b></sub></td>
    <td align="center" width="25%"><img src="docs/assets/stations/git.svg" alt="Clawd throwing a paper plane out of the window for git" width="100%"><br><sub><b>Git</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/stations/reading.svg" alt="Clawd reading the gold book from the shelf" width="100%"><br><sub><b>Reading</b></sub></td>
    <td align="center"><img src="docs/assets/stations/search.svg" alt="Clawd scanning book spines with a magnifier" width="100%"><br><sub><b>Search</b></sub></td>
    <td align="center"><img src="docs/assets/stations/web.svg" alt="Clawd watching through binoculars under the window" width="100%"><br><sub><b>Web</b></sub></td>
    <td align="center"><img src="docs/assets/stations/terraform.svg" alt="Clawd pulling the lever of the Terraform crane" width="100%"><br><sub><b>Terraform</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/stations/subagents.svg" alt="Clawd with a clipboard while mini Clawds run errands" width="100%"><br><sub><b>Subagents</b></sub></td>
    <td align="center"><img src="docs/assets/stations/skills.svg" alt="Clawd casting from a floating spellbook" width="100%"><br><sub><b>Skills</b></sub></td>
    <td align="center"><img src="docs/assets/stations/thinking.svg" alt="Clawd thinking with a thought bubble" width="100%"><br><sub><b>Thinking</b></sub></td>
    <td align="center"><img src="docs/assets/stations/sleeping.svg" alt="Clawd asleep in his bed after idle minutes" width="100%"><br><sub><b>Sleeping</b></sub></td>
  </tr>
  <tr>
    <td align="center" colspan="4"><img src="docs/assets/stations/error.svg" alt="Clawd shaking in front of a red error screen" width="25%"><br><sub><b>Error</b></sub></td>
  </tr>
</table>

### Usage meters

- A **paper stack** on the desk grows with the context window.
- An **hourglass** on the window sill runs down with the 5-hour limit.
- A **wall calendar** crosses off the weekly limit.
- An **archive box** under the desk collects each `/compact`.

Clawd says one line when the 5-hour or weekly limit passes 80% or the context passes 85%. Without rate limits (an API key), the hourglass and calendar stay away.

### Time of day and seasons

The window follows your real time of day, and the wall clock shows the real time. October brings a pumpkin and bats, December a tree, winter snow on the sill, and spring butterflies.

<p align="center">
  <img src="docs/assets/day-night.svg" alt="The same room at morning, day, evening and night" width="820">
</p>

## Install

Requires **Claude Code 2.1.288 or newer**, in the terminal or the desktop Code tab.

### Quick start

**1. Add the marketplace**

```bash
claude plugin marketplace add ImTBY/clawd-quest
```

**2. Install the plugin**

```bash
claude plugin install clawd-quest@clawd-quest
```

**3. Restart Claude Code.**

### First run

After the restart, every new session opens the Clawd pane automatically, in the terminal or the desktop Code tab.

- `/clawd` hides or shows the pane. A closed pane stays closed across sessions until you run `/clawd` again.
- In a terminal narrower than 144 columns, an automatically opened pane waits until the window is wider. `/clawd` opens it at any width.

> [!TIP]
> Want a game plan for your project right away? Run `/quests` and watch the Quests tab.

### Update and uninstall

| To | Run |
|---|---|
| Update | `claude plugin marketplace update clawd-quest`, then `claude plugin update clawd-quest@clawd-quest`, then restart Claude Code |
| Uninstall | `claude plugin uninstall clawd-quest@clawd-quest` (your saves stay, see [Saves](#saves)) |

### From a clone (contributors)

```bash
git clone https://github.com/ImTBY/clawd-quest
```

```bash
claude --plugin-dir ./clawd-quest
```

The plugin loads for that launch only, so pass `--plugin-dir` each time. A `--plugin-dir` install keeps its own save, separate from the marketplace install (see [Saves](#saves)).

<p align="right"><a href="#top">Back to top</a></p>

## Commands

| Command | What it does |
|---|---|
| `/clawd` | Open or close the Clawd pane |
| `/quests` | Generate project quests, milestones and project hats |
| `/quests <focus>` | The same, with a focus, e.g. `/quests tests` |
| `/quests clear` | Drop this project's open quests; its trophies and hats stay |
| `/quests reset` | Asks first. `/quests reset confirm` then removes this project's quests, milestones, project trophies and project hats. Your level, daily quests and catalog hats stay |
| `/quests allow <script>` | Let a repo script count as a check, e.g. `/quests allow npm test` |
| `/quests help` | List the `/quests` commands |

The pane has five tabs: **Room**, **Quests**, **Trophies**, **Wardrobe** and **Decor**. New hats and decor wear a star (and their tab a dot) until you have seen them. The header names the project and shows your level, XP, streak and next unlock.

### How `/quests` works

1. **Clawd scouts the project:** file names, README, detected stack and your recent prompts (exactly what is sent is listed under [Privacy and data](#privacy-and-data)).
2. **A model proposes a campaign:** a warm-up, up to three regular quests and a boss, plus long-term milestones that become project trophies and pixel-art hats designed for this project.
3. **Clawd checks every proposal** against the [quest rules](docs/QUEST_RULES.md). Bad quests are dropped and replaced, never the whole campaign.
4. **Clawd measures progress itself:** a known check you run (like `pytest` or `terraform validate`) passing after an edit, or a measured change in the files. He prices each quest from its check, goal and role; **the model never sets the XP**.
5. **One Swap per campaign** replaces a quest you would rather not do (its progress is lost).

A new campaign needs the current one finished, or a new day. It replaces the open quests of the current campaign (finished ones stay in the history), so the Quests tab asks twice when an open quest has progress. Once all project milestones are done, the next campaign adds a new tier.

> [!NOTE]
> Clawd never runs quest checks. They count only when you (or Claude, under your usual permissions) run them anyway.

<p align="right"><a href="#top">Back to top</a></p>

## How progress works

**Progress is per project.** XP, level, streak, best combo, daily quests, trophies, hats, the hat Clawd wears, the room decor and the `/quests` board belong to one project folder. Every session in that folder shares one save; a different folder starts at level 1. Desktop scratch chats (dated `scratch-YYYY-MM-DD-…` folders) all share one save, and each keeps its own `/quests` board.

<details>
<summary><b>Earning XP</b></summary>

| Source | XP |
|---|---|
| An edit, write, test or Terraform tool call that succeeds | 1 |
| Other tool calls (read, search, web, shell, git, skill) | 1 on every second call |
| Delegating to a subagent | 2 |
| A failing tool call (you learn from mistakes) | 1 on every third error |
| Combo bonus, on every 10th call of a combo | combo / 10, at most 3 |
| A finished turn | 2, plus 1 when it used tools without an error |
| The first prompt or tool call of the day | 10, plus 2 per streak day beyond the first (at most 30) |
| A daily quest | about 10 to 25 |
| Daily Sweep (all 3 daily quests, claimed the same day) | 15 |
| A trophy | 5, 20 or 50 by difficulty; 15 for a hidden one |
| A project quest | Priced by Clawd from its check, goal and role, never by the model |
| A finished `/quests` campaign | 40 bonus, for at most two campaigns a day |

</details>

<details>
<summary><b>Levels and titles</b></summary>

Reaching level `L` takes `40 × (L − 1)^1.6` XP in total, rounded. The first levels come within a day; at a regular pace (2 to 4 hours a day, 5 days a week) level 10 takes about a week and level 100 about a year.

| Level | 2 | 5 | 10 | 25 | 50 | 75 | 100 |
|---|---|---|---|---|---|---|---|
| Total XP | 40 | 368 | 1,345 | 6,462 | 20,248 | 39,159 | 62,384 |

| Levels | 1-4 | 5-9 | 10-24 | 25-39 | 40-49 | 50-74 | 75-99 | 100 |
|---|---|---|---|---|---|---|---|---|
| Title | Hatchling | Apprentice | Journeyman | Expert | Veteran | Master | Grandmaster | Legend |

</details>

### Milestones and Encore stars

Levels **10, 25, 50, 75 and 100** are milestones. Each opens a bundle of hats and decor, celebrates in the room and upgrades the room for good: a level badge under the trophy shelf that turns bronze, silver, gold and platinum, gold trim on the shelves, wainscoting, shooting stars in the night window and a gold window frame.

The level stops at 100, but XP keeps counting: every **1,000 XP** past level 100 earns an **Encore star** (`Lv 100 ★3`). Every star gets a small celebration and every fifth a big one; 10 stars earn the **Encore** trophy.

<p align="center">
  <img src="docs/assets/progression.svg" alt="The room at level 1, level 25 and level 100, side by side, growing from bare to fully upgraded" width="820">
</p>

<p align="center">
  <img src="docs/assets/celebration.svg" alt="Clawd celebrating a milestone level-up with confetti" width="560">
</p>

### Streaks, combos and daily quests

- **Streaks** count days with a prompt or a tool call in that project (just opening a session does not count). Weekends are safe: Friday to Monday keeps the streak going.
- **Combos** grow with tool calls in a row and reset after an error or 2 minutes idle. A permission prompt you deny is neutral and does not break the combo.
- **Subagent tool calls** do not count toward XP, combos or quests; delegating to a subagent does.
- **Daily quests** fit any project: turns, prompts, edits, reads, clean or quick turns and combos (never tests, git or code searches). Finish all 3 in a day for a **Daily Sweep**: a *Claim +15 xp* button shows on the Quests and Room tabs until midnight.

### Trophies, hats and decor

- **80 trophies**, 12 of them hidden. The Trophies tab shows the newest first and the next three up with their progress, plus project trophies from `/quests`. *Explorer*, for example, is earned by working in the same project on 5 different days.
- **44 hats**, unlocked with levels, trophies and seasons, plus pixel-art project hats from `/quests`.

<p align="center">
  <img src="docs/assets/hats.svg" alt="Grid of all of Clawd's pixel-art hats" width="760">
</p>

- **98 unlockable decor pieces in 12 slots:** drink, plant, poster, rug, shelf, roommate, bed, lamp, clock, ceiling, wall hanging and window view. An energy drink arrives at level 5, a cat roommate at level 10, and much more along the way. The Decor tab previews every piece.

<p align="center">
  <img src="docs/assets/decor.svg" alt="Showcase grid of unlockable room decor pieces" width="760">
</p>

<p align="right"><a href="#top">Back to top</a></p>

## Privacy and data

- **Everything but `/quests` stays on your machine.** Clawd watches Claude Code's hook events (tool calls, prompts, turns, usage) in the running session and keeps its game state in the local plugin store. It sends nothing anywhere and spends no tokens.
- **`/quests` asks a model, on your account.** Generating a campaign makes **1 model call, or 2** when Clawd asks the model to repair a reply it rejected. It tries `sonnet`, then `haiku`, then your session's model (a model that does not answer is skipped, which can add a call). It counts toward your usage like any other request.
- **Exactly what `/quests` sends:**
  - the project folder's name;
  - the detected stack (like `terraform, python`);
  - up to 400 file and folder names, at most three levels deep (secret files, binary documents, dependency and build folders, lockfiles and generated files are left out);
  - the first 1,500 characters of the README;
  - your last 6 prompts in this session, up to 200 characters each (slash commands are not kept);
  - the last 5 tool actions (like `edit main.tf`);
  - the focus you typed after `/quests`.

  No other file contents are sent. The model is told to treat all of it as data, never as instructions.
- **Measured quests read files locally.** To track a quest, Clawd reads the files it measures (never secret or binary files, never a file over 256 KB). That never leaves your machine.
- **Secrets are off-limits.** Clawd never opens `.env` files, keys and certificates (`.pem`, `.key`, `.pfx`, `.p12`, `id_*`), `.ssh/` and `.aws/` folders, `kubeconfig`, `.npmrc`, `.pypirc`, `.netrc`, `.git-credentials`, Docker configs, `credentials*.json`, `service-account*.json`, `secrets.*`, `*.tfvars` or `*.tfstate`. Their names are left out of what `/quests` sends, too, and quests that touch secrets, keys or production are refused.
- **No environment variables.** Claude Code runs the plugin in a sandbox without Node or process access, so Clawd cannot read your environment variables or anything outside what Claude Code hands it.
- **Clawd never runs commands.** No command, script or tool is ever run by Clawd, and nothing in a model reply can make it run one. It reads only the project's file names, the README and the files a quest measures, and writes only to its own plugin store.

### Saves

Progress is stored locally in Claude Code's plugin store, `~/.claude/plugins/store/`, in one JSON file for the plugin; inside it, every project folder has its own save. Sessions save with read-modify-write, so parallel chats never overwrite each other.

The file name depends on where the plugin was installed from: `clawd-quest_inline-<id>.json` for a `--plugin-dir` install, another `clawd-quest_…json` for the marketplace install. Uninstalling leaves the file in place.

<p align="right"><a href="#top">Back to top</a></p>

## FAQ

<details>
<summary><b>Why does a different project start at level 1?</b></summary>

Progress is per project on purpose: each folder has its own level, streak, trophies, hats and decor. Every chat in the same folder shares one save.

</details>

<details>
<summary><b>I switched from <code>--plugin-dir</code> to the marketplace install and my level is gone.</b></summary>

It is not gone: saves are kept per install source (see [Saves](#saves)). To carry your progress over, start the new install once (so its file exists), quit Claude Code, then copy the old file over the new one.

</details>

<details>
<summary><b>How do I start over?</b></summary>

With Claude Code closed, delete the store file to start every project from scratch. To clear only one project's quests, project trophies and project hats, use `/quests reset`.

</details>

<details>
<summary><b>An older build says my save is newer.</b></summary>

A build never overwrites a save written by a newer version: it leaves it alone (read-only) and shows a banner. Update the plugin to keep playing that save.

</details>

<details>
<summary><b>Does Clawd run commands?</b></summary>

No. Quest checks such as `pytest` or `terraform validate` count only when you (or Claude, under your usual permissions) run them anyway; Clawd only watches the result. `/quests allow <script>` lets a repo script you already run count as a check; it does not run it.

</details>

<details>
<summary><b>How do I hide the pane?</b></summary>

Run `/clawd`, or close the pane. It stays closed across sessions until you run `/clawd` again.

</details>

<details>
<summary><b>The pane did not open in my terminal.</b></summary>

An automatically opened pane waits until the terminal is at least 144 columns wide. Widen the window, or run `/clawd` to open it at any width.

</details>

<details>
<summary><b>Does it work with an API key instead of a subscription?</b></summary>

Yes. Without rate limits the hourglass and calendar meters stay away; everything else works. `/quests` model calls are billed like any other request.

</details>

<details>
<summary><b>Does it respect reduced motion?</b></summary>

Yes. With the system's reduced-motion setting on, the room's looping animations stop or slow down.

</details>

<p align="right"><a href="#top">Back to top</a></p>

## Development

```bash
claude plugin validate --strict .                            # the marketplace manifest
claude plugin validate --strict .claude-plugin/plugin.json   # the plugin manifest and hooks
claude plugin test .                                         # run the test suite
npx -p typescript tsc -p . --noEmit                          # typecheck
```

Claude Code writes the plugin API's types to `.claude-plugin/types/` (git-ignored) each time it loads the plugin from a folder you own; `tsconfig.json` extends them, so load the plugin once (`claude --plugin-dir .`) before the first typecheck.

**Previews.** `node scripts/preview.mjs` (Node 23.6+) writes preview pages to `preview/` (git-ignored): every activity's station, every decor piece, hat and room upgrade. `node scripts/readme-assets.mjs` regenerates the README art in `docs/assets/`.

<details>
<summary><b>Repository layout</b></summary>

| Path | Purpose |
|---|---|
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | Plugin and marketplace manifests |
| `hooks/hooks.json` | Points Claude Code at the hooks module |
| `hooks/register.tsx` | Hooks: events, pane, spinner, commands, persistence |
| `hooks/scene.ts` | The room as one animated SVG (CSS only, transparent) |
| `hooks/roomArt.ts` | Art for the pet bed, desk lamp, wall clock and ceiling slots |
| `hooks/hatArt.ts` | Pixel art for every catalog hat |
| `hooks/decorArt.ts`, `hooks/decor.ts` | Decor art and its unlock catalog |
| `hooks/usage.ts`, `hooks/meterArt.ts` | Usage meters (context, rate limits, compactions) and their art |
| `hooks/game.ts` | XP, levels, Encore stars, streaks, daily quests, trophies, hats |
| `hooks/quips.ts` | The one-liners and spinner verbs |
| `hooks/projectQuests.ts`, `hooks/customHat.ts` | `/quests`: prompt, parsing, progress, project hats |
| `hooks/*.test.ts`, `hooks/fakeFs.ts` | Tests and a test helper |
| `types/index.d.ts` | Shared types and the plugin state contract |
| `scripts/preview.mjs` | Preview pages for stations, decor, hats and room upgrades |
| `scripts/readme-assets.mjs` | Generates the README art |
| `docs/QUEST_RULES.md` | What `/quests` may create and how Clawd checks it |
| `docs/assets/` | README banner and illustrations |

</details>

### Contributing

Issues and pull requests are welcome at [github.com/ImTBY/clawd-quest](https://github.com/ImTBY/clawd-quest). Please run the tests and the typecheck before opening a PR. Contributions are accepted under the project's noncommercial [license](#license).

## Disclaimer

Clawd Quest is an unofficial fan project by ImTBY. It is not affiliated with, endorsed by, sponsored by or supported by Anthropic, PBC. "Claude", "Claude Code" and "Anthropic" are trademarks of Anthropic, PBC; they are used here only to say what this plugin works with, and no endorsement is implied. Clawd is a fan-made character. The software is provided as is, without warranty; see the license.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Copyright (c) 2026 ImTBY.

You may use, modify and share Clawd Quest for free for any noncommercial purpose: personal use, hobby projects, study, research, and use by charities, schools and public institutions. Selling it or using it commercially needs the author's permission.

<p align="right"><a href="#top">Back to top</a></p>
