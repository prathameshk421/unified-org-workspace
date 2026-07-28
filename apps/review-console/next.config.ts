import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@unified/ui", "@unified/types"],
};

export default nextConfig;
