# Third-party notices

AIEvoPet bundles or depends on the following third-party software. We are
grateful to every project listed here. The full source of each dependency
is available from its upstream repository, and the canonical license text
for each is reproduced verbatim in the upstream project.

This file is a non-exhaustive summary intended for attribution purposes.
For an authoritative list of every transitive dependency, run:

```bash
# JavaScript / TypeScript
npx license-checker --production

# Rust
cargo install cargo-about --locked
cargo about generate about.hbs > THIRD_PARTY_NOTICES.cargo.html
```

Run those commands before each release and verify nothing has been added
under a license incompatible with redistribution under MIT.

---

## Runtime dependencies

| Project | License | Purpose | Upstream |
|---------|---------|---------|----------|
| Tauri 2 | Apache-2.0 / MIT | Desktop shell, multi-window, native APIs | https://github.com/tauri-apps/tauri |
| React 19 | MIT | UI framework for the renderer | https://github.com/facebook/react |
| Pixi.js 8 | MIT | WebGL/Canvas renderer for the pet sprite | https://github.com/pixijs/pixijs |
| chrono | MIT / Apache-2.0 | Time handling on the Rust side | https://github.com/chronotope/chrono |
| serde | MIT / Apache-2.0 | Serialization framework | https://github.com/serde-rs/serde |
| serde_json | MIT / Apache-2.0 | JSON support for serde | https://github.com/serde-rs/json |

## Build / development dependencies

| Project | License | Purpose | Upstream |
|---------|---------|---------|----------|
| Vite | MIT | Frontend dev server and bundler | https://github.com/vitejs/vite |
| TypeScript | Apache-2.0 | Type-checked compilation | https://github.com/microsoft/TypeScript |
| Vitest | MIT | Unit testing framework | https://github.com/vitest-dev/vitest |
| Playwright | Apache-2.0 | End-to-end testing | https://github.com/microsoft/playwright |
| selenium-webdriver | Apache-2.0 | Tauri E2E driver | https://www.selenium.dev/ |
| jsdom | MIT | DOM emulation for tests | https://github.com/jsdom/jsdom |
| @testing-library/react | MIT | Component test helpers | https://github.com/testing-library/react-testing-library |
| @vitejs/plugin-react | MIT | React fast-refresh for Vite | https://github.com/vitejs/vite-plugin-react |
| @tauri-apps/cli | Apache-2.0 / MIT | Tauri CLI | https://github.com/tauri-apps/tauri |
| @tauri-apps/api | Apache-2.0 / MIT | Tauri JS API bindings | https://github.com/tauri-apps/tauri |
| tauri-plugin-webdriver | Apache-2.0 / MIT | E2E driver bridge | https://github.com/tauri-apps/plugins-workspace |

## Optional integrations

The following projects are not bundled, but AIEvoPet talks to them when
the user opts in. Their licenses apply to their own distributions, not
to AIEvoPet itself.

| Project | License | Purpose |
|---------|---------|---------|
| Ollama | MIT | Optional local LLM runtime users may install separately |
| Qwen 2.5 family | Tongyi Qianwen License | Optional local model users may run via Ollama or similar |
| OpenAI / Anthropic / etc. cloud APIs | Vendor terms | Optional remote LLM endpoints when user provides keys |

## Inspirations

AIEvoPet draws inspiration from the spirit of these classic projects.
None of their code is included; we only acknowledge the cultural debt:

- Tamagotchi (Bandai, 1996) — pet life-cycle vocabulary
- Sony AIBO (1999) — companion-robot category
- QQ Pet (Tencent, 2005-2013) — desktop care loop and economy
- Tabikae (Travel Frog, 2018) — async, low-pressure presence
- Live2D — eye/head tracking conventions we deliberately bypass

---

If you are the author of a dependency listed here and would like the
attribution language adjusted, please open an issue.
