# Personal Raycast

A personal Raycast clone that follows Raycast 2.x's architecture. See [docs/raycast-teardown.md](docs/raycast-teardown.md) for what the shipped app was found to contain.

```
host/      Swift shell: non-activating panel, ⌥Space hotkey, menu bar icon, WKWebView bridge,
           prc:// assets, paste-into-frontmost, snippet keyword expansion
frontend/  React + Vite UI (root search, snippet form, ⌘K action panel)
backend/   Bun: root search over snippets, snippet storage (bun:sqlite)
docs/      teardown and IPC protocol
```

The launcher does snippets and nothing else. It doesn't index or search applications; it isn't a Spotlight replacement.

- Type in the search bar to find a snippet by name, keyword or text. The pane on the right shows its full text. **↵** pastes it into the app you came from, **⌘↵** copies it.
- **Create Snippet** (or **⌘N** on any snippet) opens the form. If nothing matches what you typed, Create Snippet is offered instead.
- Snippets support `{clipboard}`, `{date}`, `{time}`, `{datetime}`, `{day}`, `{uuid}` and `{cursor}`. Give one a keyword (`;sig`) to expand it as you type in any app.

App search, the calculator and quicklinks were removed after milestone 1 (commit `da4db13` has them).

## Build and run

```bash
./scripts/build-app.sh
```

```bash
open "build/Personal Raycast.app"
```

The launcher shows on open (and when you open the app again). After that, use **⌥Space** or the menu bar icon. While the app runs, a filled `{}` icon sits in the menu bar; it has no Dock icon. If you can't see the icon, the notch may be hiding it: ⌘-drag it further right, or check System Settings → Menu Bar. ⌥Space is also Raycast's default hotkey, so quit Raycast or rebind one of them first. The shortcut is set in `host/Sources/PersonalRaycast/AppDelegate.swift`.

Pasting snippets and auto-expansion need **Accessibility** permission (System Settings → Privacy & Security). Builds are ad-hoc signed, so macOS may ask again after a rebuild.

Data lives in `~/Library/Application Support/personal-raycast/data.db`. `PRC_DATA_DIR` overrides it.

## Develop

Hot-reload the UI inside the real shell:

```bash
cd frontend && bun run dev
```

```bash
cd host && PRC_FRONTEND_URL=http://localhost:5173 PRC_BACKEND_CMD="bun run ../backend/src/index.ts" swift run PersonalRaycast
```

You can also work on the UI in a plain browser against the dev bridge (host calls are stubbed):

```bash
cd backend && bun run dev
```

```bash
cd frontend && bun run dev
```

Tests:

```bash
cd backend && bun test && bun run typecheck
```

```bash
cd frontend && bun run typecheck
```

### UI testing hook

Launch with `PRC_UI_TESTING=1`. The app then evaluates JS bodies posted as the distributed notification `com.arjun.personal-raycast.uitest`, with `userInfo["out"]` set to the result file. This drives the web UI without synthesizing system keystrokes. It's the same idea as Raycast's `RAYCAST_ENABLE_UI_TESTING`.
