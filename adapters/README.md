# AIEvoPet adapters

Hook AIEvoPet into your real coding workflow. Each adapter is **two
shell scripts and a config snippet** — there's no SDK to install, no
daemon to keep alive beyond the pet itself, and nothing to mod.

## What's here

```
adapters/
├── bin/
│   ├── aievopet-emit         POSIX-shell + curl event emitter (the core)
│   └── aievopet-watch        Wrap any command with start / done / failed events
├── cursor/                   Cursor IDE hooks (stop, tool failure, subagent stop)
└── claude-code/              Claude Code hooks (Stop, Notification, SubagentStop)
```

## Pick the right adapter

| Your tool                       | Use this | What you'll get |
|---------------------------------|----------|------------------|
| **Cursor**                      | [`cursor/`](./cursor/README.md) | Pet reacts at end of every agent turn + on tool failures. |
| **Claude Code**                 | [`claude-code/`](./claude-code/README.md) | Same, plus Notification → strong reminder. |
| **Codex CLI**                   | [`codex/`](./codex/README.md) | Run Codex through a first-class wrapper — pet sees Codex start + finish. |
| **Aider / opencode / Gemini CLI** | [`bin/aievopet-watch`](./bin/aievopet-watch) | Wrap the agent's CLI command — pet sees start + finish. |
| **`npm test`, `cargo build`, `pytest`, `make deploy`, anything in a shell** | [`bin/aievopet-watch`](./bin/aievopet-watch) | Same — wrap the command, get start/done/failed events. |
| **Git `post-commit` / GitHub Actions / CI**  | [`bin/aievopet-emit`](./bin/aievopet-emit) directly | Single curl-equivalent call from any script. |

## The 30-second start

Symlink the emitter onto your `$PATH` once:

```bash
sudo ln -s "$(pwd)/adapters/bin/aievopet-emit" /usr/local/bin/aievopet-emit
sudo ln -s "$(pwd)/adapters/bin/aievopet-watch" /usr/local/bin/aievopet-watch
```

Then any of these now talks to your pet:

```bash
# Wrap a test run
aievopet-watch npm test

# Wrap a build, tagged as a build event for richer pet behavior
AIEVOPET_KIND_BASE=build aievopet-watch cargo build --release

# Fire a one-shot event from a git hook
aievopet-emit commit-created --status succeeded --title "Push to main" \
  --meta "branch=main"

# Or from CI on green build
aievopet-emit build-pass --status succeeded --title "CI green" \
  --source manual --meta "run=$GITHUB_RUN_NUMBER"
```

For Cursor and Claude Code, follow the per-adapter README to drop the
hooks in.

## How it stays out of your way

Every adapter is held to one rule: **never break the host workflow**.
Specifically:

- `aievopet-emit` exits 0 even when the bridge is down, malformed, or
  unreachable. The most a broken pet can do is print a one-line warning
  to stderr (and only when `AIEVOPET_DEBUG=1`).
- `aievopet-watch` always exits with the wrapped command's real exit
  code. Pet failures never mask test failures.
- Cursor / Claude Code hooks resolve the emitter best-effort. If
  `aievopet-emit` isn't on `$PATH` and isn't next to the repo, the
  hook just exits 0 — your IDE keeps working.

## Configuration knobs

| Variable | Default | Purpose |
|---|---|---|
| `AIEVOPET_BRIDGE_URL` | `http://127.0.0.1:44557/coding-event` | Override the bridge endpoint. |
| `AIEVOPET_BRIDGE_TIMEOUT` | `2` | curl timeout in seconds. |
| `AIEVOPET_DEBUG` | unset | If non-empty, prints curl errors and the JSON payload to stderr. |
| `AIEVOPET_TITLE` | `<command>` | Override the title shown in pet bubbles (watch only). |
| `AIEVOPET_SOURCE` | `manual` | Tag the source label (watch only). |
| `AIEVOPET_KIND_BASE` | `task` | `task` / `test` / `build` — picks the event-kind family (watch only). |

## Event schema (the contract)

The bridge accepts:

```json
{
  "event": {
    "id": "<stable id>",
    "kind": "task-start | task-done | task-failed | commit-created | test-pass | test-fail | build-pass | build-fail",
    "source": "claude-code | codex | cursor | vscode | skill | manual",
    "status": "running | succeeded | failed",
    "title": "<short human-readable>",
    "summary": "<optional, longer>",
    "createdAt": "<ISO 8601 UTC>",
    "metadata": { "key": "string|number|boolean" }
  }
}
```

The canonical schema reference lives in `scripts/emit-coding-event.mjs`.
If you're writing a custom adapter for a tool that doesn't have one yet,
that file plus the source of `aievopet-emit` is everything you need.

## Build your own adapter

Any tool that can run a shell command on a lifecycle event can be
wired up in three lines. The minimum useful adapter is:

```bash
on-event-of-interest() {
  aievopet-emit task-done --status succeeded --source manual --title "thing finished"
}
```

PRs adding adapters for **JetBrains IDEs**, **VS Code tasks**,
**Neovim async runs**, **GitHub Actions**, **Aider**, **opencode**, and
**Gemini CLI** are explicitly welcome — most should be 30–80 lines.

If you ship one, link it back here in your PR.
