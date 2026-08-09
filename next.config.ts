import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server actions are used for every mutation in the meeting runner.
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
