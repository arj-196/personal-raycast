import type { Effect, GeneralSettings, Hotkey, RootItem, Snippet } from "../../backend/src/types.ts";

export type { Action, Effect, GeneralSettings, Hotkey, Icon, GlyphName, Modifier, RootItem, Route, Snippet, Toast } from "../../backend/src/types.ts";

type SnippetInput = { name: string; text: string; keyword?: string | null };

/** Methods served by the Bun backend (backend/src/backend.ts). */
type BackendApi = {
  rootSearch: {
    search(p: { term: string }): Promise<{ items: RootItem[] }>;
    execute(p: { itemId: string; actionId?: string }): Promise<Effect>;
  };
  snippets: {
    list(p: { term?: string }): Promise<Snippet[]>;
    get(p: { id: number }): Promise<Snippet>;
    create(p: SnippetInput): Promise<Snippet>;
    update(p: SnippetInput & { id: number }): Promise<Snippet>;
    isKeywordAvailable(p: { keyword: string; excludeId?: number }): Promise<boolean>;
    execute(p: { id: number; actionId: string }): Promise<Effect>;
  };
  settings: {
    getGeneralSettings(p: {}): Promise<GeneralSettings>;
    updateGeneralSettings(p: Partial<GeneralSettings>): Promise<GeneralSettings>;
  };
};

/** Methods served natively by the Swift shell (host/Sources/PersonalRaycast/HostHandlers.swift). */
type HostApi = {
  raycast: {
    hideMainWindow(p?: { hud?: string }): Promise<null>;
    pasteText(p: { text: string; cursorFromEnd?: number }): Promise<null>;
    quit(p?: {}): Promise<null>;
  };
  hotkey: {
    /** Registers the launcher shortcut; rejects if macOS or another app holds it. */
    updateGlobal(p: { hotkey: Hotkey }): Promise<null>;
    toggleRecording(p: { enabled: boolean }): Promise<null>;
  };
};

type Destination = "backend" | "host";

declare global {
  interface Window {
    webkit?: { messageHandlers: { ipcRequest: { postMessage(message: unknown): Promise<string> } } };
    ipcNotification?: (method: string, data: unknown) => void;
  }
}

export const hasNativeHost = typeof window !== "undefined" && !!window.webkit?.messageHandlers?.ipcRequest;
const DEV_BRIDGE = "http://127.0.0.1:5174";

async function request(destination: Destination, method: string, params: unknown): Promise<unknown> {
  if (hasNativeHost) {
    const reply = await window.webkit!.messageHandlers.ipcRequest.postMessage({
      method,
      destination,
      data: JSON.stringify(params ?? {}),
    });
    return (JSON.parse(reply) as { data: unknown }).data;
  }
  if (destination === "host") {
    console.info(`[dev] host.${method}`, params);
    return null;
  }
  const response = await fetch(`${DEV_BRIDGE}/ipc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const json = (await response.json()) as { data?: unknown; error?: string };
  if (json.error) throw new Error(json.error);
  return json.data;
}

function proxy<T>(destination: Destination): T {
  return new Proxy({} as Record<string, unknown>, {
    get: (_, namespace: string) =>
      new Proxy({}, { get: (__, method: string) => (params: unknown) => request(destination, `${namespace}.${method}`, params) }),
  }) as T;
}

export const ipc = { backend: proxy<BackendApi>("backend"), host: proxy<HostApi>("host") };

// Notifications: pushed by the host via window.ipcNotification, or by the dev bridge over SSE.
const listeners = new Map<string, Set<(data: any) => void>>();

export function subscribe(method: string, listener: (data: any) => void): () => void {
  const set = listeners.get(method) ?? new Set();
  set.add(listener);
  listeners.set(method, set);
  return () => set.delete(listener);
}

function dispatch(method: string, data: unknown) {
  for (const listener of listeners.get(method) ?? []) listener(data);
}

window.ipcNotification = dispatch;
if (!hasNativeHost) {
  new EventSource(`${DEV_BRIDGE}/events`).onmessage = (event) => {
    const { method, params } = JSON.parse(event.data) as { method: string; params: unknown };
    dispatch(method, params);
  };
}
