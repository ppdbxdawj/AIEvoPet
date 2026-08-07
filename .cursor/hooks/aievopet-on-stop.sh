#!/bin/sh
# Cursor `stop` / `subagentStop` hook → tells AIEvoPet that an agent turn
# (or a subagent loop) just finished. Pet reacts with a celebratory bubble
# and, if Strong Reminder mode is on, teleports to the active monitor.
#
# This script is intentionally tiny — it just translates Cursor's hook
# event into a single aievopet-emit call. All actual reasoning about
# whether to "react loudly" lives in the AIEvoPet daemon.
#
# Cursor passes hook input on stdin as JSON. The stop emitter uses the
# transcript path in that JSON to name the completed task.

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
STOP_EMITTER="$PROJECT_ROOT/scripts/emit-coding-stop-event.mjs"

if [ ! -f "$STOP_EMITTER" ]; then
  # Pet integration not installed in this repo. Stay silent — never block.
  cat >/dev/null
  exit 0
fi

node "$STOP_EMITTER" --source cursor >/dev/null 2>&1 || true

exit 0
