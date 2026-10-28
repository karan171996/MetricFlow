import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optional dependencies loaded with a lazy import() only when a Lighthouse run starts: required at run time, never bundled.
  // The hosted build's SDKs (devDependencies, imported only from the private lib/hosted) stay out of the bundle too.
  serverExternalPackages: ["lighthouse", "chrome-launcher", "better-auth", "pg"],
};

export default nextConfig;
