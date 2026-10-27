import { ImageResponse } from "next/og";

import { BRAND, Monogram, brandFonts } from "@/lib/brand";
import { site } from "@/lib/config";

export const alt = `${site.artist}, tattooist in Lincoln`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card WhatsApp, iMessage and Instagram show when the link is shared. */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND.ink,
          color: BRAND.paper,
        }}
      >
        <Monogram size={150} />
        <div style={{ marginTop: 44, fontFamily: "Instrument Serif", fontSize: 104, lineHeight: 1 }}>
          {site.artist}
        </div>
        <div style={{ marginTop: 26, fontFamily: "Inter", fontSize: 24, letterSpacing: 9, color: BRAND.muted }}>
          TATTOOIST · LINCOLN
        </div>
        <div style={{ position: "absolute", bottom: 44, fontFamily: "Inter", fontSize: 20, letterSpacing: 2, color: BRAND.muted }}>
          penchevstatts.com
        </div>
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  );
}
