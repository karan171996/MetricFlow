import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optional dependencies loaded with a lazy import() only when a Lighthouse run starts: required at run time, never bundled.
  serverExternalPackages: ["lighthouse", "chrome-launcher"],
};

export default nextConfig;
