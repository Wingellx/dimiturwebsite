import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The brand mark, drawn for `next/og` image routes (favicon, home-screen
 * icon, link previews). Kept as JSX + inline styles because that is what the
 * image renderer understands; fonts are loaded from /assets so the mark looks
 * identical wherever it is generated.
 */

export const BRAND = {
  ink: "#14110f",
  paper: "#faf8f5",
  muted: "#a39a91",
};

export async function brandFonts() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  const [serif, serifItalic, sans] = await Promise.all([
    readFile(path.join(dir, "InstrumentSerif-Regular.ttf")),
    readFile(path.join(dir, "InstrumentSerif-Italic.ttf")),
    readFile(path.join(dir, "Inter-Medium.otf")),
  ]);
  return [
    { name: "Instrument Serif", data: serif, style: "normal" as const, weight: 400 as const },
    { name: "Instrument Serif", data: serifItalic, style: "italic" as const, weight: 400 as const },
    { name: "Inter", data: sans, style: "normal" as const, weight: 500 as const },
  ];
}

/** "DP" monogram inside a fine ring. `size` is the ring's diameter in px. */
export function Monogram({ size, color = BRAND.paper }: { size: number; color?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${Math.max(1, Math.round(size / 40))}px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        fontFamily: "Instrument Serif",
        fontSize: size * 0.5,
        lineHeight: 1,
        letterSpacing: -size * 0.02,
        paddingTop: size * 0.04,
      }}
    >
      <span>D</span>
      <span style={{ fontStyle: "italic", marginLeft: -size * 0.03 }}>P</span>
    </div>
  );
}
