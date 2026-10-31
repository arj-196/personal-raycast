import { useState, type ReactNode } from "react";
import { hasNativeHost, type GlyphName, type Icon as IconModel } from "../ipc.ts";

const GLYPHS: Record<GlyphName, { tint: string; paths: ReactNode }> = {
  calculator: {
    tint: "#ff9f0a",
    paths: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h4" />
      </>
    ),
  },
  snippet: { tint: "#0a84ff", paths: <path d="M5 6h14M5 12h10M5 18h12" /> },
  "snippet-add": { tint: "#0a84ff", paths: <path d="M4 6h12M4 12h8M4 18h7M17 13v8M13 17h8" /> },
  link: {
    tint: "#30d158",
    paths: (
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    ),
  },
  "link-add": {
    tint: "#30d158",
    paths: <path d="M9 14a4 4 0 0 0 6 .4l2.4-2.4a4 4 0 0 0-5.6-5.6L10.4 7.8M13 11a4 4 0 0 0-6-.4L4.6 13a4 4 0 0 0 5.6 5.6M18 15v6M15 18h6" />,
  },
  refresh: { tint: "#8e8e93", paths: <path d="M20 12a8 8 0 1 1-2.6-5.9L20 8.5M20 3.5v5h-5" /> },
  power: { tint: "#ff453a", paths: <path d="M12 3v9M17.7 6.6a8 8 0 1 1-11.4 0" /> },
  folder: {
    tint: "#64d2ff",
    paths: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  },
};

export function Icon({ icon, size = 20 }: { icon: IconModel; size?: number }) {
  if (icon.type === "app") return <AppIcon path={icon.path} size={size} />;
  const glyph = GLYPHS[icon.name];
  return (
    <span className="glyph" style={{ width: size, height: size, background: glyph.tint }}>
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72} fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {glyph.paths}
      </svg>
    </span>
  );
}

function AppIcon({ path, size }: { path: string; size: number }) {
  const [failed, setFailed] = useState(!hasNativeHost);
  if (failed) {
    const name = path.split("/").pop()?.replace(/\.app$/, "") ?? "?";
    return (
      <span className="glyph letter" style={{ width: size, height: size, fontSize: size * 0.55 }}>
        {name[0]}
      </span>
    );
  }
  return (
    <img
      className="app-icon"
      width={size}
      height={size}
      src={`prc://localhost/__icon?size=${size * 2}&path=${encodeURIComponent(path)}`}
      onError={() => setFailed(true)}
      draggable={false}
      alt=""
    />
  );
}
