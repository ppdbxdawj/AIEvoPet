#!/bin/sh
# Claude Code `Stop` / `SubagentStop` hook → AIEvoPet hears that an
# agent turn (or a subagent loop) just finished. Pet reacts.
#
# Claude Code passes hook input on stdin as JSON. We forward it to the richer
# Node emitter when available so the pet can mention the actual user task.

INPUT="$(cat)"

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
STOP_EMITTER=""
if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -f "$CLAUDE_PROJECT_DIR/scripts/emit-coding-stop-event.mjs" ]; then
  STOP_EMITTER="$CLAUDE_PROJECT_DIR/scripts/emit-coding-stop-event.mjs"
elif [ -f "$SCRIPT_DIR/../../../scripts/emit-coding-stop-event.mjs" ]; then
  STOP_EMITTER="$SCRIPT_DIR/../../../scripts/emit-coding-stop-event.mjs"
elif [ -f "./scripts/emit-coding-stop-event.mjs" ]; then
  STOP_EMITTER="./scripts/emit-coding-stop-event.mjs"
fi

if [ -n "$STOP_EMITTER" ] && command -v node >/dev/null 2>&1; then
  printf '%s' "$INPUT" | node "$STOP_EMITTER" --source claude-code >/dev/null 2>&1 || true
  exit 0
fi

EMITTER=""
if command -v aievopet-emit >/dev/null 2>&1; then
  EMITTER="$(command -v aievopet-emit)"
elif [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -x "$CLAUDE_PROJECT_DIR/adapters/bin/aievopet-emit" ]; then
  EMITTER="$CLAUDE_PROJECT_DIR/adapters/bin/aievopet-emit"
elif [ -x "./adapters/bin/aievopet-emit" ]; then
  EMITTER="./adapters/bin/aievopet-emit"
fi

if [ -z "$EMITTER" ]; then
  exit 0
fi

"$EMITTER" task-done \
  --status succeeded \
  --source claude-code \
  --title "Claude Code finished a turn" \
  --summary "Agent has stopped — your input is ready." \
  >/dev/null 2>&1 || true

exit 0
