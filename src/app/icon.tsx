import { ImageResponse } from "next/og";

import { BRAND, Monogram, brandFonts } from "@/lib/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND.ink, borderRadius: 14 }}>
        <Monogram size={54} />
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  );
}
