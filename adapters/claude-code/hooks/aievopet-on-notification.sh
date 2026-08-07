#!/bin/sh
# Claude Code `Notification` hook → fires on permission requests, errors,
# and other surface notifications. We forward this as a soft signal to
# AIEvoPet. The pet decides (server-side) whether to bubble it up loudly.
#
# Notification payload includes the reason and sometimes tool details. Forward
# it to the richer Node emitter when available so the pet explains what to do.

INPUT="$(cat)"

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ATTENTION_EMITTER=""
if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -f "$CLAUDE_PROJECT_DIR/scripts/emit-claude-attention-event.mjs" ]; then
  ATTENTION_EMITTER="$CLAUDE_PROJECT_DIR/scripts/emit-claude-attention-event.mjs"
elif [ -f "$SCRIPT_DIR/../../../scripts/emit-claude-attention-event.mjs" ]; then
  ATTENTION_EMITTER="$SCRIPT_DIR/../../../scripts/emit-claude-attention-event.mjs"
elif [ -f "./scripts/emit-claude-attention-event.mjs" ]; then
  ATTENTION_EMITTER="./scripts/emit-claude-attention-event.mjs"
fi

if [ -n "$ATTENTION_EMITTER" ] && command -v node >/dev/null 2>&1; then
  printf '%s' "$INPUT" | node "$ATTENTION_EMITTER" >/dev/null 2>&1 || true
  exit 0
fi

MESSAGE="$(printf '%s' "$INPUT" | sed -n 's/.*"message":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
[ -z "$MESSAGE" ] && MESSAGE="Claude Code needs your attention"

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

# We map Notification → task-failed because AIEvoPet's strong-reminder
# logic specifically responds to non-running events. If you'd rather have
# notifications stay quiet, change the kind below to `task-done`.
"$EMITTER" task-failed \
  --status failed \
  --source claude-code \
  --title "Claude Code: $MESSAGE" \
  --summary "Notification raised by the Claude Code agent." \
  >/dev/null 2>&1 || true

exit 0
