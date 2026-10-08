import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.WARMAILER_BUILD_DIST_DIR ?? ".next",
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
