import type { ReactNode } from "react";
import type { GlyphName, Icon as IconModel } from "../ipc.ts";

const GLYPHS: Record<GlyphName, { tint: string; paths: ReactNode }> = {
  snippet: { tint: "#0a84ff", paths: <path d="M5 6h14M5 12h10M5 18h12" /> },
  "snippet-add": { tint: "#0a84ff", paths: <path d="M4 6h12M4 12h8M4 18h7M17 13v8M13 17h8" /> },
  power: { tint: "#ff453a", paths: <path d="M12 3v9M17.7 6.6a8 8 0 1 1-11.4 0" /> },
};

export function Icon({ icon, size = 20 }: { icon: IconModel; size?: number }) {
  const glyph = GLYPHS[icon.name];
  return (
    <span className="glyph" style={{ width: size, height: size, background: glyph.tint }}>
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72} fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {glyph.paths}
      </svg>
    </span>
  );
}
