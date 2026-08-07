#!/bin/sh
# Cursor `stop` / `subagentStop` hook → tells AIEvoPet that an agent turn
# (or a subagent loop) just finished. Pet reacts with a celebratory bubble
# and, if Strong Reminder mode is on, teleports to the active monitor.
#
# This script is intentionally tiny — it just translates Cursor's hook
# event into a single aievopet-emit call. All actual reasoning about
# whether to "react loudly" lives in the AIEvoPet daemon.
#
# Cursor passes hook input on stdin as JSON. We don't need to inspect it
# for this hook — every `stop` is a "task done" event from the user's
# perspective. We do drain stdin so Cursor doesn't see a SIGPIPE.

# Drain stdin (avoid broken-pipe complaints in Cursor's hook log).
cat >/dev/null

# Resolve the emitter. We look in two places:
#   1. PATH (if the user installed aievopet-emit globally)
#   2. The default AIEvoPet repo location next to .cursor/
#      (works when this hook ships *inside* the AIEvoPet repo)
EMITTER=""
if command -v aievopet-emit >/dev/null 2>&1; then
  EMITTER="$(command -v aievopet-emit)"
elif [ -x "./adapters/bin/aievopet-emit" ]; then
  EMITTER="./adapters/bin/aievopet-emit"
fi

if [ -z "$EMITTER" ]; then
  # Pet integration not installed in this repo. Stay silent — never block.
  exit 0
fi

"$EMITTER" task-done \
  --status succeeded \
  --source cursor \
  --title "Cursor finished a turn" \
  --summary "Agent has stopped responding — your input is ready." \
  >/dev/null 2>&1 || true

exit 0
