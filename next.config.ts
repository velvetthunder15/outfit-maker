import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 414, 640, 750, 828, 1080, 1200],
    imageSizes: [64, 128, 256, 384, 480],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
    // Client router cache: revisiting Style / Wardrobe / Saved within 30 s is instant (no server round trip);
    // prefetched tabs stay warm for 60 s.
    staleTimes: { dynamic: 30, static: 60 },
  },
};

export default nextConfig;
