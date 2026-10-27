import { ImageResponse } from "next/og";

import { BRAND, Monogram, brandFonts } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND.ink }}>
        <Monogram size={132} />
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  );
}
