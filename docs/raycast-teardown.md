# Raycast 2.10.1 teardown

Reference for building `personal-raycast`. Everything here comes from static inspection of the shipped app. Nothing was executed.

- **Target:** `/Applications/Raycast.app`, version 2.10.1.0, arm64, `LSMinimumSystemVersion` 26.0
- **Tools used:** `otool`, `nm`, `strings` and `grep` over the bundle, plus REA `analyze_javascript_application` on the backend. That run timed out on the 8 MB `index.mjs`, so its Evidence `ev_27b60dcc…60ef82` is partial.
- **Labels:** **Observed** means read directly from the bundle. **Inferred** means my reading of observed facts.

## 1. Process architecture

```
┌──────────────────────────── Raycast.app ─────────────────────────────┐
│ MacOS/Raycast (Swift, AppKit + SwiftUI + WebKit, 16 MB)              │
│   • windows/panels, global hotkeys, Accessibility, clipboard,        │
│     window mgmt, media, wifi/bluetooth, calendars, permissions       │
│   • hosts one WKWebView per window (main, settings, notes, AI chat…) │
│   • links Frameworks/libraycast_host.dylib (Rust, UniFFI)             │
│        "Coordinator": start/stop/send/notify/get_state,              │
│        on_request/on_notification/on_backend_stall callbacks        │
│                       │                                              │
│                       ▼ spawns + supervises                          │
│ Node 26.12.1 (shipped as tarball in Resources/.../node/)             │
│   backend/index.mjs (8 MB bundle) + Rust N-API addons:               │
│     data.node (31 MB), indexer.node (14 MB), calculator-rs.node,     │
│     fs-utils.node, process-utils.node, Calculator.node + SoulverCore │
│   • settings, root search, clipboard history, snippets, quicklinks,  │
│     notes, AI, extension host, script commands, store, indexer       │
│        │                                                             │
│        ▼ worker_threads                                              │
│   Extensions: @raycast/api + react-reconciler (persistent mode)      │
└──────────────────────────────────────────────────────────────────────┘
Also shipped: XPC services "Raycast Accessibility" and "Raycast Pasteboard",
the helper app "Raycast Palette.app", the launchd Updater agent and daemon,
and a bundled ripgrep.
```

**Observed:**

- `libraycast_host.dylib` exports UniFFI metadata for `Coordinator` (`start`, `stop`, `send`, `notify`, `get_state`, `note_power_transition`, `note_windows_open`, `boost_execution_speed_for`) and for `EventHandler` (`on_request`, `on_notification`, `on_backend_stall`, `on_backend_log`, `on_failure`).
- That dylib's crates include tokio, hyper, reqwest, serde_json, uniffi and sentry.
- The frontend is a Vite build: 9 HTML entry points (`main-window`, `settings-window`, `notes-window`, `ai-chat-window`, `theme-studio-window`, `welcome-window`, …) and 567 named chunks.
- Several chunks are Windows-only (`windows-run-*`, `windows-taskbar-*`).

**Inferred:**

- Raycast 2.x is a cross-platform rewrite: one shared React frontend and Node backend, with a thin native shell for each OS.
- The Rust coordinator owns the Node process lifecycle and message routing.

## 2. IPC contract (Observed)

The frontend reaches the host through a `WKScriptMessageHandlerWithReply`:

```js
await window.webkit.messageHandlers.ipcRequest.postMessage({
  method, data: JSON.stringify(params), destination, timeout /* seconds */
})
// host → frontend:
window.ipcRequest(method, data)        // host asks the web view something
window.ipcNotification(method, data)   // push events
```

Frontend code calls typed proxies of the form `ipc.<destination>.<namespace>.<method>(params)`. There are 859 distinct methods and 98 notification types. The full lists are in the session scratchpad.

| Destination | Namespaces (call-site count) |
|---|---|
| `host` (Swift) | raycast 170, fileSystem 138, applications 55, media 54, settings 52, system 46, permissions 43, windowManagement 29, virtualDesktops 24, hotkey 24, clipboard 19, wifi 16, calendars 16, navigation 13, network 11, palette 10, bluetooth 9 |
| `backend` (Node) | system 148, clipboard 142, settings 132, ai 131, fileSystem 74, aiRuntime 71, extensionHost 54, notes 52, snippets 37, userDefaults 36, indexer 35, quicklinks 26, dictation 25, focus 23, calculator 15, rootSearch 12, store 11, scriptCommands 7 |

The core methods are the ones an MVP would mirror:

