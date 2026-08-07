# Cursor adapter for AIEvoPet

Plug Cursor's agent lifecycle into AIEvoPet's coding-event bridge so the
pet reacts to your turns and tool failures in real time. **No npm
package, no daemon, no mod**: it's just two shell hooks Cursor invokes
natively.

## What gets emitted

| Cursor event           | AIEvoPet event   | When the pet reacts                      |
|------------------------|------------------|------------------------------------------|
| `stop`                 | `task-done`      | Every time the agent finishes a turn.    |
| `subagentStop`         | `task-done`      | When a Task / subagent loop completes.   |
| `postToolUseFailure`   | `task-failed`    | When any tool call (Shell, Read, MCP…) returns an error. |

If Strong Reminder mode is on in the pet panel, `task-done` and
`task-failed` will teleport the pet to your active monitor and fire a
silent OS notification.

## Install (project-scoped — recommended)

From the directory you want the hooks to apply in:

```bash
mkdir -p .cursor/hooks
cp /path/to/aievopet/adapters/cursor/hooks.json .cursor/hooks.json
cp /path/to/aievopet/adapters/cursor/hooks/*.sh .cursor/hooks/
chmod +x .cursor/hooks/*.sh
```

Cursor watches `.cursor/hooks.json` and reloads on save — no restart
needed. Open **Settings → Hooks** to confirm the three entries appear.

## Install (user-scoped — applies to every project)

```bash
mkdir -p ~/.cursor/hooks
cp /path/to/aievopet/adapters/cursor/hooks.json ~/.cursor/hooks.json
cp /path/to/aievopet/adapters/cursor/hooks/*.sh ~/.cursor/hooks/
chmod +x ~/.cursor/hooks/*.sh
```

> **Note**: user hooks resolve paths relative to `~/.cursor/`, so
> `command: ".cursor/hooks/..."` in `hooks.json` will look in
> `~/.cursor/.cursor/hooks/`. If you go user-scoped, change the
> `command` paths in `hooks.json` to `hooks/aievopet-on-stop.sh` and
> `hooks/aievopet-on-tool-failure.sh` (no `.cursor/` prefix).

## How the hook finds `aievopet-emit`

The hook scripts try, in order:

1. `aievopet-emit` on `$PATH` (if you've symlinked it globally).
2. `./adapters/bin/aievopet-emit` (works when the hook ships with the
   AIEvoPet repo itself).

If neither resolves, the hook silently exits 0 — your Cursor session is
never disrupted by an absent pet.

To install the emitter globally (recommended for cross-repo use):

```bash
sudo ln -s /path/to/aievopet/adapters/bin/aievopet-emit /usr/local/bin/aievopet-emit
```

## Disable temporarily

Either remove the entries from `.cursor/hooks.json` or rename the script
files. The existing audit trail in the pet panel is preserved.

## Troubleshooting

```bash
# 1. Confirm the bridge is alive
curl -i http://127.0.0.1:44557/coding-event \
  -H 'content-type: application/json' \
  -d '{"event":{"id":"t","kind":"task-done","source":"manual","status":"succeeded","title":"manual","createdAt":"2026-01-01T00:00:00Z"}}'

# 2. Run the hook by hand to check stdin handling
echo '{}' | ./.cursor/hooks/aievopet-on-stop.sh

# 3. Tail Cursor's hook log
#    macOS: View → Output → "Hooks" channel
```

For deeper bridge schema details, see `scripts/emit-coding-event.mjs` in
the AIEvoPet repo.
