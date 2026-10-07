# Changelog

## 1.0.0

The first public release of **Clawd Quest** (plugin `pet-mascot`, marketplace `clawd-quest`): a pixel pet for Claude
Code that lives in a side pane, reacts to everything Claude Code does and turns your coding sessions into a small game.
Needs Claude Code 2.1.288 or newer, in the terminal or the desktop Code tab.

### Clawd and the room

- **A living room.** Clawd wanders, thinks, celebrates, shakes on errors and falls asleep when you are idle. The window
  follows the real time of day, the wall clock shows the real time, and October and December bring their own decor.
- **Activity stations.** Clawd types at the PC for edits, runs commands at a terminal, reads a book from the shelf,
  scans with a magnifier for searches, watches through binoculars for web calls, pulls the Terraform crane's lever and
  casts skills from a spellbook; mini Clawds run errands for subagents and background agents.
- **Usage meters**: a paper stack for the context window, an hourglass for the 5-hour limit, a wall calendar for the week
  and an archive box for compactions, with one warning line near each limit.
- **Smooth animation.** Redraws resume animations instead of restarting them, Clawd walks from where he stands, and
  reduced motion stops the looping animations.
- **919 quips** that react to the project, time of day, long turns, error streaks, combos, levels, seasons, usage limits,
  your hat and your prompts, and a tiny Clawd with its own verbs in the "Working..." spinner.

### Progression

- **Progress is per project.** Every project folder keeps its own XP, level, streak, combo record, daily quests,
  trophies, hats, decor and `/quests` board, shared by every session in that folder (sessions save with
  read-modify-write, so parallel chats never overwrite each other). Desktop scratch chats share one save.
- **Levels go to 100**, on the curve `40 × (L − 1)^1.6` (level 10 at 1,345 xp, level 100 at 62,384), with titles from
  Hatchling to Legend. Past level 100, every 1,000 xp earns an **Encore star**; 10 stars earn the Encore trophy.
- **Milestone celebrations.** Levels 10, 25, 50, 75 and 100 and every Encore star celebrate in the room, and milestones
  upgrade the room for good (a level badge that turns bronze, silver, gold and platinum, gold shelf trim, wainscoting,
  shooting stars, a gold window frame).
- **Fair rules.** Streaks are weekend-safe (Friday to Monday keeps them) and only count days with a prompt or a tool
  call; a refused permission prompt is neutral; subagent tool calls do not count; daily quests fit any project;
  finishing all 3 makes the **Daily Sweep** claimable (+15 xp until midnight).

### Content

- **44 hats**, unlocked with levels, trophies and seasons.
- **98 unlockable decor pieces in 12 slots**: drink, plant, poster, rug, shelf, roommate, bed, lamp, clock, ceiling, wall
  hanging and window view.
- **80 trophies**, 12 of them hidden.

### Project quests

- **`/quests`** reads the current project (file names, README, stack, your recent prompts) and asks a model for a
  campaign of project-specific quests, long-term milestones that become project trophies, and pixel-art project hats.
- Clawd checks every proposal, measures progress itself and prices each quest from its check, goal and role; the model
  never sets the XP. Each campaign has one **Swap**, and a new campaign asks before it replaces open quests with
  progress.
- `/quests help`, `/quests clear`, `/quests reset` (asks first, then `/quests reset confirm`) and
  `/quests allow <script>`.

### Interface

- The pane has tabs: **Room**, **Quests**, **Trophies**, **Wardrobe** and **Decor**. New hats and decor wear a star (and
  the tab a dot) until you have seen them. Decor shows a preview of every piece.
- The header names the project and shows the level, xp, streak and the next unlock.
- Trophies: newest first, the next three up with their progress, and project trophies from `/quests`.
- The terminal draws Clawd in block characters with a compact stats view. `/pet` opens or closes the pane.

### Saves

- **Saves are version 2.** A build never overwrites a save written by a newer version: it leaves it alone (read-only),
  with a banner in the pane.
- **A `--plugin-dir` install and a marketplace install keep separate saves.** The plugin's store file name includes where
  it was installed from: `~/.claude/plugins/store/pet-mascot_inline-<id>.json` for `--plugin-dir`, another
  `pet-mascot_…json` for the marketplace install. To keep your progress when you switch to the marketplace install,
  start the new install once (so its file exists), quit Claude Code, then copy the old file over the new one.
