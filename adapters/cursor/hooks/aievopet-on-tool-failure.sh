#!/bin/sh
# Cursor `postToolUseFailure` hook → AIEvoPet hears "something went red".
# Triggers a strong reminder if the user has it enabled, otherwise a
# subdued worry-bubble.
#
# Cursor passes failure context on stdin. We extract the tool name with
# a lightweight grep (no jq dependency) so the summary line is informative
# without needing extra runtime deps.

INPUT="$(cat)"

# Best-effort extract of "tool_name" or "type" from the JSON. Falls back
# to "tool" if neither is present. We accept that this is fragile parsing —
# it's a friendly summary, not a security-critical field.
TOOL_NAME="$(printf '%s' "$INPUT" | sed -n 's/.*"tool_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
[ -z "$TOOL_NAME" ] && TOOL_NAME="$(printf '%s' "$INPUT" | sed -n 's/.*"type":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
[ -z "$TOOL_NAME" ] && TOOL_NAME="tool"

EMITTER=""
if command -v aievopet-emit >/dev/null 2>&1; then
  EMITTER="$(command -v aievopet-emit)"
elif [ -x "./adapters/bin/aievopet-emit" ]; then
  EMITTER="./adapters/bin/aievopet-emit"
fi

if [ -z "$EMITTER" ]; then
  exit 0
fi

"$EMITTER" task-failed \
  --status failed \
  --source cursor \
  --title "Cursor: ${TOOL_NAME} call failed" \
  --summary "A tool invocation in the agent loop returned an error." \
  --meta "tool=${TOOL_NAME}" \
  >/dev/null 2>&1 || true

exit 0
