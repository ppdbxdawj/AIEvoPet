# AIEvoPet Codex adapter

Run Codex through AIEvoPet so your pet can show when Codex starts, finishes, or needs attention.

## Install

Keep this directory inside the repo and either call the wrapper directly:

```bash
./adapters/codex/aievopet-codex --help
```

Or add an alias:

```bash
alias codex-pet="/path/to/AIPet/adapters/codex/aievopet-codex"
```

Then use it where you would normally use Codex:

```bash
codex-pet "fix the failing tests"
```

## What it emits

The wrapper delegates to `../bin/aievopet-watch` and tags events as:

- `source=codex`
- `task-start` when Codex begins
- `task-done` when Codex exits successfully
- `task-failed` when Codex exits non-zero

If AIEvoPet is not running, Codex still runs normally. The wrapper preserves Codex stdout, stderr, and exit code.

## Options

```bash
# Use a Codex binary outside PATH
AIEVOPET_CODEX_BIN=/custom/path/codex aievopet-codex "do work"

# Customize the bubble title
AIEVOPET_TITLE="Codex refactor" aievopet-codex "refactor the renderer"
```

For richer non-Codex commands, use `../bin/aievopet-watch` directly.
