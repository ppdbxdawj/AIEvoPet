# Security Policy

## Supported versions

Security fixes are provided for the latest release line only until versioning policy is expanded.

## Reporting a vulnerability

Please report security vulnerabilities privately before public disclosure.

- Preferred: GitHub Security Advisory (private report)
- Fallback email: `security@aievopet.org` (replace with real inbox before release)

Please include:

- Affected version/commit
- Reproduction steps
- Impact assessment
- Suggested mitigation (optional)

We aim to acknowledge reports within 72 hours.

## Security model notes

### Local coding-event bridge

AIEvoPet currently exposes:

- `POST http://127.0.0.1:44557/coding-event`

Current assumptions:

- Bound to loopback only (`127.0.0.1`)
- Not exposed on LAN/WAN
- Local machine and user session are trusted

Current limitation:

- Bridge is **not authenticated** yet
- Any local process running under the same user can submit events

### Recommended hardening (planned)

- Add bearer token requirement for bridge requests
- Generate token at startup and store in app data dir with user-only permissions
- Reject requests without token

## User-side hardening guidance

- Avoid running on shared multi-user machines if bridge auth is disabled
- Keep OS and browser/runtime updated
- Use firewall defaults; do not expose local bridge ports externally
- Only configure trusted model endpoints and API keys
