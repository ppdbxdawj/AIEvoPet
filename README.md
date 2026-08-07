<div align="center">

<img src="src-tauri/icons/128x128.png" width="96" height="96" alt="AIEvoPet logo" />

# AIEvoPet

**English** · [简体中文](./README.zh-CN.md)

> An AI desktop pet that lives in the corner of your screen,<br/>
> remembers who you are, and grows up with you.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Art: CC BY 4.0](https://img.shields.io/badge/Art-CC%20BY%204.0-blue.svg)](./art/LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)](https://tauri.app)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Local-first](https://img.shields.io/badge/AI-100%25%20local-blueviolet)](#-local-ai-setup)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![GitHub stars](https://img.shields.io/github/stars/aievopet/aievopet?style=social)](https://github.com/aievopet/aievopet)

<br/>

<a href="src/assets/pet/generated/prompt-1-v1.png"><img src="src/assets/pet/generated/prompt-1-v1.png" width="72" alt="Electric weasel" /></a>
<a href="src/assets/pet/generated/prompt-2-v1.png"><img src="src/assets/pet/generated/prompt-2-v1.png" width="72" alt="Fire dragon" /></a>
<a href="src/assets/pet/generated/prompt-3-v1.png"><img src="src/assets/pet/generated/prompt-3-v1.png" width="72" alt="Water turtle" /></a>
<a href="src/assets/pet/generated/prompt-7-v1.png"><img src="src/assets/pet/generated/prompt-7-v1.png" width="72" alt="Shiba puppy" /></a>
<a href="src/assets/pet/generated/prompt-9-v1.png"><img src="src/assets/pet/generated/prompt-9-v1.png" width="72" alt="Penguin chick" /></a>
<a href="src/assets/pet/generated/prompt-11-v1.png"><img src="src/assets/pet/generated/prompt-11-v1.png" width="72" alt="Mecha rabbit" /></a>
<a href="src/assets/pet/generated/prompt-12-v1.png"><img src="src/assets/pet/generated/prompt-12-v1.png" width="72" alt="Cyber fox" /></a>
<a href="src/assets/pet/generated/prompt-39-v1.png"><img src="src/assets/pet/generated/prompt-39-v1.png" width="72" alt="Unicorn kitten" /></a>

<sub>8 of 63 species — every pet ships as hand-prompted pixel art.</sub>

<br/>

[**⭐ Star this repo**](https://github.com/aievopet/aievopet) · [**🐛 Report a bug**](https://github.com/aievopet/aievopet/issues/new/choose) · [**💡 Suggest a feature**](https://github.com/aievopet/aievopet/issues/new/choose) · [**🤝 Send a PR**](./CONTRIBUTING.md)

</div>

---

## What is AIEvoPet?

AIEvoPet is a **local-first, open-source AI desktop pet**.

It's not another chatbot in a tray icon. It's a small living creature that walks on your screen, remembers what you talked about, gets sleepy at 2am, hatches from an egg, picks an outfit you bought it, and pings you when your `cargo build` finally passes — all while running **100% on your laptop**, no cloud, no telemetry.

Think *Tamagotchi* × *QQ Pet* × *Cursor companion*, rebuilt in 2026 with Tauri + Rust + a local LLM.

---

## Why you might love it

| | |
|---|---|
| **Local-first AI** | Runs against your local Ollama (`qwen3:4b-instruct` by default). The pet's memory, dialogue, and intent parsing never leave your machine. |
| **Actually a pet, not a panel** | Walks, naps, gets hungry, hatches from an egg, has a bond meter, plays mini-jobs, wears outfits, and reacts to *you* — not to a "send" button. |
| **Grows up with your work** | Drop-in adapters for **Cursor**, **Claude Code**, and any shell command — pet reacts the moment your tests pass or your build fails, and teleports to your active monitor in Strong Reminder mode. See [`adapters/`](./adapters/README.md). |
| **Privacy by design** | No telemetry, no analytics, no network egress. Idle minutes are read locally via OS counters. Everything is in `~/Library/Application Support/AIEvoPet/`. |
| **Pixel art, end to end** | 63 species, 95+ wardrobe pieces, all hand-prompted then committed as PNGs. Art is CC BY 4.0 — fork it, remix it, dress it. |
| **Tiny binary, real desktop app** | Tauri 2 + Rust shell. ~10MB installer on macOS, <50MB RAM idle. Cross-platform (macOS Intel/ARM, Windows, Linux). |

---

## What's inside the box

<table>
<tr>
<td width="33%" valign="top">

### A real pet
- Hatches from an egg (pick species + name)
- Walks freely across your screen
- Hover to chat, drag to move
- Sleeps when you sleep, gets hungry, gets bored
- Bond meter unlocks new behavior over time

</td>
<td width="33%" valign="top">

### A tiny agent
- Local LLM dialogue (Ollama)
- Remembers preferences, names, what you do
- Daily diary auto-rolled from chats + activity
- Reminders ("ping me at 9pm")
- Voice commands like "*换成强提醒*" actually flip a real flag

</td>
<td width="33%" valign="top">

### A growth game
- Coin economy (pawcoins)
- Blind-box wardrobe (LLM picks based on mood)
- Part-time jobs (pet visibly works)
- Furniture & snacks shop
- Achievements + relationship stages

</td>
</tr>
<tr>
<td width="33%" valign="top">

### A coding companion
- Drop-in [adapters](./adapters/README.md) for Cursor and Claude Code (hooks, no SDK)
- `aievopet-watch` wraps any shell command (`npm test`, `cargo build`, agent CLIs)
- **Strong-reminder mode**: teleports to your active monitor + silent OS notification
- HTTP bridge at `127.0.0.1:44557/coding-event` for everything else

</td>
<td width="33%" valign="top">

### A diary
- Append-only `diary.json` per day
- Rolls up active minutes, conversations, jobs
- Optional Git activity import
- Calendar view in the panel
- Everything stays local

</td>
<td width="33%" valign="top">

### A creative kit
- 63 ready-made species ([gallery](#-meet-your-future-companion))
- 95+ wardrobe items with alignment editor
- Stickers (greeting / reminder / celebrate)
- Drop new PNGs into `src/assets/wardrobe/<category>/` and they hot-reload

</td>
</tr>
</table>

---

## Meet your future companion

A few faces from the 63-species gallery:

<table>
<tr>
<td align="center" width="12.5%"><img src="src/assets/pet/generated/prompt-1-v1.png" width="96" /><br/><sub>Electric weasel</sub></td>
<td align="center" width="12.5%"><img src="src/assets/pet/generated/prompt-2-v1.png" width="96" /><br/><sub>Fire dragon</sub></td>
<td align="center" width="12.5%"><img src="src/assets/pet/generated/prompt-3-v1.png" width="96" /><br/><sub>Water turtle</sub></td>
<td align="center" width="12.5%"><img src="src/assets/pet/generated/prompt-5-v1.png" width="96" /><br/><sub>Idol kitten</sub></td>
<td align="center" width="12.5%"><img src="src/assets/pet/generated/prompt-9-v1.png" width="96" /><br/><sub>Penguin chick</sub></td>
<td align="center" width="12.5%"><img src="src/assets/pet/generated/prompt-11-v1.png" width="96" /><br/><sub>Mecha rabbit</sub></td>
<td align="center" width="12.5%"><img src="src/assets/pet/generated/prompt-12-v1.png" width="96" /><br/><sub>Cyber fox</sub></td>
<td align="center" width="12.5%"><img src="src/assets/pet/generated/prompt-29-v1.png" width="96" /><br/><sub>Pixel dino</sub></td>
</tr>
<tr>
<td align="center"><img src="src/assets/pet/generated/prompt-30-v1.png" width="96" /><br/><sub>Husky puppy</sub></td>
<td align="center"><img src="src/assets/pet/generated/prompt-39-v1.png" width="96" /><br/><sub>Unicorn kitten</sub></td>
<td align="center"><img src="src/assets/pet/generated/prompt-56-v1.png" width="96" /><br/><sub>Pink piglet</sub></td>
<td align="center"><img src="src/assets/pet/generated/prompt-58-v1.png" width="96" /><br/><sub>Bee kitten</sub></td>
<td align="center"><img src="src/assets/pet/generated/prompt-60-v1.png" width="96" /><br/><sub>Marionette fox</sub></td>
<td align="center"><img src="src/assets/pet/generated/prompt-25-v1.png" width="96" /><br/><sub>Cloud slime</sub></td>
<td align="center"><img src="src/assets/pet/generated/prompt-24-v1.png" width="96" /><br/><sub>Mushroom sprite</sub></td>
<td align="center"><img src="src/assets/pet/generated/prompt-7-v1.png" width="96" /><br/><sub>Shiba puppy</sub></td>
</tr>
</table>

> Want a species we don't have yet? Open an [issue with the `species-request` label](https://github.com/aievopet/aievopet/issues/new/choose) and describe what you'd like — anyone can also submit a fully-drawn 32×32 PNG and we'll wire it in.

---

## Demo

> **We're actively looking for help on this section.** Until we record a proper demo GIF, here's what runs today — PRs adding screenshots or short loops are warmly welcomed.

<details>
<summary><b>Click to expand the feature walkthrough</b></summary>

1. **First run** → name your pet → pick species → pick model endpoint → hatch.
2. **Idle** → pet walks the screen edge, naps when you're idle, hovers a status cue (`Zzz` / `Hungry` / `Work 12'` / `$?`) above its head.
3. **Chat** → click and talk: it remembers preferences, names, your stated goals.
4. **Reminders** → "*ping me at 9pm to stretch*" → it actually does.
5. **Coding event** → `curl 127.0.0.1:44557/coding-event -d '{"kind":"task-done"...}'` → if **Strong reminder** is on, the pet teleports to your active monitor + fires an OS notification.
6. **Shop** → ask for a blind-box outfit, LLM picks based on the pet's current mood and your pawcoin balance.
7. **Diary** → calendar view of every day: chats, jobs, active minutes, optional Git activity.

</details>

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/aievopet/aievopet.git
cd aievopet

# 2. Install
npm install

# 3. Run desktop app (Tauri shell + Vite renderer)
npm run tauri:dev
```

**Prerequisites**

- Node.js 20+ and npm 10+
- Rust toolchain (`cargo`, `rustc`) — install via [rustup](https://rustup.rs/)
- Platform extras:
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev`
  - **Windows**: WebView2 Runtime (preinstalled on Win10+)

**Sanity checks**

```bash
npm run typecheck   # TS
npm run test        # unit tests
npm run build       # renderer bundle
npm run test:e2e    # window-level flows (Playwright)
```

---

## Local AI setup

The pet runs against [Ollama](https://ollama.ai) by default. Defaults are:

| | |
|---|---|
| Provider | `ollama` |
| Endpoint | `http://127.0.0.1:11434` |
| Model | `qwen3:4b-instruct` |

```bash
ollama pull qwen3:4b-instruct
ollama serve
```

Then start AIEvoPet — it auto-detects the running model.

> No Ollama? AIEvoPet falls back to scripted dialogue so onboarding still works. You can also point it at any OpenAI-compatible endpoint by editing the model config in the panel.

---

## Tech stack

```
┌─────────────────────────────────────────────────────────┐
│  React 19 + TypeScript 5 + Vite 7   ← renderer (UI)     │
│  Pixi.js 8                          ← pixel-art canvas  │
│  Tauri 2 (Rust 2021)                ← desktop shell     │
│  Ollama / OpenAI-compat             ← local LLM         │
│  user-idle (Rust)                   ← idle counters     │
│  Vitest + Playwright + Selenium     ← tests             │
└─────────────────────────────────────────────────────────┘
```

Architecture and protocol details are documented inline in the source:

- Coding-event bridge schema — `scripts/emit-coding-event.mjs`
- Pet save format — `src/types/pet.ts`
- Wardrobe / placement model — `src/types/wardrobe.ts`
- Tauri commands — `src-tauri/src/lib.rs`

---

## Roadmap

| Stage | What ships | Status |
|---|---|---|
| **0.1** — Public alpha | Walking pet, onboarding, memory, reminders, blind-box shop, jobs, diary, coding bridge, strong reminders, 63 species | **shipping now** |
| **0.2** — Bond layer | Long-term life events, weekly LLM-summarized memories, bond branches, more achievements | **next** |
| **0.3** — Plugin layer | Stable bridge token auth, public coding-event SDK (Cursor / VS Code / JetBrains adapters), generic art-gen scripts | planned |
| **0.4** — Multi-pet | Multiple pets, breeding/adoption, pet-to-pet interactions | exploring |
| **1.0** — Stable | Code signing, auto-update channel, plugin marketplace | aspirational |

Larger feature ideas are tracked in GitHub Issues — feel free to open one to start a discussion.

---

## Contributing — we want you

This is a side project that grew out of "I want a real desktop pet that's smart and respects my privacy". One person can't build the whole zoo — and we'd love your help.

**You can ship value in 30 minutes:**

| Skill | Things to do | Difficulty |
|---|---|---|
| Use the app | File a bug, suggest a feature, write a review | ⭐ |
| Write Chinese / English / 日本語 | Translate UI strings, improve docs | ⭐ |
| Pixel art | Add a new species, draw new wardrobe items, polish stickers | ⭐⭐ |
| Frontend (React + TS) | Fix a UI bug, build a new panel card | ⭐⭐ |
| Rust (Tauri) | Add a Tauri command, polish OS notifications | ⭐⭐⭐ |
| Make a demo GIF / screenshots | This README badly needs them — record a short loop and PR it in | ⭐ |

**How to start**

1. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) (5 min — covers DCO, tests, PR style).
2. Browse [good first issues](https://github.com/aievopet/aievopet/labels/good%20first%20issue).
3. Open an issue *before* a big PR so we can shape it together.
4. Sign your commits (`git commit -s`) — DCO required.

**Code of conduct** — we follow [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). Be kind, be patient, build cool things.

---

## Show your support

If AIEvoPet makes you smile when your pet ambles across your screen at 11pm and reminds you to drink water:

- ⭐ [**Star the repo**](https://github.com/aievopet/aievopet) — single biggest thing you can do
- 🐦 Tell one developer friend
- 🎨 Submit one pet design
- 💬 Share a screenshot in [Discussions](https://github.com/aievopet/aievopet/discussions)

[![Star History Chart](https://api.star-history.com/svg?repos=aievopet/aievopet&type=Date)](https://star-history.com/#aievopet/aievopet&Date)

---

## Acknowledgements

Standing on giants' shoulders:

- 🦀 [**Tauri**](https://tauri.app) — the reason this is 10MB and not 200MB
- ⚛️ [**React**](https://react.dev) — UI runtime
- 🎨 [**Pixi.js**](https://pixijs.com) — pixel-perfect canvas
- 🦙 [**Ollama**](https://ollama.ai) — local LLM in one command
- 🥚 *Tamagotchi* and *QQ Pet* — for proving a tiny digital creature can mean something
- 🤖 *Cursor / Claude Code* — for building this with us, one PR at a time

---

## Privacy & security

- 100% local. No telemetry, no analytics, no crash reporting.
- Coding-event bridge binds **only** to `127.0.0.1` (no external listeners).
- All pet state is in `~/Library/Application Support/AIEvoPet/` (macOS) / equivalent on other OSes.
- See [`SECURITY.md`](./SECURITY.md) and [`PRIVACY.md`](./PRIVACY.md) for the full story (including known caveats around localhost trust).

---

## License

- **Code**: [MIT](./LICENSE) — fork it, ship it, sell it
- **Art assets**: [CC BY 4.0](./art/LICENSE) — credit the original pet designers when you remix
- **Third-party notices**: [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)

---

<div align="center">

Made with ⌨️ + 🦀 + ☕ by humans and one pixel pig.

[**English**](./README.md) · [简体中文](./README.zh-CN.md)

</div>
