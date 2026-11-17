import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["passkit-generator", "sharp", "google-auth-library"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Service-Worker-Allowed", value: "/" }, { key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
