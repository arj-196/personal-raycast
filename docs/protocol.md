# IPC protocol

The protocol follows the shape observed in Raycast 2.x (`docs/raycast-teardown.md` §2–3).

```
React UI ──webkit.messageHandlers.ipcRequest──► Swift host ──stdio JSON lines──► Bun backend
          ◄── window.ipcNotification(m, d) ───            ◄── notify / result ───
```

## Frontend → host

```js
await window.webkit.messageHandlers.ipcRequest.postMessage({
  method: "rootSearch.search",          // "<namespace>.<method>"
  destination: "backend" | "host",
  data: JSON.stringify(params),
})
// resolves to JSON.stringify({ data }) or rejects with an error string
```

The host handles `destination: "host"` itself. It forwards `destination: "backend"` over stdio.

## Host ⇄ backend (newline-delimited JSON on the backend's stdin/stdout)

```jsonc
{ "kind": "request", "id": "h12", "method": "snippets.expand", "params": { "keyword": ";addr" } }
{ "kind": "result",  "id": "h12", "result": { "text": "…", "cursorFromEnd": 0 } }
{ "kind": "result",  "id": "h12", "error": { "message": "No snippet for keyword" } }
{ "kind": "notify",  "method": "snippets.keywordsChanged", "params": { "keywords": [";addr"] } }
```

- The backend writes logs to stderr only. Stdout carries protocol lines and nothing else.
- The host forwards every backend `notify` to all web views as `window.ipcNotification(method, params)`. It also consumes `snippets.keywordsChanged` itself, for auto-expansion.

## Dev bridge (browser only)

`PRC_DEV_HTTP=5174 bun run backend/src/index.ts` serves:

- `POST /ipc {method, params}` → `{data}` | `{error}`
- `GET /events` (SSE notifications)

When `window.webkit` is absent, the frontend uses this bridge and stubs host calls.

## Effects

Backend actions return an `Effect`, and the frontend applies it:

| Effect | Frontend does |
|---|---|
| `{type:"hide", hud?}` | `host.raycast.hideMainWindow` and pops to root |
| `{type:"push", route}` | pushes a view (`snippets-list`, `snippet-form`, `quicklinks-list`, `quicklink-form`) |
| `{type:"paste", text, cursorFromEnd?}` | `host.raycast.pasteText`, which hides, pastes into the previously focused app, then moves the cursor |
| `{type:"toast", style, title, message?}` | shows a toast |
| `{type:"refresh", toast?}` | reloads the current view |
| `{type:"quit"}` | `host.raycast.quit` |
