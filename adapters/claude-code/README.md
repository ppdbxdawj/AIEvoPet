# Claude Code adapter for AIEvoPet

Plug Claude Code's lifecycle events into AIEvoPet's coding-event bridge
so the pet reacts when an agent turn ends, when a subagent finishes its
loop, or when Claude Code raises a notification.

## What gets emitted

| Claude Code event | AIEvoPet event   | When the pet reacts |
|-------------------|------------------|---------------------|
| `Stop`            | `task-done`      | Every time the agent finishes responding to you. |
| `SubagentStop`    | `task-done`      | When a Task / subagent loop completes. |
| `Notification`    | `task-failed`    | When Claude Code surfaces a permission prompt or an error. |

If Strong Reminder mode is on in the pet panel, `task-done` and
`task-failed` will teleport the pet to your active monitor and fire a
silent OS notification.

## Install (project-scoped — recommended)

```bash
mkdir -p .claude/hooks
cp /path/to/aievopet/adapters/claude-code/hooks/*.sh .claude/hooks/
chmod +x .claude/hooks/*.sh
```

Then merge the `hooks` block from
`/path/to/aievopet/adapters/claude-code/settings.json` into your
project's `.claude/settings.json`. If the file doesn't exist yet:

```bash
cp /path/to/aievopet/adapters/claude-code/settings.json .claude/settings.json
# remove the "_comment" key after copying
```

If it already exists, merge by hand or with `jq`:

```bash
jq -s '.[0] * .[1]' .claude/settings.json /path/to/aievopet/adapters/claude-code/settings.json \
  > .claude/settings.json.new && mv .claude/settings.json.new .claude/settings.json
```

Restart Claude Code or run `/hooks` inside it to see the new hook
registrations.

## Install (user-scoped — applies to every project)

Same as above but inside `~/.claude/` instead of project-local
`.claude/`. Note that user-scoped hooks run with `$CLAUDE_PROJECT_DIR`
set to the current project, so the hook scripts still need to live
at `~/.claude/hooks/` — adjust the `command` paths in `settings.json`
accordingly.

## How the hook finds `aievopet-emit`

The hook scripts try, in order:

1. `aievopet-emit` on `$PATH` (if you've symlinked it globally).
2. `$CLAUDE_PROJECT_DIR/adapters/bin/aievopet-emit` (works when this
   adapter ships *inside* the AIEvoPet repo).
3. `./adapters/bin/aievopet-emit` (relative fallback).

If none resolve, the hook silently exits 0 — your Claude Code session is
never disrupted by an absent pet.

To install the emitter globally (recommended for cross-repo use):

```bash
sudo ln -s /path/to/aievopet/adapters/bin/aievopet-emit /usr/local/bin/aievopet-emit
```

## Tuning

If `Notification` events feel too loud (Claude Code emits one for every
permission prompt), open `aievopet-on-notification.sh` and change
`task-failed` → `task-done`. That demotes them to a soft bubble instead
of a strong-reminder candidate.

## Disable temporarily

Remove the `hooks` block from `.claude/settings.json` and restart
Claude Code, or rename the script files. The existing audit trail in
the pet panel is preserved.

## Troubleshooting

```bash
# 1. Confirm the bridge is alive
curl -i http://127.0.0.1:44557/coding-event \
  -H 'content-type: application/json' \
  -d '{"event":{"id":"t","kind":"task-done","source":"manual","status":"succeeded","title":"manual","createdAt":"2026-01-01T00:00:00Z"}}'

# 2. Run the hook by hand
echo '{}' | ./.claude/hooks/aievopet-on-stop.sh

# 3. Inside Claude Code, type `/hooks` to list registered hooks.
```

For deeper bridge schema details, see `scripts/emit-coding-event.mjs` in
the AIEvoPet repo.
