import type { Handlers } from "./types.ts";

export type Message =
  | { kind: "request"; id: string; method: string; params?: unknown }
  | { kind: "notify"; method: string; params?: unknown }
  | { kind: "result"; id: string; result?: unknown; error?: { message: string } };

/** One end of the newline-delimited JSON channel described in docs/protocol.md. */
export class Peer {
  private nextId = 0;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(
    private handlers: Handlers,
    private send: (message: Message) => void,
  ) {}

  async receive(message: Message): Promise<void> {
    switch (message.kind) {
      case "request": {
        try {
          const result = await dispatch(this.handlers, message.method, message.params);
          this.send({ kind: "result", id: message.id, result: result ?? null });
        } catch (error) {
          this.send({ kind: "result", id: message.id, error: { message: errorMessage(error) } });
        }
        break;
      }
      case "notify":
        await dispatch(this.handlers, message.method, message.params).catch((error) =>
          console.error(`notify ${message.method} failed:`, error),
        );
        break;
      case "result": {
        const waiter = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) waiter?.reject(new Error(message.error.message));
        else waiter?.resolve(message.result);
        break;
      }
    }
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = `b${++this.nextId}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ kind: "request", id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    this.send({ kind: "notify", method, params });
  }
}

export async function dispatch(handlers: Handlers, method: string, params: unknown): Promise<unknown> {
  const handler = handlers[method];
  if (!handler) throw new Error(`Unknown method: ${method}`);
  return handler(params ?? {});
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Feeds newline-delimited JSON from a byte stream into `onMessage`. */
export async function readLines(stream: ReadableStream<Uint8Array>, onMessage: (message: Message) => void) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        onMessage(JSON.parse(line));
      } catch (error) {
        console.error("Dropping malformed protocol line:", errorMessage(error));
      }
    }
  }
}
