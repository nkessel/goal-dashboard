import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The offline helper (public/sw.js) is always fetched fresh, so a new version reaches phones at once.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
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
