# Personal Raycast

A personal Raycast clone that follows Raycast 2.x's architecture: a Swift shell hosting a
React UI in a WKWebView, with a Bun backend over stdio JSON. Build, run and test commands
are in [README.md](README.md). The IPC contract is in [docs/protocol.md](docs/protocol.md).

## Researching features against Raycast

Do this for every new feature or change to existing behaviour, before you design it:

1. Look in [docs/raycast-teardown.md](docs/raycast-teardown.md) for how Raycast
   implements it. It covers the process architecture, the `ipc.<destination>.<namespace>.<method>`
   contract, the extension runtime and the feature inventory.
2. If the teardown doesn't answer it, use the `/reverse-engineer-anything` skill to find
   out how Raycast builds it. Everything is in the installed app on this Mac. Read it there;
   don't download anything. `$R` below is
   `/Applications/Raycast.app/Contents/Resources/macos-app_RaycastDesktopApp.bundle/Contents/Resources`.
   - The UI (lists, action panel, forms, settings) is the Vite build in `$R/frontend/`.
     `main-window.html` is the launcher; the chunk names say what each file holds.
   - The feature logic (root search, snippets, quicklinks, clipboard, calculator, AI,
     extension host) is the Node bundle `$R/backend/index.mjs`, with Rust N-API addons
     beside it (`data`, `indexer`, `calculator-rs`, …). It's 8 MB, so search it for the
     method or notification name from the teardown rather than analysing it whole.
   - The `@raycast/api` runtime and the extension template are in `$R/api/`.
   - The native side (hotkeys, panels, Accessibility, pasteboard, window management) is
     the Swift binary `/Applications/Raycast.app/Contents/MacOS/Raycast`, the Rust
     coordinator `Contents/Frameworks/libraycast_host.dylib` and the XPC services in
     `Contents/XPCServices/`.
   - Raycast's live data is in `~/Library/Application Support/com.raycast.macos/`
     (`frecency.db`, `clipboard.db`, `main.db`, …). Open these read-only to learn a schema.
     Never write to them, and don't copy the user's data into this repo.
3. Write what you learn back into `docs/raycast-teardown.md`, or a new file in `docs/`
   linked from it. Mark each claim as **observed** (read in shipped code or data) or
   **inferred**, and move anything you resolve out of "Unknowns". The next feature then
   starts from it.

The goal is not to copy Raycast but to do better. Use the shipped app to research how a
feature can be built:
- Adopt their approach where it's good.
- Depart from it where something simpler or better fits a single-user personal app.
  For example, Bun with `bun:sqlite` stands in for Node plus the Rust coordinator and
  addons.
- Say which you did and why, in the change and in the docs.

Don't call Raycast's backend services (`backend.raycast.com` and the like), and don't
use their API keys or account tokens. This app works locally.

## Code layout

- `host/`: the Swift shell. It owns the non-activating panel, the global hotkey, the
  WKWebView bridge, the `prc://` scheme for assets and app icons, pasting into the
  frontmost app and snippet keyword expansion.
- `frontend/`: the React + Vite UI. Every call goes through `ipc.ts` as
  `ipc.<destination>.<namespace>.<method>`, the same shape Raycast uses.
- `backend/`: Bun. Root search ranking, calculator, snippets and quicklinks, stored in
  `bun:sqlite`.
- `docs/`: the teardown and the IPC protocol.

Keep these rules:
- Keep the `ipc.<destination>.<namespace>.<method>` shape, and reuse Raycast's method and
  notification names from the teardown when a feature has one. That keeps the door open
  to running real Raycast extensions later.
- Native work (Accessibility, pasteboard, windows, hotkeys) belongs in `host/`. Data and
  logic belong in `backend/`. The frontend only renders and calls IPC.
- New host calls must degrade gracefully when `hasNativeHost` is false
  (`frontend/src/ipc.ts`), so the UI keeps working in a plain browser against the dev
  bridge.

## Keep the docs current

[docs/protocol.md](docs/protocol.md) and the layout in [README.md](README.md) are
documentation that must match the code. Update them in the same change whenever you:

- add, remove or rename an IPC method, notification or effect
- add, remove or rename a module or process
- add a dependency, a storage file or a database table
- change a permission the app needs

Before you finish:
- run `cd backend && bun test && bun run typecheck` and `cd frontend && bun run typecheck`
- check UI changes in the browser preview (`backend-dev` and `frontend` in
  `.claude/launch.json`), and in the real shell with `PRC_UI_TESTING=1` when the change
  depends on the host
- check that the docs above still match the code

## Releasing

When the user asks to release, do these steps in order:

1. Finish the checks in "Before you finish" above.
2. Commit the change on `main`.
3. Push `main` to `origin`. The repo has no remote yet; if that's still true, say so and
   skip this step.
4. Run `./scripts/build-app.sh`. It rebuilds `build/Personal Raycast.app`. If the app is
   open, the user has to quit and reopen it to load the new build, and macOS may ask for
   Accessibility permission again because builds are ad-hoc signed.

Report the commit hash and confirm that the push and the build both worked.
