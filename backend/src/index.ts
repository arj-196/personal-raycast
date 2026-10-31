import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createBackend } from "./backend.ts";
import { openDatabase } from "./db.ts";
import { dispatch, errorMessage, Peer, readLines, type Message } from "./rpc.ts";
import { macSystem } from "./system.ts";

// Stdout is the protocol channel; keep stray logging off it.
console.log = console.error;
console.info = console.error;

const dataDir = process.env.PRC_DATA_DIR ?? join(homedir(), "Library/Application Support/personal-raycast");
mkdirSync(dataDir, { recursive: true });
const db = openDatabase(join(dataDir, "data.db"));

const sseClients = new Set<ReadableStreamDefaultController<string>>();
let peer: Peer | null = null;

const notify = (method: string, params: unknown) => {
  peer?.notify(method, params);
  const event = `data: ${JSON.stringify({ method, params })}\n\n`;
  for (const client of sseClients) client.enqueue(event);
};

const handlers = createBackend({ db, system: macSystem, notify });

if (process.env.PRC_DEV_HTTP) {
  startDevBridge(Number(process.env.PRC_DEV_HTTP));
} else {
  peer = new Peer(handlers, (message: Message) => process.stdout.write(JSON.stringify(message) + "\n"));
  const activePeer = peer;
  const inFlight = new Set<Promise<void>>();
  await readLines(Bun.stdin.stream(), (message) => {
    const handled = activePeer.receive(message).finally(() => inFlight.delete(handled));
    inFlight.add(handled);
  });
  // Host closed stdin: it quit or crashed. Answer what was already asked, then follow it.
  await Promise.allSettled(inFlight);
  process.exit(0);
}

/** Browser-only bridge so the frontend can run outside WKWebView (see docs/protocol.md). */
function startDevBridge(port: number) {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };
  Bun.serve({
    port,
    hostname: "127.0.0.1",
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return new Response(null, { headers: cors });
      if (url.pathname === "/ipc" && request.method === "POST") {
        const { method, params } = (await request.json()) as { method: string; params: unknown };
        try {
          return Response.json({ data: (await dispatch(handlers, method, params)) ?? null }, { headers: cors });
        } catch (error) {
          return Response.json({ error: errorMessage(error) }, { headers: cors });
        }
      }
      if (url.pathname === "/events") {
        let controller!: ReadableStreamDefaultController<string>;
        const stream = new ReadableStream<string>({
          start: (c) => {
            controller = c;
            sseClients.add(c);
          },
          cancel: () => {
            sseClients.delete(controller);
          },
        });
        return new Response(stream, { headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
      }
      return new Response("Not found", { status: 404, headers: cors });
    },
  });
  console.error(`personal-raycast dev bridge on http://127.0.0.1:${port}`);
}
