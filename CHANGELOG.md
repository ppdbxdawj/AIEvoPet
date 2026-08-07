# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-04-28

### Added

- Initial open-source project structure for AIEvoPet
- Tauri + React desktop pet runtime
- Local model setup path via Ollama (`qwen3:4b-instruct`)
- Reminder system and companion memory baseline
- Coding-event bridge endpoint and CLI emitter script
- OSS governance files (license, security, conduct, privacy, contribution docs)

### Changed

- Project naming normalized to `AIEvoPet` (`aievopet`, `aievopet-shell`, `com.aievopet.app`)
- README refocused for open-source onboarding

### Security

- Documented localhost-only bridge assumptions and current no-auth limitation in `SECURITY.md`
