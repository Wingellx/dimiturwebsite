import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    // Portfolio images served from the public Supabase Storage bucket.
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
    formats: ["image/avif", "image/webp"],
  },

  experimental: {
    serverActions: {
      // Reference images are downscaled in the browser first (see
      // src/lib/image-resize.ts), so six of them land well under this. It sits
      // above Vercel's ~4.5MB request cap deliberately: self-hosted deploys
      // have no such cap, and the browser-side resize is what keeps Vercel
      // deploys inside theirs.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
