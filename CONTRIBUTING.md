# Contributing to AIEvoPet

Thanks for helping build AIEvoPet.

## Development prerequisites

- Node.js 20+
- npm 10+
- Rust toolchain (`cargo`, `rustc`)
- Tauri CLI (available through project dependencies)

Quick self-check:

```bash
node -v
npm -v
cargo -V
rustc -V
npx tauri -V
```

## Local development

```bash
npm install
npm run tauri:dev
```

Alternative split mode:

```bash
npm run dev
npm run tauri:dev
```

## Before opening a PR

Minimum checks:

```bash
npm run typecheck
npm run test
npm run build
```

When touching desktop interactions, onboarding, reminders, or Tauri window behavior:

```bash
npm run test:e2e
```

## Adding wardrobe items

The blind-box shop reads from `src/assets/wardrobe/manifest.ts`. To ship
a new item:

1. Add an entry to `WARDROBE_ITEMS` (id, nameZh, category, slot, mood
   tags, price band, description). Keep `assetUrl` undefined; the sync
   script fills it in.
2. Drop the cut PNG at
   `src/assets/wardrobe/<category>/<id>.png` — the filename must match
   the entry's `id`.
3. Run `npm run wardrobe:sync`. CI runs `npm run wardrobe:check` to
   guard against orphan entries.

In short: prompt → cut to transparent PNG → drop in `src/assets/wardrobe/<category>/<id>.png` → run `npm run wardrobe:sync`. Any pixel-art capable text-to-image model works.

## Coding event bridge changes

If your change touches the bridge (`scripts/emit-coding-event.mjs` or Rust bridge handlers), validate with:

```bash
npm run emit:coding-event -- '{"kind":"test-pass","source":"manual","status":"succeeded","title":"Bridge check","summary":"manual verification"}'
```

The accepted event schema (`kind`, `source`, `status` enums) is enforced and documented at the top of `scripts/emit-coding-event.mjs`.

## Contribution style

- Prefer modifying existing modules over introducing extra abstractions
- Keep high-risk actions auditable
- Keep the product feeling like a pet companion, not a dashboard app

## Pull request checklist

Please include:

- What roadmap area this change belongs to
- User-visible behavior changes
- Test evidence (commands run)
- Whether onboarding/reminders/window behavior/domain store changed

## Releasing (maintainers only)

The `Release` GitHub Action builds native installers for macOS (Apple Silicon
+ Intel), Windows, and Linux, then attaches them to a draft GitHub Release.

To cut a real release:

1. Update versions in three places (must match):
   - `package.json` → `version`
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `package.version`
2. Update `CHANGELOG.md` (move `Unreleased` items into a new dated section).
3. Commit, then tag and push:

   ```bash
   git tag v0.1.1
   git push --tags
   ```

4. Wait for the `Release` workflow to finish (~25–35 min for the full
   matrix). Open the draft release on GitHub, edit notes, attach a demo
   GIF if available, then click **Publish**.

To smoke-test the matrix without cutting a release, use **Run workflow**
on the Release action; it produces a draft tagged `nightly-<run_number>`.

The first launch on macOS / Windows triggers the unsigned-binary warning
(see the README's Troubleshooting section). Code signing is on the
roadmap but not yet wired up.

## DCO (Developer Certificate of Origin)

By contributing, you certify that you have the right to submit your code under the project license.

Please sign commits using `-s`:

```bash
git commit -s -m "your message"
```
