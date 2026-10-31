/** Side effects on the OS, behind an interface so tests can record them instead. */
export interface System {
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;
}

export const macSystem: System = {
  async readClipboard() {
    const proc = Bun.spawn(["pbpaste"], { stdout: "pipe" });
    return new Response(proc.stdout).text();
  },

  async writeClipboard(text) {
    const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
    proc.stdin.write(text);
    await proc.stdin.end();
    await proc.exited;
  },
};
