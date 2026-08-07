# Privacy Policy (Project-level)

## Summary

AIEvoPet is designed to be local-first.

- No analytics or telemetry is sent by default.
- No account is required.
- Core pet state and interaction data stay on your machine.

## What data AIEvoPet stores locally

Depending on features you use, AIEvoPet may store:

- Pet profile and state (stage, stats, interactions)
- Reminder records
- Companion memory snapshots/preferences
- Local settings (model endpoint, UI preferences)
- Optional generated assets and logs

## Where local data is stored

Data is stored under the app data directory for your OS
(for example, macOS `~/Library/Application Support/AIEvoPet/`).

## Network behavior

By default:

- No remote analytics calls
- No hidden data upload

Optional network calls happen only when you configure or use them explicitly, e.g.:

- Ollama endpoint (usually local `127.0.0.1`)
- User-supplied cloud model APIs

## Coding-event bridge

A localhost endpoint may be opened at `127.0.0.1:44557` to receive local coding events.
It is intended for local tool integrations only.

See `SECURITY.md` for hardening notes.

## Your controls

You can:

- Delete local app data files
- Avoid configuring cloud endpoints
- Run fully local model/runtime paths

## Contact

For privacy questions, open an issue or contact maintainers at:

- `privacy@aievopet.org` (replace with real inbox before release)
