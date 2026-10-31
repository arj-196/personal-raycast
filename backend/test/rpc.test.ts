import { expect, test } from "bun:test";
import { Peer, readLines, type Message } from "../src/rpc.ts";

test("requests resolve through a connected pair of peers", async () => {
  let b!: Peer;
  const a = new Peer({}, (m) => void b.receive(m));
  b = new Peer(
    {
      "math.double": ({ n }: { n: number }) => n * 2,
      "math.fail": () => {
        throw new Error("nope");
      },
    },
    (m) => void a.receive(m),
  );
  expect(await a.request("math.double", { n: 21 })).toBe(42);
  await expect(a.request("math.fail")).rejects.toThrow("nope");
  await expect(a.request("missing.method")).rejects.toThrow("Unknown method: missing.method");
});

test("readLines splits newline-delimited JSON across chunk boundaries and skips junk", async () => {
  const encoder = new TextEncoder();
  const chunks = ['{"kind":"notify","met', 'hod":"a"}\n\nnot json\n{"kind":"notify",', '"method":"b"}\n'];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const received: Message[] = [];
  await readLines(stream, (m) => received.push(m));
  expect(received.map((m) => (m as { method: string }).method)).toEqual(["a", "b"]);
});
