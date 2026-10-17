import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Bottom-nav tabs are fully prefetched (see BottomNav); keep those
    // prefetches fresh for a minute so switching tabs is instant. Any server
    // action that changes data revalidates and clears this cache anyway.
    staleTimes: { static: 60 },
    // Screenshots attached to feedback travel through a server action.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
