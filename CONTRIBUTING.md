# Contributing to Clawd Quest

Thanks for wanting to help Clawd! Bug reports, ideas and pull requests are welcome at [github.com/ImTBY/clawd-quest](https://github.com/ImTBY/clawd-quest). For a bug, an [issue](https://github.com/ImTBY/clawd-quest/issues) with what Clawd did and what you expected is the best start.

## Run from a clone

```bash
git clone https://github.com/ImTBY/clawd-quest
```

```bash
claude --plugin-dir ./clawd-quest
```

The plugin loads for that launch only, so pass `--plugin-dir` each time. A `--plugin-dir` install keeps its own save, separate from the marketplace install (see [Saves](README.md#saves)).

## Test, validate and typecheck

Please run the tests and the typecheck before opening a pull request.

```bash
# Validate the marketplace manifest
claude plugin validate --strict .

# Validate the plugin manifest and hooks
claude plugin validate --strict .claude-plugin/plugin.json

# Run the test suite
claude plugin test .

# Typecheck
npx -p typescript tsc -p . --noEmit
```

Claude Code writes the plugin API's types to `.claude-plugin/types/` (git-ignored) each time it loads the plugin from a folder you own; `tsconfig.json` extends them, so load the plugin once (`claude --plugin-dir .`) before the first typecheck.

## Previews and README art

```bash
# Write preview pages to preview/ (git-ignored; needs Node 23.6+)
node scripts/preview.mjs

# Regenerate the README art in docs/assets/
node scripts/readme-assets.mjs
```

The preview pages show every activity's station, every decor piece, hat and room upgrade.

## Repository layout

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

## License

Contributions are accepted under the project's [MIT License](LICENSE).