- `backend.rootSearch`: `search({term, knownSnapshot:{sessionId,revision}})` → `{type:"snapshot"|"superseded", snapshot}`, `activateEmptyQuery`, `getItem`, `handleAction`, `getAllAliases`, `getCommandDeeplink`. Notifications: `rootSearch.invalidated`, `rootSearch.aliasesChanged`.
- `backend.extensionHost`: `getAllExtensions`, `getCommands`, `launchCommand`, `loadCommand`, `callNodeCallback`, `startDevelopment`, `stopDevelopment`, `importExtension`, `uninstall`.
- `backend.clipboard`: `getAll`, `copy`, `paste`, `pin`, `unpin`, `delete`, `getTextFromImage`, `getQrCodeFromImage`, `setFilter`.
- `backend.snippets`: `list`, `create`, `update`, `delete`, `isKeywordAvailable`, `autoSnippet`.
- `backend.quicklinks`: `list`, `save`, `update`, `delete`, `pin`, `updateOpenCount`.
- `backend.calculator`: `calculate`, `parseDate`, `parseDuration`, `refreshCurrencies`, `history*`.
- `backend.scriptCommands`: `getScripts`, `runScript`, `runScriptStreamed`, `cancelScript`.
- `host.applications`: `getAllRunning`, `getFrontmost`, `open`, `hide`, `quitAll`, `getSelectedText`, `getFocusedTextFieldContent`.
- `host.windowManagement`: `getActiveWindow`, `setWindowBounds`, `getVisibleWindows`, `minimizeWindow`, `showGridPlacement`.
- `host.hotkey`: `updateGlobal`, `toggleRecording`, `commandSpaceAvailability`, `disableSymbolicHotkey`.
- `host.raycast`: `showMainWindow`, `hideMainWindow`, `resizeWindow`, `setCompactMode`, `shakeMainWindow`, `show*Window`.

## 3. Extension runtime (Observed)

- Each extension runs in a Node `worker_thread`.
- The bundled `@raycast/api` uses `react-reconciler` in persistence mode (`supportsPersistence: true`, `cloneInstance`, `finalizeContainerChildren`). On each commit it promotes a shadow tree (`onPromoteTree`).
- Worker ⇄ backend messages: `{kind:"request", id, method, params}`, `{kind:"notify", method, params}`, `{kind:"result", id, result:{success, value|error}}`, and `{kind:"child-process", event}`.
- Callbacks such as `onAction` stay in the worker as IDs. The UI fires them through `extensionHost.callNodeCallback`.
- Host component vocabulary:
  - **Lists and grids:** `ray-list`, `ray-list-section`, `ray-list-item`, `ray-list-item-detail`, `ray-grid*`
  - **Detail:** `ray-detail`, `ray-metadata*`
  - **Forms:** `ray-form*` (textfield, textarea, passwordfield, checkbox, dropdown, datepicker, filepicker, tagpicker, description, separator)
  - **Actions and menus:** `ray-action-panel`, `ray-menu-item`, `ray-submenu-item`, `ray-menu-section`
  - **Menu bar:** `ray-menu-bar-extra*`
  - **Other:** `ray-navigation-stack`, `ray-search-bar-dropdown`, `ray-empty-view`, `ray-widget`
- A new-extension scaffold ships at `api/template/`.

**Inferred:** the frontend renders the promoted tree as React DOM. In 1.x it was native AppKit.

## 4. Feature inventory (from chunk names)

- **Root search:** apps, commands, aliases, favorites, fallback commands, root-search sensitivity
- **Built-ins:** calculator (SoulverCore, plus a newer Rust calculator behind `use-is-rust-calculator-enabled`), clipboard history (filters, OCR, QR), snippets with auto-expansion, quicklinks, emoji picker, window management, file search (indexer, semantic indexing), script commands, Apple Shortcuts, calendar/meetings, contacts, dictionary, translator, screenshots, system actions, focus sessions, typing practice, games
- **Notes**, **AI** (chat, Quick AI, AI commands, agents, MCP client, BYOK, local models via Ollama, skills, memory, screen awareness, dictation)
- **Platform:** themes and theme studio, cloud sync, organizations, store, Pro gating, deeplinks (`raycast://`)

## 5. Unknowns (not established)

- Backend internals. `index.mjs` was not fully analyzed (REA timeout), so business logic, the ranking algorithm and DB schemas are unread.
- The Coordinator ⇄ Node wire transport. The backend references stdio, `process.send` and `createServer`, but which one carries traffic was not observed.
- Swift host internals: hotkey, panel and accessibility implementation. Not decompiled.
- The Rust N-API addons (`data`, `indexer`, `calculator-rs`). Exports not inspected.
- The exact extension RPC method names. The worker-side dispatch is minified behind aliases.
